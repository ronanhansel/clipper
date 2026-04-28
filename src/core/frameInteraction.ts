import { marqueeSelectionThresholdPx, minimumObjectResizeSide } from "./editorConstants";
import { boundsToPoints } from "./geometry";
import { clamp } from "./math";
import { FRAME_HEIGHT, FRAME_WIDTH, type Bounds, type FrameObject, type Point, type SelectionPayload } from "./types";

export type ResizeHandle = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

export type ObjectDrag = {
  origin: Point;
  partId: string;
  objects: SelectionPayload["objects"];
};

export type ObjectResize = {
  origin: Point;
  handle: ResizeHandle;
  partId: string;
  selectionBox: Bounds;
  objects: SelectionPayload["objects"];
  preservedObjects: SelectionPayload["objects"];
};

export function selectionObjectFromFrameObject(object: FrameObject): SelectionPayload["objects"][number] {
  return {
    id: object.id,
    name: object.name,
    selector: object.selector,
    bounds: object.bounds,
    type: object.type,
  };
}

export function getBoundsUnion(bounds: Bounds[]): Bounds {
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function centerOf(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function getDraggedObjects(drag: ObjectDrag, delta: Point) {
  return drag.objects.map((object) => ({
    ...object,
    bounds: {
      ...object.bounds,
      x: Math.round(clamp(object.bounds.x + delta.x, -object.bounds.width, FRAME_WIDTH)),
      y: Math.round(clamp(object.bounds.y + delta.y, -object.bounds.height, FRAME_HEIGHT)),
    },
  }));
}

export function getResizedObjects(resize: ObjectResize, delta: Point) {
  const nextSelectionBox = getResizedBounds(resize.selectionBox, resize.handle, delta);
  const scaleX = resize.selectionBox.width === 0 ? 1 : nextSelectionBox.width / resize.selectionBox.width;
  const scaleY = resize.selectionBox.height === 0 ? 1 : nextSelectionBox.height / resize.selectionBox.height;

  return resize.objects.map((object) => ({
    ...object,
    bounds: {
      x: Math.round(nextSelectionBox.x + (object.bounds.x - resize.selectionBox.x) * scaleX),
      y: Math.round(nextSelectionBox.y + (object.bounds.y - resize.selectionBox.y) * scaleY),
      width: Math.max(minimumObjectResizeSide, Math.round(object.bounds.width * scaleX)),
      height: Math.max(minimumObjectResizeSide, Math.round(object.bounds.height * scaleY)),
    },
  }));
}

export function selectionPayloadFromObjects(objects: SelectionPayload["objects"]): SelectionPayload {
  const selectionBox = getBoundsUnion(objects.map((object) => object.bounds));
  return { selectionBox, coordinates: boundsToPoints(selectionBox), objects };
}

export function getResizedBounds(bounds: Bounds, handle: ResizeHandle, delta: Point): Bounds {
  const leftAnchored = handle.includes("left");
  const rightAnchored = handle.includes("right");
  const topAnchored = handle.includes("top");
  const bottomAnchored = handle.includes("bottom");
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  let nextLeft = leftAnchored ? bounds.x + delta.x : bounds.x;
  let nextRight = rightAnchored ? right + delta.x : right;
  let nextTop = topAnchored ? bounds.y + delta.y : bounds.y;
  let nextBottom = bottomAnchored ? bottom + delta.y : bottom;

  if (nextRight - nextLeft < minimumObjectResizeSide) {
    if (leftAnchored) nextLeft = nextRight - minimumObjectResizeSide;
    else nextRight = nextLeft + minimumObjectResizeSide;
  }
  if (nextBottom - nextTop < minimumObjectResizeSide) {
    if (topAnchored) nextTop = nextBottom - minimumObjectResizeSide;
    else nextBottom = nextTop + minimumObjectResizeSide;
  }

  nextLeft = clamp(nextLeft, -FRAME_WIDTH, FRAME_WIDTH * 2);
  nextRight = clamp(nextRight, -FRAME_WIDTH, FRAME_WIDTH * 2);
  nextTop = clamp(nextTop, -FRAME_HEIGHT, FRAME_HEIGHT * 2);
  nextBottom = clamp(nextBottom, -FRAME_HEIGHT, FRAME_HEIGHT * 2);

  return {
    x: Math.round(Math.min(nextLeft, nextRight - minimumObjectResizeSide)),
    y: Math.round(Math.min(nextTop, nextBottom - minimumObjectResizeSide)),
    width: Math.round(Math.max(minimumObjectResizeSide, Math.abs(nextRight - nextLeft))),
    height: Math.round(Math.max(minimumObjectResizeSide, Math.abs(nextBottom - nextTop))),
  };
}

export function insetBounds(bounds: Bounds, inset: number): Bounds {
  return {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: Math.max(0, bounds.width - inset * 2),
    height: Math.max(0, bounds.height - inset * 2),
  };
}

export function isVisibleMarqueeBounds(bounds: Bounds, frameScale: number) {
  return bounds.width * frameScale >= marqueeSelectionThresholdPx || bounds.height * frameScale >= marqueeSelectionThresholdPx;
}

export function updateDragSelectionBoxElement(element: HTMLDivElement, bounds: Bounds, frameScale: number, visible = isVisibleMarqueeBounds(bounds, frameScale)) {
  element.style.display = visible ? "block" : "none";
  element.style.transform = `translate3d(${bounds.x * frameScale}px, ${bounds.y * frameScale}px, 0)`;
  element.style.width = `${bounds.width * frameScale}px`;
  element.style.height = `${bounds.height * frameScale}px`;
}

export function moveBounds(bounds: Bounds, delta: Point): Bounds {
  return { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y };
}
