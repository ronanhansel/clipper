import { useLayoutEffect, type RefObject } from "react";
import type { TimelineSelectionDrag } from "../../app/types";
import { clamp } from "../../core/math";

export function TimelineSelectionBox({ boxRef, drag }: { boxRef: RefObject<HTMLDivElement | null>; drag: TimelineSelectionDrag }) {
  useLayoutEffect(() => {
    const element = boxRef.current;
    const rect = element?.parentElement?.getBoundingClientRect();
    if (element && rect) updateTimelineSelectionBoxElement(element, drag, rect);
  }, [boxRef, drag]);

  return <div ref={boxRef} className="pointer-events-none absolute left-0 top-0 z-40 border border-[#159dff] bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)] will-change-transform" style={{ display: "none" }} />;
}

export function updateTimelineSelectionBoxElement(element: HTMLDivElement, drag: TimelineSelectionDrag, rect: DOMRect) {
  const startX = clamp(drag.startX - rect.left, 0, rect.width);
  const currentX = clamp(drag.currentX - rect.left, 0, rect.width);
  const startY = drag.startY === undefined ? 0 : clamp(drag.startY - rect.top, 0, rect.height);
  const currentY = drag.currentY === undefined ? rect.height : clamp(drag.currentY - rect.top, 0, rect.height);
  element.style.display = Math.max(Math.abs(currentX - startX), Math.abs(currentY - startY)) >= 4 ? "block" : "none";
  element.style.transform = `translate3d(${Math.min(startX, currentX)}px, ${Math.min(startY, currentY)}px, 0)`;
  element.style.width = `${Math.abs(currentX - startX)}px`;
  element.style.height = `${Math.abs(currentY - startY)}px`;
}
