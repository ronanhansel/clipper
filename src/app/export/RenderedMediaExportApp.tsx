import { Component, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type RefObject } from "react";
import { FramePreview } from "../../components/preview/FramePreview";
import { CAMERA_PERSPECTIVE } from "../../core/camera";
import { waitForRenderClockAnimationsReady, type RenderClockReadinessResult } from "../../core/renderClock";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest, type Scene } from "../../core/types";
import { deriveFramePreviewRenderModel, getFramePreviewTimelineLayers } from "../state/framePreviewRenderModel";

type ExportFrameRequest = {
  project: ProjectManifest;
  scene: Scene;
  sceneTime: number;
  frameRate: number;
};

declare global {
  interface Window {
    __clipperRenderExportFrame?: (request: ExportFrameRequest) => Promise<RenderClockReadinessResult>;
    __clipperSyncExportRenderClock?: () => Promise<RenderClockReadinessResult>;
  }
}

const identityCameraTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: CAMERA_PERSPECTIVE };
const noopPointerHandler = () => {};
const noopObjectPointerHandler = () => {};
const noopObjectResizeHandler = () => {};
const noopTextCommit = () => {};
const noopTextDoubleClick = () => {};
const noopTrackerPick = () => {};
const exportFrameReadyTimeoutMs = 5000;

type PendingFrameRequest = { resolve: (result: RenderClockReadinessResult) => void; reject: (error: Error) => void; timeoutId: number };
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
    return () => {
      rejectPendingFrame(pendingRequestRef, new Error("Export renderer unmounted before frame completed."));
      delete window.__clipperRenderExportFrame;
      delete window.__clipperSyncExportRenderClock;
    };
  }, []);

  useLayoutEffect(() => {
    if (!request || !pendingRequestRef.current) return;
    let cancelled = false;
    const waitForFrame = async () => {
      try {
        const syncResult = await window.__clipperSyncExportRenderClock?.() ?? await waitForRenderClockAnimationsReady(frameViewportRef.current);
        if (!cancelled) resolvePendingFrame(pendingRequestRef, syncResult);
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
    <main className="h-screen w-screen overflow-hidden bg-black">
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
      renderMode: "export" as const,
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

function resolvePendingFrame(ref: { current: PendingFrameRequest | null }, result: RenderClockReadinessResult) {
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
