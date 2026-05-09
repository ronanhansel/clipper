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
  type ExportRenderMode,
  type StableSlowGridPreset,
  type StableSlowValidationSamples,
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

type ExportRenderTile = ExportCaptureTile & {
  fullWidth: number;
  fullHeight: number;
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
  sendFrame?: (frameIndex: number, frame: Buffer) => Promise<void>;
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
  let fullFrameExportCaptureDisabled = false;
  const stableSlowState: StableSlowCaptureState = {
    profileIndex: 0,
    preset: payload.stableSlowGridPreset ?? "safe",
    validationSamples: payload.stableSlowValidationSamples ?? 1,
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
        const useTileAwareRender =
          (payload.exportRenderMode ?? "renderer") !== "stable-slow" &&
          payload.renderSurface !== "preview-cache" &&
          exportWidth * exportHeight > MAX_FULL_FRAME_EXPORT_CAPTURE_PIXELS;
        const frame = useTileAwareRender
          ? await captureAdaptiveExportFrame(
              rendererWindow,
              payload.project,
              payload.scene,
              frameIndex,
              sceneTime,
              payload.frameRate,
              payload.tileHeight,
              exportWidth,
              exportHeight,
              deps,
              () => fullFrameExportCaptureDisabled,
              () => {
                fullFrameExportCaptureDisabled = true;
              },
            )
          : await captureRenderedExportFrame(
              rendererWindow,
              payload,
              frameIndex,
              sceneTime,
              exportWidth,
              exportHeight,
              deps,
              payload.exportRenderMode ?? "renderer",
              stableSlowState,
              () => fullFrameExportCaptureDisabled,
              () => {
                fullFrameExportCaptureDisabled = true;
              },
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
        if (!deps.sendFrame)
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
      try {
        bridgePort.close();
      } catch {
        /* ignore */
      }
      exportPostProcessBridgePorts.delete(rendererWindow);
      exportPostProcessBridgeBroken.delete(rendererWindow);
    }
    rendererWindow.destroy();
  }
  const frameCount = await deps.countContiguousSupervisedFrameFiles(
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

const MAX_FULL_FRAME_EXPORT_CAPTURE_PIXELS = 3840 * 2160;
const STABLE_SLOW_FULL_WIDTH = Number.MAX_SAFE_INTEGER;
const STABLE_SLOW_GRID_PROFILE_SETS: Record<
  StableSlowGridPreset,
  readonly { width: number; height: number }[]
> = {
  relaxed: [
    { width: STABLE_SLOW_FULL_WIDTH, height: 540 },
    { width: STABLE_SLOW_FULL_WIDTH, height: 360 },
    { width: STABLE_SLOW_FULL_WIDTH, height: 270 },
    { width: STABLE_SLOW_FULL_WIDTH, height: 180 },
    { width: 3840, height: 180 },
    { width: 2560, height: 135 },
    { width: 2048, height: 90 },
  ],
  balanced: [
    { width: STABLE_SLOW_FULL_WIDTH, height: 270 },
    { width: STABLE_SLOW_FULL_WIDTH, height: 180 },
    { width: 2560, height: 180 },
    { width: 2048, height: 135 },
    { width: 1536, height: 90 },
    { width: 1024, height: 54 },
    { width: 768, height: 36 },
  ],
  safe: [
    { width: 2048, height: 135 },
    { width: 1536, height: 90 },
    { width: 1024, height: 54 },
    { width: 768, height: 36 },
    { width: 512, height: 24 },
    { width: 384, height: 16 },
  ],
  extreme: [
    { width: 1024, height: 54 },
    { width: 768, height: 36 },
    { width: 512, height: 24 },
    { width: 384, height: 16 },
    { width: 256, height: 12 },
  ],
};
const STABLE_SLOW_MAX_DIFFERING_PIXEL_RATIO = 0.00001;
const STABLE_SLOW_MAX_AVERAGE_BYTE_DELTA = 0.0005;

function createExportRendererWindow(
  width: number,
  height: number,
): BrowserWindow {
  const initialHeight =
    width * height > MAX_FULL_FRAME_EXPORT_CAPTURE_PIXELS
      ? Math.min(height, 1080)
      : height;
  return new BrowserWindow({
    width,
    height: initialHeight,
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
      ...(EXPORT_WINDOW_PRELOAD_PATH
        ? { preload: EXPORT_WINDOW_PRELOAD_PATH }
        : {}),
    },
  });
}

// ─── Frame capture helpers ──────────────────────────────────────────────

async function captureRenderedExportFrame(
  window: BrowserWindow,
  payload: SupervisedRenderPayload,
  frameIndex: number,
  sceneTime: number,
  exportWidth: number,
  exportHeight: number,
  deps: FrameCaptureDeps,
  exportRenderMode: ExportRenderMode,
  stableSlowState: StableSlowCaptureState,
  isFullFrameDisabled: () => boolean,
  disableFullFrame: () => void,
): Promise<Buffer> {
  const syncResult = await renderExportFrame(
    window,
    payload.project,
    payload.scene,
    sceneTime,
    payload.frameRate,
    "export",
    exportWidth,
    exportHeight,
    undefined,
  );
  if (syncResult.failedCount > 0) {
    throw new Error(
      `Supervised renderer failed to pin ${syncResult.failedCount} animation(s) at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`,
    );
  }

  const postProcessPasses = getExportPostProcessPasses(syncResult);
  if (payload.renderSurface === "preview-cache") {
    return captureFullPreviewCacheFrame(
      window,
      frameIndex,
      sceneTime,
      exportWidth,
      exportHeight,
    );
  }
  if (exportRenderMode === "stable-slow") {
    return captureStableSlowExportFrame(
      window,
      frameIndex,
      sceneTime,
      exportWidth,
      exportHeight,
      stableSlowState,
    );
  }
  try {
    const drawElementFrame = await captureDrawElementExportFrame(
      window,
      frameIndex,
      sceneTime,
      exportWidth,
      exportHeight,
      postProcessPasses,
    );
    console.log(`[clipper export] mode=draw-element frame=${frameIndex + 1}`);
    return drawElementFrame;
  } catch (error) {
    console.warn(
      `[clipper export] draw-element capture failed on frame ${frameIndex + 1}; falling back to ${postProcessPasses.length > 0 ? "post-process capture" : "adaptive capture"}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (postProcessPasses.length > 0) {
    return captureAndPostProcessFullExportFrame(
      window,
      postProcessPasses,
      frameIndex,
      sceneTime,
      exportWidth,
      exportHeight,
    );
  }
  return captureAdaptiveExportFrame(
    window,
    payload.project,
    payload.scene,
    frameIndex,
    sceneTime,
    payload.frameRate,
    payload.tileHeight,
    exportWidth,
    exportHeight,
    deps,
    isFullFrameDisabled,
    disableFullFrame,
  );
}

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
  project: ProjectManifest,
  scene: Scene,
  frameIndex: number,
  sceneTime: number,
  frameRate: number,
  tileHeight: number,
  width: number,
  height: number,
  deps: FrameCaptureDeps,
): Promise<Buffer> {
  const frame = Buffer.allocUnsafe(width * height * 4);
  for (const tile of getExportCaptureTiles(tileHeight, width, height, deps)) {
    const exportTile = { ...tile, fullWidth: width, fullHeight: height };
    await applyTiledExportCaptureViewport(window, tile);
    const syncResult = await renderExportFrame(
      window,
      project,
      scene,
      sceneTime,
      frameRate,
      "export",
      width,
      height,
      exportTile,
    );
    if (syncResult.failedCount > 0) {
      throw new Error(
        `Supervised renderer failed to pin ${syncResult.failedCount} animation(s) for tile ${tile.x}-${tile.y} at ${sceneTime.toFixed(3)}s after ${syncResult.passCount} sync pass(es).`,
      );
    }
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

async function captureAdaptiveExportFrame(
  window: BrowserWindow,
  project: ProjectManifest,
  scene: Scene,
  frameIndex: number,
  sceneTime: number,
  frameRate: number,
  tileHeight: number,
  width: number,
  height: number,
  deps: FrameCaptureDeps,
  isFullFrameDisabled: () => boolean,
  disableFullFrame: () => void,
): Promise<Buffer> {
  const shouldTryFullFrameCapture =
    width * height <= MAX_FULL_FRAME_EXPORT_CAPTURE_PIXELS;
  if (shouldTryFullFrameCapture && !isFullFrameDisabled()) {
    try {
      return await captureFullExportFrameImageAsBgra(
        window,
        frameIndex,
        sceneTime,
        "full export",
        width,
        height,
      );
    } catch (error) {
      disableFullFrame();
      console.warn(
        `[clipper export] full-frame capture failed on frame ${frameIndex + 1}; falling back to tiled capture: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return captureTiledExportFrame(
    window,
    project,
    scene,
    frameIndex,
    sceneTime,
    frameRate,
    tileHeight,
    width,
    height,
    deps,
  );
}

type StableSlowCaptureState = {
  profileIndex: number;
  preset: StableSlowGridPreset;
  validationSamples: StableSlowValidationSamples;
};

async function captureStableSlowExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  width: number,
  height: number,
  captureState: StableSlowCaptureState,
): Promise<Buffer> {
  const frame = Buffer.allocUnsafe(width * height * 4);
  const profiles = STABLE_SLOW_GRID_PROFILE_SETS[captureState.preset];
  while (captureState.profileIndex < profiles.length) {
    const profile = profiles[captureState.profileIndex]!;
    try {
      console.log(
        `[clipper export] mode=stable-slow frame=${frameIndex + 1} grid=${formatStableSlowProfile(profile, width)} samples=${captureState.validationSamples}`,
      );
      for (const tile of getStableSlowExportCaptureTiles(
        width,
        height,
        profile,
      )) {
        const tileBitmap = await captureStableSlowTile(
          window,
          tile,
          frameIndex,
          sceneTime,
          captureState.validationSamples,
        );
        stitchBgraTile(frame, tileBitmap, tile, width);
      }
      return frame;
    } catch (error) {
      if (
        captureState.profileIndex >= profiles.length - 1 ||
        !isStableSlowTileReductionSignal(error)
      )
        throw error;
      captureState.profileIndex += 1;
      const nextProfile = profiles[captureState.profileIndex]!;
      console.warn(
        `[clipper export] mode=stable-slow reducing grid after frame ${frameIndex + 1} to ${formatStableSlowProfile(nextProfile, width)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `Stable slow export exhausted ${captureState.preset} grid profiles (${profiles.map((profile) => formatStableSlowProfile(profile, width)).join(" -> ")}) for frame ${frameIndex + 1}.`,
  );
}

async function captureStableSlowTile(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
  validationSamples: StableSlowValidationSamples,
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EXPORT_CAPTURE_TILE_RETRIES; attempt += 1) {
    try {
      await applyStableSlowExportCaptureViewport(window, tile);
      const samples: Buffer[] = [];
      for (
        let sampleIndex = 0;
        sampleIndex < validationSamples;
        sampleIndex += 1
      ) {
        const syncResult = await syncExportRenderClock(
          window,
          sceneTime,
          `stable slow frame ${frameIndex + 1} tile ${formatTileRange(tile)} sample ${sampleIndex + 1}`,
        );
        if (syncResult.failedCount > 0)
          throw new ExportTileUnstableError(
            `Stable slow export failed to repin ${syncResult.failedCount} animation(s) before frame ${frameIndex + 1} tile ${formatTileRange(tile)} sample ${sampleIndex + 1}.`,
          );
        samples.push(
          await captureStableSlowTileBitmap(
            window,
            tile,
            frameIndex,
            sceneTime,
          ),
        );
      }
      for (
        let sampleIndex = 1;
        sampleIndex < samples.length;
        sampleIndex += 1
      ) {
        validateMatchingExportBitmaps(
          samples[0]!,
          samples[sampleIndex]!,
          `Captured stable slow frame ${frameIndex + 1} tile ${formatTileRange(tile)} changed between validation samples at pinned time ${sceneTime.toFixed(3)}s`,
        );
      }
      return samples[0]!;
    } catch (error) {
      lastError = error;
      if (isStableSlowTileReductionSignal(error)) break;
    }
  }
  if (lastError instanceof ExportTileUnstableError) throw lastError;
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Failed to capture stable slow frame ${frameIndex + 1} tile ${formatTileRange(tile)} at ${sceneTime.toFixed(3)}s after ${EXPORT_CAPTURE_TILE_RETRIES} attempt(s): ${message}`,
  );
}

function getExportPostProcessPasses(
  syncResult: ExportFrameRenderResult,
): unknown[] {
  return Array.isArray(syncResult.postProcessPasses)
    ? syncResult.postProcessPasses
    : [];
}

async function captureDrawElementExportFrame(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  width: number,
  height: number,
  passes: unknown[],
): Promise<Buffer> {
  const result = (await withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperCaptureDrawElementExportFrame(${JSON.stringify({ width, height, passes })})`,
      true,
    ),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out waiting for DrawElement export frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  )) as {
    width?: unknown;
    height?: unknown;
    pixelFormat?: unknown;
    data?: unknown;
    dataBase64?: string;
  };
  if (!isValidRawFramePayload(result, width, height)) {
    throw new Error(
      `DrawElement export returned an invalid raw frame for frame ${frameIndex + 1}.`,
    );
  }
  return rawPostProcessFrameToBgraBuffer(result);
}

async function captureAndPostProcessFullExportFrame(
  window: BrowserWindow,
  passes: unknown[],
  frameIndex: number,
  sceneTime: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const image = await captureFullExportFrameImage(
    window,
    frameIndex,
    sceneTime,
    "post-process source",
    width,
    height,
  );
  const sourceBitmap = getBgraBitmap(
    image,
    width,
    height,
    `post-process source frame ${frameIndex + 1}`,
  );

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
      const droppedPassCount =
        typeof result.droppedPassCount === "number"
          ? result.droppedPassCount
          : 0;
      if (droppedPassCount > 0)
        console.warn(
          `[clipper export] postprocess dropped ${droppedPassCount} additional pass(es) on frame ${frameIndex + 1}.`,
        );
      return resultToBgraBuffer(result.outputFrame);
    } catch (error) {
      // Bridge failed — fall through to base64 fallback.
      // Keep the bridge marked as broken so subsequent frames skip it.
      markExportPostProcessBridgeBroken(window);
      console.warn(
        `[clipper export] port bridge failed for frame ${frameIndex + 1}, falling back to base64 route: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // ── Fallback: base64-through-executeJavaScript ──────────────────────

  const sourceFrame = {
    width,
    height,
    pixelFormat: "bgra",
    dataBase64: sourceBitmap.toString("base64"),
  };
  const result = (await withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperApplyExportRawPostProcessFrame(${JSON.stringify({ width, height, sourceFrame, passes })})`,
      true,
    ),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out applying export post-process for frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
  )) as {
    applied?: unknown;
    outputFrame?: unknown;
    droppedPassCount?: unknown;
  };
  if (!isValidRawPostProcessResult(result, width, height)) {
    throw new Error(
      `Export post-process failed to return a processed raw frame for ${passes.length} active pass(es) on frame ${frameIndex + 1} at ${sceneTime.toFixed(3)}s.`,
    );
  }
  const droppedPassCount =
    typeof result.droppedPassCount === "number" ? result.droppedPassCount : 0;
  if (droppedPassCount > 0)
    console.warn(
      `[clipper export] postprocess dropped ${droppedPassCount} additional pass(es) on frame ${frameIndex + 1}.`,
    );
  return rawPostProcessFrameToBgraBuffer(result.outputFrame);
}

// ─── Transferable port bridge ──────────────────────────────────────────────

const exportPostProcessBridgePorts = new WeakMap<
  BrowserWindow,
  MessagePortMain
>();

function getExportPostProcessBridge(
  window: BrowserWindow,
): MessagePortMain | null {
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
    try {
      port.close();
    } catch {
      /* ignore */
    }
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
): Promise<{
  outputFrame: {
    width: number;
    height: number;
    pixelFormat: "bgra" | "rgba";
    data: ArrayBuffer;
  };
  droppedPassCount: number;
}> {
  // Copy the buffer so the original is preserved for the base64 fallback
  // route in case the port bridge fails after transfer.
  const transferBuffer = Buffer.from(sourceBitmap);

  return withTimeout(
    new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${frameIndex}-${Math.random().toString(36).slice(2)}`;

      const handleMessage = (event: { data: unknown }) => {
        const msg = event.data as {
          type?: string;
          requestId?: string;
          applied?: unknown;
          pixelFormat?: unknown;
          droppedPassCount?: unknown;
          resultData?: unknown;
        } | null;
        if (!msg || msg.requestId !== requestId) return;

        port.removeListener("message", handleMessage);

        if (
          msg.type !== "clipper:export-postprocess-result" ||
          msg.applied !== true
        ) {
          reject(
            new Error(
              msg.type !== "clipper:export-postprocess-result"
                ? `Unexpected port message type "${String(msg.type)}" on frame ${frameIndex + 1}.`
                : `Export post-process port bridge reported no passes applied on frame ${frameIndex + 1}.`,
            ),
          );
          return;
        }

        const pixelFormat = msg.pixelFormat;
        if (pixelFormat !== "bgra" && pixelFormat !== "rgba") {
          reject(
            new Error(
              `Export post-process port bridge returned unsupported pixel format "${String(pixelFormat)}" on frame ${frameIndex + 1}.`,
            ),
          );
          return;
        }

        const resultData = msg.resultData;
        if (
          !(resultData instanceof ArrayBuffer) ||
          resultData.byteLength !== width * height * 4
        ) {
          reject(
            new Error(
              `Export post-process port bridge returned invalid pixel data on frame ${frameIndex + 1}.`,
            ),
          );
          return;
        }

        resolve({
          outputFrame: {
            width,
            height,
            pixelFormat,
            data: resultData,
          },
          droppedPassCount:
            typeof msg.droppedPassCount === "number" ? msg.droppedPassCount : 0,
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

function resultToBgraBuffer(frame: {
  width: number;
  height: number;
  pixelFormat: "bgra" | "rgba";
  data: ArrayBuffer;
}): Buffer {
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

async function captureFullExportFrameImageAsBgra(
  window: BrowserWindow,
  frameIndex: number,
  sceneTime: number,
  label: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const image = await captureFullExportFrameImage(
    window,
    frameIndex,
    sceneTime,
    label,
    width,
    height,
  );
  return getBgraBitmap(
    image,
    width,
    height,
    `${label} frame ${frameIndex + 1}`,
  );
}

function isValidRawPostProcessResult(
  result: unknown,
  width: number,
  height: number,
): result is {
  applied: true;
  outputFrame: {
    width: number;
    height: number;
    pixelFormat: "bgra" | "rgba";
    data?: unknown;
    dataBase64?: string;
  };
  droppedPassCount: number;
} {
  if (!result || typeof result !== "object") return false;
  const candidate = result as {
    applied?: unknown;
    outputFrame?: unknown;
    droppedPassCount?: unknown;
  };
  if (
    candidate.applied !== true ||
    typeof candidate.droppedPassCount !== "number" ||
    !candidate.outputFrame ||
    typeof candidate.outputFrame !== "object"
  )
    return false;
  const frame = candidate.outputFrame as {
    width?: unknown;
    height?: unknown;
    pixelFormat?: unknown;
    data?: unknown;
    dataBase64?: unknown;
  };
  if (frame.width !== width || frame.height !== height) return false;
  if (frame.pixelFormat !== "bgra" && frame.pixelFormat !== "rgba")
    return false;
  return getRawPostProcessFrameDataLength(frame) === width * height * 4;
}

function isValidRawFramePayload(
  frame: unknown,
  width: number,
  height: number,
): frame is {
  width: number;
  height: number;
  pixelFormat: "bgra" | "rgba";
  data?: unknown;
  dataBase64?: string;
} {
  if (!frame || typeof frame !== "object") return false;
  const candidate = frame as {
    width?: unknown;
    height?: unknown;
    pixelFormat?: unknown;
    data?: unknown;
    dataBase64?: string;
  };
  if (candidate.width !== width || candidate.height !== height) return false;
  if (candidate.pixelFormat !== "bgra" && candidate.pixelFormat !== "rgba")
    return false;
  return getRawPostProcessFrameDataLength(candidate) === width * height * 4;
}

function rawPostProcessFrameToBgraBuffer(frame: {
  width: number;
  height: number;
  pixelFormat: "bgra" | "rgba";
  data?: unknown;
  dataBase64?: string;
}): Buffer {
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

function getRawPostProcessFrameData(frame: {
  data?: unknown;
  dataBase64?: string;
}): Uint8Array {
  if (frame.data instanceof Uint8Array) return frame.data;
  if (frame.data instanceof ArrayBuffer) return new Uint8Array(frame.data);
  if (ArrayBuffer.isView(frame.data))
    return new Uint8Array(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.byteLength,
    );
  if (Array.isArray(frame.data)) return new Uint8Array(frame.data);
  if (typeof frame.dataBase64 === "string")
    return Buffer.from(frame.dataBase64, "base64");
  return new Uint8Array();
}

function getRawPostProcessFrameDataLength(frame: {
  data?: unknown;
  dataBase64?: unknown;
}): number {
  if (frame.data instanceof Uint8Array || frame.data instanceof ArrayBuffer)
    return frame.data.byteLength;
  if (ArrayBuffer.isView(frame.data)) return frame.data.byteLength;
  if (Array.isArray(frame.data)) return frame.data.length;
  if (typeof frame.dataBase64 === "string")
    return Buffer.byteLength(frame.dataBase64, "base64");
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

async function applyTiledExportCaptureViewport(
  window: BrowserWindow,
  tile: ExportCaptureTile,
): Promise<void> {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== tile.width || currentHeight !== tile.height)
    window.setContentSize(tile.width, tile.height, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
        document.documentElement.style.width = "${tile.width}px";
        document.documentElement.style.height = "${tile.height}px";
        document.documentElement.style.overflow = "hidden";
        document.body.style.width = "${tile.width}px";
        document.body.style.height = "${tile.height}px";
        document.body.style.overflow = "hidden";
        document.body.style.margin = "0";
        document.body.style.transformOrigin = "0 0";
        document.body.style.transform = "none";
        window.scrollTo(0, 0);
        return true;
      })()`,
      true,
    ),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    "Timed out applying tiled export capture viewport.",
  );
}

async function applyStableSlowExportCaptureViewport(
  window: BrowserWindow,
  tile: ExportCaptureTile,
): Promise<void> {
  const [currentWidth, currentHeight] = window.getContentSize();
  if (currentWidth !== tile.width || currentHeight !== tile.height)
    window.setContentSize(tile.width, tile.height, false);
  await withTimeout(
    window.webContents.executeJavaScript(
      `(() => {
        const offsetX = ${JSON.stringify(tile.x)};
        const offsetY = ${JSON.stringify(tile.y)};
        const fullWidth = ${JSON.stringify(tile.fullWidth ?? tile.width + tile.x)};
        const fullHeight = ${JSON.stringify(tile.fullHeight ?? tile.height + tile.y)};
        document.documentElement.style.width = "${tile.width}px";
        document.documentElement.style.height = "${tile.height}px";
        document.documentElement.style.overflow = "hidden";
        document.body.style.width = fullWidth + "px";
        document.body.style.height = fullHeight + "px";
        document.body.style.overflow = "hidden";
        document.body.style.margin = "0";
        document.body.style.transformOrigin = "0 0";
        document.body.style.transform = "translate3d(-" + offsetX + "px, -" + offsetY + "px, 0)";
        window.scrollTo(0, 0);
        return true;
      })()`,
      true,
    ),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    `Timed out applying stable slow export viewport for tile ${formatTileRange(tile)}.`,
  );
}

function getExportCaptureTiles(
  tileHeight: number,
  frameWidth: number,
  frameHeight: number,
  deps: FrameCaptureDeps,
): ExportCaptureTile[] {
  const exportTileHeight = deps.clampExportTileHeight(tileHeight, frameHeight);
  const maxTileWidth = getExportMaxTileWidth(frameWidth, frameHeight);
  const tiles: ExportCaptureTile[] = [];
  for (let y = 0; y < frameHeight; y += exportTileHeight) {
    for (let x = 0; x < frameWidth; x += maxTileWidth) {
      tiles.push({
        x,
        y,
        width: Math.min(maxTileWidth, frameWidth - x),
        height: Math.min(exportTileHeight, frameHeight - y),
      });
    }
  }
  return tiles;
}

function getExportMaxTileWidth(
  frameWidth: number,
  frameHeight: number,
): number {
  if (frameWidth * frameHeight <= MAX_FULL_FRAME_EXPORT_CAPTURE_PIXELS)
    return frameWidth;
  return Math.min(frameWidth, 2560);
}

function getStableSlowExportCaptureTiles(
  frameWidth: number,
  frameHeight: number,
  profile: { width: number; height: number },
): ExportCaptureTile[] {
  const tiles: ExportCaptureTile[] = [];
  const tileWidth = Math.min(profile.width, frameWidth);
  const tileHeight = Math.min(profile.height, frameHeight);
  for (let y = 0; y < frameHeight; y += tileHeight) {
    for (let x = 0; x < frameWidth; x += tileWidth) {
      tiles.push({
        x,
        y,
        width: Math.min(tileWidth, frameWidth - x),
        height: Math.min(tileHeight, frameHeight - y),
        fullWidth: frameWidth,
        fullHeight: frameHeight,
      });
    }
  }
  return tiles;
}

function formatStableSlowProfile(
  profile: { width: number; height: number },
  frameWidth: number,
): string {
  return `${profile.width >= STABLE_SLOW_FULL_WIDTH ? "full" : String(Math.min(profile.width, frameWidth))}x${profile.height}`;
}

function isStableSlowTileReductionSignal(error: unknown): boolean {
  if (error instanceof ExportTileUnstableError) return true;
  if (!(error instanceof Error)) return false;
  return /bitmap length|image size|memory|timed out/i.test(error.message);
}

function validateMatchingExportBitmaps(
  first: Buffer,
  second: Buffer,
  message: string,
): void {
  if (first.equals(second)) return;
  const diff = getBitmapDiffStats(first, second);
  if (!isAcceptableStableSlowReadbackDrift(diff))
    throw new ExportTileUnstableError(
      `${message} (${formatBitmapDiffStats(diff)}).`,
    );
}

function getBitmapDiffStats(left: Buffer, right: Buffer) {
  const length = Math.min(left.byteLength, right.byteLength);
  let differingBytes = Math.abs(left.byteLength - right.byteLength);
  let totalDelta = 0;
  let maxDelta = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs(left[index]! - right[index]!);
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
  return {
    differingBytes,
    differingPixelRatio: differingBytes / 4 / pixels,
    averageByteDelta: totalDelta / Math.max(1, length),
    maxDelta,
  };
}

function isAcceptableStableSlowReadbackDrift(
  diff: ReturnType<typeof getBitmapDiffStats>,
): boolean {
  return (
    diff.differingPixelRatio <= STABLE_SLOW_MAX_DIFFERING_PIXEL_RATIO &&
    diff.averageByteDelta <= STABLE_SLOW_MAX_AVERAGE_BYTE_DELTA
  );
}

function formatBitmapDiffStats(
  diff: ReturnType<typeof getBitmapDiffStats>,
): string {
  return `${diff.differingBytes} differing bytes, ${(diff.differingPixelRatio * 100).toFixed(4)}% pixel-equivalent ratio, avg byte delta ${diff.averageByteDelta.toFixed(4)}, max byte delta ${diff.maxDelta}`;
}

function formatTileRange(tile: ExportCaptureTile): string {
  return `${tile.x},${tile.y}-${tile.x + tile.width},${tile.y + tile.height}`;
}

class ExportTileUnstableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportTileUnstableError";
  }
}

async function syncExportRenderClock(
  window: BrowserWindow,
  sceneTime: number,
  context: string,
): Promise<ExportFrameRenderResult> {
  return withTimeout(
    window.webContents.executeJavaScript(
      "window.__clipperSyncExportRenderClock && window.__clipperSyncExportRenderClock()",
      true,
    ),
    EXPORT_RENDERER_FRAME_TIMEOUT_MS,
    `Timed out syncing render clock for ${context} at ${sceneTime.toFixed(3)}s.`,
  );
}

async function captureStableSlowTileBitmap(
  window: BrowserWindow,
  tile: ExportCaptureTile,
  frameIndex: number,
  sceneTime: number,
): Promise<Buffer> {
  const image = await withTimeout(
    window.webContents.capturePage({
      x: 0,
      y: 0,
      width: tile.width,
      height: tile.height,
    }),
    EXPORT_CAPTURE_TILE_TIMEOUT_MS,
    `Timed out capturing stable slow frame ${frameIndex + 1} tile ${formatTileRange(tile)} at ${sceneTime.toFixed(3)}s.`,
  );
  return getBgraBitmap(
    image,
    tile.width,
    tile.height,
    `stable slow frame ${frameIndex + 1} tile ${formatTileRange(tile)}`,
  );
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
        window.webContents.capturePage(),
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
  if (deps.sendFrame) {
    await deps.sendFrame(frameIndex, frame);
    return;
  }
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
  exportTile?: ExportRenderTile,
): Promise<ExportFrameRenderResult> {
  return withTimeout(
    window.webContents.executeJavaScript(
      `window.__clipperRenderExportFrame(${JSON.stringify({ project, scene, sceneTime, frameRate, renderMode, exportWidth, exportHeight, exportTile })})`,
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
  return Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
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
  return () => window.webContents.off("console-message", handleConsoleMessage);
}

function watchExportNativeStderrWarnings(
  state: ExportOomWarningState,
): () => void {
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
