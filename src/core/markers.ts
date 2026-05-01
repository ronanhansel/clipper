import { canMendTimelineMarkers } from "./timeline";

type MendedMarker = { id: string; effectId?: string; layerId?: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean; mendInId?: string; mendOutId?: string };

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
  return canMendTimelineMarkers(previous, next)
    && !previous.snapOut
    && !next.snapIn
    && Math.abs(previous.start + previous.duration - next.start) <= 0.001
    && previous.mendOutId === next.id
    && next.mendInId === previous.id;
}

export function isMotionMarkerMended(markers: MendedMarker[], markerId: string) {
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
