import { useEffect, type MutableRefObject } from "react";
import { isTextEditingTarget } from "../shortcuts/useGlobalEditorShortcuts";
import type { ComposeDrawTool } from "./composeDrawing";

type UseComposeToolShortcutsParams = {
  activeTool: ComposeDrawTool | null;
  activeToolRef: MutableRefObject<ComposeDrawTool | null>;
  composeMode: boolean;
  hasPreviewComposition: boolean;
  mode: string;
  addNullObjectToFrameCenter: () => void;
  setActiveTool: (tool: ComposeDrawTool | null) => void;
  setObjectResizeMode: (mode: "resize" | "scale") => void;
};

export function useComposeToolShortcuts({
  activeTool,
  activeToolRef,
  composeMode,
  hasPreviewComposition,
  mode,
  addNullObjectToFrameCenter,
  setActiveTool,
  setObjectResizeMode,
}: UseComposeToolShortcutsParams) {
  activeToolRef.current = activeTool;

  useEffect(() => {
    function handleComposeToolShortcut(event: KeyboardEvent) {
      if (!composeMode || mode !== "preview" || !hasPreviewComposition) return;
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (isTextEditingTarget(event.target as HTMLElement | null)) return;

      const key = event.key.toLowerCase();
      let nextTool: ComposeDrawTool | null | undefined;
      let nextResizeMode: "resize" | "scale" | undefined;

      if (key === "v" && !event.shiftKey) {
        nextTool = null;
        nextResizeMode = "resize";
      } else if (key === "k" && !event.shiftKey) {
        nextTool = null;
        nextResizeMode = "scale";
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

      if (nextTool === undefined && nextResizeMode === undefined) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (nextResizeMode) setObjectResizeMode(nextResizeMode);
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
    setActiveTool,
    setObjectResizeMode,
  ]);
}
