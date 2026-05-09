import type { CodeViewportState, EditorState } from "../../core/types";

type UpdateEditorState = (updater: (state: EditorState) => EditorState) => void;

export function useEditorViewportState(updateEditorState: UpdateEditorState) {
  function updateEditorViewportState(
    filePath: string,
    viewportState: CodeViewportState,
  ) {
    updateEditorState((state) => {
      const currentViewportState = state.editor?.[filePath];
      if (
        currentViewportState?.scrollLeft === viewportState.scrollLeft &&
        currentViewportState.scrollTop === viewportState.scrollTop
      )
        return state;
      return {
        ...state,
        editor: {
          ...(state.editor ?? {}),
          [filePath]: viewportState,
        },
      };
    });
  }

  return { updateEditorViewportState };
}
