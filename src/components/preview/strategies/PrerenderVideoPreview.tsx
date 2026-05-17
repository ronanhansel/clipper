import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import { measurePreviewPerf } from "../../../core/effects/postprocess/perf";
import { withPostProcessFrameBackground } from "../../../core/effects/postprocess/passes";
import { subscribeMasterTimelineClock } from "../../../app/features/playback/playbackTimeStore";
import {
  createDefaultPostProcessRenderer,
  type PostProcessRenderer,
} from "../../../core/effects/postprocess/registry";
import type {
  AdjustmentVisualStyle,
  PostProcessPass,
} from "../../../core/effects/types";
import { createCanvas2dBackend } from "../backends/Canvas2dBackend";
import type { RenderBackend } from "../backends/types";
import type { PrerenderBlock } from "../../../app/features/preview/usePrerenderCache";
import { useChangedSetState } from "../passes/useChangedSetState";
import type { PreviewRenderScheduler } from "../scheduler/usePreviewRenderScheduler";
import { LivePostProcessFramePreview } from "./LivePostProcessFramePreview";
import {
  PRERENDER_MISS_GRACE_MS,
  DOM_FALLBACK_READY_TOLERANCE_SECONDS,
  LiveVisualOverlays,
  computePostProcessPlan,
  getFrameForTime,
  makePreviewCanvasStyle,
  readPreviewSceneTime,
  requiresDomOverlayPreview,
  type PrerenderDisplayMode,
  type StrategyFramePreviewProps,
} from "./preview";

export type PrerenderVideoPreviewProps = {
  blackMissDebug: boolean;
  currentSceneTimeRef: RefObject<number>;
  framePreviewProps: StrategyFramePreviewProps;
  getBlockAtTime: (time: number) => PrerenderBlock | null;
  liveDomPostProcessMaxFps: number;
  livePostProcessPreviewEnabled: boolean;
  onPrerenderDisplayReadyChange: (ready: boolean) => void;
  scheduler: PreviewRenderScheduler;
};

export function PrerenderVideoPreview({
  blackMissDebug,
  currentSceneTimeRef,
  framePreviewProps,
  getBlockAtTime,
  liveDomPostProcessMaxFps,
  livePostProcessPreviewEnabled,
  onPrerenderDisplayReadyChange,
  scheduler,
}: PrerenderVideoPreviewProps) {
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglScratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas2dBackendRef = useRef<RenderBackend | null>(null);
  if (!canvas2dBackendRef.current)
    canvas2dBackendRef.current = createCanvas2dBackend();
  const postProcessRenderersRef = useRef<Map<string, PostProcessRenderer>>(
    new Map(),
  );
  const lastFrameKeyRef = useRef("");
  const firstMissAtRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const initialDisplayMode = framePreviewProps.isPlaying ? "canvas2d" : "dom";
  const displayModeRef = useRef<PrerenderDisplayMode>(initialDisplayMode);
  const [displayMode, setDisplayMode] =
    useState<PrerenderDisplayMode>(initialDisplayMode);
  const frameScale = framePreviewProps.frameScale;
  const previewStyle = {
    width: FRAME_WIDTH * frameScale,
    height: FRAME_HEIGHT * frameScale,
  } as CSSProperties;
  const previewCanvasStyle = makePreviewCanvasStyle(frameScale);
  const [prerenderVisualStyle, setPrerenderVisualStyle] =
    useChangedSetState<AdjustmentVisualStyle>({});
  const prerenderCanvasFilterStyle = prerenderVisualStyle.filter
    ? ({ filter: prerenderVisualStyle.filter } as CSSProperties)
    : undefined;

  function updateDisplayMode(nextMode: PrerenderDisplayMode) {
    if (displayModeRef.current === nextMode) return;
    displayModeRef.current = nextMode;
    setDisplayMode(nextMode);
  }

  function updateDisplayReady(ready: boolean) {
    if (displayReadyRef.current === ready) return;
    displayReadyRef.current = ready;
    onPrerenderDisplayReadyChange(ready);
  }

  useEffect(() => {
    for (const canvas of [canvas2dRef.current, webglCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = scheduler.subscribe(() => {
      drawPrerenderFrameAtTime(readPreviewSceneTime(currentSceneTimeRef));
    });
    scheduler.requestRender("edit");
    return unsubscribe;
  }, [
    scheduler,
    currentSceneTimeRef,
    framePreviewProps.adjustmentLayers,
    getBlockAtTime,
  ]);

  useEffect(() => {
    scheduler.requestRender("scrub");
  }, [scheduler, framePreviewProps.sceneTime]);

  useEffect(() => {
    const unsubscribe = subscribeMasterTimelineClock(() => {
      scheduler.requestRender("scrub");
    });
    return unsubscribe;
  }, [scheduler]);

  useEffect(
    () => () => {
      destroyPrerenderPostProcessRenderer();
      updateDisplayReady(false);
    },
    [],
  );

  function getPostProcessRenderer(kind: string) {
    const existing = postProcessRenderersRef.current.get(kind);
    if (existing) return existing;
    const renderer = createDefaultPostProcessRenderer(kind);
    if (renderer) postProcessRenderersRef.current.set(kind, renderer);
    return renderer;
  }

  function destroyPrerenderPostProcessRenderer() {
    for (const renderer of postProcessRenderersRef.current.values())
      renderer.destroy();
    postProcessRenderersRef.current.clear();
  }

  function drawPrerenderFrameAtTime(sceneTime: number) {
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
    const planBundle = measurePreviewPerf(
      "prerender.buildAdjustmentExecutionPlan",
      () =>
        computePostProcessPlan(
          sceneTime,
          framePreviewProps.adjustmentLayers,
          framePreviewProps.transitionPreviewParts ?? null,
          { width: block.width, height: block.height },
        ),
    );
    const postProcessPasses = planBundle.passes;
    const webGlPostProcessPasses = planBundle.livePasses;
    const visualStyle = planBundle.visualStyleAfterLastLive;
    if (
      webGlPostProcessPasses.length > 0 &&
      planBundle.visualStyleBeforeFirstLive.filter
    ) {
      showDomFallback();
      return;
    }
    setPrerenderVisualStyle(visualStyle);
    const targetDisplayMode: PrerenderDisplayMode =
      webGlPostProcessPasses.length > 0 ? "webgl" : "canvas2d";
    const frameKey = `${targetDisplayMode}:${block.startTime}:${frame.sceneTime}:${JSON.stringify(postProcessPasses)}`;
    if (lastFrameKeyRef.current !== frameKey) {
      if (webGlPostProcessPasses.length > 0) {
        const canvas = webglCanvasRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const rendered = renderPrerenderPostProcessPasses({
          canvas,
          source: frame.bitmap,
          passes: webGlPostProcessPasses.map((pass) =>
            withPostProcessFrameBackground(
              pass,
              framePreviewProps.part.frame.style.backgroundColor,
            ),
          ),
          width: block.width,
          height: block.height,
        });
        if (!rendered) {
          showDomFallback();
          return;
        }
      } else {
        const canvas = canvas2dRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const result = measurePreviewPerf(
          "prerender.canvas2d.drawFrameImage",
          () =>
            canvas2dBackendRef.current!.renderComposition({
              composition: framePreviewProps.part,
              localTime: frame.sceneTime,
              duration: framePreviewProps.part.duration,
              viewport: { width: block.width, height: block.height },
              source: frame.bitmap,
              target: canvas,
            }),
        );
        if (!result.rendered) {
          showDomFallback();
          return;
        }
      }
      lastFrameKeyRef.current = frameKey;
    }
    updateDisplayMode(targetDisplayMode);
    updateDisplayReady(true);
  }

  function renderPrerenderPostProcessPasses(input: {
    canvas: HTMLCanvasElement;
    source: TexImageSource;
    passes: PostProcessPass[];
    width: number;
    height: number;
  }) {
    let sourceFrame = input.source;
    webglScratchCanvasRef.current ??= document.createElement("canvas");
    const scratchCanvases = [
      canvas2dRef.current,
      webglScratchCanvasRef.current,
    ].filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas));
    for (let index = 0; index < input.passes.length; index += 1) {
      const pass = input.passes[index];
      const renderer = getPostProcessRenderer(pass.kind);
      if (!renderer) return false;
      const isLast = index === input.passes.length - 1;
      const outputCanvas = isLast
        ? input.canvas
        : (scratchCanvases[index % scratchCanvases.length] ?? input.canvas);
      const rendered = measurePreviewPerf("prerender.webgl.render", () =>
        renderer.render(
          outputCanvas,
          sourceFrame,
          pass,
          input.width,
          input.height,
        ),
      );
      if (!rendered) return false;
      sourceFrame = outputCanvas;
    }
    return true;
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
    if (
      displayModeRef.current !== "dom" &&
      lastFrameKeyRef.current &&
      now - firstMissAtRef.current < PRERENDER_MISS_GRACE_MS
    )
      return;
    if (!isDomFallbackReady(sceneTime) && lastFrameKeyRef.current) {
      updateDisplayMode(
        displayModeRef.current === "webgl" ? "webgl" : "canvas2d",
      );
      return;
    }
    if (blackMissDebug || framePreviewProps.isPlaying) showBlackMiss();
    else showDomFallback();
  }

  function showBlackMiss() {
    const canvas = canvas2dRef.current;
    if (canvas && lastFrameKeyRef.current !== "black") {
      const context = canvas.getContext("2d", {
        alpha: true,
        colorSpace: "srgb",
      });
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
    return (
      Math.abs(framePreviewProps.sceneTime - sceneTime) <=
      DOM_FALLBACK_READY_TOLERANCE_SECONDS
    );
  }

  const showingPrerenderCanvas = displayMode !== "dom";
  const showingCanvas2d = displayMode === "canvas2d";
  const showingWebgl = displayMode === "webgl";

  return (
    <div
      className="relative"
      data-clipper-prerender-video-preview-wrapper
      style={previewStyle}
    >
      <div
        className="relative"
        data-clipper-prerender-video-preview-stage
        style={previewStyle}
      >
        <div
          className={`absolute left-0 top-0 ${showingPrerenderCanvas ? "pointer-events-none opacity-0 invisible" : "opacity-100 visible"}`}
          aria-hidden={showingPrerenderCanvas}
        >
          <LivePostProcessFramePreview
            currentSceneTimeRef={currentSceneTimeRef}
            framePreviewProps={framePreviewProps}
            liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
            livePostProcessEnabled={
              livePostProcessPreviewEnabled && displayMode === "dom"
            }
            scheduler={scheduler}
          />
        </div>
        <canvas
          ref={canvas2dRef}
          className={`absolute left-0 top-0 bg-black ${showingCanvas2d ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ ...previewCanvasStyle, ...prerenderCanvasFilterStyle }}
          data-clipper-prerender-canvas-preview="2d"
        />
        <canvas
          ref={webglCanvasRef}
          className={`absolute left-0 top-0 bg-black ${showingWebgl ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ ...previewCanvasStyle, ...prerenderCanvasFilterStyle }}
          data-clipper-prerender-canvas-preview="webgl"
        />
        {showingPrerenderCanvas ? (
          <LiveVisualOverlays overlays={prerenderVisualStyle.overlays} />
        ) : null}
      </div>
    </div>
  );
}
