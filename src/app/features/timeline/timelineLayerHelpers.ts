import type { Part, TimelineClip, TimelineMotionLayerKind } from "../../../core/types";

export function timelineClipFromPart(item: Part): TimelineClip {
  return {
    id: item.id,
    compositionId: item.compositionId ?? item.id,
    start: item.start,
    trimStart: item.trimStart,
    layerId: item.layerId,
    duration: item.duration,
    prerender: item.prerender || undefined,
    motionMarkers: item.motionMarkers ?? [],
    animationGraph: item.animationGraph,
    renderMode: item.renderMode,
  };
}

export function createBlankCompositionLayer() {
  return { id: "comp", name: "Composition" };
}

export function createBlankAdjustmentLayer() {
  return { id: "adjust", name: "Adjust" };
}

export function createBlankMotionLayer() {
  return { id: "motion", kind: "empty" as const, name: "Motion" };
}

export function createMotionTimelineLayer(kind: TimelineMotionLayerKind = "empty") {
  return { id: `motion_${Date.now().toString(36)}`, kind: kind === "empty" ? "empty" : "motion", name: kind === "empty" ? "New Motion" : "Motion" } as const;
}

export function createAdjustmentTimelineLayer() {
  return { id: `adjust_${Date.now().toString(36)}`, name: "New Adjust" };
}

export function createCompositionTimelineLayer() {
  return { id: `comp_${Date.now().toString(36)}`, name: "New Composition" };
}
