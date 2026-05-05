import {
  BrowserWindow,
  MessageChannelMain,
  nativeImage,
  type MessagePortMain,
  type NativeImage,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type ExportFrameRenderResult = {
  failedCount: number;
  passCount: number;
  animationCount: number;
  pinnedCount: number;
  pendingReadyCount: number;
  layerCount: number;
  postProcessPasses?: unknown[];
};

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
  clampExportTileHeight: (value: number, maxHeight?: number) => number;
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
  const exportWidth = payload.exportWidth;
  const exportHeight = payload.exportHeight;
  const rendererWindow = createExportRendererWindow(exportWidth, exportHeight);
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
          "export",
          exportWidth,
          exportHeight,
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
        const postProcessPasses = getExportPostProcessPasses(syncResult);
        const frame = postProcessPasses.length > 0
          ? await captureAndPostProcessFullExportFrame(
              rendererWindow,
              postProcessPasses,
              frameIndex,
              sceneTime,
              exportWidth,
              exportHeight,
            )
          : payload.renderSurface === "preview-cache"
            ? await captureFullPreviewCacheFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
                exportWidth,
                exportHeight,
              )
            : await captureTiledExportFrame(
                rendererWindow,
                frameIndex,
                sceneTime,
                payload.tileHeight,
                exportWidth,
                exportHeight,
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
    const bridgePort = exportPostProcessBridgePorts.get(rendererWindow);
    if (bridgePort) {
      try { bridgePort.close(); } catch { /* ignore */ }
      exportPostProcessBridgePorts.delete(rendererWindow);
      exportPostProcessBridgeBroken.delete(rendererWindow);
    }
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

const EXPORT_WINDOW_PRELOAD_PATH = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return path.join(dir, "..", "preload-export.cjs");
  } catch {
    return undefined;
  }
})();

function createExportRendererWindow(width: number, height: number): BrowserWindow {
  return new BrowserWindow({
    width,
    height,
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
    ...(EXPORT_WINDOW_PRELOAD_PATH ? { preload: EXPORT_WINDOW_PRELOAD_PATH } : {}),
  },
});
}

// ─── Frame capture helpers ──────────────────────────────────────────────

async function captureFullPreviewCacheFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  width: number,
  height: number,
): Promise<Buffer> {
  await applyDefaultExportCaptureViewport(window, width, height);
  const image = await withTimeout(
    window.webContents.capturePage(),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    `Timed out capturing full preview-cache frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
  return getBgraBitmap(
    image,
    width,
    height,
    `full preview-cache frame ${frameIndex + 1}`,
  );
}

async function captureTiledExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  tileHeight: number,
  width: number,
  height: number,
  deps: FrameCaptureDeps,
): Promise<Buffer> {
  await applyDefaultExportCaptureViewport(window, width, height);
  const frame = Buffer.allocUnsafe(width * height * 4);
  for (const tile of getExportCaptureTiles(tileHeight, width, height, deps)) {
    const tileBitmap = await captureExportTileWithRetries(
      window,
      tile,
      frameIndex,
      sceneTime,
    );
    stitchBgraTile(frame, tileBitmap, tile, width);
  }
  return frame;
}

function getExportPostProcessPasses(syncResult: ExportFrameRenderResult): unknown[] {
  return Array.isArray(syncResult.postProcessPasses) ? syncResult.postProcessPasses : [];
}

async function captureAndPostProcessFullExportFrame(
  window: BrowserWindow,
  passes: unknown[],
  frameIndex: number,
  sceneTime: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const image = await captureFullExportFrameImage(window, frameIndex, sceneTime, "post-process source", width, height);
  const sourceBitmap = getBgraBitmap(image, width, height, `post-process source frame ${frameIndex + 1}`);

  // ── Primary path: transferable MessagePort bridge (zero-copy) ──────

  const bridge = getExportPostProcessBridge(window);
  if (bridge) {
    try {
      const result = await sendRawFrameViaPort(
        bridge,
        sourceBitmap,
        width,
        height,
        passes,
        frameIndex,
        sceneTime,
      );
      const droppedPassCount = typeof result.droppedPassCount === "number" ? result.droppedPassCount : 0;
      if (droppedPassCount > 0) console.warn(`[clipper export] postprocess dropped ${droppedPassCount} additional pass(es) on frame ${frameIndex + 1}.`);
      return resultToBgraBuffer(result.outputFrame);
    } catch (error) {
      // Bridge failed — fall through to base64 fallback.
      // Keep the bridge marked as broken so subsequent frames skip it.
      markExportPostProcessBridgeBroken(window);
      console.warn(`[clipper export] port bridge failed for frame ${frameIndex + 1}, falling back to base64 route: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ── Fallback: base64-through-executeJavaScript ──────────────────────

  const sourceFrame = {
    width,
    height,
    pixelFormat: "bgra",
    dataBase64: sourceBitmap.toString("base64"),
  };
  const result = await withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperApplyExportRawPostProcessFrame(${JSON.stringify({ width, height, sourceFrame, passes })})`,
      true,
    ),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out applying export post-process for frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  ) as { applied?: unknown; outputFrame?: unknown; droppedPassCount?: unknown };
  if (!isValidRawPostProcessResult(result, width, height)) {
    throw new Error(`Export post-process failed to return a processed raw frame for ${passes.length} active pass(es) on frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`);
  }
  const droppedPassCount = typeof result.droppedPassCount === "number" ? result.droppedPassCount : 0;
  if (droppedPassCount > 0) console.warn(`[clipper export] postprocess dropped ${droppedPassCount} additional pass(es) on frame ${frameIndex + 1}.`);
  return rawPostProcessFrameToBgraBuffer(result.outputFrame);
}

// ─── Transferable port bridge ──────────────────────────────────────────────

const exportPostProcessBridgePorts = new WeakMap<BrowserWindow, MessagePortMain>();

function getExportPostProcessBridge(window: BrowserWindow): MessagePortMain | null {
  // Return cached port if bridge was established and not marked broken.
  if (exportPostProcessBridgePorts.has(window)) {
    const port = exportPostProcessBridgePorts.get(window);
    if (port && !exportPostProcessBridgeBroken.has(window)) return port;
    return null;
  }

  // First call for this window: attempt to establish the bridge.
  if (!EXPORT_WINDOW_PRELOAD_PATH) return null; // preload not available

  try {
    const { port1, port2 } = new MessageChannelMain();
    window.webContents.postMessage(
      "clipper:export-postprocess-init",
      { type: "clipper:export-postprocess-init" },
      [port2],
    );
    exportPostProcessBridgePorts.set(window, port1);
    return port1;
  } catch {
    return null;
  }
}

const exportPostProcessBridgeBroken = new WeakSet<BrowserWindow>();

function markExportPostProcessBridgeBroken(window: BrowserWindow): void {
  exportPostProcessBridgeBroken.add(window);
  const port = exportPostProcessBridgePorts.get(window);
  if (port) {
    try { port.close(); } catch { /* ignore */ }
    exportPostProcessBridgePorts.delete(window);
  }
}

function sendRawFrameViaPort(
  port: MessagePortMain,
  sourceBitmap: Buffer,
  width: number,
  height: number,
  passes: unknown[],
  frameIndex: number,
  sceneTime: number,
): Promise<{ outputFrame: { width: number; height: number; pixelFormat: "bgra" | "rgba"; data: ArrayBuffer }; droppedPassCount: number }> {
  // Copy the buffer so the original is preserved for the base64 fallback
  // route in case the port bridge fails after transfer.
  const transferBuffer = Buffer.from(sourceBitmap);

  return withTimeout(
    new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${frameIndex}-${Math.random().toString(36).slice(2)}`;

      const handleMessage = (event: { data: unknown }) => {
        const msg = event.data as { type?: string; requestId?: string; applied?: unknown; pixelFormat?: unknown; droppedPassCount?: unknown; resultData?: unknown } | null;
        if (!msg || msg.requestId !== requestId) return;

        port.removeListener("message", handleMessage);

        if (msg.type !== "clipper:export-postprocess-result" || msg.applied !== true) {
          reject(new Error(
            msg.type !== "clipper:export-postprocess-result"
              ? `Unexpected port message type "${String(msg.type)}" on frame ${frameIndex + 1}.`
              : `Export post-process port bridge reported no passes applied on frame ${frameIndex + 1}.`,
          ));
          return;
        }

        const pixelFormat = msg.pixelFormat;
        if (pixelFormat !== "bgra" && pixelFormat !== "rgba") {
          reject(new Error(`Export post-process port bridge returned unsupported pixel format "${String(pixelFormat)}" on frame ${frameIndex + 1}.`));
          return;
        }

        const resultData = msg.resultData;
        if (!(resultData instanceof ArrayBuffer) || resultData.byteLength !== width * height * 4) {
          reject(new Error(`Export post-process port bridge returned invalid pixel data on frame ${frameIndex + 1}.`));
          return;
        }

        resolve({
          outputFrame: {
            width,
            height,
            pixelFormat,
            data: resultData,
          },
          droppedPassCount: typeof msg.droppedPassCount === "number" ? msg.droppedPassCount : 0,
        });
      };

      port.on("message", handleMessage);

      // Transfer a copy of the backing buffer via MessagePort so the
      // original sourceBitmap is preserved for the base64 fallback.
      const sourceBuffer = transferBuffer.buffer;
      port.postMessage(
        {
          type: "clipper:export-postprocess-request",
          requestId,
          width,
          height,
          pixelFormat: "bgra",
          passes,
          sourceData: sourceBuffer,
        },
        [sourceBuffer] as unknown as MessagePortMain[],
      );
    }),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out waiting for export post-process port result on frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
}

function resultToBgraBuffer(frame: { width: number; height: number; pixelFormat: "bgra" | "rgba"; data: ArrayBuffer }): Buffer {
  const bytes = new Uint8Array(frame.data);
  if (frame.pixelFormat === "bgra") return Buffer.from(bytes);
  const output = Buffer.allocUnsafe(bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 4) {
    output[index] = bytes[index + 2];
    output[index + 1] = bytes[index + 1];
    output[index + 2] = bytes[index];
    output[index + 3] = bytes[index + 3];
  }
  return output;
}

async function captureFullExportFrameImage(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  label: string,
  width: number,
  height: number,
): Promise<NativeImage> {
  await applyDefaultExportCaptureViewport(window, width, height);
  return withTimeout(
    window.webContents.capturePage(),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    `Timed out capturing ${label} frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  );
}

function isValidRawPostProcessResult(result: unknown, width: number, height: number): result is { applied: true; outputFrame: { width: number; height: number; pixelFormat: "bgra" | "rgba"; data?: unknown; dataBase64?: string }; droppedPassCount: number } {
  if (!result || typeof result !== "object") return false;
  const candidate = result as { applied?: unknown; outputFrame?: unknown; droppedPassCount?: unknown };
  if (candidate.applied !== true || typeof candidate.droppedPassCount !== "number" || !candidate.outputFrame || typeof candidate.outputFrame !== "object") return false;
  const frame = candidate.outputFrame as { width?: unknown; height?: unknown; pixelFormat?: unknown; data?: unknown; dataBase64?: unknown };
  if (frame.width !== width || frame.height !== height) return false;
  if (frame.pixelFormat !== "bgra" && frame.pixelFormat !== "rgba") return false;
  return getRawPostProcessFrameDataLength(frame) === width * height * 4;
}

function rawPostProcessFrameToBgraBuffer(frame: { width: number; height: number; pixelFormat: "bgra" | "rgba"; data?: unknown; dataBase64?: string }): Buffer {
  const bytes = getRawPostProcessFrameData(frame);
  if (frame.pixelFormat === "bgra") return Buffer.from(bytes);
  const output = Buffer.allocUnsafe(bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 4) {
    output[index] = bytes[index + 2];
    output[index + 1] = bytes[index + 1];
    output[index + 2] = bytes[index];
    output[index + 3] = bytes[index + 3];
  }
  return output;
}

function getRawPostProcessFrameData(frame: { data?: unknown; dataBase64?: string }): Uint8Array {
  if (frame.data instanceof Uint8Array) return frame.data;
  if (frame.data instanceof ArrayBuffer) return new Uint8Array(frame.data);
  if (ArrayBuffer.isView(frame.data)) return new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  if (Array.isArray(frame.data)) return new Uint8Array(frame.data);
  if (typeof frame.dataBase64 === "string") return Buffer.from(frame.dataBase64, "base64");
  return new Uint8Array();
}

function getRawPostProcessFrameDataLength(frame: { data?: unknown; dataBase64?: unknown }): number {
  if (frame.data instanceof Uint8Array || frame.data instanceof ArrayBuffer) return frame.data.byteLength;
  if (ArrayBuffer.isView(frame.data)) return frame.data.byteLength;
  if (Array.isArray(frame.data)) return frame.data.length;
  if (typeof frame.dataBase64 === "string") return Buffer.byteLength(frame.dataBase64, "base64");
  return -1;
}

async function applyDefaultExportCaptureViewport(
  window: BrowserWindow,
  width: number,
  height: number,
): Promise<void> {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== width || currentHeight !== height)
    window.setContentSize(width, height, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
        document.documentElement.style.width = "${width}px";
        document.documentElement.style.height = "${height}px";
        document.documentElement.style.overflow = "hidden";
        document.body.style.width = "${width}px";
        document.body.style.height = "${height}px";
        document.body.style.overflow = "hidden";
        document.body.style.margin = "0";
        document.body.style.transformOrigin = "0 0";
        document.body.style.transform = "none";
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
  frameWidth: number,
  frameHeight: number,
  deps: FrameCaptureDeps,
): ExportCaptureTile[] {
  const exportTileHeight = deps.clampExportTileHeight(tileHeight, frameHeight);
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
  frameWidth: number,
): void {
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
): Buffer {
  const expectedLength = width * height * 4;
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  if (bitmap.byteLength === expectedLength) return bitmap;
  const imageSize = image.getSize();
  throw new Error(
    `Captured ${context} bitmap length was ${bitmap.byteLength}; image size was ${imageSize.width}x${imageSize.height}, expected native ${width}x${height}.`,
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
  exportWidth?: number,
  exportHeight?: number,
): Promise<ExportFrameRenderResult> {
  return withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate, renderMode, exportWidth, exportHeight })})`,
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
