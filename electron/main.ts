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
const renderVideoChildArgIndex = process.argv.indexOf("--render-video-child");
const isRenderVideoChildProcess = renderVideoChildArgIndex >= 0;
if (isRenderVideoChildProcess && process.platform === "darwin") app.setActivationPolicy("accessory");
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
const activeSupervisedRenderStops = new Set<() => void>();
const activePreviewVideoEncoders = new Set<ChildProcessWithoutNullStreams>();
const textFileWatchers = new Map<number, FSWatcher[]>();
let appShuttingDown = false;
const appStatePath = "clipper/app-state.json";
const appIconPath = path.resolve(__dirname, "../build/icons/icon.png");
const frameWidth = 1920;
const frameHeight = 1080;
const defaultExportTileHeight = 270;
const exportRendererFrameTimeoutMs = 8000;
const exportCaptureTileRetries = 3;
const exportCaptureTileTimeoutMs = 4000;
const exportProcessStopTimeoutMs = 1200;
const defaultPrerenderBlockDurationMs = 200;
const minPrerenderBlockDurationMs = 20;
const maxPrerenderBlockDurationMs = 1000;
const prerenderVideoBlockMimeType = 'video/mp4; codecs="avc1.42E028"';
const prerenderVideoBlockCodecVersion = 2;
let hardwareEncoderSupport: Set<string> | null = null;
let systemFontFamilies: string[] | null = null;

const exportChromiumArgs = [
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--force-gpu-rasterization",
  "--enable-zero-copy",
  "--ignore-gpu-blocklist",
  "--max-gum-fps=60",
  "--gpu-memory-buffer-compositor-resources",
  "--force-gpu-mem-available-mb=4096",
  "--renderer-process-limit=1",
  "--force-device-scale-factor=1",
  "--num-raster-threads=8",
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

type ExportChildStopReason = "cancel";
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
    candidate.reason === "cancel"
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
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    durationSeconds: number,
    tileHeight?: number,
    reusePrerenderCache?: boolean,
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
      manifestPath,
      scene,
      filePath,
      frameRate,
      durationSeconds,
      {
        source: "app-supervised",
        exportId,
        tileHeight,
        reusePrerenderCache: reusePrerenderCache === true,
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
  "clipper:prerender-frame",
  async (
    _event,
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight?: number,
    blockDurationMs?: number,
  ) => {
    return withTimeout(
      prerenderFrame(project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs),
      12000,
      `Timed out prerendering frame at ${sceneTime.toFixed(3)}s in the main process.`,
    );
  },
);

ipcMain.handle(
  "clipper:prerender-video-block",
  async (
    _event,
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight?: number,
    blockDurationMs?: number,
  ) => {
    return withTimeout(
      prerenderVideoBlock(project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs),
      30000,
      `Timed out prerendering video block at ${sceneTime.toFixed(3)}s in the main process.`,
    );
  },
);

ipcMain.handle(
  "clipper:clear-prerender-cache",
  async (_event, manifestPath: string) => {
    await fs.rm(getProjectCacheDirectory(manifestPath), { recursive: true, force: true }).catch(() => undefined);
  },
);

ipcMain.handle("clipper:clear-all-prerender-caches", async () => {
  const projectsDirectory = path.join(path.resolve(__dirname, ".."), "clipper", "projects");
  const entries = await fs.readdir(projectsDirectory, { withFileTypes: true }).catch(() => []);
  let clearedCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await fs.rm(path.join(projectsDirectory, entry.name, ".cache", "prerender"), { recursive: true, force: true }).catch(() => undefined);
    clearedCount += 1;
  }
  return { clearedCount };
});

ipcMain.handle(
  "clipper:cancel-render-video-export",
  async (_event, exportId: string) => {
    cancelledVideoRenders.add(exportId);
    for (const cancel of activeVideoRenderControllers.get(exportId) ?? [])
      cancel();
  },
);

async function prerenderFrame(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
  tileHeight = defaultExportTileHeight,
  blockDurationMs = defaultPrerenderBlockDurationMs,
): Promise<PrerenderedFrame[]> {
  if (!Number.isFinite(frameRate) || frameRate <= 0)
    throw new Error("Prerender cache requires a valid frame rate.");
  if (!Number.isFinite(sceneTime) || sceneTime < 0)
    throw new Error("Prerender cache requires a valid scene time.");
  if (!Number.isFinite(sceneDuration) || sceneDuration <= 0)
    throw new Error("Prerender cache requires a valid scene duration.");
  const exportTileHeight = clampExportTileHeight(tileHeight);
  const exportBlockDurationMs = clampPrerenderBlockDurationMs(blockDurationMs);
  const frameIndex = Math.round(sceneTime * frameRate);
  const block = getPrerenderBlockRange(frameIndex, sceneDuration, frameRate, exportBlockDurationMs);
  const cacheKey = getPrerenderCacheKey(project, scene, frameRate, exportTileHeight, exportBlockDurationMs);
  const logPrefix = `[clipper prerender-cache] scene=${scene.id} frame=${frameIndex} time=${sceneTime.toFixed(3)}`;
  const cachedBlock = await readPrerenderBlock(manifestPath, scene, frameRate, block, cacheKey);
  if (cachedBlock.length === block.endFrame - block.startFrame) return cachedBlock;
  console.log(`${logPrefix} render-block start=${block.startFrame} end=${block.endFrame}`);
  await renderPrerenderBlock(project, manifestPath, scene, sceneDuration, frameRate, exportTileHeight, block, cacheKey, logPrefix);
  const frames = await readPrerenderBlock(manifestPath, scene, frameRate, block, cacheKey);
  if (frames.length !== block.endFrame - block.startFrame) throw new Error(`Prerender cache block did not produce ${block.endFrame - block.startFrame} frame(s).`);
  return frames;
}

async function prerenderVideoBlock(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
  tileHeight = defaultExportTileHeight,
  blockDurationMs = defaultPrerenderBlockDurationMs,
): Promise<PrerenderedVideoBlock> {
  if (!Number.isFinite(frameRate) || frameRate <= 0)
    throw new Error("Prerender cache requires a valid frame rate.");
  if (!Number.isFinite(sceneTime) || sceneTime < 0)
    throw new Error("Prerender cache requires a valid scene time.");
  if (!Number.isFinite(sceneDuration) || sceneDuration <= 0)
    throw new Error("Prerender cache requires a valid scene duration.");
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");
  const exportTileHeight = clampExportTileHeight(tileHeight);
  const exportBlockDurationMs = clampPrerenderBlockDurationMs(blockDurationMs);
  const frameIndex = Math.round(sceneTime * frameRate);
  const block = getPrerenderBlockRange(frameIndex, sceneDuration, frameRate, exportBlockDurationMs);
  const cacheKey = getPrerenderCacheKey(project, scene, frameRate, exportTileHeight, exportBlockDurationMs);
  const logPrefix = `[clipper prerender-video-cache] scene=${scene.id} frame=${frameIndex} time=${sceneTime.toFixed(3)}`;
  const cachedBlock = await readPrerenderVideoBlock(manifestPath, scene, frameRate, block, cacheKey);
  if (cachedBlock) return cachedBlock;
  console.log(`${logPrefix} render-block start=${block.startFrame} end=${block.endFrame}`);
  await renderPrerenderVideoBlock(project, manifestPath, scene, sceneDuration, frameRate, exportTileHeight, block, cacheKey, logPrefix);
  const renderedBlock = await readPrerenderVideoBlock(manifestPath, scene, frameRate, block, cacheKey);
  if (!renderedBlock) throw new Error("Prerender video cache block was not written.");
  return renderedBlock;
}

async function renderSceneToVideoSupervised(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  outputPath: string,
  frameRate: number,
  durationSeconds: number,
  options: RenderSceneToVideoOptions = {},
) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");
  if (!Number.isFinite(frameRate) || frameRate <= 0)
    throw new Error("Video export requires a valid frame rate.");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("Video export requires a valid duration.");

  const {
    exportId,
    onProgress,
    reusePrerenderCache = false,
    source = "app-supervised",
    tileHeight = defaultExportTileHeight,
  } = options;
  const exportTileHeight = clampExportTileHeight(tileHeight);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const encoder = getVideoEncoderArgs();
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  const frameRange: ExportFrameRange = { startFrame: 0, endFrame: totalFrames };
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
    `[clipper export] source=${source} total-frames=${totalFrames} tile-height=${exportTileHeight}`,
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
  let activeMethod: VideoExportMethod = "renderer";
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
    if (exportId && cancelledVideoRenders.has(exportId))
      throw new Error("Video export cancelled.");
    reportStatus("Renderer: capturing frames", "renderer");
    const rendererResult = await renderSupervisedFrameRangeChild(
      project,
      manifestPath,
      scene,
      tempDir,
      frameRate,
      durationSeconds,
      totalFrames,
      exportTileHeight,
      source,
      reportFrameProgress,
      exportId,
    );
    if (rendererResult.nativeWarningDetected)
      console.warn(
        `[clipper export] source=${source} parent-native-warning=yes native-warnings=${rendererResult.nativeWarningCount}`,
      );
    const frameCount = await countContiguousSupervisedFrameFiles(
      rendererResult.outputPath,
      frameRange,
    );
    if (frameCount !== totalFrames)
      throw new Error(
        `Supervised export produced ${frameCount} frames; expected ${totalFrames}.`,
      );
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      const frameBuffer = await fs.readFile(
        getSupervisedFrameOutputPath(rendererResult.outputPath, frameIndex),
      );
      if (pendingFrameWrite) await pendingFrameWrite;
      pendingFrameWrite = writeProcessInput(ffmpeg, frameBuffer, exportId);
      reportFrameProgress(frameIndex, "renderer");
    }
    if (reusePrerenderCache) {
      await writePrerenderFramesFromSupervisedOutput(manifestPath, project, scene, rendererResult.outputPath, frameRate, frameRange, exportTileHeight, defaultPrerenderBlockDurationMs);
    }
    await removeSupervisedFrameOutputs(rendererResult.outputPath, frameRange).catch(
      () => undefined,
    );

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

function formatVideoExportMethod(_method: VideoExportMethod) {
  return "Renderer";
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

async function renderSupervisedFrameRangeChild(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  tempDir: string,
  frameRate: number,
  durationSeconds: number,
  totalFrames: number,
  tileHeight: number,
  source: ExportSource,
  onFrameCaptured?: (frameIndex: number, method?: VideoExportMethod) => void,
  exportId?: string,
  requestedFrameRange?: ExportFrameRange,
  renderSurface: SupervisedRenderPayload["renderSurface"] = "export",
): Promise<SupervisedRenderResult> {
  const frameRange: ExportFrameRange = requestedFrameRange ?? { startFrame: 0, endFrame: totalFrames };
  const outputPath = getSupervisedFrameRangeOutputPath(tempDir);
  const payloadPath = path.join(tempDir, "renderer.json");
  const nativeLogPath = path.join(tempDir, "renderer.native.log");
  const payload: SupervisedRenderPayload = {
    project,
    manifestPath,
    scene,
    frameRate,
    durationSeconds,
    frameRange,
    outputPath,
    tileHeight,
    source,
    renderSurface,
  };
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");
  const electronArgs = renderSurface === "preview-cache"
    ? ["--enable-logging=file", `--log-file=${nativeLogPath}`]
    : [...exportChromiumArgs, "--enable-logging=file", `--log-file=${nativeLogPath}`];
  const child = spawn(
    process.execPath,
    getElectronChildArgs(
      ["--render-video-child", payloadPath],
      electronArgs,
    ),
    {
      env: {
        ...process.env,
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
  activeSupervisedRenderStops.add(stopChild);

  let stdout = "";
  let stderr = "";
  let stdoutWarningTail = "";
  let stderrWarningTail = "";
  let nativeWarningDetected = false;
  let nativeWarningCount = 0;
  const inspectChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
    const text = chunk.toString("utf8");
    if (stream === "stdout") stdout += text;
    else stderr += text;
    if (stdout.length > 16000) stdout = stdout.slice(-16000);
    if (stderr.length > 16000) stderr = stderr.slice(-16000);
    for (const frameIndex of getExportFrameProgressIndexes(text))
      onFrameCaptured?.(frameIndex, "renderer");
    const combined = `${stream === "stdout" ? stdoutWarningTail : stderrWarningTail}${text}`;
    if (stream === "stdout") stdoutWarningTail = combined.slice(-512);
    else stderrWarningTail = combined.slice(-512);
    if (isExportOutOfMemoryWarning(combined)) {
      nativeWarningDetected = true;
      nativeWarningCount += 1;
      if (nativeWarningCount <= 3) {
        console.warn(
          `[clipper export] source=${source} parent-native-warning stream=${stream} path=renderer: ${combined.trim().slice(-600)}`,
        );
      } else if (nativeWarningCount === 4) {
        console.warn(
          `[clipper export] source=${source} path=renderer suppressing repeated native tile-memory warnings.`,
        );
      }
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
    if (nativeWarningCount <= 3) {
      console.warn(
        `[clipper export] source=${source} parent-native-warning stream=${stream} path=renderer: ${text.trim().slice(-600)}`,
      );
    } else if (nativeWarningCount === 4) {
      console.warn(
        `[clipper export] source=${source} path=renderer suppressing repeated native tile-memory warnings.`,
      );
    }
  };
  child.stdout.on("data", (chunk: Buffer) => inspectChunk(chunk, "stdout"));
  child.stderr.on("data", (chunk: Buffer) => inspectChunk(chunk, "stderr"));
  const nativeLogPoll = setInterval(() => {
    fs.readFile(nativeLogPath, "utf8")
      .then((log) => {
        if (log) inspectChunk(Buffer.from(log.slice(-32000)), "stderr");
      })
      .catch(() => undefined);
  }, 100);

  let exitCode: number | null = null;
  let childError: unknown = null;
  let cancelCheck: NodeJS.Timeout | null = null;
  try {
    const childClosePromise = new Promise<number | null>((resolve, reject) => {
      child.once("error", (error) => {
        if (cancelledWhileWaiting || appShuttingDown) resolve(null);
        else reject(error);
      });
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
    activeSupervisedRenderStops.delete(stopChild);
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
  const frameCount = await countContiguousSupervisedFrameFiles(
    outputPath,
    frameRange,
  );
  const expectedFrameCount = frameRange.endFrame - frameRange.startFrame;
  if (frameCount === expectedFrameCount)
    return { outputPath, nativeWarningDetected, nativeWarningCount };
  if (exitCode !== 0)
    throw new Error(
      `Supervised export child failed with code ${exitCode ?? "unknown"} after ${frameCount}/${expectedFrameCount} frame(s): ${summarizeChildRenderOutput(stderr || stdout)}`,
    );
  const detail = summarizeChildRenderOutput(stderr || stdout || nativeLog);
  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat)
    throw new Error(
      `Supervised export child produced ${frameCount}/${expectedFrameCount} frame file(s).${detail ? ` Child output: ${detail}` : ""}`,
    );
  const expectedBytes = expectedFrameCount * frameWidth * frameHeight * 4;
  if (stat.size !== expectedBytes)
    throw new Error(
      `Supervised export child created ${stat.size} bytes; expected ${expectedBytes}.`,
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

function getSupervisedFrameRangeOutputPath(tempDir: string) {
  return path.join(tempDir, "renderer.bgra");
}

function getSupervisedFrameOutputPath(
  outputPath: string,
  frameIndex: number,
) {
  return `${outputPath}.frame-${frameIndex}.bgra`;
}

function getPrerenderCacheKey(project: ProjectManifest, scene: Scene, frameRate: number, tileHeight?: number, blockDurationMs?: number) {
  return JSON.stringify({ projectId: project.id, scene, frameRate, tileHeight, blockDurationMs, previewFrameFormat: "transparent-compositor-raw-bgra-v6", width: frameWidth, height: frameHeight });
}

function getProjectCacheDirectory(manifestPath: string) {
  const manifestFilePath = resolveClipperFile(manifestPath);
  const projectDirectory = manifestPath.endsWith("/project.json") ? path.dirname(manifestFilePath) : manifestFilePath.replace(/\.clipper$/i, "");
  return path.join(projectDirectory, ".cache", "prerender");
}

function safeCacheSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "scene";
}

function getPrerenderCachePaths(manifestPath: string, scene: Scene, frameRate: number, frameIndex: number): PrerenderCachePaths {
  const directory = path.join(getProjectCacheDirectory(manifestPath), safeCacheSegment(scene.id), `${frameRate}fps`);
  const framePath = path.join(directory, `frame-${String(frameIndex).padStart(6, "0")}.bgra`);
  return { directory, framePath, manifestPath: `${framePath}.json` };
}

function getPrerenderVideoBlockCachePaths(manifestPath: string, scene: Scene, frameRate: number, frameRange: ExportFrameRange): PrerenderVideoBlockCachePaths {
  const directory = path.join(getProjectCacheDirectory(manifestPath), safeCacheSegment(scene.id), `${frameRate}fps`, "video-blocks");
  const blockName = `block-${String(frameRange.startFrame).padStart(6, "0")}-${String(frameRange.endFrame).padStart(6, "0")}`;
  const videoPath = path.join(directory, `${blockName}.mp4`);
  return { directory, videoPath, manifestPath: `${videoPath}.json` };
}

function getPrerenderBlockRange(frameIndex: number, sceneDuration: number, frameRate: number, blockDurationMs: number): ExportFrameRange {
  const framesPerBlock = Math.max(1, Math.round((blockDurationMs / 1000) * frameRate));
  const totalFrames = Math.max(1, Math.ceil(sceneDuration * frameRate));
  const boundedFrameIndex = Math.min(Math.max(frameIndex, 0), totalFrames - 1);
  const startFrame = Math.floor(boundedFrameIndex / framesPerBlock) * framesPerBlock;
  return { startFrame, endFrame: Math.min(startFrame + framesPerBlock, totalFrames) };
}

function clampPrerenderBlockDurationMs(value: number) {
  if (!Number.isFinite(value)) return defaultPrerenderBlockDurationMs;
  return Math.min(Math.max(Math.round(value), minPrerenderBlockDurationMs), maxPrerenderBlockDurationMs);
}

async function readPrerenderBlock(manifestPath: string, scene: Scene, frameRate: number, frameRange: ExportFrameRange, cacheKey: string): Promise<PrerenderedFrame[]> {
  const frames: PrerenderedFrame[] = [];
  for (let frameIndex = frameRange.startFrame; frameIndex < frameRange.endFrame; frameIndex += 1) {
    const sceneTime = frameIndex / frameRate;
    const frame = await readPrerenderFrame(getPrerenderCachePaths(manifestPath, scene, frameRate, frameIndex), cacheKey, sceneTime, frameRate);
    if (!frame) break;
    frames.push(frame);
  }
  return frames;
}

async function readPrerenderVideoBlock(manifestPath: string, scene: Scene, frameRate: number, frameRange: ExportFrameRange, cacheKey: string): Promise<PrerenderedVideoBlock | null> {
  const cachePaths = getPrerenderVideoBlockCachePaths(manifestPath, scene, frameRate, frameRange);
  const manifest = await readPrerenderVideoManifest(cachePaths.manifestPath);
  if (!isPrerenderVideoManifestCurrent(manifest, cacheKey, frameRange, frameRate)) return null;
  const video = await fs.readFile(cachePaths.videoPath).catch(() => null);
  if (!video || video.length === 0) return null;
  return {
    width: frameWidth,
    height: frameHeight,
    mimeType: prerenderVideoBlockMimeType,
    startTime: frameRange.startFrame / frameRate,
    duration: (frameRange.endFrame - frameRange.startFrame) / frameRate,
    startFrame: frameRange.startFrame,
    endFrame: frameRange.endFrame,
    frameRate,
    data: video.toString("base64"),
  };
}

async function renderPrerenderVideoBlock(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  durationSeconds: number,
  frameRate: number,
  tileHeight: number,
  frameRange: ExportFrameRange,
  cacheKey: string,
  logPrefix: string,
) {
  const tempDir = path.join(getProjectCacheDirectory(manifestPath), ".tmp", `prerender-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const rendererResult = await renderSupervisedFrameRangeChild(
      project,
      manifestPath,
      scene,
      tempDir,
      frameRate,
      durationSeconds,
      frameRange.endFrame,
      tileHeight,
      "app-supervised",
      undefined,
      undefined,
      frameRange,
      "preview-cache",
    );
    const frameCount = await countContiguousSupervisedFrameFiles(rendererResult.outputPath, frameRange);
    const expectedFrameCount = frameRange.endFrame - frameRange.startFrame;
    if (frameCount !== expectedFrameCount)
      throw new Error(`Prerender video cache block produced ${frameCount} frame(s); expected ${expectedFrameCount}.`);
    const cachePaths = getPrerenderVideoBlockCachePaths(manifestPath, scene, frameRate, frameRange);
    const tempVideoPath = path.join(tempDir, "block.mp4");
    await encodeFrameFilesToMp4(rendererResult.outputPath, tempVideoPath, frameRate, frameRange);
    await writePrerenderVideoBlock(cachePaths, tempVideoPath, cacheKey, frameRange, frameRate);
    await removeSupervisedFrameOutputs(rendererResult.outputPath, frameRange).catch(() => undefined);
    console.log(`${logPrefix} cached-video-block start=${frameRange.startFrame} end=${frameRange.endFrame}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function encodeFrameFilesToMp4(inputFrameOutputPath: string, outputPath: string, frameRate: number, frameRange: ExportFrameRange) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");
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
    "-frames:v",
    String(frameRange.endFrame - frameRange.startFrame),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-vf",
    "scale=in_range=pc:out_range=pc:out_color_matrix=bt709,format=yuv420p",
    "-profile:v",
    "baseline",
    "-level",
    "4.0",
    "-color_range",
    "pc",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-g",
    String(frameRange.endFrame - frameRange.startFrame),
    "-keyint_min",
    String(frameRange.endFrame - frameRange.startFrame),
    "-sc_threshold",
    "0",
    "-movflags",
    "+frag_keyframe+empty_moov+default_base_moof",
    "-avoid_negative_ts",
    "make_zero",
    outputPath,
  ]);
  activePreviewVideoEncoders.add(ffmpeg);
  let stderr = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });
  const closePromise = new Promise<string | null>((resolve) => {
    ffmpeg.once("error", (spawnError) => resolve(spawnError.message));
    ffmpeg.once("close", (code) => resolve(code === 0 ? null : stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`));
  });
  try {
    for (let frameIndex = frameRange.startFrame; frameIndex < frameRange.endFrame; frameIndex += 1) {
      const frameBuffer = await fs.readFile(getSupervisedFrameOutputPath(inputFrameOutputPath, frameIndex));
      await writeProcessInput(ffmpeg, frameBuffer);
    }
    ffmpeg.stdin.end();
    const error = await closePromise;
    if (error) throw new Error(error);
  } catch (error) {
    if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
    await waitForProcessClose(closePromise, () => ffmpeg.kill("SIGKILL"), exportProcessStopTimeoutMs);
    if (appShuttingDown) return;
    throw error;
  } finally {
    activePreviewVideoEncoders.delete(ffmpeg);
  }
}

async function renderPrerenderBlock(
  project: ProjectManifest,
  manifestPath: string,
  scene: Scene,
  durationSeconds: number,
  frameRate: number,
  tileHeight: number,
  frameRange: ExportFrameRange,
  cacheKey: string,
  logPrefix: string,
) {
  const tempDir = path.join(getProjectCacheDirectory(manifestPath), ".tmp", `prerender-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const rendererResult = await renderSupervisedFrameRangeChild(
      project,
      manifestPath,
      scene,
      tempDir,
      frameRate,
      durationSeconds,
      frameRange.endFrame,
      tileHeight,
      "app-supervised",
      undefined,
      undefined,
      frameRange,
    );
    const frameCount = await countContiguousSupervisedFrameFiles(rendererResult.outputPath, frameRange);
    if (frameCount !== frameRange.endFrame - frameRange.startFrame)
      throw new Error(`Prerender cache block produced ${frameCount} frame(s); expected ${frameRange.endFrame - frameRange.startFrame}.`);
    for (let frameIndex = frameRange.startFrame; frameIndex < frameRange.endFrame; frameIndex += 1) {
      const frame = await fs.readFile(getSupervisedFrameOutputPath(rendererResult.outputPath, frameIndex));
      await writePrerenderFrame(getPrerenderCachePaths(manifestPath, scene, frameRate, frameIndex), frame, cacheKey, frameIndex / frameRate, frameRate);
    }
    await removeSupervisedFrameOutputs(rendererResult.outputPath, frameRange).catch(() => undefined);
    console.log(`${logPrefix} cached-block start=${frameRange.startFrame} end=${frameRange.endFrame}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writePrerenderFramesFromSupervisedOutput(manifestPath: string, project: ProjectManifest, scene: Scene, outputPath: string, frameRate: number, frameRange: ExportFrameRange, tileHeight: number, blockDurationMs: number) {
  const cacheKey = getPrerenderCacheKey(project, scene, frameRate, tileHeight, blockDurationMs);
  for (let frameIndex = frameRange.startFrame; frameIndex < frameRange.endFrame; frameIndex += 1) {
    const frame = await fs.readFile(getSupervisedFrameOutputPath(outputPath, frameIndex));
    await writePrerenderFrame(getPrerenderCachePaths(manifestPath, scene, frameRate, frameIndex), frame, cacheKey, frameIndex / frameRate, frameRate);
  }
}

async function readPrerenderFrame(cachePaths: PrerenderCachePaths, cacheKey: string, sceneTime: number, frameRate: number): Promise<PrerenderedFrame | null> {
  const frame = await readPrerenderFrameBufferFromPaths(cachePaths, cacheKey, sceneTime, frameRate);
  if (!frame) return null;
  return { width: frameWidth, height: frameHeight, pixelFormat: "bgra", sceneTime, frameRate, data: frame.toString("base64") };
}

async function readPrerenderFrameBufferFromPaths(cachePaths: PrerenderCachePaths, cacheKey: string, sceneTime: number, frameRate: number) {
  const manifest = await readPrerenderManifest(cachePaths.manifestPath);
  if (!isPrerenderManifestCurrent(manifest, cacheKey, sceneTime, frameRate)) return null;
  const frame = await fs.readFile(cachePaths.framePath).catch(() => null);
  if (!frame || frame.length !== frameWidth * frameHeight * 4) return null;
  return frame;
}

async function readPrerenderManifest(manifestPath: string) {
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8")) as PrerenderCacheManifest;
  } catch {
    return null;
  }
}

async function readPrerenderVideoManifest(manifestPath: string) {
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8")) as PrerenderVideoCacheManifest;
  } catch {
    return null;
  }
}

function isPrerenderManifestCurrent(manifest: PrerenderCacheManifest | null, cacheKey: string, sceneTime: number, frameRate: number) {
  return Boolean(
    manifest &&
    manifest.cacheKey === cacheKey &&
    manifest.width === frameWidth &&
    manifest.height === frameHeight &&
    manifest.frameRate === frameRate &&
    Math.abs(manifest.sceneTime - sceneTime) <= 1 / frameRate / 2,
  );
}

function isPrerenderVideoManifestCurrent(manifest: PrerenderVideoCacheManifest | null, cacheKey: string, frameRange: ExportFrameRange, frameRate: number) {
  return Boolean(
    manifest &&
    manifest.cacheKey === cacheKey &&
    manifest.width === frameWidth &&
    manifest.height === frameHeight &&
    manifest.mimeType === prerenderVideoBlockMimeType &&
    manifest.codecVersion === prerenderVideoBlockCodecVersion &&
    manifest.frameRate === frameRate &&
    manifest.startFrame === frameRange.startFrame &&
    manifest.endFrame === frameRange.endFrame,
  );
}

async function writePrerenderFrame(cachePaths: PrerenderCachePaths, frame: Buffer, cacheKey: string, sceneTime: number, frameRate: number) {
  await fs.mkdir(cachePaths.directory, { recursive: true });
  const tempFramePath = `${cachePaths.framePath}.tmp-${process.pid}`;
  const tempManifestPath = `${cachePaths.manifestPath}.tmp-${process.pid}`;
  const manifest: NonNullable<PrerenderCacheManifest> = {
    cacheKey,
    width: frameWidth,
    height: frameHeight,
    pixelFormat: "bgra",
    sceneTime,
    frameRate,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(tempFramePath, frame);
  await fs.writeFile(tempManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(tempFramePath, cachePaths.framePath);
  await fs.rename(tempManifestPath, cachePaths.manifestPath);
}

async function writePrerenderVideoBlock(cachePaths: PrerenderVideoBlockCachePaths, tempVideoPath: string, cacheKey: string, frameRange: ExportFrameRange, frameRate: number) {
  await fs.mkdir(cachePaths.directory, { recursive: true });
  const tempCacheVideoPath = `${cachePaths.videoPath}.tmp-${process.pid}`;
  const tempManifestPath = `${cachePaths.manifestPath}.tmp-${process.pid}`;
  const manifest: NonNullable<PrerenderVideoCacheManifest> = {
    cacheKey,
    width: frameWidth,
    height: frameHeight,
    mimeType: prerenderVideoBlockMimeType,
    codecVersion: prerenderVideoBlockCodecVersion,
    startFrame: frameRange.startFrame,
    endFrame: frameRange.endFrame,
    frameRate,
    updatedAt: new Date().toISOString(),
  };
  await fs.copyFile(tempVideoPath, tempCacheVideoPath);
  await fs.writeFile(tempManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(tempCacheVideoPath, cachePaths.videoPath);
  await fs.rename(tempManifestPath, cachePaths.manifestPath);
}

async function countContiguousSupervisedFrameFiles(
  outputPath: string,
  frameRange: ExportFrameRange,
) {
  let count = 0;
  for (
    let frameIndex = frameRange.startFrame;
    frameIndex < frameRange.endFrame;
    frameIndex += 1
  ) {
    const stat = await fs
      .stat(getSupervisedFrameOutputPath(outputPath, frameIndex))
      .catch(() => null);
    if (!stat || stat.size !== frameWidth * frameHeight * 4) break;
    count += 1;
  }
  return count;
}

async function removeSupervisedFrameOutputs(
  outputPath: string,
  frameRange: ExportFrameRange,
) {
  await fs.rm(outputPath, { force: true }).catch(() => undefined);
  for (
    let frameIndex = frameRange.startFrame;
    frameIndex < frameRange.endFrame;
    frameIndex += 1
  ) {
    await fs
      .rm(getSupervisedFrameOutputPath(outputPath, frameIndex), {
        force: true,
      })
      .catch(() => undefined);
  }
}

function getElectronChildArgs(args: string[], electronArgs: string[] = []) {
  if (app.isPackaged) return [...electronArgs, ...args];
  return [...electronArgs, path.resolve(__dirname, ".."), ...args];
}

async function renderSceneToRawFrames(
  payload: SupervisedRenderPayload,
  onFrameCaptured?: (frameIndex: number) => void,
  shouldStop?: () => boolean,
) {
  const rendererWindow = createExportRendererWindow(payload.renderSurface);

  const oomWarningState = createExportOomWarningState();
  try {
    rendererWindow.webContents.setZoomFactor(1);
    rendererWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    await loadRenderedMediaExportWindow(rendererWindow);
    oomWarningState.activePath = "renderer";
    const removeOomWarningListener = watchExportOutOfMemoryWarnings(
      rendererWindow,
      oomWarningState,
    );
    const removeNativeStderrWarningListener =
      watchExportNativeStderrWarnings(oomWarningState);
    try {
      for (
        let frameIndex = payload.frameRange.startFrame;
        frameIndex < payload.frameRange.endFrame;
        frameIndex += 1
      ) {
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.totalWarnings > 0,
            nativeWarningCount: oomWarningState.totalWarnings,
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
            nativeWarningDetected: oomWarningState.totalWarnings > 0,
            nativeWarningCount: oomWarningState.totalWarnings,
          };
        if (syncResult.failedCount > 0) {
          throw new Error(
            `Supervised renderer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`,
          );
        }
        const frame = await captureTiledExportFrame(
          rendererWindow,
          frameIndex,
          sceneTime,
          payload.tileHeight,
        );
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.totalWarnings > 0,
            nativeWarningCount: oomWarningState.totalWarnings,
          };
        await writeSupervisedFrameOutput(payload.outputPath, frameIndex, frame);
        console.log(`[clipper export-frame] frame=${frameIndex + 1}`);
        onFrameCaptured?.(frameIndex);
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.totalWarnings > 0,
            nativeWarningCount: oomWarningState.totalWarnings,
          };
      }
    } finally {
      removeOomWarningListener();
      removeNativeStderrWarningListener();
    }
  } finally {
    rendererWindow.destroy();
  }

  const frameCount = await countContiguousSupervisedFrameFiles(
    payload.outputPath,
    payload.frameRange,
  );
  if (frameCount !== payload.frameRange.endFrame - payload.frameRange.startFrame) {
    throw new Error(
      `Supervised export child produced ${frameCount} frame file(s); expected ${payload.frameRange.endFrame - payload.frameRange.startFrame}.`,
    );
  }
  return {
    nativeWarningDetected: oomWarningState.totalWarnings > 0,
    nativeWarningCount: oomWarningState.totalWarnings,
  };
}

function createExportRendererWindow(renderSurface: SupervisedRenderPayload["renderSurface"] = "export") {
  const previewCacheMode = renderSurface === "preview-cache";
  return new BrowserWindow({
    width: frameWidth,
    height: frameHeight,
    useContentSize: true,
    show: false,
    focusable: false,
    frame: false,
    skipTaskbar: true,
    backgroundColor: previewCacheMode ? "#00000000" : "#000000",
    transparent: previewCacheMode,
    title: "Clipper Renderer",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1,
    },
  });
}

async function writeSupervisedFrameOutput(
  outputPath: string,
  frameIndex: number,
  frame: Buffer,
) {
  const framePath = getSupervisedFrameOutputPath(outputPath, frameIndex);
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
  renderMode: "preview" | "export" = "export",
) {
  return withTimeout<RenderClockReadinessResult>(
    window.webContents.executeJavaScript(
      `window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate, renderMode })})`,
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

function createExportOomWarningState(): ExportOomWarningState {
  return {
    activePath: "renderer",
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
  if (options.log !== false)
    console.warn(
      `[clipper export] native-oom-warning source=${source} path=${state.activePath}: ${message.trim()}`,
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
  tileHeight: number,
) {
  await applyDefaultExportCaptureViewport(window);
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  for (const tile of getExportCaptureTiles(tileHeight)) {
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

function getExportCaptureTiles(tileHeight: number) {
  const exportTileHeight = clampExportTileHeight(tileHeight);
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += exportTileHeight) {
    tiles.push({
      x: 0,
      y,
      width: frameWidth,
      height: Math.min(exportTileHeight, frameHeight - y),
    });
  }
  return tiles;
}

function clampExportTileHeight(value: number) {
  if (!Number.isFinite(value)) return defaultExportTileHeight;
  return Math.min(Math.max(Math.round(value), 1), frameHeight);
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

type VideoExportMethod = "renderer";
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
type RenderSceneToVideoOptions = {
  source?: ExportSource;
  exportId?: string;
  tileHeight?: number;
  reusePrerenderCache?: boolean;
  onProgress?: (progress: VideoExportProgress) => void;
};
type ExportFrameRange = {
  startFrame: number;
  endFrame: number;
};
type ExportOomWarningState = {
  activePath: "renderer";
  totalWarnings: number;
};
type SupervisedRenderPayload = {
  project: ProjectManifest;
  manifestPath: string;
  scene: Scene;
  frameRate: number;
  durationSeconds: number;
  frameRange: ExportFrameRange;
  outputPath: string;
  tileHeight: number;
  source: ExportSource;
  renderSurface?: "export" | "preview-cache";
};
type SupervisedRenderResult = {
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
type PrerenderedFrame = {
  width: number;
  height: number;
  pixelFormat: "bgra";
  sceneTime: number;
  frameRate: number;
  data: string;
};
type PrerenderedVideoBlock = {
  width: number;
  height: number;
  mimeType: string;
  startTime: number;
  duration: number;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  data: string;
};
type PrerenderCachePaths = {
  directory: string;
  framePath: string;
  manifestPath: string;
};
type PrerenderVideoBlockCachePaths = {
  directory: string;
  videoPath: string;
  manifestPath: string;
};
type PrerenderCacheManifest = {
  cacheKey: string;
  width: number;
  height: number;
  pixelFormat: "bgra";
  sceneTime: number;
  frameRate: number;
  updatedAt: string;
} | null;
type PrerenderVideoCacheManifest = {
  cacheKey: string;
  width: number;
  height: number;
  mimeType: string;
  codecVersion?: number;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  updatedAt: string;
} | null;
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
  if (isRenderVideoChildProcess) {
    const payloadPath = process.argv[renderVideoChildArgIndex + 1];
    if (!payloadPath)
      throw new Error(
        "Usage: electron . --render-video-child <payload.json>",
      );
    let childRenderCancelled = false;
    const cancelChildRender = () => {
      childRenderCancelled = true;
      setImmediate(() => app.quit());
    };
    process.once("SIGTERM", cancelChildRender);
    process.once("SIGINT", cancelChildRender);
    process.on("message", (message) => {
      if (!isExportChildStopMessage(message)) return;
      cancelChildRender();
    });
    const payload = JSON.parse(
      await fs.readFile(payloadPath, "utf8"),
    ) as SupervisedRenderPayload;
    if (childRenderCancelled) return true;
    try {
      await renderSceneToRawFrames(
        payload,
        undefined,
        () => childRenderCancelled,
      );
    } catch (error) {
      if (childRenderCancelled) return true;
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

function requestAllActiveRendersStop() {
  appShuttingDown = true;
  for (const cancelSet of activeVideoRenderControllers.values()) {
    for (const cancel of cancelSet) cancel();
  }
  for (const stop of activeSupervisedRenderStops) stop();
  for (const encoder of activePreviewVideoEncoders) {
    if (!encoder.killed) encoder.kill("SIGTERM");
  }
}

function installShutdownHandlers() {
  app.on("before-quit", requestAllActiveRendersStop);
  process.once("SIGTERM", () => {
    requestAllActiveRendersStop();
    app.quit();
  });
  process.once("SIGINT", () => {
    requestAllActiveRendersStop();
    app.quit();
  });
}

installShutdownHandlers();

app.whenReady().then(async () => {
  if (await renderVideoFromCommand()) {
    app.quit();
    return;
  }

  installAppMenu();

  await createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
