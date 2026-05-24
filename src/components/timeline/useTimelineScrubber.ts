import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  cancelLatestPostPaint,
  cancelLatestRaf,
  cancelThrottledCommit,
  createLatestPostPaintState,
  createLatestRafState,
  createThrottledCommitState,
  flushLatestPostPaint,
  flushThrottledCommit,
  scheduleLatestPostPaint,
  scheduleLatestRaf,
  scheduleThrottledCommit,
} from "../../app/services/scrubInteractionService";
import { clamp } from "../../core/math";
import { snapScrubTimeToBoundary } from "../../core/timeline";

type TimelineScrubberOptions = {
  duration: number;
  displayDuration: number;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  timelineRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
  autoScroll?: boolean;
  controlSelector?: string;
  fastSelectEnabled?: boolean;
  scrubCommitThrottleMs?: number;
  snapEnabled?: boolean;
  snapBoundaries?: number[];
  onBlurBeforeScrub?: () => void;
  onRulerScroll?: (displacement: number) => void;
  onScrub: (time: number) => void;
  onScrubEnd: () => void;
  onScrubStart: () => void;
  onSelectTime?: (time: number) => void;
  onShiftSnapActiveChange?: (active: boolean) => void;
};

type ActiveScrub = {
  dragging: boolean;
  startClientX: number;
  pointerId: number;
  target: HTMLDivElement;
};

const scrubDragThresholdPx = 3;

export function useTimelineScrubber({
  duration,
  displayDuration,
  playbackPlayheadRef,
  scrubbingRef,
  timelineRef,
  viewportRef,
  autoScroll = true,
  controlSelector = "[data-timeline-control]",
  fastSelectEnabled = false,
  scrubCommitThrottleMs = 0,
  snapEnabled = false,
  snapBoundaries = [],
  onBlurBeforeScrub,
  onRulerScroll,
  onScrub,
  onScrubEnd,
  onScrubStart,
  onSelectTime,
  onShiftSnapActiveChange,
}: TimelineScrubberOptions) {
  const scrubClientXRef = useRef<number | null>(null);
  const scrubSnapRef = useRef(false);
  const scrubAutoScrollFrameRef = useRef(0);
  const scrubPreviewQueueRef = useRef(
    createLatestRafState<{
      clientX: number;
      snap: boolean;
      commit: "throttled" | "immediate";
    }>(),
  );
  const scrubEffectQueueRef = useRef(
    createLatestPostPaintState<{
      time: number;
      commit: "throttled" | "immediate";
    }>(),
  );
  const scrubCommitQueueRef = useRef(createThrottledCommitState<number>());
  const pendingScrubPreviewRef = scrubPreviewQueueRef.current;
  const pendingScrubEffectRef = scrubEffectQueueRef.current;
  const pendingScrubCommitRef = scrubCommitQueueRef.current;
  type ScrubPreviewValue = {
    clientX: number;
    snap: boolean;
    commit: "throttled" | "immediate";
  };
  type ScrubEffectValue = {
    time: number;
    commit: "throttled" | "immediate";
  };
  const latestScrubPreviewTimeRef = useRef<number | null>(null);
  const activeScrubRef = useRef<ActiveScrub | null>(null);
  const scrubStartedRef = useRef(false);

  useEffect(
    () => () => {
      cancelLatestRaf(pendingScrubPreviewRef);
      if (scrubAutoScrollFrameRef.current)
        window.cancelAnimationFrame(scrubAutoScrollFrameRef.current);
      cancelLatestPostPaint(pendingScrubEffectRef);
      cancelThrottledCommit(pendingScrubCommitRef);

      const activeScrub = activeScrubRef.current;
      if (activeScrub?.target.hasPointerCapture(activeScrub.pointerId))
        activeScrub.target.releasePointerCapture(activeScrub.pointerId);

      scrubClientXRef.current = null;
      scrubSnapRef.current = false;
      scrubAutoScrollFrameRef.current = 0;
      latestScrubPreviewTimeRef.current = null;
      activeScrubRef.current = null;
      scrubStartedRef.current = false;
      scrubbingRef.current = false;
      onShiftSnapActiveChange?.(false);
    },
    [],
  );

  function timeFromClientX(clientX: number, snap: boolean) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0 || displayDuration <= 0) return 0;
    const rawTime = clamp(
      ((clientX - rect.left) / rect.width) * displayDuration,
      0,
      duration,
    );
    if (!snap || snapBoundaries.length === 0) return rawTime;

    const pixelsPerSecond = rect.width / displayDuration;
    const snapThresholdSeconds = Math.min(
      0.35,
      Math.max(0.05, 10 / pixelsPerSecond),
    );
    return snapScrubTimeToBoundary(
      rawTime,
      snapBoundaries,
      snapThresholdSeconds,
    );
  }

  function visibleScrubClientX(clientX: number) {
    const viewport = viewportRef.current;
    if (!viewport) return clientX;
    const rect = viewport.getBoundingClientRect();
    return clamp(clientX, rect.left, rect.right);
  }

  function previewScrubTime(time: number) {
    latestScrubPreviewTimeRef.current = time;
    const playhead = playbackPlayheadRef.current;
    if (!playhead) return;
    playhead.style.setProperty(
      "--clipper-playhead-left",
      `${displayDuration > 0 ? (time / displayDuration) * 100 : 0}%`,
    );
    playhead.style.removeProperty("--clipper-playhead-x");
  }

  useLayoutEffect(() => {
    if (!scrubbingRef.current || latestScrubPreviewTimeRef.current === null)
      return;
    previewScrubTime(latestScrubPreviewTimeRef.current);
  });

  function commitPendingScrub() {
    flushThrottledCommit(pendingScrubCommitRef, (time) => {
      if (fastSelectEnabled) onSelectTime?.(time);
    });
  }

  function scheduleScrubCommit(time: number) {
    scheduleThrottledCommit(
      pendingScrubCommitRef,
      time,
      scrubCommitThrottleMs,
      (nextTime) => {
        if (fastSelectEnabled) onSelectTime?.(nextTime);
      },
    );
  }

  function applyScrubEffect(time: number, commit: "throttled" | "immediate") {
    onScrub(time);
    if (commit === "immediate") {
      pendingScrubCommitRef.value = time;
      commitPendingScrub();
      return;
    }

    scheduleScrubCommit(time);
  }

  function flushPendingScrubEffect() {
    flushLatestPostPaint(pendingScrubEffectRef, (next) =>
      applyScrubEffect(next.time, next.commit),
    );
  }

  function scheduleScrubEffect(
    time: number,
    commit: "throttled" | "immediate",
  ) {
    scheduleLatestPostPaint(
      pendingScrubEffectRef,
      { time, commit },
      (next: ScrubEffectValue) => applyScrubEffect(next.time, next.commit),
    );
  }

  function updateScrubFromClientX(
    clientX: number,
    snap: boolean,
    commit: "throttled" | "immediate" = "throttled",
    effect: "deferred" | "sync" = "deferred",
  ) {
    const time = timeFromClientX(visibleScrubClientX(clientX), snap);
    previewScrubTime(time);
    if (effect === "sync") {
      cancelLatestPostPaint(pendingScrubEffectRef);
      applyScrubEffect(time, commit);
      return;
    }

    scheduleScrubEffect(time, commit);
  }

  function scheduleScrubFromClientX(
    clientX: number,
    snap: boolean,
    commit: "throttled" | "immediate" = "throttled",
  ) {
    scheduleLatestRaf(
      pendingScrubPreviewRef,
      { clientX, snap, commit },
      (next: ScrubPreviewValue) =>
        updateScrubFromClientX(next.clientX, next.snap, next.commit),
    );
  }

  function cancelScrubAutoScrollFrame() {
    if (scrubAutoScrollFrameRef.current)
      window.cancelAnimationFrame(scrubAutoScrollFrameRef.current);
    scrubAutoScrollFrameRef.current = 0;
  }

  function stopScrubAutoScroll() {
    scrubClientXRef.current = null;
    cancelScrubAutoScrollFrame();
  }

  function getTimelineEdgeScrollDelta(clientX: number, viewport: HTMLElement) {
    const rect = viewport.getBoundingClientRect();
    const edgeSize = 72;
    const leftDistance = rect.left + edgeSize - clientX;
    const rightDistance = clientX - (rect.right - edgeSize);
    if (leftDistance > 0) return -clamp(leftDistance / 3, 5, 34);
    if (rightDistance > 0) return clamp(rightDistance / 3, 5, 34);
    return 0;
  }

  function scheduleScrubAutoScroll() {
    if (!autoScroll || scrubAutoScrollFrameRef.current) return;
    const clientX = scrubClientXRef.current;
    const viewport = viewportRef.current;
    if (
      clientX === null ||
      !viewport ||
      getTimelineEdgeScrollDelta(clientX, viewport) === 0
    )
      return;

    const tick = () => {
      scrubAutoScrollFrameRef.current = 0;
      const clientX = scrubClientXRef.current;
      const viewport = viewportRef.current;
      if (clientX === null || !viewport) return;

      const scrollDelta = getTimelineEdgeScrollDelta(clientX, viewport);

      if (scrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        viewport.scrollLeft += scrollDelta;
        if (viewport.scrollLeft !== previousScrollLeft) {
          onRulerScroll?.(viewport.scrollLeft);
          scheduleScrubFromClientX(clientX, scrubSnapRef.current);
        }
      }

      scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function scrubFromPointer(event: PointerEvent<HTMLDivElement>) {
    const snap = snapEnabled || event.shiftKey;
    scrubClientXRef.current = event.clientX;
    scrubSnapRef.current = snap;
    onShiftSnapActiveChange?.(snap);
    updateScrubFromClientX(event.clientX, snap);
    const viewport = viewportRef.current;
    if (
      autoScroll &&
      viewport &&
      getTimelineEdgeScrollDelta(event.clientX, viewport) !== 0
    )
      scheduleScrubAutoScroll();
    else cancelScrubAutoScrollFrame();
  }

  function startScrub(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      controlSelector &&
      target.closest(controlSelector)
    )
      return;
    event.preventDefault();
    onBlurBeforeScrub?.();
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeScrubRef.current = {
      dragging: true,
      startClientX: event.clientX,
      pointerId: event.pointerId,
      target: event.currentTarget,
    };
    scrubStartedRef.current = true;
    onScrubStart();
    scrubFromPointer(event);
  }

  function continueScrub(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const activeScrub = activeScrubRef.current;
    if (
      activeScrub &&
      !activeScrub.dragging &&
      Math.abs(event.clientX - activeScrub.startClientX) >= scrubDragThresholdPx
    ) {
      activeScrub.dragging = true;
      onScrubStart();
    }
    scrubFromPointer(event);
  }

  function endScrub(event: PointerEvent<HTMLDivElement>) {
    cancelLatestRaf(pendingScrubPreviewRef);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const wasDragging = activeScrubRef.current?.dragging === true;
    activeScrubRef.current = null;
    const scrubStarted = scrubStartedRef.current;
    scrubStartedRef.current = false;
    const finalScrubTime =
      scrubClientXRef.current !== null
        ? timeFromClientX(
            visibleScrubClientX(scrubClientXRef.current),
            scrubSnapRef.current,
          )
        : null;
    // Final scrub fires while scrubbingRef is still true so
    // scrubToSceneTime uses the lightweight scrub path instead of
    // the non-scrubbing path that immediately commits React state.
    if (scrubClientXRef.current !== null)
      updateScrubFromClientX(
        scrubClientXRef.current,
        scrubSnapRef.current,
        "immediate",
        "sync",
      );
    else flushPendingScrubEffect();
    scrubbingRef.current = false;
    // Same time as above, now through the non-scrubbing path so
    // canonical editor state commits after live scrub feedback settles.
    if (finalScrubTime !== null) onScrub(finalScrubTime);
    latestScrubPreviewTimeRef.current = null;
    onShiftSnapActiveChange?.(false);
    stopScrubAutoScroll();
    if (wasDragging || scrubStarted) onScrubEnd();
  }

  return {
    getTimelineEdgeScrollDelta,
    startScrub,
    continueScrub,
    endScrub,
    timeFromClientX,
    previewScrubTime,
    scheduleScrubFromClientX,
    updateScrubFromClientX,
  };
}
