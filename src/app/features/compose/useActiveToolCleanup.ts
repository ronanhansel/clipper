import { useEffect, type MutableRefObject } from "react";
import type {
  ComposeDrawTool,
  PathDraft,
  ShapeDrawPreview,
} from "./composeDrawing";

type UseActiveToolCleanupParams = {
  activeTool: ComposeDrawTool | null;
  pathDraftRef: MutableRefObject<PathDraft | null>;
  shapeDrawPreviewRef: MutableRefObject<ShapeDrawPreview | null>;
  setShapeDrawPreview: (preview: ShapeDrawPreview | null) => void;
};

export function useActiveToolCleanup({
  activeTool,
  pathDraftRef,
  shapeDrawPreviewRef,
  setShapeDrawPreview,
}: UseActiveToolCleanupParams) {
  useEffect(() => {
    if (activeTool === "pen" || activeTool === "textPath") return;
    pathDraftRef.current = null;
    shapeDrawPreviewRef.current = null;
    setShapeDrawPreview(null);
  }, [activeTool, pathDraftRef, shapeDrawPreviewRef, setShapeDrawPreview]);
}
