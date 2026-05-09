import { useEffect, useRef } from "react";

type DragAutoScrollAxis = "both" | "x" | "y";

export type DragAutoScrollOptions = {
  getScrollElement: () => HTMLElement | null;
  axis?: DragAutoScrollAxis;
  edgeSize?: number;
  maxDelta?: number;
};

export function useDragAutoScroll({
  getScrollElement,
  axis = "both",
  edgeSize = 36,
  maxDelta = 14,
}: DragAutoScrollOptions) {
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const frameRef = useRef(0);
  const callbackRef = useRef<(() => void) | null>(null);

  useEffect(() => stopDragAutoScroll, []);

  function stopDragAutoScroll() {
    pointerRef.current = null;
    callbackRef.current = null;
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }

  function scheduleDragAutoScroll() {
    if (frameRef.current) return;

    const tick = () => {
      frameRef.current = 0;
      const pointer = pointerRef.current;
      const element = getScrollElement();
      if (!pointer || !element) return;

      const rect = element.getBoundingClientRect();
      const scrollX = axis === "both" || axis === "x";
      const scrollY = axis === "both" || axis === "y";
      const deltaX = scrollX
        ? getEdgeScrollDelta(
            pointer.clientX,
            rect.left,
            rect.right,
            edgeSize,
            maxDelta,
          )
        : 0;
      const deltaY = scrollY
        ? getEdgeScrollDelta(
            pointer.clientY,
            rect.top,
            rect.bottom,
            edgeSize,
            maxDelta,
          )
        : 0;

      if (deltaX !== 0 || deltaY !== 0) {
        const previousLeft = element.scrollLeft;
        const previousTop = element.scrollTop;
        element.scrollLeft += deltaX;
        element.scrollTop += deltaY;
        if (
          element.scrollLeft !== previousLeft ||
          element.scrollTop !== previousTop
        )
          callbackRef.current?.();
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
  }

  function updateDragAutoScroll(
    clientX: number,
    clientY: number,
    onScroll?: () => void,
  ) {
    pointerRef.current = { clientX, clientY };
    callbackRef.current = onScroll ?? null;
    scheduleDragAutoScroll();
  }

  return { updateDragAutoScroll, stopDragAutoScroll };
}

function getEdgeScrollDelta(
  pointer: number,
  min: number,
  max: number,
  edgeSize: number,
  maxDelta: number,
) {
  if (pointer < min + edgeSize)
    return -Math.ceil(
      Math.min(1, (min + edgeSize - pointer) / edgeSize) * maxDelta,
    );
  if (pointer > max - edgeSize)
    return Math.ceil(
      Math.min(1, (pointer - (max - edgeSize)) / edgeSize) * maxDelta,
    );
  return 0;
}
