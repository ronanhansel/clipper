import { getMotionMarkerLayerId, getTimelineDragConstraintItems, getTimelineMarkerMoves, resizeTimelineMarkersWithPush, type TimelineMarkerDragItem, type TimelineMarkerMove, type TimelineMarkerResize } from "./timeline";
import { getTimelineBlockTiming } from "./timelineBlockTiming";
import { computeBulkLayerTargets, getTimelineLayerRowAtClientYClamped, resolveTimelineMoveSourceLayer, type TimelineLayerCategory, type TimelineLayerLayout } from "./timelineLayers";
import { roundToPrecision } from "./math";
import type { MotionBlockEffectKind, MotionMarker, TimelinePart } from "./types";

export type AbsoluteTimelineMarker<T extends { id: string; start: number; duration: number }> = T & {
  sourcePartId: string;
  sourcePartStart: number;
};

export type TimelinePartMotionView = TimelinePart & {
  motionMarkers: MotionMarker[];
};

export type TimelineMarkerResizeTarget<T extends { id: string }> = {
  part: TimelinePart;
  marker: T;
};

export type TimelineMarkerMoveState = {
  blockDeltaSeconds: number;
  guideTime: number | null;
  layerTargets: Map<string, string>;
  moves: TimelineMarkerMove[];
};

export function uniqueTimelineResizeTargets<T extends { id: string }>(targets: Array<TimelineMarkerResizeTarget<T>>) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.part.id}:${target.marker.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function uniqueAbsoluteTimelineMarkers<T extends { id: string }>(markers: Array<T & { sourcePartId: string }>) {
  return Array.from(new Map(markers.map((marker) => [`${marker.sourcePartId}:${marker.id}`, marker])).values());
}

export function getAbsoluteTimelineMarkerResizeMarkers<T extends { id: string; kind: MotionBlockEffectKind; start: number; duration: number; layerId?: string }>(
  timeline: TimelinePartMotionView[],
  target: TimelineMarkerResizeTarget<T>,
): Array<AbsoluteTimelineMarker<T>> {
  const targetLayerId = getMotionMarkerLayerId(target.marker);
  const targetKind = target.marker.kind;
  return timeline.flatMap((timelinePart) => timelinePart.motionMarkers
    .filter((marker) => getMotionMarkerLayerId(marker) === targetLayerId && marker.kind === targetKind)
    .map((marker) => ({ ...(marker as unknown as T), sourcePartId: timelinePart.id, sourcePartStart: timelinePart.start, start: timelinePart.start + marker.start })));
}

export function getTimelineMarkerResizeState<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(input: {
  markers: Array<AbsoluteTimelineMarker<T>>;
  markerId: string;
  sourcePartId: string;
  action: "start" | "end";
  deltaSeconds: number;
  precision: number;
}) {
  return resizeTimelineMarkersWithPush(input.markers, input.markerId, input.action, input.deltaSeconds, Number.POSITIVE_INFINITY, 0, input.sourcePartId, input.precision).filter((marker) => {
    const initial = input.markers.find((item) => item.id === marker.id && item.sourcePartId === marker.sourcePartId);
    return initial && (initial.start !== marker.start || initial.duration !== marker.duration);
  });
}

export function getTimelineMarkerResizeCommits<T extends { id: string; start: number; duration: number }>(markers: Array<AbsoluteTimelineMarker<T>>, precision: number): TimelineMarkerResize[] {
  const r = (value: number) => roundToPrecision(value, precision);
  return markers.map((marker) => ({ sourcePartId: marker.sourcePartId, markerId: marker.id, absoluteStart: r(marker.start), duration: r(marker.duration) }));
}

export function getTimelineMarkerResizePreviewMap<T extends { id: string; start: number; duration: number }>(markers: Array<AbsoluteTimelineMarker<T>>) {
  return markers.reduce((byPart, marker) => {
    const partMarkers = byPart.get(marker.sourcePartId) ?? [];
    partMarkers.push({ ...marker, start: marker.start - marker.sourcePartStart });
    byPart.set(marker.sourcePartId, partMarkers);
    return byPart;
  }, new Map<string, Array<AbsoluteTimelineMarker<T>>>());
}

export function getTimelineMarkerMoveDelta(input: {
  items: TimelineMarkerDragItem[];
  rawDeltaSeconds: number;
  timelineDuration: number;
  snap: boolean;
  snapBoundaries: number[];
  snapThresholdSeconds: number;
}) {
  const constraintItems = getTimelineDragConstraintItems(input.items);
  const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
  const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
  const timing = getTimelineBlockTiming({
    action: "move",
    initialStart: blockStart,
    initialDuration: blockEnd - blockStart,
    deltaSeconds: input.rawDeltaSeconds,
    timelineDuration: input.timelineDuration,
    minDuration: 0.1,
    moveMaxStartMode: "start",
    endMaxMode: "none",
    snap: input.snap,
    snapBoundaries: input.snapBoundaries,
    snapThresholdSeconds: input.snapThresholdSeconds,
    moveSnapEdge: input.rawDeltaSeconds < 0 ? "start" : input.rawDeltaSeconds > 0 ? "end" : "nearest",
  });
  return { blockDeltaSeconds: timing.start - blockStart, guideTime: timing.guideTime };
}

export function getTimelineMarkerMoveState(input: {
  timeline: TimelinePart[];
  dragItems: TimelineMarkerDragItem[];
  rawDeltaSeconds: number;
  timelineDuration: number;
  snap: boolean;
  snapBoundaries: number[];
  snapThresholdSeconds: number;
  motionKind: MotionBlockEffectKind | undefined;
  activePartIds: Map<string, string>;
  layerLayout: TimelineLayerLayout;
  sourceLayerId: string;
  markerLayerLookup: Map<string, string>;
  containerRect: Pick<DOMRect, "top"> | null | undefined;
  clientY: number;
  isLayerLocked: (category: TimelineLayerCategory, layerId: string) => boolean;
}): TimelineMarkerMoveState {
  const { blockDeltaSeconds, guideTime } = getTimelineMarkerMoveDelta({
    items: input.dragItems,
    rawDeltaSeconds: input.rawDeltaSeconds,
    timelineDuration: input.timelineDuration,
    snap: input.snap,
    snapBoundaries: input.snapBoundaries,
    snapThresholdSeconds: input.snapThresholdSeconds,
  });
  const normalizedSource = resolveTimelineMoveSourceLayer(input.layerLayout, "motion", input.sourceLayerId);
  const cursorRow = getTimelineLayerRowAtClientYClamped(input.layerLayout, input.containerRect, input.clientY, "motion");
  const cursorLayerId = cursorRow?.row.key && !input.isLayerLocked("motion", cursorRow.row.key) ? cursorRow.row.key : undefined;
  const layerTargets = computeBulkLayerTargets(
    input.layerLayout,
    "motion",
    normalizedSource,
    cursorLayerId,
    input.dragItems.map((item) => ({ id: `${item.partId}:${item.markerId}`, layerId: input.markerLayerLookup.get(`${item.partId}:${item.markerId}`) })),
    normalizedSource,
  );
  const fallbackLayer = normalizedSource || input.layerLayout.rows.find((row) => row.category === "motion")?.key || "";
  const moves = getTimelineMarkerMoves(input.timeline, input.dragItems, blockDeltaSeconds, input.motionKind, input.activePartIds, input.snapThresholdSeconds).map((move) => ({
    ...move,
    targetLayerId: layerTargets.get(`${move.sourcePartId}:${move.markerId}`) || fallbackLayer,
  }));
  return { blockDeltaSeconds, guideTime, layerTargets, moves };
}
