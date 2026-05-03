import { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, type NativeImage } from "electron";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { scenePrefersTiledCapture } from "./exportSceneHeuristics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const cancelledVideoRenders = new Set<string>();
const textFileWatchers = new Map<number, FSWatcher[]>();
const appStatePath = "clipper/app-state.json";
const appIconPath = path.resolve(__dirname, "../build/icons/icon.png");
const frameWidth = 1920;
const frameHeight = 1080;
const exportRendererFrameTimeoutMs = 8000;
const exportCaptureTileHeights = [270, 135, 68, 34, 17] as const;
const exportCaptureTileRetries = 3;
const exportCaptureTileValidationSamples = 2;
const exportCaptureTileTimeoutMs = 4000;
const exportCaptureTileMaxDifferingPixelRatio = 0.0005;
const exportCaptureTileMaxAverageByteDelta = 0.025;
const exportFullFrameStableFramesForTrust = 4;
const exportFullFrameProbeAfterTiledStableFrames = 60;
const exportRendererWorkerCount = 2;
const exportRendererMaxWorkerCount = 10;
const exportRenderAheadFramesPerWorker = 2;
const deterministicExportMode = process.env.CLIPPER_EXPORT_DETERMINISTIC === "1";
const deterministicExportLevel = process.env.CLIPPER_EXPORT_DETERMINISTIC_LEVEL === "strict" ? "strict" : "minimal";
const allowNondeterministicTiledExport = process.env.CLIPPER_EXPORT_ALLOW_NONDETERMINISTIC_TILED === "1";
const traceVideoExport = process.env.CLIPPER_EXPORT_TRACE === "1";
const hashExportFrames = process.env.CLIPPER_EXPORT_FRAME_HASH === "1";
const exportCaptureTileCache = new Map<number, ExportCaptureTile[]>();
let hardwareEncoderSupport: Set<string> | null = null;
let systemFontFamilies: string[] | null = null;
let commandVideoRenderActive = false;

configureChromiumForStableExports();

function configureChromiumForStableExports() {
  if (deterministicExportMode && deterministicExportLevel === "strict") app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-partial-raster");
  app.commandLine.appendSwitch("force-device-scale-factor", "1");
  app.commandLine.appendSwitch("num-raster-threads", deterministicExportMode && deterministicExportLevel === "strict" ? "1" : "4");
  app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
  if (!deterministicExportMode) return;

  app.commandLine.appendSwitch("force-color-profile", "srgb");
  app.commandLine.appendSwitch("disable-skia-runtime-opts");
  if (deterministicExportLevel !== "strict") return;

  app.commandLine.appendSwitch("run-all-compositor-stages-before-draw");
  app.commandLine.appendSwitch("disable-new-content-rendering-timeout");
  app.commandLine.appendSwitch("disable-threaded-animation");
  app.commandLine.appendSwitch("disable-threaded-scrolling");
  app.commandLine.appendSwitch("disable-checker-imaging");
  app.commandLine.appendSwitch("disable-image-animation-resync");
  app.commandLine.appendSwitch("disable-gpu-rasterization");
  app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
  app.commandLine.appendSwitch("disable-zero-copy");
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

ipcMain.handle("clipper:render-video-export", async (event, exportId: string, defaultFileName: string, project: ProjectManifest, scene: Scene, frameRate: number, durationSeconds: number, workerCount?: number) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export video",
    defaultPath: defaultFileName,
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (canceled || !filePath) return null;
  cancelledVideoRenders.delete(exportId);
  try {
    await renderSceneToVideo(project, scene, filePath, frameRate, durationSeconds, exportId, (progress) => event.sender.send("clipper:video-export-progress", exportId, progress), workerCount);
    shell.showItemInFolder(filePath);
    return filePath;
  } finally {
    cancelledVideoRenders.delete(exportId);
  }
});

ipcMain.handle("clipper:cancel-render-video-export", async (_event, exportId: string) => {
  cancelledVideoRenders.add(exportId);
});

async function renderSceneToVideo(_project: ProjectManifest, scene: Scene, outputPath: string, frameRate: number, durationSeconds: number, exportId?: string, onProgress?: (progress: VideoExportProgress) => void, requestedWorkerCountInput?: number) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const encoder = getVideoEncoderArgs();
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  onProgress?.({ frame: 0, totalFrames, percent: 0, status: `Preparing ${encoder.label} export...` });

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

  const workers: ExportRendererWorker[] = [];
  let workerPromises: Promise<void>[] = [];
  let firstWorkerError: unknown = null;
  const startedAt = Date.now();
  const requestedWorkerCount = getExportRendererWorkerCount(requestedWorkerCountInput);
  const metrics = createExportMetrics(totalFrames, requestedWorkerCount);
  let metricsLogged = false;
  let notifyExportWaiters = () => {};
  const finalizeMetrics = (status: "completed" | "failed" | "cancelled") => {
    if (metricsLogged) return;
    metrics.totalElapsedMs = Date.now() - startedAt;
    logExportMetrics(metrics, status);
    metricsLogged = true;
  };
  try {
    const workerCount = Math.min(getEffectiveExportWorkerCount(scene, requestedWorkerCount), totalFrames);
    const maxBufferedFrames = Math.max(1, workerCount * exportRenderAheadFramesPerWorker);
    metrics.effectiveWorkers = workerCount;
    console.log(`[clipper export] Starting rendered video export: ${totalFrames} frame(s), ${frameRate} fps, ${durationSeconds.toFixed(3)}s, ${workerCount} renderer worker(s), ${encoder.label}.`);
    if (traceVideoExport) console.log(`[clipper export trace] Max render-ahead buffer: ${maxBufferedFrames} frame(s).`);
    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      const window = createExportRendererWindow();
      const captureState = createExportCaptureState(scene, metrics);
      const removeTileMemoryWarningListener = watchExportTileMemoryWarnings(window, captureState);
      workers.push({ window, captureState, removeTileMemoryWarningListener, metrics });
      window.webContents.setZoomFactor(1);
      window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
      if (traceVideoExport) console.log(`[clipper export trace] Worker ${workerIndex + 1}: loading renderer.`);
      await loadRenderedMediaExportWindow(window);
      if (traceVideoExport) console.log(`[clipper export trace] Worker ${workerIndex + 1}: ready.`);
    }

    let pendingFrameWrite: Promise<void> | null = null;
    let nextFrameToRender = 0;
    let nextFrameToWrite = 0;
    let wakeWriter: (() => void) | null = null;
    const renderCapacityWaiters = new Set<() => void>();
    const renderedFrames = new Map<number, Buffer>();
    const failExport = (error: unknown) => {
      if (!firstWorkerError) firstWorkerError = error;
      notifyWriter();
      notifyRenderCapacity();
    };
    const notifyWriter = () => {
      wakeWriter?.();
      wakeWriter = null;
    };
    const notifyRenderCapacity = () => {
      for (const resolve of renderCapacityWaiters) resolve();
      renderCapacityWaiters.clear();
    };
    notifyExportWaiters = () => {
      notifyWriter();
      notifyRenderCapacity();
    };
    const waitForRenderCapacity = () => {
      if (firstWorkerError || nextFrameToRender - nextFrameToWrite < maxBufferedFrames || nextFrameToRender >= totalFrames) return Promise.resolve();
      return new Promise<void>((resolve) => {
        renderCapacityWaiters.add(resolve);
      });
    };
    const takeNextFrameIndex = () => {
      if (firstWorkerError) return null;
      if (exportId && cancelledVideoRenders.has(exportId)) {
        failExport(new Error("Video export cancelled."));
        return null;
      }
      if (nextFrameToRender - nextFrameToWrite >= maxBufferedFrames) return "wait" as const;
      if (nextFrameToRender >= totalFrames) return null;
      const frameIndex = nextFrameToRender;
      nextFrameToRender += 1;
      metrics.framesScheduled = Math.max(metrics.framesScheduled, nextFrameToRender);
      metrics.maxRenderAheadDepth = Math.max(metrics.maxRenderAheadDepth, nextFrameToRender - nextFrameToWrite);
      return frameIndex;
    };

    workerPromises = workers.map(async (worker) => {
      while (!firstWorkerError) {
        const frameIndex = takeNextFrameIndex();
        if (frameIndex === "wait") {
          await waitForRenderCapacity();
          continue;
        }
        if (frameIndex === null) return;
        try {
          const renderedFrame = await renderExportFrameWithWorker(worker, _project, scene, frameIndex, frameRate, durationSeconds);
          renderedFrames.set(renderedFrame.frameIndex, renderedFrame.frameBitmap);
          metrics.framesCaptured += 1;
          metrics.maxOrderedBufferSize = Math.max(metrics.maxOrderedBufferSize, renderedFrames.size);
          notifyWriter();
        } catch (error) {
          failExport(error);
          return;
        }
      }
    });

    while (nextFrameToWrite < totalFrames) {
      if (exportId && cancelledVideoRenders.has(exportId) && !firstWorkerError) failExport(new Error("Video export cancelled."));
      if (firstWorkerError) throw firstWorkerError;

      const frameBitmap = renderedFrames.get(nextFrameToWrite);
      if (!frameBitmap) {
        await new Promise<void>((resolve) => {
          wakeWriter = resolve;
          if (firstWorkerError || renderedFrames.has(nextFrameToWrite)) notifyWriter();
        });
        continue;
      }

      renderedFrames.delete(nextFrameToWrite);
      if (pendingFrameWrite) await pendingFrameWrite;
      if (hashExportFrames) logExportFrameHash(nextFrameToWrite, frameBitmap);
      const writeStartedAt = Date.now();
      pendingFrameWrite = writeProcessInput(ffmpeg, frameBitmap).finally(() => {
        metrics.ffmpegWriteWaitMs += Date.now() - writeStartedAt;
      });
      pendingFrameWrite.catch(failExport);
      metrics.maxOrderedBufferSize = Math.max(metrics.maxOrderedBufferSize, renderedFrames.size);
      onProgress?.({ frame: nextFrameToWrite + 1, totalFrames, percent: Math.round(((nextFrameToWrite + 1) / totalFrames) * 100), status: `Rendering frame ${nextFrameToWrite + 1} of ${totalFrames} with ${encoder.label}` });
      nextFrameToWrite += 1;
      metrics.framesWritten = nextFrameToWrite;
      notifyWriter();
      notifyRenderCapacity();
    }

    await Promise.all(workerPromises);
    if (pendingFrameWrite) await pendingFrameWrite;
    if (exportId && cancelledVideoRenders.has(exportId)) throw new Error("Video export cancelled.");
  } catch (error) {
    if (!firstWorkerError) firstWorkerError = error;
    notifyExportWaiters();
    ffmpeg.kill("SIGTERM");
    destroyExportRendererWorkers(workers);
    finalizeMetrics(error instanceof Error && error.message === "Video export cancelled." ? "cancelled" : "failed");
    await Promise.allSettled(workerPromises);
    if (exportId) cancelledVideoRenders.delete(exportId);
    if (error instanceof Error && error.message === "Video export cancelled.") {
      await fs.rm(outputPath, { force: true });
    }
    throw error;
  } finally {
    destroyExportRendererWorkers(workers);
  }

  ffmpeg.stdin.end();
  const error = await closePromise;
  if (error) {
    finalizeMetrics("failed");
    throw new Error(error);
  }
  finalizeMetrics("completed");
  onProgress?.({ frame: totalFrames, totalFrames, percent: 100, status: "Finalizing video..." });
}

function getExportRendererWorkerCount(requestedWorkerCount?: number) {
  if (requestedWorkerCount !== undefined) return clampExportRendererWorkerCount(requestedWorkerCount);
  const raw = process.env.CLIPPER_EXPORT_WORKERS;
  if (!raw) return clampExportRendererWorkerCount(requestedWorkerCount ?? exportRendererWorkerCount);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return clampExportRendererWorkerCount(requestedWorkerCount ?? exportRendererWorkerCount);
  return clampExportRendererWorkerCount(parsed);
}

function clampExportRendererWorkerCount(workerCount: number) {
  return Math.min(Math.max(Math.round(workerCount), 1), exportRendererMaxWorkerCount);
}

function getEffectiveExportWorkerCount(scene: Scene, requestedWorkerCount: number) {
  if (requestedWorkerCount > 1 && scenePrefersTiledCapture(scene)) {
    console.log(`[clipper export] Using 1 renderer worker for heavy WebLayer/SVG scene to preserve deterministic raw frame output; requested ${requestedWorkerCount}.`);
    return 1;
  }
  return requestedWorkerCount;
}

function createExportMetrics(totalFrames: number, requestedWorkers: number): ExportMetrics {
  return {
    requestedWorkers,
    effectiveWorkers: 0,
    totalFrames,
    framesScheduled: 0,
    framesCaptured: 0,
    framesWritten: 0,
    totalElapsedMs: 0,
    renderJsPinMs: 0,
    fullFrameCaptureMs: 0,
    tiledCaptureMs: 0,
    validationMs: 0,
    stitchMs: 0,
    ffmpegWriteWaitMs: 0,
    maxOrderedBufferSize: 0,
    maxRenderAheadDepth: 0,
    tileHeightHistogram: {},
    fullFrameFallbackCount: 0,
    tileFallbackCount: 0,
    memoryWarningCount: 0,
  };
}

function logExportMetrics(metrics: ExportMetrics, status: "completed" | "failed" | "cancelled") {
  const seconds = metrics.totalElapsedMs / 1000;
  const tileHistogram = Object.entries(metrics.tileHeightHistogram).sort((a, b) => Number(b[0]) - Number(a[0])).map(([height, count]) => `${height}px:${count}`).join(", ") || "none";
  console.log(`[clipper export] ${status[0].toUpperCase()}${status.slice(1)} rendered video export: ${metrics.totalFrames} frame(s) in ${seconds.toFixed(2)}s (${(metrics.totalFrames / Math.max(seconds, 0.001)).toFixed(2)} fps wall), workers=${metrics.effectiveWorkers}/${metrics.requestedWorkers}.`);
  console.log(`[clipper export] Metrics: scheduled/captured/written=${metrics.framesScheduled}/${metrics.framesCaptured}/${metrics.framesWritten}, render/pin cumulative=${formatMs(metrics.renderJsPinMs)}, capture full cumulative=${formatMs(metrics.fullFrameCaptureMs)}, capture tiled cumulative=${formatMs(metrics.tiledCaptureMs)}, validation cumulative=${formatMs(metrics.validationMs)}, stitch cumulative=${formatMs(metrics.stitchMs)}, ffmpeg write/drain cumulative=${formatMs(metrics.ffmpegWriteWaitMs)}, max completed ordered buffer=${metrics.maxOrderedBufferSize}, max render-ahead scheduled=${metrics.maxRenderAheadDepth}, fallbacks full/tile=${metrics.fullFrameFallbackCount}/${metrics.tileFallbackCount}, memory warnings=${metrics.memoryWarningCount}, tiles={${tileHistogram}}.`);
}

function formatMs(value: number) {
  return `${Math.round(value)}ms`;
}

function logExportFrameHash(frameIndex: number, frame: Buffer) {
  console.log(`[clipper export frame hash] frame=${frameIndex + 1} fnv1a32=${checksumBuffer(frame).toString(16).padStart(8, "0")} bytes=${frame.byteLength}`);
}

function createExportRendererWindow() {
  return new BrowserWindow({
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
}

async function renderExportFrameWithWorker(worker: ExportRendererWorker, _project: ProjectManifest, _scene: Scene, frameIndex: number, frameRate: number, durationSeconds: number): Promise<RenderedExportFrame> {
  const sceneTime = Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
  const renderStartedAt = Date.now();
  if (traceVideoExport) console.log(`[clipper export trace] Rendering frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`);
  const syncResult = await renderExportFrame(worker.window, _project, _scene, sceneTime, frameRate);
  worker.metrics.renderJsPinMs += Date.now() - renderStartedAt;
  if (traceVideoExport) console.log(`[clipper export trace] Render frame ${frameIndex + 1} ready; capture starting.`);
  if (syncResult.failedCount > 0) {
    throw new Error(`Export renderer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`);
  }
  const frameBitmap = await captureExportFrame(worker.window, frameIndex, sceneTime, worker.captureState);
  if (traceVideoExport) console.log(`[clipper export trace] Capture frame ${frameIndex + 1} complete.`);
  return { frameIndex, frameBitmap };
}

function destroyExportRendererWorkers(workers: ExportRendererWorker[]) {
  for (const worker of workers) {
    if (!worker.window.isDestroyed()) worker.removeTileMemoryWarningListener();
    if (!worker.window.isDestroyed()) worker.window.destroy();
  }
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
    const timeout = setTimeout(() => {
      if (traceVideoExport) console.warn(`[clipper export trace] timeout fired: ${message}`);
      reject(new Error(message));
    }, timeoutMs);
    promise.then((value) => {
      clearTimeout(timeout);
      resolve(value);
    }, (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function createExportCaptureState(scene: Scene, metrics: ExportMetrics): ExportCaptureState {
  const preferTiledCapture = scenePrefersTiledCapture(scene);
  return {
    tileHeightIndex: 0,
    tileMemoryPressureDetected: false,
    tileMemoryPressureEverDetected: false,
    fullFrameMode: preferTiledCapture && !deterministicExportMode ? "disabled" : "strict",
    fullFrameStableFrames: 0,
    tiledStableFrames: 0,
    preferTiledCapture,
    allowHeavyFullFrameProbe: deterministicExportMode && preferTiledCapture,
    metrics,
  };
}

async function captureExportFrame(window: BrowserWindow, frameIndex: number, sceneTime: number, captureState: ExportCaptureState) {
  if (shouldAttemptFullFrameCapture(captureState)) {
    try {
      const startedAt = Date.now();
      const frame = await captureFullFrameExportFrame(window, frameIndex, sceneTime, captureState);
      captureState.metrics.fullFrameCaptureMs += Date.now() - startedAt;
      recordStableFullFrameCapture(captureState);
      return frame;
    } catch (error) {
      recordFullFrameCaptureFailure(captureState);
      captureState.metrics.fullFrameFallbackCount += 1;
      console.warn(`Full-frame export capture fell back to adaptive tiles for frame ${frameIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const startedAt = Date.now();
  const frame = await captureTiledExportFrame(window, frameIndex, sceneTime, captureState);
  captureState.metrics.tiledCaptureMs += Date.now() - startedAt;
  recordStableTiledCapture(captureState);
  return frame;
}

function shouldAttemptFullFrameCapture(captureState: ExportCaptureState) {
  if (captureState.preferTiledCapture && !captureState.allowHeavyFullFrameProbe) return false;
  if (deterministicExportMode && captureState.allowHeavyFullFrameProbe) return true;
  if (captureState.fullFrameMode !== "disabled") return true;
  if (captureState.allowHeavyFullFrameProbe) return false;
  return captureState.tiledStableFrames >= exportFullFrameProbeAfterTiledStableFrames;
}

async function captureFullFrameExportFrame(window: BrowserWindow, frameIndex: number, sceneTime: number, captureState: ExportCaptureState) {
  await applyFullFrameExportCaptureViewport(window);
  await syncExportRenderClock(window, frameIndex, sceneTime);

  captureState.tileMemoryPressureDetected = false;
  const firstSample = await captureFullFrameExportBitmap(window, frameIndex, sceneTime);
  const secondSample = await captureFullFrameExportBitmap(window, frameIndex, sceneTime);
  if (captureState.tileMemoryPressureDetected) {
    throw new ExportTileMemoryPressureError(`Chromium reported tile memory pressure while validating export frame ${frameIndex + 1} full-frame capture.`);
  }
  validateMatchingExportBitmaps(firstSample, secondSample, `Captured export frame ${frameIndex + 1} full-frame changed between validation samples at pinned time ${sceneTime.toFixed(3)}s`, captureState.metrics);
  return firstSample;
}

async function applyFullFrameExportCaptureViewport(window: BrowserWindow) {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== frameWidth || currentHeight !== frameHeight) window.setContentSize(frameWidth, frameHeight, false);
  await withTimeout(
    window.webContents.executeJavaScript(`(() => {
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
    })()`, true),
    exportCaptureTileTimeoutMs,
    "Timed out applying full-frame export capture viewport.",
  );
}

async function captureFullFrameExportBitmap(window: BrowserWindow, frameIndex: number, sceneTime: number) {
  const image = await withTimeout(
    window.webContents.capturePage({ x: 0, y: 0, width: frameWidth, height: frameHeight }),
    exportCaptureTileTimeoutMs,
    `Timed out capturing export frame ${frameIndex + 1} full-frame at ${sceneTime.toFixed(3)}s.`,
  );
  return getBgraBitmap(image, frameWidth, frameHeight, `export frame ${frameIndex + 1} full-frame`);
}

function recordStableFullFrameCapture(captureState: ExportCaptureState) {
  captureState.fullFrameStableFrames += 1;
  captureState.tiledStableFrames = 0;
  captureState.tileMemoryPressureDetected = false;
  if (captureState.fullFrameMode !== "trusted" && captureState.fullFrameStableFrames >= exportFullFrameStableFramesForTrust) {
    captureState.fullFrameMode = "trusted";
  }
}

function recordFullFrameCaptureFailure(captureState: ExportCaptureState) {
  captureState.fullFrameMode = "disabled";
  captureState.fullFrameStableFrames = 0;
  captureState.tiledStableFrames = 0;
  captureState.tileMemoryPressureDetected = false;
}

function recordStableTiledCapture(captureState: ExportCaptureState) {
  captureState.tiledStableFrames += 1;
  if (!captureState.preferTiledCapture && captureState.tiledStableFrames >= exportFullFrameProbeAfterTiledStableFrames) {
    captureState.fullFrameMode = "strict";
    captureState.fullFrameStableFrames = 0;
  }
}

async function captureTiledExportFrame(window: BrowserWindow, frameIndex: number, sceneTime: number, captureState: ExportCaptureState) {
  if (deterministicExportMode && captureState.tileMemoryPressureEverDetected && !allowNondeterministicTiledExport) {
    throw new Error(`Deterministic export cannot safely continue after Chromium tile-memory pressure forced tiled capture for frame ${frameIndex + 1}. Heavy WebLayer/SVG/filter tiled capture has not proven repeatable on this scene. Retry with CLIPPER_EXPORT_DETERMINISTIC_LEVEL=strict, simplify the scene, or explicitly opt into suspect tiled output with CLIPPER_EXPORT_ALLOW_NONDETERMINISTIC_TILED=1.`);
  }
  const frame = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
  while (captureState.tileHeightIndex < exportCaptureTileHeights.length) {
      const tileHeight = exportCaptureTileHeights[captureState.tileHeightIndex];
      try {
        for (const tile of getExportCaptureTiles(tileHeight)) {
          await syncExportRenderClock(window, frameIndex, sceneTime);
          const tileBitmap = await captureStableExportTile(window, tile, frameIndex, sceneTime, captureState);
        const stitchStartedAt = Date.now();
        stitchBgraTile(frame, tileBitmap, tile);
        captureState.metrics.stitchMs += Date.now() - stitchStartedAt;
      }
      if (frame.byteLength !== frameWidth * frameHeight * 4) {
        throw new Error(`Stitched frame byte length was ${frame.byteLength}; expected ${frameWidth * frameHeight * 4}.`);
      }
      return frame;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldReduceExportTileHeight(captureState, error)) {
        throw new Error(`Failed to capture stable export frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s with ${tileHeight}px tiles: ${message}`);
      }
      captureState.metrics.tileFallbackCount += 1;
    }
  }

  throw new Error(`Failed to capture stable export frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s: exhausted adaptive tile heights (${exportCaptureTileHeights.join(" -> ")}).`);
}

async function syncExportRenderClock(window: BrowserWindow, frameIndex: number, sceneTime: number) {
  await withTimeout<RenderClockReadinessResult>(
    window.webContents.executeJavaScript("window.__clipperSyncExportRenderClock()", true),
    exportRendererFrameTimeoutMs,
    `Timed out syncing export render clock before capture for frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
}

function getExportCaptureTiles(tileHeight: number) {
  const cached = exportCaptureTileCache.get(tileHeight);
  if (cached) return cached;
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += tileHeight) {
    tiles.push({ x: 0, y, width: frameWidth, height: Math.min(tileHeight, frameHeight - y) });
  }
  exportCaptureTileCache.set(tileHeight, tiles);
  return tiles;
}

async function captureStableExportTile(window: BrowserWindow, tile: ExportCaptureTile, frameIndex: number, sceneTime: number, captureState: ExportCaptureState) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= exportCaptureTileRetries; attempt += 1) {
    try {
      captureState.tileMemoryPressureDetected = false;
      await applyExportCaptureViewport(window, tile);
      await syncExportRenderClock(window, frameIndex, sceneTime);
      const samples: Buffer[] = [];
      for (let sampleIndex = 0; sampleIndex < exportCaptureTileValidationSamples; sampleIndex += 1) {
        samples.push(await captureExportTileBitmap(window, tile, frameIndex, sceneTime));
      }
      if (captureState.tileMemoryPressureDetected) {
        throw new ExportTileMemoryPressureError(`Chromium reported tile memory pressure while capturing export frame ${frameIndex + 1} tile ${formatTileRange(tile)}.`);
      }
      for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
        validateMatchingExportBitmaps(samples[0], samples[sampleIndex], `Captured export frame ${frameIndex + 1} tile ${formatTileRange(tile)} changed between validation samples at pinned time ${sceneTime.toFixed(3)}s`, captureState.metrics);
      }
      captureState.metrics.tileHeightHistogram[tile.height] = (captureState.metrics.tileHeightHistogram[tile.height] ?? 0) + 1;
      return samples[0];
    } catch (error) {
      lastError = error;
      if (captureState.tileHeightIndex < exportCaptureTileHeights.length - 1 && isAdaptiveTileReductionSignal(error)) break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (lastError instanceof ExportTileUnstableError || lastError instanceof ExportTileMemoryPressureError) {
    throw lastError;
  }
  throw new Error(`Failed to capture stable export frame ${frameIndex + 1} tile ${formatTileRange(tile)} at ${sceneTime.toFixed(3)}s after ${exportCaptureTileRetries} attempt(s): ${message}`);
}

async function captureExportTileBitmap(window: BrowserWindow, tile: ExportCaptureTile, frameIndex: number, sceneTime: number) {
  const image = await withTimeout(
    window.webContents.capturePage({ x: 0, y: 0, width: tile.width, height: tile.height }),
    exportCaptureTileTimeoutMs,
    `Timed out capturing export frame ${frameIndex + 1} tile ${formatTileRange(tile)} at ${sceneTime.toFixed(3)}s.`,
  );
  return getBgraBitmap(image, tile.width, tile.height, `export frame ${frameIndex + 1} tile ${formatTileRange(tile)}`);
}

function validateMatchingExportBitmaps(first: Buffer, second: Buffer, message: string, metrics?: ExportMetrics) {
  const startedAt = Date.now();
  try {
    if (first.equals(second)) return;

    const firstChecksum = checksumBuffer(first);
    const secondChecksum = checksumBuffer(second);
    const diff = getBitmapDiffStats(first, second);
    if (traceVideoExport) console.warn(`[clipper export trace] validation mismatch: first checksum=${firstChecksum}, second checksum=${secondChecksum}, ${formatBitmapDiffStats(diff)}.`);
    if (!isAcceptableCaptureReadbackDrift(diff)) {
      throw new ExportTileUnstableError(`${message} (${formatBitmapDiffStats(diff)}).`);
    }
  } finally {
    if (metrics) metrics.validationMs += Date.now() - startedAt;
  }
}

async function applyExportCaptureViewport(window: BrowserWindow, tile: ExportCaptureTile) {
  const [, currentHeight] = window.getContentSize();
  if (currentHeight !== tile.height) window.setContentSize(frameWidth, tile.height, false);
  await withTimeout(
    window.webContents.executeJavaScript(`(() => {
      const offset = ${JSON.stringify(tile.y)};
      document.documentElement.style.width = "${frameWidth}px";
      document.documentElement.style.height = "${tile.height}px";
      document.documentElement.style.overflow = "hidden";
      document.body.style.width = "${frameWidth}px";
      document.body.style.height = "${frameHeight}px";
      document.body.style.overflow = "hidden";
      document.body.style.margin = "0";
      document.body.style.transformOrigin = "0 0";
      document.body.style.transform = "translate3d(0, -" + offset + "px, 0)";
      return true;
    })()`, true),
    exportCaptureTileTimeoutMs,
    `Timed out applying export capture viewport for tile ${formatTileRange(tile)}.`,
  );
}

function shouldReduceExportTileHeight(captureState: ExportCaptureState, error: unknown) {
  if (captureState.tileHeightIndex >= exportCaptureTileHeights.length - 1) return false;
  if (captureState.tileMemoryPressureDetected || isAdaptiveTileReductionSignal(error)) {
    captureState.tileHeightIndex += 1;
    captureState.tileMemoryPressureDetected = false;
    return true;
  }
  return false;
}

function isAdaptiveTileReductionSignal(error: unknown) {
  if (error instanceof ExportTileUnstableError || error instanceof ExportTileMemoryPressureError) return true;
  if (!(error instanceof Error)) return false;
  return /bitmap length|image size|memory|timed out/i.test(error.message);
}

function watchExportTileMemoryWarnings(window: BrowserWindow, captureState: ExportCaptureState) {
  const handleConsoleMessage = (event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>, _level?: number, legacyMessage?: string) => {
    const message = legacyMessage ?? event.message ?? "";
    if (/tile memory limits exceeded|some content may not draw/i.test(message)) {
      captureState.tileMemoryPressureDetected = true;
      captureState.tileMemoryPressureEverDetected = true;
      captureState.metrics.memoryWarningCount += 1;
    }
  };
  window.webContents.on("console-message", handleConsoleMessage);
  return () => window.webContents.off("console-message", handleConsoleMessage);
}

function checksumBuffer(buffer: Buffer) {
  let hash = 0x811c9dc5;
  for (const byte of buffer) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
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
  const pixels = Math.max(1, Math.ceil(Math.max(left.byteLength, right.byteLength) / 4));
  const differingPixelRatio = differingBytes / 4 / pixels;
  const averageByteDelta = totalDelta / Math.max(1, length);
  return { differingBytes, differingPixelRatio, averageByteDelta, maxDelta };
}

function isAcceptableCaptureReadbackDrift(diff: ReturnType<typeof getBitmapDiffStats>) {
  return diff.differingPixelRatio <= exportCaptureTileMaxDifferingPixelRatio && diff.averageByteDelta <= exportCaptureTileMaxAverageByteDelta;
}

function formatBitmapDiffStats(diff: ReturnType<typeof getBitmapDiffStats>) {
  return `${diff.differingBytes} differing bytes, ${(diff.differingPixelRatio * 100).toFixed(4)}% pixel-equivalent ratio, avg byte delta ${diff.averageByteDelta.toFixed(4)}, max byte delta ${diff.maxDelta}`;
}

function formatTileRange(tile: ExportCaptureTile) {
  return `${tile.y}-${tile.y + tile.height}`;
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
type ExportMetrics = {
  requestedWorkers: number;
  effectiveWorkers: number;
  totalFrames: number;
  framesScheduled: number;
  framesCaptured: number;
  framesWritten: number;
  totalElapsedMs: number;
  renderJsPinMs: number;
  fullFrameCaptureMs: number;
  tiledCaptureMs: number;
  validationMs: number;
  stitchMs: number;
  ffmpegWriteWaitMs: number;
  maxOrderedBufferSize: number;
  maxRenderAheadDepth: number;
  tileHeightHistogram: Record<number, number>;
  fullFrameFallbackCount: number;
  tileFallbackCount: number;
  memoryWarningCount: number;
};
type ExportRendererWorker = { window: BrowserWindow; captureState: ExportCaptureState; removeTileMemoryWarningListener: () => void; metrics: ExportMetrics };
type RenderedExportFrame = { frameIndex: number; frameBitmap: Buffer };
type ExportCaptureState = {
  tileHeightIndex: number;
  tileMemoryPressureDetected: boolean;
  tileMemoryPressureEverDetected: boolean;
  fullFrameMode: "strict" | "trusted" | "disabled";
  fullFrameStableFrames: number;
  tiledStableFrames: number;
  preferTiledCapture: boolean;
  allowHeavyFullFrameProbe: boolean;
  metrics: ExportMetrics;
};
type ExportCaptureTile = { x: number; y: number; width: number; height: number };
type MotionMarker = { start: number; duration: number };
type AdjustmentLayer = { id: string; name: string; start: number; duration: number; effect: { kind?: "frameSkip"; every?: number; effectId?: string; params?: Record<string, unknown> } };
type TransitionLayer = { id: string; name: string; start: number; duration: number; midPoint: number; effect: { effectId?: string; params?: Record<string, unknown> } };
type CompositionClip = { start?: number; duration: number; motionMarkers?: MotionMarker[]; objects?: Array<{ type?: string; content?: string }> };
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

  commandVideoRenderActive = true;
  try {
    await renderSceneToVideo(project, scene, resolvedOutputPath, 30, getSceneDuration(scene));
    console.log(`Rendered video to ${resolvedOutputPath}`);
  } finally {
    commandVideoRenderActive = false;
  }
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
  if (commandVideoRenderActive) return;
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
