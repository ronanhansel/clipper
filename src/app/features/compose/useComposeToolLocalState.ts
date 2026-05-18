import { useRef, useState } from "react";
import type {
  ComposeDrawTool,
  PathDraft,
  ShapeDrawPreview,
} from "./composeDrawing";
import type { Point } from "../../../core/types";

export type ComposeToolLocalState = ReturnType<typeof useComposeToolLocalState>;

export function useComposeToolLocalState() {
  const [objectResizeMode, setObjectResizeMode] = useState<"resize" | "scale">(
    "resize",
  );
  const [activeTool, setActiveTool] = useState<ComposeDrawTool | null>(null);
  const activeToolRef = useRef<ComposeDrawTool | null>(null);
  const shapeDrawStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
    points: Point[];
  } | null>(null);
  const pathDraftRef = useRef<PathDraft | null>(null);
  const [shapeDrawPreview, setShapeDrawPreview] =
    useState<ShapeDrawPreview | null>(null);
  const shapeDrawPreviewRef = useRef<ShapeDrawPreview | null>(null);
  const shapeDrawPreviewFrameRef = useRef(0);
  const pendingComposeSelectionObjectIdsRef = useRef<string[]>([]);

  return {
    objectResizeMode,
    setObjectResizeMode,
    activeTool,
    setActiveTool,
    activeToolRef,
    shapeDrawStartRef,
    pathDraftRef,
    shapeDrawPreview,
    setShapeDrawPreview,
    shapeDrawPreviewRef,
    shapeDrawPreviewFrameRef,
    pendingComposeSelectionObjectIdsRef,
  };
}
