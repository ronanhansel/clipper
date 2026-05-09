import { useEffect, useRef, type RefObject } from "react";

export type TimelineDragAutoScrollOptions = {
  viewportRef: RefObject<HTMLDivElement | null>;
  getTimelineEdgeScrollDelta: (
    clientX: number,
    viewport: HTMLElement,
  ) => number;
  getTimelineVerticalEdgeScrollDelta?: (
    clientY: number,
    viewport: HTMLElement,
  ) => number;
  onRulerScroll: (scrollLeft: number) => void;
  onScrollPersist?: () => void;
};

export function useTimelineDragAutoScroll({
  viewportRef,
  getTimelineEdgeScrollDelta,
  getTimelineVerticalEdgeScrollDelta = getDefaultVerticalEdgeScrollDelta,
  onRulerScroll,
  onScrollPersist,
}: TimelineDragAutoScrollOptions) {
  const clientXRef = useRef<number | null>(null);
  const clientYRef = useRef<number | null>(null);
  const verticalEnabledRef = useRef(false);
  const frameRef = useRef(0);
  const callbackRef = useRef<(() => void) | null>(null);

  useEffect(() => stopTimelineDragAutoScroll, []);

  function stopTimelineDragAutoScroll() {
    clientXRef.current = null;
    clientYRef.current = null;
    verticalEnabledRef.current = false;
    callbackRef.current = null;
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }

  function scheduleTimelineDragAutoScroll() {
    if (frameRef.current) return;

    const tick = () => {
      frameRef.current = 0;
      const clientX = clientXRef.current;
      const clientY = clientYRef.current;
      const viewport = viewportRef.current;
      if (clientX === null || clientY === null || !viewport) return;

      const scrollDelta = getTimelineEdgeScrollDelta(clientX, viewport);
      const verticalScrollDelta = verticalEnabledRef.current
        ? getTimelineVerticalEdgeScrollDelta(clientY, viewport)
        : 0;
      if (scrollDelta !== 0 || verticalScrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        const previousScrollTop = viewport.scrollTop;
        viewport.scrollLeft += scrollDelta;
        viewport.scrollTop += verticalScrollDelta;
        if (
          viewport.scrollLeft !== previousScrollLeft ||
          viewport.scrollTop !== previousScrollTop
        ) {
          onRulerScroll(viewport.scrollLeft);
          onScrollPersist?.();
          callbackRef.current?.();
        }
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
  }

  function updateTimelineDragAutoScroll(
    clientX: number,
    onScroll: () => void,
    clientY?: number,
  ) {
    clientXRef.current = clientX;
    clientYRef.current = clientY ?? 0;
    verticalEnabledRef.current = clientY !== undefined;
    callbackRef.current = onScroll;
    scheduleTimelineDragAutoScroll();
  }

  return { updateTimelineDragAutoScroll, stopTimelineDragAutoScroll };
}

function getDefaultVerticalEdgeScrollDelta(
  clientY: number,
  viewport: HTMLElement,
) {
  const rect = viewport.getBoundingClientRect();
  const edgeSize = Math.min(36, Math.max(20, rect.height * 0.1));
  const maxDelta = 10;
  if (clientY < rect.top + edgeSize)
    return -Math.ceil(((rect.top + edgeSize - clientY) / edgeSize) * maxDelta);
  if (clientY > rect.bottom - edgeSize)
    return Math.ceil(
      ((clientY - (rect.bottom - edgeSize)) / edgeSize) * maxDelta,
    );
  return 0;
}
