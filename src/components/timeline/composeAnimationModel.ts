import {
  movePropertyKeyframe,
  removePropertyKeyframe,
  type PropertyPath,
} from "../../core/propertyRegistry";
import type {
  AnimationTrackProperty,
  FrameObject,
  MotionEase,
  Part,
} from "../../core/types";

export type ComposeAnimationAttributeKey = AnimationTrackProperty;

export type ComposeAnimationKeyframePoint = {
  animationId: string;
  pointId: string;
  time: number;
  value: number | string;
  easingToNext?: MotionEase | readonly [number, number, number, number];
  propertyPath?: PropertyPath;
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
  propertyPath?: PropertyPath;
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
    points: values.map((value, index) => ({
      time: (duration * index) / lastIndex,
      value,
    })),
  };
}

export function buildComposeAnimationTimelineLayers(
  part: Part,
): ComposeAnimationTimelineLayer[] {
  const objects = [
    ...[...part.objects].reverse().map((object) => ({
      id: object.id,
      name: object.name || object.id,
      kind: "object" as const,
      object,
    })),
    ...[...part.background.elements].reverse().map((object) => ({
      id: object.id,
      name: object.name || object.id,
      kind: "background-object" as const,
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

const genericPropertyPathByAttribute: Partial<
  Record<ComposeAnimationAttributeKey, PropertyPath>
> = {
  x: "bounds.x",
  y: "bounds.y",
  width: "bounds.width",
  height: "bounds.height",
  opacity: "style.opacity",
  color: "style.color",
  backgroundColor: "style.backgroundColor",
  z: "transform.translateZ",
  scale: "transform.scale",
  scaleX: "transform.scaleX",
  scaleY: "transform.scaleY",
  rotate: "transform.rotate",
  rotateX: "transform.rotateX",
  rotateY: "transform.rotateY",
  rotateZ: "transform.rotateZ",
  skewX: "transform.skewX",
  skewY: "transform.skewY",
  transformPerspective: "transform.perspective",
  blur: "filter.blur",
};

const attributeByGenericPropertyPath = new Map<
  PropertyPath,
  ComposeAnimationAttributeKey
>(
  Object.entries(genericPropertyPathByAttribute).map(([key, path]) => [
    path as PropertyPath,
    key as ComposeAnimationAttributeKey,
  ]),
);

export function getGenericPropertyPathForComposeAttribute(
  key: ComposeAnimationAttributeKey,
) {
  return genericPropertyPathByAttribute[key];
}

export function isGenericComposeAnimationId(animationId: string) {
  return animationId.startsWith("property:");
}

export function getGenericPropertyPathFromComposeAnimationId(
  animationId: string,
): PropertyPath | undefined {
  if (!isGenericComposeAnimationId(animationId)) return undefined;
  return animationId.slice("property:".length) as PropertyPath;
}

function roundTimelineKeyframeTime(time: number) {
  return Math.round(time * 1000) / 1000;
}

export function getComposeAnimationAttributeTracks(
  layer: ComposeAnimationTimelineLayer,
): ComposeAnimationAttributeTrack[] {
  const tracks = new Map<
    ComposeAnimationAttributeKey,
    ComposeAnimationKeyframePoint[]
  >();

  for (const [rawPropertyPath, track] of Object.entries(
    layer.object?.tracks ?? {},
  )) {
    const propertyPath = rawPropertyPath as PropertyPath;
    const key = attributeByGenericPropertyPath.get(propertyPath);
    if (!key) continue;
    const points = tracks.get(key) ?? [];
    for (const point of track.points) {
      if (typeof point.value !== "number" && typeof point.value !== "string")
        continue;
      points.push({
        animationId: `property:${propertyPath}`,
        pointId:
          point.id ??
          `${propertyPath}:${roundTimelineKeyframeTime(point.time)}`,
        time: point.time,
        value: point.value,
        easingToNext: normalizeComposeEasing(point.easingToNext),
        propertyPath,
      });
    }
    tracks.set(key, points);
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

export function removeComposeGenericPropertyKeyframeSelections(
  object: FrameObject,
  selections: ComposeAnimationKeyframeSelection[],
  currentTime: number,
  timelineDuration: number,
): FrameObject {
  let nextObject = object;
  for (const selection of selections) {
    const path =
      selection.propertyPath ??
      getGenericPropertyPathFromComposeAnimationId(selection.animationId);
    if (!path) continue;
    const time = roundTimelineKeyframeTime(
      Math.max(0, Math.min(selection.time, timelineDuration)),
    );
    nextObject = removePropertyKeyframe(nextObject, path, time, currentTime);
  }
  return nextObject;
}

export function moveComposeGenericPropertyKeyframe(
  object: FrameObject,
  animationId: string,
  newTime: number,
  timelineDuration: number,
): FrameObject {
  const path = getGenericPropertyPathFromComposeAnimationId(animationId);
  if (!path) return object;
  const track = object.tracks?.[path];
  const fromTime = track?.points[0]?.time;
  if (fromTime === undefined) return object;
  return movePropertyKeyframe(
    object,
    path,
    fromTime,
    Math.max(0, Math.min(newTime, timelineDuration)),
  );
}

export function moveComposeGenericPropertyKeyframesAtTime(
  object: FrameObject,
  originalTime: number,
  newTime: number,
  timelineDuration: number,
): FrameObject {
  let nextObject = object;
  for (const rawPropertyPath of Object.keys(object.tracks ?? {})) {
    const propertyPath = rawPropertyPath as PropertyPath;
    if (!attributeByGenericPropertyPath.has(propertyPath)) continue;
    nextObject = movePropertyKeyframe(
      nextObject,
      propertyPath,
      originalTime,
      Math.max(0, Math.min(newTime, timelineDuration)),
    );
  }
  return nextObject;
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

function normalizeComposeEasing(
  value: unknown,
): MotionEase | readonly [number, number, number, number] | undefined {
  if (
    value === "linear" ||
    value === "easeIn" ||
    value === "easeOut" ||
    value === "easeInOut" ||
    value === "inAndOut" ||
    value === "expoIn" ||
    value === "expoOut" ||
    value === "circOut" ||
    value === "backOut"
  ) {
    return value;
  }
  return Array.isArray(value) && value.length === 4
    ? (value as unknown as readonly [number, number, number, number])
    : undefined;
}
