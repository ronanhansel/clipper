import type { CodeViewportState, EditorState } from "../../core/types";

type UpdateEditorState = (updater: (state: EditorState) => EditorState) => void;

export function useCodeViewportState(updateEditorState: UpdateEditorState) {
  function updateCodeViewportState(filePath: string, viewportState: CodeViewportState) {
    updateEditorState((state) => {
      const currentViewportState = state.code?.[filePath];
      if (currentViewportState?.scrollLeft === viewportState.scrollLeft && currentViewportState.scrollTop === viewportState.scrollTop) return state;
      return {
        ...state,
        code: {
          ...(state.code ?? {}),
          [filePath]: viewportState,
        },
      };
    });
  }

  return { updateCodeViewportState };
}
