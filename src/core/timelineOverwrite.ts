import { roundTenth } from "./math";

export type TimelineOverwriteMarker = {
  id: string;
  start: number;
  duration: number;
  layerId?: string;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type TimelineOverwriteRange = {
  id: string;
  start: number;
  end: number;
  layerId: string;
};

export type TimelineSplitRange = {
  id: string;
  start: number;
  end: number;
};

export function splitMarkerAcrossTimelineRanges<
  T extends TimelineOverwriteMarker,
>(
  marker: T,
  absoluteStart: number,
  ranges: TimelineSplitRange[],
  options: {
    layerId?: string;
    createId: (marker: T, segmentIndex: number) => string;
  },
) {
  const absoluteEnd = absoluteStart + marker.duration;
  let segmentIndex = 0;

  return ranges.flatMap((range) => {
    const segmentStart = Math.max(absoluteStart, range.start);
    const segmentEnd = Math.min(absoluteEnd, range.end);
    if (segmentEnd - segmentStart < 0.1) return [];

    const segmentMarker = {
      ...marker,
      id:
        segmentIndex === 0 ? marker.id : options.createId(marker, segmentIndex),
      layerId: options.layerId ?? marker.layerId,
      start: roundTenth(segmentStart - range.start),
      duration: roundTenth(segmentEnd - segmentStart),
      snapIn: segmentStart > absoluteStart ? undefined : marker.snapIn,
      snapOut: segmentEnd < absoluteEnd ? undefined : marker.snapOut,
    } as T;

    segmentIndex += 1;
    return [{ rangeId: range.id, marker: segmentMarker }];
  });
}

export function getInsertedOverwriteRanges(
  markers: TimelineOverwriteMarker[],
  insertedIds: Set<string>,
): TimelineOverwriteRange[] {
  return markers
    .filter((marker) => insertedIds.has(marker.id))
    .map((marker) => ({
      id: marker.id,
      layerId: marker.layerId ?? "",
      start: marker.start,
      end: marker.start + marker.duration,
    }));
}

export function overwriteTimelineMarkers<T extends TimelineOverwriteMarker>(
  markers: T[],
  overwriteRanges: TimelineOverwriteRange[],
  options: {
    createSplitId: (
      marker: T,
      range: TimelineOverwriteRange,
      index: number,
    ) => string;
  },
) {
  let splitIndex = 0;
  let nextMarkers = markers;
  const insertedIds = new Set(overwriteRanges.map((range) => range.id));

  for (const range of overwriteRanges) {
    nextMarkers = nextMarkers.flatMap((marker) => {
      if (
        insertedIds.has(marker.id) ||
        (marker.layerId ?? "") !== range.layerId
      )
        return [marker];
      splitIndex += 1;
      return trimMarkerForOverwrite(
        marker,
        range.start,
        range.end,
        options.createSplitId(marker, range, splitIndex),
      );
    });
  }

  return nextMarkers;
}

function trimMarkerForOverwrite<T extends TimelineOverwriteMarker>(
  marker: T,
  overwriteStart: number,
  overwriteEnd: number,
  splitId: string,
) {
  const markerStart = marker.start;
  const markerEnd = marker.start + marker.duration;
  if (overwriteEnd <= markerStart || overwriteStart >= markerEnd)
    return [marker];

  const segments: T[] = [];
  const leftDuration = overwriteStart - markerStart;
  const rightDuration = markerEnd - overwriteEnd;
  if (leftDuration >= 0.1)
    segments.push({
      ...marker,
      duration: roundTenth(leftDuration),
      snapOut: undefined,
    });
  if (rightDuration >= 0.1)
    segments.push({
      ...marker,
      id: splitId,
      start: roundTenth(overwriteEnd),
      duration: roundTenth(rightDuration),
      snapIn: undefined,
    });
  return segments;
}
