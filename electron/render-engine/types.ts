import { type ChildProcessWithoutNullStreams } from "node:child_process";

// ─── Export / Render constants ──────────────────────────────────────────

export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
export const DEFAULT_EXPORT_TILE_HEIGHT = 270;
export const EXPORT_RENDERER_FRAME_TIMEOUT_MS = 8000;
export const EXPORT_CAPTURE_TILE_RETRIES = 3;
export const EXPORT_CAPTURE_TILE_TIMEOUT_MS = 4000;
export const EXPORT_PROCESS_STOP_TIMEOUT_MS = 1200;
export const DEFAULT_PRERENDER_BLOCK_DURATION_MS = 200;
export const MIN_PRERENDER_BLOCK_DURATION_MS = 20;
export const MAX_PRERENDER_BLOCK_DURATION_MS = 1000;
export const PRERENDER_VIDEO_BLOCK_MIME_TYPE = 'video/mp4; codecs="avc1.42E028"';
export const PRERENDER_VIDEO_BLOCK_CODEC_VERSION = 2;

export const EXPORT_CHROMIUM_ARGS = [
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
  "--force-color-profile=srgb",
] as const;

// ─── Video export types ─────────────────────────────────────────────────

export type VideoExportMethod = "renderer";

export type VideoExportProgress = {
  frame: number;
  totalFrames: number;
  percent: number;
  status: string;
  method?: VideoExportMethod;
};

export type ExportSource = "app" | "app-supervised";

export type RenderSceneToVideoOptions = {
  source?: ExportSource;
  exportId?: string;
  tileHeight?: number;
  reusePrerenderCache?: boolean;
  exportWidth?: number;
  exportHeight?: number;
  exportFormat?: "prores-422-hq" | "prores-4444" | "dnxhr-hqx" | "mov" | "h264-high" | "mp4" | "webm";
  exportRenderQuality?: "standard" | "high" | "ultra";
  exportWorkerMapping?: { hd?: number; qhd?: number; uhd?: number };
  onProgress?: (progress: VideoExportProgress) => void;
};

export type ExportFrameRange = {
  startFrame: number;
  endFrame: number;
};

export type ExportOomWarningState = {
  activePath: "renderer";
  totalWarnings: number;
};

export type SupervisedRenderPayload = {
  project: ProjectManifest;
  manifestPath: string;
  scene: Scene;
  frameRate: number;
  durationSeconds: number;
  frameRange: ExportFrameRange;
  outputPath: string;
  tileHeight: number;
  source: ExportSource;
  exportWidth: number;
  exportHeight: number;
  renderSurface?: "export" | "preview-cache";
};

export type SupervisedRenderResult = {
  outputPath: string;
  nativeWarningDetected: boolean;
  nativeWarningCount: number;
};

export type ExportCaptureTile = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrerenderedFrame = {
  width: number;
  height: number;
  pixelFormat: "bgra";
  sceneTime: number;
  frameRate: number;
  data: Uint8Array;
};

export type PrerenderedVideoBlock = {
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

export type PrerenderCachePaths = {
  directory: string;
  framePath: string;
  manifestPath: string;
};

export type PrerenderVideoBlockCachePaths = {
  directory: string;
  videoPath: string;
  manifestPath: string;
};

export type PrerenderCacheManifest = {
  cacheKey: string;
  width: number;
  height: number;
  pixelFormat: "bgra";
  sceneTime: number;
  frameRate: number;
  updatedAt: string;
} | null;

export type PrerenderVideoCacheManifest = {
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

// ─── Child process IPC types ────────────────────────────────────────────

export type ExportChildStopReason = "cancel";

export type ExportChildStopMessage = {
  type: "clipper:stop-render-child";
  reason: ExportChildStopReason;
};

export function isExportChildStopMessage(
  message: unknown,
): message is ExportChildStopMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<ExportChildStopMessage>;
  return (
    candidate.type === "clipper:stop-render-child" &&
    candidate.reason === "cancel"
  );
}

// ─── Video export session ──────────────────────────────────────────────

export type VideoExportSession = {
  process: ChildProcessWithoutNullStreams;
  outputPath: string;
  closePromise: Promise<string | null>;
};

// ─── IPC wire types (mirror src/core/types.ts subset) ──────────────────

export type MotionMarker = { start: number; duration: number };

export type AdjustmentLayer = {
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

export type TransitionLayer = {
  id: string;
  name: string;
  start: number;
  duration: number;
  midPoint: number;
  effect: { effectId?: string; params?: Record<string, unknown> };
};

export type CompositionClip = {
  start?: number;
  duration: number;
  motionMarkers?: MotionMarker[];
};

export type Scene = {
  id: string;
  name: string;
  compositions: CompositionClip[];
  adjustmentLayers?: AdjustmentLayer[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
};

export type ProjectManifest = {
  id: string;
  name: string;
  resolution: { width: number; height: number };
  scenes: Scene[];
  assetsPath: string;
  editorState?: unknown;
};
