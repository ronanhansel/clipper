import { roundTenth } from "./math";
import {
  getMotionBlockEffectKind,
  getMotionMarkerViews,
} from "./motionEffects";
import { getLayerAnimationsTranslation } from "./animations";
import { isExplicitTimelineMarkerMend } from "./timeline";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type Bounds,
  type FrameObject,
  type MotionEase,
  type MotionMarker,
  type Part,
  type PerspectiveSettings,
  type Point,
  type TimelineMotionLayerState,
} from "./types";

export const CAMERA_PERSPECTIVE = 1800;

export type CameraPreviewTransform = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  rotateX: number;
  rotateY: number;
  perspective: number;
  motionBlur: number;
};

export function formatCameraPreviewTransform(
  transform: CameraPreviewTransform,
) {
  const coverScale = getPerspectiveCoverScale(transform);
  return `translate3d(${transform.x}px, ${transform.y}px, ${transform.z}px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) rotate(${transform.rotation}deg) scale(${transform.scale * coverScale})`;
}

export function formatCameraPreviewFilter(transform: CameraPreviewTransform) {
  if (transform.motionBlur <= 0) return undefined;
  return `blur(${transform.motionBlur}px)`;
}

function getPerspectiveCoverScale(transform: CameraPreviewTransform) {
  const tilt = Math.max(
    Math.abs(transform.rotateX),
    Math.abs(transform.rotateY),
  );
  if (tilt <= 0) return 1;
  const radians = (Math.min(tilt, 72) * Math.PI) / 180;
  return Math.min(2.4, 1 / Math.max(Math.cos(radians), 0.42));
}

export function getCameraPreviewTransformFromMarkers(activeMarkers: {
  zoom: MotionMarker | null;
  translation: MotionMarker | null;
  rotation: MotionMarker | null;
  perspective: { z: number; rotateX: number; rotateY: number };
}): CameraPreviewTransform {
  const scale = activeMarkers.zoom?.scale ?? 1;
  const focus = activeMarkers.zoom?.focus ?? {
    x: FRAME_WIDTH / 2,
    y: FRAME_HEIGHT / 2,
  };
  return {
    x:
      (FRAME_WIDTH / 2 - focus.x) * (scale - 1) +
      (activeMarkers.translation?.position?.x ?? 0),
    y:
      (FRAME_HEIGHT / 2 - focus.y) * (scale - 1) +
      (activeMarkers.translation?.position?.y ?? 0),
    z: activeMarkers.perspective.z,
    scale,
    rotation: activeMarkers.rotation?.rotation ?? 0,
    rotateX: activeMarkers.perspective.rotateX,
    rotateY: activeMarkers.perspective.rotateY,
    perspective: CAMERA_PERSPECTIVE,
    motionBlur: 0,
  };
}

export function getLayeredCameraPreviewTransform(
  part: Part,
  layers: TimelineMotionLayerState[],
  time: number,
  options: {
    hiddenLayerIds?: Set<string>;
    pickingTranslationPosition?: boolean;
    pickingZoomFocus?: boolean;
    resetMotionEffects?: boolean;
  } = {},
): CameraPreviewTransform {
  const transform: CameraPreviewTransform = {
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    rotation: 0,
    rotateX: 0,
    rotateY: 0,
    perspective: CAMERA_PERSPECTIVE,
    motionBlur: 0,
  };
  if (options.resetMotionEffects) return transform;
  const partMotion = getPartMotionMarkers(part);

  for (const layer of layers) {
    if (options.hiddenLayerIds?.has(layer.id) || layer.kind === "empty")
      continue;
    const layerMarkers = partMotion.motionMarkers.filter((marker) =>
      isMarkerOnMotionLayer(marker, layer),
    );

    if (!options.pickingZoomFocus) {
      const activeZoom = getActiveMarkerByKind(layerMarkers, "zoom", time);
      if (activeZoom) {
        const scale = activeZoom.scale ?? 1;
        const focus = activeZoom.focus ?? {
          x: FRAME_WIDTH / 2,
          y: FRAME_HEIGHT / 2,
        };
        transform.x += (FRAME_WIDTH / 2 - focus.x) * (scale - 1);
        transform.y += (FRAME_HEIGHT / 2 - focus.y) * (scale - 1);
        transform.scale *= scale;
      }
    }

    if (options.pickingTranslationPosition) continue;

    const activePan = getActiveMarkerByKind(layerMarkers, "pan", time, part);
    if (activePan) {
      transform.x += activePan.position?.x ?? 0;
      transform.y += activePan.position?.y ?? 0;
      transform.motionBlur = Math.max(
        transform.motionBlur,
        activePan.motionBlur,
      );
    }

    const activeRotation = getActiveMarkerByKind(layerMarkers, "rotate", time);
    if (activeRotation) {
      transform.rotation += activeRotation.rotation ?? 0;
    }

    const activePerspective = getActivePerspectiveMarkers(layerMarkers, time);
    transform.z += activePerspective.z;
    transform.rotateX += activePerspective.rotateX;
    transform.rotateY += activePerspective.rotateY;
  }

  return transform;
}

function getPartMotionMarkers(part: Part) {
  return getMotionMarkerViews(part);
}

export function isMarkerOnMotionLayer(
  marker: MotionMarker,
  layer: TimelineMotionLayerState,
) {
  if (marker.layerId) return marker.layerId === layer.id;
  const effectKind = marker.kind ?? "pan";
  if (layer.id === "clipper.motion.zoom" || layer.id === "motion_zoom")
    return effectKind === "zoom";
  if (layer.id === "clipper.motion.pan" || layer.id === "motion_pan")
    return effectKind === "pan";
  if (layer.id === "clipper.motion.rotate" || layer.id === "motion_rotate")
    return effectKind === "rotate";
  if (
    layer.id === "clipper.motion.perspective" ||
    layer.id === "motion_perspective"
  )
    return effectKind === "perspective";
  return false;
}

export function boundsToViewport(
  bounds: Bounds,
  cameraTransform: CameraPreviewTransform,
  frameScale: number,
): Bounds {
  const x =
    FRAME_WIDTH / 2 +
    cameraTransform.x +
    (bounds.x - FRAME_WIDTH / 2) * cameraTransform.scale;
  const y =
    FRAME_HEIGHT / 2 +
    cameraTransform.y +
    (bounds.y - FRAME_HEIGHT / 2) * cameraTransform.scale;
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

export function getActiveMarkerByKind(
  markers: MotionMarker[],
  kind: MotionMarker["kind"],
  time: number,
  part?: Part,
): (MotionMarker & { motionBlur: number }) | null {
  if (kind === "zoom")
    return getActiveZoom(markers, time) as
      | (MotionMarker & { motionBlur: number })
      | null;
  return getActiveMotionMarker(markers, time, part);
}

export function getActivePerspectiveMarkers(
  markers: MotionMarker[],
  time: number,
): Required<PerspectiveSettings> {
  const active = getActiveMotionMarker(
    markers.filter(
      (marker) => getMotionBlockEffectKind(marker) === "perspective",
    ),
    time,
  );
  const settings = active?.perspective;
  return {
    z: settings?.z ?? 0,
    rotateX: settings?.rotateX ?? 0,
    rotateY: settings?.rotateY ?? 0,
  };
}

export const defaultMotionBlurConfig = {
  strength: 1,
  maxBlur: 24,
  window: 0.22,
} as const;

export function getMotionBlurConfig(marker: MotionMarker | undefined): {
  enabled: boolean;
  strength: number;
  maxBlur: number;
  window: number;
} {
  const params = marker?.params as Record<string, unknown> | undefined;
  const mendVisual = params?.mendVisual;
  if (mendVisual !== "motionBlur")
    return { enabled: false, ...defaultMotionBlurConfig };
  return {
    enabled: true,
    strength: Number(
      params?.motionBlurStrength ?? defaultMotionBlurConfig.strength,
    ),
    maxBlur: Number(params?.motionBlurMax ?? defaultMotionBlurConfig.maxBlur),
    window: Number(params?.motionBlurWindow ?? defaultMotionBlurConfig.window),
  };
}

function computeMotionBlur(
  panDistance: number,
  progress: number,
  blurConfig: ReturnType<typeof getMotionBlurConfig>,
): number {
  if (!blurConfig.enabled || panDistance <= 0) return 0;
  const phase = clamp(progress / blurConfig.window, 0, 1);
  const bell = Math.sin(phase * Math.PI);
  const divisor = blurConfig.strength > 0 ? 16 / blurConfig.strength : Infinity;
  return Math.min((panDistance / divisor) * bell, blurConfig.maxBlur);
}

function getActiveZoom(markers: MotionMarker[], time: number) {
  const sortedMarkers = [...markers].sort(
    (left, right) => left.start - right.start,
  );
  const markerIndex = sortedMarkers.findIndex(
    (item) => time >= item.start && time <= item.start + item.duration,
  );
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const mendedToPrevious = Boolean(
    previousMarker && isExplicitTimelineMarkerMend(previousMarker, marker),
  );
  const middleTransitionFrom =
    marker.middleTransition === "transition" && mendedToPrevious
      ? previousMarker
      : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(
      clamp(progress / 0.22, 0, 1),
      marker.middleEase,
    );
    const scale = interpolate(
      [middleTransitionFrom.scale ?? 1, marker.scale ?? 1] as const,
      easedIn,
    );
    const focus = {
      x: Math.round(
        interpolate(
          [
            middleTransitionFrom.focus?.x ?? FRAME_WIDTH / 2,
            marker.focus?.x ?? FRAME_WIDTH / 2,
          ] as const,
          easedIn,
        ),
      ),
      y: Math.round(
        interpolate(
          [
            middleTransitionFrom.focus?.y ?? FRAME_HEIGHT / 2,
            marker.focus?.y ?? FRAME_HEIGHT / 2,
          ] as const,
          easedIn,
        ),
      ),
    };
    if (marker.snapOut || isMendedToNext(sortedMarkers, markerIndex))
      return { ...marker, focus, scale };
    const rampOut = cameraEaseProgress(
      clamp((1 - progress) / 0.22, 0, 1),
      marker.ease,
    );
    return { ...marker, focus, scale: 1 + (scale - 1) * rampOut };
  }
  const rampIn = marker.snapIn || mendedToPrevious ? 1 : progress / 0.22;
  const rampOut =
    marker.snapOut || isMendedToNext(sortedMarkers, markerIndex)
      ? 1
      : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, scale: 1 + ((marker.scale ?? 1) - 1) * eased };
}

function getActiveMotionMarker(
  markers: MotionMarker[],
  time: number,
  part?: Part,
): (MotionMarker & { motionBlur: number }) | null {
  const sortedMarkers = [...markers].sort(
    (left, right) => left.start - right.start,
  );
  const markerIndex = getActiveMotionMarkerIndex(sortedMarkers, time);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const targetPosition = getMotionMarkerPosition(marker, time, part);
  const previousPosition = previousMarker?.position ?? null;
  const mendedToPrevious = Boolean(
    previousMarker && isExplicitTimelineMarkerMend(previousMarker, marker),
  );
  const middleTransitionFrom =
    marker.middleTransition === "transition" && mendedToPrevious
      ? previousPosition
      : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(
      clamp(progress / 0.22, 0, 1),
      marker.middleEase,
    );
    const position = {
      x: Math.round(
        interpolate(
          [middleTransitionFrom.x, targetPosition.x] as const,
          easedIn,
        ),
      ),
      y: Math.round(
        interpolate(
          [middleTransitionFrom.y, targetPosition.y] as const,
          easedIn,
        ),
      ),
    };
    const rotation = interpolateRotation(previousMarker, marker, easedIn);
    const perspective = interpolatePerspective(previousMarker, marker, easedIn);
    const panDistance = Math.sqrt(
      (targetPosition.x - middleTransitionFrom.x) ** 2 +
        (targetPosition.y - middleTransitionFrom.y) ** 2,
    );
    const blurConfig = getMotionBlurConfig(marker);
    const motionBlur =
      marker.kind === "pan"
        ? computeMotionBlur(panDistance, progress, blurConfig)
        : 0;
    if (marker.snapOut || isMendedToNext(sortedMarkers, markerIndex))
      return { ...marker, position, rotation, perspective, motionBlur };
    const rampOut = cameraEaseProgress(
      clamp((1 - progress) / 0.22, 0, 1),
      marker.ease,
    );
    return {
      ...marker,
      position: scalePoint(position, rampOut),
      rotation: rotation * rampOut,
      perspective: scalePerspective(perspective, rampOut),
      motionBlur: motionBlur * rampOut,
    };
  }
  const rampIn = marker.snapIn || mendedToPrevious ? 1 : progress / 0.22;
  const rampOut =
    marker.snapOut || isMendedToNext(sortedMarkers, markerIndex)
      ? 1
      : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return {
    ...marker,
    position: scalePoint(targetPosition, eased),
    rotation: (marker.rotation ?? 0) * eased,
    perspective: scalePerspective(marker.perspective, eased),
    motionBlur: 0,
  };
}

function scalePoint(point: Point, scale: number): Point {
  return {
    x: Math.round(point.x * scale),
    y: Math.round(point.y * scale),
  };
}

function interpolatePerspective(
  previousMarker: MotionMarker | undefined,
  marker: MotionMarker,
  progress: number,
): PerspectiveSettings | undefined {
  if (!previousMarker?.perspective && !marker.perspective) return undefined;
  return {
    z: interpolate(
      [
        previousMarker?.perspective?.z ?? 0,
        marker.perspective?.z ?? 0,
      ] as const,
      progress,
    ),
    rotateX: interpolate(
      [
        previousMarker?.perspective?.rotateX ?? 0,
        marker.perspective?.rotateX ?? 0,
      ] as const,
      progress,
    ),
    rotateY: interpolate(
      [
        previousMarker?.perspective?.rotateY ?? 0,
        marker.perspective?.rotateY ?? 0,
      ] as const,
      progress,
    ),
  };
}

function scalePerspective(
  perspective: PerspectiveSettings | undefined,
  scale: number,
): PerspectiveSettings | undefined {
  if (!perspective) return undefined;
  return {
    z: (perspective.z ?? 0) * scale,
    rotateX: (perspective.rotateX ?? 0) * scale,
    rotateY: (perspective.rotateY ?? 0) * scale,
  };
}

function getActiveMotionMarkerIndex(
  sortedMarkers: MotionMarker[],
  time: number,
) {
  const activeIndex = sortedMarkers.findIndex(
    (item) => time >= item.start && time <= item.start + item.duration,
  );
  if (activeIndex < 0) return -1;

  const boundaryIndex = sortedMarkers.findIndex((item, index) => {
    const previous = sortedMarkers[index - 1];
    if (!previous || !isExplicitTimelineMarkerMend(previous, item))
      return false;
    return Math.abs(time - item.start) <= 0.001;
  });

  return boundaryIndex >= 0 ? boundaryIndex : activeIndex;
}

function isMendedToNext(markers: MotionMarker[], markerIndex: number) {
  const marker = markers[markerIndex];
  const nextMarker = markers[markerIndex + 1];
  return Boolean(
    marker && nextMarker && isExplicitTimelineMarkerMend(marker, nextMarker),
  );
}

function interpolateRotation(
  previousMarker: MotionMarker | undefined,
  marker: MotionMarker,
  progress: number,
) {
  return interpolate(
    [previousMarker?.rotation ?? 0, marker.rotation ?? 0] as const,
    progress,
  );
}

function getMotionMarkerPosition(
  marker: MotionMarker,
  time: number,
  part: Part | undefined,
): Point {
  if (!marker.followId || !part) return marker.position ?? { x: 0, y: 0 };
  const object = findFollowObject(part, marker.followId);
  if (!object) return marker.position ?? { x: 0, y: 0 };
  const motion = getLayerAnimationsTranslation(object.animations, time);
  const position = framePointToCameraTranslation({
    x: object.bounds.x + object.bounds.width / 2 + motion.x,
    y: object.bounds.y + object.bounds.height / 2 + motion.y,
  });
  return position;
}

function findFollowObject(part: Part, id: string): FrameObject | undefined {
  return (
    part.objects.find((object) => object.id === id) ??
    part.background.elements.find((object) => object.id === id)
  );
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
  if (ease === "backOut") return backOut(value);
  return value;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function backOut(value: number) {
  return (
    1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
