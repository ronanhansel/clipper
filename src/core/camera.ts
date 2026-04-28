import { roundTenth } from "./math";
import { getMotionTranslation } from "./renderRuntime";
import { FRAME_HEIGHT, FRAME_WIDTH, type Bounds, type FrameObject, type MotionEase, type Part, type Point, type TranslationMarker, type ZoomMarker } from "./types";

export type CameraPreviewTransform = { x: number; y: number; scale: number };

export function getCameraPreviewTransform(activeZoom: ZoomMarker | null, activeTranslation: TranslationMarker | null): CameraPreviewTransform {
  const scale = activeZoom?.scale ?? 1;
  const focus = activeZoom?.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
  return {
    x: (FRAME_WIDTH / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0),
    y: (FRAME_HEIGHT / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0),
    scale,
  };
}

export function boundsToViewport(bounds: Bounds, cameraTransform: CameraPreviewTransform, frameScale: number): Bounds {
  const x = FRAME_WIDTH / 2 + cameraTransform.x + (bounds.x - FRAME_WIDTH / 2) * cameraTransform.scale;
  const y = FRAME_HEIGHT / 2 + cameraTransform.y + (bounds.y - FRAME_HEIGHT / 2) * cameraTransform.scale;
  return {
    x: x * frameScale,
    y: y * frameScale,
    width: bounds.width * cameraTransform.scale * frameScale,
    height: bounds.height * cameraTransform.scale * frameScale,
  };
}

export function framePointToCameraTranslation(point: Point): Point {
  return {
    x: Math.round(FRAME_WIDTH / 2 - clampFrameX(point.x)),
    y: Math.round(FRAME_HEIGHT / 2 - clampFrameY(point.y)),
  };
}

export function cameraTranslationToFramePoint(position: Point): Point {
  return {
    x: Math.round(clampFrameX(FRAME_WIDTH / 2 - position.x)),
    y: Math.round(clampFrameY(FRAME_HEIGHT / 2 - position.y)),
  };
}

function clampFrameX(value: number) {
  return Math.min(Math.max(value, 0), FRAME_WIDTH);
}

function clampFrameY(value: number) {
  return Math.min(Math.max(value, 0), FRAME_HEIGHT);
}

export function getActiveZoom(markers: ZoomMarker[], time: number) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((item) => time >= item.start && time <= item.start + item.duration);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const middleTransitionFrom = marker.middleTransition === "transition" && marker.snapIn && previousMarker?.snapOut && roundTenth(previousMarker.start + previousMarker.duration) === roundTenth(marker.start)
    ? previousMarker
    : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(clamp(progress / 0.22, 0, 1), marker.middleEase);
    const scale = interpolate([middleTransitionFrom.scale, marker.scale] as const, easedIn);
    const focus = {
      x: Math.round(interpolate([middleTransitionFrom.focus.x, marker.focus.x] as const, easedIn)),
      y: Math.round(interpolate([middleTransitionFrom.focus.y, marker.focus.y] as const, easedIn)),
    };
    if (marker.snapOut) return { ...marker, focus, scale };
    const rampOut = cameraEaseProgress(clamp((1 - progress) / 0.22, 0, 1), marker.ease);
    return { ...marker, focus, scale: 1 + (scale - 1) * rampOut };
  }
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, scale: 1 + (marker.scale - 1) * eased };
}

export function getActiveTranslation(markers: TranslationMarker[], time: number, part?: Part) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((item) => time >= item.start && time <= item.start + item.duration);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const targetPosition = getTranslationMarkerPosition(marker, time, part);
  const previousPosition = previousMarker ? getTranslationMarkerPosition(previousMarker, time, part) : null;
  const middleTransitionFrom = marker.middleTransition === "transition" && marker.snapIn && previousMarker?.snapOut && roundTenth(previousMarker.start + previousMarker.duration) === roundTenth(marker.start)
    ? previousPosition
    : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(clamp(progress / 0.22, 0, 1), marker.middleEase);
    const position = {
      x: Math.round(interpolate([middleTransitionFrom.x, targetPosition.x] as const, easedIn)),
      y: Math.round(interpolate([middleTransitionFrom.y, targetPosition.y] as const, easedIn)),
    };
    if (marker.snapOut) return { ...marker, position };
    const rampOut = cameraEaseProgress(clamp((1 - progress) / 0.22, 0, 1), marker.ease);
    return { ...marker, position: { x: Math.round(position.x * rampOut), y: Math.round(position.y * rampOut) } };
  }
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, position: { x: Math.round(targetPosition.x * eased), y: Math.round(targetPosition.y * eased) } };
}

function getTranslationMarkerPosition(marker: TranslationMarker, time: number, part: Part | undefined): Point {
  if (!marker.followId || !part) return marker.position;
  const object = findFollowObject(part, marker.followId);
  if (!object) return marker.position;
  const motion = getMotionTranslation(object.motion, time);
  return framePointToCameraTranslation({
    x: object.bounds.x + object.bounds.width / 2 + motion.x,
    y: object.bounds.y + object.bounds.height / 2 + motion.y,
  });
}

function findFollowObject(part: Part, id: string): FrameObject | undefined {
  return part.objects.find((object) => object.id === id) ?? part.background.elements.find((object) => object.id === id);
}

function interpolate(range: readonly [number, number], progress: number) {
  return range[0] + (range[1] - range[0]) * progress;
}

function cameraEaseProgress(value: number, ease: MotionEase | undefined) {
  return easeProgress(value, ease ?? "easeInOut");
}

function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(value);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return easeInOutCubic(value);
  return value;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
