import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type { StoreApi } from "zustand";
import {
  numberInputScrubEndEvent,
  numberInputScrubStartEvent,
} from "../../../components/ui/input";
import {
  advanceTimeSensitiveSceneTime,
  applyPlaybackAdjustmentLayersToSceneTime,
  applyAdjustmentLayersToVisualStyle,
  getSceneTimeForTimeSensitiveDisplayTime,
  getTimeSensitiveDisplayDuration,
  getTimeSensitiveDisplayTime,
} from "../../../core/adjustments";
import { clamp, roundTwo } from "../../../core/math";
import {
  formatTime,
  getTimelinePreviewState,
  timelineDisplayDuration,
} from "../../../core/timeline";
import {
  getRenderClockAttributes,
  getRenderClockStyle,
  syncDomAnimationsToRenderClock,
  type RenderClockState,
} from "../../../render-engine/renderClock";
import type {
  AdjustmentLayer,
  CompositionClip,
  EditorState,
  TimelineLayerState,
  TimelinePart,
  TransitionLayer,
} from "../../../core/types";
import type { PlaybackClock } from "../../types";
import type { EditorStore } from "../../state/editorStore";
import type { PrerenderCacheInterestReason } from "../preview/usePrerenderCache";
import { publishPlaybackTime } from "./playbackTimeStore";

const playbackReactPreviewSyncIntervalMs = 1000 / 30;
const composePlaybackReactPreviewSyncIntervalMs = 1000 / 60;

type PlaybackControllerOptions = {
  compositions: CompositionClip[];
  playbackRange?: { start: number; end: number; localLabels?: boolean };
  currentSceneTime: number;
  currentSceneTimeRef: RefObject<number>;
  editorStore: StoreApi<EditorStore>;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  isPlayingRef: RefObject<boolean>;
  numberInputScrubPausedPlaybackRef: RefObject<boolean>;
  pendingScrubTimeRef: RefObject<number | null>;
  presentationScrubPausedPlaybackRef: RefObject<boolean>;
  playbackBorderScrubberRef: RefObject<HTMLInputElement | null>;
  playbackClockRef: RefObject<PlaybackClock>;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  playbackTimeLabelRef: RefObject<HTMLSpanElement | null>;
  sceneDurationSeconds: number;
  scrubFrameRef: RefObject<number>;
  previewRenderSyncIntervalMs?: number;
  setCurrentSceneTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackClock: (clock: PlaybackClock) => void;
  setRenderCurrentSceneTime: (time: number) => void;
  useCachedPreviewPlayback: boolean;
  hasCachedPreviewFrameAtTime?: (time: number) => boolean;
  isCachedPreviewPaintReadyAtTime?: (time: number) => boolean;
  requestCachedPreviewAtTime?: (
    time: number,
    reason: PrerenderCacheInterestReason,
  ) => void;
  timeline: TimelinePart[];
  timelineLayers?: TimelineLayerState;
  timelineEndPaddingFraction: number;
  transitionLayers?: TransitionLayer[];
  timelineScrubPausedPlaybackRef: RefObject<boolean>;
  timelineScrubbingRef: RefObject<boolean>;
  updateEditorState: (updater: (state: EditorState) => EditorState) => void;
  visibleSceneAdjustmentLayers: AdjustmentLayer[];
  wasPlayingRef: RefObject<boolean>;
};

export function usePlaybackController({
  compositions,
  playbackRange,
  currentSceneTime,
  currentSceneTimeRef,
  editorStore,
  frameViewportRef,
  isPlaying,
  isPlayingRef,
  numberInputScrubPausedPlaybackRef,
  pendingScrubTimeRef,
  presentationScrubPausedPlaybackRef,
  playbackBorderScrubberRef,
  playbackClockRef,
  playbackPlayheadRef,
  playbackTimeLabelRef,
  sceneDurationSeconds,
  scrubFrameRef,
  previewRenderSyncIntervalMs = playbackReactPreviewSyncIntervalMs,
  setCurrentSceneTime,
  setIsPlaying,
  setPlaybackClock,
  setRenderCurrentSceneTime,
  useCachedPreviewPlayback,
  hasCachedPreviewFrameAtTime,
  isCachedPreviewPaintReadyAtTime,
  requestCachedPreviewAtTime,
  timeline,
  timelineLayers,
  timelineEndPaddingFraction,
  transitionLayers,
  timelineScrubPausedPlaybackRef,
  timelineScrubbingRef,
  updateEditorState,
  visibleSceneAdjustmentLayers,
  wasPlayingRef,
}: PlaybackControllerOptions) {
  const visibleSceneAdjustmentSignature = useMemo(
    () =>
      JSON.stringify(
        visibleSceneAdjustmentLayers.map((layer) => ({
          id: layer.id,
          layerId: layer.layerId,
          start: layer.start,
          duration: layer.duration,
          effect: layer.effect,
        })),
      ),
    [visibleSceneAdjustmentLayers],
  );
  const playbackStart = playbackRange?.start ?? 0;
  const playbackEnd = playbackRange?.end ?? sceneDurationSeconds;
  const playbackDuration = Math.max(playbackEnd - playbackStart, 0);
  const useLocalPlaybackLabels = Boolean(playbackRange?.localLabels);
  const pendingScrubCacheTimeRef = useRef<number | null>(null);
  const scrubCacheFrameRef = useRef(0);

  function clampPlaybackTime(time: number) {
    return clamp(time, playbackStart, playbackEnd);
  }

  function toPlaybackDisplayTime(time: number) {
    return useLocalPlaybackLabels
      ? clamp(time - playbackStart, 0, playbackDuration)
      : getTimeSensitiveDisplayTime(time, visibleSceneAdjustmentLayers);
  }

  function toSceneTimeFromPlaybackDisplay(displayTime: number) {
    return useLocalPlaybackLabels
      ? playbackStart + clamp(displayTime, 0, playbackDuration)
      : getSceneTimeForTimeSensitiveDisplayTime(
          displayTime,
          sceneDurationSeconds,
          visibleSceneAdjustmentLayers,
        );
  }

  function getPlaybackDisplayDuration() {
    return useLocalPlaybackLabels
      ? playbackDuration
      : getTimeSensitiveDisplayDuration(
          sceneDurationSeconds,
          visibleSceneAdjustmentLayers,
        );
  }

  function syncPlaybackDom(time: number) {
    const displayTime = toPlaybackDisplayTime(time);
    publishPlaybackTime({
      sceneTime: time,
      displayTime,
      playing: isPlayingRef.current,
    });
    syncPlaybackRenderClockDom(time);
    if (playbackTimeLabelRef.current)
      playbackTimeLabelRef.current.textContent = formatPlaybackTimeLabel(time);
    const displayDuration = useLocalPlaybackLabels
      ? playbackDuration
      : timelineDisplayDuration(
          sceneDurationSeconds,
          timelineEndPaddingFraction,
        );
    const timelineTime = useLocalPlaybackLabels ? time - playbackStart : time;
    if (playbackPlayheadRef.current)
      playbackPlayheadRef.current.style.setProperty(
        "--clipper-playhead-left",
        `${displayDuration > 0 ? (timelineTime / displayDuration) * 100 : 0}%`,
      );
    if (playbackPlayheadRef.current)
      playbackPlayheadRef.current.style.removeProperty("--clipper-playhead-x");
    if (playbackBorderScrubberRef.current) {
      const displayPlaybackDuration = getPlaybackDisplayDuration();
      const progress =
        displayPlaybackDuration > 0
          ? `${clamp(displayTime / displayPlaybackDuration, 0, 1) * 100}%`
          : "0%";
      playbackBorderScrubberRef.current.max = String(
        Math.max(displayPlaybackDuration, 0.001),
      );
      playbackBorderScrubberRef.current.value = String(
        clamp(displayTime, 0, displayPlaybackDuration),
      );
      playbackBorderScrubberRef.current.style.setProperty(
        "--clipper-playback-progress",
        progress,
      );
      playbackBorderScrubberRef.current.setAttribute(
        "aria-valuenow",
        String(clamp(displayTime, 0, displayPlaybackDuration)),
      );
    }
  }

  function syncPlaybackRenderClockDom(sceneTime: number) {
    syncRenderClockLayersToSceneTime(
      frameViewportRef.current,
      sceneTime,
      isPlayingRef.current,
    );
  }

  function syncFrameVisualAdjustmentDom(time: number) {
    const element = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-visual-adjustments]",
    );
    if (!element) return;
    const style = applyAdjustmentLayersToVisualStyle(
      time,
      visibleSceneAdjustmentLayers,
    );
    if (style.filter) element.style.filter = String(style.filter);
    else element.style.removeProperty("filter");
    syncVisualAdjustmentOverlayDom(
      "frame",
      style.overlays?.filter((overlay) => overlay.target === "frame"),
    );
    syncVisualAdjustmentOverlayDom(
      "camera",
      style.overlays?.filter(
        (overlay) => (overlay.target ?? "camera") === "camera",
      ),
    );
  }

  function syncVisualAdjustmentOverlayDom(
    target: "frame" | "camera",
    overlays:
      | NonNullable<
          ReturnType<typeof applyAdjustmentLayersToVisualStyle>["overlays"]
        >
      | undefined,
  ) {
    const overlaysElement =
      frameViewportRef.current?.querySelector<HTMLElement>(
        `[data-clipper-visual-adjustment-overlays="${target}"]`,
      );
    if (!overlaysElement) return;
    overlaysElement.replaceChildren(
      ...(overlays ?? []).map((overlay) => {
        const overlayElement = document.createElement("div");
        overlayElement.className = "pointer-events-none absolute inset-0";
        overlayElement.style.zIndex = "2147483647";
        Object.assign(overlayElement.style, overlay.style);
        return overlayElement;
      }),
    );
  }

  function formatPlaybackTimeLabel(time: number) {
    const displayDuration = getPlaybackDisplayDuration();
    const displayTime = clamp(toPlaybackDisplayTime(time), 0, displayDuration);
    return `${formatTime(displayTime)} / ${formatTime(displayDuration)}`;
  }

  function scrubToPlaybackDisplayTime(displayTime: number) {
    scrubToSceneTime(toSceneTimeFromPlaybackDisplay(displayTime));
  }

  function updatePlaybackClock(nextClock: PlaybackClock) {
    playbackClockRef.current = nextClock;
    setPlaybackClock(nextClock);
  }

  function commitPlayheadEditorState(time: number) {
    const currentSceneTime = roundTwo(clampPlaybackTime(time));
    updateEditorState((state) =>
      state.currentSceneTime === currentSceneTime
        ? state
        : { ...state, currentSceneTime },
    );
  }

  function requestCachedPreviewInterest(
    time: number,
    reason: PrerenderCacheInterestReason,
  ) {
    if (reason !== "scrub") {
      requestCachedPreviewAtTime?.(time, reason);
      return;
    }

    pendingScrubCacheTimeRef.current = time;
    if (scrubCacheFrameRef.current) return;

    scrubCacheFrameRef.current = requestAnimationFrame(() => {
      scrubCacheFrameRef.current = 0;
      const cachedTime = pendingScrubCacheTimeRef.current;
      pendingScrubCacheTimeRef.current = null;
      if (cachedTime !== null)
        requestCachedPreviewAtTime?.(cachedTime, "scrub");
    });
  }

  function scrubToSceneTime(time: number) {
    const nextTime = clampPlaybackTime(time);
    requestCachedPreviewInterest(nextTime, "scrub");
    if (Math.abs(nextTime - currentSceneTimeRef.current) < 0.001) {
      if (!timelineScrubbingRef.current) {
        commitPlayheadEditorState(nextTime);
        setCurrentSceneTime(nextTime);
        setRenderCurrentSceneTime(nextTime);
      }
      return;
    }

    currentSceneTimeRef.current = nextTime;
    if (isPlayingRef.current)
      updatePlaybackClock({
        startedAt: performance.now(),
        startedFrom: nextTime,
      });
    if (!timelineScrubbingRef.current) syncPlaybackDom(nextTime);
    else {
      syncPlaybackRenderClockDom(nextTime);
      if (!useLocalPlaybackLabels) syncFrameVisualAdjustmentDom(nextTime);
    }

    if (timelineScrubbingRef.current) {
      startTransition(() => setRenderCurrentSceneTime(nextTime));
      return;
    }

    pendingScrubTimeRef.current = nextTime;
    if (scrubFrameRef.current) return;

    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      const committedTime = pendingScrubTimeRef.current;
      pendingScrubTimeRef.current = null;
      if (committedTime === null) return;
      commitPlayheadEditorState(committedTime);
      startTransition(() => setCurrentSceneTime(committedTime));
    });
  }

  function pausePlaybackAtCurrentTime() {
    const settledTime = currentSceneTimeRef.current;
    syncPlaybackDom(settledTime);
    commitPlayheadEditorState(settledTime);
    setCurrentSceneTime(settledTime);
    setRenderCurrentSceneTime(settledTime);
    isPlayingRef.current = false;
    updatePlaybackClock(null);
    setIsPlaying(false);
    publishPlaybackTime({
      sceneTime: settledTime,
      displayTime: toPlaybackDisplayTime(settledTime),
      playing: false,
    });
  }

  function startPlaybackFromCurrentTime() {
    if (
      currentSceneTimeRef.current >= playbackEnd ||
      currentSceneTimeRef.current < playbackStart
    ) {
      currentSceneTimeRef.current = playbackStart;
      requestCachedPreviewInterest(playbackStart, "playback");
      syncPlaybackDom(playbackStart);
      setCurrentSceneTime(playbackStart);
      setRenderCurrentSceneTime(playbackStart);
    }

    updatePlaybackClock({
      startedAt: performance.now(),
      startedFrom: currentSceneTimeRef.current,
    });
    isPlayingRef.current = true;
    publishPlaybackTime({
      sceneTime: currentSceneTimeRef.current,
      displayTime: toPlaybackDisplayTime(currentSceneTimeRef.current),
      playing: true,
    });
    setIsPlaying(true);
  }

  function pausePlaybackForTimelineScrub() {
    if (!isPlayingRef.current) {
      timelineScrubPausedPlaybackRef.current = false;
      return;
    }

    timelineScrubPausedPlaybackRef.current = true;
    pausePlaybackAtCurrentTime();
  }

  function resumePlaybackAfterTimelineScrub() {
    if (!timelineScrubPausedPlaybackRef.current) return;

    timelineScrubPausedPlaybackRef.current = false;
    if (isPlayingRef.current) return;
    startPlaybackFromCurrentTime();
  }

  function pausePlaybackForPresentationScrub() {
    if (!isPlayingRef.current) {
      presentationScrubPausedPlaybackRef.current = false;
      return;
    }

    presentationScrubPausedPlaybackRef.current = true;
    pausePlaybackAtCurrentTime();
  }

  function resumePlaybackAfterPresentationScrub() {
    if (!presentationScrubPausedPlaybackRef.current) return;

    presentationScrubPausedPlaybackRef.current = false;
    if (isPlayingRef.current) return;
    startPlaybackFromCurrentTime();
  }

  function togglePlayback() {
    if (isPlayingRef.current) {
      pausePlaybackAtCurrentTime();
      return;
    }

    startPlaybackFromCurrentTime();
  }

  function stepSceneTime(delta: number) {
    pausePlaybackAtCurrentTime();
    scrubToSceneTime(currentSceneTimeRef.current + delta);
  }

  function jumpToStart() {
    pausePlaybackAtCurrentTime();
    scrubToSceneTime(playbackStart);
  }

  function jumpToNextPart() {
    pausePlaybackAtCurrentTime();
    if (useLocalPlaybackLabels) {
      scrubToSceneTime(playbackEnd);
      return;
    }

    const nextPart = timeline.find(
      (item) => item.start > currentSceneTimeRef.current + 0.001,
    );
    scrubToSceneTime(nextPart?.start ?? sceneDurationSeconds);
  }

  function jumpToEnd() {
    pausePlaybackAtCurrentTime();
    scrubToSceneTime(playbackEnd);
  }

  useEffect(() => {
    let previousTime = editorStore.getState().currentSceneTime;
    return editorStore.subscribe((state) => {
      const nextTime = state.currentSceneTime;
      if (Math.abs(nextTime - previousTime) < 0.001) return;
      previousTime = nextTime;
      if (timelineScrubbingRef.current) return;

      startTransition(() => setRenderCurrentSceneTime(nextTime));
    });
  }, [editorStore, setRenderCurrentSceneTime, timelineScrubbingRef]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      wasPlayingRef.current = true;
      return;
    }

    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      const settledTime = currentSceneTimeRef.current;
      syncPlaybackDom(settledTime);
      commitPlayheadEditorState(settledTime);
      if (Math.abs(settledTime - currentSceneTime) >= 0.001)
        setCurrentSceneTime(settledTime);
      return;
    }

    if (timelineScrubbingRef.current) return;
    currentSceneTimeRef.current = currentSceneTime;
    syncPlaybackDom(currentSceneTime);
  }, [
    currentSceneTime,
    isPlaying,
    sceneDurationSeconds,
    timelineEndPaddingFraction,
    visibleSceneAdjustmentLayers,
  ]);

  useEffect(() => {
    if (timelineScrubbingRef.current) return;
    commitPlayheadEditorState(currentSceneTime);
  }, [currentSceneTime]);

  useEffect(() => {
    function pausePlaybackForNumberScrub() {
      if (!isPlayingRef.current) {
        numberInputScrubPausedPlaybackRef.current = false;
        return;
      }

      numberInputScrubPausedPlaybackRef.current = true;
      pausePlaybackAtCurrentTime();
    }

    function resumePlaybackAfterNumberScrub() {
      if (!numberInputScrubPausedPlaybackRef.current) return;

      numberInputScrubPausedPlaybackRef.current = false;
      if (isPlayingRef.current) return;
      startPlaybackFromCurrentTime();
    }

    window.addEventListener(
      numberInputScrubStartEvent,
      pausePlaybackForNumberScrub,
    );
    window.addEventListener(
      numberInputScrubEndEvent,
      resumePlaybackAfterNumberScrub,
    );
    return () => {
      window.removeEventListener(
        numberInputScrubStartEvent,
        pausePlaybackForNumberScrub,
      );
      window.removeEventListener(
        numberInputScrubEndEvent,
        resumePlaybackAfterNumberScrub,
      );
    };
  }, [sceneDurationSeconds]);

  useEffect(
    () => () => {
      if (scrubFrameRef.current) cancelAnimationFrame(scrubFrameRef.current);
    },
    [scrubFrameRef],
  );

  useEffect(
    () => () => {
      if (scrubCacheFrameRef.current)
        cancelAnimationFrame(scrubCacheFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isPlaying) return;
    let lastCommittedPreviewKey = getPlaybackPreviewKey(
      currentSceneTimeRef.current,
      compositions,
      sceneDurationSeconds,
      timeline,
      timelineLayers,
      transitionLayers,
      visibleSceneAdjustmentLayers,
    );
    let lastReactPreviewSyncAt = 0;
    let frame = 0;

    function tick(now: number) {
      const clock = playbackClockRef.current ?? {
        startedAt: now,
        startedFrom: currentSceneTimeRef.current,
      };
      playbackClockRef.current = clock;
      const nextTime = useLocalPlaybackLabels
        ? clamp(
            clock.startedFrom + (now - clock.startedAt) / 1000,
            playbackStart,
            playbackEnd,
          )
        : advanceTimeSensitiveSceneTime(
            clock.startedFrom,
            (now - clock.startedAt) / 1000,
            sceneDurationSeconds,
            visibleSceneAdjustmentLayers,
          );
      const nextPreviewKey = getPlaybackPreviewKey(
        nextTime,
        compositions,
        sceneDurationSeconds,
        timeline,
        timelineLayers,
        transitionLayers,
        visibleSceneAdjustmentLayers,
      );
      const shouldSyncReact =
        nextPreviewKey !== lastCommittedPreviewKey || nextTime >= playbackEnd;
      requestCachedPreviewAtTime?.(nextTime, "playback");
      const cachedPreviewFrameAvailable =
        useCachedPreviewPlayback &&
        hasCachedPreviewFrameAtTime?.(nextTime) === true;
      const cachedPreviewPaintReady =
        cachedPreviewFrameAvailable &&
        isCachedPreviewPaintReadyAtTime?.(nextTime) === true;
      const shouldSyncPreviewRender =
        !cachedPreviewPaintReady &&
        (shouldSyncReact ||
          now - lastReactPreviewSyncAt >= previewRenderSyncIntervalMs);

      currentSceneTimeRef.current = nextTime;
      syncPlaybackDom(nextTime);

      if (shouldSyncPreviewRender) {
        lastReactPreviewSyncAt = now;
        startTransition(() => setRenderCurrentSceneTime(nextTime));
      }

      if (shouldSyncReact) {
        lastCommittedPreviewKey = nextPreviewKey;
        startTransition(() => setCurrentSceneTime(nextTime));
      }

      if (nextTime >= playbackEnd) {
        pausePlaybackAtCurrentTime();
        return;
      }

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    compositions,
    hasCachedPreviewFrameAtTime,
    isCachedPreviewPaintReadyAtTime,
    isPlaying,
    playbackEnd,
    playbackStart,
    previewRenderSyncIntervalMs,
    requestCachedPreviewAtTime,
    sceneDurationSeconds,
    timeline,
    timelineLayers,
    transitionLayers,
    useCachedPreviewPlayback,
    useLocalPlaybackLabels,
    visibleSceneAdjustmentLayers,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    updatePlaybackClock({
      startedAt: performance.now(),
      startedFrom: currentSceneTimeRef.current,
    });
  }, [isPlaying, visibleSceneAdjustmentSignature]);

  useEffect(() => {
    if (isPlaying && currentSceneTime >= playbackEnd) {
      pausePlaybackAtCurrentTime();
    }
  }, [currentSceneTime, isPlaying, playbackEnd]);

  return {
    commitPlayheadEditorState,
    formatPlaybackTimeLabel,
    jumpToEnd,
    jumpToNextPart,
    jumpToStart,
    pausePlaybackAtCurrentTime,
    pausePlaybackForPresentationScrub,
    pausePlaybackForTimelineScrub,
    resumePlaybackAfterPresentationScrub,
    resumePlaybackAfterTimelineScrub,
    scrubToPlaybackDisplayTime,
    scrubToSceneTime,
    startPlaybackFromCurrentTime,
    stepSceneTime,
    syncFrameVisualAdjustmentDom,
    syncPlaybackDom,
    togglePlayback,
    updatePlaybackClock,
  };
}

export { composePlaybackReactPreviewSyncIntervalMs };

export function syncRenderClockLayersToSceneTime(
  root: ParentNode | null,
  sceneTime: number,
  playing: boolean,
) {
  if (!root) return 0;
  let synced = 0;
  for (const layer of root.querySelectorAll<HTMLElement>(
    "[data-clipper-render-clock-layer]",
  )) {
    const offset = Number(layer.dataset.clipperRenderClockOffset ?? 0);
    const state: RenderClockState = {
      playing,
      time: Math.max(sceneTime + (Number.isFinite(offset) ? offset : 0), 0),
      mode: "preview",
    };
    const attrs = getRenderClockAttributes(state);
    for (const [key, value] of Object.entries(attrs))
      layer.setAttribute(key, value);
    const style = getRenderClockStyle(state);
    for (const [key, value] of Object.entries(style))
      layer.style.setProperty(key, String(value));
    syncDomAnimationsToRenderClock(layer, state);
    synced += 1;
  }
  return synced;
}

function getPlaybackPreviewKey(
  sceneTime: number,
  compositions: CompositionClip[],
  sceneDurationSeconds: number,
  timeline: TimelinePart[],
  timelineLayers: TimelineLayerState | undefined,
  transitionLayers: TransitionLayer[] | undefined,
  adjustmentLayers: AdjustmentLayer[],
) {
  const state = getTimelinePreviewState({
    adjustmentLayers,
    compositions,
    sceneDurationSeconds,
    sceneTime,
    timeline,
    timelineLayers,
    timelineMode: "composition",
    transitionLayers,
  });
  const stackKey = state.previewParts
    .map((item) => `${item.part.id}:${item.start}`)
    .join("|");
  const transitionKey = state.transitionPreviewParts
    ? [state.transitionPreviewParts.from, state.transitionPreviewParts.to]
        .map((parts) =>
          parts.map((item) => `${item.part.id}:${item.start}`).join("|"),
        )
        .join(">")
    : "";
  return `${state.activeTimelinePart?.id ?? ""}:${stackKey}:${transitionKey}`;
}
