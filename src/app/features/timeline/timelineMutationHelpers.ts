import {
  expandExplicitTimelineMarkerMendIds,
  getTimelinePartAtTime,
} from "../../../core/timeline";
import {
  getInsertedOverwriteRanges,
  overwriteTimelineMarkers,
} from "../../../core/timelineOverwrite";
import { clamp, roundTwo } from "../../../core/math";
import { TIMELINE_MOTION_PART_ID } from "../../types";
import {
  motionBlocksToMotionMarkers,
  withCanonicalMotionMarkers,
} from "../../../core/motionEffects";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type MotionBlock,
  type MotionMarker,
  type Part,
  type Point,
  type TimelinePart,
} from "../../../core/types";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";

export function motionBlockFromMarker(marker: MotionMarker): MotionBlock {
  return {
    ...marker,
    params: {
      ...marker.params,
      ease: marker.ease,
      focus: marker.focus,
      followId: marker.followId,
      mendInId: marker.mendInId,
      mendOutId: marker.mendOutId,
      middleEase: marker.middleEase,
      middleTransition: marker.middleTransition,
      perspective: marker.perspective,
      position: marker.position,
      rotation: marker.rotation,
      scale: marker.scale,
      snapIn: marker.snapIn,
      snapOut: marker.snapOut,
    },
  };
}

export function withMotionMarkers(
  item: Part,
  motionMarkers: MotionMarker[],
): Part {
  const markers = motionBlocksToMotionMarkers(
    motionMarkers.map(motionBlockFromMarker),
  );
  const motionCollections = withCanonicalMotionMarkers(markers);
  return {
    ...item,
    ...motionCollections,
  };
}

export function timelineMoveKey(partId: string, markerId: string) {
  return `${partId}:${markerId}`;
}

export function timelineMarkerKey(partId: string, markerId: string) {
  return `${partId}:${markerId}`;
}

export function parseTimelineMarkerKey(key: string) {
  const separatorIndex = key.indexOf(":");
  return separatorIndex >= 0
    ? {
        partId: key.slice(0, separatorIndex),
        markerId: key.slice(separatorIndex + 1),
      }
    : { partId: "", markerId: key };
}

export function remapMovedMarkerMendIds<T extends MotionMarker>(
  marker: T,
  movedMarkerKeys: Map<string, string>,
): T {
  const mendInId = marker.mendInId
    ? (movedMarkerKeys.get(marker.mendInId) ?? marker.mendInId)
    : marker.mendInId;
  const mendOutId = marker.mendOutId
    ? (movedMarkerKeys.get(marker.mendOutId) ?? marker.mendOutId)
    : marker.mendOutId;
  if (mendInId === marker.mendInId && mendOutId === marker.mendOutId)
    return marker;
  const nextMarker = { ...marker, mendInId, mendOutId };
  if (nextMarker.params)
    nextMarker.params = { ...nextMarker.params, mendInId, mendOutId };
  return nextMarker;
}

export function placeMotionMarkerOnTimeline<T extends MotionMarker>(
  marker: T,
  absoluteStart: number,
  timelineParts: TimelinePart[],
  targetLayerId?: string,
  preferredPartId?: string,
) {
  const timelinePart =
    timelineParts.find((item) => item.id === preferredPartId) ??
    getTimelinePartAtTime(timelineParts, absoluteStart) ??
    timelineParts[0];
  if (!timelinePart) return [];
  return [
    {
      partId: timelinePart.id,
      marker: {
        ...marker,
        layerId: targetLayerId ?? marker.layerId,
        start: absoluteStart - timelinePart.start,
      },
    },
  ];
}

export function applyMotionMarkerOverwrite(
  item: Part,
  markers: MotionMarker[],
  insertedIds: Set<string>,
) {
  const itemViews = motionBlocksToMotionMarkers(item.motionMarkers ?? []);
  const protectedIds = expandExplicitTimelineMarkerMendIds(
    [...itemViews, ...markers],
    insertedIds,
    item.id,
  );
  const insertedRanges = getInsertedOverwriteRanges(
    markers,
    new Set([...protectedIds]),
  );
  const splitIdSuffix = Date.now().toString(36);

  function trimCollection<T extends MotionMarker>(markersList: T[]) {
    return overwriteTimelineMarkers(markersList, insertedRanges, {
      createSplitId: (m, _range, index) =>
        `${m.id}_split_${splitIdSuffix}_${index.toString(36)}`,
    });
  }

  return withMotionMarkers(item, trimCollection(markers));
}

export function applySceneMotionMarkerOverwrite(
  markers: MotionMarker[],
  insertedIds: Set<string>,
) {
  const protectedIds = expandExplicitTimelineMarkerMendIds(
    markers,
    insertedIds,
    TIMELINE_MOTION_PART_ID,
  );
  const insertedRanges = getInsertedOverwriteRanges(
    markers,
    new Set([...protectedIds]),
  );
  const splitIdSuffix = Date.now().toString(36);
  const trimCollection = <T extends MotionMarker>(markersList: T[]) =>
    overwriteTimelineMarkers(markersList, insertedRanges, {
      createSplitId: (m, _range, index) =>
        `${m.id}_split_${splitIdSuffix}_${index.toString(36)}`,
    });
  const nextMarkers = trimCollection(markers);
  return withCanonicalMotionMarkers(
    motionBlocksToMotionMarkers(nextMarkers.map(motionBlockFromMarker)),
  );
}

export function applyAdjustmentLayerOverwrite(
  layers: AdjustmentLayer[],
  insertedIds: Set<string>,
) {
  const insertedRanges = getInsertedOverwriteRanges(layers, insertedIds);
  const splitIdSuffix = Date.now().toString(36);
  return overwriteTimelineMarkers(layers, insertedRanges, {
    createSplitId: (layer, _range, index) =>
      `${layer.id}_split_${splitIdSuffix}_${index.toString(36)}`,
  });
}

export function getAdjustmentPointControlFramePoint(
  layer: AdjustmentLayer,
  control: AdjustmentEffectPointControl,
): Point {
  const xValue = Number(layer.effect.params?.[control.xKey]);
  const yValue = Number(layer.effect.params?.[control.yKey]);
  const x = Number.isFinite(xValue) ? xValue : control.xDefault;
  const y = Number.isFinite(yValue) ? yValue : control.yDefault;
  return control.coordinateSpace === "percent"
    ? {
        x: Math.round((clamp(x, 0, 100) / 100) * FRAME_WIDTH),
        y: Math.round((clamp(y, 0, 100) / 100) * FRAME_HEIGHT),
      }
    : {
        x: Math.round(clamp(x, 0, FRAME_WIDTH)),
        y: Math.round(clamp(y, 0, FRAME_HEIGHT)),
      };
}

export function uniqueMarkerSelections(keys: string[]) {
  return Array.from(
    new Map(
      keys.map((key) => {
        const selection = parseTimelineMarkerKey(key);
        return [key, selection];
      }),
    ).values(),
  ).filter((selection) => selection.partId);
}
