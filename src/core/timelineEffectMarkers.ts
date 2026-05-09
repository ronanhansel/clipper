import {
  getEffectPackage,
  getEffectPackageTimelineLaneCategory,
} from "./effects/registry";
import { getAdjustmentLayerRowId, getMotionMarkerLayerId } from "./timeline";
import type { TimelineLayerCategory } from "./timelineLayers";
import type {
  AdjustmentLayer,
  MotionMarker,
  TimelinePart,
  TransitionLayer,
} from "./types";

export type TimelineEffectMarkerKind = "adjustment" | "motion" | "transition";

export type NormalizedTimelineEffectMarker = {
  kind: TimelineEffectMarkerKind;
  id: string;
  effectId: string;
  laneCategory: Exclude<TimelineLayerCategory, "comp">;
  rowKey: string;
  start: number;
  duration: number;
  partId?: string;
  markerId?: string;
  midPoint?: number;
};

export function getTimelineEffectLaneCategory(effectId: string) {
  return getEffectPackageTimelineLaneCategory(effectId);
}

export function isTimelineEffectCompatibleWithLane(
  effectId: string,
  laneCategory: TimelineLayerCategory,
) {
  return getTimelineEffectLaneCategory(effectId) === laneCategory;
}

export function getTimelineEffectForLane(
  effectId: string,
  laneCategory: TimelineLayerCategory,
) {
  const effect = getEffectPackage(effectId);
  return effect && isTimelineEffectCompatibleWithLane(effectId, laneCategory)
    ? effect
    : undefined;
}

export function normalizeAdjustmentTimelineMarker(
  layer: AdjustmentLayer,
): NormalizedTimelineEffectMarker {
  return {
    kind: "adjustment",
    id: layer.id,
    effectId: layer.effect.effectId,
    laneCategory:
      getTimelineEffectLaneCategory(layer.effect.effectId) ?? "adjust",
    rowKey: getAdjustmentLayerRowId(layer),
    start: layer.start,
    duration: layer.duration,
  };
}

export function normalizeMotionTimelineMarker(
  part: Pick<TimelinePart, "id" | "start">,
  marker: MotionMarker,
): NormalizedTimelineEffectMarker {
  return {
    kind: "motion",
    id: `${part.id}:${marker.id}`,
    effectId: marker.effectId,
    laneCategory: getTimelineEffectLaneCategory(marker.effectId) ?? "motion",
    rowKey: getMotionMarkerLayerId(marker),
    start: part.start + marker.start,
    duration: marker.duration,
    partId: part.id,
    markerId: marker.id,
  };
}

export function normalizeTransitionTimelineMarker(
  layer: TransitionLayer,
): NormalizedTimelineEffectMarker {
  return {
    kind: "transition",
    id: layer.id,
    effectId: layer.effect.effectId,
    laneCategory:
      getTimelineEffectLaneCategory(layer.effect.effectId) ?? "transition",
    rowKey: layer.layerId ?? layer.effect.effectId,
    start: layer.start,
    duration: layer.duration,
    midPoint: layer.midPoint,
  };
}

export function timelineEffectMarkerRange(
  marker: Pick<NormalizedTimelineEffectMarker, "start" | "duration">,
) {
  return { start: marker.start, end: marker.start + marker.duration };
}
