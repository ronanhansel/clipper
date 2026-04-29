import { defaultPreviewViewportState } from "../../../core/project";
import type { EditorState } from "../../../core/types";

type UpdateEditorState = (updater: (state: EditorState) => EditorState) => void;

type PreviewScrollPersistenceOptions = {
  centerPreviewScrollFrameRef: { current: number };
  centerPreviewScrollRef: { current: HTMLDivElement | null };
  updateEditorState: UpdateEditorState;
};

export function usePreviewScrollPersistence({ centerPreviewScrollFrameRef, centerPreviewScrollRef, updateEditorState }: PreviewScrollPersistenceOptions) {
  function saveCenterPreviewScroll() {
    if (centerPreviewScrollFrameRef.current) return;
    centerPreviewScrollFrameRef.current = requestAnimationFrame(() => {
      centerPreviewScrollFrameRef.current = 0;
      const viewport = centerPreviewScrollRef.current;
      if (!viewport) return;
      updateEditorState((state) => ({
        ...state,
        preview: {
          ...(state.preview ?? defaultPreviewViewportState),
          scrollLeft: Math.max(Math.round(viewport.scrollLeft), 0),
          scrollTop: Math.max(Math.round(viewport.scrollTop), 0),
        },
      }));
    });
  }

  return { saveCenterPreviewScroll };
}
