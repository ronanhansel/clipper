import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { defaultEditorLayoutState } from "../../../core/project";
import type { EditorLayoutState, EditorState, ProjectManifest } from "../../../core/types";
import { clamp } from "../../../core/math";

export type EditorPanelResizeKind = "left" | "compose-left" | "right" | "timeline";

type EditorPanelResizeDrag = {
  kind: EditorPanelResizeKind;
  originX: number;
  originY: number;
  initialLayout: EditorLayoutState;
  nextLayout: EditorLayoutState;
  frame: number;
};

const editorPanelLayoutLimits = {
  leftMin: 220,
  leftMax: 560,
  rightMin: 280,
  rightMax: 620,
  timelineMin: 220,
  timelineMax: 560,
  centerMin: 640,
};

type UseEditorPanelResizeInput = {
  projectRef: RefObject<ProjectManifest>;
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { autosave?: boolean }) => void;
};

export function useEditorPanelResize({ projectRef, updateEditorState }: UseEditorPanelResizeInput) {
  const editorPanelResizeRef = useRef<EditorPanelResizeDrag | null>(null);
  const [previewEditorLayout, setPreviewEditorLayout] = useState<EditorLayoutState | null>(null);

  function clampEditorLayout(layout: EditorLayoutState): EditorLayoutState {
    const availablePanelWidth = Math.max(window.innerWidth - editorPanelLayoutLimits.centerMin, editorPanelLayoutLimits.leftMin + editorPanelLayoutLimits.rightMin);
    const rightPanelWidth = Math.round(clamp(layout.rightPanelWidth, editorPanelLayoutLimits.rightMin, Math.min(editorPanelLayoutLimits.rightMax, availablePanelWidth - editorPanelLayoutLimits.leftMin)));
    const leftPanelWidth = Math.round(clamp(layout.leftPanelWidth, editorPanelLayoutLimits.leftMin, Math.min(editorPanelLayoutLimits.leftMax, availablePanelWidth - rightPanelWidth)));
    const timelineMax = Math.max(editorPanelLayoutLimits.timelineMin, Math.min(editorPanelLayoutLimits.timelineMax, window.innerHeight - 48 - 220));
    const timelineHeight = Math.round(clamp(layout.timelineHeight, editorPanelLayoutLimits.timelineMin, timelineMax));
    return { leftPanelWidth, rightPanelWidth, timelineHeight };
  }

  function updateEditorLayout(layout: EditorLayoutState) {
    const nextLayout = clampEditorLayout(layout);
    const currentLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;
    if (editorLayoutsEqual(nextLayout, currentLayout)) return;
    updateEditorState((state) => ({ ...state, layout: nextLayout }));
  }

  function onEditorPanelResizeMove(event: globalThis.PointerEvent) {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.originX;
    const deltaY = event.clientY - drag.originY;
    const nextLayout = clampEditorLayout({
      ...drag.initialLayout,
      leftPanelWidth: drag.kind === "left" || drag.kind === "compose-left" ? drag.initialLayout.leftPanelWidth + deltaX : drag.initialLayout.leftPanelWidth,
      rightPanelWidth: drag.kind === "right" ? drag.initialLayout.rightPanelWidth - deltaX : drag.initialLayout.rightPanelWidth,
      timelineHeight: drag.kind === "timeline" ? drag.initialLayout.timelineHeight - deltaY : drag.initialLayout.timelineHeight,
    });
    drag.nextLayout = nextLayout;
    if (drag.frame) return;

    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      setPreviewEditorLayout(drag.nextLayout);
    });
  }

  function onEditorPanelResizeEnd() {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    setPreviewEditorLayout(drag.nextLayout);
    updateEditorLayout(drag.nextLayout);
    editorPanelResizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onEditorPanelResizeMove, true);
    window.removeEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.removeEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }

  function startEditorPanelResize(event: PointerEvent<HTMLDivElement>, kind: EditorPanelResizeKind) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const initialLayout = clampEditorLayout(projectRef.current.editorState?.layout ?? defaultEditorLayoutState);
    const drag: EditorPanelResizeDrag = { kind, originX: event.clientX, originY: event.clientY, initialLayout, nextLayout: initialLayout, frame: 0 };
    editorPanelResizeRef.current = drag;
    setPreviewEditorLayout(initialLayout);
    document.body.style.cursor = kind === "timeline" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onEditorPanelResizeMove, true);
    window.addEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.addEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }

  const committedEditorLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;

  useEffect(() => {
    if (!editorPanelResizeRef.current && previewEditorLayout && editorLayoutsEqual(previewEditorLayout, committedEditorLayout)) setPreviewEditorLayout(null);
  }, [committedEditorLayout.leftPanelWidth, committedEditorLayout.rightPanelWidth, committedEditorLayout.timelineHeight, previewEditorLayout]);

  useEffect(() => () => {
    const drag = editorPanelResizeRef.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    editorPanelResizeRef.current = null;
    setPreviewEditorLayout(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onEditorPanelResizeMove, true);
    window.removeEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.removeEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }, []);

  return { previewEditorLayout, startEditorPanelResize };
}

function editorLayoutsEqual(left: EditorLayoutState, right: EditorLayoutState) {
  return left.leftPanelWidth === right.leftPanelWidth && left.rightPanelWidth === right.rightPanelWidth && left.timelineHeight === right.timelineHeight;
}
