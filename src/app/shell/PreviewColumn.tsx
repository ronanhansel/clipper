import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject, type UIEvent } from "react";
import { EditorPane } from "../../components/EditorPane";
import { selectorHandleSizePx, selectorOffsetPx } from "../config";
import { FramePreview } from "../../components/preview/FramePreview";
import { applyAdjustmentLayersToPostProcessPasses, applyAdjustmentLayersToVisualStyle } from "../../core/adjustments";
import { boundsToViewport, getLayeredCameraPreviewTransform } from "../../core/camera";
import { getLiveDomPostProcessPreflight, isLiveDomPostProcessPreviewOptedIn, type LiveDomPostProcessCapability } from "../../core/effects/postprocess/liveDomCapability";
import { collectLiveDomPostProcessRequirement } from "../../core/effects/postprocess/liveDomRequirement";
import { LiveDomPostProcessRenderer } from "../../core/effects/postprocess/liveDomRenderer";
import { selectLiveDomPostProcessPass, withPostProcessFrameBackground } from "../../core/effects/postprocess/passes";
import { createDefaultPostProcessRenderer, type PostProcessRenderer } from "../../core/effects/postprocess/registry";
import type { AdjustmentVisualOverlay, AdjustmentVisualStyle } from "../../core/effects/types";
import { getBoundsUnion, getFrameObjectWithPreviewBounds, insetBounds } from "../../core/frameInteraction";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type TransitionLayer } from "../../core/types";
import type { PrerenderCacheBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type PreviewStackPart = { part: ComponentProps<typeof FramePreview>["part"]; start: number; previewTime: number };
type FramePreviewProps = ComponentProps<typeof FramePreview> & { previewParts?: PreviewStackPart[]; transitionPreviewParts?: { from: PreviewStackPart[]; to: PreviewStackPart[]; fromSceneTime: number; toSceneTime: number } | null; transitionLayers?: TransitionLayer[] };
type CachedPreviewDisplayMode = "dom" | "canvas2d" | "webgl";
const cachedMissGraceMs = 220;
const domFallbackReadyToleranceSeconds = 1 / 60;
const livePostProcessReasonLabel: Record<LiveDomPostProcessCapability["reason"], string> = {
  available: "available",
  "not-opted-in": "not opted in",
  "missing-source": "missing source subtree",
  "missing-layout-subtree": "missing canvas layoutsubtree support",
  "missing-paint": "missing paint invalidation support",
  "missing-tex-element-image": "missing WebGL texElementImage2D support",
};

function requiresDomOverlayPreview(props: FramePreviewProps): boolean {
  return props.canSelectObjects
    || props.focusPicking
    || props.trackerPicking
    || props.pickingTranslationPosition
    || props.pickingZoomFocus
    || props.framePickPoint !== null
    || props.dragBox !== null
    || props.marqueeDragging
    || props.selectedObjects.length > 0
    || props.editingTextObjectId !== null;
}

function getPreviewOverlayDisplayInsets(props: FramePreviewProps) {
  if (!requiresDomOverlayPreview(props) || props.selectedObjects.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };

  const cameraTransform = props.timelineMode === "composition"
    ? getLayeredCameraPreviewTransform(props.part, props.motionLayers, props.previewTime, { hiddenLayerIds: props.hiddenMotionLayerIds, pickingTranslationPosition: props.pickingTranslationPosition, pickingZoomFocus: props.pickingZoomFocus, resetMotionEffects: props.trackerPicking || props.focusPicking || props.pickingTranslationPosition || props.pickingZoomFocus })
    : props.cameraTransform;
  const selectableObjects = [...props.part.background.elements, ...props.part.objects];
  const selectedBounds = getBoundsUnion(props.selectedObjects.map((selected) => {
    const object = selectableObjects.find((item) => item.id === selected.id);
    return object ? getFrameObjectWithPreviewBounds(object, props.previewTime, props.part.duration).bounds : selected.bounds;
  }));
  const selectedViewportBounds = insetBounds(boundsToViewport(selectedBounds, cameraTransform, props.frameScale), -selectorOffsetPx);
  const handleBleedPx = selectorHandleSizePx;

  return {
    left: Math.max(0, -selectedViewportBounds.x + handleBleedPx),
    top: Math.max(0, -selectedViewportBounds.y + handleBleedPx),
    right: Math.max(0, selectedViewportBounds.x + selectedViewportBounds.width - FRAME_WIDTH * props.frameScale + handleBleedPx),
    bottom: Math.max(0, selectedViewportBounds.y + selectedViewportBounds.height - FRAME_HEIGHT * props.frameScale + handleBleedPx),
  };
}

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  editorPaneProps: ComponentProps<typeof EditorPane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
  liveDomPostProcessMaxFps: number;
  livePostProcessPreviewEnabled: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  prerenderCacheEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  getPrerenderCacheBlockAtTime: (time: number) => PrerenderCacheBlock | null;
  onCachedPreviewDisplayReadyChange: (ready: boolean) => void;
  currentSceneTimeRef: RefObject<number>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  previewRenderScale: number;
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, currentSceneTimeRef, editorPaneProps, framePreviewProps, getPrerenderCacheBlockAtTime, hasActiveComposition, liveDomPostProcessMaxFps, livePostProcessPreviewEnabled, mode, onModeChange, onPointerEnter, onPointerLeave, onCachedPreviewDisplayReadyChange, prerenderCacheBlackMissDebug, prerenderCacheEnabled, onScroll, previewKey, previewRenderScale, stageRef }: PreviewColumnProps) {
  const lastActiveFramePreviewPropsRef = useRef<FramePreviewProps | null>(null);
  const [previewOverlayHost, setPreviewOverlayHost] = useState<HTMLDivElement | null>(null);
  // Stabilize prerender renderer choice across mode switches: only
  // sync from prerenderCacheEnabled while in preview mode so the
  // active preview subtree (PrerenderVideoPreview vs FramePreview)
  // does not swap when the parent toggles prerender off in editor mode.
  const [displayPrerenderPreview, setDisplayPrerenderPreview] = useState(prerenderCacheEnabled);
  useEffect(() => {
    if (mode === "preview") {
      setDisplayPrerenderPreview(prerenderCacheEnabled);
    }
  }, [mode, prerenderCacheEnabled]);

  if (framePreviewProps && hasActiveComposition) lastActiveFramePreviewPropsRef.current = framePreviewProps;
  const stableFramePreviewProps = hasActiveComposition || !lastActiveFramePreviewPropsRef.current
    ? framePreviewProps
    : framePreviewProps
      ? { ...lastActiveFramePreviewPropsRef.current, frameScale: framePreviewProps.frameScale, isPlaying: framePreviewProps.isPlaying, playbackClock: framePreviewProps.playbackClock, sceneTime: framePreviewProps.sceneTime }
      : lastActiveFramePreviewPropsRef.current;
  const displayScale = stableFramePreviewProps ? stableFramePreviewProps.frameScale / previewRenderScale : 1;
  const activePreviewOverlayHost = mode === "preview" ? previewOverlayHost : null;
  const renderFramePreviewProps = stableFramePreviewProps ? { ...stableFramePreviewProps, frameScale: previewRenderScale, previewOverlayHost: activePreviewOverlayHost, selectionOverlayScale: displayScale } : null;
  const overlayDisplayInsets = stableFramePreviewProps ? getPreviewOverlayDisplayInsets(stableFramePreviewProps) : { left: 0, top: 0, right: 0, bottom: 0 };
  const previewDisplayStyle = stableFramePreviewProps ? { width: FRAME_WIDTH * stableFramePreviewProps.frameScale + overlayDisplayInsets.left + overlayDisplayInsets.right, height: FRAME_HEIGHT * stableFramePreviewProps.frameScale + overlayDisplayInsets.top + overlayDisplayInsets.bottom } as CSSProperties : undefined;
  const allowsDomOverlayOverflow = stableFramePreviewProps ? requiresDomOverlayPreview(stableFramePreviewProps) : false;
  const previewRenderStyle = stableFramePreviewProps ? { backfaceVisibility: "hidden", contain: allowsDomOverlayOverflow ? undefined : "paint", filter: displayScale === 1 ? undefined : "blur(0)", left: overlayDisplayInsets.left, top: overlayDisplayInsets.top, width: FRAME_WIDTH * previewRenderScale, height: FRAME_HEIGHT * previewRenderScale, transform: displayScale === 1 ? undefined : `translateZ(0) scale(${displayScale})`, transformOrigin: "top left", willChange: displayScale === 1 ? undefined : "transform" } as CSSProperties : undefined;

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]" data-clipper-preview-column onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="grid place-items-center border-b border-[#2d313b] px-[18px]" data-clipper-preview-toolbar>
        <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "preview" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("preview")}>Preview</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "editor" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("editor")}>Editor</button>
        </div>
      </div>

      {/* Outer positioning container — NOT the scroll viewport, no stageRef */}
      <div className="relative min-h-0 min-w-0 overflow-hidden">
        {/* Preview scroll viewport — stageRef, onScroll, data-clipper-preview-stage live here */}
        <div
          ref={stageRef}
          className={`timeline-scrollbar absolute inset-0 grid place-items-center p-[22px] ${mode === "preview" ? "overflow-auto [scrollbar-gutter:stable]" : "invisible pointer-events-none overflow-hidden"}`}
          data-clipper-preview-stage
          onScroll={onScroll}
        >
          <div className="relative" data-clipper-fixed-preview-display style={previewDisplayStyle}>
            {renderFramePreviewProps ? (
              <div className="absolute left-0 top-0" data-clipper-fixed-preview-render style={previewRenderStyle}>
                {displayPrerenderPreview
                  ? <PrerenderVideoPreview blackMissDebug={prerenderCacheBlackMissDebug} currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={renderFramePreviewProps} getBlockAtTime={getPrerenderCacheBlockAtTime} liveDomPostProcessMaxFps={liveDomPostProcessMaxFps} livePostProcessPreviewEnabled={livePostProcessPreviewEnabled} onCachedPreviewDisplayReadyChange={onCachedPreviewDisplayReadyChange} />
                  : <LivePostProcessFramePreview currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={renderFramePreviewProps} liveDomPostProcessMaxFps={liveDomPostProcessMaxFps} livePostProcessEnabled={livePostProcessPreviewEnabled} />}
                {!hasActiveComposition && !(mode === "editor" && !editorPaneProps) ? <div className="pointer-events-none absolute left-0 top-0 z-[2147483647] bg-black" data-clipper-stable-blank-preview-overlay style={{ width: FRAME_WIDTH * previewRenderScale, height: FRAME_HEIGHT * previewRenderScale }} /> : null}
              </div>
            ) : null}
          </div>
          {!hasActiveComposition && !renderFramePreviewProps && !(mode === "editor" && !editorPaneProps) ? <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" aria-label="Blank preview frame" data-clipper-blank-frame-preview style={blankFrameViewportStyle} /> : null}
        </div>

        {/* Editor overlay — sibling of scroll viewport, not inside it. Not affected by preview scrollTop/scrollLeft. */}
        {mode === "editor" && editorPaneProps ? <div className="absolute inset-0 z-10"><EditorPane {...editorPaneProps} /></div> : null}
        {mode === "editor" && !editorPaneProps ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm font-bold text-[#9b9da7]">No file is open in the editor.</div> : null}
        {mode === "preview" ? <div ref={setPreviewOverlayHost} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-clipper-preview-overlay-host /> : null}
      </div>
      {children}
    </section>
  );
}

function PrerenderVideoPreview({ blackMissDebug, currentSceneTimeRef, framePreviewProps, getBlockAtTime, liveDomPostProcessMaxFps, livePostProcessPreviewEnabled, onCachedPreviewDisplayReadyChange }: { blackMissDebug: boolean; currentSceneTimeRef: RefObject<number>; framePreviewProps: FramePreviewProps; getBlockAtTime: (time: number) => PrerenderCacheBlock | null; liveDomPostProcessMaxFps: number; livePostProcessPreviewEnabled: boolean; onCachedPreviewDisplayReadyChange: (ready: boolean) => void }) {
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const postProcessRendererRef = useRef<PostProcessRenderer | null>(null);
  const postProcessRendererKindRef = useRef<string | null>(null);
  const lastFrameKeyRef = useRef("");
  const firstMissAtRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const initialDisplayMode = framePreviewProps.isPlaying ? "canvas2d" : "dom";
  const displayModeRef = useRef<CachedPreviewDisplayMode>(initialDisplayMode);
  const [displayMode, setDisplayMode] = useState<CachedPreviewDisplayMode>(initialDisplayMode);
  const frameScale = framePreviewProps.frameScale;
  const previewStyle = { width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale } as CSSProperties;
  const cachedCanvasStyle = { width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${frameScale})`, transformOrigin: "top left" } as CSSProperties;

  function updateDisplayMode(nextMode: CachedPreviewDisplayMode) {
    if (displayModeRef.current === nextMode) return;
    displayModeRef.current = nextMode;
    setDisplayMode(nextMode);
  }

  function updateDisplayReady(ready: boolean) {
    if (displayReadyRef.current === ready) return;
    displayReadyRef.current = ready;
    onCachedPreviewDisplayReadyChange(ready);
  }

  useEffect(() => {
    for (const canvas of [canvas2dRef.current, webglCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
    }
  }, []);

  useEffect(() => {
    let frameId = 0;
    const sync = () => {
      drawCachedFrameAtTime(currentSceneTimeRef.current);
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [currentSceneTimeRef, framePreviewProps.adjustmentLayers, getBlockAtTime]);

  useEffect(() => () => {
    destroyCachedPostProcessRenderer();
    updateDisplayReady(false);
  }, []);

  function getPostProcessRenderer(kind: string) {
    if (postProcessRendererRef.current && postProcessRendererKindRef.current === kind) return postProcessRendererRef.current;
    destroyCachedPostProcessRenderer();
    postProcessRendererRef.current = createDefaultPostProcessRenderer(kind);
    postProcessRendererKindRef.current = postProcessRendererRef.current ? kind : null;
    return postProcessRendererRef.current;
  }

  function destroyCachedPostProcessRenderer() {
    postProcessRendererRef.current?.destroy();
    postProcessRendererRef.current = null;
    postProcessRendererKindRef.current = null;
  }

  function drawCachedFrameAtTime(sceneTime: number) {
    if (requiresDomOverlayPreview(framePreviewProps)) {
      showDomFallback();
      return;
    }

    const block = getBlockAtTime(sceneTime);
    const frame = block ? getFrameForTime(block, sceneTime) : null;
    if (!block || !frame) {
      showTransientMiss(sceneTime);
      return;
    }

    firstMissAtRef.current = null;
    const postProcessPasses = applyAdjustmentLayersToPostProcessPasses(sceneTime, framePreviewProps.adjustmentLayers, undefined, { width: block.width, height: block.height });
    const { pass: webGlPostProcessPass } = selectLiveDomPostProcessPass(postProcessPasses);
    const targetDisplayMode: CachedPreviewDisplayMode = webGlPostProcessPass ? "webgl" : "canvas2d";
    const frameKey = `${targetDisplayMode}:${block.startTime}:${frame.sceneTime}:${JSON.stringify(postProcessPasses)}`;
    if (lastFrameKeyRef.current !== frameKey) {
      if (webGlPostProcessPass) {
        const canvas = webglCanvasRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const renderer = getPostProcessRenderer(webGlPostProcessPass.kind);
        if (!renderer) {
          showDomFallback();
          return;
        }
        const decoratedPass = withPostProcessFrameBackground(webGlPostProcessPass, framePreviewProps.part.frame.style.background);
        if (!renderer.render(canvas, frame.bitmap, decoratedPass, block.width, block.height)) {
          showDomFallback();
          return;
        }
      } else {
        const canvas = canvas2dRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
        if (!context) {
          showDomFallback();
          return;
        }
        drawFrameImage(context, frame.bitmap, block.width, block.height);
      }
      lastFrameKeyRef.current = frameKey;
    }
    updateDisplayMode(targetDisplayMode);
    updateDisplayReady(true);
  }

  function showDomFallback() {
    updateDisplayReady(false);
    lastFrameKeyRef.current = "";
    firstMissAtRef.current = null;
    if (displayModeRef.current === "dom") return;
    updateDisplayMode("dom");
  }

  function showTransientMiss(sceneTime: number) {
    const now = performance.now();
    firstMissAtRef.current ??= now;
    updateDisplayReady(false);
    if (displayModeRef.current !== "dom" && lastFrameKeyRef.current && now - firstMissAtRef.current < cachedMissGraceMs) return;
    if (!isDomFallbackReady(sceneTime) && lastFrameKeyRef.current) {
      updateDisplayMode(displayModeRef.current === "webgl" ? "webgl" : "canvas2d");
      return;
    }
    if (blackMissDebug || framePreviewProps.isPlaying) showBlackMiss();
    else showDomFallback();
  }

  function showBlackMiss() {
    const canvas = canvas2dRef.current;
    if (canvas && lastFrameKeyRef.current !== "black") {
      const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
      if (context) {
        context.fillStyle = "#000";
        context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      }
      lastFrameKeyRef.current = "black";
    }
    updateDisplayMode("canvas2d");
    updateDisplayReady(false);
  }

  function isDomFallbackReady(sceneTime: number) {
    return Math.abs(framePreviewProps.sceneTime - sceneTime) <= domFallbackReadyToleranceSeconds;
  }

  const showingCachedCanvas = displayMode !== "dom";
  const showingCanvas2d = displayMode === "canvas2d";
  const showingWebgl = displayMode === "webgl";

  return (
    <div className="relative" data-clipper-prerender-video-preview-wrapper style={previewStyle}>
      <div className="relative" data-clipper-prerender-video-preview-stage style={previewStyle}>
        <div className={`absolute left-0 top-0 ${showingCachedCanvas ? "pointer-events-none opacity-0 invisible" : "opacity-100 visible"}`} aria-hidden={showingCachedCanvas}>
          <LivePostProcessFramePreview currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={framePreviewProps} liveDomPostProcessMaxFps={liveDomPostProcessMaxFps} livePostProcessEnabled={livePostProcessPreviewEnabled && displayMode === "dom"} />
        </div>
        <canvas ref={canvas2dRef} className={`absolute left-0 top-0 bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${showingCanvas2d ? "opacity-100" : "pointer-events-none opacity-0"}`} style={cachedCanvasStyle} data-clipper-prerender-canvas-preview="2d" />
        <canvas ref={webglCanvasRef} className={`absolute left-0 top-0 bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${showingWebgl ? "opacity-100" : "pointer-events-none opacity-0"}`} style={cachedCanvasStyle} data-clipper-prerender-canvas-preview="webgl" />
      </div>
    </div>
  );
}

function LivePostProcessFramePreview({ currentSceneTimeRef, framePreviewProps, liveDomPostProcessMaxFps, livePostProcessEnabled }: { currentSceneTimeRef: RefObject<number>; framePreviewProps: FramePreviewProps; liveDomPostProcessMaxFps: number; livePostProcessEnabled: boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const normalPreviewRef = useRef<HTMLDivElement | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceElementRef = useRef<HTMLDivElement | null>(null);
  const sourceCameraRef = useRef<HTMLDivElement | null>(null);
  const sourceFrameViewportRef = useRef<HTMLDivElement | null>(null);
  const sourceDragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<LiveDomPostProcessRenderer | null>(null);
  const previewLayersRef = useRef<AdjustmentLayer[] | null>(null);
  const missingTextureUploadRef = useRef(false);
  const diagnosticReasonRef = useRef<LiveDomPostProcessCapability["reason"] | null>(null);
  const showLiveCanvasRef = useRef(false);
  const activeLiveSourceRequiredRef = useRef(false);
  const activeLivePostProcessPassRef = useRef(false);
  const liveVisualStyleKeyRef = useRef("");
  const lastLiveRenderAtRef = useRef(0);
  const hasValidLiveFrameRef = useRef(false);
  const hasActivatedLiveCanvasRef = useRef(false);
  const liveRenderDirtyRef = useRef(true);
  const lastStoppedSceneTimeRef = useRef<number | null>(null);
  const [showLiveCanvas, setShowLiveCanvas] = useState(false);
  const [activeLiveSourceRequired, setActiveLiveSourceRequired] = useState(false);
  const [liveVisualStyle, setLiveVisualStyle] = useState<AdjustmentVisualStyle>({});
  const [diagnosticReason, setDiagnosticReason] = useState<LiveDomPostProcessCapability["reason"] | null>(null);
  const frameScale = framePreviewProps.frameScale;
  const livePostProcessMinFrameIntervalMs = 1000 / Math.max(1, liveDomPostProcessMaxFps);
  const previewStyle = { width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale } as CSSProperties;
  const liveCanvasStyle = { width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${frameScale})`, transformOrigin: "top left" } as CSSProperties;
  const sourceCanvasStyle = { width: FRAME_WIDTH, height: FRAME_HEIGHT, left: 0, top: 0, overflow: "hidden" } as CSSProperties;
  const sourceFramePreviewProps: FramePreviewProps = {
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

  function updateDiagnosticReason(reason: LiveDomPostProcessCapability["reason"] | null) {
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

  function clearInactiveLivePreview(reason: LiveDomPostProcessCapability["reason"] | null) {
    activeLivePostProcessPassRef.current = false;
    hideLiveCanvas();
    missingTextureUploadRef.current = false;
    updateDiagnosticReason(reason);
    rendererRef.current?.destroy();
    rendererRef.current = null;
  }

  function keepLastLiveFrameIfAvailable() {
    updateShowLiveCanvas(hasActivatedLiveCanvasRef.current && hasValidLiveFrameRef.current);
  }

  function renderLiveFrame() {
    const canvas = renderCanvasRef.current;
    const layers = previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
    const sceneTime = currentSceneTimeRef.current;
    const requirement = collectLiveDomPostProcessRequirement({ sceneTime, layers, frameSize: { width: FRAME_WIDTH, height: FRAME_HEIGHT } });
    const { pass: livePass } = selectLiveDomPostProcessPass(requirement.passes);
    const optIn = isLiveDomPostProcessPreviewOptedIn();
    if (!canvas || !livePass || !livePostProcessEnabled || !optIn) {
      updateActiveLiveSourceRequired(requirement.requiresLiveDomSource);
      clearInactiveLivePreview(!livePostProcessEnabled || !optIn ? "not-opted-in" : null);
      return false;
    }
    const source = sourceElementRef.current ?? canvas.querySelector<Element>(":scope > [data-clipper-frame-content]") ?? null;
    if (!source) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-source");
      return false;
    }
    const preflight = getLiveDomPostProcessPreflight({ optIn, sourceElement: source, canvas });
    if (!preflight.supported) {
      keepLastLiveFrameIfAvailable();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      updateDiagnosticReason(preflight.reason);
      return preflight.reason !== "missing-source";
    }
    if (missingTextureUploadRef.current) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-tex-element-image");
      return true;
    }

    rendererRef.current ??= new LiveDomPostProcessRenderer();
    const result = rendererRef.current.render({ canvas, sourceElement: source, pass: withPostProcessFrameBackground(livePass, framePreviewProps.part.frame.style.background), width: FRAME_WIDTH, height: FRAME_HEIGHT, optIn });
    if (result.rendered) {
      hasValidLiveFrameRef.current = true;
      hasActivatedLiveCanvasRef.current = true;
      updateShowLiveCanvas(true);
    } else {
      keepLastLiveFrameIfAvailable();
    }
    updateDiagnosticReason(result.rendered ? null : result.capability.reason);
    if (!result.rendered) {
      if (result.capability.reason === "missing-tex-element-image") {
        missingTextureUploadRef.current = true;
      } else {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    }
    return true;
  }

  function updateActiveLiveSourceRequired(value: boolean) {
    if (activeLiveSourceRequiredRef.current === value) return;
    activeLiveSourceRequiredRef.current = value;
    setActiveLiveSourceRequired(value);
  }

  function updateLiveVisualStyle(style: AdjustmentVisualStyle) {
    const key = JSON.stringify(style);
    if (liveVisualStyleKeyRef.current === key) return;
    liveVisualStyleKeyRef.current = key;
    setLiveVisualStyle(style);
  }

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const layers = (event as CustomEvent<{ layers?: AdjustmentLayer[] | null }>).detail?.layers ?? null;
      previewLayersRef.current = layers;
      liveRenderDirtyRef.current = true;
      if (!livePostProcessEnabled) {
        clearInactiveLivePreview("not-opted-in");
        return;
      }
      const requirement = collectLiveDomPostProcessRequirement({ sceneTime: currentSceneTimeRef.current, layers: layers ?? framePreviewProps.adjustmentLayers, frameSize: { width: FRAME_WIDTH, height: FRAME_HEIGHT } });
      const { pass: livePass } = selectLiveDomPostProcessPass(requirement.passes);
      if (!livePass) clearInactiveLivePreview(null);
    };
    window.addEventListener("clipper:preview-postprocess-adjustment", handlePreview);
    return () => window.removeEventListener("clipper:preview-postprocess-adjustment", handlePreview);
  }, [currentSceneTimeRef, framePreviewProps.adjustmentLayers, livePostProcessEnabled]);

  useEffect(() => {
    previewLayersRef.current = null;
    liveRenderDirtyRef.current = true;
    const requirement = collectLiveDomPostProcessRequirement({ sceneTime: currentSceneTimeRef.current, layers: framePreviewProps.adjustmentLayers, frameSize: { width: FRAME_WIDTH, height: FRAME_HEIGHT } });
    const { pass: livePass } = selectLiveDomPostProcessPass(requirement.passes);
    if (!livePostProcessEnabled || !livePass) clearInactiveLivePreview(!livePostProcessEnabled ? "not-opted-in" : null);
  }, [framePreviewProps.adjustmentLayers]);

  useEffect(() => {
    liveRenderDirtyRef.current = true;
    if (!livePostProcessEnabled) clearInactiveLivePreview("not-opted-in");
  }, [livePostProcessEnabled]);

  useEffect(() => {
    liveRenderDirtyRef.current = true;
    hideLiveCanvas();
  }, [framePreviewProps.part]);

  useEffect(() => {
    const canvas = renderCanvasRef.current;
    if (!canvas || canvas.hasAttribute("layoutsubtree")) return;
    canvas.setAttribute("layoutsubtree", "");
  }, [activeLiveSourceRequired, showLiveCanvas]);

  useEffect(() => {
    let frameId = 0;
    const sync = (now: number) => {
      if (requiresDomOverlayPreview(framePreviewProps)) {
        clearInactiveLivePreview("not-opted-in");
        frameId = requestAnimationFrame(sync);
        return;
      }
      const canvas = renderCanvasRef.current;
      const layers = previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
      const sceneTime = currentSceneTimeRef.current;
      const requirement = collectLiveDomPostProcessRequirement({ sceneTime, layers, frameSize: { width: FRAME_WIDTH, height: FRAME_HEIGHT } });
      const { pass: livePass } = selectLiveDomPostProcessPass(requirement.passes);
      const optIn = isLiveDomPostProcessPreviewOptedIn();
      if (!canvas || !livePass || !livePostProcessEnabled || !optIn) {
        updateActiveLiveSourceRequired(requirement.requiresLiveDomSource);
        clearInactiveLivePreview(!livePostProcessEnabled || !optIn ? "not-opted-in" : null);
        frameId = requestAnimationFrame(sync);
        return;
      }
      const enteringLivePostProcess = !activeLivePostProcessPassRef.current;
      activeLivePostProcessPassRef.current = true;
      if (enteringLivePostProcess) liveRenderDirtyRef.current = true;
      updateActiveLiveSourceRequired(requirement.requiresLiveDomSource);
      updateLiveVisualStyle(applyAdjustmentLayersToVisualStyle(sceneTime, layers));
      keepLastLiveFrameIfAvailable();
      if (!framePreviewProps.isPlaying && lastStoppedSceneTimeRef.current !== sceneTime) {
        liveRenderDirtyRef.current = true;
        lastStoppedSceneTimeRef.current = sceneTime;
      }
      const minFrameIntervalMs = framePreviewProps.isPlaying ? livePostProcessMinFrameIntervalMs : 1000 / 30;
      const elapsedSinceRender = now - lastLiveRenderAtRef.current;
      const shouldRender = framePreviewProps.isPlaying || liveRenderDirtyRef.current;
      if (!shouldRender) {
        frameId = requestAnimationFrame(sync);
        return;
      }
      if (framePreviewProps.isPlaying && !enteringLivePostProcess && elapsedSinceRender < minFrameIntervalMs) {
        frameId = requestAnimationFrame(sync);
        return;
      }
      lastLiveRenderAtRef.current = now;
      const renderAttemptComplete = renderLiveFrame();
      if (renderAttemptComplete && !framePreviewProps.isPlaying) liveRenderDirtyRef.current = false;
      if (renderAttemptComplete && framePreviewProps.isPlaying) liveRenderDirtyRef.current = false;
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(frameId);
      rendererRef.current?.destroy();
      rendererRef.current = null;
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
  }, [currentSceneTimeRef, framePreviewProps.adjustmentLayers, livePostProcessEnabled]);

  const diagnostic = diagnosticReason ? `Live post-process preview: ${livePostProcessReasonLabel[diagnosticReason]}` : undefined;
  const outputRequiresLiveSource = livePostProcessEnabled && activeLiveSourceRequired;
  const liveCanvasFilterStyle = liveVisualStyle.filter ? { filter: liveVisualStyle.filter } as CSSProperties : undefined;

  return (
    <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" data-clipper-live-postprocess-preview-wrapper data-clipper-live-postprocess-status={diagnosticReason ?? "ready"} ref={wrapperRef} style={previewStyle} title={diagnostic}>
      <div className="absolute inset-0 z-10 overflow-hidden" aria-hidden={showLiveCanvas} ref={normalPreviewRef} style={{ opacity: showLiveCanvas ? 0 : 1, pointerEvents: showLiveCanvas ? "none" : undefined, visibility: showLiveCanvas ? "hidden" : "visible" }}>
        <FramePreview {...framePreviewProps} />
      </div>
      {outputRequiresLiveSource || showLiveCanvas ? <canvas aria-hidden="true" ref={renderCanvasRef} className="pointer-events-none absolute left-0 top-0 z-0 block bg-black" data-clipper-live-postprocess-canvas="html-in-canvas" height={FRAME_HEIGHT} style={{ ...liveCanvasStyle, ...liveCanvasFilterStyle, opacity: 1, visibility: "visible" }} width={FRAME_WIDTH}>
          {outputRequiresLiveSource ? <div aria-hidden="true" className="pointer-events-none absolute" data-clipper-live-postprocess-source inert={true} ref={sourceElementRef} style={sourceCanvasStyle}>
            <FramePreview {...sourceFramePreviewProps} />
          </div> : null}
        </canvas> : null}
      {showLiveCanvas ? <LiveVisualOverlays overlays={liveVisualStyle.overlays} /> : null}
    </div>
  );
}

function LiveVisualOverlays({ overlays }: { overlays: AdjustmentVisualOverlay[] | undefined }) {
  return <>{overlays?.map((overlay) => <div className="pointer-events-none absolute inset-0" key={overlay.id} style={{ zIndex: 2147483647, ...overlay.style }} />)}</>;
}

const noopFramePointer: FramePreviewProps["onFramePointerDown"] = () => {};
const noopObjectPointerDown: FramePreviewProps["onObjectPointerDown"] = () => {};
const noopObjectResizePointerDown: FramePreviewProps["onObjectResizePointerDown"] = () => {};
const noopTextEditCommit: FramePreviewProps["onTextEditCommit"] = () => {};
const noopTextObjectDoubleClick: FramePreviewProps["onTextObjectDoubleClick"] = () => {};
const noopTrackerTargetPick: FramePreviewProps["onTrackerTargetPick"] = () => {};

function drawFrameImage(context: CanvasRenderingContext2D, bitmap: ImageBitmap, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0);
}

function getFrameForTime(block: PrerenderCacheBlock, sceneTime: number) {
  const sceneFrameIndex = Math.round(sceneTime * block.frameRate);
  const blockStartFrameIndex = Math.round(block.startTime * block.frameRate);
  const frameIndex = sceneFrameIndex - blockStartFrameIndex;
  if (frameIndex < 0 || frameIndex >= block.frames.length) return null;
  return block.frames[frameIndex] ?? null;
}
