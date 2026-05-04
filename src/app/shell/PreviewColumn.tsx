import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject, type UIEvent } from "react";
import { EditorPane } from "../../components/EditorPane";
import { FramePreview } from "../../components/preview/FramePreview";
import { FRAME_HEIGHT, FRAME_WIDTH, type TransitionLayer } from "../../core/types";
import type { PrerenderCacheBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type PreviewStackPart = { part: ComponentProps<typeof FramePreview>["part"]; start: number; previewTime: number };
type FramePreviewProps = ComponentProps<typeof FramePreview> & { previewParts?: PreviewStackPart[]; transitionPreviewParts?: { from: PreviewStackPart[]; to: PreviewStackPart[]; fromSceneTime: number; toSceneTime: number } | null; transitionLayers?: TransitionLayer[] };
type CachedPreviewDisplayMode = "dom" | "video-a" | "video-b";
type CachedPreviewLoadTarget = { generation: number; mode: Exclude<CachedPreviewDisplayMode, "dom">; block: PrerenderCacheBlock; sceneTime: number };

const cacheVisibleStableDelayMs = 60;
const cacheDomFallbackDelayMs = 220;
const haveCurrentDataReadyState = 2;
const playbackSeekDriftSeconds = 0.18;

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
  prerenderCacheBlock: PrerenderCacheBlock | null;
  getPrerenderCacheBlockAtTime: (time: number) => PrerenderCacheBlock | null;
  onCachedPreviewDisplayReadyChange: (ready: boolean) => void;
  currentSceneTimeRef: RefObject<number>;
  isPlaying: boolean;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, currentSceneTimeRef, editorPaneProps, framePreviewProps, getPrerenderCacheBlockAtTime, hasActiveComposition, isPlaying, mode, onModeChange, onPointerEnter, onPointerLeave, onCachedPreviewDisplayReadyChange, prerenderCacheEnabled, prerenderCacheBlock, onScroll, previewKey, stageRef }: PreviewColumnProps) {
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
            ? <PrerenderVideoPreview key={`prerender:${previewKey}`} block={prerenderCacheBlock} currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={framePreviewProps} getBlockAtTime={getPrerenderCacheBlockAtTime} isPlaying={isPlaying} onCachedPreviewDisplayReadyChange={onCachedPreviewDisplayReadyChange} />
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

function PrerenderVideoPreview({ block, currentSceneTimeRef, framePreviewProps, getBlockAtTime, isPlaying, onCachedPreviewDisplayReadyChange }: { block: PrerenderCacheBlock | null; currentSceneTimeRef: RefObject<number>; framePreviewProps: FramePreviewProps; getBlockAtTime: (time: number) => PrerenderCacheBlock | null; isPlaying: boolean; onCachedPreviewDisplayReadyChange: (ready: boolean) => void }) {
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const videoABlockRef = useRef<PrerenderCacheBlock | null>(null);
  const videoBBlockRef = useRef<PrerenderCacheBlock | null>(null);
  const loadingBlockUrlRef = useRef("");
  const loadGenerationRef = useRef(0);
  const loadTargetRef = useRef<CachedPreviewLoadTarget | null>(null);
  const cacheVisibleTimerRef = useRef<number | null>(null);
  const domFallbackTimerRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const displayModeRef = useRef<CachedPreviewDisplayMode>("dom");
  const [displayMode, setDisplayMode] = useState<CachedPreviewDisplayMode>("dom");
  const frameScale = framePreviewProps.frameScale;
  const videoStyle = { width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale } as CSSProperties;

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

  function clearCacheVisibleTimer() {
    if (cacheVisibleTimerRef.current === null) return;
    window.clearTimeout(cacheVisibleTimerRef.current);
    cacheVisibleTimerRef.current = null;
  }

  function clearDomFallbackTimer() {
    if (domFallbackTimerRef.current === null) return;
    window.clearTimeout(domFallbackTimerRef.current);
    domFallbackTimerRef.current = null;
  }

  useEffect(() => {
    syncVisibleCachedVideo(currentSceneTimeRef.current);
  }, [currentSceneTimeRef, isPlaying]);

  useEffect(() => {
    let frameId = 0;
    const sync = () => {
      const currentTime = currentSceneTimeRef.current;
      const nextBlock = getBlockAtTime(currentTime);
      if (!nextBlock) {
        scheduleDomFallback();
      } else {
        clearDomFallbackTimer();
        ensureCachedBlockVideo(nextBlock, currentTime);
      }
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [currentSceneTimeRef, getBlockAtTime, isPlaying]);

  useEffect(() => {
    function handleReady(event: Event) {
      const target = loadTargetRef.current;
      const video = event.currentTarget as HTMLVideoElement | null;
      if (!target || !video || video !== getDisplayVideo(target.mode)) return;
      promoteReadyTarget(target.generation);
    }

    function handleError(event: Event) {
      const target = loadTargetRef.current;
      const video = event.currentTarget as HTMLVideoElement | null;
      if (!target || !video || video !== getDisplayVideo(target.mode)) return;
      if (target.generation !== loadGenerationRef.current) return;
      loadingBlockUrlRef.current = "";
      loadTargetRef.current = null;
      clearCacheVisibleTimer();
      updateDisplayReady(false);
      scheduleDomFallback();
    }

    const videos = [videoARef.current, videoBRef.current].filter((video): video is HTMLVideoElement => Boolean(video));
    for (const video of videos) {
      video.addEventListener("loadedmetadata", handleReady);
      video.addEventListener("canplay", handleReady);
      video.addEventListener("seeked", handleReady);
      video.addEventListener("error", handleError);
    }
    return () => {
      for (const video of videos) {
        video.removeEventListener("loadedmetadata", handleReady);
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("seeked", handleReady);
        video.removeEventListener("error", handleError);
      }
    };
  }, []);

  useEffect(() => () => {
    clearCacheVisibleTimer();
    clearDomFallbackTimer();
    updateDisplayReady(false);
  }, []);

  function ensureCachedBlockVideo(nextBlock: PrerenderCacheBlock, sceneTime: number) {
    const visibleVideo = getDisplayVideo(displayModeRef.current);
    const visibleBlock = getDisplayBlock(displayModeRef.current);
    if (visibleVideo && visibleBlock?.url === nextBlock.url) {
      syncVideoToBlock(visibleVideo, nextBlock, sceneTime);
      updateDisplayReady(isVideoPaintReady(visibleVideo));
      return;
    }

    const cachedMode = videoABlockRef.current?.url === nextBlock.url ? "video-a" : videoBBlockRef.current?.url === nextBlock.url ? "video-b" : null;
    const cachedVideo = cachedMode ? getDisplayVideo(cachedMode) : null;
    if (cachedMode && cachedVideo && isVideoPaintReady(cachedVideo)) {
      syncVideoToBlock(cachedVideo, nextBlock, sceneTime, true);
      scheduleCacheVisible(cachedMode, cachedVideo, nextBlock, sceneTime);
      return;
    }

    const targetMode: CachedPreviewDisplayMode = displayModeRef.current === "video-a" ? "video-b" : "video-a";
    const targetVideo = getDisplayVideo(targetMode);
    if (!targetVideo) {
      scheduleDomFallback();
      return;
    }
    if (loadingBlockUrlRef.current !== nextBlock.url || targetVideo.src !== nextBlock.url) {
      loadGenerationRef.current += 1;
      loadingBlockUrlRef.current = nextBlock.url;
      loadTargetRef.current = { generation: loadGenerationRef.current, mode: targetMode, block: nextBlock, sceneTime };
      if (targetMode === "video-a") videoABlockRef.current = nextBlock;
      else videoBBlockRef.current = nextBlock;
      targetVideo.src = nextBlock.url;
      targetVideo.load();
    } else if (loadTargetRef.current?.block.url === nextBlock.url) {
      loadTargetRef.current = { ...loadTargetRef.current, sceneTime };
    }
    syncVideoToBlock(targetVideo, nextBlock, sceneTime, true);
    if (isVideoPaintReady(targetVideo)) scheduleCacheVisible(targetMode, targetVideo, nextBlock, sceneTime);
    else updateDisplayReady(false);
  }

  function scheduleCacheVisible(mode: Exclude<CachedPreviewDisplayMode, "dom">, video: HTMLVideoElement, targetBlock: PrerenderCacheBlock, sceneTime: number) {
    if (displayModeRef.current === mode) {
      updateDisplayReady(isVideoPaintReady(video));
      return;
    }
    if (cacheVisibleTimerRef.current !== null) return;
    cacheVisibleTimerRef.current = window.setTimeout(() => {
      cacheVisibleTimerRef.current = null;
      const currentTime = currentSceneTimeRef.current;
      const currentBlock = getBlockAtTime(currentTime);
      if (!currentBlock || currentBlock.url !== targetBlock.url || !isVideoPaintReady(video)) {
        updateDisplayReady(false);
        return;
      }
      syncVideoToBlock(video, currentBlock, currentTime, true);
      updateDisplayMode(mode);
      updateDisplayReady(true);
    }, cacheVisibleStableDelayMs);
  }

  function promoteReadyTarget(generation: number) {
    const target = loadTargetRef.current;
    if (!target || target.generation !== generation || generation !== loadGenerationRef.current) return;
    const video = getDisplayVideo(target.mode);
    if (!video || !isVideoPaintReady(video)) return;
    scheduleCacheVisible(target.mode, video, target.block, currentSceneTimeRef.current);
  }

  function scheduleDomFallback() {
    clearCacheVisibleTimer();
    updateDisplayReady(false);
    if (displayModeRef.current === "dom") return;
    if (domFallbackTimerRef.current !== null) return;
    domFallbackTimerRef.current = window.setTimeout(() => {
      domFallbackTimerRef.current = null;
      if (getBlockAtTime(currentSceneTimeRef.current)) return;
      loadingBlockUrlRef.current = "";
      loadTargetRef.current = null;
      videoARef.current?.pause();
      videoBRef.current?.pause();
      updateDisplayMode("dom");
    }, cacheDomFallbackDelayMs);
  }

  function syncVisibleCachedVideo(sceneTime: number) {
    const video = getDisplayVideo(displayModeRef.current);
    const block = getDisplayBlock(displayModeRef.current);
    if (!video || !block) return;
    syncVideoToBlock(video, block, sceneTime);
  }

  function syncVideoToBlock(video: HTMLVideoElement, block: PrerenderCacheBlock, sceneTime: number, forceSeek = false) {
    const targetTime = getBlockLocalTime(block, sceneTime);
    if (isPlaying) {
      if (forceSeek || Math.abs(video.currentTime - targetTime) > playbackSeekDriftSeconds) seekDirectCacheVideo(video, targetTime);
      if (video.paused) void video.play().catch(() => undefined);
      return;
    }

    if (!video.paused) video.pause();
    if (forceSeek || Math.abs(video.currentTime - targetTime) > Math.max(1 / block.frameRate / 2, 0.01)) seekDirectCacheVideo(video, targetTime);
  }

  function getDisplayVideo(mode: CachedPreviewDisplayMode) {
    return mode === "video-a" ? videoARef.current : mode === "video-b" ? videoBRef.current : null;
  }

  function getDisplayBlock(mode: CachedPreviewDisplayMode) {
    return mode === "video-a" ? videoABlockRef.current : mode === "video-b" ? videoBBlockRef.current : null;
  }

  const showingDomFallback = displayMode === "dom";

  return (
    <div className="relative" data-clipper-prerender-video-preview-wrapper style={videoStyle}>
      <div className="relative" style={videoStyle}>
        {showingDomFallback ? <div className="absolute left-0 top-0"><FramePreview {...framePreviewProps} /></div> : null}
        <video ref={videoARef} className={`absolute left-0 top-0 bg-black object-contain shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${displayMode !== "video-a" ? "pointer-events-none opacity-0" : "opacity-100"}`} muted playsInline preload="auto" style={videoStyle} data-clipper-prerender-video-preview />
        <video ref={videoBRef} className={`absolute left-0 top-0 bg-black object-contain shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${displayMode !== "video-b" ? "pointer-events-none opacity-0" : "opacity-100"}`} muted playsInline preload="auto" style={videoStyle} data-clipper-prerender-video-preview />
      </div>
    </div>
  );
}

function getBlockLocalTime(block: PrerenderCacheBlock, sceneTime: number) {
  return Math.min(Math.max(sceneTime - block.startTime, 0), Math.max(block.duration - 1 / block.frameRate, 0));
}

function seekDirectCacheVideo(video: HTMLVideoElement, localTime: number) {
  try {
    video.currentTime = localTime;
  } catch {
    // The direct cache blob may still be loading metadata; playback retries on the next frame.
  }
}

function isVideoPaintReady(video: HTMLVideoElement) {
  return video.readyState >= haveCurrentDataReadyState;
}
