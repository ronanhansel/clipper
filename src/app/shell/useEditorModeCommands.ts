import type { Mode } from "../types";
import type { EditorState, TimelineMode } from "../../core/types";

type UpdateEditorState = (updater: (state: EditorState) => EditorState) => void;

type EditorModeCommandsOptions = {
  modeRef: { current: Mode };
  timelineModeRef: { current: TimelineMode };
  setMode: (mode: Mode) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  updateEditorState: UpdateEditorState;
};

export function useEditorModeCommands({ modeRef, timelineModeRef, setMode, setTimelineMode, updateEditorState }: EditorModeCommandsOptions) {
  function updateTimelineMode(nextMode: TimelineMode) {
    timelineModeRef.current = nextMode;
    setTimelineMode(nextMode);
    if (nextMode === "compose" && modeRef.current !== "preview") {
      modeRef.current = "preview";
      setMode("preview");
    }
    updateEditorState((state) => ({ ...state, timelineMode: nextMode, mode: nextMode === "compose" ? "preview" : state.mode }));
  }

  function updateMode(nextMode: Mode) {
    modeRef.current = nextMode;
    setMode(nextMode);
    updateEditorState((state) => ({ ...state, mode: nextMode }));
  }

  return { updateMode, updateTimelineMode };
}
