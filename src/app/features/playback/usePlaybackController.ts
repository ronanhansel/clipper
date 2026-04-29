import { startTransition, useEffect, useMemo, type RefObject } from "react";
import type { StoreApi } from "zustand";
import { numberInputScrubEndEvent, numberInputScrubStartEvent } from "../../../components/ui/input";
import {
  advanceTimeSensitiveSceneTime,
  applyAdjustmentLayersToSceneTime,
  applyAdjustmentLayersToVisualStyle,
  getSceneTimeForTimeSensitiveDisplayTime,
  getTimeSensitiveDisplayDuration,
  getTimeSensitiveDisplayTime,
} from "../../../core/adjustments";
import { clamp, roundTwo } from "../../../core/math";
import { formatTime, getTimelinePartAtTime, timelineDisplayDuration } from "../../../core/timeline";
import type { AdjustmentLayer, EditorState, TimelinePart } from "../../../core/types";
import type { PlaybackClock } from "../../types";
import type { EditorStore } from "../../state/editorStore";

type PlaybackControllerOptions = {
  activeTimelinePart: TimelinePart | null | undefined;
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
  setCurrentSceneTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackClock: (clock: PlaybackClock) => void;
  setRenderCurrentSceneTime: (time: number) => void;
  timeline: TimelinePart[];
  timelineEndPaddingFraction: number;
  timelineScrubPausedPlaybackRef: RefObject<boolean>;
  timelineScrubbingRef: RefObject<boolean>;
  updateEditorState: (updater: (state: EditorState) => EditorState) => void;
  visibleSceneAdjustmentLayers: AdjustmentLayer[];
  wasPlayingRef: RefObject<boolean>;
};

export function usePlaybackController({
  activeTimelinePart,
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
  setCurrentSceneTime,
  setIsPlaying,
  setPlaybackClock,
  setRenderCurrentSceneTime,
  timeline,
  timelineEndPaddingFraction,
  timelineScrubPausedPlaybackRef,
  timelineScrubbingRef,
  updateEditorState,
  visibleSceneAdjustmentLayers,
  wasPlayingRef,
}: PlaybackControllerOptions) {
  const visibleSceneAdjustmentSignature = useMemo(() => JSON.stringify(visibleSceneAdjustmentLayers.map((layer) => ({ id: layer.id, layerId: layer.layerId, start: layer.start, duration: layer.duration, effect: layer.effect }))), [visibleSceneAdjustmentLayers]);

  function syncPlaybackDom(time: number) {
    if (playbackTimeLabelRef.current) playbackTimeLabelRef.current.textContent = formatPlaybackTimeLabel(time);
    const displayDuration = timelineDisplayDuration(sceneDurationSeconds, timelineEndPaddingFraction);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.setProperty("--clipper-playhead-left", `${displayDuration > 0 ? (time / displayDuration) * 100 : 0}%`);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.removeProperty("--clipper-playhead-x");
    if (playbackBorderScrubberRef.current) {
      const displayTime = getTimeSensitiveDisplayTime(time, visibleSceneAdjustmentLayers);
      const displayPlaybackDuration = getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
      const progress = displayPlaybackDuration > 0 ? `${clamp(displayTime / displayPlaybackDuration, 0, 1) * 100}%` : "0%";
      playbackBorderScrubberRef.current.max = String(Math.max(displayPlaybackDuration, 0.001));
      playbackBorderScrubberRef.current.value = String(clamp(displayTime, 0, displayPlaybackDuration));
      playbackBorderScrubberRef.current.style.setProperty("--clipper-playback-progress", progress);
      playbackBorderScrubberRef.current.setAttribute("aria-valuenow", String(clamp(displayTime, 0, displayPlaybackDuration)));
    }
  }

  function syncFrameVisualAdjustmentDom(time: number) {
    const element = frameViewportRef.current?.querySelector<HTMLElement>("[data-clipper-visual-adjustments]");
    if (!element) return;
    const style = applyAdjustmentLayersToVisualStyle(time, visibleSceneAdjustmentLayers);
    if (style.filter) element.style.filter = String(style.filter);
    else element.style.removeProperty("filter");
    syncVisualAdjustmentOverlayDom("frame", style.overlays?.filter((overlay) => overlay.target === "frame"));
    syncVisualAdjustmentOverlayDom("camera", style.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera"));
  }

  function syncVisualAdjustmentOverlayDom(target: "frame" | "camera", overlays: NonNullable<ReturnType<typeof applyAdjustmentLayersToVisualStyle>["overlays"]> | undefined) {
    const overlaysElement = frameViewportRef.current?.querySelector<HTMLElement>(`[data-clipper-visual-adjustment-overlays="${target}"]`);
    if (!overlaysElement) return;
    overlaysElement.replaceChildren(...(overlays ?? []).map((overlay) => {
      const overlayElement = document.createElement("div");
      overlayElement.className = "pointer-events-none absolute inset-0";
      overlayElement.style.zIndex = "2147483647";
      Object.assign(overlayElement.style, overlay.style);
      return overlayElement;
    }));
  }

  function formatPlaybackTimeLabel(time: number) {
    const displayDuration = getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
    const displayTime = clamp(getTimeSensitiveDisplayTime(time, visibleSceneAdjustmentLayers), 0, displayDuration);
    return `${formatTime(displayTime)} / ${formatTime(displayDuration)}`;
  }

  function scrubToPlaybackDisplayTime(displayTime: number) {
    scrubToSceneTime(getSceneTimeForTimeSensitiveDisplayTime(displayTime, sceneDurationSeconds, visibleSceneAdjustmentLayers));
  }

  function updatePlaybackClock(nextClock: PlaybackClock) {
    playbackClockRef.current = nextClock;
    setPlaybackClock(nextClock);
  }

  function commitPlayheadEditorState(time: number) {
    const currentDuration = Math.max(sceneDurationSeconds, 0);
    const currentSceneTime = roundTwo(clamp(time, 0, currentDuration));
    updateEditorState((state) => (state.currentSceneTime === currentSceneTime ? state : { ...state, currentSceneTime }));
  }

  function scrubToSceneTime(time: number) {
    const nextTime = clamp(time, 0, sceneDurationSeconds);
    if (Math.abs(nextTime - currentSceneTimeRef.current) < 0.001) {
      if (!timelineScrubbingRef.current) commitPlayheadEditorState(nextTime);
      return;
    }

    currentSceneTimeRef.current = nextTime;
    if (isPlayingRef.current) updatePlaybackClock({ startedAt: performance.now(), startedFrom: nextTime });
    if (!timelineScrubbingRef.current) syncPlaybackDom(nextTime);
    else syncFrameVisualAdjustmentDom(nextTime);

    pendingScrubTimeRef.current = nextTime;
    if (scrubFrameRef.current) return;

    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      const committedTime = pendingScrubTimeRef.current;
      pendingScrubTimeRef.current = null;
      if (committedTime === null) return;
      if (!timelineScrubbingRef.current) commitPlayheadEditorState(committedTime);
      if (timelineScrubbingRef.current) {
        setCurrentSceneTime(committedTime);
        return;
      }

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
  }

  function startPlaybackFromCurrentTime() {
    if (currentSceneTimeRef.current >= sceneDurationSeconds) {
      currentSceneTimeRef.current = 0;
      syncPlaybackDom(0);
      setCurrentSceneTime(0);
    }

    updatePlaybackClock({ startedAt: performance.now(), startedFrom: currentSceneTimeRef.current });
    isPlayingRef.current = true;
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
    setIsPlaying(false);
    scrubToSceneTime(currentSceneTimeRef.current + delta);
  }

  function jumpToStart() {
    setIsPlaying(false);
    scrubToSceneTime(0);
  }

  function jumpToNextPart() {
    setIsPlaying(false);
    const nextPart = timeline.find((item) => item.start > currentSceneTimeRef.current + 0.001);
    scrubToSceneTime(nextPart?.start ?? sceneDurationSeconds);
  }

  function jumpToEnd() {
    setIsPlaying(false);
    scrubToSceneTime(sceneDurationSeconds);
  }

  useEffect(() => {
    let previousTime = editorStore.getState().currentSceneTime;
    return editorStore.subscribe((state) => {
      const nextTime = state.currentSceneTime;
      if (Math.abs(nextTime - previousTime) < 0.001) return;
      previousTime = nextTime;
      if (timelineScrubbingRef.current) {
        setRenderCurrentSceneTime(nextTime);
        return;
      }

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
      if (Math.abs(settledTime - currentSceneTime) >= 0.001) setCurrentSceneTime(settledTime);
      return;
    }

    currentSceneTimeRef.current = currentSceneTime;
    if (timelineScrubbingRef.current) return;
    syncPlaybackDom(currentSceneTime);
  }, [currentSceneTime, isPlaying, sceneDurationSeconds, timelineEndPaddingFraction, visibleSceneAdjustmentLayers]);

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

    window.addEventListener(numberInputScrubStartEvent, pausePlaybackForNumberScrub);
    window.addEventListener(numberInputScrubEndEvent, resumePlaybackAfterNumberScrub);
    return () => {
      window.removeEventListener(numberInputScrubStartEvent, pausePlaybackForNumberScrub);
      window.removeEventListener(numberInputScrubEndEvent, resumePlaybackAfterNumberScrub);
    };
  }, [sceneDurationSeconds]);

  useEffect(() => () => {
    if (scrubFrameRef.current) cancelAnimationFrame(scrubFrameRef.current);
  }, [scrubFrameRef]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastCommittedPartId = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(currentSceneTimeRef.current, visibleSceneAdjustmentLayers))?.id ?? activeTimelinePart?.id ?? "";
    let frame = 0;

    function tick(now: number) {
      const clock = playbackClockRef.current ?? { startedAt: now, startedFrom: currentSceneTimeRef.current };
      playbackClockRef.current = clock;
      const nextTime = advanceTimeSensitiveSceneTime(clock.startedFrom, (now - clock.startedAt) / 1000, sceneDurationSeconds, visibleSceneAdjustmentLayers);
      const nextTimelinePart = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(nextTime, visibleSceneAdjustmentLayers));
      const partChanged = Boolean(nextTimelinePart?.id && nextTimelinePart.id !== lastCommittedPartId);
      const shouldSyncReact = partChanged || nextTime >= sceneDurationSeconds;

      currentSceneTimeRef.current = nextTime;
      syncPlaybackDom(nextTime);

      if (shouldSyncReact) {
        lastCommittedPartId = nextTimelinePart?.id ?? lastCommittedPartId;
        setCurrentSceneTime(nextTime);
      }

      if (nextTime >= sceneDurationSeconds) {
        commitPlayheadEditorState(nextTime);
        updatePlaybackClock(null);
        setIsPlaying(false);
        return;
      }

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeTimelinePart?.id, isPlaying, sceneDurationSeconds, timeline, visibleSceneAdjustmentLayers]);

  useEffect(() => {
    if (!isPlaying) return;
    updatePlaybackClock({ startedAt: performance.now(), startedFrom: currentSceneTimeRef.current });
  }, [isPlaying, visibleSceneAdjustmentSignature]);

  useEffect(() => {
    if (isPlaying && currentSceneTime >= sceneDurationSeconds) {
      setIsPlaying(false);
    }
  }, [currentSceneTime, isPlaying, sceneDurationSeconds, setIsPlaying]);

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
