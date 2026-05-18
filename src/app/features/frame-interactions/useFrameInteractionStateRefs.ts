import { useRef, useState } from "react";
import type { CameraPreviewTransform } from "../../../core/camera";
import type {
  ObjectDrag,
  ObjectResize,
  ObjectSnapGuide,
} from "../../../core/frameInteraction";
import type { Bounds, Point, TransitionLayer } from "../../../core/types";
import type { FrameInteractionController } from "./useFrameInteractionController";

export type FrameInteractionStateRefs = ReturnType<
  typeof useFrameInteractionStateRefs
>;

export function useFrameInteractionStateRefs() {
  const pendingFramePickPointRef = useRef<Point | null>(null);
  const framePickFrameRef = useRef(0);
  const dragStartRef = useRef<Point | null>(null);
  const pendingDragBoxRef = useRef<Bounds | null>(null);
  const dragBoxFrameRef = useRef(0);
  const marqueeDraggingRef = useRef(false);
  const marqueeLastPointRef = useRef<Point | null>(null);
  const marqueeSpacePanningRef = useRef(false);
  const liveDragSelectionIdsRef = useRef("");
  const objectDragRef = useRef<ObjectDrag | null>(null);
  const objectDragFrameRef = useRef(0);
  const objectDragDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const [objectSnapGuides, setObjectSnapGuides] = useState<ObjectSnapGuide[]>(
    [],
  );
  const objectSnapGuidesRef = useRef<ObjectSnapGuide[]>([]);
  const objectResizeRef = useRef<ObjectResize | null>(null);
  const objectResizeFrameRef = useRef(0);
  const objectResizeDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const objectResizePreserveAspectRef = useRef(false);
  const [, setObjectResizingActive] = useState(false);
  const pendingCameraPreviewRef = useRef<CameraPreviewTransform | null>(null);
  const cameraPreviewFrameRef = useRef(0);
  const frameInteractionControllerRef =
    useRef<FrameInteractionController | null>(null);
  const [previewTransitionLayers, setPreviewTransitionLayers] = useState<
    TransitionLayer[] | null
  >(null);

  return {
    pendingFramePickPointRef,
    framePickFrameRef,
    dragStartRef,
    pendingDragBoxRef,
    dragBoxFrameRef,
    marqueeDraggingRef,
    marqueeLastPointRef,
    marqueeSpacePanningRef,
    liveDragSelectionIdsRef,
    objectDragRef,
    objectDragFrameRef,
    objectDragDeltaRef,
    objectSnapGuides,
    setObjectSnapGuides,
    objectSnapGuidesRef,
    objectResizeRef,
    objectResizeFrameRef,
    objectResizeDeltaRef,
    objectResizePreserveAspectRef,
    setObjectResizingActive,
    pendingCameraPreviewRef,
    cameraPreviewFrameRef,
    frameInteractionControllerRef,
    previewTransitionLayers,
    setPreviewTransitionLayers,
  };
}
