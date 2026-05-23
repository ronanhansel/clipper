import { useEffect, type MutableRefObject } from "react";
import type { Part } from "../../../core/types";
import { isTextEditingTarget } from "../shortcuts/useGlobalEditorShortcuts";
import type { ComposeCursorTool, ComposeDrawTool } from "./composeDrawing";

type UseComposeToolShortcutsParams = {
  activeTool: ComposeDrawTool | null;
  activeToolRef: MutableRefObject<ComposeDrawTool | null>;
  composeMode: boolean;
  hasPreviewComposition: boolean;
  mode: string;
  part: Part;
  selectedComposeObjectIds: string[];
  addNullObjectToFrameCenter: () => void;
  reorderComposeObjects: (objectIds: string[], targetIndex: number) => void;
  setActiveTool: (tool: ComposeDrawTool | null) => void;
  setActiveCursorTool: (tool: ComposeCursorTool) => void;
  setObjectResizeMode: (mode: "resize" | "scale") => void;
};

export function useComposeToolShortcuts({
  activeTool,
  activeToolRef,
  composeMode,
  hasPreviewComposition,
  mode,
  part,
  selectedComposeObjectIds,
  addNullObjectToFrameCenter,
  reorderComposeObjects,
  setActiveTool,
  setActiveCursorTool,
  setObjectResizeMode,
}: UseComposeToolShortcutsParams) {
  activeToolRef.current = activeTool;

  useEffect(() => {
    function reorderSelectedObjects(placement: "back" | "front") {
      const selectedIds = new Set(selectedComposeObjectIds);
      const selectedIndexes = part.objects
        .map((object, index) => (selectedIds.has(object.id) ? index : -1))
        .filter((index) => index >= 0);
      if (!selectedIndexes.length) return false;

      const minIndex = Math.min(...selectedIndexes);
      const maxIndex = Math.max(...selectedIndexes);
      const movingIds = part.objects
        .filter((object) => selectedIds.has(object.id))
        .map((object) => object.id);
      const remainingCount = part.objects.length - movingIds.length;
      const targetIndex =
        placement === "back" ? 0 : placement === "front" ? remainingCount : 0;
      reorderComposeObjects(movingIds, targetIndex);
      return true;
    }

    function nudgeSelectedObjects(direction: "back" | "front") {
      const selectedIds = new Set(selectedComposeObjectIds);
      const selectedIndexes = part.objects
        .map((object, index) => (selectedIds.has(object.id) ? index : -1))
        .filter((index) => index >= 0);
      if (!selectedIndexes.length) return false;

      const minIndex = Math.min(...selectedIndexes);
      const maxIndex = Math.max(...selectedIndexes);
      if (direction === "back" && minIndex === 0) return true;
      if (direction === "front" && maxIndex === part.objects.length - 1)
        return true;

      const movingIds = part.objects
        .filter((object) => selectedIds.has(object.id))
        .map((object) => object.id);
      const targetIndex = direction === "back" ? minIndex - 1 : maxIndex + 1;
      reorderComposeObjects(movingIds, targetIndex);
      return true;
    }

    function handleComposeToolShortcut(event: KeyboardEvent) {
      if (!composeMode || mode !== "preview" || !hasPreviewComposition) return;
      if (isTextEditingTarget(event.target as HTMLElement | null)) return;

      const key = event.key.toLowerCase();
      const isBracketShortcut =
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (key === "[" ||
          key === "]" ||
          event.code === "BracketLeft" ||
          event.code === "BracketRight");
      if (isBracketShortcut) {
        const handled =
          key === "[" || event.code === "BracketLeft"
            ? event.shiftKey
              ? reorderSelectedObjects("front")
              : nudgeSelectedObjects("front")
            : event.shiftKey
              ? reorderSelectedObjects("back")
              : nudgeSelectedObjects("back");
        if (!handled) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;

      let nextTool: ComposeDrawTool | null | undefined;
      let nextResizeMode: "resize" | "scale" | undefined;
      let nextCursorTool: ComposeCursorTool | undefined;

      if (key === "v" && !event.shiftKey) {
        nextTool = null;
        nextResizeMode = "resize";
      } else if (key === "k" && !event.shiftKey) {
        nextTool = null;
        nextResizeMode = "scale";
      } else if (key === "h" && !event.shiftKey) {
        nextTool = null;
        nextCursorTool = "hand";
      } else if (key === "r" && !event.shiftKey) {
        nextTool = "rect";
      } else if (key === "l") {
        nextTool = event.shiftKey ? "arrow" : "line";
      } else if (key === "o" && !event.shiftKey) {
        nextTool = "ellipse";
      } else if (key === "p") {
        nextTool = event.shiftKey ? "pencil" : "pen";
      } else if (key === "t" && !event.shiftKey) {
        nextTool = "text";
      } else if (key === "n" && !event.shiftKey) {
        addNullObjectToFrameCenter();
        nextTool = null;
      }

      if (
        nextTool === undefined &&
        nextResizeMode === undefined &&
        nextCursorTool === undefined
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (nextResizeMode) setObjectResizeMode(nextResizeMode);
      if (nextCursorTool) setActiveCursorTool(nextCursorTool);
      activeToolRef.current = nextTool ?? null;
      setActiveTool(nextTool ?? null);
    }

    window.addEventListener("keydown", handleComposeToolShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleComposeToolShortcut, true);
  }, [
    activeToolRef,
    addNullObjectToFrameCenter,
    composeMode,
    hasPreviewComposition,
    mode,
    part.objects,
    reorderComposeObjects,
    selectedComposeObjectIds,
    setActiveTool,
    setActiveCursorTool,
    setObjectResizeMode,
  ]);
}
