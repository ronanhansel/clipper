import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  screen,
  shell,
  type NativeImage,
} from "electron";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const videoExportSessions = new Map<
  string,
  {
    process: ChildProcessWithoutNullStreams;
    outputPath: string;
    closePromise: Promise<string | null>;
  }
>();
const cancelledVideoRenders = new Set<string>();
const activeVideoRenderControllers = new Map<string, Set<() => void>>();
const textFileWatchers = new Map<number, FSWatcher[]>();
const appStatePath = "clipper/app-state.json";
const appIconPath = path.resolve(__dirname, "../build/icons/icon.png");
const frameWidth = 1920;
const frameHeight = 1080;
const exportRendererFrameTimeoutMs = 8000;
const exportMinimumCheckpointSegmentSeconds = 5;
const exportCaptureStripCount = 4;
const exportSlowFallbackTileHeights = [270, 135, 68, 34, 17] as const;
const exportCaptureTileRetries = 3;
const exportSlowFallbackTileValidationSamples = 2;
const exportCaptureTileTimeoutMs = 4000;
const exportSlowFallbackTilePadding = getIntegerEnv(
  "CLIPPER_EXPORT_SLOW_TILE_PADDING",
  128,
  0,
  frameHeight,
);
const exportSlowFallbackMaxDifferingPixelRatio = 0.0005;
const exportSlowFallbackMaxAverageByteDelta = 0.025;
const exportProcessStopTimeoutMs = 1200;
const forcedOomSegmentIndexes = parseForcedOomIndexes(
  process.env.CLIPPER_EXPORT_FORCE_OOM_SEGMENTS,
);
const forcedOomFrameIndexes = parseForcedOomIndexes(
  process.env.CLIPPER_EXPORT_FORCE_OOM_FRAME,
);
let hardwareEncoderSupport: Set<string> | null = null;
let systemFontFamilies: string[] | null = null;
let previewRasterizerWindow: BrowserWindow | null = null;
let previewRasterizerKey = "";

const exportChromiumArgs = [
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-partial-raster",
  "--force-device-scale-factor=1",
  "--num-raster-threads=4",
  "--js-flags=--max-old-space-size=4096",
] as const;

async function readAppState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(
      await fs.readFile(resolveClipperFile(appStatePath), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeAppState(updates: Record<string, unknown>) {
  const state = await readAppState();
  const merged = { ...state, ...updates };
  await fs.mkdir(path.dirname(resolveClipperFile(appStatePath)), {
    recursive: true,
  });
  await fs.writeFile(
    resolveClipperFile(appStatePath),
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
}

async function writeWindowBounds(window: BrowserWindow) {
  await writeAppState({
    windowBounds: window.getBounds() as unknown as Record<string, unknown>,
  });
}

type ProjectWatchPaths = {
  files: string[];
  directories: string[];
};

type MacFontProfile = {
  SPFontsDataType?: Array<{
    enabled?: string;
    valid?: string;
    typefaces?: Array<{
      enabled?: string;
      family?: string;
    }>;
  }>;
};

type ExportChildStopReason = "native-warning" | "cancel";
type ExportChildStopMessage = {
  type: "clipper:stop-render-child";
  reason: ExportChildStopReason;
};

function isExportChildStopMessage(
  message: unknown,
): message is ExportChildStopMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<ExportChildStopMessage>;
  return (
    candidate.type === "clipper:stop-render-child" &&
    (candidate.reason === "native-warning" || candidate.reason === "cancel")
  );
}

async function findFileByName(
  directoryPath: string,
  fileName: string,
): Promise<string | null> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const normalizedFileName = fileName.toLocaleLowerCase();
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isFile() && entry.name.toLocaleLowerCase() === normalizedFileName)
      return entryPath;
    if (entry.isDirectory()) {
      const matchedPath = await findFileByName(entryPath, fileName);
      if (matchedPath) return matchedPath;
    }
  }
  return null;
}

async function listSystemFontFamilies() {
  if (systemFontFamilies) return systemFontFamilies;
  if (process.platform !== "darwin") return [];

  const output = await readCommandOutput("/usr/sbin/system_profiler", [
    "SPFontsDataType",
    "-json",
  ]);

  try {
    const profile = JSON.parse(output) as MacFontProfile;
    const families = new Set<string>();
    for (const font of profile.SPFontsDataType ?? []) {
      if (font.enabled === "no" || font.valid === "no") continue;
      for (const typeface of font.typefaces ?? []) {
        if (typeface.enabled === "no") continue;
        const family = typeface.family?.trim();
        if (family) families.add(family);
      }
    }
    systemFontFamilies = [...families].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return systemFontFamilies;
  } catch {
    return [];
  }
}

function readCommandOutput(command: string, args: string[]) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let byteLength = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      if (byteLength <= 128 * 1024 * 1024) chunks.push(chunk);
    });
    child.once("error", () => resolve("{}"));
    child.once("close", (code) => {
      if (code !== 0 || byteLength > 128 * 1024 * 1024) resolve("{}");
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function getSupportedHardwareEncoders() {
  if (hardwareEncoderSupport) return hardwareEncoderSupport;

  hardwareEncoderSupport = new Set<string>();
  if (!ffmpegPath) return hardwareEncoderSupport;

  const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const encoder of [
    "h264_videotoolbox",
    "hevc_videotoolbox",
    "h264_nvenc",
    "h264_qsv",
    "h264_amf",
    "h264_vaapi",
  ]) {
    if (output.includes(encoder)) hardwareEncoderSupport.add(encoder);
  }

  return hardwareEncoderSupport;
}

function getVideoEncoderArgs() {
  const supportedEncoders = getSupportedHardwareEncoders();

  if (
    process.platform === "darwin" &&
    supportedEncoders.has("h264_videotoolbox")
  ) {
    return {
      label: "VideoToolbox",
      args: [
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        "12M",
        "-allow_sw",
        "0",
        "-pix_fmt",
        "yuv420p",
      ],
    };
  }

  return {
    label: "x264",
    args: [
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
    ],
  };
}

function resolveClipperFile(relativePath: string) {
  const appRoot = path.resolve(__dirname, "..");
  const resolved = path.resolve(appRoot, relativePath);
  const clipperRoot = path.join(appRoot, "clipper");

  if (
    resolved !== clipperRoot &&
    !resolved.startsWith(`${clipperRoot}${path.sep}`)
  ) {
    throw new Error(
      "Clipper file access is restricted to the clipper directory.",
    );
  }

  return resolved;
}

function getClipperRelativePath(filePath: string) {
  const appRoot = path.resolve(__dirname, "..");
  const clipperRoot = path.join(appRoot, "clipper");
  const resolved = path.resolve(filePath);

  if (
    resolved !== clipperRoot &&
    !resolved.startsWith(`${clipperRoot}${path.sep}`)
  ) {
    throw new Error("Project files must be inside the clipper directory.");
  }

  return path.relative(appRoot, resolved).split(path.sep).join("/");
}

ipcMain.handle(
  "clipper:read-text-file",
  async (_event, relativePath: string) => {
    return fs.readFile(resolveClipperFile(relativePath), "utf8");
  },
);

ipcMain.handle(
  "clipper:read-binary-file",
  async (_event, relativePath: string) => {
    return (await fs.readFile(resolveClipperFile(relativePath))).toString(
      "base64",
    );
  },
);

ipcMain.handle(
  "clipper:write-text-file",
  async (_event, relativePath: string, content: string) => {
    const filePath = resolveClipperFile(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  },
);

ipcMain.handle(
  "clipper:write-binary-file",
  async (_event, relativePath: string, base64Content: string) => {
    const filePath = resolveClipperFile(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(base64Content, "base64"));
  },
);

ipcMain.handle(
  "clipper:create-directory",
  async (_event, relativePath: string) => {
    await fs.mkdir(resolveClipperFile(relativePath), { recursive: true });
  },
);

ipcMain.handle("clipper:reveal-file", async (_event, relativePath: string) => {
  shell.showItemInFolder(resolveClipperFile(relativePath));
});

ipcMain.handle(
  "clipper:reveal-absolute-path",
  async (_event, filePath: string) => {
    shell.showItemInFolder(path.resolve(filePath));
  },
);

ipcMain.handle("clipper:trash-file", async (_event, relativePath: string) => {
  const filePath = resolveClipperFile(relativePath);
  try {
    await fs.access(filePath);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return;
    throw error;
  }
  await shell.trashItem(filePath);
});

ipcMain.handle(
  "clipper:rename-file",
  async (_event, relativePath: string, nextRelativePath: string) => {
    await fs.rename(
      resolveClipperFile(relativePath),
      resolveClipperFile(nextRelativePath),
    );
  },
);

ipcMain.handle(
  "clipper:copy-file",
  async (_event, relativePath: string, nextRelativePath: string) => {
    const source = resolveClipperFile(relativePath);
    const target = resolveClipperFile(nextRelativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  },
);

ipcMain.handle(
  "clipper:list-directory",
  async (_event, relativePath: string) => {
    try {
      const entries = await fs.readdir(resolveClipperFile(relativePath), {
        withFileTypes: true,
      });
      return entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
        }));
    } catch {
      return [];
    }
  },
);

ipcMain.handle(
  "clipper:find-project-file-by-name",
  async (_event, directoryPath: string, fileName: string) => {
    const matchedPath = await findFileByName(
      resolveClipperFile(directoryPath),
      fileName,
    );
    return matchedPath ? getClipperRelativePath(matchedPath) : null;
  },
);

ipcMain.handle(
  "clipper:open-composition-file",
  async (_event, directoryPath: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Select composition file",
      defaultPath: resolveClipperFile(directoryPath),
      properties: ["openFile"],
      filters: [
        { name: "Composition Source", extensions: ["ts", "tsx", "js", "jsx"] },
      ],
    });

    if (canceled || !filePaths[0]) return null;
    return getClipperRelativePath(filePaths[0]);
  },
);

ipcMain.handle("clipper:list-system-fonts", async () => {
  return listSystemFontFamilies();
});

ipcMain.handle(
  "clipper:set-window-fullscreen",
  (event, fullscreen: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(fullscreen);
    return window.isFullScreen();
  },
);

ipcMain.handle("clipper:toggle-window-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});

ipcMain.handle("clipper:watch-text-files", (event, relativePaths: string[]) => {
  const senderId = event.sender.id;
  textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

  const watchedPaths = [...new Set(relativePaths)].filter((relativePath) =>
    relativePath.startsWith("clipper/"),
  );
  const watchers = watchedPaths.flatMap((relativePath) => {
    try {
      const resolvedPath = resolveClipperFile(relativePath);
      const watcher = watch(resolvedPath, { persistent: false }, () => {
        if (!event.sender.isDestroyed())
          event.sender.send("clipper:text-file-changed", relativePath);
      });
      return [watcher];
    } catch {
      return [];
    }
  });

  textFileWatchers.set(senderId, watchers);
  event.sender.once("destroyed", () => {
    textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());
    textFileWatchers.delete(senderId);
  });
});

ipcMain.handle(
  "clipper:watch-project-files",
  (event, watchPaths: ProjectWatchPaths) => {
    const senderId = event.sender.id;
    textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

    const watchedFiles = [...new Set(watchPaths.files)].filter((relativePath) =>
      relativePath.startsWith("clipper/"),
    );
    const watchedDirectories = [...new Set(watchPaths.directories)].filter(
      (relativePath) => relativePath.startsWith("clipper/"),
    );
    const fileWatchers = watchedFiles.flatMap((relativePath) => {
      try {
        const resolvedPath = resolveClipperFile(relativePath);
        const watcher = watch(resolvedPath, { persistent: false }, () => {
          if (!event.sender.isDestroyed())
            event.sender.send("clipper:project-file-changed", relativePath);
        });
        return [watcher];
      } catch {
        return [];
      }
    });
    const directoryWatchers = watchedDirectories.flatMap((relativePath) => {
      try {
        const resolvedPath = resolveClipperFile(relativePath);
        const watcher = watch(
          resolvedPath,
          { persistent: false, recursive: true },
          (_eventType, fileName) => {
            try {
              const changedPath = fileName
                ? getClipperRelativePath(
                    path.join(resolvedPath, fileName.toString()),
                  )
                : relativePath;
              if (!event.sender.isDestroyed())
                event.sender.send("clipper:project-file-changed", changedPath);
            } catch {
              if (!event.sender.isDestroyed())
                event.sender.send("clipper:project-file-changed", relativePath);
            }
          },
        );
        return [watcher];
      } catch {
        return [];
      }
    });

    textFileWatchers.set(senderId, [...fileWatchers, ...directoryWatchers]);
    event.sender.once("destroyed", () => {
      textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());
      textFileWatchers.delete(senderId);
    });
  },
);

ipcMain.handle("clipper:open-project-manifest", async () => {
  const appRoot = path.resolve(__dirname, "..");
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open Clipper project",
    defaultPath: path.join(appRoot, "clipper", "projects"),
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Clipper Project", extensions: ["clipper"] }],
  });

  if (canceled || !filePaths[0]) return null;
  const selectedPath = filePaths[0];
  const stat = await fs.stat(selectedPath);
  if (stat.isDirectory()) {
    const manifestPath = path.join(selectedPath, "project.json");
    try {
      await fs.access(manifestPath);
      return getClipperRelativePath(manifestPath);
    } catch {
      return null;
    }
  }
  return getClipperRelativePath(selectedPath);
});

function validateProjectFolderName(name: string): string | null {
  if (!name) return "Project name cannot be empty.";
  if (/^\s|\s$/.test(name)) return "Name cannot start or end with whitespace.";
  if (name === "." || name === "..") return "Invalid project name.";
  if (/[\x00-\x1F]/.test(name))
    return "Name cannot contain control characters.";
  if (/[<>:"\/\\|?*]/.test(name))
    return 'Name cannot contain < > : " / \\ | ? *';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(name))
    return `"${name}" is a reserved system name.`;
  if (name.endsWith(".")) return "Name cannot end with a dot.";
  return null;
}

ipcMain.handle(
  "clipper:create-project",
  async (_event, projectName: string) => {
    const appRoot = path.resolve(__dirname, "..");
    const projectsDir = path.join(appRoot, "clipper", "projects");
    await fs.mkdir(projectsDir, { recursive: true });

    const error = validateProjectFolderName(projectName);
    if (error) throw new Error(error);

    const folderName = projectName;
    const folderPath = path.join(projectsDir, folderName);

    try {
      await fs.mkdir(folderPath);
    } catch (error) {
      if ((error as { code?: string }).code === "EEXIST") {
        throw new Error(`A project named "${folderName}" already exists.`);
      }
      throw error;
    }

    const manifestPath = path.join(folderPath, "project.json");
    return getClipperRelativePath(manifestPath);
  },
);

ipcMain.handle(
  "clipper:export-project-dialog",
  async (_event, defaultFileName: string) => {
    const appRoot = path.resolve(__dirname, "..");
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export as .clipper",
      defaultPath: path.join(appRoot, "clipper", "projects", defaultFileName),
      filters: [{ name: "Clipper Project", extensions: ["clipper"] }],
    });

    if (canceled || !filePath) return null;
    return getClipperRelativePath(filePath);
  },
);

ipcMain.handle(
  "clipper:export-media-file",
  async (_event, defaultFileName: string, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export media",
      defaultPath: defaultFileName,
      filters: [{ name: "Clipper Media Package", extensions: ["json"] }],
    });

    if (canceled || !filePath) return null;

    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  },
);

ipcMain.handle(
  "clipper:export-binary-file",
  async (_event, defaultFileName: string, base64Content: string) => {
    const extension = path.extname(defaultFileName).replace(/^\./, "") || "bin";
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export media",
      defaultPath: defaultFileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });

    if (canceled || !filePath) return null;

    await fs.writeFile(filePath, Buffer.from(base64Content, "base64"));
    return filePath;
  },
);

ipcMain.handle(
  "clipper:start-video-export",
  async (
    _event,
    defaultFileName: string,
    frameRate: number,
    width: number,
    height: number,
  ) => {
    if (!ffmpegPath)
      throw new Error("The bundled ffmpeg binary is unavailable.");

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export video",
      defaultPath: defaultFileName,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });

    if (canceled || !filePath) return null;

    const sessionId = randomUUID();
    const ffmpeg = spawn(ffmpegPath, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${width}x${height}`,
      "-r",
      String(frameRate),
      "-i",
      "-",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      filePath,
    ]);
    ffmpeg.stdin.setMaxListeners(0);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    const closePromise = new Promise<string | null>((resolve) => {
      ffmpeg.once("error", (error) => resolve(error.message));
      ffmpeg.once("close", (code) => {
        videoExportSessions.delete(sessionId);
        if (code === 0) resolve(null);
        else
          resolve(
            stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`,
          );
      });
    });

    videoExportSessions.set(sessionId, {
      process: ffmpeg,
      outputPath: filePath,
      closePromise,
    });
    return { sessionId, filePath };
  },
);

ipcMain.handle(
  "clipper:write-video-frame",
  async (_event, sessionId: string, frameData: Uint8Array) => {
    const session = videoExportSessions.get(sessionId);
    if (!session) throw new Error("Video export session is not active.");

    const frame = Buffer.from(frameData);
    if (session.process.stdin.write(frame)) return;

    await new Promise<void>((resolve, reject) => {
      session.process.stdin.once("drain", resolve);
      session.process.stdin.once("error", reject);
    });
  },
);

ipcMain.handle(
  "clipper:finish-video-export",
  async (_event, sessionId: string) => {
    const session = videoExportSessions.get(sessionId);
    if (!session) throw new Error("Video export session is not active.");

    session.process.stdin.end();
    const error = await session.closePromise;
    if (error) throw new Error(error);
    return session.outputPath;
  },
);

ipcMain.handle(
  "clipper:cancel-video-export",
  async (_event, sessionId: string) => {
    const session = videoExportSessions.get(sessionId);
    if (!session) return;

    videoExportSessions.delete(sessionId);
    session.process.kill("SIGTERM");
  },
);

ipcMain.handle(
  "clipper:render-video-export",
  async (
    event,
    exportId: string,
    defaultFileName: string,
    project: ProjectManifest,
    scene: Scene,
    frameRate: number,
    durationSeconds: number,
  ) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export video",
      defaultPath: defaultFileName,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });

    if (canceled || !filePath) return null;
    cancelledVideoRenders.delete(exportId);
    await renderSceneToVideoSupervised(
      project,
      scene,
      filePath,
      frameRate,
      durationSeconds,
      {
        source: "app-supervised",
        exportId,
        onProgress: (progress) =>
          event.sender.send(
            "clipper:video-export-progress",
            exportId,
            progress,
          ),
      },
    );
    cancelledVideoRenders.delete(exportId);
    shell.showItemInFolder(filePath);
    return filePath;
  },
);

ipcMain.handle(
  "clipper:rasterize-preview-frame",
  async (
    _event,
    project: ProjectManifest,
    scene: Scene,
    sceneTime: number,
    frameRate: number,
  ) => {
    return withTimeout(
      rasterizePreviewFrame(project, scene, sceneTime, frameRate),
      12000,
      `Timed out rasterizing preview frame at ${sceneTime.toFixed(3)}s in the main process.`,
    );
  },
);

ipcMain.handle(
  "clipper:cancel-render-video-export",
  async (_event, exportId: string) => {
    cancelledVideoRenders.add(exportId);
    for (const cancel of activeVideoRenderControllers.get(exportId) ?? [])
      cancel();
  },
);

async function rasterizePreviewFrame(
  project: ProjectManifest,
  scene: Scene,
  sceneTime: number,
  frameRate: number,
): Promise<RasterizedPreviewFrame> {
  const logPrefix = `[clipper raster-preview] scene=${scene.id} time=${sceneTime.toFixed(3)}`;
  const rendererWindow = await getPreviewRasterizerWindow(
    getPreviewRasterizerKey(project, scene),
    logPrefix,
  );

  try {
    console.log(`${logPrefix} render-frame`);
    const syncResult = await renderExportFrame(
      rendererWindow,
      project,
      scene,
      sceneTime,
      frameRate,
    );
    if (syncResult.failedCount > 0) {
      throw new Error(
        `Preview rasterizer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`,
      );
    }
    console.log(`${logPrefix} capture`);
    await applyDefaultExportCaptureViewport(rendererWindow);
    const frame = await captureStablePreviewFrame(rendererWindow, sceneTime);
    console.log(`${logPrefix} encode`);
    return {
      width: frameWidth,
      height: frameHeight,
      pixelFormat: "bgra",
      sceneTime,
      frameRate,
      data: frame.toString("base64"),
    };
  } catch (error) {
    destroyPreviewRasterizerWindow();
    throw error;
  }
}

async function getPreviewRasterizerWindow(key: string, logPrefix: string) {
  const current = previewRasterizerWindow;
  if (current && !current.isDestroyed() && previewRasterizerKey === key)
    return current;

  destroyPreviewRasterizerWindow();
  console.log(`${logPrefix} create-window`);
  const rendererWindow = new BrowserWindow({
    width: frameWidth,
    height: frameHeight,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1,
    },
  });
  rendererWindow.webContents.setZoomFactor(1);
  rendererWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  console.log(`${logPrefix} load-export-window`);
  await loadRenderedMediaExportWindow(rendererWindow);
  previewRasterizerWindow = rendererWindow;
  previewRasterizerKey = key;
  rendererWindow.once("closed", () => {
    if (previewRasterizerWindow === rendererWindow) {
      previewRasterizerWindow = null;
      previewRasterizerKey = "";
    }
  });
  return rendererWindow;
}

function destroyPreviewRasterizerWindow() {
  const current = previewRasterizerWindow;
  previewRasterizerWindow = null;
  previewRasterizerKey = "";
  if (current && !current.isDestroyed()) current.destroy();
}

function getPreviewRasterizerKey(project: ProjectManifest, scene: Scene) {
  return JSON.stringify({
    projectId: project.id,
    scene,
  });
}

async function captureStablePreviewFrame(
  window: BrowserWindow,
  sceneTime: number,
) {
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  const oomWarningState = createExportOomWarningState();
  oomWarningState.activePath = "slow-fallback";
  const tileHeight = exportSlowFallbackTileHeights[1];
  for (const tile of getSlowFallbackExportCaptureTiles(tileHeight)) {
    const tileBitmap = await captureStableSlowFallbackTile(
      window,
      tile,
      0,
      sceneTime,
      oomWarningState,
      0,
      true,
    );
    stitchBgraTile(frame, tileBitmap, tile);
  }
  return frame;
}

async function renderSceneToVideoSupervised(
  project: ProjectManifest,
  scene: Scene,
  outputPath: string,
  frameRate: number,
  durationSeconds: number,
  options: RenderSceneToVideoOptions = {},
) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");

  const { exportId, onProgress, source = "app-supervised" } = options;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const encoder = getVideoEncoderArgs();
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  const segments = getExportFrameSegments(
    scene,
    totalFrames,
    frameRate,
    durationSeconds,
  );
  const tempDir = path.join(
    path.dirname(outputPath),
    `.clipper-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
  onProgress?.({
    frame: 0,
    totalFrames,
    percent: 0,
    status: `Preparing ${encoder.label} export...`,
  });
  console.log(
    `[clipper export] source=${source} segment-min-seconds=${exportMinimumCheckpointSegmentSeconds} total-frames=${totalFrames} checkpoints=${segments.map((segment) => segment.endTime.toFixed(3)).join(",")}`,
  );

  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "bgra",
    "-s",
    `${frameWidth}x${frameHeight}`,
    "-framerate",
    String(frameRate),
    "-i",
    "-",
    "-an",
    ...encoder.args,
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  ffmpeg.stdin.setMaxListeners(0);

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });
  const closePromise = new Promise<string | null>((resolve) => {
    ffmpeg.once("error", (error) => resolve(error.message));
    ffmpeg.once("close", (code) => {
      if (code === 0) resolve(null);
      else
        resolve(
          stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`,
        );
    });
  });

  let pendingFrameWrite: Promise<void> | null = null;
  let activeMethod: VideoExportMethod = "fast-child";
  let lastReportedFrame = 0;
  const unregisterFfmpegCancel = registerActiveVideoRenderCancel(
    exportId,
    () => {
      if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
    },
  );
  const reportStatus = (
    status: string,
    method: VideoExportMethod = activeMethod,
  ) => {
    activeMethod = method;
    onProgress?.({
      frame: lastReportedFrame,
      totalFrames,
      percent: Math.round((lastReportedFrame / totalFrames) * 100),
      status,
      method,
    });
  };
  const reportFrameProgress = (
    frameIndex: number,
    method: VideoExportMethod = activeMethod,
  ) => {
    activeMethod = method;
    lastReportedFrame = Math.max(lastReportedFrame, frameIndex + 1);
    onProgress?.({
      frame: lastReportedFrame,
      totalFrames,
      percent: Math.round((lastReportedFrame / totalFrames) * 100),
      status: `${formatVideoExportMethod(method)} frame ${frameIndex + 1} of ${totalFrames}`,
      method,
    });
  };
  try {
    for (const segment of segments) {
      if (exportId && cancelledVideoRenders.has(exportId))
        throw new Error("Video export cancelled.");
      console.log(
        `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} seconds=${segment.startTime.toFixed(3)}-${segment.endTime.toFixed(3)} path=fast begin`,
      );
      reportStatus(
        `Fast render: segment ${segment.index + 1}/${segments.length}`,
        "fast-child",
      );
      const fastResult = await renderSupervisedSegmentChild(
        project,
        scene,
        tempDir,
        frameRate,
        durationSeconds,
        segment,
        "fast/default",
        source,
        reportFrameProgress,
        exportId,
      );
      const forcedOom =
        forcedOomSegmentIndexes.has(segment.index) ||
        [...forcedOomFrameIndexes].some(
          (frameIndex) =>
            frameIndex >= segment.startFrame && frameIndex < segment.endFrame,
        );
      const segmentOverflowDetected =
        forcedOom || fastResult.nativeWarningDetected;
      if (fastResult.nativeWarningDetected)
        console.warn(
          `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} parent-native-warning=yes native-warnings=${fastResult.nativeWarningCount}`,
        );
      if (forcedOom)
        console.warn(
          `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} parent-native-warning=forced`,
        );

      const shouldRerenderSlow = segmentOverflowDetected;
      if (shouldRerenderSlow) {
        console.warn(
          `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=fast oom=yes action=rerender-slow native-warnings=${fastResult.nativeWarningCount + (forcedOom ? 1 : 0)}`,
        );
        reportStatus(
          `Safe fallback: segment ${segment.index + 1}/${segments.length}`,
          "slow-fallback",
        );
      } else {
        const fastOutputComplete = await isSupervisedSegmentOutputComplete(
          fastResult.outputPath,
          segment,
        );
        if (!fastOutputComplete)
          throw new Error(
            `Supervised fast segment ${segment.index} did not produce a complete raw frame range. This is not an OOM fallback signal.`,
          );
      }

      const acceptedResult = shouldRerenderSlow
        ? await rerenderSupervisedSegmentSlow(
            project,
            scene,
            tempDir,
            frameRate,
            durationSeconds,
            segment,
            source,
            reportFrameProgress,
            exportId,
          )
        : fastResult;
      if (shouldRerenderSlow) {
        if (acceptedResult.outputPath !== fastResult.outputPath)
          await fs
            .rm(fastResult.outputPath, { force: true })
            .catch(() => undefined);
      } else {
        console.log(
          `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=fast oom=no write=fast native-warnings=0`,
        );
      }

      const frameCount = await countContiguousSupervisedSegmentFrames(
        acceptedResult.outputPath,
        segment,
      );
      if (frameCount !== segment.endFrame - segment.startFrame)
        throw new Error(
          `Supervised export segment ${segment.index} produced ${frameCount} frames; expected ${segment.endFrame - segment.startFrame}.`,
        );
      for (
        let frameIndex = segment.startFrame;
        frameIndex < segment.endFrame;
        frameIndex += 1
      ) {
        const frameBuffer = await fs.readFile(
          getSupervisedFrameOutputPath(acceptedResult.outputPath, frameIndex),
        );
        if (pendingFrameWrite) await pendingFrameWrite;
        pendingFrameWrite = writeProcessInput(ffmpeg, frameBuffer, exportId);
        reportFrameProgress(
          frameIndex,
          shouldRerenderSlow ? "slow-fallback" : activeMethod,
        );
      }
      await removeSupervisedSegmentOutputs(
        acceptedResult.outputPath,
        segment,
      ).catch(() => undefined);
    }

    if (pendingFrameWrite) await pendingFrameWrite;
    if (exportId && cancelledVideoRenders.has(exportId))
      throw new Error("Video export cancelled.");
    ffmpeg.stdin.end();
    const error = await closePromise;
    if (exportId && cancelledVideoRenders.has(exportId))
      throw new Error("Video export cancelled.");
    if (error) throw new Error(error);
    onProgress?.({
      frame: totalFrames,
      totalFrames,
      percent: 100,
      status: "Finalizing video...",
      method: activeMethod,
    });
  } catch (error) {
    if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
    if (exportId) cancelledVideoRenders.delete(exportId);
    await waitForProcessClose(
      closePromise,
      () => ffmpeg.kill("SIGKILL"),
      exportProcessStopTimeoutMs,
    );
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    unregisterFfmpegCancel();
    await fs
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

function formatVideoExportMethod(method: VideoExportMethod) {
  if (method === "slow-fallback") return "Slow fallback";
  return "Fast supervised";
}

function registerActiveVideoRenderCancel(
  exportId: string | undefined,
  cancel: () => void,
) {
  if (!exportId) return () => {};
  let controllers = activeVideoRenderControllers.get(exportId);
  if (!controllers) {
    controllers = new Set();
    activeVideoRenderControllers.set(exportId, controllers);
  }
  controllers.add(cancel);
  return () => {
    controllers!.delete(cancel);
    if (controllers!.size === 0) activeVideoRenderControllers.delete(exportId);
  };
}

function throwIfVideoRenderCancelled(exportId: string | undefined) {
  if (exportId && cancelledVideoRenders.has(exportId))
    throw new Error("Video export cancelled.");
}

async function waitForProcessClose<T>(
  closePromise: Promise<T>,
  forceStop: () => void,
  timeoutMs: number,
) {
  let timeout: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      closePromise.catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          forceStop();
          resolve();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function isSupervisedSegmentOutputComplete(
  outputPath: string,
  segment: ExportFrameSegment,
) {
  const expectedBytes = getSupervisedSegmentByteLength(segment);
  try {
    const stat = await fs.stat(outputPath);
    if (stat.size !== expectedBytes) return false;
  } catch {
    return (
      (await countContiguousSupervisedSegmentFrames(outputPath, segment)) ===
      segment.endFrame - segment.startFrame
    );
  }
  return true;
}

function getSupervisedSegmentByteLength(segment: ExportFrameSegment) {
  return (segment.endFrame - segment.startFrame) * frameWidth * frameHeight * 4;
}

async function rerenderSupervisedSegmentSlow(
  project: ProjectManifest,
  scene: Scene,
  tempDir: string,
  frameRate: number,
  durationSeconds: number,
  segment: ExportFrameSegment,
  source: ExportSource,
  onFrameCaptured?: (frameIndex: number, method?: VideoExportMethod) => void,
  exportId?: string,
) {
  console.log(
    `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=fast oom=yes action=rerender-slow`,
  );
  const slowResult = await renderSupervisedSegmentChild(
    project,
    scene,
    tempDir,
    frameRate,
    durationSeconds,
    segment,
    "slow-fallback",
    source,
    onFrameCaptured,
    exportId,
  );
  if (slowResult.nativeWarningDetected)
    console.warn(
      `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} parent-native-warning=yes path=slow-fallback native-warnings=${slowResult.nativeWarningCount}`,
    );
  console.log(
    `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=slow-fallback result=written`,
  );
  return slowResult;
}

async function renderSupervisedSegmentChild(
  project: ProjectManifest,
  scene: Scene,
  tempDir: string,
  frameRate: number,
  durationSeconds: number,
  segment: ExportFrameSegment,
  pathMode: ExportPathMode,
  source: ExportSource,
  onFrameCaptured?: (frameIndex: number, method?: VideoExportMethod) => void,
  exportId?: string,
): Promise<SupervisedSegmentResult> {
  const outputPath = getSupervisedSegmentOutputPath(tempDir, segment, pathMode);
  const payloadPath = path.join(
    tempDir,
    `segment-${segment.index}-${pathMode === "slow-fallback" ? "slow" : "fast"}.json`,
  );
  const nativeLogPath = path.join(
    tempDir,
    `segment-${segment.index}-${pathMode === "slow-fallback" ? "slow" : "fast"}.native.log`,
  );
  const payload: SupervisedSegmentPayload = {
    project,
    scene,
    frameRate,
    durationSeconds,
    segment,
    outputPath,
    pathMode,
  };
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");
  const child = spawn(
    process.execPath,
    getElectronChildArgs(
      ["--render-video-child-segment", payloadPath],
      [
        ...exportChromiumArgs,
        "--enable-logging=file",
        `--log-file=${nativeLogPath}`,
      ],
    ),
    {
      env: {
        ...process.env,
        CLIPPER_EXPORT_FORCE_OOM_SEGMENTS: "",
        CLIPPER_EXPORT_FORCE_OOM_FRAME: "",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  if (!child.stdout || !child.stderr)
    throw new Error("Supervised export child did not expose output streams.");
  let childStopForceTimer: NodeJS.Timeout | null = null;
  let childStopReason: ExportChildStopReason | null = null;
  let childStopMessageSent = false;
  const forceStopChild = () => {
    if (child.exitCode === null) child.kill("SIGKILL");
  };
  const requestChildStop = (
    reason: ExportChildStopReason,
    forceAfterTimeout = false,
  ) => {
    if (child.exitCode !== null) return;
    if (reason === "cancel" || !childStopReason) childStopReason = reason;
    if (child.connected && !childStopMessageSent) {
      childStopMessageSent = true;
      child.send(
        {
          type: "clipper:stop-render-child",
          reason,
        } satisfies ExportChildStopMessage,
        () => undefined,
      );
    } else if (!child.connected) child.kill("SIGTERM");
    if (forceAfterTimeout && !childStopForceTimer)
      childStopForceTimer = setTimeout(
        forceStopChild,
        exportProcessStopTimeoutMs,
      );
  };
  let cancelledWhileWaiting = false;
  const stopChild = () => {
    cancelledWhileWaiting = true;
    requestChildStop("cancel", true);
  };
  const unregisterCancel = registerActiveVideoRenderCancel(exportId, stopChild);

  let stdout = "";
  let stderr = "";
  let stdoutWarningTail = "";
  let stderrWarningTail = "";
  let nativeWarningDetected = false;
  let nativeWarningCount = 0;
  let childAbortRequested = false;
  const abortFastChildForNativeWarning = () => {
    if (pathMode !== "fast/default" || childAbortRequested || child.killed)
      return;
    childAbortRequested = true;
    console.warn(
      `[clipper export] source=${source} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=${pathMode} action=abort-fast-child reason=native-warning`,
    );
    requestChildStop("native-warning", true);
  };
  const inspectChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
    const text = chunk.toString("utf8");
    if (stream === "stdout") stdout += text;
    else stderr += text;
    if (stdout.length > 16000) stdout = stdout.slice(-16000);
    if (stderr.length > 16000) stderr = stderr.slice(-16000);
    for (const frameIndex of getExportFrameProgressIndexes(text))
      onFrameCaptured?.(
        frameIndex,
        pathMode === "slow-fallback" ? "slow-fallback" : "fast-child",
      );
    const combined = `${stream === "stdout" ? stdoutWarningTail : stderrWarningTail}${text}`;
    if (stream === "stdout") stdoutWarningTail = combined.slice(-512);
    else stderrWarningTail = combined.slice(-512);
    if (isExportOutOfMemoryWarning(combined)) {
      nativeWarningDetected = true;
      nativeWarningCount += 1;
      if (pathMode === "fast/default" || nativeWarningCount <= 3) {
        console.warn(
          `[clipper export] source=${source} parent-native-warning stream=${stream} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=${pathMode}: ${combined.trim().slice(-600)}`,
        );
      } else if (nativeWarningCount === 4) {
        console.warn(
          `[clipper export] source=${source} segment=${segment.index} path=${pathMode} suppressing repeated native tile-memory warnings.`,
        );
      }
      abortFastChildForNativeWarning();
      if (stream === "stdout") stdoutWarningTail = "";
      else stderrWarningTail = "";
    }
  };
  const inspectNativeWarningText = (
    text: string,
    stream: "stdout" | "stderr",
  ) => {
    if (!isExportOutOfMemoryWarning(text)) return;
    nativeWarningDetected = true;
    nativeWarningCount += 1;
    if (pathMode === "fast/default" || nativeWarningCount <= 3) {
      console.warn(
        `[clipper export] source=${source} parent-native-warning stream=${stream} segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} path=${pathMode}: ${text.trim().slice(-600)}`,
      );
    } else if (nativeWarningCount === 4) {
      console.warn(
        `[clipper export] source=${source} segment=${segment.index} path=${pathMode} suppressing repeated native tile-memory warnings.`,
      );
    }
    abortFastChildForNativeWarning();
  };
  child.stdout.on("data", (chunk: Buffer) => inspectChunk(chunk, "stdout"));
  child.stderr.on("data", (chunk: Buffer) => inspectChunk(chunk, "stderr"));
  const nativeLogPoll =
    pathMode === "fast/default"
      ? setInterval(() => {
          fs.readFile(nativeLogPath, "utf8")
            .then((log) => {
              if (log) inspectChunk(Buffer.from(log.slice(-32000)), "stderr");
            })
            .catch(() => undefined);
        }, 100)
      : null;

  let exitCode: number | null = null;
  let childError: unknown = null;
  let cancelCheck: NodeJS.Timeout | null = null;
  try {
    const childClosePromise = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    cancelCheck = setInterval(() => {
      if (!exportId || !cancelledVideoRenders.has(exportId)) return;
      stopChild();
      if (cancelCheck) clearInterval(cancelCheck);
      cancelCheck = null;
    }, 50);
    exitCode = await childClosePromise;
  } catch (error) {
    childError = error;
  } finally {
    unregisterCancel();
    if (cancelCheck) clearInterval(cancelCheck);
    if (nativeLogPoll) clearInterval(nativeLogPoll);
    if (childStopForceTimer) clearTimeout(childStopForceTimer);
  }
  const nativeLog = await readExportNativeLog(nativeLogPath);
  if (nativeLog) inspectNativeWarningText(nativeLog, "stderr");
  await fs.rm(payloadPath, { force: true }).catch(() => undefined);
  await fs.rm(nativeLogPath, { force: true }).catch(() => undefined);
  if (childError) throw childError;
  if (cancelledWhileWaiting || childStopReason === "cancel")
    throw new Error("Video export cancelled.");
  throwIfVideoRenderCancelled(exportId);
  if (nativeWarningDetected && pathMode === "fast/default")
    return { outputPath, nativeWarningDetected, nativeWarningCount };
  const frameCount = await countContiguousSupervisedSegmentFrames(
    outputPath,
    segment,
  );
  if (frameCount === segment.endFrame - segment.startFrame)
    return { outputPath, nativeWarningDetected, nativeWarningCount };
  if (exitCode !== 0)
    throw new Error(
      `Supervised export child failed for segment ${segment.index} (${pathMode}) with code ${exitCode ?? "unknown"} after ${frameCount}/${segment.endFrame - segment.startFrame} frame(s): ${summarizeChildRenderOutput(stderr || stdout)}`,
    );
  const detail = summarizeChildRenderOutput(stderr || stdout || nativeLog);
  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat)
    throw new Error(
      `Supervised export child produced ${frameCount}/${segment.endFrame - segment.startFrame} frame file(s) for segment ${segment.index} (${pathMode}).${detail ? ` Child output: ${detail}` : ""}`,
    );
  const expectedBytes = getSupervisedSegmentByteLength(segment);
  if (stat.size !== expectedBytes)
    throw new Error(
      `Supervised export child created ${stat.size} bytes for segment ${segment.index} (${pathMode}); expected ${expectedBytes}.`,
    );
  return { outputPath, nativeWarningDetected, nativeWarningCount };
}

async function readExportNativeLog(logPath: string) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  try {
    const log = await fs.readFile(logPath, "utf8");
    return log.length > 32000 ? log.slice(-32000) : log;
  } catch {
    return "";
  }
}

function summarizeChildRenderOutput(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nonWarningLines = lines.filter(
    (line) =>
      !isExportOutOfMemoryWarning(line) && !isNoisyChildRenderLogLine(line),
  );
  const warningCount = lines.length - nonWarningLines.length;
  const summaryLines = nonWarningLines.slice(-8);
  if (warningCount > 0)
    summaryLines.unshift(
      `${warningCount} native tile-memory warning(s) omitted.`,
    );
  return summaryLines.join("\n").slice(-4000).trim();
}

function isNoisyChildRenderLogLine(line: string) {
  return /Download the React DevTools|Electron Security Warning|Insecure Content-Security-Policy|node_modules\/\.vite\/deps\/react-dom/i.test(
    line,
  );
}

function getExportFrameProgressIndexes(message: string) {
  const frameIndexes: number[] = [];
  const pattern = /\[clipper export-frame\] frame=(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message))) {
    const frameIndex = Number.parseInt(match[1], 10) - 1;
    if (Number.isFinite(frameIndex) && frameIndex >= 0)
      frameIndexes.push(frameIndex);
  }
  return frameIndexes;
}

function getSupervisedSegmentOutputPath(
  tempDir: string,
  segment: ExportFrameSegment,
  pathMode: ExportPathMode,
) {
  return path.join(
    tempDir,
    `segment-${segment.index}-${pathMode === "slow-fallback" ? "slow" : "fast"}.bgra`,
  );
}

function getSupervisedFrameOutputPath(
  segmentOutputPath: string,
  frameIndex: number,
) {
  return `${segmentOutputPath}.frame-${frameIndex}.bgra`;
}

async function countContiguousSupervisedSegmentFrames(
  segmentOutputPath: string,
  segment: ExportFrameSegment,
) {
  let count = 0;
  for (
    let frameIndex = segment.startFrame;
    frameIndex < segment.endFrame;
    frameIndex += 1
  ) {
    const stat = await fs
      .stat(getSupervisedFrameOutputPath(segmentOutputPath, frameIndex))
      .catch(() => null);
    if (!stat || stat.size !== frameWidth * frameHeight * 4) break;
    count += 1;
  }
  return count;
}

async function removeSupervisedSegmentOutputs(
  segmentOutputPath: string,
  segment: ExportFrameSegment,
) {
  await fs.rm(segmentOutputPath, { force: true }).catch(() => undefined);
  for (
    let frameIndex = segment.startFrame;
    frameIndex < segment.endFrame;
    frameIndex += 1
  ) {
    await fs
      .rm(getSupervisedFrameOutputPath(segmentOutputPath, frameIndex), {
        force: true,
      })
      .catch(() => undefined);
  }
}

function getElectronChildArgs(args: string[], electronArgs: string[] = []) {
  if (app.isPackaged) return [...electronArgs, ...args];
  return [...electronArgs, path.resolve(__dirname, ".."), ...args];
}

async function renderSceneSegmentToRawFrames(
  payload: SupervisedSegmentPayload,
  onFrameCaptured?: (frameIndex: number) => void,
  shouldStop?: () => boolean,
) {
  const rendererWindow = new BrowserWindow({
    width: frameWidth,
    height: frameHeight,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1,
    },
  });

  const oomWarningState = createExportOomWarningState();
  try {
    rendererWindow.webContents.setZoomFactor(1);
    rendererWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    await loadRenderedMediaExportWindow(rendererWindow);
    oomWarningState.activeSegment = payload.segment;
    oomWarningState.activePath = payload.pathMode;
    const removeOomWarningListener = watchExportOutOfMemoryWarnings(
      rendererWindow,
      oomWarningState,
    );
    const removeNativeStderrWarningListener =
      watchExportNativeStderrWarnings(oomWarningState);
    try {
      const captureState: SlowFallbackCaptureState = { tileHeightIndex: 0 };
      for (
        let frameIndex = payload.segment.startFrame;
        frameIndex < payload.segment.endFrame;
        frameIndex += 1
      ) {
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.overflowSegments.has(
              payload.segment.index,
            ),
            nativeWarningCount: getExportSegmentOomWarningCount(
              oomWarningState,
              payload.segment.index,
            ),
          };
        const sceneTime = getExportFrameTime(
          frameIndex,
          payload.frameRate,
          payload.durationSeconds,
        );
        const syncResult = await renderExportFrame(
          rendererWindow,
          payload.project,
          payload.scene,
          sceneTime,
          payload.frameRate,
        );
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.overflowSegments.has(
              payload.segment.index,
            ),
            nativeWarningCount: getExportSegmentOomWarningCount(
              oomWarningState,
              payload.segment.index,
            ),
          };
        if (syncResult.failedCount > 0) {
          throw new Error(
            `Supervised segment renderer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`,
          );
        }
        const frame =
          payload.pathMode === "slow-fallback"
            ? await captureSlowFallbackExportFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
                captureState,
                oomWarningState,
                payload.segment.index,
              )
            : await captureTiledExportFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
              );
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.overflowSegments.has(
              payload.segment.index,
            ),
            nativeWarningCount: getExportSegmentOomWarningCount(
              oomWarningState,
              payload.segment.index,
            ),
          };
        await writeSupervisedFrameOutput(payload.outputPath, frameIndex, frame);
        console.log(`[clipper export-frame] frame=${frameIndex + 1}`);
        onFrameCaptured?.(frameIndex);
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.overflowSegments.has(
              payload.segment.index,
            ),
            nativeWarningCount: getExportSegmentOomWarningCount(
              oomWarningState,
              payload.segment.index,
            ),
          };
      }
    } finally {
      oomWarningState.activeSegment = null;
      removeOomWarningListener();
      removeNativeStderrWarningListener();
    }
  } finally {
    rendererWindow.destroy();
  }

  const frameCount = await countContiguousSupervisedSegmentFrames(
    payload.outputPath,
    payload.segment,
  );
  if (frameCount !== payload.segment.endFrame - payload.segment.startFrame) {
    throw new Error(
      `Supervised export child segment ${payload.segment.index} produced ${frameCount} frame file(s); expected ${payload.segment.endFrame - payload.segment.startFrame}.`,
    );
  }
  return {
    nativeWarningDetected: oomWarningState.overflowSegments.has(
      payload.segment.index,
    ),
    nativeWarningCount: getExportSegmentOomWarningCount(
      oomWarningState,
      payload.segment.index,
    ),
  };
}

async function writeSupervisedFrameOutput(
  segmentOutputPath: string,
  frameIndex: number,
  frame: Buffer,
) {
  const framePath = getSupervisedFrameOutputPath(segmentOutputPath, frameIndex);
  const tempFramePath = `${framePath}.tmp-${process.pid}`;
  await fs.writeFile(tempFramePath, frame);
  await fs.rename(tempFramePath, framePath);
}

async function loadRenderedMediaExportWindow(window: BrowserWindow) {
  if (isDev) {
    const baseUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
    await window.loadURL(`${baseUrl}?clipperExport=1`);
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"), {
    query: { clipperExport: "1" },
  });
}

async function renderExportFrame(
  window: BrowserWindow,
  project: ProjectManifest,
  scene: Scene,
  sceneTime: number,
  frameRate: number,
) {
  return withTimeout<RenderClockReadinessResult>(
    window.webContents.executeJavaScript(
      `window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate })})`,
      true,
    ),
    exportRendererFrameTimeoutMs,
    `Timed out waiting ${exportRendererFrameTimeoutMs}ms for export renderer frame at ${sceneTime.toFixed(3)}s.`,
  );
}

function getExportFrameTime(
  frameIndex: number,
  frameRate: number,
  durationSeconds: number,
) {
  return Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
}

function getExportFrameSegments(
  scene: Scene,
  totalFrames: number,
  frameRate: number,
  durationSeconds: number,
): ExportFrameSegment[] {
  const boundaries = getCompositionCheckpointTimes(scene, durationSeconds);
  const minimumSeconds = Math.min(
    exportMinimumCheckpointSegmentSeconds,
    durationSeconds,
  );
  const segments: ExportFrameSegment[] = [];
  let startTime = 0;

  for (const boundary of boundaries) {
    const isFinalBoundary = boundary >= durationSeconds;
    if (!isFinalBoundary && boundary - startTime < minimumSeconds) continue;
    const startFrame = Math.min(
      totalFrames - 1,
      Math.max(0, Math.round(startTime * frameRate)),
    );
    const endFrame = Math.min(
      totalFrames,
      Math.max(startFrame + 1, Math.round(boundary * frameRate)),
    );
    if (
      segments.length > 0 &&
      startFrame < segments[segments.length - 1].endFrame
    )
      continue;
    segments.push({
      index: segments.length,
      startFrame,
      endFrame,
      startTime,
      endTime: boundary,
    });
    startTime = boundary;
  }

  if (
    segments.length === 0 ||
    segments[segments.length - 1].endFrame < totalFrames
  ) {
    const startFrame =
      segments.length === 0 ? 0 : segments[segments.length - 1].endFrame;
    segments.push({
      index: segments.length,
      startFrame,
      endFrame: totalFrames,
      startTime: startFrame / frameRate,
      endTime: durationSeconds,
    });
  }

  return segments;
}

function getCompositionCheckpointTimes(scene: Scene, durationSeconds: number) {
  const timeline = buildLinearTimeline(scene);
  const times = new Set<number>([durationSeconds]);
  for (const item of timeline) {
    const end = clampExportTime(item.end, durationSeconds);
    if (end > 0) times.add(end);
  }
  return [...times].sort((left, right) => left - right);
}

function clampExportTime(value: number, durationSeconds: number) {
  if (!Number.isFinite(value)) return durationSeconds;
  return Math.min(Math.max(value, 0), durationSeconds);
}

function createExportOomWarningState(): ExportOomWarningState {
  return {
    activeSegment: null,
    activePath: "fast/default",
    overflowSegments: new Set(),
    warningCounts: new Map(),
    totalWarnings: 0,
  };
}

function watchExportOutOfMemoryWarnings(
  window: BrowserWindow,
  state: ExportOomWarningState,
) {
  const handleConsoleMessage = (...args: unknown[]) => {
    const message = getConsoleMessageText(args);
    markExportOomWarning(state, message, "console");
  };
  window.webContents.on("console-message", handleConsoleMessage);
  return () => window.webContents.off("console-message", handleConsoleMessage);
}

function watchExportNativeStderrWarnings(state: ExportOomWarningState) {
  const originalWrite = process.stderr.write.bind(
    process.stderr,
  ) as typeof process.stderr.write;
  let handlingStderr = false;
  process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    if (!handlingStderr) {
      handlingStderr = true;
      try {
        const message =
          typeof chunk === "string"
            ? chunk
            : Buffer.from(chunk).toString("utf8");
        if (!message.includes("[clipper export]"))
          markExportOomWarning(state, message, "stderr", { log: false });
      } finally {
        handlingStderr = false;
      }
    }
    return (
      originalWrite as unknown as (
        chunk: string | Uint8Array,
        ...args: unknown[]
      ) => boolean
    )(chunk, ...args);
  }) as typeof process.stderr.write;
  return () => {
    process.stderr.write = originalWrite;
  };
}

function markExportOomWarning(
  state: ExportOomWarningState,
  message: string,
  source: string,
  options: { log?: boolean } = {},
) {
  if (!isExportOutOfMemoryWarning(message)) return;

  state.totalWarnings += 1;
  const segment = state.activeSegment;
  if (segment) {
    state.overflowSegments.add(segment.index);
    state.warningCounts.set(
      segment.index,
      getExportSegmentOomWarningCount(state, segment.index) + 1,
    );
    if (options.log !== false)
      console.warn(
        `[clipper export] segment=${segment.index} frames=${segment.startFrame}-${segment.endFrame - 1} native-oom-warning source=${source} path=${state.activePath}: ${message.trim()}`,
      );
    return;
  }

  if (options.log !== false)
    console.warn(
      `[clipper export] native-oom-warning source=${source} outside-active-segment: ${message.trim()}`,
    );
}

function getConsoleMessageText(args: unknown[]) {
  const eventMessage =
    args[0] &&
    typeof args[0] === "object" &&
    "message" in args[0] &&
    typeof (args[0] as { message?: unknown }).message === "string"
      ? (args[0] as { message: string }).message
      : "";
  const legacyMessage = typeof args[2] === "string" ? args[2] : "";
  return legacyMessage || eventMessage;
}

function isExportOutOfMemoryWarning(message: string) {
  return /tile memory limits exceeded|some content may not draw|cc\/tiles\/tile_manager|tile_manager\.cc|memory limits exceeded|raster[^\n]{0,80}memory|gpu[^\n]{0,80}memory|out[ -]?of[ -]?memory|\boom\b/i.test(
    message,
  );
}

function getExportSegmentOomWarningCount(
  state: ExportOomWarningState,
  segmentIndex: number,
) {
  return state.warningCounts.get(segmentIndex) ?? 0;
}

function parseForcedOomIndexes(raw: string | undefined) {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter(Number.isFinite),
  );
}

function getIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function captureTiledExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
) {
  await applyDefaultExportCaptureViewport(window);
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  for (const tile of getExportCaptureTiles()) {
    const tileBitmap = await captureExportTileWithRetries(
      window,
      tile,
      frameIndex,
      sceneTime,
    );
    stitchBgraTile(frame, tileBitmap, tile);
  }
  return frame;
}

async function captureSlowFallbackExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  captureState: SlowFallbackCaptureState,
  oomWarningState: ExportOomWarningState,
  segmentIndex: number,
) {
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  while (captureState.tileHeightIndex < exportSlowFallbackTileHeights.length) {
    const tileHeight =
      exportSlowFallbackTileHeights[captureState.tileHeightIndex];
    try {
      console.log(
        `[clipper export] Segment ${segmentIndex + 1}: path=slow-fallback frame=${frameIndex + 1} tile-height=${tileHeight}.`,
      );
      const isFinalTileTier =
        captureState.tileHeightIndex >=
        exportSlowFallbackTileHeights.length - 1;
      for (const tile of getSlowFallbackExportCaptureTiles(tileHeight)) {
        const tileBitmap = await captureStableSlowFallbackTile(
          window,
          tile,
          frameIndex,
          sceneTime,
          oomWarningState,
          segmentIndex,
          isFinalTileTier,
        );
        stitchBgraTile(frame, tileBitmap, tile);
      }
      return frame;
    } catch (error) {
      if (!shouldReduceSlowFallbackTileHeight(captureState, error)) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Slow fallback failed to capture export frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s with ${tileHeight}px tiles: ${message}`,
        );
      }
      console.warn(
        `[clipper export] Segment ${segmentIndex + 1}: path=slow-fallback reducing tile height after frame ${frameIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Slow fallback exhausted tile heights (${exportSlowFallbackTileHeights.join(" -> ")}) for export frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
}

async function captureStableSlowFallbackTile(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
  oomWarningState: ExportOomWarningState,
  segmentIndex: number,
  isFinalTileTier: boolean,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= exportCaptureTileRetries; attempt += 1) {
    try {
      const warningCountBefore = getExportSegmentOomWarningCount(
        oomWarningState,
        segmentIndex,
      );
      await applySlowFallbackExportCaptureViewport(window, tile);
      const samples: Buffer[] = [];
      for (
        let sampleIndex = 0;
        sampleIndex < exportSlowFallbackTileValidationSamples;
        sampleIndex += 1
      ) {
        const syncResult = await syncExportRenderClock(
          window,
          sceneTime,
          `slow fallback export frame ${frameIndex + 1} tile ${formatTileRange(tile)} sample ${sampleIndex + 1}`,
        );
        if (syncResult.failedCount > 0) {
          throw new ExportTileUnstableError(
            `Slow fallback failed to repin ${syncResult.failedCount} animation(s) before export frame ${frameIndex + 1} tile ${formatTileRange(tile)} sample ${sampleIndex + 1}.`,
          );
        }
        samples.push(
          await captureSlowFallbackTileBitmap(
            window,
            tile,
            frameIndex,
            sceneTime,
          ),
        );
      }
      const warningCountAfter = getExportSegmentOomWarningCount(
        oomWarningState,
        segmentIndex,
      );
      if (warningCountAfter > warningCountBefore) {
        throw new ExportTileMemoryPressureError(
          `Chromium reported tile memory pressure while capturing export frame ${frameIndex + 1} tile ${formatTileRange(tile)}${isFinalTileTier ? " at final tile tier" : ""}.`,
        );
      }
      for (
        let sampleIndex = 1;
        sampleIndex < samples.length;
        sampleIndex += 1
      ) {
        validateMatchingExportBitmaps(
          samples[0],
          samples[sampleIndex],
          `Captured export frame ${frameIndex + 1} tile ${formatTileRange(tile)} changed between validation samples at pinned time ${sceneTime.toFixed(3)}s`,
        );
      }
      return samples[0];
    } catch (error) {
      lastError = error;
      if (isSlowFallbackTileReductionSignal(error)) break;
    }
  }

  if (
    lastError instanceof ExportTileUnstableError ||
    lastError instanceof ExportTileMemoryPressureError
  )
    throw lastError;
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Failed to capture stable export frame ${frameIndex + 1} tile ${formatTileRange(tile)} at ${sceneTime.toFixed(3)}s after ${exportCaptureTileRetries} attempt(s): ${message}`,
  );
}

async function applyDefaultExportCaptureViewport(window: BrowserWindow) {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== frameWidth || currentHeight !== frameHeight)
    window.setContentSize(frameWidth, frameHeight, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
      document.documentElement.style.width = "${frameWidth}px";
      document.documentElement.style.height = "${frameHeight}px";
      document.documentElement.style.overflow = "hidden";
      document.body.style.width = "${frameWidth}px";
      document.body.style.height = "${frameHeight}px";
      document.body.style.overflow = "hidden";
      document.body.style.margin = "0";
      document.body.style.transformOrigin = "0 0";
      document.body.style.transform = "translate3d(0, 0, 0)";
      return true;
    })()`,
      true,
    ),
    exportCaptureTileTimeoutMs,
    "Timed out applying default export capture viewport.",
  );
}

async function applySlowFallbackExportCaptureViewport(
  window: BrowserWindow,
  tile: ExportCaptureTile,
) {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== frameWidth || currentHeight !== frameHeight)
    window.setContentSize(frameWidth, frameHeight, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
      document.documentElement.style.width = "${frameWidth}px";
      document.documentElement.style.height = "${frameHeight}px";
      document.documentElement.style.overflow = "hidden";
      document.body.style.width = "${frameWidth}px";
      document.body.style.height = "${frameHeight}px";
      document.body.style.overflow = "hidden";
      document.body.style.margin = "0";
      document.body.style.transformOrigin = "0 0";
      document.body.style.transform = "translate3d(0, 0, 0)";
      return true;
    })()`,
      true,
    ),
    exportCaptureTileTimeoutMs,
    `Timed out applying slow fallback export capture viewport for tile ${formatTileRange(tile)}.`,
  );
}

async function syncExportRenderClock(
  window: BrowserWindow,
  sceneTime: number,
  context: string,
) {
  return withTimeout<RenderClockReadinessResult>(
    window.webContents.executeJavaScript(
      "window.__clipperSyncExportRenderClock && window.__clipperSyncExportRenderClock()",
      true,
    ),
    exportRendererFrameTimeoutMs,
    `Timed out syncing render clock for ${context} at ${sceneTime.toFixed(3)}s.`,
  );
}

async function captureSlowFallbackTileBitmap(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
) {
  const captureTile = getPaddedSlowFallbackCaptureTile(tile);
  const image = await withTimeout(
    window.webContents.capturePage(captureTile),
    exportCaptureTileTimeoutMs,
    `Timed out capturing slow fallback export frame ${frameIndex + 1} tile ${formatTileRange(tile)} capture ${formatTileRect(captureTile)} at ${sceneTime.toFixed(3)}s.`,
  );
  const captureBitmap = getBgraBitmap(
    image,
    captureTile.width,
    captureTile.height,
    `slow fallback export frame ${frameIndex + 1} tile ${formatTileRange(tile)} capture ${formatTileRect(captureTile)}`,
  );
  if (captureTile.x === tile.x && captureTile.y === tile.y && captureTile.width === tile.width && captureTile.height === tile.height)
    return captureBitmap;
  return cropBgraTile(captureBitmap, captureTile, tile);
}

function getPaddedSlowFallbackCaptureTile(tile: ExportCaptureTile) {
  const padding = exportSlowFallbackTilePadding;
  if (padding <= 0) return tile;
  const x = Math.max(0, tile.x - padding);
  const y = Math.max(0, tile.y - padding);
  const right = Math.min(frameWidth, tile.x + tile.width + padding);
  const bottom = Math.min(frameHeight, tile.y + tile.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function getSlowFallbackExportCaptureTiles(tileHeight: number) {
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += tileHeight) {
    tiles.push({
      x: 0,
      y,
      width: frameWidth,
      height: Math.min(tileHeight, frameHeight - y),
    });
  }
  return tiles;
}

function shouldReduceSlowFallbackTileHeight(
  captureState: SlowFallbackCaptureState,
  error: unknown,
) {
  if (captureState.tileHeightIndex >= exportSlowFallbackTileHeights.length - 1)
    return false;
  if (!isSlowFallbackTileReductionSignal(error)) return false;
  captureState.tileHeightIndex += 1;
  return true;
}

function isSlowFallbackTileReductionSignal(error: unknown) {
  if (
    error instanceof ExportTileUnstableError ||
    error instanceof ExportTileMemoryPressureError
  )
    return true;
  if (!(error instanceof Error)) return false;
  return /bitmap length|image size|memory|timed out/i.test(error.message);
}

function validateMatchingExportBitmaps(
  first: Buffer,
  second: Buffer,
  message: string,
) {
  if (first.equals(second)) return;

  const diff = getBitmapDiffStats(first, second);
  if (!isAcceptableCaptureReadbackDrift(diff)) {
    throw new ExportTileUnstableError(
      `${message} (${formatBitmapDiffStats(diff)}).`,
    );
  }
}

function getBitmapDiffStats(left: Buffer, right: Buffer) {
  const length = Math.min(left.byteLength, right.byteLength);
  let differingBytes = Math.abs(left.byteLength - right.byteLength);
  let totalDelta = 0;
  let maxDelta = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs(left[index] - right[index]);
    if (delta > 0) {
      differingBytes += 1;
      totalDelta += delta;
      if (delta > maxDelta) maxDelta = delta;
    }
  }
  const pixels = Math.max(
    1,
    Math.ceil(Math.max(left.byteLength, right.byteLength) / 4),
  );
  const differingPixelRatio = differingBytes / 4 / pixels;
  const averageByteDelta = totalDelta / Math.max(1, length);
  return { differingBytes, differingPixelRatio, averageByteDelta, maxDelta };
}

function isAcceptableCaptureReadbackDrift(
  diff: ReturnType<typeof getBitmapDiffStats>,
) {
  return (
    diff.differingPixelRatio <= exportSlowFallbackMaxDifferingPixelRatio &&
    diff.averageByteDelta <= exportSlowFallbackMaxAverageByteDelta
  );
}

function formatBitmapDiffStats(diff: ReturnType<typeof getBitmapDiffStats>) {
  return `${diff.differingBytes} differing bytes, ${(diff.differingPixelRatio * 100).toFixed(4)}% pixel-equivalent ratio, avg byte delta ${diff.averageByteDelta.toFixed(4)}, max byte delta ${diff.maxDelta}`;
}

function formatTileRange(tile: ExportCaptureTile) {
  return `${tile.y}-${tile.y + tile.height}`;
}

function formatTileRect(tile: ExportCaptureTile) {
  return `${tile.x},${tile.y},${tile.width}x${tile.height}`;
}

class ExportTileUnstableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportTileUnstableError";
  }
}

class ExportTileMemoryPressureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportTileMemoryPressureError";
  }
}

function getExportCaptureTiles() {
  const tileHeight = Math.ceil(frameHeight / exportCaptureStripCount);
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += tileHeight) {
    tiles.push({
      x: 0,
      y,
      width: frameWidth,
      height: Math.min(tileHeight, frameHeight - y),
    });
  }
  return tiles;
}

async function captureExportTileWithRetries(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= exportCaptureTileRetries; attempt += 1) {
    try {
      const image = await withTimeout(
        window.webContents.capturePage(tile),
        exportCaptureTileTimeoutMs,
        `Timed out capturing export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height} at ${sceneTime.toFixed(3)}s.`,
      );
      return getBgraBitmap(
        image,
        tile.width,
        tile.height,
        `export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height}`,
      );
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Failed to capture export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height} at ${sceneTime.toFixed(3)}s after ${exportCaptureTileRetries} attempt(s): ${message}`,
  );
}

function stitchBgraTile(
  frame: Buffer,
  tileBitmap: Buffer,
  tile: ExportCaptureTile,
) {
  const bytesPerPixel = 4;
  const sourceStride = tile.width * bytesPerPixel;
  const targetStride = frameWidth * bytesPerPixel;
  for (let row = 0; row < tile.height; row += 1) {
    tileBitmap.copy(
      frame,
      (tile.y + row) * targetStride + tile.x * bytesPerPixel,
      row * sourceStride,
      (row + 1) * sourceStride,
    );
  }
}

function cropBgraTile(
  bitmap: Buffer,
  sourceTile: ExportCaptureTile,
  targetTile: ExportCaptureTile,
) {
  const bytesPerPixel = 4;
  const sourceStride = sourceTile.width * bytesPerPixel;
  const targetStride = targetTile.width * bytesPerPixel;
  const sourceOffsetX = (targetTile.x - sourceTile.x) * bytesPerPixel;
  const sourceOffsetY = targetTile.y - sourceTile.y;
  const target = Buffer.allocUnsafe(targetTile.width * targetTile.height * bytesPerPixel);

  for (let row = 0; row < targetTile.height; row += 1) {
    const sourceStart = (sourceOffsetY + row) * sourceStride + sourceOffsetX;
    bitmap.copy(
      target,
      row * targetStride,
      sourceStart,
      sourceStart + targetStride,
    );
  }

  return target;
}

function getBgraBitmap(
  image: NativeImage,
  width: number,
  height: number,
  context: string,
) {
  const expectedLength = width * height * 4;
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  if (bitmap.byteLength === expectedLength) return bitmap;

  const resizedBitmap = image
    .resize({ width, height, quality: "best" })
    .toBitmap({ scaleFactor: 1 });
  if (resizedBitmap.byteLength === expectedLength) return resizedBitmap;

  const imageSize = image.getSize();
  throw new Error(
    `Captured ${context} bitmap length was ${resizedBitmap.byteLength}; image size was ${imageSize.width}x${imageSize.height}, expected ${width}x${height}.`,
  );
}

async function writeProcessInput(
  process: ChildProcessWithoutNullStreams,
  chunk: Buffer,
  exportId?: string,
) {
  throwIfVideoRenderCancelled(exportId);
  if (process.stdin.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    let cancelPoll: NodeJS.Timeout | null = null;
    const cleanup = () => {
      process.stdin.off("drain", handleDrain);
      process.stdin.off("error", handleError);
      process.off("close", handleClose);
      if (cancelPoll) clearInterval(cancelPoll);
    };
    const handleDrain = () => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(
        new Error(
          exportId && cancelledVideoRenders.has(exportId)
            ? "Video export cancelled."
            : "Video encoder closed before accepting frame data.",
        ),
      );
    };
    process.stdin.once("drain", handleDrain);
    process.stdin.once("error", handleError);
    process.once("close", handleClose);
    if (exportId) {
      cancelPoll = setInterval(() => {
        if (!cancelledVideoRenders.has(exportId)) return;
        cleanup();
        reject(new Error("Video export cancelled."));
      }, 50);
    }
  });
  throwIfVideoRenderCancelled(exportId);
}

type VideoExportMethod = "fast-child" | "slow-fallback";
type VideoExportProgress = {
  frame: number;
  totalFrames: number;
  percent: number;
  status: string;
  method?: VideoExportMethod;
};
type RenderClockReadinessResult = {
  animationCount: number;
  pinnedCount: number;
  failedCount: number;
  pendingReadyCount: number;
  passCount: number;
  layerCount: number;
};
type ExportSource = "app" | "app-supervised";
type ExportPathMode = "fast/default" | "slow-fallback";
type RenderSceneToVideoOptions = {
  source?: ExportSource;
  exportId?: string;
  onProgress?: (progress: VideoExportProgress) => void;
};
type ExportFrameSegment = {
  index: number;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
};
type ExportOomWarningState = {
  activeSegment: ExportFrameSegment | null;
  activePath: "fast/default" | "slow-fallback";
  overflowSegments: Set<number>;
  warningCounts: Map<number, number>;
  totalWarnings: number;
};
type SlowFallbackCaptureState = { tileHeightIndex: number };
type SupervisedSegmentPayload = {
  project: ProjectManifest;
  scene: Scene;
  frameRate: number;
  durationSeconds: number;
  segment: ExportFrameSegment;
  outputPath: string;
  pathMode: ExportPathMode;
};
type SupervisedSegmentResult = {
  outputPath: string;
  nativeWarningDetected: boolean;
  nativeWarningCount: number;
};
type ExportCaptureTile = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type RasterizedPreviewFrame = {
  width: number;
  height: number;
  pixelFormat: "bgra";
  sceneTime: number;
  frameRate: number;
  data: string;
};
type MotionMarker = { start: number; duration: number };
type AdjustmentLayer = {
  id: string;
  name: string;
  start: number;
  duration: number;
  effect: {
    kind?: "frameSkip";
    every?: number;
    effectId?: string;
    params?: Record<string, unknown>;
  };
};
type TransitionLayer = {
  id: string;
  name: string;
  start: number;
  duration: number;
  midPoint: number;
  effect: { effectId?: string; params?: Record<string, unknown> };
};
type CompositionClip = {
  start?: number;
  duration: number;
  motionMarkers?: MotionMarker[];
};
type Scene = {
  id: string;
  name: string;
  compositions: CompositionClip[];
  adjustmentLayers?: AdjustmentLayer[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
};
type ProjectManifest = {
  id: string;
  name: string;
  resolution: { width: number; height: number };
  scenes: Scene[];
  assetsPath: string;
  editorState?: unknown;
};
type TimelinePart = CompositionClip & { start: number; end: number };

function buildLinearTimeline(scene: Scene): TimelinePart[] {
  let cursor = 0;
  return scene.compositions.map((part) => {
    const start = part.start ?? cursor;
    const end = start + part.duration;
    cursor = part.start === undefined ? end : Math.max(cursor, end);
    return { ...part, start, end };
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#00000000",
    title: "Clipper",
    icon: appIconPath,
    titleBarStyle: "hiddenInset",
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);

  try {
    const state = await readAppState();
    const bounds = state.windowBounds as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (
      bounds &&
      typeof bounds.x === "number" &&
      typeof bounds.y === "number" &&
      typeof bounds.width === "number" &&
      typeof bounds.height === "number"
    ) {
      const displays = screen.getAllDisplays();
      const inAnyDisplay = displays.some((d) => {
        const b = d.workArea;
        return (
          bounds.x < b.x + b.width &&
          bounds.x + 40 > b.x &&
          bounds.y < b.y + b.height &&
          bounds.y + 40 > b.y
        );
      });
      if (inAnyDisplay) window.setBounds(bounds);
    }
  } catch {
    /* no saved bounds */
  }

  window.on("close", (event) => {
    event.preventDefault();
    writeWindowBounds(window)
      .catch(() => {})
      .finally(() => window.destroy());
  });

  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => {
      return String(permission) === "local-fonts";
    },
  );
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(String(permission) === "local-fonts");
    },
  );

  window.on("enter-full-screen", () =>
    window.webContents.send("clipper:window-fullscreen-changed", true),
  );
  window.on("leave-full-screen", () =>
    window.webContents.send("clipper:window-fullscreen-changed", false),
  );

  window.webContents.on("before-input-event", (event, input) => {
    if (!(input.control || input.meta)) return;
    if (input.key.toLowerCase() === "w") {
      event.preventDefault();
      window.webContents.send("clipper:close-editor-tab-shortcut");
      return;
    }

    if (input.key.toLowerCase() === "t") {
      event.preventDefault();
      window.webContents.send("clipper:restore-editor-tab-shortcut");
      return;
    }

    if (input.key === ",") {
      event.preventDefault();
      window.webContents.send("clipper:settings-shortcut");
      return;
    }

    if (!["1", "2", "3", "4"].includes(input.key)) return;

    event.preventDefault();
    window.webContents.send("clipper:mode-shortcut", input.key);
  });

  if (isDev) {
    await window.loadURL(
      process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173",
    );
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function installAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          accelerator: "CommandOrControl+,",
          click: (_menuItem, browserWindow) => {
            if (browserWindow instanceof BrowserWindow)
              browserWindow.webContents.send("clipper:settings-shortcut");
          },
        },
        { type: "separator" },
        {
          label: "Export as .clipper",
          accelerator: "CommandOrControl+Shift+E",
          click: (_menuItem, browserWindow) => {
            if (browserWindow instanceof BrowserWindow)
              browserWindow.webContents.send("clipper:export-project");
          },
        },
        { type: "separator" },
        isMac
          ? {
              label: "Close Window",
              click: (_menuItem, browserWindow) => {
                browserWindow?.close();
              },
            }
          : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function renderVideoFromCommand() {
  const childSegmentArgIndex = process.argv.indexOf(
    "--render-video-child-segment",
  );
  if (childSegmentArgIndex >= 0) {
    const payloadPath = process.argv[childSegmentArgIndex + 1];
    if (!payloadPath)
      throw new Error(
        "Usage: electron . --render-video-child-segment <payload.json>",
      );
    let childSegmentCancelled = false;
    process.once("SIGTERM", () => {
      childSegmentCancelled = true;
      app.exit(0);
    });
    process.on("message", (message) => {
      if (!isExportChildStopMessage(message)) return;
      childSegmentCancelled = true;
      setImmediate(() => app.quit());
    });
    const payload = JSON.parse(
      await fs.readFile(payloadPath, "utf8"),
    ) as SupervisedSegmentPayload;
    if (childSegmentCancelled) return true;
    try {
      await renderSceneSegmentToRawFrames(
        payload,
        undefined,
        () => childSegmentCancelled,
      );
    } catch (error) {
      console.error(
        error instanceof Error ? error.stack || error.message : String(error),
      );
      app.exit(1);
      return true;
    }
    return true;
  }

  return false;
}

app.whenReady().then(async () => {
  installAppMenu();

  if (await renderVideoFromCommand()) {
    app.quit();
    return;
  }

  await createWindow();
});

app.on("window-all-closed", () => {
  destroyPreviewRasterizerWindow();
  app.quit();
});

app.on("before-quit", () => {
  destroyPreviewRasterizerWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
