import {
  getTimelineDragDeltaSeconds,
  getTimelineBlockTiming,
  type TimelineBlockTimingAction,
} from "../../core/timelineBlockTiming";
import type {
  AnimationTrack,
  AnimationTrackProperty,
  FrameObject,
  KeyframePoint,
  LayerAnimation,
  MotionEase,
  MotionMarker,
  Part,
} from "../../core/types";
import type { TimelinePartMotionView } from "./timelineTypes";

export type ComposeAnimationAttributeKey = AnimationTrackProperty;

export type ComposeAnimationKeyframePoint = {
  animationId: string;
  pointId: string;
  time: number;
  value: number | string;
  easingToNext?: MotionEase | readonly [number, number, number, number];
};

export type ComposeAnimationAttributeTrack = {
  id: string;
  key: ComposeAnimationAttributeKey;
  label: string;
  keyframes: ComposeAnimationKeyframePoint[];
};

export type ComposeAnimationKeyframeSelection = {
  animationId: string;
  pointId?: string;
  key: ComposeAnimationAttributeKey;
  time: number;
};

type VisibleKeyframePoint = {
  pointId?: string;
  time: number;
  value: number | string;
  easingToNext?: MotionEase | readonly [number, number, number, number];
  hold?: boolean;
};

export type ComposeAnimationTimelineRow =
  | {
      id: string;
      kind: "layer";
      layer: ComposeAnimationTimelineLayer;
    }
  | {
      id: string;
      kind: "attribute";
      layer: ComposeAnimationTimelineLayer;
      track: ComposeAnimationAttributeTrack;
    }
  | {
      id: string;
      kind: "ease";
      layer: ComposeAnimationTimelineLayer;
      track: ComposeAnimationAttributeTrack;
    };

export type ComposeAnimationPresetTrack = {
  property: ComposeAnimationAttributeKey;
  valueType?: AnimationTrack["valueType"];
  points: readonly {
    time: number;
    value: number | string;
    easingToNext?: MotionEase | readonly [number, number, number, number];
    hold?: boolean;
  }[];
};

export type ComposeAnimationPreset = {
  id: string;
  label: string;
  duration: number;
  tracks: readonly ComposeAnimationPresetTrack[];
};

export type ComposeAnimationTimelineLayer = {
  id: string;
  name: string;
  number: number;
  kind: "object" | "background-object" | "background";
  object?: FrameObject;
  animations?: LayerAnimation[];
};

export const composeAnimationPresets = [
  {
    id: "fade-in",
    label: "Fade in",
    duration: 0.8,
    tracks: [trackPreset("opacity", 0.8, [0, 1])],
  },
  {
    id: "slide-up",
    label: "Slide up",
    duration: 1,
    tracks: [trackPreset("y", 1, [42, 0]), trackPreset("opacity", 1, [0, 1])],
  },
  {
    id: "pop-scale",
    label: "Pop",
    duration: 0.9,
    tracks: [
      trackPreset("scale", 0.9, [0.86, 1.08, 1]),
      trackPreset("opacity", 0.9, [0, 1]),
    ],
  },
  {
    id: "spin-settle",
    label: "Spin",
    duration: 1.2,
    tracks: [
      trackPreset("rotate", 1.2, [-12, 4, 0]),
      trackPreset("opacity", 1.2, [0, 1]),
    ],
  },
  {
    id: "blur-reveal",
    label: "Blur reveal",
    duration: 1,
    tracks: [
      trackPreset("blur", 1, [18, 0]),
      trackPreset("opacity", 1, [0, 1]),
    ],
  },
] satisfies ComposeAnimationPreset[];

function trackPreset(
  property: ComposeAnimationAttributeKey,
  duration: number,
  values: readonly (number | string)[],
): ComposeAnimationPresetTrack {
  const lastIndex = Math.max(values.length - 1, 1);
  return {
    property,
    valueType: getAnimationTrackValueType(property),
    points: values.map((value, index) => ({
      time: (duration * index) / lastIndex,
      value,
    })),
  };
}

export type ComposeAnimationTimingDrag = {
  action: TimelineBlockTimingAction;
  initialClientX: number;
  initialScrollLeft: number;
  initialDelay: number;
  initialDuration: number;
  layer: ComposeAnimationTimelineLayer;
  partId: string;
  markerId: string;
  animationId?: string;
  pointerId: number;
  snapBoundaries: number[];
  snapThresholdSeconds: number;
};

export function buildComposeAnimationTimelineLayers(
  part: Part,
): ComposeAnimationTimelineLayer[] {
  const objects = [
    ...[...part.objects].reverse().map((object) => ({
      id: object.id,
      name: object.name || object.id,
      kind: "object" as const,
      animations: object.animations,
      object,
    })),
    ...[...part.background.elements].reverse().map((object) => ({
      id: object.id,
      name: object.name || object.id,
      kind: "background-object" as const,
      animations: object.animations,
      object,
    })),
  ].map((layer, index) => ({ ...layer, number: index + 1 }));

  return [
    ...objects,
    {
      id: part.background.id,
      name: part.background.name || "Background",
      number: objects.length + 1,
      kind: "background" as const,
      animations: part.background.animations,
    },
  ];
}

export function getComposeParentOptions(
  layers: ComposeAnimationTimelineLayer[],
  childLayerId: string,
) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  return layers.filter((layer) => {
    if (!layer.object || layer.id === childLayerId) return false;
    let parentId = layer.object.parentId;
    while (parentId) {
      if (parentId === childLayerId) return false;
      parentId = byId.get(parentId)?.object?.parentId;
    }
    return true;
  });
}

const composeAnimationAttributeLabels: Record<
  ComposeAnimationAttributeKey,
  string
> = {
  opacity: "Opacity",
  x: "Position X",
  y: "Position Y",
  width: "Width",
  height: "Height",
  z: "Position Z",
  scale: "Scale",
  scaleX: "Scale X",
  scaleY: "Scale Y",
  rotate: "Rotation",
  rotateX: "Rotation X",
  rotateY: "Rotation Y",
  rotateZ: "Rotation Z",
  skewX: "Skew X",
  skewY: "Skew Y",
  transformPerspective: "Perspective",
  blur: "Blur",
  backgroundColor: "Background",
  color: "Color",
  pathOffset: "Path offset",
  pathLength: "Path length",
  pathSpacing: "Path spacing",
};

const composeAnimationAttributeOrder = Object.keys(
  composeAnimationAttributeLabels,
) as ComposeAnimationAttributeKey[];

export function getComposeAnimationAttributeTracks(
  layer: ComposeAnimationTimelineLayer,
): ComposeAnimationAttributeTrack[] {
  const tracks = new Map<
    ComposeAnimationAttributeKey,
    ComposeAnimationKeyframePoint[]
  >();

  for (const animation of layer.animations ?? []) {
    if (animation.enabled === false) continue;
    // Runtime guard: projects saved before the canonical `tracks` rewrite may still
    // contain legacy animation objects. Skip them instead of crashing the timeline.
    if (!Array.isArray((animation as { tracks?: unknown }).tracks)) continue;
    for (const track of animation.tracks) {
      const points = tracks.get(track.property) ?? [];
      for (const point of track.points) {
        points.push({
          animationId: animation.id,
          pointId: point.id,
          time: point.time,
          value: point.value,
          easingToNext: point.easingToNext,
        });
      }
      tracks.set(track.property, points);
    }
  }

  return composeAnimationAttributeOrder.flatMap((key) => {
    const keyframes = tracks.get(key);
    if (!keyframes?.length) return [];
    return {
      id: key,
      key,
      label: composeAnimationAttributeLabels[key],
      keyframes: keyframes.sort((left, right) => left.time - right.time),
    };
  });
}

export function getComposeAnimationLayerKeyframes(
  layer: ComposeAnimationTimelineLayer,
) {
  const byTime = new Map<number, ComposeAnimationKeyframePoint>();
  for (const track of getComposeAnimationAttributeTracks(layer)) {
    for (const keyframe of track.keyframes) {
      byTime.set(roundTimelineKeyframeTime(keyframe.time), keyframe);
    }
  }
  return Array.from(byTime.values()).sort(
    (left, right) => left.time - right.time,
  );
}

const KEYFRAME_PROXIMITY_SECONDS = 0.016;

export function getComposeAnimationAttributeKeyframeAtTime(
  track: ComposeAnimationAttributeTrack,
  currentTime: number,
) {
  const roundedTime = roundTimelineKeyframeTime(currentTime);
  const exact = track.keyframes.find(
    (keyframe) => roundTimelineKeyframeTime(keyframe.time) === roundedTime,
  );
  if (exact) return exact;
  let nearest: (typeof track.keyframes)[0] | null = null;
  let nearestDist = KEYFRAME_PROXIMITY_SECONDS;
  for (const keyframe of track.keyframes) {
    const dist = Math.abs(keyframe.time - currentTime);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = keyframe;
    }
  }
  return nearest;
}

export function buildComposeAnimationTimelineRows(
  layers: ComposeAnimationTimelineLayer[],
  expandedLayerIds: ReadonlySet<string>,
  expandedEaseTrackIds: ReadonlySet<string>,
): ComposeAnimationTimelineRow[] {
  return layers.flatMap((layer) => {
    const layerRow: ComposeAnimationTimelineRow = {
      id: layer.id,
      kind: "layer",
      layer,
    };
    if (!expandedLayerIds.has(layer.id)) return [layerRow];
    return [
      layerRow,
      ...getComposeAnimationAttributeTracks(layer).flatMap(
        (track): ComposeAnimationTimelineRow[] => {
          const attributeId = `${layer.id}:attribute:${track.id}`;
          const rows: ComposeAnimationTimelineRow[] = [
            { id: attributeId, kind: "attribute", layer, track },
          ];
          if (expandedEaseTrackIds.has(attributeId)) {
            rows.push({
              id: `${layer.id}:ease:${track.id}`,
              kind: "ease",
              layer,
              track,
            });
          }
          return rows;
        },
      ),
    ];
  });
}

export function updateComposeAnimationEase(
  animations: LayerAnimation[],
  animationId: string,
  ease: MotionEase | readonly [number, number, number, number],
  pointId?: string,
): LayerAnimation[] {
  return animations.map((animation) => {
    if (animation.id !== animationId || !Array.isArray(animation.tracks))
      return animation;
    return {
      ...animation,
      tracks: animation.tracks.map((track) => ({
        ...track,
        points: track.points.map((point, index) => {
          const isTarget = pointId
            ? point.id === pointId
            : index < track.points.length - 1;
          return isTarget ? { ...point, easingToNext: ease } : point;
        }),
      })),
      options: { ...animation.options, ease },
    };
  });
}

function roundTimelineKeyframeTime(time: number) {
  return Math.round(time * 1000) / 1000;
}

export function buildComposeAnimationMotionTimelinePart(
  part: Part,
  layers: ComposeAnimationTimelineLayer[],
  timelineDuration: number,
): TimelinePartMotionView {
  const motionMarkers: MotionMarker[] = layers.flatMap((layer) => {
    return (layer.animations ?? [])
      .filter((animation) => Array.isArray(animation.tracks))
      .map(
        (animation): MotionMarker => ({
          id: `${layer.id}/anim/${animation.id}`,
          name: animation.name || "Animation",
          layerId: layer.id,
          effectId: "clipper.motion.pan",
          kind: "pan",
          start: getAnimationStart(animation),
          duration: getAnimationDuration(animation),
          position: { x: 0, y: 0 },
          scale: 1,
          focus: { x: 0.5, y: 0.5 },
        }),
      );
  });

  return {
    ...part,
    start: 0,
    end: timelineDuration,
    duration: timelineDuration,
    motionMarkers,
  };
}

export function getComposeAnimationSnapBoundaries(
  layers: ComposeAnimationTimelineLayer[],
  timelineDuration: number,
) {
  return Array.from(
    new Set([
      0,
      timelineDuration,
      ...layers.flatMap((layer) =>
        (layer.animations ?? [])
          .filter((animation) => Array.isArray(animation.tracks))
          .flatMap((animation) => [
            getAnimationStart(animation),
            getAnimationEnd(animation),
          ]),
      ),
    ]),
  ).sort((left, right) => left - right);
}

export function getComposeAnimationTimingDelta(
  drag: ComposeAnimationTimingDrag,
  clientX: number,
  scrollLeft: number,
  contentWidth: number,
  timelineDuration: number,
) {
  return getTimelineDragDeltaSeconds({
    initialClientX: drag.initialClientX,
    clientX,
    initialScrollLeft: drag.initialScrollLeft,
    scrollLeft,
    pixelsPerSecond:
      Math.max(contentWidth, 1) / Math.max(timelineDuration, 0.0001),
  });
}

export function getNextComposeAnimationTiming(
  drag: ComposeAnimationTimingDrag,
  deltaSeconds: number,
  timelineDuration: number,
  snap: boolean,
) {
  const timing = getTimelineBlockTiming({
    action: drag.action,
    initialStart: drag.initialDelay,
    initialDuration: drag.initialDuration,
    deltaSeconds,
    timelineDuration,
    snap,
    snapBoundaries: drag.snapBoundaries,
    snapThresholdSeconds: drag.snapThresholdSeconds,
  });
  return {
    delay: timing.start,
    duration: timing.duration,
    guideTime: timing.guideTime,
  };
}

export function updateComposeAnimationLayerMotionTiming(
  layer: ComposeAnimationTimelineLayer,
  timing: { delay: number; duration: number },
  _onUpdateBackgroundMotion?: never,
  _onUpdateObjectMotion?: never,
  onUpdateBackgroundAnimation?: (
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) => void,
  onUpdateObjectAnimation?: (
    objectId: string,
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) => void,
  animationId?: string,
) {
  if (!animationId) return;
  const updater = (animations: LayerAnimation[]) =>
    animations.map((animation) =>
      animation.id === animationId && Array.isArray(animation.tracks)
        ? shiftAndScaleAnimation(animation, timing.delay, timing.duration)
        : animation,
    );
  if (layer.kind === "background") {
    onUpdateBackgroundAnimation?.(updater);
  } else if (layer.object) {
    onUpdateObjectAnimation?.(layer.object.id, updater);
  }
}

function shiftAndScaleAnimation(
  animation: LayerAnimation,
  start: number,
  duration: number,
): LayerAnimation {
  if (!Array.isArray(animation.tracks)) return animation;
  const currentStart = getAnimationStart(animation);
  const currentDuration = Math.max(getAnimationDuration(animation), 0.0001);
  return {
    ...animation,
    options: { ...animation.options, delay: start || undefined, duration },
    tracks: animation.tracks.map((track) => ({
      ...track,
      points: track.points.map((point) => ({
        ...point,
        time: roundTimelineKeyframeTime(
          start + ((point.time - currentStart) / currentDuration) * duration,
        ),
      })),
    })),
  };
}

export function createComposeAnimationPresetAnimation(
  preset: ComposeAnimationPreset,
  currentTime: number,
  timelineDuration: number,
): LayerAnimation {
  const delay = Math.max(0, Math.min(currentTime, timelineDuration));
  const duration = Math.max(
    0.1,
    Math.min(preset.duration, Math.max(timelineDuration - delay, 0.1)),
  );
  const suffix = Date.now().toString(36);
  return {
    id: `preset:${preset.id}:${suffix}`,
    name: preset.label,
    tracks: preset.tracks.map((track) => ({
      property: track.property,
      valueType: track.valueType ?? getAnimationTrackValueType(track.property),
      points: track.points.map((point, index) => ({
        id: `${track.property}:${suffix}:${index}`,
        time: roundTimelineKeyframeTime(delay + point.time),
        value: point.value,
        easingToNext: point.easingToNext ?? "easeOut",
        hold: point.hold,
      })),
    })),
    options: {
      delay: delay || undefined,
      duration,
      ease: "easeOut",
    },
  };
}

export function createComposeAnimationAttributeKeyframeAnimation(
  key: ComposeAnimationAttributeKey,
  value: number | string,
  currentTime: number,
  timelineDuration: number,
  idSuffix = Date.now().toString(36),
): LayerAnimation {
  const time = roundTimelineKeyframeTime(
    Math.max(0, Math.min(currentTime, timelineDuration)),
  );
  return {
    id: `track:${key}:${idSuffix}`,
    name: `${composeAnimationAttributeLabels[key]} keyframes`,
    tracks: [
      {
        property: key,
        valueType: getAnimationTrackValueType(key),
        points: [createKeyframePoint(key, value, time, idSuffix)],
      },
    ],
    options: {
      delay: time || undefined,
      duration: 0.1,
      ease: "linear",
    },
  };
}

export function upsertComposeAnimationAttributeKeyframe(
  animations: LayerAnimation[],
  key: ComposeAnimationAttributeKey,
  value: number | string,
  currentTime: number,
  timelineDuration: number,
) {
  const time = roundTimelineKeyframeTime(
    Math.max(0, Math.min(currentTime, timelineDuration)),
  );
  const animationIndex = animations.findIndex(
    (animation) =>
      Array.isArray(animation.tracks) &&
      animation.tracks.some((track) => track.property === key),
  );
  if (animationIndex < 0) {
    return [
      ...animations,
      createComposeAnimationAttributeKeyframeAnimation(
        key,
        value,
        time,
        timelineDuration,
      ),
    ];
  }

  return animations.map((animation, index) => {
    if (index !== animationIndex) return animation;
    const nextTracks = animation.tracks.map((track) => {
      if (track.property !== key) return track;
      return {
        ...track,
        points: normalizeKeyframePoints([
          ...track.points,
          createKeyframePoint(key, value, time),
        ]),
      };
    });
    return {
      ...animation,
      tracks: nextTracks,
      options: {
        ...animation.options,
        delay:
          getAnimationStart({ ...animation, tracks: nextTracks }) || undefined,
        duration: getAnimationDuration({ ...animation, tracks: nextTracks }),
      },
    };
  });
}

export function removeComposeAnimationAttributeKeyframe(
  animations: LayerAnimation[],
  key: ComposeAnimationAttributeKey,
  currentTime: number,
  timelineDuration: number,
) {
  const time = roundTimelineKeyframeTime(
    Math.max(0, Math.min(currentTime, timelineDuration)),
  );
  return animations.flatMap((animation) => {
    if (!Array.isArray(animation.tracks)) return [animation];
    const nextTracks = animation.tracks.flatMap((track) => {
      if (track.property !== key) return [track];
      const nextPoints = track.points.filter(
        (point) => !isPointAtTime(point, time),
      );
      return nextPoints.length ? [{ ...track, points: nextPoints }] : [];
    });
    return nextTracks.length ? [{ ...animation, tracks: nextTracks }] : [];
  });
}

export function removeComposeAnimationKeyframeSelections(
  animations: LayerAnimation[],
  selections: ComposeAnimationKeyframeSelection[],
  timelineDuration: number,
) {
  if (!selections.length) return animations;
  const normalizedSelections = selections.map((selection) => ({
    ...selection,
    time: roundTimelineKeyframeTime(
      Math.max(0, Math.min(selection.time, timelineDuration)),
    ),
  }));
  return animations.flatMap((animation) => {
    if (!Array.isArray(animation.tracks)) return [animation];
    const nextTracks = animation.tracks.flatMap((track) => {
      const selected = normalizedSelections.filter(
        (selection) =>
          selection.animationId === animation.id &&
          selection.key === track.property,
      );
      if (!selected.length) return [track];
      const nextPoints = track.points.filter(
        (point) =>
          !selected.some((selection) =>
            selection.pointId
              ? selection.pointId === point.id
              : isPointAtTime(point, selection.time),
          ),
      );
      return nextPoints.length ? [{ ...track, points: nextPoints }] : [];
    });
    return nextTracks.length ? [{ ...animation, tracks: nextTracks }] : [];
  });
}

export function moveComposeAnimationAttributeKeyframe(
  animations: LayerAnimation[],
  animationId: string,
  newTime: number,
  timelineDuration: number,
): LayerAnimation[] {
  const clampedTime = roundTimelineKeyframeTime(
    Math.max(0, Math.min(newTime, timelineDuration)),
  );
  return animations.map((animation) => {
    if (animation.id !== animationId || !Array.isArray(animation.tracks))
      return animation;
    return {
      ...animation,
      tracks: animation.tracks.map((track) => {
        if (track.points.length === 1) {
          return {
            ...track,
            points: [{ ...track.points[0], time: clampedTime }],
          };
        }
        const originalTime = track.points[0]?.time ?? clampedTime;
        const delta = clampedTime - originalTime;
        return {
          ...track,
          points: normalizeKeyframePoints(
            track.points.map((point) => ({
              ...point,
              time: roundTimelineKeyframeTime(
                Math.max(0, Math.min(point.time + delta, timelineDuration)),
              ),
            })),
          ),
        };
      }),
      options: { ...animation.options, delay: clampedTime || undefined },
    };
  });
}

export function moveComposeAnimationKeyframesAtTime(
  animations: LayerAnimation[],
  originalTime: number,
  newTime: number,
  timelineDuration: number,
): LayerAnimation[] {
  const roundedOriginal = roundTimelineKeyframeTime(originalTime);
  const clampedTime = roundTimelineKeyframeTime(
    Math.max(0, Math.min(newTime, timelineDuration)),
  );
  return animations.map((animation) => {
    if (!Array.isArray(animation.tracks)) return animation;
    return {
      ...animation,
      tracks: animation.tracks.map((track) => ({
        ...track,
        points: normalizeKeyframePoints(
          track.points.map((point) =>
            isPointAtTime(point, roundedOriginal)
              ? { ...point, time: clampedTime }
              : point,
          ),
        ),
      })),
    };
  });
}

export function getNearestComposeAnimationKeyframeValue(
  track: ComposeAnimationAttributeTrack,
  currentTime: number,
) {
  if (!track.keyframes.length) return null;
  let nearest = track.keyframes[0];
  let nearestDistance = Math.abs(currentTime - nearest.time);
  for (const keyframe of track.keyframes) {
    const keyframeDistance = Math.abs(currentTime - keyframe.time);
    if (keyframeDistance < nearestDistance) {
      nearest = keyframe;
      nearestDistance = keyframeDistance;
    }
  }
  return nearest.value;
}

export function hasComposeAnimationAttributeTrack(
  animations: LayerAnimation[] | undefined,
  key: ComposeAnimationAttributeKey,
) {
  return Boolean(
    animations?.some(
      (animation) =>
        Array.isArray(animation.tracks) &&
        animation.tracks.some(
          (track) => track.property === key && track.points.length > 0,
        ),
    ),
  );
}

function createKeyframePoint(
  key: ComposeAnimationAttributeKey,
  value: number | string,
  time: number,
  idSuffix = Date.now().toString(36),
): KeyframePoint {
  return {
    id: `${key}:${roundTimelineKeyframeTime(time)}:${idSuffix}`,
    time,
    value,
    easingToNext: "linear",
  };
}

function normalizeKeyframePoints(points: KeyframePoint[]) {
  const byTime = new Map<number, KeyframePoint>();
  for (const point of points) {
    byTime.set(roundTimelineKeyframeTime(point.time), {
      ...point,
      time: roundTimelineKeyframeTime(point.time),
    });
  }
  return Array.from(byTime.values()).sort(
    (left, right) => left.time - right.time,
  );
}

function isPointAtTime(point: KeyframePoint, time: number) {
  return Math.abs(roundTimelineKeyframeTime(point.time) - time) < 0.001;
}

function getAnimationTrackValueType(
  key: ComposeAnimationAttributeKey,
): AnimationTrack["valueType"] {
  return key === "color" || key === "backgroundColor" ? "color" : "number";
}

function getAnimationStart(animation: LayerAnimation) {
  const times = getAnimationPointTimes(animation);
  return times.length ? Math.min(...times) : (animation.options?.delay ?? 0);
}

function getAnimationEnd(animation: LayerAnimation) {
  const times = getAnimationPointTimes(animation);
  return times.length
    ? Math.max(...times)
    : (animation.options?.delay ?? 0) + (animation.options?.duration ?? 0);
}

function getAnimationPointTimes(animation: LayerAnimation) {
  if (!Array.isArray(animation.tracks)) return [];
  return animation.tracks.flatMap((track) =>
    Array.isArray(track.points) ? track.points.map((point) => point.time) : [],
  );
}

function getAnimationDuration(animation: LayerAnimation) {
  return Math.max(
    0.1,
    getAnimationEnd(animation) - getAnimationStart(animation),
  );
}
