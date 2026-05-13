import {
  getTimelineDragDeltaSeconds,
  getTimelineBlockTiming,
  type TimelineBlockTimingAction,
} from "../../core/timelineBlockTiming";
import type {
  FrameObject,
  LayerAnimation,
  MotionMarker,
  Part,
} from "../../core/types";
import type { TimelinePartMotionView } from "./timelineTypes";

export type ComposeAnimationAttributeKey = keyof LayerAnimation["keyframes"];

export type ComposeAnimationKeyframePoint = {
  animationId: string;
  time: number;
  value: number | string;
};

export type ComposeAnimationAttributeTrack = {
  id: string;
  key: ComposeAnimationAttributeKey;
  label: string;
  keyframes: ComposeAnimationKeyframePoint[];
};

export type ComposeAnimationKeyframeSelection = {
  animationId: string;
  key: ComposeAnimationAttributeKey;
  time: number;
};

type StoredKeyframePoint = ComposeAnimationKeyframePoint & {
  index: number;
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

export type ComposeAnimationPreset = {
  id: string;
  label: string;
  duration: number;
  keyframes: LayerAnimation["keyframes"];
};

export type ComposeAnimationTimelineLayer = {
  id: string;
  name: string;
  kind: "object" | "background-object" | "background";
  object?: FrameObject;
  animations?: LayerAnimation[];
};

export const composeAnimationPresets = [
  {
    id: "fade-in",
    label: "Fade in",
    duration: 0.8,
    keyframes: { opacity: [0, 1] as const },
  },
  {
    id: "slide-up",
    label: "Slide up",
    duration: 1,
    keyframes: { y: [42, 0] as const, opacity: [0, 1] as const },
  },
  {
    id: "pop-scale",
    label: "Pop",
    duration: 0.9,
    keyframes: { scale: [0.86, 1.08, 1] as const, opacity: [0, 1] as const },
  },
  {
    id: "spin-settle",
    label: "Spin",
    duration: 1.2,
    keyframes: { rotate: [-12, 4, 0] as const, opacity: [0, 1] as const },
  },
  {
    id: "blur-reveal",
    label: "Blur reveal",
    duration: 1,
    keyframes: { blur: [18, 0] as const, opacity: [0, 1] as const },
  },
] satisfies ComposeAnimationPreset[];

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
  return [
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
    {
      id: part.background.id,
      name: part.background.name || "Background",
      kind: "background" as const,
      animations: part.background.animations,
    },
  ];
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
    for (const key of composeAnimationAttributeOrder) {
      const values = animation.keyframes[key];
      if (!values?.length) continue;
      const points = tracks.get(key) ?? [];
      getStoredKeyframePoints(animation, key).forEach((point) => {
        points.push({
          animationId: animation.id,
          time: point.time,
          value: point.value,
        });
      });
      tracks.set(key, points);
    }
  }

  return composeAnimationAttributeOrder.flatMap((key) => {
    const keyframes = tracks.get(key);
    if (!keyframes?.length) return [];
    return {
      id: `${key}`,
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

const KEYFRAME_PROXIMITY_SECONDS = 0.016; // ~1 frame at 60fps

function isSyntheticSingleKeyframe(values: readonly unknown[]) {
  return values.length === 2 && values[0] === values[1];
}

function getStoredKeyframePoints(
  animation: LayerAnimation,
  key: ComposeAnimationAttributeKey,
): StoredKeyframePoint[] {
  const values = animation.keyframes[key];
  if (!values?.length) return [];
  const delay = animation.options.delay ?? 0;
  const duration = animation.options.duration;
  const lastIndex = Math.max(values.length - 1, 1);
  const points: StoredKeyframePoint[] = [];
  values.forEach((value, index) => {
    if (isSyntheticSingleKeyframe(values) && index > 0) return;
    points.push({
      animationId: animation.id,
      index,
      time: delay + (duration * index) / lastIndex,
      value,
    });
  });
  return points;
}

function getStoredKeyframeIndexAtTime(
  animation: LayerAnimation,
  key: ComposeAnimationAttributeKey,
  currentTime: number,
) {
  const values = animation.keyframes[key];
  if (!values?.length) return -1;
  const roundedTime = roundTimelineKeyframeTime(currentTime);
  const exact = getStoredKeyframePoints(animation, key).find(
    (point) => roundTimelineKeyframeTime(point.time) === roundedTime,
  );
  if (exact) return exact.index;

  if (isSyntheticSingleKeyframe(values)) {
    const hiddenEndpointTime = roundTimelineKeyframeTime(
      (animation.options.delay ?? 0) + animation.options.duration,
    );
    if (hiddenEndpointTime === roundedTime) return 0;
  }

  let nearestIndex = -1;
  let nearestDist = KEYFRAME_PROXIMITY_SECONDS;
  for (const point of getStoredKeyframePoints(animation, key)) {
    const dist = Math.abs(point.time - currentTime);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = point.index;
    }
  }
  return nearestIndex;
}

export function getComposeAnimationAttributeKeyframeAtTime(
  track: ComposeAnimationAttributeTrack,
  currentTime: number,
) {
  const roundedTime = roundTimelineKeyframeTime(currentTime);
  // First try exact match (rounded to ms)
  const exact = track.keyframes.find(
    (keyframe) => roundTimelineKeyframeTime(keyframe.time) === roundedTime,
  );
  if (exact) return exact;
  // Fall back to nearest keyframe within proximity threshold
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
  ease:
    | import("../../core/types").MotionEase
    | readonly [number, number, number, number],
): LayerAnimation[] {
  return animations.map((anim) =>
    anim.id === animationId
      ? { ...anim, options: { ...anim.options, ease } }
      : anim,
  );
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
    return (layer.animations ?? []).map(
      (animation): MotionMarker => ({
        id: `${layer.id}/anim/${animation.id}`,
        name: animation.name || "Animation",
        layerId: layer.id,
        effectId: "clipper.motion.pan",
        kind: "pan",
        start: animation.options.delay ?? 0,
        duration: animation.options.duration,
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
      ...layers.flatMap((layer) => {
        const boundaries: number[] = [];
        if (layer.animations) {
          for (const animation of layer.animations) {
            boundaries.push(
              animation.options.delay ?? 0,
              (animation.options.delay ?? 0) + animation.options.duration,
            );
          }
        }
        return boundaries;
      }),
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
  if (animationId) {
    const updater = (animations: LayerAnimation[]) =>
      animations.map((anim) =>
        anim.id === animationId
          ? {
              ...anim,
              options: {
                ...anim.options,
                delay: timing.delay || undefined,
                duration: timing.duration,
              },
            }
          : anim,
      );
    if (layer.kind === "background") {
      onUpdateBackgroundAnimation?.(updater);
    } else if (layer.object) {
      onUpdateObjectAnimation?.(layer.object.id, updater);
    }
    return;
  }
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
  return {
    id: `preset:${preset.id}:${Date.now().toString(36)}`,
    name: preset.label,
    keyframes: preset.keyframes,
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
): LayerAnimation {
  const delay = Math.max(0, Math.min(currentTime, timelineDuration));
  const duration = Math.min(0.1, Math.max(timelineDuration - delay, 0.1));
  return {
    id: `keyframe:${key}:${Date.now().toString(36)}`,
    name: `${composeAnimationAttributeLabels[key]} keyframe`,
    keyframes: { [key]: [value, value] } as LayerAnimation["keyframes"],
    options: {
      delay: delay || undefined,
      duration,
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
  const clampedTime = Math.max(0, Math.min(currentTime, timelineDuration));
  const roundedTime = roundTimelineKeyframeTime(clampedTime);
  let updated = false;
  const nextAnimations = animations.map((animation) => {
    const values = animation.keyframes[key];
    if (!values?.length) return animation;
    const valueIndex = getStoredKeyframeIndexAtTime(
      animation,
      key,
      roundedTime,
    );
    if (valueIndex < 0) return animation;
    updated = true;
    const nextValues = isSyntheticSingleKeyframe(values)
      ? values.map(() => value)
      : values.map((item, index) => (index === valueIndex ? value : item));
    return {
      ...animation,
      keyframes: {
        ...animation.keyframes,
        [key]: nextValues,
      },
    };
  });

  if (updated) return nextAnimations;
  return [
    ...nextAnimations,
    createComposeAnimationAttributeKeyframeAnimation(
      key,
      value,
      currentTime,
      timelineDuration,
    ),
  ];
}

export function removeComposeAnimationAttributeKeyframe(
  animations: LayerAnimation[],
  key: ComposeAnimationAttributeKey,
  currentTime: number,
  timelineDuration: number,
) {
  const roundedTime = roundTimelineKeyframeTime(
    Math.max(0, Math.min(currentTime, timelineDuration)),
  );
  return animations.flatMap((animation) => {
    const values = animation.keyframes[key];
    if (!values?.length) return [animation];
    const valueIndex = getStoredKeyframeIndexAtTime(
      animation,
      key,
      roundedTime,
    );
    if (valueIndex < 0) return [animation];
    const nextValues = values.filter((_, index) => index !== valueIndex);
    const nextKeyframes = { ...animation.keyframes };
    if (nextValues.length >= 2) {
      const writableKeyframes = nextKeyframes as Record<
        ComposeAnimationAttributeKey,
        unknown
      >;
      writableKeyframes[key] = nextValues;
    } else delete nextKeyframes[key];
    if (!Object.values(nextKeyframes).some((items) => items?.length)) return [];
    return [{ ...animation, keyframes: nextKeyframes }];
  });
}

export function removeComposeAnimationKeyframeSelections(
  animations: LayerAnimation[],
  selections: ComposeAnimationKeyframeSelection[],
  timelineDuration: number,
) {
  if (!selections.length) return animations;
  const selectionsByAnimation = new Map<
    string,
    ComposeAnimationKeyframeSelection[]
  >();
  for (const selection of selections) {
    const items = selectionsByAnimation.get(selection.animationId) ?? [];
    items.push(selection);
    selectionsByAnimation.set(selection.animationId, items);
  }

  return animations.flatMap((animation) => {
    const selectionsForAnimation = selectionsByAnimation.get(animation.id);
    if (!selectionsForAnimation?.length) return [animation];
    const nextKeyframes = { ...animation.keyframes };

    for (const key of composeAnimationAttributeOrder) {
      const values = nextKeyframes[key];
      if (!values?.length) continue;
      const selectedTimes = selectionsForAnimation
        .filter((selection) => selection.key === key)
        .map((selection) =>
          Math.max(0, Math.min(selection.time, timelineDuration)),
        );
      if (!selectedTimes.length) continue;
      const selectedIndexes = new Set(
        selectedTimes
          .map((time) => getStoredKeyframeIndexAtTime(animation, key, time))
          .filter((index) => index >= 0),
      );
      if (!selectedIndexes.size) continue;
      const nextValues = values.filter(
        (_, index) => !selectedIndexes.has(index),
      );
      if (nextValues.length >= 2) {
        const writableKeyframes = nextKeyframes as Record<
          ComposeAnimationAttributeKey,
          unknown
        >;
        writableKeyframes[key] = nextValues;
      } else delete nextKeyframes[key];
    }

    if (!Object.values(nextKeyframes).some((items) => items?.length)) return [];
    return [{ ...animation, keyframes: nextKeyframes }];
  });
}

export function moveComposeAnimationAttributeKeyframe(
  animations: LayerAnimation[],
  animationId: string,
  newTime: number,
  timelineDuration: number,
): LayerAnimation[] {
  const clampedTime = Math.max(0, Math.min(newTime, timelineDuration));
  return animations.map((animation) => {
    if (animation.id !== animationId) return animation;
    const isSingleKeyframe = Object.values(animation.keyframes).every(
      (values) =>
        !values?.length || (values.length === 2 && values[0] === values[1]),
    );
    if (isSingleKeyframe) {
      return {
        ...animation,
        options: {
          ...animation.options,
          delay: clampedTime || undefined,
        },
      };
    }
    const currentDelay = animation.options.delay ?? 0;
    const delta = clampedTime - currentDelay;
    const newDelay = Math.max(0, currentDelay + delta);
    return {
      ...animation,
      options: {
        ...animation.options,
        delay: newDelay || undefined,
      },
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
  const clampedTime = Math.max(0, Math.min(newTime, timelineDuration));
  return animations.map((animation) => {
    const delay = animation.options.delay ?? 0;
    const duration = animation.options.duration;
    const hasKeyframeAtTime = Object.values(animation.keyframes).some(
      (values) => {
        if (!values?.length) return false;
        const lastIndex = Math.max(values.length - 1, 1);
        const hasVisibleKeyframe = values.some((_, index) => {
          if (isSyntheticSingleKeyframe(values) && index > 0) return false;
          const t = roundTimelineKeyframeTime(
            delay + (duration * index) / lastIndex,
          );
          return t === roundedOriginal;
        });
        if (hasVisibleKeyframe) return true;
        return (
          isSyntheticSingleKeyframe(values) &&
          roundTimelineKeyframeTime(delay + duration) === roundedOriginal
        );
      },
    );
    if (!hasKeyframeAtTime) return animation;
    const isSingleKeyframe = Object.values(animation.keyframes).every(
      (values) =>
        !values?.length || (values.length === 2 && values[0] === values[1]),
    );
    if (isSingleKeyframe) {
      return {
        ...animation,
        options: {
          ...animation.options,
          delay: clampedTime || undefined,
        },
      };
    }
    const currentDelay = animation.options.delay ?? 0;
    const delta = clampedTime - currentDelay;
    const newDelay = Math.max(0, currentDelay + delta);
    return {
      ...animation,
      options: {
        ...animation.options,
        delay: newDelay || undefined,
      },
    };
  });
}

export function getNearestComposeAnimationKeyframeValue(
  track: ComposeAnimationAttributeTrack,
  currentTime: number,
) {
  return track.keyframes.reduce<number | string | null>((nearest, keyframe) => {
    if (nearest === null) return keyframe.value;
    const nearestDistance = Math.abs(
      currentTime -
        (track.keyframes.find((item) => item.value === nearest)?.time ??
          currentTime),
    );
    const keyframeDistance = Math.abs(currentTime - keyframe.time);
    return keyframeDistance < nearestDistance ? keyframe.value : nearest;
  }, null);
}
