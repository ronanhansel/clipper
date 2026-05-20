import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type CameraObjectProps,
} from "../../../core/types";
import {
  getLiveDomPostProcessPreflight,
  type LiveDomPostProcessCapability,
} from "../../../core/effects/postprocess/liveDomCapability";
import { measurePreviewPerf } from "../../../core/effects/postprocess/perf";
import { withPostProcessFrameBackground } from "../../../core/effects/postprocess/passes";
import { subscribeMasterTimelineClock } from "../../../app/features/playback/playbackTimeStore";
import type {
  AdjustmentVisualStyle,
  PostProcessPass,
} from "../../../core/effects/types";
import { createWebGLBackend } from "../backends/WebGLBackend";
import type { RenderBackend } from "../backends/types";
import {
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import { FramePreviewLive } from "../FramePreviewLive";
import type { PostProcessPlan } from "../passes/usePostProcessPlan";
import { useChangedSetState } from "../passes/useChangedSetState";
import type { PreviewRenderScheduler } from "../scheduler/usePreviewRenderScheduler";
import {
  LiveVisualOverlays,
  computePostProcessPlan,
  getPreviewPlanFrameSize,
  makePreviewCanvasStyle,
  noopFramePointer,
  noopObjectPointerDown,
  noopObjectResizePointerDown,
  noopTextEditCommit,
  noopTextObjectDoubleClick,
  noopTrackerTargetPick,
  readPreviewSceneTime,
  toFramePreviewLiveProps,
  type StrategyFramePreviewProps,
} from "./preview";

export type LivePostProcessFramePreviewProps = {
  currentSceneTimeRef: RefObject<number>;
  framePreviewProps: StrategyFramePreviewProps;
  liveDomPostProcessMaxFps: number;
  scheduler: PreviewRenderScheduler;
};

export function LivePostProcessFramePreview({
  currentSceneTimeRef,
  framePreviewProps,
  liveDomPostProcessMaxFps,
  scheduler,
}: LivePostProcessFramePreviewProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const normalPreviewRef = useRef<HTMLDivElement | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceElementRef = useRef<HTMLDivElement | null>(null);
  const sourceCameraRef = useRef<HTMLDivElement | null>(null);
  const sourceFrameViewportRef = useRef<HTMLDivElement | null>(null);
  const sourceDragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const webglBackendRef = useRef<RenderBackend | null>(null);
  const previewLayersRef = useRef<AdjustmentLayer[] | null>(null);
  const cameraPreviewOverrideRef = useRef<CameraObjectProps | null>(null);
  const missingTextureUploadRef = useRef(false);
  const diagnosticReasonRef = useRef<
    LiveDomPostProcessCapability["reason"] | null
  >(null);
  const showLiveCanvasRef = useRef(false);
  const activeLivePostProcessPassRef = useRef(false);
  const lastLiveRenderAtRef = useRef(0);
  const hasValidLiveFrameRef = useRef(false);
  const hasActivatedLiveCanvasRef = useRef(false);
  const liveRenderDirtyRef = useRef(true);
  const lastStoppedSceneTimeRef = useRef<number | null>(null);
  const [showLiveCanvas, setShowLiveCanvas] = useState(false);
  const [liveVisualStyle, setLiveVisualStyle] =
    useChangedSetState<AdjustmentVisualStyle>({});
  const [diagnosticReason, setDiagnosticReason] = useState<
    LiveDomPostProcessCapability["reason"] | null
  >(null);
  const frameScale = framePreviewProps.frameScale;
  const livePostProcessMinFrameIntervalMs =
    1000 / Math.max(1, liveDomPostProcessMaxFps);
  const previewStyle = {
    width: FRAME_WIDTH * frameScale,
    height: FRAME_HEIGHT * frameScale,
  } as CSSProperties;
  const liveCanvasStyle = makePreviewCanvasStyle(frameScale);
  const sourceCanvasStyle = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    left: 0,
    top: 0,
    overflow: "hidden",
  } as CSSProperties;
  const sourceFramePreviewProps: StrategyFramePreviewProps = {
    ...framePreviewProps,
    cameraRef: sourceCameraRef,
    canSelectObjects: false,
    dragBox: null,
    dragSelectionBoxRef: sourceDragSelectionBoxRef,
    editingTextObjectId: null,
    focusPicking: false,
    framePickPoint: null,
    frameScale: 1,
    frameViewportRef: sourceFrameViewportRef,
    marqueeDragging: false,
    pickingTranslationPosition: false,
    pickingZoomFocus: false,
    selectedObjects: [],
    trackerPicking: false,
    onFramePointerCancel: noopFramePointer,
    onFramePointerDown: noopFramePointer,
    onFramePointerDownCapture: noopFramePointer,
    onFramePointerMove: noopFramePointer,
    onFramePointerUp: noopFramePointer,
    onObjectPointerDown: noopObjectPointerDown,
    onObjectResizePointerDown: noopObjectResizePointerDown,
    onTextEditCommit: noopTextEditCommit,
    onTextObjectDoubleClick: noopTextObjectDoubleClick,
    onTrackerTargetPick: noopTrackerTargetPick,
  };

  function updateDiagnosticReason(
    reason: LiveDomPostProcessCapability["reason"] | null,
  ) {
    if (diagnosticReasonRef.current === reason) return;
    diagnosticReasonRef.current = reason;
    setDiagnosticReason(reason);
  }

  function updateShowLiveCanvas(value: boolean) {
    const changed = showLiveCanvasRef.current !== value;
    showLiveCanvasRef.current = value;
    if (renderCanvasRef.current) {
      renderCanvasRef.current.style.opacity = "1";
      renderCanvasRef.current.style.visibility = "visible";
      renderCanvasRef.current.style.pointerEvents = "none";
      renderCanvasRef.current.style.backgroundColor = "transparent";
    }
    if (normalPreviewRef.current) {
      normalPreviewRef.current.style.opacity = value ? "0" : "1";
      normalPreviewRef.current.style.visibility = value ? "hidden" : "visible";
      normalPreviewRef.current.style.pointerEvents = value ? "none" : "";
    }
    if (!changed) return;
    setShowLiveCanvas(value);
  }

  function hideLiveCanvas() {
    hasValidLiveFrameRef.current = false;
    hasActivatedLiveCanvasRef.current = false;
    liveRenderDirtyRef.current = true;
    lastStoppedSceneTimeRef.current = null;
    updateShowLiveCanvas(false);
  }

  function clearInactiveLivePreview(
    reason: LiveDomPostProcessCapability["reason"] | null,
  ) {
    activeLivePostProcessPassRef.current = false;
    hideLiveCanvas();
    missingTextureUploadRef.current = false;
    updateDiagnosticReason(reason);
    webglBackendRef.current?.destroy();
    webglBackendRef.current = null;
  }

  function keepLastLiveFrameIfAvailable() {
    updateShowLiveCanvas(
      hasActivatedLiveCanvasRef.current && hasValidLiveFrameRef.current,
    );
  }

  function renderLiveFrame(planBundle: PostProcessPlan) {
    const canvas = renderCanvasRef.current;
    const livePasses = planBundle.livePasses;
    if (!canvas || !livePasses.length) {
      clearInactiveLivePreview(null);
      return false;
    }
    const source =
      sourceElementRef.current ??
      sourceCanvasRef.current?.querySelector<Element>(
        ":scope > [data-clipper-frame-content]",
      ) ??
      null;
    if (!source) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-source");
      return false;
    }
    const preflight = measurePreviewPerf("live.preflight", () =>
      getLiveDomPostProcessPreflight({
        sourceElement: source,
        canvas: sourceCanvasRef.current ?? canvas,
      }),
    );
    if (!preflight.supported) {
      keepLastLiveFrameIfAvailable();
      webglBackendRef.current?.destroy();
      webglBackendRef.current = null;
      updateDiagnosticReason(preflight.reason);
      return preflight.reason !== "missing-source";
    }
    if (missingTextureUploadRef.current) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-draw-element-image");
      return true;
    }

    webglBackendRef.current ??= createWebGLBackend();
    const result = measurePreviewPerf("live.renderer.render", () =>
      webglBackendRef.current!.renderEffect!({
        output: canvas,
        sourceCanvas: sourceCanvasRef.current ?? canvas,
        sourceElement: source,
        passes: livePasses.map((pass) =>
          withPostProcessFrameBackground(
            pass,
            framePreviewProps.part.frame.style.backgroundColor,
          ),
        ),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      }),
    );
    if (result.rendered) {
      hasValidLiveFrameRef.current = true;
      hasActivatedLiveCanvasRef.current = true;
      updateShowLiveCanvas(true);
    } else {
      keepLastLiveFrameIfAvailable();
    }
    updateDiagnosticReason(result.rendered ? null : result.capability.reason);
    if (!result.rendered) {
      if (result.capability.reason === "missing-draw-element-image") {
        missingTextureUploadRef.current = true;
      } else {
        webglBackendRef.current?.destroy();
        webglBackendRef.current = null;
      }
    }
    return true;
  }

  function collectPlan(
    sceneTime: number,
    layers: AdjustmentLayer[] | undefined,
    label: "live.event" | "live.effect" | "live.raf",
  ) {
    const cameraProps =
      cameraPreviewOverrideRef.current ??
      getActiveCameraObjectProps(
        framePreviewProps.part,
        framePreviewProps.previewTime,
      );
    return measurePreviewPerf(`${label}.collectRequirement`, () =>
      computePostProcessPlan(
        sceneTime,
        layers ?? framePreviewProps.adjustmentLayers,
        { transitionLayers: framePreviewProps.transitionLayers },
        getPreviewPlanFrameSize(),
        cameraProps,
        {
          part: framePreviewProps.part,
          localTime: framePreviewProps.previewTime,
        },
      ),
    );
  }

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const layers =
        (event as CustomEvent<{ layers?: AdjustmentLayer[] | null }>).detail
          ?.layers ?? null;
      previewLayersRef.current = layers;
      liveRenderDirtyRef.current = true;
      const planBundle = collectPlan(
        currentSceneTimeRef.current,
        layers ?? undefined,
        "live.event",
      );
      if (!planBundle.hasLivePasses) clearInactiveLivePreview(null);
      scheduler.requestRender("edit");
    };
    window.addEventListener(
      "clipper:preview-postprocess-adjustment",
      handlePreview,
    );
    return () =>
      window.removeEventListener(
        "clipper:preview-postprocess-adjustment",
        handlePreview,
      );
  }, [scheduler, currentSceneTimeRef, framePreviewProps.adjustmentLayers]);

  useEffect(() => {
    function handleCameraPreview(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { objectId: string; props: CameraObjectProps }
        | undefined;
      const camera = findActiveCameraObject(framePreviewProps.part);
      if (!detail || !camera || camera.id !== detail.objectId) return;
      cameraPreviewOverrideRef.current = detail.props;
      liveRenderDirtyRef.current = true;
      scheduler.requestRender("edit");
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    return () =>
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
  }, [scheduler, framePreviewProps.part, framePreviewProps.previewTime]);

  useEffect(() => {
    previewLayersRef.current = null;
    liveRenderDirtyRef.current = true;
    const planBundle = collectPlan(
      currentSceneTimeRef.current,
      undefined,
      "live.effect",
    );
    if (!planBundle.hasLivePasses) clearInactiveLivePreview(null);
    scheduler.requestRender("edit");
  }, [framePreviewProps.adjustmentLayers]);

  useEffect(() => {
    cameraPreviewOverrideRef.current = null;
    liveRenderDirtyRef.current = true;
    hideLiveCanvas();
    scheduler.requestRender("edit");
  }, [framePreviewProps.part]);

  useEffect(() => {
    liveRenderDirtyRef.current = true;
    scheduler.requestRender("scrub");
  }, [scheduler, framePreviewProps.sceneTime]);

  useEffect(() => {
    // Tick-only listener: bumps the dirty flag and requests a render.
    // Scene time is read out-of-band in the rAF body via readPreviewSceneTime.
    // This is the one legitimate raw subscription — does not read snap fields.
    const unsubscribe = subscribeMasterTimelineClock(() => {
      liveRenderDirtyRef.current = true;
      scheduler.requestRender("scrub");
    });
    return unsubscribe;
  }, [scheduler]);

  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || canvas.hasAttribute("layoutsubtree")) return;
    canvas.setAttribute("layoutsubtree", "");
  }, []);

  useEffect(() => {
    const sync = (_cause: unknown, now: number) => {
      const canvas = renderCanvasRef.current;
      const layers =
        previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
      const sceneTime = readPreviewSceneTime(currentSceneTimeRef);
      const planBundle = collectPlan(sceneTime, layers, "live.raf");
      const livePasses = planBundle.livePasses;
      if (!canvas || !livePasses.length) {
        clearInactiveLivePreview(null);
        return;
      }
      const enteringLivePostProcess = !activeLivePostProcessPassRef.current;
      activeLivePostProcessPassRef.current = true;
      if (enteringLivePostProcess) liveRenderDirtyRef.current = true;
      const visualStyle = measurePreviewPerf(
        "live.applyAdjustmentLayersToVisualStyle",
        () => planBundle.visualStyleAfterLastLive,
      );
      setLiveVisualStyle(visualStyle);
      keepLastLiveFrameIfAvailable();
      if (
        !framePreviewProps.isPlaying &&
        lastStoppedSceneTimeRef.current !== sceneTime
      ) {
        liveRenderDirtyRef.current = true;
        lastStoppedSceneTimeRef.current = sceneTime;
      }
      const elapsedSinceRender = now - lastLiveRenderAtRef.current;
      const shouldRender =
        framePreviewProps.isPlaying || liveRenderDirtyRef.current;
      if (!shouldRender) return;
      if (
        framePreviewProps.isPlaying &&
        !enteringLivePostProcess &&
        elapsedSinceRender < livePostProcessMinFrameIntervalMs
      )
        return;
      lastLiveRenderAtRef.current = now;
      const renderAttemptComplete = renderLiveFrame(planBundle);
      if (renderAttemptComplete && !framePreviewProps.isPlaying)
        liveRenderDirtyRef.current = false;
      if (renderAttemptComplete && framePreviewProps.isPlaying)
        liveRenderDirtyRef.current = false;
    };
    const unsubscribe = scheduler.subscribe(sync);
    scheduler.requestRender("mount");
    return () => {
      unsubscribe();
      webglBackendRef.current?.destroy();
      webglBackendRef.current = null;
      showLiveCanvasRef.current = false;
      activeLivePostProcessPassRef.current = false;
      hasValidLiveFrameRef.current = false;
      hasActivatedLiveCanvasRef.current = false;
      liveRenderDirtyRef.current = true;
      lastStoppedSceneTimeRef.current = null;
      if (normalPreviewRef.current) {
        normalPreviewRef.current.style.opacity = "1";
        normalPreviewRef.current.style.visibility = "visible";
        normalPreviewRef.current.style.pointerEvents = "";
      }
    };
  }, [scheduler, currentSceneTimeRef, framePreviewProps.adjustmentLayers]);

  const liveCanvasFilterStyle = liveVisualStyle.filter
    ? ({ filter: liveVisualStyle.filter } as CSSProperties)
    : undefined;
  const sourceAdjustmentLayers = useMemo(() => {
    const layers =
      previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
    const cameraProps = getActiveCameraObjectProps(
      framePreviewProps.part,
      framePreviewProps.previewTime,
    );
    const sourcePlanBundle = computePostProcessPlan(
      currentSceneTimeRef.current,
      layers,
      { transitionLayers: framePreviewProps.transitionLayers },
      getPreviewPlanFrameSize(),
      cameraProps,
      {
        part: framePreviewProps.part,
        localTime: framePreviewProps.previewTime,
      },
    );
    return sourcePlanBundle.livePasses[0]
      ? sourcePlanBundle.planBeforeFirstLive.activeLayers
      : layers;
  }, [
    currentSceneTimeRef,
    framePreviewProps.adjustmentLayers,
    framePreviewProps.transitionLayers,
    framePreviewProps.part,
    framePreviewProps.previewTime,
  ]);

  return (
    <div
      className="relative overflow-hidden bg-black"
      data-clipper-live-postprocess-preview-wrapper
      data-clipper-live-postprocess-status={diagnosticReason ?? "ready"}
      data-clipper-diagnostic-reason={diagnosticReason}
      ref={wrapperRef}
      style={previewStyle}
    >
      <div
        className="absolute inset-0 z-10 overflow-hidden"
        aria-hidden={showLiveCanvas}
        ref={normalPreviewRef}
        style={{
          opacity: showLiveCanvas ? 0 : 1,
          pointerEvents: showLiveCanvas ? "none" : undefined,
          visibility: showLiveCanvas ? "hidden" : "visible",
        }}
      >
        <FramePreviewLive
          {...toFramePreviewLiveProps(framePreviewProps)}
          paused={showLiveCanvas}
        />
      </div>
      <canvas
        aria-hidden="true"
        ref={sourceCanvasRef}
        className="pointer-events-none absolute left-0 top-0 -z-10 block opacity-0"
        data-clipper-live-postprocess-source-canvas="draw-element-image-alpha"
        height={FRAME_HEIGHT}
        style={sourceCanvasStyle}
        width={FRAME_WIDTH}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          data-clipper-live-postprocess-source
          inert={true}
          ref={sourceElementRef}
          style={sourceCanvasStyle}
        >
          <FramePreviewLive
            {...toFramePreviewLiveProps(sourceFramePreviewProps)}
            adjustmentLayersOverride={sourceAdjustmentLayers}
            isPostProcessSource={true}
          />
        </div>
      </canvas>
      <canvas
        aria-hidden="true"
        ref={renderCanvasRef}
        className="pointer-events-none absolute left-0 top-0 z-0 block bg-black"
        data-clipper-live-postprocess-canvas="webgl-output"
        height={FRAME_HEIGHT}
        style={{
          ...liveCanvasStyle,
          ...liveCanvasFilterStyle,
          opacity: 1,
          visibility: "visible",
        }}
        width={FRAME_WIDTH}
      />
      {showLiveCanvas ? (
        <LiveVisualOverlays overlays={liveVisualStyle.overlays} />
      ) : null}
    </div>
  );
}
