import { roundTenth } from "./math";
import { getMotionBlockEffectKind } from "./motionEffects";
import { getMotionTranslation } from "./renderRuntime";
import { FRAME_HEIGHT, FRAME_WIDTH, type Bounds, type FrameObject, type MotionEase, type Part, type PerspectiveSettings, type Point, type TimelineMotionLayerState, type TranslationMarker, type ZoomMarker } from "./types";

export const CAMERA_PERSPECTIVE = 1800;

export type CameraPreviewTransform = { x: number; y: number; z: number; scale: number; rotation: number; rotateX: number; rotateY: number; perspective: number };

export function formatCameraPreviewTransform(transform: CameraPreviewTransform) {
  const coverScale = getPerspectiveCoverScale(transform);
  return `translate3d(${transform.x}px, ${transform.y}px, ${transform.z}px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) rotate(${transform.rotation}deg) scale(${transform.scale * coverScale})`;
}

function getPerspectiveCoverScale(transform: CameraPreviewTransform) {
  const tilt = Math.max(Math.abs(transform.rotateX), Math.abs(transform.rotateY));
  if (tilt <= 0) return 1;
  const radians = Math.min(tilt, 72) * Math.PI / 180;
  return Math.min(2.4, 1 / Math.max(Math.cos(radians), 0.42));
}

export function getCameraPreviewTransform(activeZoom: ZoomMarker | null, activeTranslation: TranslationMarker | null, activeRotation: TranslationMarker | null = null): CameraPreviewTransform {
  const scale = activeZoom?.scale ?? 1;
  const focus = activeZoom?.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
  return {
    x: (FRAME_WIDTH / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0),
    y: (FRAME_HEIGHT / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0),
    z: 0,
    scale,
    rotation: activeRotation?.rotation ?? 0,
    rotateX: 0,
    rotateY: 0,
    perspective: CAMERA_PERSPECTIVE,
  };
}

export function getLayeredCameraPreviewTransform(part: Part, layers: TimelineMotionLayerState[], time: number, options: { hiddenLayerIds?: Set<string>; pickingTranslationPosition?: boolean; pickingZoomFocus?: boolean; resetMotionEffects?: boolean } = {}): CameraPreviewTransform {
  const transform: CameraPreviewTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: CAMERA_PERSPECTIVE };
  if (options.resetMotionEffects) return transform;

  for (const layer of layers) {
    if (options.hiddenLayerIds?.has(layer.id) || layer.kind === "empty") continue;

    if (!options.pickingZoomFocus) {
      const activeZoom = getActiveZoom(part.zoomMarkers.filter((marker) => isMarkerOnMotionLayer(marker, layer)), time);
      if (activeZoom) {
        const zoomTransform = getCameraPreviewTransform(activeZoom, null, null);
        transform.x += zoomTransform.x;
        transform.y += zoomTransform.y;
        transform.scale *= zoomTransform.scale;
      }
    }

    const markers = part.translationMarkers.filter((marker) => isMarkerOnMotionLayer(marker, layer));
    if (options.pickingTranslationPosition) continue;

    const activeTranslation = getActiveTranslation(markers, time, part);
    transform.x += activeTranslation?.position.x ?? 0;
    transform.y += activeTranslation?.position.y ?? 0;

    const activeRotation = getActiveRotation(markers, time);
    transform.rotation += activeRotation?.rotation ?? 0;

    const activePerspective = getActivePerspective(markers, time);
    transform.z += activePerspective.z;
    transform.rotateX += activePerspective.rotateX;
    transform.rotateY += activePerspective.rotateY;
  }

  return transform;
}

export function isMarkerOnMotionLayer(marker: ZoomMarker | TranslationMarker, layer: TimelineMotionLayerState) {
  if (marker.layerId) return marker.layerId === layer.id;
  const effectKind = getMotionBlockEffectKind(marker) ?? ("scale" in marker ? "zoom" : marker.kind ?? "pan");
  if (layer.id === "clipper.motion.zoom" || layer.id === "motion_zoom") return effectKind === "zoom";
  if (layer.id === "clipper.motion.pan" || layer.id === "motion_pan") return effectKind === "pan";
  if (layer.id === "clipper.motion.rotate" || layer.id === "motion_rotate") return effectKind === "rotate";
  if (layer.id === "clipper.motion.perspective" || layer.id === "motion_perspective") return effectKind === "perspective";
  return false;
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
  return getActiveTranslationMarker(markers.filter((marker) => getMotionBlockEffectKind(marker) === "pan"), time, part);
}

export function getActiveRotation(markers: TranslationMarker[], time: number) {
  return getActiveTranslationMarker(markers.filter((marker) => getMotionBlockEffectKind(marker) === "rotate"), time);
}

export function getActivePerspective(markers: TranslationMarker[], time: number): Required<PerspectiveSettings> {
  const active = getActiveTranslationMarker(markers.filter((marker) => getMotionBlockEffectKind(marker) === "perspective"), time);
  const settings = active?.perspective;
  return {
    z: settings?.z ?? 0,
    rotateX: settings?.rotateX ?? 0,
    rotateY: settings?.rotateY ?? 0,
  };
}

function getActiveTranslationMarker(markers: TranslationMarker[], time: number, part?: Part) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = getActiveTranslationMarkerIndex(sortedMarkers, time);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const targetPosition = getTranslationMarkerPosition(marker, time, part);
  const previousPosition = previousMarker?.position ?? null;
  const middleTransitionFrom = marker.middleTransition === "transition" && marker.snapIn && previousMarker?.snapOut && roundTenth(previousMarker.start + previousMarker.duration) === roundTenth(marker.start)
    ? previousPosition
    : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(clamp(progress / 0.22, 0, 1), marker.middleEase);
    const position = {
      x: Math.round(interpolate([middleTransitionFrom.x, targetPosition.x] as const, easedIn)),
      y: Math.round(interpolate([middleTransitionFrom.y, targetPosition.y] as const, easedIn)),
    };
    const rotation = interpolateRotation(previousMarker, marker, easedIn);
    const perspective = interpolatePerspective(previousMarker, marker, easedIn);
    if (marker.snapOut) return { ...marker, position, rotation, perspective };
    const rampOut = cameraEaseProgress(clamp((1 - progress) / 0.22, 0, 1), marker.ease);
    return { ...marker, position: scalePoint(position, rampOut), rotation: rotation * rampOut, perspective: scalePerspective(perspective, rampOut) };
  }
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, position: scalePoint(targetPosition, eased), rotation: (marker.rotation ?? 0) * eased, perspective: scalePerspective(marker.perspective, eased) };
}

function scalePoint(point: Point, scale: number): Point {
  return {
    x: Math.round(point.x * scale),
    y: Math.round(point.y * scale),
  };
}

function interpolatePerspective(previousMarker: TranslationMarker | undefined, marker: TranslationMarker, progress: number): PerspectiveSettings | undefined {
  if (!previousMarker?.perspective && !marker.perspective) return undefined;
  return {
    z: interpolate([previousMarker?.perspective?.z ?? 0, marker.perspective?.z ?? 0] as const, progress),
    rotateX: interpolate([previousMarker?.perspective?.rotateX ?? 0, marker.perspective?.rotateX ?? 0] as const, progress),
    rotateY: interpolate([previousMarker?.perspective?.rotateY ?? 0, marker.perspective?.rotateY ?? 0] as const, progress),
  };
}

function scalePerspective(perspective: PerspectiveSettings | undefined, scale: number): PerspectiveSettings | undefined {
  if (!perspective) return undefined;
  return {
    z: (perspective.z ?? 0) * scale,
    rotateX: (perspective.rotateX ?? 0) * scale,
    rotateY: (perspective.rotateY ?? 0) * scale,
  };
}

function getActiveTranslationMarkerIndex(sortedMarkers: TranslationMarker[], time: number) {
  const activeIndex = sortedMarkers.findIndex((item) => time >= item.start && time <= item.start + item.duration);
  if (activeIndex < 0) return -1;

  const boundaryIndex = sortedMarkers.findIndex((item, index) => {
    const previous = sortedMarkers[index - 1];
    if (!previous?.snapOut || !item.snapIn) return false;
    return roundTenth(time) === roundTenth(item.start) && roundTenth(previous.start + previous.duration) === roundTenth(item.start);
  });

  return boundaryIndex >= 0 ? boundaryIndex : activeIndex;
}

function interpolateRotation(previousMarker: TranslationMarker | undefined, marker: TranslationMarker, progress: number) {
  return interpolate([previousMarker?.rotation ?? 0, marker.rotation ?? 0] as const, progress);
}

function getTranslationMarkerPosition(marker: TranslationMarker, time: number, part: Part | undefined): Point {
  if (!marker.followId || !part) return marker.position;
  const object = findFollowObject(part, marker.followId);
  if (!object) return marker.position;
  const motion = getMotionTranslation(object.motion, time);
  const position = framePointToCameraTranslation({
    x: object.bounds.x + object.bounds.width / 2 + motion.x,
    y: object.bounds.y + object.bounds.height / 2 + motion.y,
  });
  return position;
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
