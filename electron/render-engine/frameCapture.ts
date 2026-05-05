import {
  BrowserWindow,
  type NativeImage,
} from "electron";
import fs from "node:fs/promises";

import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  EXPORT_CAPTURE_TILE_RETRIES,
  EXPORT_CAPTURE_TILE_TIMEOUT_MS,
  EXPORT_RENDERER_FRAME_TIMEOUT_MS,
  type ExportOomWarningState,
  type SupervisedRenderPayload,
  type ExportCaptureTile,
  type ExportFrameRange,
  type ProjectManifest,
  type Scene,
} from "./types.js";

// ─── Dependencies passed from RenderEngine ───────────────────────────────

export interface FrameCaptureDeps {
  loadExportWindow: (window: BrowserWindow) => Promise<void>;
  countContiguousSupervisedFrameFiles: (
    outputPath: string,
    frameRange: ExportFrameRange,
  ) => Promise<number>;
  getSupervisedFrameOutputPath: (
    outputPath: string,
    frameIndex: number,
  ) => string;
  clampExportTileHeight: (value: number) => number;
}

// ─── Exported pure helpers (also used by RenderEngine) ───────────────────

export function isExportOutOfMemoryWarning(message: string): boolean {
  return /tile memory limits exceeded|some content may not draw|cc\/tiles\/tile_manager|tile_manager\.cc|memory limits exceeded|raster[^\n]{0,80}memory|gpu[^\n]{0,80}memory|out[ -]?of[ -]?memory|\boom\b/i.test(
    message,
  );
}

export function getConsoleMessageText(args: unknown[]): string {
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

// ─── Main entry point ───────────────────────────────────────────────────

export async function renderSceneToRawFrames(
  payload: SupervisedRenderPayload,
  deps: FrameCaptureDeps,
  onFrameCaptured?: (frameIndex: number) => void,
  shouldStop?: () => boolean,
): Promise<{
  nativeWarningDetected: boolean;
  nativeWarningCount: number;
}> {
  const rendererWindow = createExportRendererWindow();
  const oomWarningState: ExportOomWarningState = {
    activePath: "renderer",
    totalWarnings: 0,
  };
  try {
    rendererWindow.webContents.setZoomFactor(1);
    rendererWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    await deps.loadExportWindow(rendererWindow);
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
        const frame =
          payload.renderSurface === "preview-cache"
            ? await captureFullPreviewCacheFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
              )
            : await captureTiledExportFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
                payload.tileHeight,
                deps,
              );
        if (shouldStop?.())
          return {
            nativeWarningDetected: oomWarningState.totalWarnings > 0,
            nativeWarningCount: oomWarningState.totalWarnings,
          };
        await writeSupervisedFrameOutput(
          payload.outputPath,
          frameIndex,
          frame,
          deps,
        );
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
  const frameCount =
    await deps.countContiguousSupervisedFrameFiles(
      payload.outputPath,
      payload.frameRange,
    );
  if (
    frameCount !==
    payload.frameRange.endFrame - payload.frameRange.startFrame
  ) {
    throw new Error(
      `Supervised export child produced ${frameCount} frame file(s); expected ${payload.frameRange.endFrame - payload.frameRange.startFrame}.`,
    );
  }
  return {
    nativeWarningDetected: oomWarningState.totalWarnings > 0,
    nativeWarningCount: oomWarningState.totalWarnings,
  };
}

// ─── Export window ──────────────────────────────────────────────────────

function createExportRendererWindow(): BrowserWindow {
  return new BrowserWindow({
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    useContentSize: true,
    show: false,
    focusable: false,
    frame: false,
    skipTaskbar: true,
    backgroundColor: "#000000",
    transparent: false,
    title: "Clipper Renderer",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1,
    },
  });
}

// ─── Frame capture helpers ──────────────────────────────────────────────

async function captureFullPreviewCacheFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
): Promise<Buffer> {
  await applyDefaultExportCaptureViewport(window);
  const image = await withTimeout(
    window.webContents.capturePage(),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    `Timed out capturing full preview-cache frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
  return getBgraBitmap(
    image,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    `full preview-cache frame ${frameIndex + 1}`,
  );
}

async function captureTiledExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  tileHeight: number,
  deps: FrameCaptureDeps,
): Promise<Buffer> {
  await applyDefaultExportCaptureViewport(window);
  const frame = Buffer.allocUnsafe(FRAME_WIDTH * FRAME_HEIGHT * 4);
  for (const tile of getExportCaptureTiles(tileHeight, deps)) {
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

async function applyDefaultExportCaptureViewport(
  window: BrowserWindow,
): Promise<void> {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== FRAME_WIDTH || currentHeight !== FRAME_HEIGHT)
    window.setContentSize(FRAME_WIDTH, FRAME_HEIGHT, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
        document.documentElement.style.width = "${FRAME_WIDTH}px";
        document.documentElement.style.height = "${FRAME_HEIGHT}px";
        document.documentElement.style.overflow = "hidden";
        document.body.style.width = "${FRAME_WIDTH}px";
        document.body.style.height = "${FRAME_HEIGHT}px";
        document.body.style.overflow = "hidden";
        document.body.style.margin = "0";
        document.body.style.transformOrigin = "0 0";
        document.body.style.transform = "translate3d(0, 0, 0)";
        return true;
      })()`,
      true,
    ),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    "Timed out applying default export capture viewport.",
  );
}

function getExportCaptureTiles(
  tileHeight: number,
  deps: FrameCaptureDeps,
): ExportCaptureTile[] {
  const exportTileHeight = deps.clampExportTileHeight(tileHeight);
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < FRAME_HEIGHT; y += exportTileHeight) {
    tiles.push({
      x: 0,
      y,
      width: FRAME_WIDTH,
      height: Math.min(exportTileHeight, FRAME_HEIGHT - y),
    });
  }
  return tiles;
}

async function captureExportTileWithRetries(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EXPORT_CAPTURE_TILE_RETRIES; attempt += 1) {
    try {
      const image = await withTimeout(
        window.webContents.capturePage(tile),
        EXPORT_CAPTURE_TILE_TIMEOUT_MS,
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
    `Failed to capture export frame ${frameIndex + 1} tile ${tile.y}-${tile.y + tile.height} at ${sceneTime.toFixed(3)}s after ${EXPORT_CAPTURE_TILE_RETRIES} attempt(s): ${message}`,
  );
}

function stitchBgraTile(
  frame: Buffer,
  tileBitmap: Buffer,
  tile: ExportCaptureTile,
): void {
  const bytesPerPixel = 4;
  const sourceStride = tile.width * bytesPerPixel;
  const targetStride = FRAME_WIDTH * bytesPerPixel;
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
): Buffer {
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

async function writeSupervisedFrameOutput(
  outputPath: string,
  frameIndex: number,
  frame: Buffer,
  deps: FrameCaptureDeps,
): Promise<void> {
  const framePath = deps.getSupervisedFrameOutputPath(outputPath, frameIndex);
  const tempFramePath = `${framePath}.tmp-${process.pid}`;
  await fs.writeFile(tempFramePath, frame);
  await fs.rename(tempFramePath, framePath);
}

async function renderExportFrame(
  window: BrowserWindow,
  project: ProjectManifest,
  scene: Scene,
  sceneTime: number,
  frameRate: number,
  renderMode: "preview" | "export" = "export",
): Promise<{
  failedCount: number;
  passCount: number;
  animationCount: number;
  pinnedCount: number;
  pendingReadyCount: number;
  layerCount: number;
}> {
  return withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate, renderMode })})`,
      true,
    ),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out waiting ${EXPORT_RENDERER_FRAME_TIMEOUT_MS}ms for export renderer frame at ${sceneTime.toFixed(3)}s.`,
  );
}

function getExportFrameTime(
  frameIndex: number,
  frameRate: number,
  durationSeconds: number,
): number {
  return Math.min(
    frameIndex / frameRate,
    Math.max(durationSeconds - 0.001, 0),
  );
}

// ─── OOM warning monitoring ─────────────────────────────────────────────

function watchExportOutOfMemoryWarnings(
  window: BrowserWindow,
  state: ExportOomWarningState,
): () => void {
  const handleConsoleMessage = (...args: unknown[]) => {
    const message = getConsoleMessageText(args);
    markExportOomWarning(state, message, "console");
  };
  window.webContents.on("console-message", handleConsoleMessage);
  return () =>
    window.webContents.off("console-message", handleConsoleMessage);
}

function watchExportNativeStderrWarnings(
  state: ExportOomWarningState,
): () => void {
  const originalWrite = process.stderr.write.bind(
    process.stderr,
  ) as typeof process.stderr.write;
  let handlingStderr = false;
  process.stderr.write = ((
    chunk: string | Uint8Array,
    ...args: unknown[]
  ) => {
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
): void {
  if (!isExportOutOfMemoryWarning(message)) return;
  state.totalWarnings += 1;
  if (options.log !== false)
    console.warn(
      `[clipper export] native-oom-warning source=${source} path=${state.activePath}: ${message.trim()}`,
    );
}

// ─── Utility ────────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
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
