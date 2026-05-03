import { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, type NativeImage } from "electron";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
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
const videoExportSessions = new Map<string, { process: ChildProcessWithoutNullStreams; outputPath: string; closePromise: Promise<string | null> }>();
const cancelledVideoRenders = new Set<string>();
const textFileWatchers = new Map<number, FSWatcher[]>();
const appStatePath = "clipper/app-state.json";
const appIconPath = path.resolve(__dirname, "../build/icons/icon.png");
const frameWidth = 1920;
const frameHeight = 1080;
const exportRendererFrameTimeoutMs = 8000;
const exportCaptureStripCount = 4;
const exportCaptureTileRetries = 3;
const exportCaptureTileTimeoutMs = 4000;
let hardwareEncoderSupport: Set<string> | null = null;
let systemFontFamilies: string[] | null = null;

configureChromiumForStableExports();

function configureChromiumForStableExports() {
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-partial-raster");
  app.commandLine.appendSwitch("force-device-scale-factor", "1");
  app.commandLine.appendSwitch("num-raster-threads", "4");
  app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
}

async function readAppState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(resolveClipperFile(appStatePath), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeAppState(updates: Record<string, unknown>) {
  const state = await readAppState();
  const merged = { ...state, ...updates };
  await fs.mkdir(path.dirname(resolveClipperFile(appStatePath)), { recursive: true });
  await fs.writeFile(resolveClipperFile(appStatePath), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

async function writeWindowBounds(window: BrowserWindow) {
  await writeAppState({ windowBounds: window.getBounds() as unknown as Record<string, unknown> });
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

async function findFileByName(directoryPath: string, fileName: string): Promise<string | null> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const normalizedFileName = fileName.toLocaleLowerCase();
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isFile() && entry.name.toLocaleLowerCase() === normalizedFileName) return entryPath;
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

  const output = await readCommandOutput("/usr/sbin/system_profiler", ["SPFontsDataType", "-json"]);

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
    systemFontFamilies = [...families].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
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

  const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const encoder of ["h264_videotoolbox", "hevc_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf", "h264_vaapi"]) {
    if (output.includes(encoder)) hardwareEncoderSupport.add(encoder);
  }

  return hardwareEncoderSupport;
}

function getVideoEncoderArgs() {
  const supportedEncoders = getSupportedHardwareEncoders();

  if (process.platform === "darwin" && supportedEncoders.has("h264_videotoolbox")) {
    return {
      label: "VideoToolbox",
      args: ["-c:v", "h264_videotoolbox", "-b:v", "12M", "-allow_sw", "0", "-pix_fmt", "yuv420p"],
    };
  }

  return {
    label: "x264",
    args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"],
  };
}

function resolveClipperFile(relativePath: string) {
  const appRoot = path.resolve(__dirname, "..");
  const resolved = path.resolve(appRoot, relativePath);
  const clipperRoot = path.join(appRoot, "clipper");

  if (resolved !== clipperRoot && !resolved.startsWith(`${clipperRoot}${path.sep}`)) {
    throw new Error("Clipper file access is restricted to the clipper directory.");
  }

  return resolved;
}

function getClipperRelativePath(filePath: string) {
  const appRoot = path.resolve(__dirname, "..");
  const clipperRoot = path.join(appRoot, "clipper");
  const resolved = path.resolve(filePath);

  if (resolved !== clipperRoot && !resolved.startsWith(`${clipperRoot}${path.sep}`)) {
    throw new Error("Project files must be inside the clipper directory.");
  }

  return path.relative(appRoot, resolved).split(path.sep).join("/");
}

ipcMain.handle("clipper:read-text-file", async (_event, relativePath: string) => {
  return fs.readFile(resolveClipperFile(relativePath), "utf8");
});

ipcMain.handle("clipper:read-binary-file", async (_event, relativePath: string) => {
  return (await fs.readFile(resolveClipperFile(relativePath))).toString("base64");
});

ipcMain.handle("clipper:write-text-file", async (_event, relativePath: string, content: string) => {
  const filePath = resolveClipperFile(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
});

ipcMain.handle("clipper:write-binary-file", async (_event, relativePath: string, base64Content: string) => {
  const filePath = resolveClipperFile(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(base64Content, "base64"));
});

ipcMain.handle("clipper:create-directory", async (_event, relativePath: string) => {
  await fs.mkdir(resolveClipperFile(relativePath), { recursive: true });
});

ipcMain.handle("clipper:reveal-file", async (_event, relativePath: string) => {
  shell.showItemInFolder(resolveClipperFile(relativePath));
});

ipcMain.handle("clipper:reveal-absolute-path", async (_event, filePath: string) => {
  shell.showItemInFolder(path.resolve(filePath));
});

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

ipcMain.handle("clipper:rename-file", async (_event, relativePath: string, nextRelativePath: string) => {
  await fs.rename(resolveClipperFile(relativePath), resolveClipperFile(nextRelativePath));
});

ipcMain.handle("clipper:copy-file", async (_event, relativePath: string, nextRelativePath: string) => {
  const source = resolveClipperFile(relativePath);
  const target = resolveClipperFile(nextRelativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
});

ipcMain.handle("clipper:list-directory", async (_event, relativePath: string) => {
  try {
    const entries = await fs.readdir(resolveClipperFile(relativePath), { withFileTypes: true });
    return entries.sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  } catch {
    return [];
  }
});

ipcMain.handle("clipper:find-project-file-by-name", async (_event, directoryPath: string, fileName: string) => {
  const matchedPath = await findFileByName(resolveClipperFile(directoryPath), fileName);
  return matchedPath ? getClipperRelativePath(matchedPath) : null;
});

ipcMain.handle("clipper:open-composition-file", async (_event, directoryPath: string) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select composition file",
    defaultPath: resolveClipperFile(directoryPath),
    properties: ["openFile"],
    filters: [{ name: "Composition Source", extensions: ["ts", "tsx", "js", "jsx"] }],
  });

  if (canceled || !filePaths[0]) return null;
  return getClipperRelativePath(filePaths[0]);
});

ipcMain.handle("clipper:list-system-fonts", async () => {
  return listSystemFontFamilies();
});

ipcMain.handle("clipper:set-window-fullscreen", (event, fullscreen: boolean) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(fullscreen);
  return window.isFullScreen();
});

ipcMain.handle("clipper:toggle-window-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});

ipcMain.handle("clipper:watch-text-files", (event, relativePaths: string[]) => {
  const senderId = event.sender.id;
  textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

  const watchedPaths = [...new Set(relativePaths)].filter((relativePath) => relativePath.startsWith("clipper/"));
  const watchers = watchedPaths.flatMap((relativePath) => {
    try {
      const resolvedPath = resolveClipperFile(relativePath);
      const watcher = watch(resolvedPath, { persistent: false }, () => {
        if (!event.sender.isDestroyed()) event.sender.send("clipper:text-file-changed", relativePath);
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

ipcMain.handle("clipper:watch-project-files", (event, watchPaths: ProjectWatchPaths) => {
  const senderId = event.sender.id;
  textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

  const watchedFiles = [...new Set(watchPaths.files)].filter((relativePath) => relativePath.startsWith("clipper/"));
  const watchedDirectories = [...new Set(watchPaths.directories)].filter((relativePath) => relativePath.startsWith("clipper/"));
  const fileWatchers = watchedFiles.flatMap((relativePath) => {
    try {
      const resolvedPath = resolveClipperFile(relativePath);
      const watcher = watch(resolvedPath, { persistent: false }, () => {
        if (!event.sender.isDestroyed()) event.sender.send("clipper:project-file-changed", relativePath);
      });
      return [watcher];
    } catch {
      return [];
    }
  });
  const directoryWatchers = watchedDirectories.flatMap((relativePath) => {
    try {
      const resolvedPath = resolveClipperFile(relativePath);
      const watcher = watch(resolvedPath, { persistent: false, recursive: true }, (_eventType, fileName) => {
        try {
          const changedPath = fileName ? getClipperRelativePath(path.join(resolvedPath, fileName.toString())) : relativePath;
          if (!event.sender.isDestroyed()) event.sender.send("clipper:project-file-changed", changedPath);
        } catch {
          if (!event.sender.isDestroyed()) event.sender.send("clipper:project-file-changed", relativePath);
        }
      });
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
});

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
  if (/[\x00-\x1F]/.test(name)) return "Name cannot contain control characters.";
  if (/[<>:"\/\\|?*]/.test(name)) return 'Name cannot contain < > : " / \\ | ? *';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(name)) return `"${name}" is a reserved system name.`;
  if (name.endsWith(".")) return "Name cannot end with a dot.";
  return null;
}

ipcMain.handle("clipper:create-project", async (_event, projectName: string) => {
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
});

ipcMain.handle("clipper:export-project-dialog", async (_event, defaultFileName: string) => {
  const appRoot = path.resolve(__dirname, "..");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export as .clipper",
    defaultPath: path.join(appRoot, "clipper", "projects", defaultFileName),
    filters: [{ name: "Clipper Project", extensions: ["clipper"] }],
  });

  if (canceled || !filePath) return null;
  return getClipperRelativePath(filePath);
});

ipcMain.handle("clipper:export-media-file", async (_event, defaultFileName: string, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export media",
    defaultPath: defaultFileName,
    filters: [{ name: "Clipper Media Package", extensions: ["json"] }],
  });

  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, content, "utf8");
  return filePath;
});

ipcMain.handle("clipper:export-binary-file", async (_event, defaultFileName: string, base64Content: string) => {
  const extension = path.extname(defaultFileName).replace(/^\./, "") || "bin";
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export media",
    defaultPath: defaultFileName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });

  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, Buffer.from(base64Content, "base64"));
  return filePath;
});

ipcMain.handle("clipper:start-video-export", async (_event, defaultFileName: string, frameRate: number, width: number, height: number) => {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export video",
    defaultPath: defaultFileName,
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (canceled || !filePath) return null;

  const sessionId = randomUUID();
  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(frameRate),
    "-i", "-",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
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
      else resolve(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`);
    });
  });

  videoExportSessions.set(sessionId, { process: ffmpeg, outputPath: filePath, closePromise });
  return { sessionId, filePath };
});

ipcMain.handle("clipper:write-video-frame", async (_event, sessionId: string, frameData: Uint8Array) => {
  const session = videoExportSessions.get(sessionId);
  if (!session) throw new Error("Video export session is not active.");

  const frame = Buffer.from(frameData);
  if (session.process.stdin.write(frame)) return;

  await new Promise<void>((resolve, reject) => {
    session.process.stdin.once("drain", resolve);
    session.process.stdin.once("error", reject);
  });
});

ipcMain.handle("clipper:finish-video-export", async (_event, sessionId: string) => {
  const session = videoExportSessions.get(sessionId);
  if (!session) throw new Error("Video export session is not active.");

  session.process.stdin.end();
  const error = await session.closePromise;
  if (error) throw new Error(error);
  return session.outputPath;
});

ipcMain.handle("clipper:cancel-video-export", async (_event, sessionId: string) => {
  const session = videoExportSessions.get(sessionId);
  if (!session) return;

  videoExportSessions.delete(sessionId);
  session.process.kill("SIGTERM");
});

ipcMain.handle("clipper:render-video-export", async (event, exportId: string, defaultFileName: string, project: ProjectManifest, scene: Scene, frameRate: number, durationSeconds: number) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export video",
    defaultPath: defaultFileName,
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (canceled || !filePath) return null;
  cancelledVideoRenders.delete(exportId);
  await renderSceneToVideo(project, scene, filePath, frameRate, durationSeconds, exportId, (progress) => event.sender.send("clipper:video-export-progress", exportId, progress));
  cancelledVideoRenders.delete(exportId);
  shell.showItemInFolder(filePath);
  return filePath;
});

ipcMain.handle("clipper:cancel-render-video-export", async (_event, exportId: string) => {
  cancelledVideoRenders.add(exportId);
});

async function renderSceneToVideo(_project: ProjectManifest, scene: Scene, outputPath: string, frameRate: number, durationSeconds: number, exportId?: string, onProgress?: (progress: VideoExportProgress) => void) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const encoder = getVideoEncoderArgs();
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  onProgress?.({ frame: 0, totalFrames, percent: 0, status: `Preparing ${encoder.label} export...` });
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

  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "bgra",
    "-s", `${frameWidth}x${frameHeight}`,
    "-framerate", String(frameRate),
    "-i", "-",
    "-an",
    ...encoder.args,
    "-movflags", "+faststart",
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
      else resolve(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`);
    });
  });

  try {
    rendererWindow.webContents.setZoomFactor(1);
    rendererWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    await loadRenderedMediaExportWindow(rendererWindow);
    let pendingFrameWrite: Promise<void> | null = null;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (exportId && cancelledVideoRenders.has(exportId)) throw new Error("Video export cancelled.");
      const sceneTime = Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
      const syncResult = await renderExportFrame(rendererWindow, _project, scene, sceneTime, frameRate);
      if (syncResult.failedCount > 0) {
        throw new Error(`Export renderer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`);
      }
      const frameBitmap = await captureTiledExportFrame(rendererWindow, frameIndex, sceneTime);
      if (pendingFrameWrite) await pendingFrameWrite;
      pendingFrameWrite = writeProcessInput(ffmpeg, frameBitmap);
      onProgress?.({ frame: frameIndex + 1, totalFrames, percent: Math.round(((frameIndex + 1) / totalFrames) * 100), status: `Rendering frame ${frameIndex + 1} of ${totalFrames} with ${encoder.label}` });
    }

    if (pendingFrameWrite) await pendingFrameWrite;
    if (exportId && cancelledVideoRenders.has(exportId)) throw new Error("Video export cancelled.");
  } catch (error) {
    ffmpeg.kill("SIGTERM");
    if (exportId) cancelledVideoRenders.delete(exportId);
    if (error instanceof Error && error.message === "Video export cancelled.") {
      await fs.rm(outputPath, { force: true });
    }
    throw error;
  } finally {
    rendererWindow.destroy();
  }

  ffmpeg.stdin.end();
  const error = await closePromise;
  if (error) throw new Error(error);
  onProgress?.({ frame: totalFrames, totalFrames, percent: 100, status: "Finalizing video..." });
}

async function loadRenderedMediaExportWindow(window: BrowserWindow) {
  if (isDev) {
    const baseUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
    await window.loadURL(`${baseUrl}?clipperExport=1`);
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"), { query: { clipperExport: "1" } });
}

async function renderExportFrame(window: BrowserWindow, project: ProjectManifest, scene: Scene, sceneTime: number, frameRate: number) {
  return withTimeout<RenderClockReadinessResult>(
    window.webContents.executeJavaScript(`window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate })})`, true),
    exportRendererFrameTimeoutMs,
    `Timed out waiting ${exportRendererFrameTimeoutMs}ms for export renderer frame at ${sceneTime.toFixed(3)}s.`,
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timeout);
      resolve(value);
    }, (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function captureTiledExportFrame(window: BrowserWindow, frameIndex: number, sceneTime: number) {
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  for (const tile of getExportCaptureTiles()) {
    const tileBitmap = await captureExportTileWithRetries(window, tile, frameIndex, sceneTime);
    stitchBgraTile(frame, tileBitmap, tile);
  }
  return frame;
}

function getExportCaptureTiles() {
  const tileHeight = Math.ceil(frameHeight / exportCaptureStripCount);
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += tileHeight) {
    tiles.push({ x: 0, y, width: frameWidth, height: Math.min(tileHeight, frameHeight - y) });
  }
  return tiles;
}

async function captureExportTileWithRetries(window: BrowserWindow, tile: ExportCaptureTile, frameIndex: number, sceneTime: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= exportCaptureTileRetries; attempt += 1) {
    try {
      const image = await withTimeout(
        window.webContents.capturePage(tile),
        exportCaptureTileTimeoutMs,
        `Timed out capturing export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height} at ${sceneTime.toFixed(3)}s.`,
      );
      return getBgraBitmap(image, tile.width, tile.height, `export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height}`);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to capture export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height} at ${sceneTime.toFixed(3)}s after ${exportCaptureTileRetries} attempt(s): ${message}`);
}

function stitchBgraTile(frame: Buffer, tileBitmap: Buffer, tile: ExportCaptureTile) {
  const bytesPerPixel = 4;
  const sourceStride = tile.width * bytesPerPixel;
  const targetStride = frameWidth * bytesPerPixel;
  for (let row = 0; row < tile.height; row += 1) {
    tileBitmap.copy(frame, (tile.y + row) * targetStride + tile.x * bytesPerPixel, row * sourceStride, (row + 1) * sourceStride);
  }
}

function getBgraBitmap(image: NativeImage, width: number, height: number, context: string) {
  const expectedLength = width * height * 4;
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  if (bitmap.byteLength === expectedLength) return bitmap;

  const resizedBitmap = image.resize({ width, height, quality: "best" }).toBitmap({ scaleFactor: 1 });
  if (resizedBitmap.byteLength === expectedLength) return resizedBitmap;

  const imageSize = image.getSize();
  throw new Error(`Captured ${context} bitmap length was ${resizedBitmap.byteLength}; image size was ${imageSize.width}x${imageSize.height}, expected ${width}x${height}.`);
}

async function writeProcessInput(process: ChildProcessWithoutNullStreams, chunk: Buffer) {
  if (process.stdin.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    process.stdin.once("drain", resolve);
    process.stdin.once("error", reject);
  });
}

type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string };
type RenderClockReadinessResult = { animationCount: number; pinnedCount: number; failedCount: number; pendingReadyCount: number; passCount: number; layerCount: number };
type ExportCaptureTile = { x: number; y: number; width: number; height: number };
type MotionMarker = { start: number; duration: number };
type AdjustmentLayer = { id: string; name: string; start: number; duration: number; effect: { kind?: "frameSkip"; every?: number; effectId?: string; params?: Record<string, unknown> } };
type TransitionLayer = { id: string; name: string; start: number; duration: number; midPoint: number; effect: { effectId?: string; params?: Record<string, unknown> } };
type CompositionClip = { start?: number; duration: number; motionMarkers?: MotionMarker[] };
type Scene = { id: string; name: string; compositions: CompositionClip[]; adjustmentLayers?: AdjustmentLayer[]; motionMarkers?: MotionMarker[]; transitionLayers?: TransitionLayer[] };
type ProjectManifest = { id: string; name: string; resolution: { width: number; height: number }; scenes: Scene[]; assetsPath: string; editorState?: unknown };
type TimelinePart = CompositionClip & { start: number; end: number };

function getSceneDuration(scene: Scene) {
  const timeline = buildLinearTimeline(scene);
  return Math.max(
    ...timeline.map((item) => item.end),
    ...(scene.adjustmentLayers ?? []).map((item) => item.start + item.duration),
    ...(scene.transitionLayers ?? []).map((item) => item.start + item.duration),
    ...(scene.motionMarkers ?? []).map((item) => item.start + item.duration),
    ...timeline.flatMap((item) => (item.motionMarkers ?? []).map((marker) => item.start + marker.start + marker.duration)),
    0,
  );
}

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
    const bounds = state.windowBounds as { x: number; y: number; width: number; height: number } | undefined;
    if (bounds && typeof bounds.x === "number" && typeof bounds.y === "number" && typeof bounds.width === "number" && typeof bounds.height === "number") {
      const displays = screen.getAllDisplays();
      const inAnyDisplay = displays.some((d) => {
        const b = d.workArea;
        return bounds.x < b.x + b.width && bounds.x + 40 > b.x && bounds.y < b.y + b.height && bounds.y + 40 > b.y;
      });
      if (inAnyDisplay) window.setBounds(bounds);
    }
  } catch { /* no saved bounds */ }

  window.on("close", (event) => {
    event.preventDefault();
    writeWindowBounds(window).catch(() => {}).finally(() => window.destroy());
  });

  window.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return String(permission) === "local-fonts";
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(String(permission) === "local-fonts");
  });

  window.on("enter-full-screen", () => window.webContents.send("clipper:window-fullscreen-changed", true));
  window.on("leave-full-screen", () => window.webContents.send("clipper:window-fullscreen-changed", false));

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
    await window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function installAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: "about" as const }, { type: "separator" as const }, { role: "services" as const }, { type: "separator" as const }, { role: "hide" as const }, { role: "hideOthers" as const }, { role: "unhide" as const }, { type: "separator" as const }, { role: "quit" as const }] }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          accelerator: "CommandOrControl+,",
          click: (_menuItem, browserWindow) => {
            if (browserWindow instanceof BrowserWindow) browserWindow.webContents.send("clipper:settings-shortcut");
          },
        },
        { type: "separator" },
        {
          label: "Export as .clipper",
          accelerator: "CommandOrControl+Shift+E",
          click: (_menuItem, browserWindow) => {
            if (browserWindow instanceof BrowserWindow) browserWindow.webContents.send("clipper:export-project");
          },
        },
        { type: "separator" },
        isMac ? { label: "Close Window", click: (_menuItem, browserWindow) => { browserWindow?.close(); } } : { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function renderVideoFromCommand() {
  const renderArgIndex = process.argv.indexOf("--render-video");
  if (renderArgIndex < 0) return false;

  const projectPath = process.argv[renderArgIndex + 1];
  const sceneId = process.argv[renderArgIndex + 2];
  const outputPathArg = process.argv[renderArgIndex + 3] ?? "clipper/exports/command-render.mp4";
  if (!projectPath || !sceneId) throw new Error("Usage: electron . --render-video <project.json> <scene-id> [output.mp4]");
  const appRoot = path.resolve(__dirname, "..");
  const resolvedProjectPath = path.resolve(appRoot, projectPath);
  const resolvedOutputPath = path.resolve(appRoot, outputPathArg);
  const project = JSON.parse(await fs.readFile(resolvedProjectPath, "utf8")) as ProjectManifest;
  const scene = project.scenes.find((item) => item.id === sceneId) ?? project.scenes[0];
  if (!scene) throw new Error(`Scene ${sceneId} was not found.`);

  await renderSceneToVideo(project, scene, resolvedOutputPath, 30, getSceneDuration(scene));
  console.log(`Rendered video to ${resolvedOutputPath}`);
  return true;
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
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
