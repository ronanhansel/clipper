import { roundTenth } from "./math";
import type { Point, ZoomMarker } from "./types";

type MendedMarker = { id: string; layerId?: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean };

function getMendedMarkerLayerId(marker: MendedMarker) {
  return marker.layerId ?? "";
}

function getMendedMarkerLayer(markers: MendedMarker[], markerId: string) {
  const targetMarker = markers.find((marker) => marker.id === markerId);
  if (!targetMarker) return [];
  const layerId = getMendedMarkerLayerId(targetMarker);
  return markers.filter((marker) => getMendedMarkerLayerId(marker) === layerId).sort((left, right) => left.start - right.start);
}

export function isZoomMarkerMended(markers: MendedMarker[], markerId: string) {
  const sortedMarkers = getMendedMarkerLayer(markers, markerId);

  for (let index = 0; index < sortedMarkers.length; index += 1) {
    const marker = sortedMarkers[index];
    if (marker.id !== markerId) continue;

    const previous = sortedMarkers[index - 1];
    const next = sortedMarkers[index + 1];
    const mendedToPrevious = Boolean(previous?.snapOut && marker.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(marker.start));
    const mendedToNext = Boolean(marker.snapOut && next?.snapIn && roundTenth(marker.start + marker.duration) === roundTenth(next.start));
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
    if (!previous.snapOut || !current.snapIn || roundTenth(previous.start + previous.duration) !== roundTenth(current.start)) break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (!current.snapOut || !next.snapIn || roundTenth(current.start + current.duration) !== roundTenth(next.start)) break;
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
      const mendedToPrevious = Boolean(previous?.snapOut && marker.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(marker.start));
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
