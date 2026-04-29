import type { Point, ZoomMarker } from "./types";

type MendedMarker = { id: string; layerId?: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean; mendInId?: string; mendOutId?: string };

function getMendedMarkerLayerId(marker: MendedMarker) {
  return marker.layerId ?? "";
}

function getMendedMarkerLayer(markers: MendedMarker[], markerId: string) {
  const targetMarker = markers.find((marker) => marker.id === markerId);
  if (!targetMarker) return [];
  const layerId = getMendedMarkerLayerId(targetMarker);
  return markers.filter((marker) => getMendedMarkerLayerId(marker) === layerId).sort((left, right) => left.start - right.start);
}

function isExplicitMendedPair(previous: MendedMarker, next: MendedMarker) {
  return Boolean(previous.snapOut && next.snapIn && previous.mendOutId === next.id && next.mendInId === previous.id);
}

export function isZoomMarkerMended(markers: MendedMarker[], markerId: string) {
  const sortedMarkers = getMendedMarkerLayer(markers, markerId);

  for (let index = 0; index < sortedMarkers.length; index += 1) {
    const marker = sortedMarkers[index];
    if (marker.id !== markerId) continue;

    const previous = sortedMarkers[index - 1];
    const next = sortedMarkers[index + 1];
    const mendedToPrevious = Boolean(previous && isExplicitMendedPair(previous, marker));
    const mendedToNext = Boolean(next && isExplicitMendedPair(marker, next));
    return mendedToPrevious || mendedToNext;
  }

  return false;
}

export function getMendedMarkerIds(markers: MendedMarker[], markerId: string) {
  const sortedMarkers = getMendedMarkerLayer(markers, markerId);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  if (markerIndex < 0) return new Set([markerId]);

  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (firstIndex > 0) {
    const previous = sortedMarkers[firstIndex - 1];
    const current = sortedMarkers[firstIndex];
    if (!isExplicitMendedPair(previous, current)) break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (!isExplicitMendedPair(current, next)) break;
    lastIndex += 1;
  }

  return new Set(sortedMarkers.slice(firstIndex, lastIndex + 1).map((marker) => marker.id));
}

export function normalizeMendedZoomMarkerFocus(markers: ZoomMarker[]) {
  const focusById = new Map<string, Point>();

  for (const layerId of new Set(markers.map(getMendedMarkerLayerId))) {
    const sortedMarkers = markers.filter((marker) => getMendedMarkerLayerId(marker) === layerId).sort((left, right) => left.start - right.start);
    let sharedFocus: Point | null = null;

    for (let index = 0; index < sortedMarkers.length; index += 1) {
      const marker = sortedMarkers[index];
      const previous = sortedMarkers[index - 1];
      const mendedToPrevious = Boolean(previous && isExplicitMendedPair(previous, marker));
      if (!mendedToPrevious) sharedFocus = marker.focus;
      if (sharedFocus) focusById.set(marker.id, sharedFocus);
    }
  }

  return markers.map((marker) => {
    if (!isZoomMarkerMended(markers, marker.id)) return marker;
    const focus = focusById.get(marker.id);
    return focus && (marker.focus.x !== focus.x || marker.focus.y !== focus.y) ? { ...marker, focus } : marker;
  });
}
