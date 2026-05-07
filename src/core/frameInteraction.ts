import { marqueeSelectionThresholdPx, minimumObjectResizeSide } from "./editorConstants";
import { boundsToPoints } from "./geometry";
import { clamp } from "./math";
import { evaluateFrameObject } from "../render-engine/renderRuntime";
import { FRAME_HEIGHT, FRAME_WIDTH, type Bounds, type FrameObject, type Part, type Point, type SelectionPayload } from "./types";

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
  displaySelectionBox: Bounds;
  aspectRatio?: number;
  objectPreviewTransforms: Record<string, ObjectPreviewTransform>;
  objects: SelectionPayload["objects"];
  preservedObjects: SelectionPayload["objects"];
};

export type ObjectPreviewTransform = {
  translateX: number;
  translateY: number;
  translateXPercent: number;
  translateYPercent: number;
  scaleX: number;
  scaleY: number;
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

export function constrainDragDeltaToDominantAxis(delta: Point, constrained: boolean): Point {
  if (!constrained) return delta;
  return Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
}

export function getResizedObjects(resize: ObjectResize, delta: Point, preserveAspect = false) {
  const displaySelectionBox = resize.displaySelectionBox;
  const nextDisplaySelectionBox = getResizedBounds(displaySelectionBox, resize.handle, delta, preserveAspect ? resize.aspectRatio : undefined);
  const scaleX = displaySelectionBox.width === 0 ? 1 : nextDisplaySelectionBox.width / displaySelectionBox.width;
  const scaleY = displaySelectionBox.height === 0 ? 1 : nextDisplaySelectionBox.height / displaySelectionBox.height;

  return resize.objects.map((object) => {
    const previewTransform = resize.objectPreviewTransforms[object.id] ?? identityPreviewTransform;
    const objectDisplayBounds = getBoundsWithPreviewTransform(object.bounds, previewTransform);
    const displayLeft = nextDisplaySelectionBox.x + (objectDisplayBounds.x - displaySelectionBox.x) * scaleX;
    const displayRight = nextDisplaySelectionBox.x + (objectDisplayBounds.x + objectDisplayBounds.width - displaySelectionBox.x) * scaleX;
    const displayTop = nextDisplaySelectionBox.y + (objectDisplayBounds.y - displaySelectionBox.y) * scaleY;
    const displayBottom = nextDisplaySelectionBox.y + (objectDisplayBounds.y + objectDisplayBounds.height - displaySelectionBox.y) * scaleY;
    const sourceBounds = getBoundsWithoutPreviewTransform({
      x: Math.min(displayLeft, displayRight - minimumObjectResizeSide),
      y: Math.min(displayTop, displayBottom - minimumObjectResizeSide),
      width: Math.max(minimumObjectResizeSide, displayRight - displayLeft),
      height: Math.max(minimumObjectResizeSide, displayBottom - displayTop),
    }, previewTransform);
    const left = Math.round(sourceBounds.x);
    const right = Math.round(sourceBounds.x + sourceBounds.width);
    const top = Math.round(sourceBounds.y);
    const bottom = Math.round(sourceBounds.y + sourceBounds.height);
    return {
      ...object,
      bounds: {
        x: Math.min(left, right - minimumObjectResizeSide),
        y: Math.min(top, bottom - minimumObjectResizeSide),
        width: Math.max(minimumObjectResizeSide, right - left),
        height: Math.max(minimumObjectResizeSide, bottom - top),
      },
    };
  });
}

const identityPreviewTransform: ObjectPreviewTransform = { translateX: 0, translateY: 0, translateXPercent: 0, translateYPercent: 0, scaleX: 1, scaleY: 1 };

export function getBoundsWithPreviewTransform(bounds: Bounds, transform: ObjectPreviewTransform): Bounds {
  const width = bounds.width * transform.scaleX;
  const height = bounds.height * transform.scaleY;
  return {
    x: bounds.x + transform.translateX + bounds.width * transform.translateXPercent + (bounds.width - width) / 2,
    y: bounds.y + transform.translateY + bounds.height * transform.translateYPercent + (bounds.height - height) / 2,
    width,
    height,
  };
}

function getBoundsWithoutPreviewTransform(bounds: Bounds, transform: ObjectPreviewTransform): Bounds {
  const scaleX = transform.scaleX || 1;
  const scaleY = transform.scaleY || 1;
  const width = bounds.width / scaleX;
  const height = bounds.height / scaleY;
  return {
    x: bounds.x - transform.translateX - width * transform.translateXPercent - (width - bounds.width) / 2,
    y: bounds.y - transform.translateY - height * transform.translateYPercent - (height - bounds.height) / 2,
    width,
    height,
  };
}

export function selectionPayloadFromObjects(objects: SelectionPayload["objects"]): SelectionPayload {
  const selectionBox = getBoundsUnion(objects.map((object) => object.bounds));
  return { selectionBox, coordinates: boundsToPoints(selectionBox), objects };
}

export function getResizedBounds(bounds: Bounds, handle: ResizeHandle, delta: Point, aspectRatio?: number): Bounds {
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

  if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    const width = Math.max(minimumObjectResizeSide, nextRight - nextLeft);
    const height = Math.max(minimumObjectResizeSide, nextBottom - nextTop);
    const widthDriven = handle === "left" || handle === "right" || (handle.includes("left") || handle.includes("right")) && Math.abs(delta.x) >= Math.abs(delta.y);
    if (widthDriven) {
      const nextHeight = width / aspectRatio;
      if (topAnchored) nextTop = nextBottom - nextHeight;
      else if (bottomAnchored) nextBottom = nextTop + nextHeight;
      else {
        const centerY = bounds.y + bounds.height / 2;
        nextTop = centerY - nextHeight / 2;
        nextBottom = centerY + nextHeight / 2;
      }
    } else {
      const nextWidth = height * aspectRatio;
      if (leftAnchored) nextLeft = nextRight - nextWidth;
      else if (rightAnchored) nextRight = nextLeft + nextWidth;
      else {
        const centerX = bounds.x + bounds.width / 2;
        nextLeft = centerX - nextWidth / 2;
        nextRight = centerX + nextWidth / 2;
      }
    }
  }

  nextLeft = clamp(nextLeft, -FRAME_WIDTH, FRAME_WIDTH * 2);
  nextRight = clamp(nextRight, -FRAME_WIDTH, FRAME_WIDTH * 2);
  nextTop = clamp(nextTop, -FRAME_HEIGHT, FRAME_HEIGHT * 2);
  nextBottom = clamp(nextBottom, -FRAME_HEIGHT, FRAME_HEIGHT * 2);

  const left = Math.round(Math.min(nextLeft, nextRight - minimumObjectResizeSide));
  const rightEdge = Math.round(Math.max(nextRight, left + minimumObjectResizeSide));
  const top = Math.round(Math.min(nextTop, nextBottom - minimumObjectResizeSide));
  const bottomEdge = Math.round(Math.max(nextBottom, top + minimumObjectResizeSide));

  return {
    x: left,
    y: top,
    width: Math.max(minimumObjectResizeSide, rightEdge - left),
    height: Math.max(minimumObjectResizeSide, bottomEdge - top),
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

export function syncChartObjectBounds(object: FrameObject): FrameObject {
  return object;
}

export function getPartFrameObject(part: Part, objectId: string) {
  return part.objects.find((object) => object.id === objectId) ?? part.background.elements.find((object) => object.id === objectId) ?? null;
}

export function getFrameObjectWithPreviewBounds(object: FrameObject, time: number, duration: number): FrameObject {
  const previewBounds = getBoundsWithPreviewTransform(object.bounds, getFrameObjectPreviewTransform(object, time, duration));
  return { ...object, bounds: previewBounds };
}

export function getFrameObjectPreviewTransform(object: FrameObject, time: number, duration: number): ObjectPreviewTransform {
  const evaluated = evaluateFrameObject(object, time, duration, { animations: true });
  const animationTransform = typeof evaluated.renderStyle.transform === "string" ? evaluated.renderStyle.transform : undefined;
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const transform = animationTransform ?? objectTransform ?? "";
  let translateX = 0;
  let translateY = 0;
  let translateXPercent = 0;
  let translateYPercent = 0;
  let scaleX = 1;
  let scaleY = 1;
  const matcher = /(translate(?:3d|X|Y)?|scale(?:3d|X|Y)?)\(([^)]*)\)/g;
  for (const match of transform.matchAll(matcher)) {
    const [, kind, rawArgs] = match;
    const args = rawArgs.split(/[,\s]+/).filter(Boolean).map(parseTransformArgument);
    if (kind === "translate" || kind === "translate3d") {
      translateX += args[0]?.px ?? 0;
      translateY += args[1]?.px ?? 0;
      translateXPercent += args[0]?.percent ?? 0;
      translateYPercent += args[1]?.percent ?? 0;
    } else if (kind === "translateX") {
      translateX += args[0]?.px ?? 0;
      translateXPercent += args[0]?.percent ?? 0;
    } else if (kind === "translateY") {
      translateY += args[0]?.px ?? 0;
      translateYPercent += args[0]?.percent ?? 0;
    } else if (kind === "scale" || kind === "scale3d") {
      scaleX *= args[0]?.number ?? 1;
      scaleY *= args[1]?.number ?? args[0]?.number ?? 1;
    } else if (kind === "scaleX") {
      scaleX *= args[0]?.number ?? 1;
    } else if (kind === "scaleY") {
      scaleY *= args[0]?.number ?? 1;
    }
  }
  return { translateX, translateY, translateXPercent, translateYPercent, scaleX, scaleY };
}

function parseTransformArgument(value: string) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return { number: undefined, px: 0, percent: 0 };
  if (value.trim().endsWith("%")) return { number, px: 0, percent: number / 100 };
  return { number, px: number, percent: 0 };
}
