import { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell } from "electron";
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
const frameWidth = 1920;
const frameHeight = 1080;
let hardwareEncoderSupport: Set<string> | null = null;
let systemFontFamilies: string[] | null = null;

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
      args: ["-c:v", "h264_videotoolbox", "-b:v", "12M", "-allow_sw", "1", "-pix_fmt", "yuv420p"],
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

ipcMain.handle("clipper:render-video-export", async (event, exportId: string, defaultFileName: string, project: ProjectManifest, scene: Scene, frameRate: number) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export video",
    defaultPath: defaultFileName,
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (canceled || !filePath) return null;
  cancelledVideoRenders.delete(exportId);
  await renderSceneToVideo(project, scene, filePath, frameRate, exportId, (progress) => event.sender.send("clipper:video-export-progress", exportId, progress));
  cancelledVideoRenders.delete(exportId);
  return filePath;
});

ipcMain.handle("clipper:cancel-render-video-export", async (_event, exportId: string) => {
  cancelledVideoRenders.add(exportId);
});

async function renderSceneToVideo(_project: ProjectManifest, scene: Scene, outputPath: string, frameRate: number, exportId?: string, onProgress?: (progress: VideoExportProgress) => void) {
  if (!ffmpegPath) throw new Error("The bundled ffmpeg binary is unavailable.");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const encoder = getVideoEncoderArgs();
  const timeline = buildLinearTimeline(scene);
  const durationSeconds = timeline.reduce((duration, item) => Math.max(duration, item.end), 0);
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  onProgress?.({ frame: 0, totalFrames, percent: 0, status: `Preparing ${encoder.label} export...` });
  const rendererWindow = new BrowserWindow({
    width: frameWidth,
    height: frameHeight,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(frameRate),
    "-vcodec", "png",
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
    await rendererWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildFrameShell())}`);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (exportId && cancelledVideoRenders.has(exportId)) throw new Error("Video export cancelled.");
      const sceneTime = Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
      const visualAdjustmentStyle = applyAdjustmentLayersToVisualStyle(sceneTime, scene.adjustmentLayers);
      const visualTransitionStyle = applyTransitionLayersToVisualStyle(sceneTime, scene.transitionLayers);
      const adjustedSceneTime = applyAdjustmentLayersToSceneTime(sceneTime, scene.adjustmentLayers, frameRate);
      const timelineParts = getActiveTimelinePartsAtTime(timeline, adjustedSceneTime, _project.editorState?.timelineLayers);
      if (timelineParts.length === 0) throw new Error("The current scene has no compositions to render.");
      const transitionLayer = getActiveTransitionLayer(sceneTime, scene.transitionLayers);
      const frameHtml = transitionLayer
        ? buildTransitionFrameBody(getTransitionStackParts(timeline, sceneTime, transitionLayer, scene.adjustmentLayers, _project.editorState?.timelineLayers, frameRate), getTransitionProgress(sceneTime, transitionLayer), visualAdjustmentStyle, visualTransitionStyle)
        : buildFrameBody(timelineParts.map((timelinePart) => ({ part: timelinePart, previewTime: clamp(adjustedSceneTime - timelinePart.start, 0, timelinePart.duration) })), visualAdjustmentStyle, visualTransitionStyle);

      await renderFrameHtml(rendererWindow, frameHtml);
      const image = await rendererWindow.webContents.capturePage({ x: 0, y: 0, width: frameWidth, height: frameHeight });
      await writeProcessInput(ffmpeg, image.toPNG());
      onProgress?.({ frame: frameIndex + 1, totalFrames, percent: Math.round(((frameIndex + 1) / totalFrames) * 100), status: `Rendering frame ${frameIndex + 1} of ${totalFrames} with ${encoder.label}` });
    }
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

async function renderFrameHtml(window: BrowserWindow, frameHtml: string) {
  await window.webContents.executeJavaScript(`window.__clipperSetFrame(${JSON.stringify(frameHtml)})`, true);
}

async function writeProcessInput(process: ChildProcessWithoutNullStreams, chunk: Buffer) {
  if (process.stdin.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    process.stdin.once("drain", resolve);
    process.stdin.once("error", reject);
  });
}

type MotionEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "circOut";
type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string };
type MotionTrack = { delay?: number; duration: number; ease?: MotionEase; loop?: boolean; opacity?: readonly [number, number]; rotate?: readonly [number, number]; scale?: readonly [number, number]; scaleX?: readonly [number, number]; scaleY?: readonly [number, number]; skewX?: readonly [number, number]; skewY?: readonly [number, number]; x?: readonly [number, number]; y?: readonly [number, number] };
type FrameTemplate = { kind: "html"; source: string; static?: boolean };
type FrameObject = { id: string; name: string; type: string; selector: string; bounds: { x: number; y: number; width: number; height: number }; content?: string; template?: FrameTemplate; richText?: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }>; style: Record<string, string | number>; motion?: MotionTrack; hidden?: boolean };
type BackgroundLayer = { id: string; name: string; style: Record<string, string | number>; stretchToElements?: boolean; motion?: MotionTrack; hidden?: boolean; elements: FrameObject[] };
type ZoomMarker = { id: string; start: number; duration: number; focus: { x: number; y: number }; scale: number; ease?: MotionEase; snapIn?: boolean; snapOut?: boolean; middleTransition?: "transition"; middleEase?: MotionEase };
type TranslationMarker = { id: string; start: number; duration: number; kind?: "pan" | "rotate"; position: { x: number; y: number }; rotation?: number; ease?: MotionEase; snapIn?: boolean; snapOut?: boolean; middleTransition?: "transition"; middleEase?: MotionEase };
type AdjustmentLayer = { id: string; name: string; start: number; duration: number; effect: { kind?: "frameSkip"; every?: number; effectId?: string; params?: Record<string, unknown> } };
type TransitionLayer = { id: string; name: string; start: number; duration: number; midPoint: number; effect: { effectId?: string; params?: Record<string, unknown> } };
type CompositionClip = { id: string; name: string; filePath: string; sourceMissing?: boolean; start?: number; layerId?: string; duration: number; frame: { width: number; height: number; style: Record<string, string | number> }; background: BackgroundLayer; objects: FrameObject[]; snapshot: unknown[]; zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] };
type Scene = { id: string; name: string; compositions: CompositionClip[]; adjustmentLayers?: AdjustmentLayer[]; transitionLayers?: TransitionLayer[] };
type TimelineLayerState = { compositionLayers?: Array<{ id: string }> };
type ProjectManifest = { id: string; name: string; resolution: { width: number; height: number }; scenes: Scene[]; assetsPath: string; editorState?: { timelineLayers?: TimelineLayerState } };
type TimelinePart = CompositionClip & { start: number; end: number };
type AdjustmentVisualOverlay = { id: string; target?: "frame" | "camera"; style: Record<string, string | number> };
type AdjustmentVisualStyle = { filter?: string; overlays?: AdjustmentVisualOverlay[] };
type TransitionVisualStyle = { filter?: string; frameStyle?: Record<string, string | number>; cameraStyle?: Record<string, string | number>; overlays?: AdjustmentVisualOverlay[] };
const templateCache = new Map<string, (context: unknown) => unknown>();

function buildLinearTimeline(scene: Scene): TimelinePart[] {
  let cursor = 0;
  return scene.compositions.map((part) => {
    const start = part.start ?? cursor;
    const end = start + part.duration;
    cursor = part.start === undefined ? end : Math.max(cursor, end);
    return { ...part, start, end };
  });
}

function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  if (timeline.length === 0) return null;
  return [...timeline].reverse().find((item) => time >= item.start && time < item.end) ?? null;
}

function getActiveTimelinePartsAtTime(timeline: TimelinePart[], time: number, timelineLayers: TimelineLayerState | undefined) {
  const rowOrder = new Map((timelineLayers?.compositionLayers ?? []).map((layer, index) => [layer.id, index]));
  return timeline.filter((item) => time >= item.start && time < item.end).sort((left, right) => {
    const layerDiff = getLayerIndex(rowOrder, left.layerId) - getLayerIndex(rowOrder, right.layerId);
    return layerDiff || right.start - left.start;
  }).reverse();
}

function getLayerIndex(rowOrder: Map<string, number>, layerId: string | undefined) {
  return rowOrder.get(layerId ?? "comp") ?? Number.MAX_SAFE_INTEGER;
}

function applyAdjustmentLayersToSceneTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate: number) {
  return (layers ?? []).reduce((time, layer) => {
    if (time < layer.start || time >= layer.start + layer.duration) return time;
    const effectId = getAdjustmentEffectId(layer);
    if (effectId === "clipper.adjustment.frameSkip" || layer.effect.kind === "frameSkip") return quantizeFrameSkipTime(time, layer.start, getNumberParam(layer, "every", layer.effect.every ?? 2), frameRate);
    if (effectId === "clipper.adjustment.freezeFrame") return layer.start;
    if (effectId === "clipper.adjustment.speedChange") {
      const speed = Math.max(0.05, getNumberParam(layer, "speed", 0.5));
      const maxTime = layer.start + Math.max(0, layer.duration - frameDuration(frameRate));
      return clamp(layer.start + Math.max(0, time - layer.start) * speed, layer.start, maxTime);
    }
    if (effectId === "clipper.adjustment.loopStutter") return layer.start + positiveModulo(Math.max(0, time - layer.start), Math.max(0.05, getNumberParam(layer, "window", 0.5)));
    if (effectId === "clipper.adjustment.reverse") return clamp(layer.start + layer.duration - frameDuration(frameRate) - Math.max(0, time - layer.start), layer.start, layer.start + layer.duration);
    if (effectId === "clipper.adjustment.boomerang") {
      const elapsed = Math.max(0, time - layer.start);
      const halfDuration = Math.max(layer.duration / 2, frameDuration(frameRate));
      const maxTime = layer.start + Math.max(0, layer.duration - frameDuration(frameRate));
      const mapped = elapsed <= halfDuration ? layer.start + elapsed * 2 : maxTime - (elapsed - halfDuration) * 2;
      return clamp(mapped, layer.start, maxTime);
    }
    return time;
  }, sceneTime);
}

function applyAdjustmentLayersToVisualStyle(sceneTime: number, layers: AdjustmentLayer[] | undefined): AdjustmentVisualStyle {
  const filters: string[] = [];
  const overlays: AdjustmentVisualOverlay[] = [];
  for (const layer of layers ?? []) {
    if (sceneTime < layer.start || sceneTime >= layer.start + layer.duration) continue;
    const effectId = getAdjustmentEffectId(layer);
    if (effectId === "clipper.adjustment.colourGrade") {
      filters.push(`brightness(${clamp(getNumberParam(layer, "brightness", 1), 0, 3)})`);
      filters.push(`contrast(${clamp(getNumberParam(layer, "contrast", 1), 0, 3)})`);
      filters.push(`saturate(${clamp(getNumberParam(layer, "saturation", 1), 0, 3)})`);
      filters.push(`hue-rotate(${clamp(getNumberParam(layer, "hue", 0), -180, 180)}deg)`);
    }
    if (effectId === "clipper.adjustment.brightness") filters.push(`brightness(${clamp(getNumberParam(layer, "amount", 1.15), 0, 3)})`);
    if (effectId === "clipper.adjustment.contrast") filters.push(`contrast(${clamp(getNumberParam(layer, "amount", 1.2), 0, 3)})`);
    if (effectId === "clipper.adjustment.saturation") filters.push(`saturate(${clamp(getNumberParam(layer, "amount", 1.25), 0, 3)})`);
    if (effectId === "clipper.adjustment.hueRotate") filters.push(`hue-rotate(${clamp(getNumberParam(layer, "degrees", 30), -180, 180)}deg)`);
    if (effectId === "clipper.adjustment.blur") filters.push(`blur(${clamp(getNumberParam(layer, "radius", 6), 0, 20)}px)`);
    overlays.push(...getAdjustmentVisualOverlays(effectId, layer, sceneTime));
  }
  return { filter: filters.join(" ") || undefined, overlays: overlays.length > 0 ? overlays : undefined };
}

function applyTransitionLayersToVisualStyle(sceneTime: number, layers: TransitionLayer[] | undefined): TransitionVisualStyle {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration).reduce<TransitionVisualStyle>((style, layer) => {
    const nextStyle = applyTransitionVisualStyle(sceneTime, layer);
    return {
      ...style,
      ...nextStyle,
      filter: [style.filter, nextStyle.filter].filter(Boolean).join(" ") || undefined,
      frameStyle: { ...style.frameStyle, ...nextStyle.frameStyle },
      cameraStyle: { ...style.cameraStyle, ...nextStyle.cameraStyle },
      overlays: [...(style.overlays ?? []), ...(nextStyle.overlays ?? [])],
    };
  }, {});
}

function applyTransitionVisualStyle(sceneTime: number, layer: TransitionLayer): TransitionVisualStyle {
  const effectId = layer.effect.effectId ?? "";
  const progress = getTransitionProgress(sceneTime, layer);
  if (effectId === "clipper.transition.swipe") {
    return { cameraStyle: { transform: `translateX(${-(1 - progress) * 100}%)` } };
  }
  return {};
}

function getActiveTransitionLayer(sceneTime: number, layers: TransitionLayer[] | undefined) {
  return layers?.find((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration) ?? null;
}

function getTransitionProgress(sceneTime: number, layer: TransitionLayer) {
  return layer.duration > 0 ? clamp((sceneTime - layer.start) / layer.duration, 0, 1) : 1;
}

function getTransitionStackParts(timeline: TimelinePart[], sceneTime: number, layer: TransitionLayer, adjustmentLayers: AdjustmentLayer[] | undefined, timelineLayers: TimelineLayerState | undefined, frameRate: number) {
  const fromTime = applyAdjustmentLayersToSceneTime(Math.max(layer.start - 0.000001, 0), adjustmentLayers, frameRate);
  const toTime = applyAdjustmentLayersToSceneTime(layer.start + layer.duration, adjustmentLayers, frameRate);
  return {
    from: getActiveTimelinePartsAtTime(timeline, fromTime, timelineLayers).map((part) => ({ part, previewTime: clamp(fromTime - part.start, 0, part.duration) })),
    to: getActiveTimelinePartsAtTime(timeline, toTime, timelineLayers).map((part) => ({ part, previewTime: clamp(toTime - part.start, 0, part.duration) })),
  };
}

function getAdjustmentVisualOverlays(effectId: string, layer: AdjustmentLayer, sceneTime: number): AdjustmentVisualOverlay[] {
  if (effectId === "clipper.adjustment.filmDust") {
    const intensity = clamp(getNumberParam(layer, "intensity", 0.28), 0, 1);
    const density = clamp(getNumberParam(layer, "density", 1), 0.25, 3);
    const drift = clamp(getNumberParam(layer, "drift", 1), 0, 4);
    const offsetX = Math.round(sceneTime * 41 * drift) % 97;
    const offsetY = Math.round(sceneTime * 67 * drift) % 113;
    const scale = Math.max(1, 38 / density);
    return [{ id: `${layer.id}:film-dust`, target: getOverlayTarget(layer), style: { backgroundImage: ["radial-gradient(circle at 14% 18%, rgba(255,255,255,0.95) 0 0.9px, transparent 1.4px)", "radial-gradient(circle at 72% 36%, rgba(255,255,255,0.75) 0 0.7px, transparent 1.2px)", "radial-gradient(circle at 42% 78%, rgba(0,0,0,0.5) 0 0.8px, transparent 1.5px)"].join(","), backgroundPosition: `${offsetX}px ${offsetY}px, ${-offsetY}px ${offsetX}px, ${offsetY / 2}px ${-offsetX / 2}px`, backgroundSize: `${scale}px ${scale}px, ${scale * 1.7}px ${scale * 1.7}px, ${scale * 2.3}px ${scale * 2.3}px`, mixBlendMode: "screen", opacity: intensity } }];
  }
  if (effectId === "clipper.adjustment.filmScratches") {
    const intensity = clamp(getNumberParam(layer, "intensity", 0.24), 0, 1);
    const density = clamp(getNumberParam(layer, "density", 1), 0.25, 3);
    const drift = clamp(getNumberParam(layer, "drift", 1), 0, 4);
    const jitter = Math.round(Math.sin(sceneTime * 37) * 18 * drift);
    const spacing = Math.max(72, 180 / density);
    return [{ id: `${layer.id}:film-scratches`, target: getOverlayTarget(layer), style: { backgroundImage: ["repeating-linear-gradient(90deg, transparent 0 92px, rgba(255,255,255,0.78) 94px 95px, transparent 97px 178px)", "repeating-linear-gradient(90deg, transparent 0 154px, rgba(0,0,0,0.34) 157px 158px, transparent 160px 246px)"].join(","), backgroundPosition: `${jitter}px 0, ${-jitter * 1.7}px 0`, backgroundSize: `${spacing}px 100%, ${spacing * 1.45}px 100%`, mixBlendMode: "screen", opacity: intensity } }];
  }
  if (effectId === "clipper.adjustment.vignette") {
    const intensity = clamp(getNumberParam(layer, "intensity", 0.42), 0, 1);
    const softness = clamp(getNumberParam(layer, "softness", 0.64), 0.2, 1);
    const focusX = clamp(getNumberParam(layer, "focusX", 50), 0, 100);
    const focusY = clamp(getNumberParam(layer, "focusY", 50), 0, 100);
    const clearStop = Math.round(softness * 62);
    return [{ id: `${layer.id}:vignette`, target: getOverlayTarget(layer), style: { backgroundImage: `radial-gradient(ellipse at ${focusX}% ${focusY}%, transparent 0 ${clearStop}%, rgba(0,0,0,0.88) 100%)`, mixBlendMode: "multiply", opacity: intensity } }];
  }
  if (effectId === "clipper.adjustment.lightLeak") {
    const intensity = clamp(getNumberParam(layer, "intensity", 0.34), 0, 1);
    const warmth = clamp(getNumberParam(layer, "warmth", 1), 0, 2);
    const drift = clamp(getNumberParam(layer, "drift", 0.8), 0, 4);
    const focusX = clamp(getNumberParam(layer, "focusX", 12), 0, 100);
    const focusY = clamp(getNumberParam(layer, "focusY", 28), 0, 100);
    const centerX = focusX + Math.sin(sceneTime * 0.8 * drift) * 8 * drift;
    const centerY = focusY + Math.cos(sceneTime * 0.6 * drift) * 18 * drift;
    const green = Math.round(105 + warmth * 45);
    const blue = Math.round(36 + warmth * 26);
    return [{ id: `${layer.id}:light-leak`, target: getOverlayTarget(layer), style: { backgroundImage: [`radial-gradient(circle at ${centerX}% ${centerY}%, rgba(255,${green},${blue},0.95) 0, rgba(255,${green},${blue},0.42) 18%, transparent 46%)`, "linear-gradient(90deg, rgba(255,226,143,0.58), transparent 28%)"].join(","), mixBlendMode: "screen", opacity: intensity } }];
  }
  return [];
}

function getOverlayTarget(layer: AdjustmentLayer) {
  return layer.effect.params?.target === "frame" ? "frame" : "camera";
}

function getAdjustmentEffectId(layer: AdjustmentLayer) {
  return layer.effect.effectId ?? (layer.effect.kind === "frameSkip" ? "clipper.adjustment.frameSkip" : "");
}

function getNumberParam(layer: AdjustmentLayer, key: string, fallback: number) {
  const value = Number(layer.effect.params?.[key] ?? layer.effect[key as keyof AdjustmentLayer["effect"]] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function quantizeFrameSkipTime(sceneTime: number, start: number, every: number, frameRate: number) {
  const frameStep = Math.max(1, Math.round(every));
  if (frameStep <= 1 || frameRate <= 0) return sceneTime;
  const elapsedFrames = Math.max(0, Math.floor((sceneTime - start) * frameRate));
  const heldFrame = Math.floor(elapsedFrames / frameStep) * frameStep;
  return start + heldFrame / frameRate;
}

function frameDuration(frameRate: number) {
  return frameRate > 0 ? 1 / frameRate : 0;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function buildFrameShell() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:${frameWidth}px;height:${frameHeight}px;overflow:hidden;background:#000}</style></head><body><div id="clipper-frame-root"></div><script>window.__clipperSetFrame=function(html){document.getElementById("clipper-frame-root").innerHTML=html;return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});};</script></body></html>`;
}

function buildFrameBody(parts: Array<{ part: CompositionClip; previewTime: number }>, visualAdjustmentStyle: AdjustmentVisualStyle, visualTransitionStyle: TransitionVisualStyle) {
  const frameStyle = cssStyle({ position: "relative", width: frameWidth, height: frameHeight, overflow: "hidden", background: "#000" });
  const transitionTransform = typeof visualTransitionStyle.cameraStyle?.transform === "string" ? visualTransitionStyle.cameraStyle.transform : "";
  const cameraStyle = cssStyle({ position: "absolute", inset: 0, transformOrigin: "center", ...visualTransitionStyle.cameraStyle, transform: transitionTransform });
  const visualStyle = cssStyle({ position: "absolute", inset: 0, filter: [visualAdjustmentStyle.filter, visualTransitionStyle.filter].filter(Boolean).join(" ") || undefined, ...visualTransitionStyle.frameStyle });
  const frameOverlayHtml = adjustmentOverlayHtml([...(visualAdjustmentStyle.overlays?.filter((overlay) => overlay.target === "frame") ?? []), ...(visualTransitionStyle.overlays?.filter((overlay) => overlay.target === "frame") ?? [])]);
  const cameraOverlayHtml = adjustmentOverlayHtml([...(visualAdjustmentStyle.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera") ?? []), ...(visualTransitionStyle.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera") ?? [])]);
  const contentHtml = parts.map(({ part, previewTime }) => compositionLayerHtml(part, previewTime)).join("");
  return `<div style="${frameStyle}"><div style="${cameraStyle}"><div style="${visualStyle}">${contentHtml}${frameOverlayHtml}</div></div>${cameraOverlayHtml}</div>`;
}

function buildTransitionFrameBody(parts: { from: Array<{ part: CompositionClip; previewTime: number }>; to: Array<{ part: CompositionClip; previewTime: number }> }, progress: number, visualAdjustmentStyle: AdjustmentVisualStyle, visualTransitionStyle: TransitionVisualStyle) {
  const frameStyle = cssStyle({ position: "relative", width: frameWidth, height: frameHeight, overflow: "hidden", background: "#000" });
  const visualStyle = cssStyle({ position: "absolute", inset: 0, filter: [visualAdjustmentStyle.filter, visualTransitionStyle.filter].filter(Boolean).join(" ") || undefined });
  const incomingStyle = cssStyle({ position: "absolute", inset: 0, overflow: "hidden", clipPath: `inset(0 ${Math.max(0, 1 - progress) * 100}% 0 0)` });
  const frameOverlayHtml = adjustmentOverlayHtml([...(visualAdjustmentStyle.overlays?.filter((overlay) => overlay.target === "frame") ?? []), ...(visualTransitionStyle.overlays?.filter((overlay) => overlay.target === "frame") ?? [])]);
  const cameraOverlayHtml = adjustmentOverlayHtml([...(visualAdjustmentStyle.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera") ?? []), ...(visualTransitionStyle.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera") ?? [])]);
  const fromHtml = parts.from.map(({ part, previewTime }) => compositionLayerHtml(part, previewTime)).join("");
  const toHtml = parts.to.map(({ part, previewTime }) => compositionLayerHtml(part, previewTime)).join("");
  return `<div style="${frameStyle}"><div style="${visualStyle}"><div style="${cssStyle({ position: "absolute", inset: 0 })}">${fromHtml}</div><div style="${incomingStyle}">${toHtml}</div>${frameOverlayHtml}</div>${cameraOverlayHtml}</div>`;
}

function compositionLayerHtml(part: CompositionClip, previewTime: number) {
  if (part.sourceMissing) return "";

  const activeZoom = getActiveZoom(part.zoomMarkers, previewTime);
  const activeTranslation = getActiveTranslation(part.translationMarkers, previewTime);
  const activeRotation = getActiveRotation(part.translationMarkers, previewTime);
  const scale = activeZoom?.scale ?? 1;
  const focus = activeZoom?.focus ?? { x: frameWidth / 2, y: frameHeight / 2 };
  const x = (frameWidth / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0);
  const y = (frameHeight / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0);
  const rotation = activeRotation?.rotation ?? 0;
  const style = cssStyle({ ...part.frame.style, position: "absolute", inset: 0, overflow: "hidden", transform: `translate3d(${x}px,${y}px,0) rotate(${rotation}deg) scale(${scale})`.trim(), transformOrigin: "center" });
  return `<div style="${style}">${part.background.hidden ? "" : backgroundLayerHtml(part.background, previewTime, part.duration)}${part.objects.filter((object) => !object.hidden).map((object) => frameObjectHtml(object, previewTime, part.duration)).join("")}</div>`;
}

function adjustmentOverlayHtml(overlays: AdjustmentVisualOverlay[] | undefined) {
  return (overlays ?? []).map((overlay) => `<div style="${cssStyle({ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2147483647, ...overlay.style })}"></div>`).join("");
}

function backgroundLayerHtml(background: BackgroundLayer, previewTime: number, duration: number) {
  const layerStyle = cssStyle({ position: "absolute", inset: 0, overflow: background.stretchToElements ? "visible" : "hidden", ...getMotionPreviewAnimation(background.motion, previewTime) });
  const fillBounds = getBackgroundLayerFillBounds(background);
  const fillStyle = cssStyle({ position: "absolute", left: fillBounds.x, top: fillBounds.y, width: fillBounds.width, height: fillBounds.height, ...background.style });
  return `<div style="${layerStyle}"><div style="${fillStyle}"></div>${background.elements.filter((element) => !element.hidden).map((element) => frameObjectHtml(element, previewTime, duration)).join("")}</div>`;
}

function frameObjectHtml(object: FrameObject, previewTime: number, duration: number) {
  const animation = getMotionPreviewAnimation(object.motion, previewTime);
  const templateRender = object.template ? renderFrameTemplate(object.template, object, previewTime, duration) : null;
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : "";
  const animationTransform = typeof animation.transform === "string" ? animation.transform : "";
  const templateTransform = typeof templateRender?.style?.transform === "string" ? templateRender.style.transform : "";
  const style = cssStyle({ position: "absolute", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", whiteSpace: "pre-line", left: object.bounds.x, top: object.bounds.y, width: object.bounds.width, height: object.bounds.height, ...object.style, ...animation, ...templateRender?.style, transform: `${animationTransform || objectTransform} ${templateTransform}`.trim() || undefined });
  const content = templateRender?.content ?? object.content ?? "";
  const html = object.type === "html" || object.type === "svg" || object.type === "template" ? content : escapeHtml(content).replace(/\n/g, "<br />");
  return `<div style="${style}">${html}</div>`;
}

function renderFrameTemplate(template: FrameTemplate, object: FrameObject, time: number, duration: number): { content?: string; style?: Record<string, string | number | undefined> } {
  const renderer = compileFrameTemplate(template.source);
  const result = renderer({
    time,
    duration,
    progress: clamp(duration > 0 ? time / duration : 0, 0, 1),
    frame: { width: frameWidth, height: frameHeight },
    object: { id: object.id, name: object.name, bounds: object.bounds, style: object.style, content: object.content },
  });

  if (typeof result === "string") return { content: result };
  if (!result || typeof result !== "object") return { content: "" };
  const rendered = result as { content?: string; style?: Record<string, string | number | undefined> };
  return { content: rendered.content, style: rendered.style ?? {} };
}

function compileFrameTemplate(source: string) {
  const cached = templateCache.get(source);
  if (cached) return cached;
  const renderer = Function(`"use strict"; const template = (${source}); if (typeof template !== "function") throw new Error("Frame template source must evaluate to a function."); return template;`)() as (context: unknown) => unknown;
  templateCache.set(source, renderer);
  return renderer;
}

function getBackgroundLayerFillBounds(background: BackgroundLayer) {
  if (!background.stretchToElements || background.elements.length === 0) return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const left = Math.min(0, ...background.elements.map((element) => element.bounds.x));
  const top = Math.min(0, ...background.elements.map((element) => element.bounds.y));
  const right = Math.max(frameWidth, ...background.elements.map((element) => element.bounds.x + element.bounds.width));
  const bottom = Math.max(frameHeight, ...background.elements.map((element) => element.bounds.y + element.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function cssStyle(style: Record<string, unknown>) {
  return Object.entries(style).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${cssValue(key, value)};`).join("");
}

function cssValue(key: string, value: unknown) {
  if (typeof value !== "number") return escapeHtml(String(value));
  return unitlessCssProperties.has(key) ? String(value) : `${value}px`;
}

const unitlessCssProperties = new Set(["fontWeight", "lineHeight", "opacity", "zIndex", "flex", "flexGrow", "flexShrink", "order"]);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getMotionPreviewAnimation(motion: MotionTrack | undefined, time: number): Record<string, string | number | undefined> {
  if (!motion) return {};
  const delay = motion.delay ?? 0;
  const elapsed = Math.max(time - delay, 0);
  const cycleTime = motion.loop && motion.duration > 0 ? elapsed % motion.duration : elapsed;
  const progress = easeProgress(clamp(cycleTime / motion.duration, 0, 1), motion.ease);
  const transforms: string[] = [];
  if (motion.x) transforms.push(`translateX(${Math.round(interpolate(motion.x, progress))}px)`);
  if (motion.y) transforms.push(`translateY(${Math.round(interpolate(motion.y, progress))}px)`);
  if (motion.rotate) transforms.push(`rotate(${interpolate(motion.rotate, progress).toFixed(2)}deg)`);
  if (motion.skewX) transforms.push(`skewX(${interpolate(motion.skewX, progress).toFixed(2)}deg)`);
  if (motion.skewY) transforms.push(`skewY(${interpolate(motion.skewY, progress).toFixed(2)}deg)`);
  if (motion.scale) transforms.push(`scale(${interpolate(motion.scale, progress).toFixed(4)})`);
  if (motion.scaleX) transforms.push(`scaleX(${interpolate(motion.scaleX, progress).toFixed(4)})`);
  if (motion.scaleY) transforms.push(`scaleY(${interpolate(motion.scaleY, progress).toFixed(4)})`);
  return { opacity: motion.opacity ? interpolate(motion.opacity, progress) : undefined, transform: transforms.length > 0 ? transforms.join(" ") : undefined };
}

function getActiveZoom(markers: ZoomMarker[], time: number) {
  const marker = markers.find((item) => time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const eased = easeProgress(clamp(Math.min(rampIn, rampOut, 1), 0, 1), marker.ease ?? "easeInOut");
  return { ...marker, scale: 1 + (marker.scale - 1) * eased };
}

function getActiveTranslation(markers: TranslationMarker[], time: number) {
  const marker = markers.find((item) => (item.kind ?? "pan") === "pan" && time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const eased = easeProgress(clamp(Math.min(rampIn, rampOut, 1), 0, 1), marker.ease ?? "easeInOut");
  return { ...marker, position: { x: Math.round(marker.position.x * eased), y: Math.round(marker.position.y * eased) } };
}

function getActiveRotation(markers: TranslationMarker[], time: number) {
  const marker = markers.find((item) => item.kind === "rotate" && time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const eased = easeProgress(clamp(Math.min(rampIn, rampOut, 1), 0, 1), marker.ease ?? "easeInOut");
  return { ...marker, rotation: (marker.rotation ?? 0) * eased };
}

function interpolate(range: readonly [number, number], progress: number) {
  return range[0] + (range[1] - range[0]) * progress;
}

function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return 1 - Math.pow(1 - value, 3);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#00000000",
    title: "Clipper",
    titleBarStyle: "hiddenInset",
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
        isMac ? { role: "close" } : { role: "quit" },
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

  await renderSceneToVideo(project, scene, resolvedOutputPath, 30);
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
