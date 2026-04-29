import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { defaultComposeLayoutState, defaultEditorLayoutState } from "../../../core/project";
import type { ComposeLayoutState, EditorLayoutState, EditorState, ProjectManifest } from "../../../core/types";
import { clamp } from "../../../core/math";

export type EditorPanelResizeKind = "left" | "compose-left" | "right" | "timeline";

type EditorPanelResizeDrag = {
  kind: EditorPanelResizeKind;
  originX: number;
  originY: number;
  initialLayout: EditorLayoutState;
  initialComposeLayout: ComposeLayoutState;
  nextLayout: EditorLayoutState;
  nextComposeLayout: ComposeLayoutState;
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
  appRootRef: RefObject<HTMLElement | null>;
  projectRef: RefObject<ProjectManifest>;
  updateEditorState: (updater: (state: EditorState) => EditorState) => void;
  scheduleImplicitFileOperationSave: (projectOverride: ProjectManifest, errorMessage?: string) => void;
};

export function useEditorPanelResize({ appRootRef, projectRef, updateEditorState, scheduleImplicitFileOperationSave }: UseEditorPanelResizeInput) {
  const editorPanelResizeRef = useRef<EditorPanelResizeDrag | null>(null);

  function clampEditorLayout(layout: EditorLayoutState): EditorLayoutState {
    const availablePanelWidth = Math.max(window.innerWidth - editorPanelLayoutLimits.centerMin, editorPanelLayoutLimits.leftMin + editorPanelLayoutLimits.rightMin);
    const rightPanelWidth = Math.round(clamp(layout.rightPanelWidth, editorPanelLayoutLimits.rightMin, Math.min(editorPanelLayoutLimits.rightMax, availablePanelWidth - editorPanelLayoutLimits.leftMin)));
    const leftPanelWidth = Math.round(clamp(layout.leftPanelWidth, editorPanelLayoutLimits.leftMin, Math.min(editorPanelLayoutLimits.leftMax, availablePanelWidth - rightPanelWidth)));
    const timelineMax = Math.max(editorPanelLayoutLimits.timelineMin, Math.min(editorPanelLayoutLimits.timelineMax, window.innerHeight - 48 - 220));
    const timelineHeight = Math.round(clamp(layout.timelineHeight, editorPanelLayoutLimits.timelineMin, timelineMax));
    return { leftPanelWidth, rightPanelWidth, timelineHeight };
  }

  function clampComposeLayout(layout: ComposeLayoutState): ComposeLayoutState {
    const currentLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;
    const availablePanelWidth = Math.max(window.innerWidth - editorPanelLayoutLimits.centerMin, editorPanelLayoutLimits.leftMin + editorPanelLayoutLimits.rightMin);
    const maxLeftPanelWidth = Math.min(editorPanelLayoutLimits.leftMax, availablePanelWidth - currentLayout.rightPanelWidth);
    return { leftPanelWidth: Math.round(clamp(layout.leftPanelWidth, editorPanelLayoutLimits.leftMin, maxLeftPanelWidth)) };
  }

  function applyEditorLayoutCss(layout: EditorLayoutState) {
    const root = appRootRef.current;
    if (!root) return;
    root.style.setProperty("--clipper-left-panel-width", `${layout.leftPanelWidth}px`);
    root.style.setProperty("--clipper-right-panel-width", `${layout.rightPanelWidth}px`);
    root.style.setProperty("--clipper-timeline-height", `${layout.timelineHeight}px`);
  }

  function applyComposeLayoutCss(layout: ComposeLayoutState) {
    const root = appRootRef.current;
    if (!root) return;
    root.style.setProperty("--clipper-compose-left-panel-width", `${layout.leftPanelWidth}px`);
  }

  function updateEditorLayout(layout: EditorLayoutState) {
    const nextLayout = clampEditorLayout(layout);
    const currentLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;
    if (JSON.stringify(nextLayout) === JSON.stringify(currentLayout)) return;
    updateEditorState((state) => ({ ...state, layout: nextLayout }));
    scheduleImplicitFileOperationSave(projectRef.current, "Unable to save layout.");
  }

  function updateComposeLayout(layout: ComposeLayoutState) {
    const nextLayout = clampComposeLayout(layout);
    const currentLayout = projectRef.current.editorState?.composeLayout ?? defaultComposeLayoutState;
    if (JSON.stringify(nextLayout) === JSON.stringify(currentLayout)) return;
    updateEditorState((state) => ({ ...state, composeLayout: nextLayout }));
    scheduleImplicitFileOperationSave(projectRef.current, "Unable to save compose layout.");
  }

  function onEditorPanelResizeMove(event: globalThis.PointerEvent) {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.originX;
    const deltaY = event.clientY - drag.originY;
    const nextLayout = clampEditorLayout({
      ...drag.initialLayout,
      leftPanelWidth: drag.kind === "left" ? drag.initialLayout.leftPanelWidth + deltaX : drag.initialLayout.leftPanelWidth,
      rightPanelWidth: drag.kind === "right" ? drag.initialLayout.rightPanelWidth - deltaX : drag.initialLayout.rightPanelWidth,
      timelineHeight: drag.kind === "timeline" ? drag.initialLayout.timelineHeight - deltaY : drag.initialLayout.timelineHeight,
    });
    const nextComposeLayout = clampComposeLayout({
      ...drag.initialComposeLayout,
      leftPanelWidth: drag.kind === "compose-left" ? drag.initialComposeLayout.leftPanelWidth + deltaX : drag.initialComposeLayout.leftPanelWidth,
    });
    drag.nextLayout = nextLayout;
    drag.nextComposeLayout = nextComposeLayout;
    if (drag.frame) return;

    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      applyEditorLayoutCss(drag.nextLayout);
      applyComposeLayoutCss(drag.nextComposeLayout);
    });
  }

  function onEditorPanelResizeEnd() {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    applyEditorLayoutCss(drag.nextLayout);
    applyComposeLayoutCss(drag.nextComposeLayout);
    if (drag.kind === "compose-left") updateComposeLayout(drag.nextComposeLayout);
    else updateEditorLayout(drag.nextLayout);
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
    const initialComposeLayout = clampComposeLayout(projectRef.current.editorState?.composeLayout ?? defaultComposeLayoutState);
    const drag: EditorPanelResizeDrag = { kind, originX: event.clientX, originY: event.clientY, initialLayout, initialComposeLayout, nextLayout: initialLayout, nextComposeLayout: initialComposeLayout, frame: 0 };
    editorPanelResizeRef.current = drag;
    document.body.style.cursor = kind === "timeline" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onEditorPanelResizeMove, true);
    window.addEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.addEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }

  useEffect(() => () => {
    const drag = editorPanelResizeRef.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    editorPanelResizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onEditorPanelResizeMove, true);
    window.removeEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.removeEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }, []);

  return { startEditorPanelResize };
}
