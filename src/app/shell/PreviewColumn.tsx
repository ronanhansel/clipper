import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject, type UIEvent } from "react";
import { EditorPane } from "../../components/EditorPane";
import { FramePreview } from "../../components/preview/FramePreview";
import { FRAME_HEIGHT, FRAME_WIDTH, type TransitionLayer } from "../../core/types";
import type { PrerenderCacheBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type PreviewStackPart = { part: ComponentProps<typeof FramePreview>["part"]; start: number; previewTime: number };
type FramePreviewProps = ComponentProps<typeof FramePreview> & { previewParts?: PreviewStackPart[]; transitionPreviewParts?: { from: PreviewStackPart[]; to: PreviewStackPart[]; fromSceneTime: number; toSceneTime: number } | null; transitionLayers?: TransitionLayer[] };
type CachedPreviewDisplayMode = "dom" | "canvas";
const cachedMissGraceMs = 220;
const domFallbackReadyToleranceSeconds = 1 / 60;

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  editorPaneProps: ComponentProps<typeof EditorPane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
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
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, currentSceneTimeRef, editorPaneProps, framePreviewProps, getPrerenderCacheBlockAtTime, hasActiveComposition, mode, onModeChange, onPointerEnter, onPointerLeave, onCachedPreviewDisplayReadyChange, prerenderCacheBlackMissDebug, prerenderCacheEnabled, onScroll, previewKey, stageRef }: PreviewColumnProps) {
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]" data-clipper-preview-column onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="grid place-items-center border-b border-[#2d313b] px-[18px]" data-clipper-preview-toolbar>
        <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "preview" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("preview")}>Preview</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "editor" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("editor")}>Editor</button>
        </div>
      </div>

      <div ref={stageRef} className={`timeline-scrollbar relative grid min-h-0 ${mode === "preview" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`} data-clipper-preview-stage onScroll={onScroll}>
        {mode === "preview" && framePreviewProps ? (
          prerenderCacheEnabled
            ? <PrerenderVideoPreview key={`prerender:${previewKey}`} blackMissDebug={prerenderCacheBlackMissDebug} currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={framePreviewProps} getBlockAtTime={getPrerenderCacheBlockAtTime} onCachedPreviewDisplayReadyChange={onCachedPreviewDisplayReadyChange} />
            : <FramePreview key={previewKey} {...framePreviewProps} />
        ) : null}
        {mode === "preview" && !hasActiveComposition ? <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" aria-label="Blank preview frame" data-clipper-blank-frame-preview style={blankFrameViewportStyle} /> : null}
        {mode === "editor" && editorPaneProps ? <div className="min-h-0 h-full w-full"><EditorPane {...editorPaneProps} /></div> : null}
        {mode === "editor" && !editorPaneProps ? <div className="grid place-items-center p-6 text-center text-sm font-bold text-[#9b9da7]">No file is open in the editor.</div> : null}
      </div>
      {children}
    </section>
  );
}

function PrerenderVideoPreview({ blackMissDebug, currentSceneTimeRef, framePreviewProps, getBlockAtTime, onCachedPreviewDisplayReadyChange }: { blackMissDebug: boolean; currentSceneTimeRef: RefObject<number>; framePreviewProps: FramePreviewProps; getBlockAtTime: (time: number) => PrerenderCacheBlock | null; onCachedPreviewDisplayReadyChange: (ready: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameKeyRef = useRef("");
  const firstMissAtRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const displayModeRef = useRef<CachedPreviewDisplayMode>("dom");
  const [displayMode, setDisplayMode] = useState<CachedPreviewDisplayMode>("dom");
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
  }, []);

  useEffect(() => {
    let frameId = 0;
    const sync = () => {
      drawCachedFrameAtTime(currentSceneTimeRef.current);
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [currentSceneTimeRef, getBlockAtTime]);

  useEffect(() => () => {
    updateDisplayReady(false);
  }, []);

  function drawCachedFrameAtTime(sceneTime: number) {
    const canvas = canvasRef.current;
    const block = getBlockAtTime(sceneTime);
    const frame = block ? getFrameForTime(block, sceneTime) : null;
    if (!canvas || !block || !frame) {
      showTransientMiss(sceneTime);
      return;
    }

    firstMissAtRef.current = null;
    const frameKey = `${block.startTime}:${frame.sceneTime}`;
    if (lastFrameKeyRef.current !== frameKey) {
      const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
      if (!context) {
        showDomFallback();
        return;
      }
      drawFrameImage(context, frame.bitmap, block.width, block.height);
      lastFrameKeyRef.current = frameKey;
    }
    updateDisplayMode("canvas");
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
    if (displayModeRef.current === "canvas" && lastFrameKeyRef.current && now - firstMissAtRef.current < cachedMissGraceMs) return;
    if (!isDomFallbackReady(sceneTime) && lastFrameKeyRef.current) {
      updateDisplayMode("canvas");
      return;
    }
    if (blackMissDebug) showBlackMiss();
    else showDomFallback();
  }

  function showBlackMiss() {
    const canvas = canvasRef.current;
    if (canvas && lastFrameKeyRef.current !== "black") {
      const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
      if (context) {
        context.fillStyle = "#000";
        context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      }
      lastFrameKeyRef.current = "black";
    }
    updateDisplayMode("canvas");
    updateDisplayReady(false);
  }

  function isDomFallbackReady(sceneTime: number) {
    return Math.abs(framePreviewProps.sceneTime - sceneTime) <= domFallbackReadyToleranceSeconds;
  }

  const showingCachedCanvas = displayMode === "canvas";

  return (
    <div className="relative" data-clipper-prerender-video-preview-wrapper style={previewStyle}>
      <div className="relative" data-clipper-prerender-video-preview-stage style={previewStyle}>
        <div className={`absolute left-0 top-0 ${showingCachedCanvas ? "opacity-0" : "opacity-100"}`} aria-hidden={showingCachedCanvas}>
          <FramePreview {...framePreviewProps} />
        </div>
        <canvas ref={canvasRef} className={`absolute left-0 top-0 bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${showingCachedCanvas ? "opacity-100" : "pointer-events-none opacity-0"}`} style={cachedCanvasStyle} data-clipper-prerender-canvas-preview />
      </div>
    </div>
  );
}

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
