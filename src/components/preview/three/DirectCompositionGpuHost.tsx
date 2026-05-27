import {
  useEffect,
  memo,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { CompositionRenderer } from "./CompositionRenderer";
import {
  readCompositionRendererBackendRequest,
  selectCompositionRendererBackend,
} from "./compositionRendererBackend";
import {
  buildCameraComposerPasses,
  getCameraComposerPassSignature,
} from "./cameraComposerPasses";
import { DomBackend } from "../backends/DomBackend";
import { computePostProcessPlan } from "../passes/usePostProcessPlan";
import {
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import {
  getCodeObjectComponentTick,
  subscribeCodeObjectComponents,
} from "../../../render-engine/codeObjectRuntime";
import {
  getMasterTimelineClockSnapshot,
  isMasterClockLive,
  subscribeMasterTimelineClock,
} from "../../../app/features/playback/playbackTimeStore";
import {
  getTransitionFinishTime,
  getTransitionMarkerTime,
  getTransitionProgress,
} from "../../../core/transitions";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type CameraObjectProps,
  type CompositionClip,
  type FrameObject,
  type TransitionLayer,
} from "../../../core/types";
import { defaultPreviewFps } from "../../../core/previewFps";
import type { CompositionBackendProps } from "../backends/CompositionBackend";
import { useOptionalPreviewRenderScheduler } from "../scheduler/PreviewRenderSchedulerContext";
import type { RenderCause } from "../scheduler/usePreviewRenderScheduler";
import type { TimelinePreviewStackPart } from "../../../core/timeline";

export type DirectGpuTransitionComposite = {
  layer: TransitionLayer;
  progress: number;
  sceneTime: number;
  from: {
    part: CompositionClip;
    localTime: number;
    sceneTime: number;
  };
  to: {
    part: CompositionClip;
    localTime: number;
    sceneTime: number;
  };
};

export interface DirectCompositionGpuHostProps {
  part: CompositionClip;
  localTime: number;
  sourceSlots?: TimelinePreviewStackPart[];
  /**
   * Backend props the internal sealed `DomBackend` needs to render the
   * source tree. The host fills in all sealed/non-interactive values
   * itself; callers only pass the props that vary per frame/state.
   */
  backendProps: Pick<
    CompositionBackendProps,
    | "animationsEnabled"
    | "frameScale"
    | "previewFps"
    | "hideNullObjects"
    | "isPlaying"
    | "duration"
    | "renderClockSceneTime"
    | "renderMode"
    | "exportTileFrameBounds"
  >;
  adjustmentLayers?: AdjustmentLayer[];
  transitionLayers?: TransitionLayer[];
  compositionLibrary?: CompositionClip[];
  transitionComposite?: DirectGpuTransitionComposite | null;
  hostClassName?: string;
}

const NOOP_OBJECT_POINTER: CompositionBackendProps["onObjectPointerDown"] =
  () => {};
const NOOP_TEXT_COMMIT: CompositionBackendProps["onTextEditCommit"] = () => {};
const NOOP_OBJECT_DOUBLE_CLICK: CompositionBackendProps["onTextObjectDoubleClick"] =
  () => {};

const SOURCE_INNER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  pointerEvents: "none",
  overflow: "hidden",
};

const maxRecentDirectSourceStacks = 2;
const maxDirectSourceSlots = 12;

/**
 * `DirectCompositionGpuHost` mounts a `CompositionRenderer` (through-camera
 * GPU rendering with depth-only meshes + a captured-DOM colour quad) and keeps
 * it driven by the composition's active camera + localTime. Used by:
 *   - the compose-mode camera PIP
 *   - Direct mode's sealed flat output (via `RasterBackend`)
 *
 * The host owns its own hidden source DOM tree (a sealed, non-
 * interactive `DomBackend`) parked off-screen via `position: fixed`.
 * `CompositionRenderer.setComposition` reads from that subtree via
 * `drawElementImage` and projects it through the active camera. The
 * source must remain in the DOM (not `display: none`) so layout/paint
 * runs and the capture path can read pixels.
 */
export const DirectCompositionGpuHost = memo(function DirectCompositionGpuHost(
  props: DirectCompositionGpuHostProps,
) {
  const { part, localTime, backendProps } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sourceContainerRefs = useRef(new Map<string, HTMLDivElement | null>());
  const transitionSourceContainerRefs = useRef(
    new Map<string, HTMLDivElement | null>(),
  );
  const rendererRef = useRef<CompositionRenderer | null>(null);
  const composerPassSignatureRef = useRef("");
  const pendingCameraPreviewRef = useRef<CameraObjectProps | null>(null);
  const pendingObjectPreviewRef = useRef<FrameObject | null>(null);
  const cameraPreviewFrameRef = useRef<number>(0);
  const liveClockFallbackFrameRef = useRef<number>(0);
  const scheduler = useOptionalPreviewRenderScheduler();
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [captureCanvas, setCaptureCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [transitionCaptureCanvas, setTransitionCaptureCanvas] =
    useState<HTMLCanvasElement | null>(null);
  // Code-object bundles compile asynchronously. While the bundle is
  // still building, the sealed source DOM renders a "code: compiling…"
  // placeholder; once compilation finishes the runtime bumps a tick
  // that drives `CodeObjectFrame` to swap in the real component. The
  // composition host needs to recapture + render at that point or the
  // through-camera output stays frozen on the placeholder until the
  // user scrubs or moves the camera.
  const codeComponentTick = useSyncExternalStore(
    subscribeCodeObjectComponents,
    getCodeObjectComponentTick,
    getCodeObjectComponentTick,
  );
  const liveLocalTimeOffset = localTime - backendProps.renderClockSceneTime;
  const transitionFromLocalTimeOffset =
    props.transitionComposite == null
      ? 0
      : props.transitionComposite.from.localTime -
        props.transitionComposite.from.sceneTime;
  const transitionToLocalTimeOffset =
    props.transitionComposite == null
      ? 0
      : props.transitionComposite.to.localTime -
        props.transitionComposite.to.sceneTime;
  const renderPreviewFps = backendProps.previewFps ?? defaultPreviewFps;
  const liveSceneTime = useDirectLiveSceneFrame(
    backendProps.renderClockSceneTime,
    renderPreviewFps,
  );
  const sourceSlotCacheRef = useRef<DirectSourceSlotCache>({ stacks: [] });
  const liveLocalTime =
    Math.round((liveSceneTime + liveLocalTimeOffset) * renderPreviewFps) /
    renderPreviewFps;
  const liveTransitionTimes = props.transitionComposite
    ? getDirectTransitionLocalTimes(
        props.transitionComposite,
        liveSceneTime,
        transitionFromLocalTimeOffset,
        transitionToLocalTimeOffset,
        renderPreviewFps,
      )
    : null;
  const fallbackActiveSourceSlot = {
    part,
    previewTime: liveTransitionTimes?.fromLocalTime ?? liveLocalTime,
    start: backendProps.renderClockSceneTime - localTime,
  } satisfies TimelinePreviewStackPart;
  const transitionToSourceSlot = props.transitionComposite
    ? {
        part: props.transitionComposite.to.part,
        previewTime:
          liveTransitionTimes?.toLocalTime ??
          props.transitionComposite.to.localTime,
        start:
          props.transitionComposite.to.sceneTime -
          props.transitionComposite.to.localTime,
      }
    : null;
  const activePartIds = useMemo(() => {
    const ids = new Set<string>([part.id]);
    if (props.transitionComposite) {
      ids.add(props.transitionComposite.to.part.id);
      ids.add(props.transitionComposite.from.part.id);
    }
    return ids;
  }, [part.id, props.transitionComposite]);

  const currentSourceSlots = updateDirectSourceSlotsForLiveSceneTime(
    props.sourceSlots && props.sourceSlots.length > 0
      ? props.sourceSlots
      : [fallbackActiveSourceSlot],
    liveSceneTime,
    props.transitionComposite
      ? {
          partId: props.transitionComposite.from.part.id,
          localTime: liveTransitionTimes?.fromLocalTime,
        }
      : null,
    activePartIds,
  );
  const activeSourceSlot =
    currentSourceSlots.find((slot) => slot.part.id === part.id) ??
    fallbackActiveSourceSlot;
  const directSourceSlotCache = mergeDirectSourceSlotCache(
    sourceSlotCacheRef.current,
    currentSourceSlots,
    transitionToSourceSlot ? [transitionToSourceSlot] : [],
  );
  sourceSlotCacheRef.current = directSourceSlotCache;
  const directSourceSlots = getDirectSourceSlotCacheSlots(
    directSourceSlotCache,
  );
  const activeSourceSlotKey = getDirectSourceSlotKey(activeSourceSlot);
  const transitionToSourceSlotKey = transitionToSourceSlot
    ? getDirectSourceSlotKey(transitionToSourceSlot)
    : null;
  const activeSourceContainer = () =>
    sourceContainerRefs.current.get(activeSourceSlotKey) ?? null;
  const transitionSourceContainer = () =>
    transitionToSourceSlotKey
      ? (transitionSourceContainerRefs.current.get(transitionToSourceSlotKey) ??
        null)
      : null;

  function partWithPreviewObject(
    objectOverride?: FrameObject | null,
  ): CompositionClip {
    if (!objectOverride) return part;
    let matched = false;
    const objects = part.objects.map((object) => {
      if (object.id !== objectOverride.id) return object;
      matched = true;
      return objectOverride;
    });
    return matched ? { ...part, objects } : part;
  }

  function renderAtTime(
    renderer: CompositionRenderer,
    time: number,
    cameraOverride?: CameraObjectProps | null,
    options: { syncShadows?: boolean; isPlaying?: boolean } = {},
    objectOverride?: FrameObject | null,
  ) {
    const renderPart = partWithPreviewObject(objectOverride);
    const cameraProps =
      cameraOverride ?? getActiveCameraObjectProps(renderPart, time);
    renderer.setCamera(cameraProps);
    const composerPasses = buildCameraComposerPasses(cameraProps, {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    });
    const nextComposerPassSignature =
      getCameraComposerPassSignature(composerPasses);
    if (nextComposerPassSignature !== composerPassSignatureRef.current) {
      renderer.setComposerPasses(composerPasses);
      composerPassSignatureRef.current = nextComposerPassSignature;
    } else {
      disposeComposerPasses(composerPasses);
    }
    const sceneTime = time - liveLocalTimeOffset;
    const postProcessPasses = computePostProcessPlan(
      sceneTime,
      props.adjustmentLayers,
      { transitionLayers: props.transitionLayers },
      { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    ).livePasses;
    renderer.setGpuPostProcessPasses(postProcessPasses);
    renderer.setComposition(renderPart, time, activeSourceContainer(), {
      isPlaying: options.isPlaying === true,
      syncShadows: options.syncShadows,
    });
    renderer.render();
  }

  function renderTransitionAtSceneTime(
    renderer: CompositionRenderer,
    sceneTime: number,
    options: { syncShadows?: boolean; isPlaying?: boolean } = {},
  ) {
    const composite = props.transitionComposite;
    if (!composite) {
      renderAtTime(renderer, localTime, undefined, options);
      return;
    }
    const { progress, fromLocalTime, toLocalTime } =
      getDirectTransitionLocalTimes(
        composite,
        sceneTime,
        transitionFromLocalTimeOffset,
        transitionToLocalTimeOffset,
        renderPreviewFps,
      );
    const fromCamera = getActiveCameraObjectProps(
      composite.from.part,
      fromLocalTime,
    );
    const toCamera = getActiveCameraObjectProps(composite.to.part, toLocalTime);
    const postProcessPasses = computePostProcessPlan(
      sceneTime,
      props.adjustmentLayers,
      { transitionLayers: props.transitionLayers },
      { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    ).livePasses;
    renderer.setGpuPostProcessPasses(postProcessPasses);
    renderer.setTransitionComposition({
      from: {
        part: composite.from.part,
        localTime: fromLocalTime,
        sourceElement: activeSourceContainer(),
        camera: fromCamera,
      },
      to: {
        part: composite.to.part,
        localTime: toLocalTime,
        sourceElement: transitionSourceContainer(),
        camera: toCamera,
      },
      layer: composite.layer,
      progress,
      options: {
        isPlaying: options.isPlaying === true,
        syncShadows: options.syncShadows,
      },
    });
    renderer.render();
  }

  // The capture canvas + source subtree live in a fresh `<div>` mounted
  // straight on `document.body`. Two reasons:
  //   1. The source must escape ancestors with `transform`,
  //      `transform-style: preserve-3d`, `filter`, or `perspective`,
  //      which promote `position: fixed` descendants into a 3D rendering
  //      context and confuse `drawElementImage` paint sampling.
  //   2. `CanvasRenderingContext2D.drawElementImage` only accepts the
  //      canvas's IMMEDIATE children as source elements. The capture
  //      canvas (owned by `CompositionRenderer`) must therefore be in
  //      the DOM with the source `<div>` as its direct child.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.createElement("div");
    target.dataset.clipperCompositionGpuSourceHost = "";
    Object.assign(target.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: `${FRAME_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      pointerEvents: "none",
      zIndex: "-1",
      overflow: "hidden",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(target);
    setPortalTarget(target);
    return () => {
      if (target.parentNode) target.parentNode.removeChild(target);
      setPortalTarget(null);
    };
  }, []);

  // Mount/unmount the renderer once the portal target is ready. The
  // capture canvas (owned by the renderer) is moved into the portal so
  // the source DOM can be its immediate child — required by
  // `drawElementImage`. Effects run after commit, so the portal-rendered
  // source DOM is in place by the time we move the canvas.
  useEffect(() => {
    if (!portalTarget) return;
    const host = hostRef.current;
    if (!host) return;
    const initialWidth = host.clientWidth || FRAME_WIDTH;
    const initialHeight = host.clientHeight || FRAME_HEIGHT;
    const backendSelection = selectCompositionRendererBackend({
      requested: readCompositionRendererBackendRequest(),
      webGpuMaterialsReady: true,
    });
    if (backendSelection.kind === "disabled") {
      host.dataset.clipperCompositionRendererBackend = backendSelection.kind;
      host.dataset.clipperCompositionRendererBackendRequested =
        backendSelection.requested;
      host.dataset.clipperCompositionRendererBackendReason =
        backendSelection.reason;
      rendererRef.current = null;
      setCaptureCanvas(null);
      setTransitionCaptureCanvas(null);
      return;
    }
    const renderer = new CompositionRenderer({
      width: initialWidth,
      height: initialHeight,
      backendSelection,
    });
    rendererRef.current = renderer;
    host.appendChild(renderer.hostRoot);

    // Park the capture canvas inside the portal target. Style it so
    // it doesn't paint anywhere visible — only its DOM position
    // matters for the `drawElementImage(child)` requirement.
    const captureCanvasEl = renderer.captureCanvas;
    const transitionCaptureCanvasEl = renderer.transitionCaptureCanvas;
    Object.assign(captureCanvasEl.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: `${FRAME_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);
    Object.assign(transitionCaptureCanvasEl.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: `${FRAME_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);
    portalTarget.appendChild(captureCanvasEl);
    portalTarget.appendChild(transitionCaptureCanvasEl);
    setCaptureCanvas(captureCanvasEl);
    setTransitionCaptureCanvas(transitionCaptureCanvasEl);

    // Enable Chromium's experimental layoutsubtree flag eagerly so the
    // first `drawElementImage` call in the rAF effect below succeeds.
    // `prepareLiveDomPostProcessSource` does this on its own when given
    // a non-null source, but setting it here means a missed prepare
    // call (e.g. if React's first commit lands before the portal does)
    // doesn't blow up the capture.
    try {
      (
        captureCanvasEl as HTMLCanvasElement & { layoutSubtree?: boolean }
      ).layoutSubtree = true;
    } catch {
      /* feature flag may not be exposed on this Chromium build */
    }
    try {
      (
        captureCanvasEl as HTMLCanvasElement & { layoutsubtree?: boolean }
      ).layoutsubtree = true;
    } catch {
      /* alt casing */
    }

    if (props.transitionComposite) {
      renderTransitionAtSceneTime(
        renderer,
        props.transitionComposite.sceneTime,
      );
    } else {
      renderAtTime(renderer, localTime);
    }

    return () => {
      rendererRef.current = null;
      composerPassSignatureRef.current = "";
      setCaptureCanvas(null);
      setTransitionCaptureCanvas(null);
      if (captureCanvasEl.parentNode === portalTarget)
        portalTarget.removeChild(captureCanvasEl);
      if (transitionCaptureCanvasEl.parentNode === portalTarget)
        portalTarget.removeChild(transitionCaptureCanvasEl);
      if (renderer.hostRoot.parentNode === host)
        host.removeChild(renderer.hostRoot);
      renderer.dispose();
    };
    // Renderer mounts after the portal target is ready; updates flow
    // through the [part, localTime] effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalTarget]);

  // Sync camera + render whenever the inputs that affect output change.
  // `drawElementImage` requires a settled layout pass on the source, so
  // schedule the capture inside `requestAnimationFrame` to give the
  // sealed DomBackend's commit a chance to paint before we read it.
  // Depends on `captureCanvas` so the first capture runs AFTER the
  // portal-mounted source DOM is in the tree (the portal is gated on
  // `captureCanvas` state). That first call routes through
  // `prepareLiveDomPostProcessSource`, which flips `canvas.layoutSubtree
  // = true` — without that flag, `drawElementImage` errors out.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!captureCanvas) return;
    const handle = requestAnimationFrame(() => {
      const r = rendererRef.current;
      if (!r) return;
      if (props.transitionComposite && transitionCaptureCanvas) {
        renderTransitionAtSceneTime(r, props.transitionComposite.sceneTime);
      } else {
        renderAtTime(r, localTime);
      }
    });
    return () => cancelAnimationFrame(handle);
    // renderAtTime closes over current part/localTime inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    part,
    localTime,
    captureCanvas,
    transitionCaptureCanvas,
    codeComponentTick,
    props.transitionComposite,
  ]);

  useEffect(() => {
    if (!captureCanvas) return;
    const renderLiveFrame = (cause: RenderCause, now: number) => {
      void now;
      const renderer = rendererRef.current;
      if (!renderer) return;
      const snap = getMasterTimelineClockSnapshot();
      const rawLocalTime = isMasterClockLive(snap)
        ? snap.adjustedSceneTime + liveLocalTimeOffset
        : localTime;
      const nextLocalTime =
        Math.round(rawLocalTime * renderPreviewFps) / renderPreviewFps;
      const cameraOverride = pendingCameraPreviewRef.current;
      const objectOverride = pendingObjectPreviewRef.current;
      const renderOptions = {
        isPlaying: cause === "play-tick",
        syncShadows: cameraOverride || objectOverride ? false : undefined,
      };
      if (props.transitionComposite && transitionCaptureCanvas) {
        renderTransitionAtSceneTime(renderer, snap.adjustedSceneTime, {
          isPlaying: renderOptions.isPlaying,
          syncShadows: undefined,
        });
        return;
      }
      pendingCameraPreviewRef.current = null;
      pendingObjectPreviewRef.current = null;
      renderAtTime(
        renderer,
        nextLocalTime,
        cameraOverride,
        renderOptions,
        objectOverride,
      );
    };
    const unsubscribeScheduler = scheduler?.subscribe(renderLiveFrame);
    const unsubscribeClock = subscribeMasterTimelineClock(() => {
      const snap = getMasterTimelineClockSnapshot();
      if (!isMasterClockLive(snap)) return;
      if (liveClockFallbackFrameRef.current) return;
      liveClockFallbackFrameRef.current = requestAnimationFrame((now) => {
        liveClockFallbackFrameRef.current = 0;
        renderLiveFrame("scrub", now);
      });
    });
    return () => {
      unsubscribeScheduler?.();
      unsubscribeClock();
      if (liveClockFallbackFrameRef.current) {
        cancelAnimationFrame(liveClockFallbackFrameRef.current);
        liveClockFallbackFrameRef.current = 0;
      }
    };
    // renderAtTime closes over current part/localTime inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    captureCanvas,
    liveLocalTimeOffset,
    localTime,
    part,
    renderPreviewFps,
    scheduler,
    props.transitionComposite,
    transitionCaptureCanvas,
  ]);

  function scheduleInspectorPreviewRender() {
    if (scheduler) {
      scheduler.requestRender("edit");
    }
    if (cameraPreviewFrameRef.current) return;
    cameraPreviewFrameRef.current = requestAnimationFrame(() => {
      cameraPreviewFrameRef.current = 0;
      const renderer = rendererRef.current;
      const cameraOverride = pendingCameraPreviewRef.current;
      const objectOverride = pendingObjectPreviewRef.current;
      if (!renderer || (!cameraOverride && !objectOverride)) return;
      pendingCameraPreviewRef.current = null;
      pendingObjectPreviewRef.current = null;
      renderAtTime(
        renderer,
        localTime,
        cameraOverride,
        { syncShadows: false },
        objectOverride,
      );
    });
  }

  // Live scrub from the inspector dispatches preview events. Apply
  // imperatively so the right-side through-camera output updates without a
  // React commit, matching `ComposeAuthorView`'s wireframe preview path.
  useEffect(() => {
    function handleCameraPreview(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { objectId: string; props: CameraObjectProps }
        | undefined;
      if (!detail) return;
      const camera = findActiveCameraObject(part, localTime);
      if (!camera || camera.id !== detail.objectId) return;
      pendingCameraPreviewRef.current = detail.props;
      scheduleInspectorPreviewRender();
    }
    function handleLightPreview(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { object: FrameObject }
        | undefined;
      if (!detail?.object || detail.object.type !== "light") return;
      if (!part.objects.some((object) => object.id === detail.object.id))
        return;
      pendingObjectPreviewRef.current = detail.object;
      scheduleInspectorPreviewRender();
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    window.addEventListener("clipper:light-preview", handleLightPreview);
    return () => {
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
      window.removeEventListener("clipper:light-preview", handleLightPreview);
      if (cameraPreviewFrameRef.current) {
        cancelAnimationFrame(cameraPreviewFrameRef.current);
        cameraPreviewFrameRef.current = 0;
      }
    };
    // renderAtTime closes over current part/localTime inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTime, part, scheduler]);

  return (
    <>
      <div
        ref={hostRef}
        className={props.hostClassName ?? "absolute inset-0"}
        data-clipper-composition-gpu
        style={{ pointerEvents: "none" }}
      />
      {captureCanvas
        ? createPortal(
            <>
              {directSourceSlots.map((slot) => {
                const isActive =
                  getDirectSourceSlotKey(slot) === activeSourceSlotKey;
                return (
                  <DirectCompositionGpuSourceSlot
                    key={getDirectSourceSlotKey(slot)}
                    slotKey={getDirectSourceSlotKey(slot)}
                    slot={slot}
                    active={isActive}
                    animationsEnabled={
                      isActive ? backendProps.animationsEnabled : false
                    }
                    exportTileFrameBounds={backendProps.exportTileFrameBounds}
                    previewFps={backendProps.previewFps}
                    hideNullObjects={backendProps.hideNullObjects ?? false}
                    isPlaying={isActive ? backendProps.isPlaying : false}
                    renderClockSceneTime={
                      isActive ? backendProps.renderClockSceneTime : undefined
                    }
                    renderMode={backendProps.renderMode}
                    compositionLibrary={props.compositionLibrary}
                    sourceContainerRefs={sourceContainerRefs}
                  />
                );
              })}
            </>,
            captureCanvas,
          )
        : null}
      {transitionCaptureCanvas
        ? createPortal(
            transitionToSourceSlot ? (
              <DirectCompositionGpuSourceSlot
                slotKey={transitionToSourceSlotKey!}
                slot={transitionToSourceSlot}
                active={true}
                animationsEnabled={backendProps.animationsEnabled}
                exportTileFrameBounds={backendProps.exportTileFrameBounds}
                previewFps={backendProps.previewFps}
                hideNullObjects={backendProps.hideNullObjects ?? false}
                isPlaying={backendProps.isPlaying}
                renderClockSceneTime={
                  props.transitionComposite?.to.sceneTime ??
                  backendProps.renderClockSceneTime
                }
                renderMode={backendProps.renderMode}
                compositionLibrary={props.compositionLibrary}
                sourceContainerRefs={transitionSourceContainerRefs}
                sourceKind="transition-to"
              />
            ) : null,
            transitionCaptureCanvas,
          )
        : null}
    </>
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disposeComposerPasses(passes: readonly any[]) {
  for (const pass of passes) {
    if (typeof pass.dispose === "function") pass.dispose();
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function useDirectLiveSceneFrame(
  fallbackSceneTime: number,
  previewFps: number,
) {
  return useSyncExternalStore(
    subscribeMasterTimelineClock,
    () => readDirectLiveSceneFrame(fallbackSceneTime, previewFps),
    () => readDirectLiveSceneFrame(fallbackSceneTime, previewFps),
  );
}

function readDirectLiveSceneFrame(
  fallbackSceneTime: number,
  previewFps: number,
) {
  const snap = getMasterTimelineClockSnapshot();
  const sceneTime = isMasterClockLive(snap)
    ? snap.adjustedSceneTime
    : fallbackSceneTime;
  return Math.round(sceneTime * previewFps) / previewFps;
}

function getDirectTransitionLocalTimes(
  composite: DirectGpuTransitionComposite,
  sceneTime: number,
  fromLocalTimeOffset: number,
  toLocalTimeOffset: number,
  previewFps: number,
) {
  const progress = getTransitionProgress(sceneTime, composite.layer);
  const transitionMidTime = getTransitionMarkerTime(composite.layer);
  const transitionEndTime =
    composite.layer.start + getTransitionFinishTime(composite.layer);
  const fromSceneTime = clampNumber(
    composite.layer.start +
      (transitionMidTime - composite.layer.start) * progress,
    composite.layer.start,
    Math.max(transitionMidTime - 0.000001, composite.layer.start),
  );
  const toSceneTime = clampNumber(
    transitionMidTime + (transitionEndTime - transitionMidTime) * progress,
    transitionMidTime,
    transitionEndTime,
  );
  return {
    progress,
    fromLocalTime:
      Math.round((fromSceneTime + fromLocalTimeOffset) * previewFps) /
      previewFps,
    toLocalTime:
      Math.round((toSceneTime + toLocalTimeOffset) * previewFps) / previewFps,
  };
}

function updateDirectSourceSlotsForLiveSceneTime(
  slots: TimelinePreviewStackPart[],
  sceneTime: number,
  transitionFrom: { partId: string; localTime?: number } | null,
  activePartIds: Set<string>,
): TimelinePreviewStackPart[] {
  return slots.map((slot) => {
    if (!activePartIds.has(slot.part.id)) {
      return slot;
    }
    const previewTime =
      transitionFrom?.partId === slot.part.id &&
      transitionFrom.localTime != null
        ? transitionFrom.localTime
        : sceneTime - slot.start;
    if (slot.previewTime === previewTime) return slot;
    return { ...slot, previewTime };
  });
}

type DirectSourceSlotCache = {
  stacks: DirectSourceSlotSnapshot[];
};

type DirectSourceSlotSnapshot = {
  key: string;
  items: TimelinePreviewStackPart[];
};

export function getDirectSourceSlotKey(item: TimelinePreviewStackPart): string {
  return `${item.part.compositionId ?? item.part.id}:${item.start}:${item.part.layerId ?? "comp"}`;
}

function getDirectSourceStackKey(items: TimelinePreviewStackPart[]): string {
  return items.map(getDirectSourceSlotKey).join("|");
}

export function mergeDirectSourceSlotCache(
  previous: DirectSourceSlotCache,
  current: TimelinePreviewStackPart[],
  pinned: TimelinePreviewStackPart[] = [],
  options: {
    recentStackLimit?: number;
    slotLimit?: number;
  } = {},
): DirectSourceSlotCache {
  if (current.length === 0 && pinned.length === 0) return previous;
  const recentStackLimit =
    options.recentStackLimit ?? maxRecentDirectSourceStacks;
  const slotLimit = options.slotLimit ?? maxDirectSourceSlots;
  const currentSnapshot: DirectSourceSlotSnapshot = {
    key: getDirectSourceStackKey([...current, ...pinned]),
    items: [...current, ...pinned],
  };
  const previousNonCurrent = previous.stacks.filter(
    (snapshot) => snapshot.key !== currentSnapshot.key,
  );
  const stackLimit = Math.max(1, recentStackLimit + 1);
  const candidates = [currentSnapshot, ...previousNonCurrent].slice(
    0,
    stackLimit,
  );
  const nextStacks: DirectSourceSlotSnapshot[] = [];
  let retainedSlotCount = 0;
  for (const snapshot of candidates) {
    const isCurrent = snapshot.key === currentSnapshot.key;
    if (!isCurrent && retainedSlotCount + snapshot.items.length > slotLimit) {
      continue;
    }
    nextStacks.push(snapshot);
    retainedSlotCount += snapshot.items.length;
  }
  return { stacks: nextStacks };
}

export function getDirectSourceSlotCacheSlots(
  cache: DirectSourceSlotCache,
): TimelinePreviewStackPart[] {
  const slots: TimelinePreviewStackPart[] = [];
  const seen = new Set<string>();
  for (const stack of cache.stacks) {
    for (const item of stack.items) {
      const key = getDirectSourceSlotKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push(item);
    }
  }
  return slots;
}

const DirectCompositionGpuSourceSlot = memo(
  function DirectCompositionGpuSourceSlot({
    slotKey,
    slot,
    active,
    animationsEnabled,
    exportTileFrameBounds,
    previewFps,
    hideNullObjects,
    isPlaying,
    renderClockSceneTime,
    renderMode,
    compositionLibrary,
    sourceContainerRefs,
    sourceKind,
  }: {
    slotKey: string;
    slot: TimelinePreviewStackPart;
    active: boolean;
    animationsEnabled: boolean;
    exportTileFrameBounds: any;
    previewFps: CompositionBackendProps["previewFps"];
    hideNullObjects: boolean;
    isPlaying: boolean;
    renderClockSceneTime?: number;
    renderMode: CompositionBackendProps["renderMode"];
    compositionLibrary?: CompositionClip[];
    sourceContainerRefs: MutableRefObject<Map<string, HTMLDivElement | null>>;
    sourceKind?: string;
  }) {
    const sourceContainerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      sourceContainerRefs.current.set(slotKey, sourceContainerRef.current);
      return () => {
        sourceContainerRefs.current.delete(slotKey);
      };
    }, [slotKey, sourceContainerRefs]);
    return (
      <div
        ref={sourceContainerRef}
        data-clipper-composition-gpu-source={sourceKind ?? ""}
        aria-hidden="true"
        inert={true}
        style={SOURCE_INNER_STYLE}
      >
        <DomBackend
          active={false}
          activeShapeTool={null}
          animationsEnabled={animationsEnabled}
          canSelect={false}
          cameraHandledExternally={true}
          duration={slot.part.duration}
          editingTextObjectId={null}
          exportTileFrameBounds={exportTileFrameBounds}
          focusPicking={false}
          frameScale={1}
          previewFps={previewFps}
          hideNullObjects={hideNullObjects}
          hostRef={sourceContainerRef}
          isPlaying={isPlaying}
          localTime={slot.previewTime}
          part={slot.part}
          renderClockSceneTime={
            active && renderClockSceneTime !== undefined
              ? renderClockSceneTime
              : slot.start + slot.previewTime
          }
          renderMode={renderMode}
          onObjectPointerDown={NOOP_OBJECT_POINTER}
          onObjectContextMenu={undefined}
          onTextEditCommit={NOOP_TEXT_COMMIT}
          onTextEditEnd={undefined}
          onTextObjectDoubleClick={NOOP_OBJECT_DOUBLE_CLICK}
          compositionLibrary={compositionLibrary}
        />
      </div>
    );
  },
);
