import { Component, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type RefObject } from "react";
import { FramePreview } from "../../components/preview/FramePreview";
import { applyAdjustmentLayersToPostProcessPasses } from "../../core/adjustments";
import { CAMERA_PERSPECTIVE } from "../../core/camera";
import { applyExportPostProcessFrame, applyExportRawPostProcessFrame, type ExportPostProcessFrameRequest, type ExportPostProcessFrameResult, type ExportRawPostProcessFrameRequest, type ExportRawPostProcessFrameResult } from "../../core/effects/postprocess/exportFrameBridge";
import { withPostProcessFrameBackground } from "../../core/effects/postprocess/passes";
import { createLensExportPostProcessRenderer, createLensPostProcessRenderer } from "../../core/effects/postprocess/lensWebGlRenderer";
import type { PostProcessPass } from "../../core/effects/types";
import { waitForRenderClockAnimationsReady, type RenderClockReadinessResult } from "../../render-engine/renderClock";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest, type Scene } from "../../core/types";
import { deriveFramePreviewRenderModel, getFramePreviewTimelineLayers } from "../state/framePreviewRenderModel";

type ExportFrameRequest = {
  project: ProjectManifest;
  scene: Scene;
  sceneTime: number;
  frameRate: number;
  renderMode?: "preview" | "export";
  exportWidth?: number;
  exportHeight?: number;
};

declare global {
  interface Window {
    __clipperRenderExportFrame?: (request: ExportFrameRequest) => Promise<ExportFrameRenderResult>;
    __clipperSyncExportRenderClock?: () => Promise<RenderClockReadinessResult>;
    __clipperApplyExportPostProcessFrame?: (request: ExportPostProcessFrameRequest) => Promise<ExportPostProcessFrameResult>;
    __clipperApplyExportRawPostProcessFrame?: (request: ExportRawPostProcessFrameRequest) => Promise<ExportRawPostProcessFrameResult>;
  }
}

type ExportFrameRenderResult = RenderClockReadinessResult & {
  postProcessPasses: PostProcessPass[];
};

const identityCameraTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: CAMERA_PERSPECTIVE, motionBlur: 0 };
const noopPointerHandler = () => {};
const noopObjectPointerHandler = () => {};
const noopObjectResizeHandler = () => {};
const noopTextCommit = () => {};
const noopTextDoubleClick = () => {};
const noopTrackerPick = () => {};
const exportFrameReadyTimeoutMs = 5000;

type PendingFrameRequest = { resolve: (result: ExportFrameRenderResult) => void; reject: (error: Error) => void; timeoutId: number };
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
  const postProcessRendererRef = useRef<ReturnType<typeof createLensPostProcessRenderer> | null>(null);

  useLayoutEffect(() => {
    window.__clipperRenderExportFrame = (nextRequest) => new Promise((resolve, reject) => {
      rejectPendingFrame(pendingRequestRef, new Error("Superseded by a newer export frame request."));
      const timeoutId = window.setTimeout(() => {
        rejectPendingFrame(pendingRequestRef, new Error(`Timed out waiting ${exportFrameReadyTimeoutMs}ms for export frame render.`));
      }, exportFrameReadyTimeoutMs);
      pendingRequestRef.current = { resolve, reject, timeoutId };
      setRequest(nextRequest);
    });
    window.__clipperSyncExportRenderClock = async () => {
      await waitForFontsReady();
      const syncResult = await waitForRenderClockAnimationsReady(frameViewportRef.current);
      await nextAnimationFrame();
      return syncResult;
    };
    window.__clipperApplyExportPostProcessFrame = (postProcessRequest) => {
      postProcessRendererRef.current ??= createLensPostProcessRenderer();
      return applyExportPostProcessFrame(postProcessRequest, [createLensExportPostProcessRenderer(postProcessRendererRef.current)]);
    };
    window.__clipperApplyExportRawPostProcessFrame = (postProcessRequest) => {
      postProcessRendererRef.current ??= createLensPostProcessRenderer();
      return applyExportRawPostProcessFrame(postProcessRequest, [createLensExportPostProcessRenderer(postProcessRendererRef.current)]);
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
        postProcessRendererRef.current ??= createLensPostProcessRenderer();
        const result = await applyExportRawPostProcessFrame(
          {
            width,
            height,
            sourceFrame: { width, height, pixelFormat: pixelFormat as "bgra" | "rgba", data: sourceData },
            passes,
          },
          [createLensExportPostProcessRenderer(postProcessRendererRef.current)],
        );

        const resultData =
          result.outputFrame.data instanceof Uint8Array
            ? result.outputFrame.data.buffer.slice(
                result.outputFrame.data.byteOffset,
                result.outputFrame.data.byteOffset + result.outputFrame.data.byteLength,
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
      rejectPendingFrame(pendingRequestRef, new Error("Export renderer unmounted before frame completed."));
      postProcessRendererRef.current?.destroy();
      postProcessRendererRef.current = null;
      window.removeEventListener("message", handleBridgeFrame);
      delete window.__clipperRenderExportFrame;
      delete window.__clipperSyncExportRenderClock;
      delete window.__clipperApplyExportPostProcessFrame;
      delete window.__clipperApplyExportRawPostProcessFrame;
    };
  }, []);

  useLayoutEffect(() => {
    if (!request || !pendingRequestRef.current) return;
    let cancelled = false;
    const waitForFrame = async () => {
      try {
        const syncResult = (await window.__clipperSyncExportRenderClock?.()) ?? await waitForRenderClockAnimationsReady(frameViewportRef.current);
        if (!cancelled) resolvePendingFrame(pendingRequestRef, { ...syncResult, postProcessPasses: getExportPostProcessPasses(request) });
      } catch (error) {
        if (!cancelled) rejectPendingFrame(pendingRequestRef, toError(error));
      }
    };
    waitForFrame();
    return () => {
      cancelled = true;
    };
  }, [request]);

  return (
    <main className="relative overflow-hidden bg-black" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}>
      <div className="absolute left-0 top-0 h-[1080px] w-[1920px] overflow-hidden bg-black">
        <ExportRenderErrorBoundary onError={(error) => rejectPendingFrame(pendingRequestRef, error)} resetKey={request ? `${request.scene.id}:${request.sceneTime}` : "empty"}>
          {request ? <ExportFramePreview key={request.scene.id} refs={{ cameraRef, dragSelectionBoxRef, frameViewportRef }} request={request} /> : <div className="h-full w-full bg-black" />}
        </ExportRenderErrorBoundary>
      </div>
    </main>
  );
}

function ExportFramePreview({ refs, request }: { refs: ExportFramePreviewRefs; request: ExportFrameRequest }) {
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
    const partStart = activeTimelinePart?.start ?? previewModel.adjustedSceneTime;

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
      frameScale: 1,
      isPlaying: false,
      renderMode: request.renderMode ?? "export" as const,
      part: previewModel.part,
      partStart,
      previewParts: previewModel.previewParts,
      transitionPreviewParts: previewModel.transitionPreviewParts,
      adjustmentLayers: previewModel.visibleAdjustmentLayers,
      transitionLayers: previewModel.transitionLayers,
      playbackClock: { startedAt: 0, startedFrom: previewModel.adjustedSceneTime - partStart },
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
  }, [refs.cameraRef, refs.dragSelectionBoxRef, refs.frameViewportRef, request]);

  return framePreviewProps ? <FramePreview {...framePreviewProps} /> : <div className="h-full w-full bg-black" />;
}

export function getExportPostProcessPasses(request: ExportFrameRequest): PostProcessPass[] {
  const exportWidth = request.exportWidth ?? FRAME_WIDTH;
  const exportHeight = request.exportHeight ?? FRAME_HEIGHT;
  const previewModel = deriveFramePreviewRenderModel({
    blankPart: blankPreviewComposition,
    frameRate: request.frameRate,
    scene: request.scene,
    sceneTime: request.sceneTime,
    timelineLayers: getFramePreviewTimelineLayers(request.project, request.scene.id),
    timelineMode: "composition",
  });
  return applyAdjustmentLayersToPostProcessPasses(request.sceneTime, previewModel.visibleAdjustmentLayers, request.frameRate, { width: exportWidth, height: exportHeight })
    .map((pass) => withPostProcessFrameBackground(pass, previewModel.part.frame.style.background));
}

const blankPreviewComposition: CompositionClip = {
  id: "__blank_export_preview__",
  filePath: "",
  duration: 1,
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function resolvePendingFrame(ref: { current: PendingFrameRequest | null }, result: ExportFrameRenderResult) {
  const pending = ref.current;
  if (!pending) return;
  ref.current = null;
  window.clearTimeout(pending.timeoutId);
  pending.resolve(result);
}

function rejectPendingFrame(ref: { current: PendingFrameRequest | null }, error: Error) {
  const pending = ref.current;
  if (!pending) return;
  ref.current = null;
  window.clearTimeout(pending.timeoutId);
  pending.reject(error);
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFontsReady() {
  const fonts = "fonts" in document ? document.fonts : undefined;
  if (!fonts?.ready) return;
  await fonts.ready;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

class ExportRenderErrorBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void; resetKey: string }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <div className="h-full w-full bg-black" />;
    return this.props.children;
  }
}
