import { useEffect, useRef, type RefObject } from "react";

export type TimelineDragAutoScrollOptions = {
  viewportRef: RefObject<HTMLDivElement | null>;
  getTimelineEdgeScrollDelta: (clientX: number, viewport: HTMLElement) => number;
  onRulerScroll: (scrollLeft: number) => void;
  onScrollPersist?: () => void;
};

export function useTimelineDragAutoScroll({ viewportRef, getTimelineEdgeScrollDelta, onRulerScroll, onScrollPersist }: TimelineDragAutoScrollOptions) {
  const clientXRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const callbackRef = useRef<(() => void) | null>(null);

  useEffect(() => stopTimelineDragAutoScroll, []);

  function stopTimelineDragAutoScroll() {
    clientXRef.current = null;
    callbackRef.current = null;
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }

  function scheduleTimelineDragAutoScroll() {
    if (frameRef.current) return;

    const tick = () => {
      frameRef.current = 0;
      const clientX = clientXRef.current;
      const viewport = viewportRef.current;
      if (clientX === null || !viewport) return;

      const scrollDelta = getTimelineEdgeScrollDelta(clientX, viewport);
      if (scrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        viewport.scrollLeft += scrollDelta;
        if (viewport.scrollLeft !== previousScrollLeft) {
          onRulerScroll(viewport.scrollLeft);
          onScrollPersist?.();
          callbackRef.current?.();
        }
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
  }

  function updateTimelineDragAutoScroll(clientX: number, onScroll: () => void) {
    clientXRef.current = clientX;
    callbackRef.current = onScroll;
    scheduleTimelineDragAutoScroll();
  }

  return { updateTimelineDragAutoScroll, stopTimelineDragAutoScroll };
}
