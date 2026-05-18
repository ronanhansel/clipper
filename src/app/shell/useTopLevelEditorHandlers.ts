import { useCallback } from "react";
import type { Mode } from "../types";
import type { EditorState, TimelineMode } from "../../core/types";

const wheelLineDeltaPx = 16;
const wheelPageDeltaPx = 600;
const frameWheelZoomSensitivity = 0.008;

export type UseTopLevelEditorHandlersParams = {
  mode: Mode;
  timelineMode: TimelineMode;
  saveAllChanges: () => Promise<void>;
  onCloseProject: () => void;
  undoProjectChange: () => void;
  redoProjectChange: () => void;
  setSelectedSceneId: (id: string) => void;
  updateEditorState: (
    updater: (state: EditorState) => EditorState,
    options?: { history?: boolean },
  ) => void;
  clearDirectSelection: () => void;
  setSelectedPartId: (id: string) => void;
  setCurrentSceneTime: (time: number) => void;
  updateMode: (mode: Mode) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
  resetPrerenderCache: () => void;
  zoomFramePreviewAtPoint: (factor: number, x: number, y: number) => void;
};

function withInspectorScrollPreserved(fn: () => void) {
  const panel = document.querySelector<HTMLElement>("[data-inspector-panel]");
  const scrollTop = panel?.scrollTop ?? 0;
  fn();
  if (panel)
    requestAnimationFrame(() => {
      panel.scrollTop = scrollTop;
    });
}

export function useTopLevelEditorHandlers({
  mode,
  timelineMode,
  saveAllChanges,
  onCloseProject,
  undoProjectChange,
  redoProjectChange,
  setSelectedSceneId,
  updateEditorState,
  clearDirectSelection,
  setSelectedPartId,
  setCurrentSceneTime,
  updateMode,
  updateTimelineMode,
  resetPrerenderCache,
  zoomFramePreviewAtPoint,
}: UseTopLevelEditorHandlersParams) {
  const undoWithScrollPreserved = useCallback(() => {
    withInspectorScrollPreserved(() => undoProjectChange());
  }, [undoProjectChange]);

  const redoWithScrollPreserved = useCallback(() => {
    withInspectorScrollPreserved(() => redoProjectChange());
  }, [redoProjectChange]);

  const handleCloseProject = useCallback(async () => {
    await saveAllChanges();
    onCloseProject();
  }, [onCloseProject, saveAllChanges]);

  const handleSelectTimeline = useCallback(
    (timelineId: string) => {
      updateTimelineMode("direct");
      setSelectedSceneId(timelineId);
      updateEditorState((state) => ({
        ...state,
        selectedSceneId: timelineId,
        currentSceneTime: 0,
      }));
      clearDirectSelection();
      setSelectedPartId("");
      setCurrentSceneTime(0);
    },
    [
      clearDirectSelection,
      setCurrentSceneTime,
      setSelectedPartId,
      setSelectedSceneId,
      updateEditorState,
      updateTimelineMode,
    ],
  );

  const handleTimelineModeChange = useCallback(
    (nextMode: TimelineMode) => {
      if (timelineMode === "compose" && nextMode === "direct") {
        clearDirectSelection();
      }
      updateTimelineMode(nextMode);
    },
    [clearDirectSelection, timelineMode, updateTimelineMode],
  );

  const handleModeChange = useCallback(
    (nextMode: Mode) => {
      if (nextMode === "preview") resetPrerenderCache();
      updateMode(nextMode);
    },
    [resetPrerenderCache, updateMode],
  );

  const zoomFramePreviewFromWheel = useCallback(
    (event: globalThis.WheelEvent) => {
      if (mode !== "preview" || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      const deltaY =
        event.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * wheelLineDeltaPx
          : event.deltaMode === globalThis.WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * wheelPageDeltaPx
            : event.deltaY;
      zoomFramePreviewAtPoint(
        Math.exp(-deltaY * frameWheelZoomSensitivity),
        event.clientX,
        event.clientY,
      );
    },
    [mode, zoomFramePreviewAtPoint],
  );

  return {
    undoWithScrollPreserved,
    redoWithScrollPreserved,
    handleCloseProject,
    handleSelectTimeline,
    handleTimelineModeChange,
    handleModeChange,
    zoomFramePreviewFromWheel,
  };
}
