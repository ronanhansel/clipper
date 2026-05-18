import { useEffect, type MutableRefObject } from "react";
import { isTextEditingTarget } from "../shortcuts/useGlobalEditorShortcuts";
import type { PathDraft, ShapeDrawPreview } from "./composeDrawing";

type UsePenDraftShortcutsParams = {
  pathDraftRef: MutableRefObject<PathDraft | null>;
  shapeDrawPreviewRef: MutableRefObject<ShapeDrawPreview | null>;
  commitPathDraftObject: (draft: PathDraft) => void;
  setShapeDrawPreview: (preview: ShapeDrawPreview | null) => void;
};

export function usePenDraftShortcuts({
  pathDraftRef,
  shapeDrawPreviewRef,
  commitPathDraftObject,
  setShapeDrawPreview,
}: UsePenDraftShortcutsParams) {
  useEffect(() => {
    function handlePenDraftKeyDown(event: KeyboardEvent) {
      const draft = pathDraftRef.current;
      if (!draft || (draft.tool !== "pen" && draft.tool !== "textPath")) return;
      if (isTextEditingTarget(event.target as HTMLElement | null)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (draft.tool === "textPath" && draft.segments.length > 0) {
          commitPathDraftObject(draft);
          pathDraftRef.current = null;
          shapeDrawPreviewRef.current = null;
          setShapeDrawPreview(null);
          return;
        }
        draft.disconnected = true;
        draft.previewPoint = null;
        draft.outHandle = null;
        shapeDrawPreviewRef.current = null;
        setShapeDrawPreview(null);
      } else if (event.key === "Enter" && draft.segments.length > 0) {
        event.preventDefault();
        commitPathDraftObject(draft);
        pathDraftRef.current = null;
        shapeDrawPreviewRef.current = null;
        setShapeDrawPreview(null);
      }
    }

    window.addEventListener("keydown", handlePenDraftKeyDown);
    return () => window.removeEventListener("keydown", handlePenDraftKeyDown);
  });
}
