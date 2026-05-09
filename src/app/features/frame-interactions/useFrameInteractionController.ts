import { startTransition, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";
import { selectorHandleSizePx, selectorOffsetPx } from "../../config";
import type { RightPanelTab } from "../../types";
import { boundsToViewport, framePointToCameraTranslation, type CameraPreviewTransform } from "../../../core/camera";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";
import { constrainDragDeltaToDominantAxis, getBoundsUnion, getBoundsWithPreviewTransform, getDraggedObjects, getFrameObjectPreviewTransform, getFrameObjectWithPreviewBounds, getObjectDragSnap, getObjectResizeScale, getPartFrameObject, getResizedObjects, insetBounds, isVisibleMarqueeBounds, moveBounds, selectionObjectFromFrameObject, selectionPayloadFromObjects, syncChartObjectBounds, updateDragSelectionBoxElement, type ObjectDrag, type ObjectResize, type ObjectResizeMode, type ObjectSnapGuide, type ResizeHandle } from "../../../core/frameInteraction";
import { boundsToPoints, createSelectionPayload, framePointFromClient, normalizeBounds } from "../../../core/geometry";
import { clamp, roundTwo } from "../../../core/math";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type Bounds, type CompositionClip, type FrameObject, type Part, type Point, type SelectionPayload } from "../../../core/types";

export type FrameInteractionController = ReturnType<typeof useFrameInteractionController>;

type PickMarker = { partId: string; markerId: string } | null;
type PointPickAdjustment = { layerId: string; control: AdjustmentEffectPointControl } | null;

type FrameInteractionControllerParams = {
  cameraPreviewTransform: CameraPreviewTransform;
  cameraRef: RefObject<HTMLDivElement | null>;
  canSelectFrameObjects: boolean;
  dragBox: Bounds | null;
  dragBoxFrameRef: RefObject<number>;
  dragSelectionBoxRef: RefObject<HTMLDivElement | null>;
  dragStart: Point | null;
  dragStartRef: RefObject<Point | null>;
  focusPickZoomMarker: PickMarker;
  framePickFrameRef: RefObject<number>;
  framePickPreviewPoint: Point | null;
  frameDisplayScale: number;
  framePreviewScale: number;
  selectionOverlayScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  liveDragSelectionIdsRef: RefObject<string>;
  marqueeDraggingRef: RefObject<boolean>;
  marqueeLastPointRef: RefObject<Point | null>;
  marqueeSpacePanningRef: RefObject<boolean>;
  mode: string;
  objectDragDeltaRef: RefObject<Point>;
  objectDragFrameRef: RefObject<number>;
  objectDragRef: RefObject<ObjectDrag | null>;
  objectSnapGuidesRef: RefObject<ObjectSnapGuide[]>;
  objectResizeDeltaRef: RefObject<Point>;
  objectResizeFrameRef: RefObject<number>;
  objectResizeMode: ObjectResizeMode;
  objectResizePreserveAspectRef: RefObject<boolean>;
  objectResizeRef: RefObject<ObjectResize | null>;
  part: Part;
  pendingDragBoxRef: RefObject<Bounds | null>;
  pendingFramePickPointRef: RefObject<Point | null>;
  pointPickAdjustment: PointPickAdjustment;
  positionPickTranslationMarker: PickMarker;
  previewTime: number;
  selectionPayload: SelectionPayload | null;
  trackerPickTranslationMarker: PickMarker;
  zoomScale: number;
  clearMarkerSelection: () => void;
  clearNodeSelection: () => void;
  onSelectFrameSettings: () => void;
  setDragBox: Dispatch<SetStateAction<Bounds | null>>;
  setDragStart: Dispatch<SetStateAction<Point | null>>;
  setEditingTextObjectId: Dispatch<SetStateAction<string | null>>;
  setFramePickPreviewPoint: Dispatch<SetStateAction<Point | null>>;
  setMarqueeDragging: Dispatch<SetStateAction<boolean>>;
  setObjectResizingActive: Dispatch<SetStateAction<boolean>>;
  setRightPanelTab: Dispatch<SetStateAction<RightPanelTab>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  setSelectionPayload: Dispatch<SetStateAction<SelectionPayload | null>>;
  setObjectSnapGuides: Dispatch<SetStateAction<ObjectSnapGuide[]>>;
  updateAdjustmentLayer: (layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  updateCompositionForTimelinePart: (partId: string, updater: (composition: CompositionClip) => CompositionClip) => void;
  updateTranslationMarker: (partId: string, markerId: string, updater: (marker: import("../../../core/types").MotionMarker) => import("../../../core/types").MotionMarker) => void;
  updateZoomMarkerFocusGroup: (partId: string, markerId: string, point: Point) => void;
};

export function useFrameInteractionController(params: FrameInteractionControllerParams) {
  const {
    cameraPreviewTransform, cameraRef, canSelectFrameObjects, dragBox, dragBoxFrameRef, dragSelectionBoxRef, dragStart, dragStartRef,
    focusPickZoomMarker, framePickFrameRef, framePickPreviewPoint, frameDisplayScale, framePreviewScale, selectionOverlayScale, frameViewportRef, liveDragSelectionIdsRef,
    marqueeDraggingRef, marqueeLastPointRef, marqueeSpacePanningRef, mode, objectDragDeltaRef, objectDragFrameRef, objectDragRef, objectSnapGuidesRef,
    objectResizeDeltaRef, objectResizeFrameRef, objectResizeMode, objectResizePreserveAspectRef, objectResizeRef, part, pendingDragBoxRef,
    pendingFramePickPointRef, pointPickAdjustment, positionPickTranslationMarker, previewTime, selectionPayload,
    trackerPickTranslationMarker, zoomScale, clearMarkerSelection, clearNodeSelection, onSelectFrameSettings, setDragBox, setDragStart, setEditingTextObjectId,
    setFramePickPreviewPoint, setMarqueeDragging, setObjectResizingActive, setObjectSnapGuides, setRightPanelTab, setSelectedObjectId, setSelectionPayload, updateAdjustmentLayer,
    updateCompositionForTimelinePart, updateTranslationMarker, updateZoomMarkerFocusGroup,
  } = params;

  function updateObjectDragSelection(nextObjects: SelectionPayload["objects"]) {
    setSelectionPayload(selectionPayloadFromObjects(nextObjects));
  }

  function updateObjectSnapGuides(guides: ObjectSnapGuide[]) {
    const current = objectSnapGuidesRef.current;
    if (current.length === guides.length && current.every((guide, index) => guide.axis === guides[index]?.axis && guide.position === guides[index]?.position)) return;
    objectSnapGuidesRef.current = guides;
    setObjectSnapGuides(guides);
  }

  function clearObjectSnapGuides() {
    if (objectSnapGuidesRef.current.length === 0) return;
    objectSnapGuidesRef.current = [];
    setObjectSnapGuides([]);
  }

  function getFrameObjectElement(objectId: string) {
    const escapedId = CSS.escape(objectId);
    return frameViewportRef.current?.querySelector<HTMLElement>(`[data-object-id="${escapedId}"],[data-background-element-id="${escapedId}"]`) ?? null;
  }

  function getFrameSelectionBoxElements() {
    return Array.from(document.querySelectorAll<HTMLElement>("[data-frame-selection-box]"));
  }

  function getFrameSelectionBoxElement(objectId: string) {
    return document.querySelector<HTMLElement>(`[data-frame-selection-box="${CSS.escape(objectId)}"]`);
  }

  function setFrameSelectionBoxDragTransform(delta: Point) {
    for (const element of getFrameSelectionBoxElements()) {
      const scale = element.dataset.frameSelectionBoxPortal ? selectionOverlayScale : 1;
      element.style.setProperty("--clipper-drag-x", `${delta.x * framePreviewScale * cameraPreviewTransform.scale * scale}px`);
      element.style.setProperty("--clipper-drag-y", `${delta.y * framePreviewScale * cameraPreviewTransform.scale * scale}px`);
    }
  }

  function clearFrameSelectionBoxDragTransform() {
    for (const element of getFrameSelectionBoxElements()) {
      element.style.removeProperty("--clipper-drag-x");
      element.style.removeProperty("--clipper-drag-y");
    }
  }

  function setObjectDragTransform(objectId: string, delta: Point) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.setProperty("--clipper-drag-x", `${delta.x}px`);
    element.style.setProperty("--clipper-drag-y", `${delta.y}px`);
  }

  function setObjectResizePreview(objectId: string, bounds: Bounds) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.setProperty("--clipper-resize-left", `${bounds.x}px`);
    element.style.setProperty("--clipper-resize-top", `${bounds.y}px`);
    element.style.setProperty("--clipper-resize-width", `${bounds.width}px`);
    element.style.setProperty("--clipper-resize-height", `${bounds.height}px`);
  }

  function setObjectScalePreview(objectId: string, scale: number) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.setProperty("--clipper-scale-preview", String(scale));
  }

  function clearObjectResizePreviews(objects: SelectionPayload["objects"]) {
    for (const object of objects) {
      const element = getFrameObjectElement(object.id);
      if (!element) continue;
      element.style.removeProperty("--clipper-resize-left");
      element.style.removeProperty("--clipper-resize-top");
      element.style.removeProperty("--clipper-resize-width");
      element.style.removeProperty("--clipper-resize-height");
      element.style.removeProperty("--clipper-scale-preview");
    }
  }

  function setFrameSelectionBoxResizePreview(objectId: string, bounds: Bounds) {
    const object = getPartFrameObject(part, objectId);
    const previewBounds = object ? getFrameObjectWithPreviewBounds({ ...object, bounds }, previewTime, part.duration).bounds : bounds;
    const selectionUiScale = Math.max(selectionOverlayScale, 0.001);
    const selectorOffset = selectorOffsetPx / selectionUiScale;
    const selectorHandleSize = selectorHandleSizePx / selectionUiScale;
    const viewportBounds = insetBounds(boundsToViewport(previewBounds, cameraPreviewTransform, framePreviewScale), -selectorOffset);
    const overlayOffset = selectorOffset + selectorHandleSize;
    const element = getFrameSelectionBoxElement(objectId);
    if (!element) return;
    if (element.dataset.frameSelectionBoxPortal) {
      const rect = frameViewportRef.current?.getBoundingClientRect();
      const hostRect = element.closest<HTMLElement>("[data-clipper-preview-overlay-host]")?.getBoundingClientRect();
      if (!rect) return;
      if (!hostRect) return;
      const scale = rect.width / (FRAME_WIDTH * framePreviewScale);
      element.style.setProperty("--clipper-selection-preview-left", `${rect.left - hostRect.left + viewportBounds.x * scale}px`);
      element.style.setProperty("--clipper-selection-preview-top", `${rect.top - hostRect.top + viewportBounds.y * scale}px`);
      element.style.setProperty("--clipper-selection-preview-width", `${viewportBounds.width * scale}px`);
      element.style.setProperty("--clipper-selection-preview-height", `${viewportBounds.height * scale}px`);
      return;
    }
    element.style.setProperty("--clipper-selection-preview-left", `${viewportBounds.x + overlayOffset}px`);
    element.style.setProperty("--clipper-selection-preview-top", `${viewportBounds.y + overlayOffset}px`);
    element.style.setProperty("--clipper-selection-preview-width", `${viewportBounds.width}px`);
    element.style.setProperty("--clipper-selection-preview-height", `${viewportBounds.height}px`);
  }

  function clearFrameSelectionBoxResizePreview() {
    for (const element of getFrameSelectionBoxElements()) {
      element.style.removeProperty("--clipper-selection-preview-left");
      element.style.removeProperty("--clipper-selection-preview-top");
      element.style.removeProperty("--clipper-selection-preview-width");
      element.style.removeProperty("--clipper-selection-preview-height");
    }
  }

  function clearObjectDragTransforms(objects: SelectionPayload["objects"]) {
    for (const object of objects) {
      const element = getFrameObjectElement(object.id);
      if (!element) continue;
      element.style.removeProperty("--clipper-drag-x");
      element.style.removeProperty("--clipper-drag-y");
    }
  }

  function scheduleObjectResizePreview(delta: Point, preserveAspect = false) {
    objectResizeDeltaRef.current = delta;
    objectResizePreserveAspectRef.current = preserveAspect;
    if (objectResizeFrameRef.current) return;

    objectResizeFrameRef.current = requestAnimationFrame(() => {
      objectResizeFrameRef.current = 0;
      const resize = objectResizeRef.current;
      if (!resize) return;

      const preserveAspect = objectResizePreserveAspectRef.current || resize.mode === "scale";
      const nextObjects = getResizedObjects(resize, objectResizeDeltaRef.current, preserveAspect);
      const scale = getObjectResizeScale(resize, objectResizeDeltaRef.current, preserveAspect);
      for (const object of nextObjects) {
        setObjectResizePreview(object.id, object.bounds);
        setObjectScalePreview(object.id, scale);
        setFrameSelectionBoxResizePreview(object.id, object.bounds);
      }
    });
  }

  function syncObjectResizeAspectPreview(preserveAspect: boolean) {
    if (!objectResizeRef.current) return;
    scheduleObjectResizePreview(objectResizeDeltaRef.current, preserveAspect);
  }

  function clearObjectResize() {
    if (objectResizeFrameRef.current) {
      cancelAnimationFrame(objectResizeFrameRef.current);
      objectResizeFrameRef.current = 0;
    }
    if (objectResizeRef.current) clearObjectResizePreviews(objectResizeRef.current.objects);
    clearFrameSelectionBoxResizePreview();
    objectResizeRef.current = null;
    objectResizeDeltaRef.current = { x: 0, y: 0 };
    objectResizePreserveAspectRef.current = false;
    setObjectResizingActive(false);
    window.dispatchEvent(new CustomEvent("clipper:object-resize-active", { detail: { active: false } }));
  }

  function finishCommittedObjectResize(objects: SelectionPayload["objects"]) {
    objectResizeRef.current = null;
    objectResizeDeltaRef.current = { x: 0, y: 0 };
    objectResizePreserveAspectRef.current = false;
    setObjectResizingActive(false);
    window.dispatchEvent(new CustomEvent("clipper:object-resize-active", { detail: { active: false } }));
    // Keep the final imperative geometry in place until React reconciles the
    // committed bounds. Removing left/top/width/height here makes absolute text
    // briefly fall back to its static top-left position and looks like snap-back.
    void objects;
  }

  function scheduleObjectDragPreview(delta: Point) {
    objectDragDeltaRef.current = delta;
    if (objectDragFrameRef.current) return;

    objectDragFrameRef.current = requestAnimationFrame(() => {
      objectDragFrameRef.current = 0;
      const drag = objectDragRef.current;
      if (!drag) return;

      for (const object of drag.objects) setObjectDragTransform(object.id, objectDragDeltaRef.current);
      setFrameSelectionBoxDragTransform(objectDragDeltaRef.current);
    });
  }

  function clearObjectDrag() {
    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }
    if (objectDragRef.current) clearObjectDragTransforms(objectDragRef.current.objects);
    clearFrameSelectionBoxDragTransform();
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    clearObjectSnapGuides();
  }

  function finishCommittedObjectDrag(objects: SelectionPayload["objects"]) {
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    // Leave committed drag offsets on the object and selection DOM until their
    // bounds props update; each render component clears them in layout effect.
    void objects;
    clearObjectSnapGuides();
  }

  function scheduleDragBox(nextBounds: Bounds) {
    pendingDragBoxRef.current = nextBounds;
    if (dragBoxFrameRef.current) return;

    dragBoxFrameRef.current = requestAnimationFrame(() => {
      dragBoxFrameRef.current = 0;
      if (!marqueeDraggingRef.current) return;
      const nextDragBox = pendingDragBoxRef.current;
      if (nextDragBox && dragSelectionBoxRef.current) {
        const overlayHost = dragSelectionBoxRef.current.closest<HTMLElement>("[data-clipper-preview-overlay-host]");
        const frameRect = frameViewportRef.current?.getBoundingClientRect();
        const hostRect = overlayHost?.getBoundingClientRect();
        const offset = frameRect && hostRect ? { x: frameRect.left - hostRect.left, y: frameRect.top - hostRect.top } : { x: 0, y: 0 };
        updateDragSelectionBoxElement(dragSelectionBoxRef.current, nextDragBox, framePreviewScale, undefined, selectionOverlayScale, offset);
      }
      if (!nextDragBox || !isVisibleMarqueeBounds(nextDragBox, frameDisplayScale)) return;
      const payload = createSelectionPayload(nextDragBox, [...part.background.elements, ...part.objects]);
      const nextSelectionIds = payload.objects.map((object) => object.id).join("|");
      if (nextSelectionIds === liveDragSelectionIdsRef.current) return;
      liveDragSelectionIdsRef.current = nextSelectionIds;
      startTransition(() => {
        setSelectionPayload(payload.objects.length > 0 ? payload : null);
        setSelectedObjectId(payload.objects[0]?.id ?? null);
      });
    });
  }

  function clearDragBox() {
    marqueeDraggingRef.current = false;
    if (dragBoxFrameRef.current) {
      cancelAnimationFrame(dragBoxFrameRef.current);
      dragBoxFrameRef.current = 0;
    }
    dragStartRef.current = null;
    pendingDragBoxRef.current = null;
    marqueeLastPointRef.current = null;
    marqueeSpacePanningRef.current = false;
    liveDragSelectionIdsRef.current = "";
    if (dragSelectionBoxRef.current) dragSelectionBoxRef.current.style.display = "none";
    setMarqueeDragging(false);
    setDragStart(null);
    setDragBox(null);
  }

  function commitObjectDrag() {
    const drag = objectDragRef.current;
    if (!drag) return;

    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }

    const nextObjects = getDraggedObjects(drag, objectDragDeltaRef.current);
    const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
    updateCompositionForTimelinePart(drag.partId, (composition) => ({
      ...composition,
      objects: composition.objects.map((object) => {
        const nextBounds = nextBoundsById.get(object.id);
        return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
      }),
      background: {
        ...composition.background,
        elements: composition.background.elements.map((object) => {
          const nextBounds = nextBoundsById.get(object.id);
          return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
        }),
      },
    }));
    updateObjectDragSelection(nextObjects);
    finishCommittedObjectDrag(drag.objects);
  }

  function onFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "preview" || !cameraRef.current || objectDragRef.current || objectResizeRef.current) return;
    if (trackerPickTranslationMarker) return;
    if (focusPickZoomMarker || pointPickAdjustment) {
      startFramePickDrag(event);
      return;
    }
    if (positionPickTranslationMarker) {
      startFramePickDrag(event);
      return;
    }
    if (!canSelectFrameObjects) return;
    if ((event.target as HTMLElement).dataset.objectId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    dragStartRef.current = point;
    marqueeLastPointRef.current = point;
    pendingDragBoxRef.current = { x: point.x, y: point.y, width: 0, height: 0 };
    liveDragSelectionIdsRef.current = "";
    marqueeDraggingRef.current = true;
    onSelectFrameSettings();
    setMarqueeDragging(true);
    setDragStart(point);
    setDragBox({ x: point.x, y: point.y, width: 0, height: 0 });
    clearNodeSelection();
  }

  function onFramePointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!focusPickZoomMarker && !positionPickTranslationMarker && !pointPickAdjustment) return;
    event.stopPropagation();
    startFramePickDrag(event);
  }

  function startFramePickDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFramePickFromPointer(event);
  }

  function updateFramePickFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!frameViewportRef.current) return;
    const point = framePointFromClient(event.nativeEvent, frameViewportRef.current);
    const nextPoint = { x: Math.round(clamp(point.x, 0, FRAME_WIDTH)), y: Math.round(clamp(point.y, 0, FRAME_HEIGHT)) };
    pendingFramePickPointRef.current = nextPoint;
    if (framePickFrameRef.current) return;

    framePickFrameRef.current = requestAnimationFrame(() => {
      framePickFrameRef.current = 0;
      setFramePickPreviewPoint(pendingFramePickPointRef.current);
    });
  }

  function commitFramePick() {
    const point = pendingFramePickPointRef.current ?? framePickPreviewPoint;
    if (!point) return;

    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }

    if (focusPickZoomMarker) updateZoomMarkerFocusGroup(focusPickZoomMarker.partId, focusPickZoomMarker.markerId, point);
    if (positionPickTranslationMarker) {
      updateTranslationMarker(positionPickTranslationMarker.partId, positionPickTranslationMarker.markerId, (marker) => ({ ...marker, position: framePointToCameraTranslation(point) }));
    }
    if (pointPickAdjustment) {
      const { control } = pointPickAdjustment;
      const nextX = control.coordinateSpace === "percent" ? roundTwo((point.x / FRAME_WIDTH) * 100) : point.x;
      const nextY = control.coordinateSpace === "percent" ? roundTwo((point.y / FRAME_HEIGHT) * 100) : point.y;
      updateAdjustmentLayer(pointPickAdjustment.layerId, (layer) => ({
        ...layer,
        effect: { ...layer.effect, params: { ...layer.effect.params, [control.xKey]: nextX, [control.yKey]: nextY } },
      }));
    }
    pendingFramePickPointRef.current = null;
    requestAnimationFrame(() => setFramePickPreviewPoint(null));
  }

  function cancelFramePickPreview() {
    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }
    pendingFramePickPointRef.current = null;
    setFramePickPreviewPoint(null);
  }

  function onFramePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (focusPickZoomMarker || positionPickTranslationMarker || pointPickAdjustment) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updateFramePickFromPointer(event);
      return;
    }

    const activeObjectDrag = objectDragRef.current;
    if (activeObjectDrag && canSelectFrameObjects) {
      const dx = (event.clientX - activeObjectDrag.origin.x) / (frameDisplayScale * cameraPreviewTransform.scale);
      const dy = (event.clientY - activeObjectDrag.origin.y) / (frameDisplayScale * cameraPreviewTransform.scale);
      const constrainedDelta = constrainDragDeltaToDominantAxis({ x: dx, y: dy }, event.shiftKey);
      if (event.metaKey || event.ctrlKey) {
        const snap = getObjectDragSnap(activeObjectDrag, constrainedDelta, [...part.background.elements, ...part.objects], 8 / Math.max(frameDisplayScale * cameraPreviewTransform.scale, 0.001));
        scheduleObjectDragPreview(snap.delta);
        updateObjectSnapGuides(snap.guides);
      } else {
        scheduleObjectDragPreview(constrainedDelta);
        clearObjectSnapGuides();
      }
      return;
    }

    const activeObjectResize = objectResizeRef.current;
    if (activeObjectResize && canSelectFrameObjects) {
      const dx = (event.clientX - activeObjectResize.origin.x) / (frameDisplayScale * cameraPreviewTransform.scale);
      const dy = (event.clientY - activeObjectResize.origin.y) / (frameDisplayScale * cameraPreviewTransform.scale);
      scheduleObjectResizePreview({ x: dx, y: dy }, event.shiftKey);
      return;
    }

    const currentDragStart = dragStartRef.current ?? dragStart;
    if (!currentDragStart || !canSelectFrameObjects) return;
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    if (marqueeSpacePanningRef.current && pendingDragBoxRef.current && marqueeLastPointRef.current) {
      const delta = { x: point.x - marqueeLastPointRef.current.x, y: point.y - marqueeLastPointRef.current.y };
      dragStartRef.current = { x: currentDragStart.x + delta.x, y: currentDragStart.y + delta.y };
      marqueeLastPointRef.current = point;
      scheduleDragBox(moveBounds(pendingDragBoxRef.current, delta));
      return;
    }
    marqueeLastPointRef.current = point;
    scheduleDragBox(normalizeBounds(currentDragStart, point));
  }

  function onFramePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (focusPickZoomMarker || positionPickTranslationMarker || pointPickAdjustment) {
      commitFramePick();
      return;
    }

    if (objectDragRef.current) {
      commitObjectDrag();
      return;
    }

    if (objectResizeRef.current) {
      commitObjectResize();
      return;
    }

    const finalDragBox = pendingDragBoxRef.current ?? dragBox;
    if (!finalDragBox || !canSelectFrameObjects || !isVisibleMarqueeBounds(finalDragBox, frameDisplayScale)) {
      clearDragBox();
      return;
    }
    const payload = createSelectionPayload(finalDragBox, [...part.background.elements, ...part.objects]);
    if (payload.objects.length === 0) clearNodeSelection();
    else {
      setSelectionPayload(payload);
      setSelectedObjectId(payload.objects[0]?.id ?? null);
    }
    clearMarkerSelection();
    clearDragBox();
  }

  function onFramePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cancelFramePickPreview();
    clearObjectDrag();
    clearObjectResize();
    clearDragBox();
  }

  function startObjectDrag(event: ReactPointerEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "preview" || !canSelectFrameObjects || object.locked) return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
    setEditingTextObjectId(null);
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const selectedObjectIds = new Set(selectionPayload?.objects.map((item) => item.id) ?? []);
    const selectableObjects = [...part.background.elements, ...part.objects];
    const nextSelectionObjects = selectedObjectIds.has(object.id)
      ? selectableObjects.filter((item) => selectedObjectIds.has(item.id)).map(selectionObjectFromFrameObject)
      : [selectionObjectFromFrameObject(object)];
    const selectionBox = getBoundsUnion(nextSelectionObjects.map((item) => item.bounds));

    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextSelectionObjects });
    const nextDrag = { origin: { x: event.clientX, y: event.clientY }, partId: part.id, objects: nextSelectionObjects };
    objectDragRef.current = nextDrag;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    for (const item of nextSelectionObjects) setObjectDragTransform(item.id, { x: 0, y: 0 });
  }

  function startObjectResize(event: ReactPointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) {
    if (mode !== "preview" || !canSelectFrameObjects || !selectionPayload?.objects.length) return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
    event.preventDefault();
    event.stopPropagation();
    setEditingTextObjectId(null);
    frameViewportRef.current?.setPointerCapture(event.pointerId);
    const preservedObjects = selectionPayload.objects
      .map((selected) => getPartFrameObject(part, selected.id))
      .filter((object): object is FrameObject => Boolean(object))
      .map(selectionObjectFromFrameObject);
    const resizedObjects = objectId ? preservedObjects.filter((item) => item.id === objectId) : preservedObjects;
    if (resizedObjects.length === 0 || preservedObjects.length === 0) return;
    const selectionBox = getBoundsUnion(resizedObjects.map((item) => item.bounds));
    const objectPreviewTransforms = Object.fromEntries(resizedObjects.map((selected) => {
      const object = getPartFrameObject(part, selected.id);
      return [selected.id, object ? getFrameObjectPreviewTransform(object, previewTime, part.duration) : { translateX: 0, translateY: 0, translateXPercent: 0, translateYPercent: 0, scaleX: 1, scaleY: 1 }];
    }));
    const displaySelectionBox = getBoundsUnion(resizedObjects.map((object) => getBoundsWithPreviewTransform(object.bounds, objectPreviewTransforms[object.id])));
    objectResizeRef.current = { origin: { x: event.clientX, y: event.clientY }, handle, partId: part.id, selectionBox, displaySelectionBox, aspectRatio: displaySelectionBox.width / displaySelectionBox.height, objectPreviewTransforms, objects: resizedObjects, preservedObjects, mode: objectResizeMode };
    objectResizeDeltaRef.current = { x: 0, y: 0 };
    setObjectResizingActive(true);
    window.dispatchEvent(new CustomEvent("clipper:object-resize-active", { detail: { active: true } }));
  }

  function commitObjectResize() {
    const resize = objectResizeRef.current;
    if (!resize) return;

    if (objectResizeFrameRef.current) {
      cancelAnimationFrame(objectResizeFrameRef.current);
      objectResizeFrameRef.current = 0;
    }

    const preserveAspect = objectResizePreserveAspectRef.current || resize.mode === "scale";
    const nextObjects = getResizedObjects(resize, objectResizeDeltaRef.current, preserveAspect);
    const scale = getObjectResizeScale(resize, objectResizeDeltaRef.current, preserveAspect);
    const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
    updateCompositionForTimelinePart(resize.partId, (composition) => ({
      ...composition,
      objects: composition.objects.map((object) => {
        const nextBounds = nextBoundsById.get(object.id);
        return nextBounds ? syncChartObjectBounds(scaleFrameObject({ ...object, bounds: nextBounds }, scale)) : object;
      }),
      background: {
        ...composition.background,
        elements: composition.background.elements.map((object) => {
          const nextBounds = nextBoundsById.get(object.id);
          return nextBounds ? syncChartObjectBounds(scaleFrameObject({ ...object, bounds: nextBounds }, scale)) : object;
        }),
      },
    }));
    const nextObjectsById = new Map(nextObjects.map((object) => [object.id, object]));
    const nextSelectionObjects = resize.preservedObjects.map((object) => nextObjectsById.get(object.id) ?? object);
    updateObjectDragSelection(nextSelectionObjects);
    finishCommittedObjectResize(resize.objects);
  }

  function startTextObjectEdit(event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "preview" || object.type !== "text" || !canSelectFrameObjects || object.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox: object.bounds, coordinates: boundsToPoints(object.bounds), objects: [selectionObjectFromFrameObject(object)] });
    setRightPanelTab("video");
    setEditingTextObjectId(object.id);
  }

  return {
    cancelFramePickPreview,
    clearDragBox,
    clearObjectDrag,
    clearObjectResize,
    onFramePointerCancel,
    onFramePointerDown,
    onFramePointerDownCapture,
    onFramePointerMove,
    onFramePointerUp,
    startObjectDrag,
    startObjectResize,
    startTextObjectEdit,
    syncObjectResizeAspectPreview,
  };
}

function scaleFrameObject(object: FrameObject, scale: number): FrameObject {
  if (scale === 1 || object.type !== "text") return object;
  const fontSize = toFiniteNumber(object.style.fontSize);
  if (fontSize === null) return object;
  return { ...object, style: { ...object.style, fontSize: Math.max(1, Math.round(fontSize * scale * 100) / 100) } };
}

function toFiniteNumber(value: string | number | undefined) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
