import {
  Component,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from "react";
import { FramePreview } from "../../components/preview/FramePreview";
import { buildAdjustmentExecutionPlan } from "../../core/adjustments";
import { CAMERA_PERSPECTIVE } from "../../core/camera";
import {
  applyExportPostProcessFrame,
  applyExportRawPostProcessFrame,
  readCanvasToRawFrame,
  rgbaBytesToBgra,
  type ExportPostProcessFrameRequest,
  type ExportPostProcessFrameResult,
  type ExportRawFramePayload,
  type ExportRawPostProcessFrameRequest,
  type ExportRawPostProcessFrameResult,
} from "../../core/effects/postprocess/exportFrameBridge";
import { withPostProcessFrameBackground } from "../../core/effects/postprocess/passes";
import {
  createDefaultExportPostProcessRenderers,
  type PostProcessRenderer,
} from "../../core/effects/postprocess/registry";
import type { PostProcessPass } from "../../core/effects/types";
import {
  waitForRenderClockAnimationsReady,
  type RenderClockReadinessResult,
} from "../../render-engine/renderClock";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type ProjectManifest,
  type Scene,
} from "../../core/types";
import {
  deriveFramePreviewRenderModel,
  getFramePreviewTimelineLayers,
} from "../state/framePreviewRenderModel";

type ExportFrameRequest = {
  project: ProjectManifest;
  scene: Scene;
  sceneTime: number;
  frameRate: number;
  renderMode?: "preview" | "export";
  exportWidth?: number;
  exportHeight?: number;
  exportTile?: {
    x: number;
    y: number;
    width: number;
    height: number;
    fullWidth: number;
    fullHeight: number;
  };
};

declare global {
  interface Window {
    __clipperRenderExportFrame?: (
      request: ExportFrameRequest,
    ) => Promise<ExportFrameRenderResult>;
    __clipperSyncExportRenderClock?: () => Promise<RenderClockReadinessResult>;
    __clipperApplyExportPostProcessFrame?: (
      request: ExportPostProcessFrameRequest,
    ) => Promise<ExportPostProcessFrameResult>;
    __clipperApplyExportRawPostProcessFrame?: (
      request: ExportRawPostProcessFrameRequest,
    ) => Promise<ExportRawPostProcessFrameResult>;
    __clipperCaptureDrawElementExportFrame?: (request?: {
      width?: number;
      height?: number;
      passes?: PostProcessPass[];
    }) => Promise<ExportRawFramePayload>;
  }
}

type ExportFrameRenderResult = RenderClockReadinessResult & {
  postProcessPasses: PostProcessPass[];
};

const identityCameraTransform = {
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  rotation: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: CAMERA_PERSPECTIVE,
  motionBlur: 0,
};
const noopPointerHandler = () => {};
const noopObjectPointerHandler = () => {};
const noopObjectResizeHandler = () => {};
const noopTextCommit = () => {};
const noopTextDoubleClick = () => {};
const noopTrackerPick = () => {};
const exportFrameReadyTimeoutMs = 5000;

type PendingFrameRequest = {
  resolve: (result: ExportFrameRenderResult) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};
type ExportFramePreviewRefs = {
  cameraRef: RefObject<HTMLDivElement | null>;
  dragSelectionBoxRef: RefObject<HTMLDivElement | null>;
  frameViewportRef: RefObject<HTMLDivElement | null>;
};

export function RenderedMediaExportApp() {
  const [request, setRequest] = useState<ExportFrameRequest | null>(null);
  const pendingRequestRef = useRef<PendingFrameRequest | null>(null);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const drawElementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const postProcessRenderersRef = useRef<Map<string, PostProcessRenderer>>(
    new Map(),
  );

  useLayoutEffect(() => {
    window.__clipperRenderExportFrame = (nextRequest) =>
      new Promise((resolve, reject) => {
        rejectPendingFrame(
          pendingRequestRef,
          new Error("Superseded by a newer export frame request."),
        );
        const timeoutId = window.setTimeout(() => {
          rejectPendingFrame(
            pendingRequestRef,
            new Error(
              `Timed out waiting ${exportFrameReadyTimeoutMs}ms for export frame render.`,
            ),
          );
        }, exportFrameReadyTimeoutMs);
        pendingRequestRef.current = { resolve, reject, timeoutId };
        setRequest(nextRequest);
      });
    window.__clipperSyncExportRenderClock = async () => {
      await waitForFontsReady();
      await waitForExportRastersReady(frameViewportRef.current);
      await waitForThreeLayersReady(frameViewportRef.current);
      const syncResult = await waitForRenderClockAnimationsReady(
        frameViewportRef.current,
      );
      await nextAnimationFrame();
      return syncResult;
    };
    window.__clipperApplyExportPostProcessFrame = (postProcessRequest) => {
      return applyExportPostProcessFrame(
        postProcessRequest,
        createDefaultExportPostProcessRenderers(
          postProcessRenderersRef.current,
        ),
      );
    };
    window.__clipperApplyExportRawPostProcessFrame = (postProcessRequest) => {
      return applyExportRawPostProcessFrame(
        postProcessRequest,
        createDefaultExportPostProcessRenderers(
          postProcessRenderersRef.current,
        ),
      );
    };
    window.__clipperCaptureDrawElementExportFrame = async (captureRequest) => {
      await nextAnimationFrame();
      const sourceFrame = captureDrawElementExportFrame(
        frameViewportRef.current,
        drawElementCanvasRef.current,
      );
      if (!captureRequest?.passes?.length) return sourceFrame;
      const result = await applyExportRawPostProcessFrame(
        {
          width: captureRequest.width ?? sourceFrame.width,
          height: captureRequest.height ?? sourceFrame.height,
          sourceFrame,
          passes: captureRequest.passes,
        },
        createDefaultExportPostProcessRenderers(
          postProcessRenderersRef.current,
        ),
      );
      if (!result.applied) return sourceFrame;
      return normalizeExportFramePayloadForBridge(result.outputFrame);
    };

    // ── Transferable port bridge handler ────────────────────────────────

    let bridgeActive = true;

    const handleBridgeFrame = async (event: MessageEvent) => {
      if (!bridgeActive) return;
      if (event.data?.type !== "clipper:export-postprocess-frame") return;

      const { requestId, width, height, pixelFormat, passes, sourceData } =
        event.data as {
          requestId: string;
          width: number;
          height: number;
          pixelFormat: string;
          passes: PostProcessPass[];
          sourceData: ArrayBuffer;
        };

      if (!requestId || !(sourceData instanceof ArrayBuffer)) return;

      try {
        const result = await applyExportRawPostProcessFrame(
          {
            width,
            height,
            sourceFrame: {
              width,
              height,
              pixelFormat: pixelFormat as "bgra" | "rgba",
              data: sourceData,
            },
            passes,
          },
          createDefaultExportPostProcessRenderers(
            postProcessRenderersRef.current,
          ),
        );

        const resultData =
          result.outputFrame.data instanceof Uint8Array
            ? result.outputFrame.data.buffer.slice(
                result.outputFrame.data.byteOffset,
                result.outputFrame.data.byteOffset +
                  result.outputFrame.data.byteLength,
              )
            : result.outputFrame.data instanceof ArrayBuffer
              ? result.outputFrame.data
              : new Uint8Array().buffer;

        window.postMessage(
          {
            type: "clipper:export-postprocess-result",
            requestId,
            applied: result.applied,
            pixelFormat: result.outputFrame.pixelFormat,
            droppedPassCount: result.droppedPassCount,
            resultData,
          },
          "*",
          resultData.byteLength > 0 ? [resultData] : [],
        );
      } catch (error) {
        // Send error back through the bridge so the main process can
        // fall back to the base64 route.
        window.postMessage(
          {
            type: "clipper:export-postprocess-result",
            requestId,
            applied: false,
            pixelFormat: "rgba",
            droppedPassCount: 0,
            resultData: new Uint8Array(0).buffer,
          },
          "*",
        );
      }
    };

    window.addEventListener("message", handleBridgeFrame);

    return () => {
      bridgeActive = false;
      rejectPendingFrame(
        pendingRequestRef,
        new Error("Export renderer unmounted before frame completed."),
      );
      destroyPostProcessRenderers(postProcessRenderersRef.current);
      window.removeEventListener("message", handleBridgeFrame);
      delete window.__clipperRenderExportFrame;
      delete window.__clipperSyncExportRenderClock;
      delete window.__clipperApplyExportPostProcessFrame;
      delete window.__clipperApplyExportRawPostProcessFrame;
      delete window.__clipperCaptureDrawElementExportFrame;
    };
  }, []);

  useLayoutEffect(() => {
    if (!request || !pendingRequestRef.current) return;
    let cancelled = false;
    const waitForFrame = async () => {
      try {
        const syncResult =
          (await window.__clipperSyncExportRenderClock?.()) ??
          (await waitForRenderClockAnimationsReady(frameViewportRef.current));
        if (!cancelled)
          resolvePendingFrame(pendingRequestRef, {
            ...syncResult,
            postProcessPasses: getExportPostProcessPasses(request),
          });
      } catch (error) {
        if (!cancelled) rejectPendingFrame(pendingRequestRef, toError(error));
      }
    };
    waitForFrame();
    return () => {
      cancelled = true;
    };
  }, [request]);

  const viewportWidth =
    request?.exportTile?.width ?? request?.exportWidth ?? FRAME_WIDTH;
  const viewportHeight =
    request?.exportTile?.height ?? request?.exportHeight ?? FRAME_HEIGHT;

  return (
    <main
      className="relative overflow-hidden bg-black"
      style={{ width: viewportWidth, height: viewportHeight }}
    >
      <div
        className="absolute left-0 top-0 overflow-hidden bg-black"
        style={{ width: viewportWidth, height: viewportHeight }}
      >
        <ExportRenderErrorBoundary
          onError={(error) => rejectPendingFrame(pendingRequestRef, error)}
          resetKey={
            request ? `${request.scene.id}:${request.sceneTime}` : "empty"
          }
        >
          {request ? (
            <ExportFramePreview
              key={request.scene.id}
              refs={{ cameraRef, dragSelectionBoxRef, frameViewportRef }}
              request={request}
            />
          ) : (
            <div className="h-full w-full bg-black" />
          )}
        </ExportRenderErrorBoundary>
      </div>
      <canvas
        aria-hidden="true"
        ref={drawElementCanvasRef}
        className="pointer-events-none absolute left-0 top-0 -z-10 block opacity-0"
        data-clipper-draw-element-export-canvas="alpha"
        height={viewportHeight}
        layoutSubtree=""
        style={{ width: viewportWidth, height: viewportHeight }}
        width={viewportWidth}
      />
    </main>
  );
}

function destroyPostProcessRenderers(
  renderers: Map<string, PostProcessRenderer>,
) {
  for (const renderer of renderers.values()) renderer.destroy();
  renderers.clear();
}

function captureDrawElementExportFrame(
  sourceElement: Element | null,
  canvas: HTMLCanvasElement | null,
): ExportRawFramePayload {
  if (!sourceElement || !canvas)
    throw new Error("DrawElement export capture source is not mounted.");
  const context = canvas.getContext("2d") as
    | (CanvasRenderingContext2D & {
        drawElementImage?: (
          element: Element,
          x: number,
          y: number,
          width: number,
          height: number,
        ) => unknown;
      })
    | null;
  if (!context || typeof context.drawElementImage !== "function")
    throw new Error(
      "DrawElement export capture is unavailable in this browser.",
    );

  const width = Math.max(1, Math.round(canvas.width));
  const height = Math.max(1, Math.round(canvas.height));
  context.clearRect(0, 0, width, height);
  context.drawElementImage(sourceElement, 0, 0, width, height);
  return readCanvasToRawFrame(canvas, width, height);
}

function normalizeExportFramePayloadForBridge(
  frame: ExportRawFramePayload,
): ExportRawFramePayload {
  const bytes = getExportRawFrameBytes(frame);
  const outputBytes =
    frame.pixelFormat === "bgra" ? bytes : rgbaBytesToBgra(bytes);
  return {
    width: frame.width,
    height: frame.height,
    pixelFormat: "bgra",
    dataBase64: bytesToBase64(outputBytes),
  };
}

function getExportRawFrameBytes(frame: ExportRawFramePayload) {
  if (frame.data instanceof Uint8Array) return frame.data;
  if (frame.data instanceof ArrayBuffer) return new Uint8Array(frame.data);
  if (Array.isArray(frame.data)) return new Uint8Array(frame.data);
  if (typeof frame.dataBase64 === "string")
    return base64ToBytes(frame.dataBase64);
  throw new Error("DrawElement export frame did not include pixel data.");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function ExportFramePreview({
  refs,
  request,
}: {
  refs: ExportFramePreviewRefs;
  request: ExportFrameRequest;
}) {
  const frameScale = getExportFrameScale(request);
  const framePreviewProps = useMemo(() => {
    const { project, scene, sceneTime, frameRate } = request;
    const previewModel = deriveFramePreviewRenderModel({
      blankPart: blankPreviewComposition,
      frameRate,
      scene,
      sceneTime,
      timelineLayers: getFramePreviewTimelineLayers(project, scene.id),
      timelineMode: "composition",
    });
    const activeTimelinePart = previewModel.activeTimelinePart;
    const partStart =
      activeTimelinePart?.start ?? previewModel.adjustedSceneTime;

    return {
      cameraRef: refs.cameraRef,
      dragBox: null,
      dragSelectionBoxRef: refs.dragSelectionBoxRef,
      framePickPoint: null,
      focusPicking: false,
      trackerPicking: false,
      canSelectObjects: false,
      cameraTransform: identityCameraTransform,
      frameViewportRef: refs.frameViewportRef,
      frameScale,
      exportTileViewport: request.exportTile
        ? {
            x: request.exportTile.x,
            y: request.exportTile.y,
            width: request.exportTile.width,
            height: request.exportTile.height,
          }
        : undefined,
      isPlaying: false,
      renderMode: request.renderMode ?? ("export" as const),
      part: previewModel.part,
      partStart,
      previewParts: previewModel.previewParts,
      transitionPreviewParts: previewModel.transitionPreviewParts,
      adjustmentLayers: previewModel.visibleAdjustmentLayers,
      transitionLayers: previewModel.transitionLayers,
      playbackClock: {
        startedAt: 0,
        startedFrom: previewModel.adjustedSceneTime - partStart,
      },
      previewTime: previewModel.previewTime,
      sceneTime,
      timelineMode: "composition" as const,
      motionLayers: previewModel.motionLayers,
      hiddenMotionLayerIds: previewModel.hiddenMotionLayerIds,
      pickingTranslationPosition: false,
      pickingZoomFocus: false,
      compHidden: false,
      selectedObjects: [],
      marqueeDragging: false,
      editingTextObjectId: null,
      onFramePointerCancel: noopPointerHandler,
      onFramePointerDown: noopPointerHandler,
      onFramePointerDownCapture: noopPointerHandler,
      onFramePointerMove: noopPointerHandler,
      onFramePointerUp: noopPointerHandler,
      onObjectPointerDown: noopObjectPointerHandler,
      onObjectResizePointerDown: noopObjectResizeHandler,
      onTextEditCommit: noopTextCommit,
      onTextObjectDoubleClick: noopTextDoubleClick,
      onTrackerTargetPick: noopTrackerPick,
    };
  }, [
    frameScale,
    refs.cameraRef,
    refs.dragSelectionBoxRef,
    refs.frameViewportRef,
    request,
  ]);

  return framePreviewProps ? (
    <FramePreview {...framePreviewProps} />
  ) : (
    <div className="h-full w-full bg-black" />
  );
}

export function getExportFrameScale(request: {
  exportWidth?: number;
  exportHeight?: number;
}) {
  const widthScale = (request.exportWidth ?? FRAME_WIDTH) / FRAME_WIDTH;
  const heightScale = (request.exportHeight ?? FRAME_HEIGHT) / FRAME_HEIGHT;
  if (
    !Number.isFinite(widthScale) ||
    !Number.isFinite(heightScale) ||
    widthScale <= 0 ||
    heightScale <= 0
  )
    return 1;
  return Math.min(widthScale, heightScale);
}

function getExportFullSize(request: ExportFrameRequest) {
  return {
    width: request.exportTile?.fullWidth ?? request.exportWidth ?? FRAME_WIDTH,
    height:
      request.exportTile?.fullHeight ?? request.exportHeight ?? FRAME_HEIGHT,
  };
}

export function getExportPostProcessPasses(
  request: ExportFrameRequest,
): PostProcessPass[] {
  const { width: exportWidth, height: exportHeight } =
    getExportFullSize(request);
  const previewModel = deriveFramePreviewRenderModel({
    blankPart: blankPreviewComposition,
    frameRate: request.frameRate,
    scene: request.scene,
    sceneTime: request.sceneTime,
    timelineLayers: getFramePreviewTimelineLayers(
      request.project,
      request.scene.id,
    ),
    timelineMode: "composition",
  });
  return buildAdjustmentExecutionPlan(
    request.sceneTime,
    previewModel.visibleAdjustmentLayers,
    request.frameRate,
    { width: exportWidth, height: exportHeight },
  )
    .steps.flatMap((step) => step.postProcessPasses ?? [])
    .map((pass) =>
      withPostProcessFrameBackground(
        pass,
        previewModel.part.frame.style.background,
      ),
    );
}

const blankPreviewComposition: CompositionClip = {
  id: "__blank_export_preview__",
  filePath: "",
  duration: 1,
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: { background: "#050505" },
  },
  background: {
    id: "background",
    name: "Background",
    style: { background: "#050505" },
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function resolvePendingFrame(
  ref: { current: PendingFrameRequest | null },
  result: ExportFrameRenderResult,
) {
  const pending = ref.current;
  if (!pending) return;
  ref.current = null;
  window.clearTimeout(pending.timeoutId);
  pending.resolve(result);
}

function rejectPendingFrame(
  ref: { current: PendingFrameRequest | null },
  error: Error,
) {
  const pending = ref.current;
  if (!pending) return;
  ref.current = null;
  window.clearTimeout(pending.timeoutId);
  pending.reject(error);
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForExportSvgRastersReady(root: HTMLElement | null) {
  return waitForExportRastersReady(root);
}

export async function waitForExportRastersReady(root: HTMLElement | null) {
  const deadline = performance.now() + exportFrameReadyTimeoutMs;
  while (true) {
    const failed = root?.querySelector<HTMLElement>(
      '[data-clipper-export-svg-raster="failed"]',
    );
    if (failed) {
      const message =
        failed.dataset.clipperExportSvgRasterError ||
        "Export SVG rasterization failed.";
      logExportDiagnostic("raster-failed", [message]);
      throw new Error(message);
    }
    const failedWebLayerFlatten = root?.querySelector<HTMLElement>(
      '[data-clipper-export-weblayer-flatten="failed"]',
    );
    if (failedWebLayerFlatten) {
      const message =
        failedWebLayerFlatten.dataset.clipperExportWeblayerFlattenError ||
        "Export WebLayer flattening failed.";
      logExportDiagnostic("weblayer-flatten-failed", [message]);
      throw new Error(message);
    }
    const pending = root?.querySelector(
      '[data-clipper-export-svg-raster="pending"]',
    );
    const loadingImage = Array.from(
      root?.querySelectorAll<HTMLImageElement>(
        'img[data-clipper-export-svg-raster="ready"]',
      ) ?? [],
    ).find((image) => !image.complete || image.naturalWidth === 0);
    const loadingWebLayerImage = Array.from(
      root?.querySelectorAll<HTMLImageElement>(
        'img[data-clipper-export-weblayer-flatten="ready"]',
      ) ?? [],
    ).find((image) => !image.complete || image.naturalWidth === 0);
    if (!pending && !loadingImage && !loadingWebLayerImage) return;
    if (performance.now() > deadline) {
      const details = getExportRasterReadinessDiagnostics(root);
      const message = [
        "Timed out waiting for export raster/WebLayer readiness.",
        ...details,
      ].join(" ");
      logExportDiagnostic("raster-timeout", [message]);
      throw new Error(message);
    }
    await nextAnimationFrame();
  }
}

export function getExportRasterReadinessDiagnostics(root: HTMLElement | null) {
  const pending = Array.from(
    root?.querySelectorAll<HTMLElement>(
      '[data-clipper-export-svg-raster="pending"]',
    ) ?? [],
  )
    .slice(0, 3)
    .map(
      (element, index) =>
        `pending${index + 1}=${element.dataset.clipperExportSvgRasterDiagnostic ?? "unknown"}`,
    );
  const loading = Array.from(
    root?.querySelectorAll<HTMLImageElement>(
      'img[data-clipper-export-svg-raster="ready"]',
    ) ?? [],
  )
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .slice(0, 3)
    .map(
      (image, index) =>
        `loadingImage${index + 1}=${image.dataset.clipperExportSvgRasterDiagnostic ?? "unknown"}`,
    );
  const loadingWebLayer = Array.from(
    root?.querySelectorAll<HTMLImageElement>(
      'img[data-clipper-export-weblayer-flatten="ready"]',
    ) ?? [],
  )
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .slice(0, 3)
    .map(
      (image, index) =>
        `loadingWebLayer${index + 1}=${image.dataset.clipperExportWeblayerFlattenDiagnostic ?? "unknown"}`,
    );
  return [...pending, ...loading, ...loadingWebLayer];
}

async function waitForThreeLayersReady(root: HTMLElement | null) {
  const deadline = performance.now() + exportFrameReadyTimeoutMs;
  while (root?.querySelector("[data-clipper-three-pending]")) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for ThreeLayer readiness.");
    await nextAnimationFrame();
  }
}

function logExportDiagnostic(kind: string, details: string[]) {
  console.error(
    ["CLIPPER_EXPORT_DIAGNOSTIC", `kind=${kind}`, ...details]
      .join(" ")
      .slice(0, 2000),
  );
}

async function waitForFontsReady() {
  const fonts = "fonts" in document ? document.fonts : undefined;
  if (!fonts?.ready) return;
  await fonts.ready;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

class ExportRenderErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void; resetKey: string },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <div className="h-full w-full bg-black" />;
    return this.props.children;
  }
}
