import { useEffect, type MutableRefObject } from "react";
import { isEditorTarget } from "../shortcuts/useGlobalEditorShortcuts";
import type { ObjectDrag, ObjectResize } from "../../../core/frameInteraction";
import type { FrameObject } from "../../../core/types";

type UseFrameInteractionEffectsParams = {
  frameViewportRef: MutableRefObject<HTMLDivElement | null>;
  framePickFrameRef: MutableRefObject<number>;
  dragBoxFrameRef: MutableRefObject<number>;
  objectDragFrameRef: MutableRefObject<number>;
  objectDragRef: MutableRefObject<ObjectDrag | null>;
  objectResizeRef: MutableRefObject<ObjectResize | null>;
  cameraPreviewFrameRef: MutableRefObject<number>;
  marqueeDragging: boolean;
  timelineMode: string;
  frameInteractionControllerRef: MutableRefObject<{
    syncObjectResizeAspectPreview: (active: boolean) => void;
  } | null>;
  clearObjectDrag: () => void;
  clearDragBox: () => void;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  setEditingTextObjectId: (id: string | null) => void;
};

function isInspectorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-inspector-panel]"));
}

function isSelectPopoverTarget(target: HTMLElement | null) {
  return Boolean(
    target?.closest(
      "[data-radix-select-content], [data-radix-popper-content-wrapper]",
    ),
  );
}

function isComposeLayersTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-compose-layers-panel]"));
}

function isTimelineTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-timeline-panel]"));
}

function isPreviewStageTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-clipper-preview-stage]"));
}

export function useFrameInteractionEffects({
  frameViewportRef,
  framePickFrameRef,
  dragBoxFrameRef,
  objectDragFrameRef,
  objectDragRef,
  objectResizeRef,
  cameraPreviewFrameRef,
  marqueeDragging,
  timelineMode,
  frameInteractionControllerRef,
  clearObjectDrag,
  clearDragBox,
  setComposeSelectionObjects,
  setEditingTextObjectId,
}: UseFrameInteractionEffectsParams) {
  useEffect(
    () => () => {
      if (framePickFrameRef.current)
        cancelAnimationFrame(framePickFrameRef.current);
      if (dragBoxFrameRef.current)
        cancelAnimationFrame(dragBoxFrameRef.current);
      if (objectDragFrameRef.current)
        cancelAnimationFrame(objectDragFrameRef.current);
      if (cameraPreviewFrameRef.current)
        cancelAnimationFrame(cameraPreviewFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    function clearFrameSelectionOnOutsidePointer(
      event: globalThis.PointerEvent,
    ) {
      const target = event.target as HTMLElement | null;
      if (
        isEditorTarget(target) ||
        isInspectorTarget(target) ||
        isSelectPopoverTarget(target) ||
        isComposeLayersTarget(target) ||
        isTimelineTarget(target)
      )
        return;
      if (frameViewportRef.current?.contains(event.target as Node)) return;
      if (timelineMode === "compose" && isPreviewStageTarget(target))
        setComposeSelectionObjects([]);
      setEditingTextObjectId(null);
      clearObjectDrag();
      clearDragBox();
    }

    window.addEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
    return () =>
      window.removeEventListener(
        "pointerdown",
        clearFrameSelectionOnOutsidePointer,
      );
  }, [
    clearDragBox,
    clearObjectDrag,
    frameViewportRef,
    setComposeSelectionObjects,
    setEditingTextObjectId,
    timelineMode,
  ]);

  useEffect(() => {
    if (!marqueeDragging) return;

    function clearMarqueeAfterPointerRelease() {
      if (objectDragRef.current) return;
      requestAnimationFrame(() => clearDragBox());
    }

    window.addEventListener("pointerup", clearMarqueeAfterPointerRelease);
    window.addEventListener("pointercancel", clearMarqueeAfterPointerRelease);
    return () => {
      window.removeEventListener("pointerup", clearMarqueeAfterPointerRelease);
      window.removeEventListener(
        "pointercancel",
        clearMarqueeAfterPointerRelease,
      );
    };
  }, [marqueeDragging, objectDragRef, clearDragBox]);

  useEffect(() => {
    function syncObjectResizeAspectPreview(event: KeyboardEvent) {
      if (event.key !== "Shift" || !objectResizeRef.current) return;
      frameInteractionControllerRef.current?.syncObjectResizeAspectPreview(
        event.type === "keydown",
      );
    }

    window.addEventListener("keydown", syncObjectResizeAspectPreview);
    window.addEventListener("keyup", syncObjectResizeAspectPreview);
    return () => {
      window.removeEventListener("keydown", syncObjectResizeAspectPreview);
      window.removeEventListener("keyup", syncObjectResizeAspectPreview);
    };
  }, [objectResizeRef, frameInteractionControllerRef]);
}
