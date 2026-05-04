import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject, type UIEvent } from "react";
import { EditorPane } from "../../components/EditorPane";
import { FramePreview } from "../../components/preview/FramePreview";
import { FRAME_HEIGHT, FRAME_WIDTH, type TransitionLayer } from "../../core/types";
import type { PrerenderCacheBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type PreviewStackPart = { part: ComponentProps<typeof FramePreview>["part"]; start: number; previewTime: number };
type FramePreviewProps = ComponentProps<typeof FramePreview> & { previewParts?: PreviewStackPart[]; transitionPreviewParts?: { from: PreviewStackPart[]; to: PreviewStackPart[]; fromSceneTime: number; toSceneTime: number } | null; transitionLayers?: TransitionLayer[] };
const mseAppendLookBehindBlocks = 2;
const mseAppendLookAheadBlocks = 14;
const mseBufferedTimeToleranceSeconds = 0.04;
const msePlaybackSeekDriftSeconds = 0.35;
const mseReanchorDistanceSeconds = 2.5;
const cachedPreviewEnterStableMs = 80;
const cachedPreviewExitStableMs = 220;
type CachedPreviewDisplayMode = "dom" | "video";

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
  currentSceneTimeRef: RefObject<number>;
  isPlaying: boolean;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, currentSceneTimeRef, editorPaneProps, framePreviewProps, getPrerenderCacheBlockAtTime, hasActiveComposition, isPlaying, mode, onModeChange, onPointerEnter, onPointerLeave, prerenderCacheEnabled, prerenderCacheBlock, onScroll, previewKey, stageRef }: PreviewColumnProps) {
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
            ? <PrerenderVideoPreview key={`prerender:${previewKey}`} block={prerenderCacheBlock} currentSceneTimeRef={currentSceneTimeRef} framePreviewProps={framePreviewProps} getBlockAtTime={getPrerenderCacheBlockAtTime} isPlaying={isPlaying} />
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

function PrerenderVideoPreview({ block, currentSceneTimeRef, framePreviewProps, getBlockAtTime, isPlaying }: { block: PrerenderCacheBlock | null; currentSceneTimeRef: RefObject<number>; framePreviewProps: FramePreviewProps; getBlockAtTime: (time: number) => PrerenderCacheBlock | null; isPlaying: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const appendedBlocksRef = useRef(new Set<number>());
  const appendQueueRef = useRef<PrerenderCacheBlock[]>([]);
  const mediaAnchorStartRef = useRef(0);
  const reanchorBlockStartRef = useRef<number | null>(null);
  const mseGenerationRef = useRef(0);
  const objectUrlRef = useRef("");
  const videoCandidateStartedAtRef = useRef<number | null>(null);
  const domCandidateStartedAtRef = useRef<number | null>(null);
  const displayModeRef = useRef<CachedPreviewDisplayMode>("dom");
  const [displayMode, setDisplayMode] = useState<CachedPreviewDisplayMode>("dom");
  const frameScale = framePreviewProps.frameScale;
  const videoStyle = { width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale } as CSSProperties;

  function updateDisplayMode(nextMode: CachedPreviewDisplayMode) {
    if (displayModeRef.current === nextMode) return;
    displayModeRef.current = nextMode;
    setDisplayMode(nextMode);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !block || typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(block.mimeType)) return;
    resetMediaSource(block);
    return teardownMediaSource;
  }, [block?.mimeType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) void video.play().catch(() => undefined);
    else {
      video.pause();
      seekMediaSourceVideo(video, currentSceneTimeRef.current, mediaAnchorStartRef.current);
    }
  }, [currentSceneTimeRef, isPlaying]);

  useEffect(() => {
    let frameId = 0;
    const sync = () => {
      const currentTime = currentSceneTimeRef.current;
      const nextBlock = getBlockAtTime(currentTime);
      const video = videoRef.current;
      const now = performance.now();
      if (!video || !nextBlock) {
        videoCandidateStartedAtRef.current = null;
        const missStartedAt = domCandidateStartedAtRef.current ?? now;
        domCandidateStartedAtRef.current = missStartedAt;
        if (displayModeRef.current === "dom" || now - missStartedAt >= cachedPreviewExitStableMs) updateDisplayMode("dom");
      } else {
        const targetTime = getMediaSourceSignedLocalTime(currentTime, mediaAnchorStartRef.current);
        const canUseCurrentStream = Boolean(mediaSourceRef.current && sourceBufferRef.current && targetTime >= -mseReanchorDistanceSeconds && (video.buffered.length === 0 || isTimeNearBufferedRange(video, targetTime, mseReanchorDistanceSeconds)));
        if (!canUseCurrentStream && reanchorBlockStartRef.current !== nextBlock.startTime) resetMediaSource(nextBlock);
        domCandidateStartedAtRef.current = null;
        enqueueMediaSourceBlock(nextBlock);
        appendContiguousCachedRun(nextBlock);
        const nextTargetTime = getMediaSourceLocalTime(currentTime, mediaAnchorStartRef.current);
        const buffered = isVideoTimeBuffered(video, nextTargetTime);
        const shouldSeek = !isPlaying || (buffered && Math.abs(video.currentTime - nextTargetTime) > msePlaybackSeekDriftSeconds);
        if (shouldSeek) {
          seekMediaSourceVideo(video, currentTime, mediaAnchorStartRef.current);
        }
        const videoReady = buffered || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        if (videoReady) {
          const readyStartedAt = videoCandidateStartedAtRef.current ?? now;
          videoCandidateStartedAtRef.current = readyStartedAt;
          if (displayModeRef.current === "video" || now - readyStartedAt >= cachedPreviewEnterStableMs) updateDisplayMode("video");
        } else {
          videoCandidateStartedAtRef.current = null;
          const missStartedAt = domCandidateStartedAtRef.current ?? now;
          domCandidateStartedAtRef.current = missStartedAt;
          if (displayModeRef.current === "dom" || now - missStartedAt >= cachedPreviewExitStableMs) updateDisplayMode("dom");
        }
      }
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [currentSceneTimeRef, getBlockAtTime, isPlaying]);

  function resetMediaSource(anchorBlock: PrerenderCacheBlock) {
    const video = videoRef.current;
    if (!video || typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(anchorBlock.mimeType)) return;
    teardownMediaSource();
    mseGenerationRef.current += 1;
    videoCandidateStartedAtRef.current = null;
    domCandidateStartedAtRef.current = null;
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    mediaSourceRef.current = mediaSource;
    mediaAnchorStartRef.current = anchorBlock.startTime;
    reanchorBlockStartRef.current = anchorBlock.startTime;
    objectUrlRef.current = objectUrl;
    video.src = objectUrl;
    const generation = mseGenerationRef.current;
    const handleSourceOpen = () => {
      if (generation !== mseGenerationRef.current || mediaSource.readyState !== "open") return;
      const sourceBuffer = mediaSource.addSourceBuffer(anchorBlock.mimeType);
      sourceBuffer.mode = "segments";
      sourceBufferRef.current = sourceBuffer;
      sourceBuffer.addEventListener("updateend", flushMediaSourceAppendQueue);
      appendContiguousCachedRun(anchorBlock);
    };
    mediaSource.addEventListener("sourceopen", handleSourceOpen, { once: true });
  }

  function teardownMediaSource() {
    const sourceBuffer = sourceBufferRef.current;
    sourceBuffer?.removeEventListener("updateend", flushMediaSourceAppendQueue);
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    appendedBlocksRef.current.clear();
    appendQueueRef.current = [];
    mediaAnchorStartRef.current = 0;
    reanchorBlockStartRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = "";
  }

  function appendContiguousCachedRun(block: PrerenderCacheBlock) {
    const blocks: PrerenderCacheBlock[] = [];
    for (let offset = -mseAppendLookBehindBlocks; offset <= mseAppendLookAheadBlocks; offset += 1) {
      const expectedStart = block.startTime + offset * block.duration;
      const adjacentBlock = getBlockAtTime(expectedStart + 1 / block.frameRate / 2);
      if (!adjacentBlock || Math.abs(adjacentBlock.startTime - expectedStart) > 1 / block.frameRate) {
        if (offset > 0) break;
        continue;
      }
      blocks.push(adjacentBlock);
    }
    blocks.sort((left, right) => left.startTime - right.startTime);
    for (const cachedBlock of blocks) enqueueMediaSourceBlock(cachedBlock);
  }

  function enqueueMediaSourceBlock(block: PrerenderCacheBlock) {
    if (appendedBlocksRef.current.has(block.startTime) || appendQueueRef.current.some((queued) => queued.startTime === block.startTime)) return;
    appendQueueRef.current.push(block);
    appendQueueRef.current.sort((left, right) => left.startTime - right.startTime);
    flushMediaSourceAppendQueue();
  }

  function flushMediaSourceAppendQueue() {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating || appendQueueRef.current.length === 0) return;
    const block = appendQueueRef.current.shift();
    if (!block) return;
    try {
      sourceBuffer.timestampOffset = getMediaSourceLocalTime(block.startTime, mediaAnchorStartRef.current);
      sourceBuffer.appendBuffer(block.bytes.slice().buffer);
      appendedBlocksRef.current.add(block.startTime);
      if (block.startTime === reanchorBlockStartRef.current) reanchorBlockStartRef.current = null;
    } catch {
      appendQueueRef.current.unshift(block);
    }
  }

  const showingDomFallback = displayMode === "dom";

  return (
    <div className="relative" data-clipper-prerender-video-preview-wrapper style={videoStyle}>
      <div className="relative" style={videoStyle}>
        {showingDomFallback ? <div className="absolute left-0 top-0"><FramePreview {...framePreviewProps} /></div> : null}
        <video ref={videoRef} className={`absolute left-0 top-0 bg-black object-contain shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${showingDomFallback ? "pointer-events-none opacity-0" : "opacity-100"}`} muted playsInline preload="auto" style={videoStyle} data-clipper-prerender-video-preview />
      </div>
    </div>
  );
}

function getMediaSourceLocalTime(sceneTime: number, anchorStartTime: number) {
  return Math.max(0, sceneTime - anchorStartTime);
}

function getMediaSourceSignedLocalTime(sceneTime: number, anchorStartTime: number) {
  return sceneTime - anchorStartTime;
}

function seekMediaSourceVideo(video: HTMLVideoElement, sceneTime: number, anchorStartTime: number) {
  try {
    video.currentTime = getMediaSourceLocalTime(sceneTime, anchorStartTime);
  } catch {
    // MSE can reject seeks before metadata/buffer ranges exist; rAF sync retries.
  }
}

function isVideoTimeBuffered(video: HTMLVideoElement, time: number) {
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (time >= video.buffered.start(index) - mseBufferedTimeToleranceSeconds && time <= video.buffered.end(index) + mseBufferedTimeToleranceSeconds) return true;
  }
  return false;
}

function isTimeNearBufferedRange(video: HTMLVideoElement, time: number, tolerance: number) {
  if (video.buffered.length === 0) return false;
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (time >= video.buffered.start(index) - tolerance && time <= video.buffered.end(index) + tolerance) return true;
  }
  return false;
}
