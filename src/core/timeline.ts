import { defaultZoomDuration, minimumZoomDuration } from "./editorConstants";
import { MAX_PART_DURATION_SECONDS, MAX_SCENE_DURATION_SECONDS, type AdjustmentLayer, type CompositionClip, type Scene, type TimelineComposition, type TimelinePart, type TranslationMarker, type ZoomMarker } from "./types";
import { clamp, roundTenth } from "./math";

export function buildLinearTimeline(scene: Scene): TimelineComposition[] {
  let cursor = 0;
  return scene.compositions.map((composition) => {
    const start = cursor;
    const end = start + composition.duration;
    cursor = end;
    return { ...composition, start, end };
  });
}

export function sceneDuration(scene: Scene) {
  return scene.compositions.reduce((total, composition) => total + composition.duration, 0);
}

export function validateScene(scene: Scene): string[] {
  const errors: string[] = [];
  const duration = sceneDuration(scene);

  if (duration > MAX_SCENE_DURATION_SECONDS) {
    errors.push(`Scene ${scene.name} is ${duration}s and exceeds the 30 minute limit.`);
  }

  scene.compositions.forEach((composition) => {
    if (composition.duration <= 0) {
      errors.push(`Composition ${composition.name} must have a positive duration.`);
    }

    if (composition.duration > MAX_PART_DURATION_SECONDS) {
      errors.push(`Composition ${composition.name} is ${composition.duration}s and exceeds the 1 minute limit.`);
    }
  });

  (scene.adjustmentLayers ?? []).forEach((layer) => {
    if (layer.duration <= 0) errors.push(`Adjustment ${layer.name} must have a positive duration.`);
    if (layer.start < 0) errors.push(`Adjustment ${layer.name} cannot start before the scene.`);
    if (layer.start + layer.duration > duration) errors.push(`Adjustment ${layer.name} extends past the scene end.`);
    if (layer.effect.kind === "frameSkip" && layer.effect.every < 1) errors.push(`Adjustment ${layer.name} must skip at least 1 frame.`);
  });

  return errors;
}

export function getAdjustmentPlacement(layers: AdjustmentLayer[] | undefined, sceneDuration: number, sceneTime: number) {
  const duration = Math.min(3, Math.max(sceneDuration, 0.1));
  return { start: roundTenth(clamp(sceneTime, 0, Math.max(sceneDuration - duration, 0))), duration };
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function updateCompositionObject(compositions: CompositionClip[], compositionId: string, objectId: string, updater: (composition: CompositionClip["objects"][number]) => CompositionClip["objects"][number]) {
  return compositions.map((composition) => {
    if (composition.id !== compositionId) return composition;
    return {
      ...composition,
      objects: composition.objects.map((object) => (object.id === objectId ? updater(object) : object)),
    };
  });
}

/** @deprecated Use updateCompositionObject. */
export const updatePartObject = updateCompositionObject;

export type TimelineMarkerKind = "zoom" | "translation";
export type TimelineMarkerMove = { sourcePartId: string; markerId: string; targetPartId: string; start: number };
export type TimelineMarkerDragItem = { partId: string; markerId: string; absoluteStart: number; duration: number; groupId?: string };

export function getTimelineTicks(duration: number) {
  const step = duration <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let cursor = 0; cursor <= duration; cursor += step) ticks.push(cursor);
  if (!ticks.includes(duration)) ticks.push(duration);
  return ticks;
}

export function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  if (timeline.length === 0) return null;
  if (time >= timeline[timeline.length - 1].end) return timeline[timeline.length - 1];

  let low = 0;
  let high = timeline.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = timeline[middle];
    if (time < item.start) high = middle - 1;
    else if (time >= item.end) low = middle + 1;
    else return item;
  }

  return timeline[0] ?? null;
}

export function getTopTimelineItemAtTime(timeline: TimelineComposition[], time: number, adjustmentLayers: AdjustmentLayer[] = []): { kind: "adjustment"; layer: AdjustmentLayer } | { kind: "translation"; part: TimelineComposition; marker: TranslationMarker } | { kind: "zoom"; part: TimelineComposition; marker: ZoomMarker } | { kind: "part"; part: TimelineComposition } | null {
  const adjustmentLayer = [...adjustmentLayers].reverse().find((layer) => time >= layer.start && time <= layer.start + layer.duration);
  if (adjustmentLayer) return { kind: "adjustment", layer: adjustmentLayer };
  const timelinePart = getTimelinePartAtTime(timeline, time > 0 ? time - 0.000001 : time);
  if (!timelinePart) return null;
  const translationMarker = [...timelinePart.translationMarkers].reverse().find((marker) => isMarkerAtSceneTime(timelinePart, marker, time));
  if (translationMarker) return { kind: "translation", part: timelinePart, marker: translationMarker };
  const zoomMarker = [...timelinePart.zoomMarkers].reverse().find((marker) => isMarkerAtSceneTime(timelinePart, marker, time));
  if (zoomMarker) return { kind: "zoom", part: timelinePart, marker: zoomMarker };
  return { kind: "part", part: timelinePart };
}

export function isMarkerAtSceneTime(part: TimelineComposition, marker: { start: number; duration: number }, time: number) {
  const markerStart = part.start + marker.start;
  return time >= markerStart && time <= markerStart + marker.duration;
}

export function snapScrubTimeToBoundary(time: number, boundaries: number[], snapThresholdSeconds: number) {
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

export function getScrubSnapBoundaries(timeline: TimelinePart[], adjustmentLayers: AdjustmentLayer[] = []) {
  return Array.from(new Set(timeline.flatMap((part) => [
    part.start,
    part.end,
    ...part.zoomMarkers.flatMap((marker) => [part.start + marker.start, part.start + marker.start + marker.duration]),
    ...part.translationMarkers.flatMap((marker) => [part.start + marker.start, part.start + marker.start + marker.duration]),
  ]).concat(adjustmentLayers.flatMap((layer) => [layer.start, layer.start + layer.duration])))).sort((left, right) => left - right);
}

export function getMarkerSnapBoundaries(timeline: TimelinePart[], exclude: { kind: TimelineMarkerKind; partId: string; markerId: string }) {
  return Array.from(new Set(timeline.flatMap((part) => [
    part.start,
    part.end,
    ...part.zoomMarkers.flatMap((marker) => (exclude.kind === "zoom" && part.id === exclude.partId && marker.id === exclude.markerId ? [] : [part.start + marker.start, part.start + marker.start + marker.duration])),
    ...part.translationMarkers.flatMap((marker) => (exclude.kind === "translation" && part.id === exclude.partId && marker.id === exclude.markerId ? [] : [part.start + marker.start, part.start + marker.start + marker.duration])),
  ]))).sort((left, right) => left - right);
}

export function getMarkerPlacement(timeline: TimelinePart[], absoluteStart: number, duration: number, snapThresholdSeconds: number, snap: boolean, exclude: { kind: TimelineMarkerKind; partId: string; markerId: string }) {
  const sceneDuration = timeline.at(-1)?.end ?? 0;
  let snappedStart = clamp(absoluteStart, 0, Math.max(sceneDuration - duration, 0));

  if (snap) {
    for (const boundary of getMarkerSnapBoundaries(timeline, exclude)) {
      if (Math.abs(snappedStart - boundary) <= snapThresholdSeconds) snappedStart = boundary;
      if (Math.abs(snappedStart + duration - boundary) <= snapThresholdSeconds) snappedStart = boundary - duration;
    }
  }

  snappedStart = clamp(snappedStart, 0, Math.max(sceneDuration - duration, 0));
  const center = snappedStart + duration / 2;
  const targetPart = timeline.find((part) => duration <= part.duration && center >= part.start && center < part.end)
    ?? timeline.find((part) => duration <= part.duration && snappedStart >= part.start && snappedStart + duration <= part.end)
    ?? timeline.find((part) => duration <= part.duration)
    ?? timeline[0];

  if (!targetPart) return { partId: "", start: 0 };

  const partStart = clamp(snappedStart, targetPart.start, Math.max(targetPart.end - duration, targetPart.start));
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

export function getTimelineDragConstraintItems(items: Array<{ absoluteStart: number; duration: number; groupId?: string }>) {
  const groupedItems = new Map<string, Array<{ absoluteStart: number; duration: number }>>();
  const ungroupedItems: Array<{ absoluteStart: number; duration: number }> = [];

  for (const item of items) {
    if (!item.groupId) {
      ungroupedItems.push(item);
      continue;
    }
    groupedItems.set(item.groupId, [...(groupedItems.get(item.groupId) ?? []), item]);
  }

  return [
    ...ungroupedItems,
    ...Array.from(groupedItems.values()).map((groupItems) => {
      const absoluteStart = Math.min(...groupItems.map((item) => item.absoluteStart));
      const absoluteEnd = Math.max(...groupItems.map((item) => item.absoluteStart + item.duration));
      return { absoluteStart, duration: absoluteEnd - absoluteStart };
    }),
  ];
}

export function getTimelineMarkerGapIntervals(timeline: TimelinePart[], kind: TimelineMarkerKind, duration: number, absoluteStart: number, movingKeys: Set<string>) {
  return timeline.flatMap((timelinePart) => {
    if (duration > timelinePart.duration) return [];

    const blockers = (kind === "zoom" ? timelinePart.zoomMarkers : timelinePart.translationMarkers)
      .filter((marker) => !movingKeys.has(`${timelinePart.id}:${marker.id}`))
      .map((marker) => ({ start: timelinePart.start + marker.start, end: timelinePart.start + marker.start + marker.duration }))
      .sort((left, right) => left.start - right.start);
    const gaps: Array<{ start: number; end: number }> = [];
    let cursor = timelinePart.start;

    for (const blocker of blockers) {
      if (blocker.start - cursor >= duration) gaps.push({ start: cursor, end: blocker.start });
      cursor = Math.max(cursor, blocker.end);
    }

    if (timelinePart.end - cursor >= duration) gaps.push({ start: cursor, end: timelinePart.end });

    return gaps.map((gap) => ({ start: gap.start - absoluteStart, end: gap.end - duration - absoluteStart }));
  });
}

export function getTimelineMarkerMoves(timeline: TimelinePart[], items: TimelineMarkerDragItem[], delta: number, kind: TimelineMarkerKind, activePartIds: Map<string, string>, snapThresholdSeconds: number): TimelineMarkerMove[] {
  const groupedItems = new Map<string, TimelineMarkerDragItem[]>();
  const moves: TimelineMarkerMove[] = [];

  for (const item of items) {
    if (!item.groupId) {
      const nextPlacement = exactMarkerPlacementInTimeline(timeline, item.absoluteStart + delta, item.duration)
        ?? getMarkerPlacement(timeline, item.absoluteStart + delta, item.duration, snapThresholdSeconds, false, { kind, partId: item.partId, markerId: item.markerId });
      moves.push({ sourcePartId: activePartIds.get(item.markerId) ?? item.partId, markerId: item.markerId, targetPartId: nextPlacement.partId, start: nextPlacement.start });
      continue;
    }

    groupedItems.set(item.groupId, [...(groupedItems.get(item.groupId) ?? []), item]);
  }

  for (const groupItems of groupedItems.values()) {
    const groupStart = Math.min(...groupItems.map((item) => item.absoluteStart));
    const groupEnd = Math.max(...groupItems.map((item) => item.absoluteStart + item.duration));
    const groupDuration = groupEnd - groupStart;
    const firstItem = groupItems[0];
    const nextPlacement = exactMarkerPlacementInTimeline(timeline, groupStart + delta, groupDuration)
      ?? getMarkerPlacement(timeline, groupStart + delta, groupDuration, snapThresholdSeconds, false, { kind, partId: firstItem.partId, markerId: firstItem.markerId });

    for (const item of groupItems) {
      moves.push({
        sourcePartId: activePartIds.get(item.markerId) ?? item.partId,
        markerId: item.markerId,
        targetPartId: nextPlacement.partId,
        start: nextPlacement.start + item.absoluteStart - groupStart,
      });
    }
  }

  return moves;
}

export function exactMarkerPlacementInTimeline(timeline: TimelinePart[], absoluteStart: number, duration: number) {
  const targetPart = timeline.find((timelinePart) => duration <= timelinePart.duration && absoluteStart >= timelinePart.start && absoluteStart + duration <= timelinePart.end);
  return targetPart ? { partId: targetPart.id, start: absoluteStart - targetPart.start } : null;
}

export function getMendedMarkerDragItems(timeline: TimelinePart[], part: TimelinePart, markerId: string, kind: TimelineMarkerKind): TimelineMarkerDragItem[] {
  const markers = kind === "zoom" ? part.zoomMarkers : part.translationMarkers;
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  if (markerIndex < 0) return [];

  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (firstIndex > 0) {
    const previous = sortedMarkers[firstIndex - 1];
    const current = sortedMarkers[firstIndex];
    if (!previous.snapOut || !current.snapIn || roundTenth(previous.start + previous.duration) !== roundTenth(current.start)) break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (!current.snapOut || !next.snapIn || roundTenth(current.start + current.duration) !== roundTenth(next.start)) break;
    lastIndex += 1;
  }

  const groupId = firstIndex === lastIndex ? undefined : `${kind}:${part.id}:${sortedMarkers[firstIndex].id}:${sortedMarkers[lastIndex].id}`;

  return sortedMarkers.slice(firstIndex, lastIndex + 1).map((marker) => ({
    partId: part.id,
    markerId: marker.id,
    absoluteStart: part.start + marker.start,
    duration: marker.duration,
    groupId,
  }));
}

export function getAvailableZoomPlacement(markers: Array<{ start: number; duration: number }>, partDuration: number, preferredTime: number) {
  if (partDuration < minimumZoomDuration) return null;

  const occupied = [...markers].sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const marker of occupied) {
    if (marker.start - cursor >= minimumZoomDuration) gaps.push({ start: cursor, end: marker.start });
    cursor = Math.max(cursor, marker.start + marker.duration);
  }

  if (partDuration - cursor >= minimumZoomDuration) gaps.push({ start: cursor, end: partDuration });

  const preferredStart = clamp(preferredTime - 0.5, 0, Math.max(partDuration - minimumZoomDuration, 0));
  let bestPlacement: { start: number; duration: number; distance: number } | null = null;

  for (const gap of gaps) {
    const gapDuration = gap.end - gap.start;
    const duration = Math.min(defaultZoomDuration, gapDuration);
    const start = clamp(preferredStart, gap.start, gap.end - duration);
    const end = start + duration;
    const distance = preferredTime >= start && preferredTime <= end ? 0 : Math.min(Math.abs(preferredTime - start), Math.abs(preferredTime - end));

    if (!bestPlacement || distance < bestPlacement.distance) bestPlacement = { start, duration, distance };
  }

  if (!bestPlacement) return null;
  return { start: roundTenth(bestPlacement.start), duration: roundTenth(bestPlacement.duration) };
}

export function getZoomMiddleSnap(markers: Array<{ id: string; start: number; duration: number }>, preferredTime: number) {
  const time = roundTenth(preferredTime);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const tolerance = 0.12;

  for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
    const previous = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    const previousEnd = previous.start + previous.duration;
    const nextStart = next.start;

    if (previousEnd > nextStart) continue;
    if (time < previousEnd - tolerance || time > nextStart + tolerance) continue;

    const snapTime = roundTenth(clamp(time, previousEnd, nextStart));
    const previousDuration = snapTime - previous.start;
    const nextDuration = next.start + next.duration - snapTime;

    if (previousDuration >= minimumZoomDuration && nextDuration >= minimumZoomDuration) {
      return { pairs: [{ previousId: previous.id, nextId: next.id, time: snapTime }] };
    }
  }

  return null;
}

export function getSelectedZoomMiddleSnap(markers: Array<{ id: string; start: number; duration: number }>, selectedMarkerIds: string[]) {
  if (selectedMarkerIds.length < 2) return null;

  const selectedIds = new Set(selectedMarkerIds);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const selectedIndexes = sortedMarkers.map((marker, index) => (selectedIds.has(marker.id) ? index : -1)).filter((index) => index >= 0);
  const tolerance = 0.12;
  if (selectedIndexes.length !== selectedIds.size) return null;

  for (let index = 1; index < selectedIndexes.length; index += 1) {
    if (selectedIndexes[index] !== selectedIndexes[index - 1] + 1) return null;
  }

  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];

  for (let index = 0; index < selectedIndexes.length - 1; index += 1) {
    const previous = sortedMarkers[selectedIndexes[index]];
    const next = sortedMarkers[selectedIndexes[index + 1]];

    const previousEnd = previous.start + previous.duration;
    const nextStart = next.start;
    if (previousEnd > nextStart + tolerance) return null;

    const snapTime = roundTenth((previousEnd + nextStart) / 2);
    const previousDuration = snapTime - previous.start;
    const nextDuration = next.start + next.duration - snapTime;

    if (previousDuration >= minimumZoomDuration - tolerance && nextDuration >= minimumZoomDuration - tolerance) {
      pairs.push({ previousId: previous.id, nextId: next.id, time: snapTime });
    }
  }

  return pairs.length === selectedIndexes.length - 1 ? { pairs } : null;
}

export function getSelectedActiveMiddleMend(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, selectedMarkerIds: string[]) {
  if (selectedMarkerIds.length === 0) return null;
  const selectedIds = new Set(selectedMarkerIds);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];

  for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
    const previous = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    if (!selectedIds.has(previous.id) && !selectedIds.has(next.id)) continue;
    if (!previous.snapOut || !next.snapIn) continue;
    const time = roundTenth(previous.start + previous.duration);
    if (time !== roundTenth(next.start)) continue;
    pairs.push({ previousId: previous.id, nextId: next.id, time });
  }

  return pairs.length > 0 ? { pairs } : null;
}

export function isZoomMiddleSnapActive(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, snap: { pairs: Array<{ previousId: string; nextId: string; time: number }> } | null) {
  if (!snap) return false;
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));

  return snap.pairs.every((pair) => {
    const previous = markersById.get(pair.previousId);
    const next = markersById.get(pair.nextId);
    if (!previous || !next) return false;
    return Boolean(previous.snapOut && next.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(next.start));
  });
}

export function resizeTimelineMarkersWithPush<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(markers: T[], markerId: string, action: "start" | "end", rawDelta: number, partDuration: number): T[] {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  const targetMarker = sortedMarkers[markerIndex];
  if (!targetMarker) return markers;

  if (action === "end") {
    const minDelta = minimumZoomDuration - targetMarker.duration;
    let delta = Math.max(rawDelta, minDelta);
    let layout = layoutMarkersAfterEndResize(sortedMarkers, markerIndex, delta);
    if (layout.end > partDuration) {
      delta -= layout.end - partDuration;
      layout = layoutMarkersAfterEndResize(sortedMarkers, markerIndex, Math.max(delta, minDelta));
    }
    return applyMarkerBounds(markers, layout.bounds);
  }

  const maxDelta = targetMarker.duration - minimumZoomDuration;
  let delta = Math.min(rawDelta, maxDelta);
  let layout = layoutMarkersAfterStartResize(sortedMarkers, markerIndex, delta);
  if (layout.start < 0) {
    delta -= layout.start;
    layout = layoutMarkersAfterStartResize(sortedMarkers, markerIndex, Math.min(delta, maxDelta));
  }
  return applyMarkerBounds(markers, layout.bounds);
}

function layoutMarkersAfterEndResize<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(sortedMarkers: T[], markerIndex: number, delta: number) {
  const targetMarker = sortedMarkers[markerIndex];
  const bounds = new Map<string, { start: number; duration: number }>([[targetMarker.id, { start: targetMarker.start, duration: targetMarker.duration + delta }]]);
  let previousStart = targetMarker.start;
  let previousEnd = targetMarker.start + targetMarker.duration + delta;

  for (let index = markerIndex + 1; index < sortedMarkers.length; index += 1) {
    const previous = sortedMarkers[index - 1];
    const current = sortedMarkers[index];
    const mended = Boolean(previous.snapOut && current.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(current.start));
    const nextStart = mended || current.start < previousEnd ? previousEnd : current.start;
    bounds.set(current.id, { start: nextStart, duration: current.duration });
    previousStart = nextStart;
    previousEnd = nextStart + current.duration;

    if (!mended && nextStart === current.start) break;
  }

  return { bounds, end: Math.max(previousEnd, previousStart) };
}

function layoutMarkersAfterStartResize<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(sortedMarkers: T[], markerIndex: number, delta: number) {
  const targetMarker = sortedMarkers[markerIndex];
  const bounds = new Map<string, { start: number; duration: number }>([[targetMarker.id, { start: targetMarker.start + delta, duration: targetMarker.duration - delta }]]);
  let nextStart = targetMarker.start + delta;

  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const current = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    const mended = Boolean(current.snapOut && next.snapIn && roundTenth(current.start + current.duration) === roundTenth(next.start));
    const currentEnd = current.start + current.duration;
    const currentStart = mended || currentEnd > nextStart ? nextStart - current.duration : current.start;
    bounds.set(current.id, { start: currentStart, duration: current.duration });
    nextStart = currentStart;

    if (!mended && currentStart === current.start) break;
  }

  return { bounds, start: nextStart };
}

function applyMarkerBounds<T extends { id: string; start: number; duration: number }>(markers: T[], bounds: Map<string, { start: number; duration: number }>): T[] {
  return markers.map((marker) => {
    const nextBounds = bounds.get(marker.id);
    return nextBounds ? { ...marker, start: nextBounds.start, duration: nextBounds.duration } : marker;
  });
}

export function getMiddleTransitionMode(markers: Array<{ id: string; middleTransition?: "transition" }>, snap: { pairs: Array<{ nextId: string }> } | null): "instant" | "transition" {
  if (!snap) return "instant";
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  return snap.pairs.every((pair) => markersById.get(pair.nextId)?.middleTransition === "transition") ? "transition" : "instant";
}
