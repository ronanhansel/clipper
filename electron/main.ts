import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
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
const frameWidth = 1920;
const frameHeight = 1080;
let hardwareEncoderSupport: Set<string> | null = null;

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

ipcMain.handle("clipper:write-text-file", async (_event, relativePath: string, content: string) => {
  await fs.writeFile(resolveClipperFile(relativePath), content, "utf8");
});

ipcMain.handle("clipper:open-project-manifest", async () => {
  const appRoot = path.resolve(__dirname, "..");
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open Clipper project",
    defaultPath: path.join(appRoot, "clipper", "projects"),
    properties: ["openFile"],
    filters: [{ name: "Clipper Project", extensions: ["json"] }],
  });

  if (canceled || !filePaths[0]) return null;
  return getClipperRelativePath(filePaths[0]);
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
  const durationSeconds = timeline.at(-1)?.end ?? 0;
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
      const timelinePart = getTimelinePartAtTime(timeline, sceneTime) ?? timeline[0];
      if (!timelinePart) throw new Error("The current scene has no parts to render.");
      const previewTime = clamp(sceneTime - timelinePart.start, 0, timelinePart.duration);
      const frameHtml = buildFrameBody(timelinePart, previewTime, getActiveZoom(timelinePart.zoomMarkers, previewTime), getActiveTranslation(timelinePart.translationMarkers, previewTime));

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
type MotionTrack = { delay?: number; duration: number; ease?: MotionEase; loop?: boolean; opacity?: readonly [number, number]; rotate?: readonly [number, number]; x?: readonly [number, number]; y?: readonly [number, number] };
type FrameTemplate = { kind: "html"; source: string; static?: boolean };
type FrameObject = { id: string; name: string; type: string; selector: string; bounds: { x: number; y: number; width: number; height: number }; content?: string; template?: FrameTemplate; richText?: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }>; style: Record<string, string | number>; motion?: MotionTrack };
type BackgroundLayer = { id: string; name: string; style: Record<string, string | number>; stretchToElements?: boolean; motion?: MotionTrack; elements: FrameObject[] };
type ZoomMarker = { id: string; start: number; duration: number; focus: { x: number; y: number }; scale: number; ease?: MotionEase; snapIn?: boolean; snapOut?: boolean; middleTransition?: "transition"; middleEase?: MotionEase };
type TranslationMarker = { id: string; start: number; duration: number; position: { x: number; y: number }; ease?: MotionEase; snapIn?: boolean; snapOut?: boolean; middleTransition?: "transition"; middleEase?: MotionEase };
type Part = { id: string; name: string; filePath: string; duration: number; frame: { width: number; height: number; style: Record<string, string | number> }; background: BackgroundLayer; objects: FrameObject[]; snapshot: unknown[]; zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] };
type Scene = { id: string; name: string; parts: Part[] };
type ProjectManifest = { id: string; name: string; resolution: { width: number; height: number }; scenes: Scene[]; assetsPath: string };
type TimelinePart = Part & { start: number; end: number };
const templateCache = new Map<string, (context: unknown) => unknown>();

function buildLinearTimeline(scene: Scene): TimelinePart[] {
  let cursor = 0;
  return scene.parts.map((part) => {
    const start = cursor;
    const end = start + part.duration;
    cursor = end;
    return { ...part, start, end };
  });
}

function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  if (timeline.length === 0) return null;
  if (time >= timeline[timeline.length - 1].end) return timeline[timeline.length - 1];
  return timeline.find((item) => time >= item.start && time < item.end) ?? timeline[0] ?? null;
}

function buildFrameShell() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:${frameWidth}px;height:${frameHeight}px;overflow:hidden;background:#000}</style></head><body><div id="clipper-frame-root"></div><script>window.__clipperSetFrame=function(html){document.getElementById("clipper-frame-root").innerHTML=html;return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});};</script></body></html>`;
}

function buildFrameBody(part: Part, previewTime: number, activeZoom: ZoomMarker | null, activeTranslation: TranslationMarker | null) {
  const scale = activeZoom?.scale ?? 1;
  const focus = activeZoom?.focus ?? { x: frameWidth / 2, y: frameHeight / 2 };
  const x = (frameWidth / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0);
  const y = (frameHeight / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0);
  const frameStyle = cssStyle({ ...part.frame.style, position: "relative", width: frameWidth, height: frameHeight, overflow: "hidden" });
  const cameraStyle = `position:absolute;inset:0;transform-origin:center;transform:translate(${x}px,${y}px) scale(${scale});`;
  return `<div style="${frameStyle}"><div style="${cameraStyle}">${backgroundLayerHtml(part.background, previewTime, part.duration)}${part.objects.map((object) => frameObjectHtml(object, previewTime, part.duration)).join("")}</div></div>`;
}

function backgroundLayerHtml(background: BackgroundLayer, previewTime: number, duration: number) {
  const layerStyle = cssStyle({ position: "absolute", inset: 0, overflow: background.stretchToElements ? "visible" : "hidden", ...getMotionPreviewAnimation(background.motion, previewTime) });
  const fillBounds = getBackgroundLayerFillBounds(background);
  const fillStyle = cssStyle({ position: "absolute", left: fillBounds.x, top: fillBounds.y, width: fillBounds.width, height: fillBounds.height, ...background.style });
  return `<div style="${layerStyle}"><div style="${fillStyle}"></div>${background.elements.map((element) => frameObjectHtml(element, previewTime, duration)).join("")}</div>`;
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
  const marker = markers.find((item) => time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const eased = easeProgress(clamp(Math.min(rampIn, rampOut, 1), 0, 1), marker.ease ?? "easeInOut");
  return { ...marker, position: { x: Math.round(marker.position.x * eased), y: Math.round(marker.position.y * eased) } };
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

  const projectPath = process.argv[renderArgIndex + 1] ?? "clipper/projects/prj_v01_sample/project.json";
  const sceneId = process.argv[renderArgIndex + 2] ?? "scn_opening";
  const outputPathArg = process.argv[renderArgIndex + 3] ?? "clipper/exports/command-render.mp4";
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
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
