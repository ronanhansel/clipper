import { useEffect, useRef, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import { clamp } from "../../core/math";

type TimelineRowResizeEdge = "top" | "bottom";

type TimelineRowResizeOptions = {
  rowHeights: Record<string, number>;
  setPreviewRowHeights: Dispatch<SetStateAction<Record<string, number> | null>>;
  onCommitRowHeights: (rowHeights: Record<string, number>) => void;
  onCanResizeRow?: (rowKey: string) => boolean;
  onDragActiveChange?: (active: boolean) => void;
};

type TimelineRowResizeTransaction = {
  move: (pointerEvent: globalThis.PointerEvent) => void;
  pointerId: number;
  target: HTMLElement;
  up: (pointerEvent: globalThis.PointerEvent) => void;
  cancel: () => void;
};

export function getTimelineRowHeight(rowHeights: Record<string, number>, key: string) {
  return clamp(Math.round(rowHeights[key] ?? 58), 42, 140);
}

export function useTimelineRowResize({ rowHeights, setPreviewRowHeights, onCommitRowHeights, onCanResizeRow, onDragActiveChange }: TimelineRowResizeOptions) {
  const activeResizeRef = useRef<TimelineRowResizeTransaction | null>(null);

  useEffect(() => () => {
    activeResizeRef.current?.cancel();
  }, []);

  function startTimelineRowResize(event: PointerEvent<HTMLElement>, rowKey: string, edge: TimelineRowResizeEdge = "bottom") {
    if (onCanResizeRow && !onCanResizeRow(rowKey)) return;
    activeResizeRef.current?.cancel();
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const initialHeights = { ...rowHeights };
    const initialHeight = getTimelineRowHeight(initialHeights, rowKey);
    let nextHeights = initialHeights;
    target.setPointerCapture(pointerId);
    onDragActiveChange?.(true);

    function update(clientY: number) {
      const deltaY = clientY - startY;
      const height = clamp(Math.round(initialHeight + (edge === "top" ? -deltaY : deltaY)), 42, 140);
      nextHeights = { ...initialHeights, [rowKey]: height };
      setPreviewRowHeights(nextHeights);
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      update(pointerEvent.clientY);
    }

    function cleanupResize(commit: boolean, clientY?: number) {
      if (activeResizeRef.current !== transaction) return;
      if (commit && clientY !== undefined) update(clientY);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      activeResizeRef.current = null;
      onDragActiveChange?.(false);
      setPreviewRowHeights(null);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      if (commit) onCommitRowHeights(nextHeights);
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      cleanupResize(true, pointerEvent.clientY);
    }

    function cancel() {
      cleanupResize(false);
    }

    const transaction: TimelineRowResizeTransaction = { move, pointerId, target, up, cancel };
    activeResizeRef.current = transaction;

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  return { startTimelineRowResize };
}
