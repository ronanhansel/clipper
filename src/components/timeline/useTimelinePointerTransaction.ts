import { useEffect, useRef, type PointerEvent } from "react";

export type TimelinePointerTransactionState = {
  clientX: number;
  clientY: number;
  hasDragged: boolean;
  initialClientX: number;
  initialClientY: number;
  pointerId: number;
  snap: boolean;
};

type StartTimelinePointerTransactionOptions = {
  event: PointerEvent<HTMLElement>;
  activationThreshold?: number;
  capturePointer?: boolean;
  updateAutoScroll?: (clientX: number, onScroll: () => void) => void;
  stopAutoScroll?: () => void;
  onPreview: (state: TimelinePointerTransactionState) => void;
  onCommit: (state: TimelinePointerTransactionState, event: globalThis.PointerEvent) => void;
  onCancel?: (state: TimelinePointerTransactionState) => void;
  onDragStart?: (state: TimelinePointerTransactionState) => void;
  onDragEnd?: (state: TimelinePointerTransactionState) => void;
};

type ActiveTimelinePointerTransaction = {
  target: HTMLElement;
  pointerId: number;
  capturePointer: boolean;
  frame: number;
  state: TimelinePointerTransactionState;
  updateAutoScroll?: (clientX: number, onScroll: () => void) => void;
  stopAutoScroll?: () => void;
  onPreview: (state: TimelinePointerTransactionState) => void;
  onCommit: (state: TimelinePointerTransactionState, event: globalThis.PointerEvent) => void;
  onCancel?: (state: TimelinePointerTransactionState) => void;
  onDragStart?: (state: TimelinePointerTransactionState) => void;
  onDragEnd?: (state: TimelinePointerTransactionState) => void;
  move: (event: globalThis.PointerEvent) => void;
  up: (event: globalThis.PointerEvent) => void;
  cancel: (event: globalThis.PointerEvent) => void;
  key: (event: KeyboardEvent) => void;
};

export function useTimelinePointerTransaction() {
  const activeRef = useRef<ActiveTimelinePointerTransaction | null>(null);

  useEffect(() => () => cleanupTimelinePointerTransaction(false), []);

  function cleanupTimelinePointerTransaction(runCancel: boolean) {
    const active = activeRef.current;
    if (!active) return;

    activeRef.current = null;
    if (active.frame) window.cancelAnimationFrame(active.frame);
    active.frame = 0;
    window.removeEventListener("pointermove", active.move);
    window.removeEventListener("pointerup", active.up);
    window.removeEventListener("pointercancel", active.cancel);
    window.removeEventListener("keydown", active.key);
    window.removeEventListener("keyup", active.key);
    active.stopAutoScroll?.();
    if (active.capturePointer && active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    if (runCancel) active.onCancel?.(active.state);
    if (active.state.hasDragged) active.onDragEnd?.(active.state);
  }

  function startTimelinePointerTransaction({ event, activationThreshold = 4, capturePointer = false, updateAutoScroll, stopAutoScroll, onPreview, onCommit, onCancel, onDragStart, onDragEnd }: StartTimelinePointerTransactionOptions) {
    cleanupTimelinePointerTransaction(true);

    const target = event.currentTarget;
    const state: TimelinePointerTransactionState = {
      clientX: event.clientX,
      clientY: event.clientY,
      hasDragged: false,
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      pointerId: event.pointerId,
      snap: event.shiftKey,
    };

    function schedulePreview() {
      const active = activeRef.current;
      if (!active || active.frame) return;
      active.frame = window.requestAnimationFrame(() => {
        const current = activeRef.current;
        if (!current) return;
        current.frame = 0;
        current.onPreview(current.state);
      });
    }

    function activateIfNeeded(active: ActiveTimelinePointerTransaction) {
      if (active.state.hasDragged) return true;
      const distance = Math.max(Math.abs(active.state.clientX - active.state.initialClientX), Math.abs(active.state.clientY - active.state.initialClientY));
      if (distance < activationThreshold) return false;
      active.state.hasDragged = true;
      active.onDragStart?.(active.state);
      return true;
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      const active = activeRef.current;
      if (!active || pointerEvent.pointerId !== active.pointerId) return;
      active.state.clientX = pointerEvent.clientX;
      active.state.clientY = pointerEvent.clientY;
      active.state.snap = pointerEvent.shiftKey;
      if (!activateIfNeeded(active)) return;
      active.updateAutoScroll?.(active.state.clientX, schedulePreview);
      schedulePreview();
    }

    function key(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key !== "Shift") return;
      const active = activeRef.current;
      if (!active) return;
      active.state.snap = keyboardEvent.shiftKey;
      if (active.state.hasDragged) schedulePreview();
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      const active = activeRef.current;
      if (!active || pointerEvent.pointerId !== active.pointerId) return;
      active.state.clientX = pointerEvent.clientX;
      active.state.clientY = pointerEvent.clientY;
      active.state.snap = pointerEvent.shiftKey;
      if (active.frame) {
        window.cancelAnimationFrame(active.frame);
        active.frame = 0;
      }
      if (active.state.hasDragged) active.onCommit(active.state, pointerEvent);
      cleanupTimelinePointerTransaction(false);
    }

    function cancel(pointerEvent: globalThis.PointerEvent) {
      const active = activeRef.current;
      if (!active || pointerEvent.pointerId !== active.pointerId) return;
      active.state.clientX = pointerEvent.clientX;
      active.state.clientY = pointerEvent.clientY;
      active.state.snap = pointerEvent.shiftKey;
      cleanupTimelinePointerTransaction(true);
    }

    const active: ActiveTimelinePointerTransaction = {
      target,
      pointerId: event.pointerId,
      capturePointer,
      frame: 0,
      state,
      updateAutoScroll,
      stopAutoScroll,
      onPreview,
      onCommit,
      onCancel,
      onDragStart,
      onDragEnd,
      move,
      up,
      cancel,
      key,
    };

    activeRef.current = active;
    if (capturePointer) target.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
  }

  return { startTimelinePointerTransaction, cancelTimelinePointerTransaction: () => cleanupTimelinePointerTransaction(true) };
}
