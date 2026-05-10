import { defaultZoomDuration, minimumZoomDuration } from "./editorConstants";
import {
  effectBlocksMending,
  getAdjustmentEffectPackage,
} from "./effects/registry";
import {
  getMotionBlockEffectKind,
  getCanonicalMotionMarkers,
  getMotionMarkerViews,
  withCanonicalMotionMarkers,
} from "./motionEffects";
import {
  MAX_PART_DURATION_SECONDS,
  MAX_SCENE_DURATION_SECONDS,
  type AdjustmentLayer,
  type CompositionClip,
  type MotionBlock,
  type MotionBlockEffectKind,
  type MotionEffectKind,
  type MotionMarker,
  type Scene,
  type TimelineComposition,
  type TimelineLayerState,
  type TimelineMotionLayerState,
  type TimelinePart,
  type TransitionLayer,
} from "./types";
import { clamp, roundTenth, roundToPrecision, roundTwo } from "./math";
import { getDisplayNameFromPath } from "./fileNames";
import { applyAdjustmentLayersToSceneTime } from "./adjustments";
import {
  getTransitionFinishTime,
  getTransitionMarkerTime,
  getTransitionPostProcessPasses,
  getTransitionProgress,
} from "./transitions";
import type { PostProcessPass } from "./effects/types";

export function buildLinearTimeline(scene: Scene): TimelineComposition[] {
  let cursor = 0;
  return scene.compositions.map((composition) => {
    const start = composition.start ?? cursor;
    const end = start + composition.duration;
    cursor = composition.start === undefined ? end : Math.max(cursor, end);
    return { ...composition, start, end };
  });
}

export function getCompositionPreviewTime(
  composition: Pick<CompositionClip, "duration" | "start" | "trimStart">,
  sceneTime: number,
) {
  const trimStart = composition.trimStart ?? 0;
  return clamp(
    sceneTime - (composition.start ?? 0) + trimStart,
    0,
    composition.duration + trimStart,
  );
}

export function getRenderableScene(
  scene: Scene,
  timelineLayers: TimelineLayerState | undefined,
): Scene {
  return {
    ...scene,
    compositions: getExecutableCompositions(scene.compositions, timelineLayers),
    adjustmentLayers: getExecutableAdjustmentLayers(
      scene.adjustmentLayers,
      timelineLayers,
    ),
    motionMarkers: getExecutableMotionMarkers(
      scene.motionMarkers,
      timelineLayers,
    ),
    transitionLayers: getExecutableTransitionLayers(
      scene.transitionLayers,
      timelineLayers,
    ),
  };
}

export function getExecutableCompositions(
  compositions: CompositionClip[],
  timelineLayers: TimelineLayerState | undefined,
) {
  const hiddenRowIds = getHiddenLayerIds(timelineLayers?.compositionLayers);
  return compositions
    .filter((composition) => !hiddenRowIds.has(composition.layerId ?? "comp"))
    .map((composition) => ({
      ...composition,
      ...withCanonicalMotionMarkers(
        getExecutableMotionMarkers(
          getCanonicalMotionMarkers(composition),
          timelineLayers,
        ),
      ),
    }));
}

export function sceneDuration(scene: Scene) {
  return buildLinearTimeline(scene).reduce(
    (total, composition) =>
      Math.max(
        total,
        composition.end,
        ...getCanonicalMotionMarkers(composition).map(
          (marker) => composition.start + marker.start + marker.duration,
        ),
      ),
    [
      ...(scene.adjustmentLayers ?? []),
      ...(scene.transitionLayers ?? []),
      ...getCanonicalMotionMarkers(scene),
    ].reduce((total, item) => Math.max(total, item.start + item.duration), 0),
  );
}

export function timelineDuration(timeline: TimelinePart[]) {
  return timeline.reduce(
    (total, composition) => Math.max(total, composition.end),
    0,
  );
}

export function timelineDisplayDuration(
  duration: number,
  endPaddingFraction = 0.5,
) {
  return Math.max(
    duration > 0
      ? roundTenth(duration * (1 + clamp(endPaddingFraction, 0, 2)))
      : 10,
    10,
  );
}

export function validateScene(scene: Scene): string[] {
  const errors: string[] = [];
  const duration = sceneDuration(scene);

  if (duration > MAX_SCENE_DURATION_SECONDS) {
    errors.push(
      `Timeline ${getDisplayNameFromPath(scene.id)} is ${duration}s and exceeds the 30 minute limit.`,
    );
  }

  scene.compositions.forEach((composition) => {
    const compositionStart = composition.start ?? 0;
    if (composition.duration <= 0) {
      errors.push(
        `Composition ${getDisplayNameFromPath(composition.filePath)} must have a positive duration.`,
      );
    }

    if (compositionStart < 0) {
      errors.push(
        `Composition ${getDisplayNameFromPath(composition.filePath)} cannot start before the timeline.`,
      );
    }

    if (composition.duration > MAX_PART_DURATION_SECONDS) {
      errors.push(
        `Composition ${getDisplayNameFromPath(composition.filePath)} is ${composition.duration}s and exceeds the 1 minute limit.`,
      );
    }
  });

  (scene.adjustmentLayers ?? []).forEach((layer) => {
    if (layer.duration <= 0)
      errors.push(`Adjustment ${layer.name} must have a positive duration.`);
    if (layer.start < 0)
      errors.push(`Adjustment ${layer.name} cannot start before the scene.`);
    if (layer.start + layer.duration > duration)
      errors.push(`Adjustment ${layer.name} extends past the scene end.`);
    const validationError = getAdjustmentEffectPackage(
      layer.effect.effectId,
    )?.validate?.(layer);
    if (validationError) errors.push(validationError);
  });

  return errors;
}

export function getExecutableAdjustmentLayers(
  layers: AdjustmentLayer[] | undefined,
  timelineLayers: TimelineLayerState | undefined,
  options: { includeHiddenRows?: boolean } = {},
) {
  const visibleRows = (timelineLayers?.adjustmentLayers ?? []).filter(
    (layer) => options.includeHiddenRows || !layer.hidden,
  );
  const rowIds = new Set(visibleRows.map((layer) => layer.id));
  const rowOrder = new Map(
    visibleRows.map((layer, index) => [layer.id, index]),
  );
  if (rowIds.size === 0) return [];
  return (layers ?? [])
    .filter((layer) => rowIds.has(getAdjustmentLayerRowId(layer)))
    .sort((left, right) => {
      const leftRow = rowOrder.get(getAdjustmentLayerRowId(left)) ?? 0;
      const rightRow = rowOrder.get(getAdjustmentLayerRowId(right)) ?? 0;
      return rightRow - leftRow;
    });
}

export function getExecutableTransitionLayers(
  layers: TransitionLayer[] | undefined,
  timelineLayers: TimelineLayerState | undefined,
  options: { includeHiddenRows?: boolean } = {},
) {
  const rowIds = new Set(
    (timelineLayers?.transitionLayers ?? [])
      .filter((layer) => options.includeHiddenRows || !layer.hidden)
      .map((layer) => layer.id),
  );
  if (rowIds.size === 0) return [];
  return (layers ?? []).filter((layer) =>
    rowIds.has(getTimelineMarkerMendLayerId(layer)),
  );
}

export function getExecutableMotionMarkers(
  markers: MotionMarker[] | undefined,
  timelineLayers: TimelineLayerState | undefined,
  options: { includeHiddenRows?: boolean } = {},
) {
  const hiddenRowIds = options.includeHiddenRows
    ? new Set<string>()
    : getHiddenLayerIds(timelineLayers?.motionLayers);
  return (markers ?? []).filter(
    (marker) => !marker.layerId || !hiddenRowIds.has(marker.layerId),
  );
}

export function getAdjustmentPlacement(
  layers: AdjustmentLayer[] | undefined,
  sceneDuration: number,
  sceneTime: number,
) {
  const duration = Math.min(3, Math.max(sceneDuration, 0.1));
  return { start: roundTenth(Math.max(sceneTime, 0)), duration };
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function updateCompositionObject(
  compositions: CompositionClip[],
  compositionId: string,
  objectId: string,
  updater: (
    composition: CompositionClip["objects"][number],
  ) => CompositionClip["objects"][number],
) {
  return compositions.map((composition) => {
    if (composition.id !== compositionId) return composition;
    return {
      ...composition,
      objects: composition.objects.map((object) =>
        object.id === objectId ? updater(object) : object,
      ),
    };
  });
}

export function rebaseCompositionTimelineMarkers<T extends CompositionClip>(
  composition: T,
  previousStart: number,
  nextStart: number,
): T {
  const delta = roundTwo(previousStart - nextStart);
  if (delta === 0) return composition;
  const motionMarkers = getCanonicalMotionMarkers(composition).map(
    (marker) => ({ ...marker, start: roundTwo(marker.start + delta) }),
  );
  return {
    ...composition,
    ...withCanonicalMotionMarkers(motionMarkers),
  };
}

export type TimelineMarkerMove = {
  sourcePartId: string;
  markerId: string;
  targetPartId: string;
  start: number;
  targetLayerId?: string;
};
export type TimelineMarkerResize = {
  sourcePartId: string;
  markerId: string;
  absoluteStart: number;
  duration: number;
};
export type TimelineMarkerDragItem = {
  partId: string;
  markerId: string;
  absoluteStart: number;
  duration: number;
  groupId?: string;
};
type TopTimelineItem =
  | { kind: "adjustment"; layer: AdjustmentLayer }
  | { kind: "transition"; layer: TransitionLayer }
  | { kind: "motion"; part: TimelineComposition; marker: MotionMarker }
  | { kind: "part"; part: TimelineComposition };
export type TimelineMendMarker = {
  id: string;
  start: number;
  duration: number;
  effectId?: string;
  effect?: { effectId?: string };
  layerId?: string;
  snapIn?: boolean;
  snapOut?: boolean;
  mendInId?: string;
  mendOutId?: string;
  partId?: string;
  sourcePartId?: string;
  rawMarkerId?: string;
};
export type TimelinePreviewStackPart = {
  part: CompositionClip;
  start: number;
  previewTime: number;
};
export type TimelinePreviewSequence = {
  sceneTime: number;
  parts: TimelinePreviewStackPart[];
};
export type TimelinePreviewState = {
  activeTimelinePart: TimelinePart | null;
  activeComposition: CompositionClip | null;
  previewTime: number;
  previewParts: TimelinePreviewStackPart[];
  transitionPreviewParts: {
    from: TimelinePreviewStackPart[];
    to: TimelinePreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
    postProcessPasses: PostProcessPass[];
  } | null;
};
type MiddleSnapMarker = TimelineMendMarker;
type MiddleSnapLayerResolver<T extends MiddleSnapMarker> = (
  marker: T,
) => string;

export function getTimelineTicks(duration: number) {
  const step = duration <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let cursor = 0; cursor <= duration; cursor += step) ticks.push(cursor);
  if (!ticks.includes(duration)) ticks.push(duration);
  return ticks;
}

export function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  if (timeline.length === 0) return null;
  const active = [...timeline]
    .reverse()
    .find((item) => time >= item.start && time < item.end);
  return active ?? null;
}

export function getTopTimelinePartAtTime(
  timeline: TimelinePart[],
  time: number,
  timelineLayers: TimelineLayerState | undefined,
) {
  const active = getActiveTimelinePartsAtTime(
    timeline,
    time,
    timelineLayers,
    "top-to-bottom",
  );
  if (active.length === 0) return null;
  return active[0];
}

export function getActiveTimelinePartsAtTime(
  timeline: TimelinePart[],
  time: number,
  timelineLayers: TimelineLayerState | undefined,
  order: "top-to-bottom" | "bottom-to-top" = "top-to-bottom",
) {
  if (timeline.length === 0) return [];
  const active = timeline.filter(
    (item) => time >= item.start && time < item.end,
  );
  if (active.length === 0) return [];
  const rowOrder = getLayerOrderIndex(timelineLayers?.compositionLayers);
  const topToBottom = active.sort((left, right) => {
    const layerDiff =
      getLayerIndex(rowOrder, left.layerId ?? "comp") -
      getLayerIndex(rowOrder, right.layerId ?? "comp");
    return layerDiff || right.start - left.start;
  });
  const visible = topToBottom.slice(0, 1);
  return order === "top-to-bottom" ? visible : [...visible].reverse();
}

export function getTimelinePreviewState({
  adjustmentLayers,
  compositions,
  sceneDurationSeconds,
  sceneTime,
  timeline,
  timelineLayers,
  timelineMode,
  transitionLayers,
}: {
  adjustmentLayers?: AdjustmentLayer[];
  compositions: CompositionClip[];
  sceneDurationSeconds: number;
  sceneTime: number;
  timeline: TimelinePart[];
  timelineLayers?: TimelineLayerState;
  timelineMode: "compose" | "composition";
  transitionLayers?: TransitionLayer[];
}): TimelinePreviewState {
  const compositionLookupTime =
    timelineMode === "compose"
      ? sceneTime
      : applyAdjustmentLayersToSceneTime(sceneTime, adjustmentLayers);
  const timelinePartLookupTime =
    (timelineMode === "compose" ||
      compositionLookupTime >= sceneDurationSeconds) &&
    compositionLookupTime > 0
      ? compositionLookupTime - 0.000001
      : compositionLookupTime;
  const activeTimelinePart = getTopTimelinePartAtTime(
    timeline,
    timelinePartLookupTime,
    timelineLayers,
  );
  const activeComposition = activeTimelinePart
    ? (compositions.find((item) => item.id === activeTimelinePart.id) ?? null)
    : null;
  const previewParts = getPreviewStackParts(
    compositions,
    timeline,
    timelinePartLookupTime,
    compositionLookupTime,
    timelineLayers,
  );
  const transitionLayer = transitionLayers?.find(
    (layer) =>
      compositionLookupTime >= layer.start &&
      compositionLookupTime < layer.start + getTransitionFinishTime(layer),
  );
  const transitionMidTime = transitionLayer
    ? clamp(getTransitionMarkerTime(transitionLayer), 0, sceneDurationSeconds)
    : 0;
  const transitionEndTime = transitionLayer
    ? clamp(
        transitionLayer.start + transitionLayer.duration,
        0,
        sceneDurationSeconds,
      )
    : 0;
  const transitionProgress = transitionLayer
    ? getTransitionProgress(compositionLookupTime, transitionLayer)
    : 0;
  const transitionFromSceneTime = transitionLayer
    ? clamp(
        transitionLayer.start +
          (transitionMidTime - transitionLayer.start) * transitionProgress,
        transitionLayer.start,
        Math.max(transitionMidTime - 0.000001, transitionLayer.start),
      )
    : 0;
  const transitionToSceneTime = transitionLayer
    ? clamp(
        transitionMidTime +
          (transitionEndTime - transitionMidTime) * transitionProgress,
        transitionMidTime,
        transitionEndTime,
      )
    : 0;
  const transitionFromTime = transitionLayer
    ? applyAdjustmentLayersToSceneTime(
        transitionFromSceneTime,
        adjustmentLayers,
      )
    : 0;
  const transitionToTime = transitionLayer
    ? applyAdjustmentLayersToSceneTime(transitionToSceneTime, adjustmentLayers)
    : 0;
  const transitionPreviewParts = transitionLayer
    ? {
        from: getPreviewStackParts(
          compositions,
          timeline,
          transitionFromTime,
          transitionFromTime,
          timelineLayers,
        ),
        to: getPreviewStackParts(
          compositions,
          timeline,
          transitionToTime,
          transitionToTime,
          timelineLayers,
        ),
        fromSceneTime: transitionFromSceneTime,
        toSceneTime: transitionToSceneTime,
        postProcessPasses: getTransitionPostProcessPasses(
          sceneTime,
          transitionLayer,
          undefined,
          { width: 1920, height: 1080 },
        ),
      }
    : null;

  return {
    activeTimelinePart,
    activeComposition,
    previewTime: activeTimelinePart
      ? getCompositionPreviewTime(activeTimelinePart, compositionLookupTime)
      : 0,
    previewParts,
    transitionPreviewParts,
  };
}

function getPreviewStackParts(
  compositions: CompositionClip[],
  timeline: TimelinePart[],
  lookupTime: number,
  previewSceneTime: number,
  timelineLayers: TimelineLayerState | undefined,
): TimelinePreviewStackPart[] {
  return getActiveTimelinePartsAtTime(
    timeline,
    lookupTime,
    timelineLayers,
    "bottom-to-top",
  ).map((timelinePart) => ({
    part:
      compositions.find((item) => item.id === timelinePart.id) ?? timelinePart,
    start: timelinePart.start,
    previewTime: getCompositionPreviewTime(timelinePart, previewSceneTime),
  }));
}

export function getTopTimelineItemAtTime(
  timeline: TimelineComposition[],
  time: number,
  adjustmentLayers: AdjustmentLayer[] = [],
  motionLayers: TimelineMotionLayerState[] = [],
  adjustmentRowIds: string[] = [],
  transitionLayers: TransitionLayer[] = [],
): TopTimelineItem | null {
  const adjustmentLayer =
    adjustmentRowIds.length > 0
      ? adjustmentRowIds
          .flatMap((rowId) =>
            [...adjustmentLayers]
              .reverse()
              .filter((layer) => getAdjustmentLayerRowId(layer) === rowId),
          )
          .find((layer) =>
            isTimelineItemAtSelectionTime(layer.start, layer.duration, time),
          )
      : [...adjustmentLayers]
          .reverse()
          .find((layer) =>
            isTimelineItemAtSelectionTime(layer.start, layer.duration, time),
          );
  if (adjustmentLayer) return { kind: "adjustment", layer: adjustmentLayer };

  const transitionLayer = [...transitionLayers]
    .reverse()
    .find((layer) =>
      isTimelineItemAtSelectionTime(layer.start, layer.duration, time),
    );
  if (transitionLayer) return { kind: "transition", layer: transitionLayer };
  const timelinePart = getTimelinePartAtTime(
    timeline,
    time > 0 ? time - 0.000001 : time,
  );
  if (!timelinePart) return null;

  if (motionLayers.length > 0) {
    const activeLayers = motionLayers.filter((layer) =>
      isMotionLayerActive(layer.kind),
    );
    for (const layer of activeLayers) {
      const motionMarker = [...timeline]
        .reverse()
        .flatMap((part) =>
          [...motionViews(part).motionMarkers]
            .reverse()
            .map((marker) => ({ part, marker })),
        )
        .find(
          (item) =>
            getMotionMarkerLayerId(item.marker) === layer.id &&
            isMarkerAtSelectionTime(item.part, item.marker, time),
        );
      if (motionMarker)
        return {
          kind: "motion",
          part: motionMarker.part,
          marker: motionMarker.marker,
        };
    }
    return { kind: "part", part: timelinePart };
  }

  const motionMarker = [...timeline]
    .reverse()
    .flatMap((part) =>
      [...motionViews(part).motionMarkers]
        .reverse()
        .map((marker) => ({ part, marker })),
    )
    .find((item) => isMarkerAtSelectionTime(item.part, item.marker, time));
  if (motionMarker)
    return {
      kind: "motion",
      part: motionMarker.part,
      marker: motionMarker.marker,
    };
  return { kind: "part", part: timelinePart };
}

export function isMotionLayerActive(
  kind: { kind?: string } | string | undefined,
) {
  if (typeof kind === "object" && kind) return kind.kind !== "empty";
  return kind !== "empty";
}

export function getMotionMarkerLayerId(marker: Pick<MotionMarker, "layerId">) {
  return marker.layerId ?? "";
}

export function getMotionMarkerMendKey(marker: MotionMarker) {
  return getTimelineMarkerMendLayerId(marker);
}

export function canMendTimelineMarkers(
  previous: {
    effectId?: string;
    effect?: { effectId?: string };
    layerId?: string;
  },
  next: { effectId?: string; effect?: { effectId?: string }; layerId?: string },
) {
  const previousEffectId = getTimelineMarkerEffectId(previous);
  const nextEffectId = getTimelineMarkerEffectId(next);
  return (
    getTimelineMarkerMendLayerId(previous) ===
      getTimelineMarkerMendLayerId(next) &&
    (!previousEffectId || !nextEffectId || previousEffectId === nextEffectId) &&
    !effectBlocksMending(previousEffectId) &&
    !effectBlocksMending(nextEffectId)
  );
}

function getTimelineMarkerEffectId(marker: {
  effectId?: string;
  effect?: { effectId?: string };
}) {
  return marker.effectId ?? marker.effect?.effectId;
}

export function getTimelineMarkerMendLayerId(marker: {
  layerId?: string;
  effect?: { effectId?: string };
}) {
  return marker.layerId ?? marker.effect?.effectId ?? "";
}

function motionViews(part: Pick<CompositionClip, "motionMarkers">) {
  return getMotionMarkerViews(part);
}

export function isMotionMarkerOnLayerId(
  marker: { layerId?: string },
  layerId: string,
) {
  return marker.layerId === layerId;
}

export function isMarkerAtSceneTime(
  part: TimelineComposition,
  marker: { start: number; duration: number },
  time: number,
) {
  const markerStart = part.start + marker.start;
  return time >= markerStart && time <= markerStart + marker.duration;
}

function isMarkerAtSelectionTime(
  part: TimelineComposition,
  marker: { start: number; duration: number },
  time: number,
) {
  return isTimelineItemAtSelectionTime(
    part.start + marker.start,
    marker.duration,
    time,
  );
}

function isTimelineItemAtSelectionTime(
  start: number,
  duration: number,
  time: number,
) {
  return time >= start && time < start + duration;
}

export function snapScrubTimeToBoundary(
  time: number,
  boundaries: number[],
  snapThresholdSeconds: number,
) {
  let nearest = time;
  let nearestDistance = snapThresholdSeconds;
  let low = 0;
  let high = boundaries.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle] < time) low = middle + 1;
    else high = middle - 1;
  }

  for (const boundary of [boundaries[high], boundaries[low]]) {
    if (boundary === undefined) continue;
    const distance = Math.abs(time - boundary);
    if (distance <= nearestDistance) {
      nearest = boundary;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function snapTimelineBlockStartToBoundary(
  start: number,
  duration: number,
  boundaries: number[],
  snapThresholdSeconds: number,
) {
  let nextStart = start;

  for (const boundary of boundaries) {
    if (Math.abs(nextStart - boundary) <= snapThresholdSeconds)
      nextStart = boundary;
    if (Math.abs(nextStart + duration - boundary) <= snapThresholdSeconds)
      nextStart = boundary - duration;
  }

  return nextStart;
}

export function getScrubSnapBoundaries(
  timeline: TimelinePart[],
  adjustmentLayers: AdjustmentLayer[] = [],
  transitionLayers: Array<
    Pick<TransitionLayer, "start" | "duration" | "midPoint">
  > = [],
) {
  return Array.from(
    new Set([
      ...timeline.flatMap((part) => [
        part.start,
        part.end,
        ...getCanonicalMotionMarkers(part).flatMap((marker) => [
          part.start + marker.start,
          part.start + marker.start + marker.duration,
        ]),
      ]),
      ...adjustmentLayers.flatMap((layer) => [
        layer.start,
        layer.start + layer.duration,
      ]),
      ...transitionLayers.flatMap((layer) => [
        layer.start,
        layer.start + layer.duration,
        getTransitionMarkerTime(layer),
      ]),
    ]),
  ).sort((left, right) => left - right);
}

export function getMarkerSnapBoundaries(
  timeline: TimelinePart[],
  motionKind: MotionBlockEffectKind | undefined,
  exclude: { kind: MotionBlockEffectKind; partId: string; markerId: string },
) {
  return Array.from(
    new Set(
      timeline.flatMap((part) => [
        part.start,
        part.end,
        ...getCanonicalMotionMarkers(part).flatMap((marker) =>
          (motionKind && marker.kind !== motionKind) ||
          (part.id === exclude.partId && marker.id === exclude.markerId)
            ? []
            : [
                part.start + marker.start,
                part.start + marker.start + marker.duration,
              ],
        ),
      ]),
    ),
  ).sort((left, right) => left - right);
}

export function getTimelineMarkerDragSnapBoundaries(
  timeline: TimelinePart[],
  motionKind: MotionBlockEffectKind | undefined,
  movingKeys: Set<string>,
) {
  return Array.from(
    new Set(
      timeline.flatMap((part) => [
        part.start,
        part.end,
        ...getCanonicalMotionMarkers(part).flatMap((marker) =>
          (motionKind && marker.kind !== motionKind) ||
          movingKeys.has(`${part.id}:${marker.id}`)
            ? []
            : [
                part.start + marker.start,
                part.start + marker.start + marker.duration,
              ],
        ),
      ]),
    ),
  ).sort((left, right) => left - right);
}

export function getMarkerPlacement(
  timeline: TimelinePart[],
  absoluteStart: number,
  duration: number,
  snapThresholdSeconds: number,
  snap: boolean,
  motionKind: MotionBlockEffectKind | undefined,
  exclude: { kind: MotionBlockEffectKind; partId: string; markerId: string },
) {
  const sceneDuration = timelineDuration(timeline);
  let snappedStart = clamp(
    absoluteStart,
    0,
    Math.max(sceneDuration - duration, 0),
  );

  if (snap) {
    for (const boundary of getMarkerSnapBoundaries(
      timeline,
      motionKind,
      exclude,
    )) {
      if (Math.abs(snappedStart - boundary) <= snapThresholdSeconds)
        snappedStart = boundary;
      if (Math.abs(snappedStart + duration - boundary) <= snapThresholdSeconds)
        snappedStart = boundary - duration;
    }
  }

  snappedStart = clamp(snappedStart, 0, Math.max(sceneDuration - duration, 0));
  const center = snappedStart + duration / 2;
  const targetPart =
    timeline.find(
      (part) =>
        duration <= part.duration && center >= part.start && center < part.end,
    ) ??
    timeline.find(
      (part) =>
        duration <= part.duration &&
        snappedStart >= part.start &&
        snappedStart + duration <= part.end,
    ) ??
    timeline.find((part) => duration <= part.duration) ??
    timeline[0];

  if (!targetPart) return { partId: "", start: 0 };

  const partStart = clamp(
    snappedStart,
    targetPart.start,
    Math.max(targetPart.end - duration, targetPart.start),
  );
  return { partId: targetPart.id, start: partStart - targetPart.start };
}

export function uniqueTimelineDragItems(items: TimelineMarkerDragItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.partId}:${item.markerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getTimelineDragConstraintItems(
  items: Array<{ absoluteStart: number; duration: number; groupId?: string }>,
) {
  const groupedItems = new Map<
    string,
    Array<{ absoluteStart: number; duration: number }>
  >();
  const ungroupedItems: Array<{ absoluteStart: number; duration: number }> = [];

  for (const item of items) {
    if (!item.groupId) {
      ungroupedItems.push(item);
      continue;
    }
    groupedItems.set(item.groupId, [
      ...(groupedItems.get(item.groupId) ?? []),
      item,
    ]);
  }

  return [
    ...ungroupedItems,
    ...Array.from(groupedItems.values()).map((groupItems) => {
      const absoluteStart = Math.min(
        ...groupItems.map((item) => item.absoluteStart),
      );
      const absoluteEnd = Math.max(
        ...groupItems.map((item) => item.absoluteStart + item.duration),
      );
      return { absoluteStart, duration: absoluteEnd - absoluteStart };
    }),
  ];
}

export function getTimelineMarkerGapIntervals(
  timeline: TimelinePart[],
  motionKind: MotionBlockEffectKind | undefined,
  duration: number,
  absoluteStart: number,
  movingKeys: Set<string>,
) {
  return timeline.flatMap((timelinePart) => {
    if (duration > timelinePart.duration) return [];

    const blockers = getCanonicalMotionMarkers(timelinePart)
      .filter((marker) => !motionKind || marker.kind === motionKind)
      .filter((marker) => !movingKeys.has(`${timelinePart.id}:${marker.id}`))
      .map((marker) => ({
        start: timelinePart.start + marker.start,
        end: timelinePart.start + marker.start + marker.duration,
      }))
      .sort((left, right) => left.start - right.start);
    const gaps: Array<{ start: number; end: number }> = [];
    let cursor = timelinePart.start;

    for (const blocker of blockers) {
      if (blocker.start - cursor >= duration)
        gaps.push({ start: cursor, end: blocker.start });
      cursor = Math.max(cursor, blocker.end);
    }

    if (timelinePart.end - cursor >= duration)
      gaps.push({ start: cursor, end: timelinePart.end });

    return gaps.map((gap) => ({
      start: gap.start - absoluteStart,
      end: gap.end - duration - absoluteStart,
    }));
  });
}

export function getTimelineMarkerMoves(
  timeline: TimelinePart[],
  items: TimelineMarkerDragItem[],
  delta: number,
  motionKind: MotionBlockEffectKind | undefined,
  activePartIds: Map<string, string>,
  snapThresholdSeconds: number,
): TimelineMarkerMove[] {
  const groupedItems = new Map<string, TimelineMarkerDragItem[]>();
  const moves: TimelineMarkerMove[] = [];

  for (const item of items) {
    if (!item.groupId) {
      const nextPlacement =
        getCrossPartMarkerPlacement(
          timeline,
          item.absoluteStart + delta,
          item.duration,
        ) ??
        getMarkerPlacement(
          timeline,
          item.absoluteStart + delta,
          item.duration,
          snapThresholdSeconds,
          false,
          motionKind,
          {
            kind: motionKind ?? "pan",
            partId: item.partId,
            markerId: item.markerId,
          },
        );
      moves.push({
        sourcePartId:
          activePartIds.get(`${item.partId}:${item.markerId}`) ??
          activePartIds.get(item.markerId) ??
          item.partId,
        markerId: item.markerId,
        targetPartId: nextPlacement.partId,
        start: nextPlacement.start,
      });
      continue;
    }

    groupedItems.set(item.groupId, [
      ...(groupedItems.get(item.groupId) ?? []),
      item,
    ]);
  }

  for (const groupItems of groupedItems.values()) {
    const groupStart = Math.min(
      ...groupItems.map((item) => item.absoluteStart),
    );
    const groupEnd = Math.max(
      ...groupItems.map((item) => item.absoluteStart + item.duration),
    );
    const groupDuration = groupEnd - groupStart;
    const firstItem = groupItems[0];
    const nextPlacement =
      getCrossPartMarkerPlacement(
        timeline,
        groupStart + delta,
        groupDuration,
      ) ??
      getMarkerPlacement(
        timeline,
        groupStart + delta,
        groupDuration,
        snapThresholdSeconds,
        false,
        motionKind,
        {
          kind: motionKind ?? "pan",
          partId: firstItem.partId,
          markerId: firstItem.markerId,
        },
      );

    for (const item of groupItems) {
      moves.push({
        sourcePartId:
          activePartIds.get(`${item.partId}:${item.markerId}`) ??
          activePartIds.get(item.markerId) ??
          item.partId,
        markerId: item.markerId,
        targetPartId: nextPlacement.partId,
        start: nextPlacement.start + item.absoluteStart - groupStart,
      });
    }
  }

  return moves;
}

function getCrossPartMarkerPlacement(
  timeline: TimelinePart[],
  absoluteStart: number,
  duration: number,
) {
  const sceneEnd = timelineDuration(timeline);
  const center = clamp(
    absoluteStart + duration / 2,
    0,
    sceneEnd > 0 ? sceneEnd - 0.000001 : 0,
  );
  const targetPart = getTimelinePartAtTime(timeline, center);
  return targetPart
    ? { partId: targetPart.id, start: absoluteStart - targetPart.start }
    : null;
}

export function exactMarkerPlacementInTimeline(
  timeline: TimelinePart[],
  absoluteStart: number,
  duration: number,
) {
  const targetPart = timeline.find(
    (timelinePart) =>
      duration <= timelinePart.duration &&
      absoluteStart >= timelinePart.start &&
      absoluteStart + duration <= timelinePart.end,
  );
  return targetPart
    ? { partId: targetPart.id, start: absoluteStart - targetPart.start }
    : null;
}

export function getMendedMarkerDragItems(
  timeline: TimelinePart[],
  part: TimelinePart,
  markerId: string,
  _motionKind?: MotionBlockEffectKind,
): TimelineMarkerDragItem[] {
  const sourceMarkers = getCanonicalMotionMarkers(part).filter(
    (marker) => !effectBlocksMending(marker.effectId),
  );
  const targetMarker = sourceMarkers.find((marker) => marker.id === markerId);
  if (!targetMarker) return [];
  const targetMendKey = getMotionMarkerMendKey(targetMarker);
  const markers = timeline.flatMap((timelinePart) =>
    getCanonicalMotionMarkers(timelinePart)
      .filter((marker) => !effectBlocksMending(marker.effectId))
      .filter((marker) => getMotionMarkerMendKey(marker) === targetMendKey)
      .map((marker) => ({
        partId: timelinePart.id,
        marker,
        absoluteStart: timelinePart.start + marker.start,
      })),
  );
  const sortedMarkers = [...markers].sort(
    (left, right) => left.absoluteStart - right.absoluteStart,
  );
  const markerIndex = sortedMarkers.findIndex(
    (item) => item.partId === part.id && item.marker.id === markerId,
  );
  if (markerIndex < 0) return [];

  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (firstIndex > 0) {
    const previous = sortedMarkers[firstIndex - 1];
    const current = sortedMarkers[firstIndex];
    if (
      !isExplicitTimelineMarkerMend(
        {
          ...previous.marker,
          partId: previous.partId,
          start: previous.absoluteStart,
        },
        {
          ...current.marker,
          partId: current.partId,
          start: current.absoluteStart,
        },
      )
    )
      break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (
      !isExplicitTimelineMarkerMend(
        {
          ...current.marker,
          partId: current.partId,
          start: current.absoluteStart,
        },
        { ...next.marker, partId: next.partId, start: next.absoluteStart },
      )
    )
      break;
    lastIndex += 1;
  }

  const groupId =
    firstIndex === lastIndex
      ? undefined
      : `${sortedMarkers[firstIndex].partId}:${sortedMarkers[firstIndex].marker.id}:${sortedMarkers[lastIndex].partId}:${sortedMarkers[lastIndex].marker.id}`;

  return sortedMarkers.slice(firstIndex, lastIndex + 1).map((item) => ({
    partId: item.partId,
    markerId: item.marker.id,
    absoluteStart: item.absoluteStart,
    duration: item.marker.duration,
    groupId,
  }));
}

export function isTimelineMarkerMendedEdge(
  timeline: TimelinePart[],
  part: TimelinePart,
  marker: MotionMarker,
  edge: "start" | "end",
) {
  if (effectBlocksMending(marker.effectId)) return false;
  const markers = timeline
    .flatMap((timelinePart) =>
      getCanonicalMotionMarkers(timelinePart)
        .filter(
          (item) =>
            getMotionMarkerMendKey(item) === getMotionMarkerMendKey(marker) &&
            !effectBlocksMending(item.effectId),
        )
        .map((item) => ({
          ...item,
          partId: timelinePart.id,
          start: timelinePart.start + item.start,
        })),
    )
    .sort((left, right) => left.start - right.start);
  const markerIndex = markers.findIndex(
    (item) => item.partId === part.id && item.id === marker.id,
  );
  if (markerIndex < 0) return false;

  if (edge === "start")
    return Boolean(
      markers[markerIndex - 1] &&
      isExplicitTimelineMarkerMend(
        markers[markerIndex - 1],
        markers[markerIndex],
      ),
    );
  return Boolean(
    markers[markerIndex + 1] &&
    isExplicitTimelineMarkerMend(
      markers[markerIndex],
      markers[markerIndex + 1],
    ),
  );
}

export function getAvailableMotionPlacement(
  markers: Array<{ start: number; duration: number }>,
  partDuration: number,
  preferredTime: number,
) {
  if (partDuration < minimumZoomDuration) return null;

  const occupied = [...markers].sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const marker of occupied) {
    if (marker.start - cursor >= minimumZoomDuration)
      gaps.push({ start: cursor, end: marker.start });
    cursor = Math.max(cursor, marker.start + marker.duration);
  }

  if (partDuration - cursor >= minimumZoomDuration)
    gaps.push({ start: cursor, end: partDuration });

  const preferredStart = clamp(
    preferredTime - 0.5,
    0,
    Math.max(partDuration - minimumZoomDuration, 0),
  );
  let bestPlacement: {
    start: number;
    duration: number;
    distance: number;
  } | null = null;

  for (const gap of gaps) {
    const gapDuration = gap.end - gap.start;
    const duration = Math.min(defaultZoomDuration, gapDuration);
    const start = clamp(preferredStart, gap.start, gap.end - duration);
    const end = start + duration;
    const distance =
      preferredTime >= start && preferredTime <= end
        ? 0
        : Math.min(
            Math.abs(preferredTime - start),
            Math.abs(preferredTime - end),
          );

    if (!bestPlacement || distance < bestPlacement.distance)
      bestPlacement = { start, duration, distance };
  }

  if (!bestPlacement) return null;
  return {
    start: roundTenth(bestPlacement.start),
    duration: roundTenth(bestPlacement.duration),
  };
}

export function getTranslationMarkerLayerKind(
  marker: Pick<MotionMarker, "effectId" | "kind">,
): Exclude<MotionEffectKind, "zoom"> {
  const effectKind = getMotionBlockEffectKind(marker);
  if (effectKind === "rotate") return "rotate";
  if (effectKind === "perspective") return "perspective";
  return "pan";
}

function defaultMiddleSnapLayerId(marker: MiddleSnapMarker) {
  return marker.layerId ?? "";
}

function middleSnapLayerGroups<T extends MiddleSnapMarker>(
  markers: T[],
  getLayerId: MiddleSnapLayerResolver<T>,
) {
  const groups = new Map<string, T[]>();
  for (const marker of markers) {
    const layerId = getLayerId(marker);
    groups.set(layerId, [...(groups.get(layerId) ?? []), marker]);
  }
  return Array.from(groups.values()).map((group) =>
    group.sort((left, right) => left.start - right.start),
  );
}

export function getMotionMiddleSnap<T extends MiddleSnapMarker>(
  markers: T[],
  preferredTime: number,
  getLayerId: MiddleSnapLayerResolver<T> = defaultMiddleSnapLayerId,
) {
  const time = roundTenth(preferredTime);
  const tolerance = 0.12;

  for (const sortedMarkers of middleSnapLayerGroups(markers, getLayerId)) {
    for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
      const previous = sortedMarkers[index];
      const next = sortedMarkers[index + 1];
      if (!canMendTimelineMarkers(previous, next)) continue;
      const previousEnd = previous.start + previous.duration;
      const nextStart = next.start;

      if (previousEnd > nextStart) continue;
      if (time < previousEnd - tolerance || time > nextStart + tolerance)
        continue;

      const snapTime = roundTenth(clamp(time, previousEnd, nextStart));
      const previousDuration = snapTime - previous.start;
      const nextDuration = next.start + next.duration - snapTime;

      if (
        previousDuration >= minimumZoomDuration &&
        nextDuration >= minimumZoomDuration
      ) {
        return {
          pairs: [{ previousId: previous.id, nextId: next.id, time: snapTime }],
        };
      }
    }
  }

  return null;
}

export function getSelectedMotionMiddleSnap<T extends MiddleSnapMarker>(
  markers: T[],
  selectedMarkerIds: string[],
  getLayerId: MiddleSnapLayerResolver<T> = defaultMiddleSnapLayerId,
) {
  const selectedIds = new Set(selectedMarkerIds);
  if (selectedIds.size < 2) return null;

  const selectedLayerIds = new Set(
    markers.filter((marker) => selectedIds.has(marker.id)).map(getLayerId),
  );
  if (selectedLayerIds.size !== 1) return null;
  const selectedLayerId = [...selectedLayerIds][0];
  const sortedMarkers = markers
    .filter((marker) => getLayerId(marker) === selectedLayerId)
    .sort((left, right) => left.start - right.start);
  const selectedIndexes = sortedMarkers
    .map((marker, index) => (selectedIds.has(marker.id) ? index : -1))
    .filter((index) => index >= 0);
  if (selectedIndexes.length !== selectedIds.size) return null;

  for (let index = 1; index < selectedIndexes.length; index += 1) {
    if (selectedIndexes[index] !== selectedIndexes[index - 1] + 1) return null;
  }

  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];

  for (let index = 0; index < selectedIndexes.length - 1; index += 1) {
    const previous = sortedMarkers[selectedIndexes[index]];
    const next = sortedMarkers[selectedIndexes[index + 1]];
    if (!canMendTimelineMarkers(previous, next)) return null;

    const previousEnd = previous.start + previous.duration;
    const nextStart = next.start;
    if (!areTimelineMarkersAdjacent(previous, next)) return null;
    pairs.push({
      previousId: previous.id,
      nextId: next.id,
      time: roundTenth(previousEnd),
    });
  }

  return pairs.length === selectedIndexes.length - 1 ? { pairs } : null;
}

export function getSelectedActiveMiddleMend<T extends MiddleSnapMarker>(
  markers: T[],
  selectedMarkerIds: string[],
  getLayerId: MiddleSnapLayerResolver<T> = defaultMiddleSnapLayerId,
) {
  const selectedIds = new Set(selectedMarkerIds);
  if (selectedIds.size === 0) return null;

  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];
  for (const sortedMarkers of middleSnapLayerGroups(markers, getLayerId)) {
    for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
      const previous = sortedMarkers[index];
      const next = sortedMarkers[index + 1];
      if (!selectedIds.has(previous.id) && !selectedIds.has(next.id)) continue;
      if (!isExplicitTimelineMarkerMend(previous, next)) continue;
      pairs.push({
        previousId: previous.id,
        nextId: next.id,
        time: roundTenth(previous.start + previous.duration),
      });
    }
  }

  return pairs.length > 0 ? { pairs } : null;
}

export function isMotionMiddleSnapActive(
  markers: MiddleSnapMarker[],
  snap: {
    pairs: Array<{ previousId: string; nextId: string; time: number }>;
  } | null,
) {
  if (!snap) return false;
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));

  return snap.pairs.every((pair) => {
    const previous = markersById.get(pair.previousId);
    const next = markersById.get(pair.nextId);
    if (!previous || !next) return false;
    return isExplicitTimelineMarkerMend(previous, next);
  });
}

export function resizeTimelineMarkersWithPush<
  T extends {
    id: string;
    start: number;
    duration: number;
    snapIn?: boolean;
    snapOut?: boolean;
    mendInId?: string;
    mendOutId?: string;
    partId?: string;
    sourcePartId?: string;
  },
>(
  markers: T[],
  markerId: string,
  action: "start" | "end",
  rawDelta: number,
  maxEnd: number,
  minStart = 0,
  sourcePartId?: string,
  precision = 2,
): T[] {
  const sortedMarkers = [...markers].sort(
    (left, right) => left.start - right.start,
  );
  const markerIndex = sortedMarkers.findIndex(
    (marker) =>
      marker.id === markerId &&
      (sourcePartId === undefined ||
        (marker.sourcePartId ?? marker.partId) === sourcePartId),
  );
  const targetMarker = sortedMarkers[markerIndex];
  if (!targetMarker) return markers;
  const r = (v: number) => roundToPrecision(v, precision);

  const bounds = new Map<string, { start: number; duration: number }>();
  const chain = getExplicitTimelineMarkerMendChain(sortedMarkers, markerIndex);
  if (chain.firstIndex !== chain.lastIndex) {
    const firstMarker = sortedMarkers[chain.firstIndex];
    const lastMarker = sortedMarkers[chain.lastIndex];
    const chainStart = firstMarker.start;
    const chainEnd = lastMarker.start + lastMarker.duration;
    if (action === "start") {
      if (markerIndex !== chain.firstIndex) {
        const previousMarker = sortedMarkers[markerIndex - 1];
        if (
          !previousMarker ||
          !isExplicitTimelineMarkerMend(previousMarker, targetMarker)
        )
          return markers;
        const markerEnd = targetMarker.start + targetMarker.duration;
        const seamOffset =
          targetMarker.start - (previousMarker.start + previousMarker.duration);
        const nextStart = clamp(
          targetMarker.start + rawDelta,
          previousMarker.start + minimumZoomDuration + seamOffset,
          markerEnd - minimumZoomDuration,
        );
        const previousEnd = nextStart - seamOffset;
        const roundedPreviousDuration = r(previousEnd - previousMarker.start);
        const roundedNextStart = r(
          previousMarker.start + roundedPreviousDuration + seamOffset,
        );
        bounds.set(timelineMarkerBoundsKey(previousMarker), {
          start: previousMarker.start,
          duration: roundedPreviousDuration,
        });
        bounds.set(timelineMarkerBoundsKey(targetMarker), {
          start: roundedNextStart,
          duration: r(markerEnd - roundedNextStart),
        });
        return applyMarkerBounds(markers, bounds);
      }
      const fixedEnd = firstMarker.start + firstMarker.duration;
      const nextStart = clamp(
        chainStart + rawDelta,
        minStart,
        fixedEnd - minimumZoomDuration,
      );
      const roundedStart = r(nextStart);
      bounds.set(timelineMarkerBoundsKey(firstMarker), {
        start: roundedStart,
        duration: r(fixedEnd - roundedStart),
      });
      return applyMarkerBounds(markers, bounds);
    }

    if (markerIndex !== chain.lastIndex) {
      const nextMarker = sortedMarkers[markerIndex + 1];
      if (
        !nextMarker ||
        !isExplicitTimelineMarkerMend(targetMarker, nextMarker)
      )
        return markers;
      const markerStart = targetMarker.start;
      const markerEnd = targetMarker.start + targetMarker.duration;
      const nextMarkerEnd = nextMarker.start + nextMarker.duration;
      const seamOffset = nextMarker.start - markerEnd;
      const nextEnd = clamp(
        markerEnd + rawDelta,
        markerStart + minimumZoomDuration,
        nextMarkerEnd - seamOffset - minimumZoomDuration,
      );
      const nextMarkerStart = nextEnd + seamOffset;
      bounds.set(timelineMarkerBoundsKey(targetMarker), {
        start: markerStart,
        duration: r(nextEnd - markerStart),
      });
      bounds.set(timelineMarkerBoundsKey(nextMarker), {
        start: r(nextMarkerStart),
        duration: r(nextMarkerEnd - nextMarkerStart),
      });
      return applyMarkerBounds(markers, bounds);
    }
    const nextEnd = clamp(
      chainEnd + rawDelta,
      chainStart + minimumZoomDuration,
      maxEnd,
    );
    bounds.set(timelineMarkerBoundsKey(lastMarker), {
      start: lastMarker.start,
      duration: r(nextEnd - lastMarker.start),
    });
    return applyMarkerBounds(markers, bounds);
  }

  const markerStart = targetMarker.start;
  const markerEnd = targetMarker.start + targetMarker.duration;
  if (action === "end") {
    const nextEnd = clamp(
      markerEnd + rawDelta,
      markerStart + minimumZoomDuration,
      maxEnd,
    );
    bounds.set(timelineMarkerBoundsKey(targetMarker), {
      start: markerStart,
      duration: r(nextEnd - markerStart),
    });
    return applyMarkerBounds(markers, bounds);
  }

  const nextStart = clamp(
    markerStart + rawDelta,
    minStart,
    markerEnd - minimumZoomDuration,
  );
  const roundedStart = r(nextStart);
  bounds.set(timelineMarkerBoundsKey(targetMarker), {
    start: roundedStart,
    duration: r(markerEnd - roundedStart),
  });
  return applyMarkerBounds(markers, bounds);
}

function getExplicitTimelineMarkerMendChain<
  T extends {
    id: string;
    start: number;
    duration: number;
    snapIn?: boolean;
    snapOut?: boolean;
    mendInId?: string;
    mendOutId?: string;
    partId?: string;
    sourcePartId?: string;
  },
>(sortedMarkers: T[], markerIndex: number) {
  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (
    firstIndex > 0 &&
    isExplicitTimelineMarkerMend(
      sortedMarkers[firstIndex - 1],
      sortedMarkers[firstIndex],
    )
  )
    firstIndex -= 1;
  while (
    lastIndex < sortedMarkers.length - 1 &&
    isExplicitTimelineMarkerMend(
      sortedMarkers[lastIndex],
      sortedMarkers[lastIndex + 1],
    )
  )
    lastIndex += 1;

  return { firstIndex, lastIndex };
}

export function resizeTimelineMarkerFreely<
  T extends { id: string; start: number; duration: number },
>(
  markers: T[],
  markerId: string,
  action: "start" | "end",
  rawDelta: number,
  maxEnd: number,
  minStart = 0,
  precision = 2,
): T[] {
  const r = (v: number) => roundToPrecision(v, precision);
  return markers.map((marker) => {
    if (marker.id !== markerId) return marker;

    const markerStart = marker.start;
    const markerEnd = marker.start + marker.duration;
    if (action === "end") {
      const nextEnd = clamp(
        markerEnd + rawDelta,
        markerStart + minimumZoomDuration,
        maxEnd,
      );
      return { ...marker, duration: r(nextEnd - markerStart) };
    }

    const nextStart = clamp(
      markerStart + rawDelta,
      minStart,
      markerEnd - minimumZoomDuration,
    );
    return {
      ...marker,
      start: r(nextStart),
      duration: r(markerEnd - nextStart),
    };
  });
}

function timelineMarkerBoundsKey(marker: {
  id: string;
  partId?: string;
  sourcePartId?: string;
}) {
  return `${marker.sourcePartId ?? marker.partId ?? ""}:${marker.id}`;
}

function applyMarkerBounds<
  T extends { id: string; start: number; duration: number },
>(markers: T[], bounds: Map<string, { start: number; duration: number }>): T[] {
  return markers.map((marker) => {
    const nextBounds = bounds.get(timelineMarkerBoundsKey(marker));
    return nextBounds
      ? { ...marker, start: nextBounds.start, duration: nextBounds.duration }
      : marker;
  });
}

export function getMiddleTransitionMode(
  markers: Array<{ id: string; middleTransition?: "transition" }>,
  snap: { pairs: Array<{ nextId: string }> } | null,
): "instant" | "transition" {
  if (!snap) return "instant";
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  return snap.pairs.every(
    (pair) => markersById.get(pair.nextId)?.middleTransition === "transition",
  )
    ? "transition"
    : "instant";
}

export function getAdjustmentLayerRowId(
  layer: Pick<AdjustmentLayer, "effect" | "layerId">,
) {
  return layer.layerId ?? layer.effect.effectId;
}

export function removeTimelineAdjustmentLayerMarkers(
  layers: AdjustmentLayer[],
  layerId: string,
) {
  return layers.filter((layer) => getAdjustmentLayerRowId(layer) !== layerId);
}

export function removeTimelineMotionLayerMarkers<
  T extends { motionMarkers?: MotionMarker[] },
>(timeline: T[], layerId: string): T[] {
  return timeline.map((timelinePart) => {
    const motionMarkers = getCanonicalMotionMarkers(timelinePart).filter(
      (marker) => !isMotionMarkerOnLayerId(marker, layerId),
    );
    if (motionMarkers.length === getCanonicalMotionMarkers(timelinePart).length)
      return timelinePart;
    return { ...timelinePart, ...withCanonicalMotionMarkers(motionMarkers) };
  });
}

function markerIdentityKeys(marker: {
  id: string;
  partId?: string;
  sourcePartId?: string;
  rawMarkerId?: string;
}) {
  const partId = marker.partId ?? marker.sourcePartId;
  const keys = partId ? [marker.id, `${partId}:${marker.id}`] : [marker.id];
  if (marker.rawMarkerId) keys.push(marker.rawMarkerId);
  return new Set(keys);
}

export function isExplicitTimelineMarkerMend(
  previous: TimelineMendMarker,
  next: TimelineMendMarker,
) {
  return (
    !previous.snapOut &&
    !next.snapIn &&
    canMendTimelineMarkers(previous, next) &&
    areTimelineMarkersAdjacent(previous, next) &&
    hasExplicitTimelineMarkerMendReference(previous, next)
  );
}

function areTimelineMarkersAdjacent(
  previous: { start: number; duration: number },
  next: { start: number },
) {
  return Math.abs(previous.start + previous.duration - next.start) <= 0.001;
}

function hasExplicitTimelineMarkerMendReference(
  previous: {
    id: string;
    snapOut?: boolean;
    mendOutId?: string;
    partId?: string;
    sourcePartId?: string;
    rawMarkerId?: string;
  },
  next: {
    id: string;
    snapIn?: boolean;
    mendInId?: string;
    partId?: string;
    sourcePartId?: string;
    rawMarkerId?: string;
  },
) {
  return Boolean(
    previous.mendOutId &&
    next.mendInId &&
    markerIdentityKeys(next).has(previous.mendOutId) &&
    markerIdentityKeys(previous).has(next.mendInId),
  );
}

export function expandExplicitTimelineMarkerMendIds<
  T extends {
    id: string;
    start: number;
    snapIn?: boolean;
    snapOut?: boolean;
    mendInId?: string;
    mendOutId?: string;
    partId?: string;
    sourcePartId?: string;
    rawMarkerId?: string;
  },
>(markers: T[], seedIds: Set<string>, partId?: string) {
  const expandedIds = new Set(seedIds);
  const normalizedMarkers = markers.map((marker) => ({
    ...marker,
    partId: marker.partId ?? marker.sourcePartId ?? partId,
  }));
  let changed = true;

  while (changed) {
    changed = false;
    for (const previous of normalizedMarkers) {
      for (const next of normalizedMarkers) {
        if (
          previous === next ||
          !hasExplicitTimelineMarkerMendReference(previous, next)
        )
          continue;
        if (!expandedIds.has(previous.id) && !expandedIds.has(next.id))
          continue;
        const size = expandedIds.size;
        expandedIds.add(previous.id);
        expandedIds.add(next.id);
        changed ||= expandedIds.size !== size;
      }
    }
  }

  return expandedIds;
}

function getHiddenLayerIds(
  layers: Array<{ id: string; hidden?: boolean }> | undefined,
) {
  return new Set(
    (layers ?? []).filter((layer) => layer.hidden).map((layer) => layer.id),
  );
}

function getLayerOrderIndex(layers: Array<{ id: string }> | undefined) {
  return new Map((layers ?? []).map((layer, index) => [layer.id, index]));
}

function getLayerIndex(rowOrder: Map<string, number>, layerId: string) {
  return rowOrder.get(layerId) ?? Number.MAX_SAFE_INTEGER;
}
