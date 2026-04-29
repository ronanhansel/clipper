import { expandExplicitTimelineMarkerMendIds, getTimelinePartAtTime } from "../../../core/timeline";
import { getInsertedOverwriteRanges, overwriteTimelineMarkers } from "../../../core/timelineOverwrite";
import { clamp, roundTwo } from "../../../core/math";
import { TIMELINE_MOTION_PART_ID } from "../../types";
import { motionBlocksToTranslationMarkers, motionBlocksToZoomMarkers } from "../../../core/motionEffects";
import { normalizeMendedZoomMarkerFocus } from "../../../core/markers";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type MotionBlock, type Part, type Point, type TimelinePart, type TranslationMarker, type ZoomMarker } from "../../../core/types";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";

export function motionBlockFromMarker(marker: ZoomMarker | TranslationMarker): MotionBlock {
  return {
    ...marker,
    params: {
      ...marker.params,
      ease: marker.ease,
      focus: "focus" in marker ? marker.focus : undefined,
      followId: "followId" in marker ? marker.followId : undefined,
      mendInId: marker.mendInId,
      mendOutId: marker.mendOutId,
      middleEase: marker.middleEase,
      middleTransition: marker.middleTransition,
      perspective: "perspective" in marker ? marker.perspective : undefined,
      position: "position" in marker ? marker.position : undefined,
      rotation: "rotation" in marker ? marker.rotation : undefined,
      scale: "scale" in marker ? marker.scale : undefined,
      snapIn: marker.snapIn,
      snapOut: marker.snapOut,
    },
  };
}

export function withMotionMarkers(item: Part, zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[]): Part {
  const motionBlocks = [...zoomMarkers.map(motionBlockFromMarker), ...translationMarkers.map(motionBlockFromMarker)].sort((left, right) => left.start - right.start);
  return {
    ...item,
    motionBlocks,
    zoomMarkers: motionBlocksToZoomMarkers(motionBlocks),
    translationMarkers: motionBlocksToTranslationMarkers(motionBlocks),
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
  return separatorIndex >= 0 ? { partId: key.slice(0, separatorIndex), markerId: key.slice(separatorIndex + 1) } : { partId: "", markerId: key };
}

export function remapMovedMarkerMendIds<T extends ZoomMarker | TranslationMarker>(marker: T, movedMarkerKeys: Map<string, string>): T {
  const mendInId = marker.mendInId ? movedMarkerKeys.get(marker.mendInId) ?? marker.mendInId : marker.mendInId;
  const mendOutId = marker.mendOutId ? movedMarkerKeys.get(marker.mendOutId) ?? marker.mendOutId : marker.mendOutId;
  return mendInId === marker.mendInId && mendOutId === marker.mendOutId ? marker : { ...marker, mendInId, mendOutId };
}

export function placeMotionMarkerOnTimeline<T extends ZoomMarker | TranslationMarker>(marker: T, absoluteStart: number, timelineParts: TimelinePart[], targetLayerId?: string, preferredPartId?: string) {
  const timelinePart = timelineParts.find((item) => item.id === preferredPartId)
    ?? getTimelinePartAtTime(timelineParts, absoluteStart)
    ?? timelineParts[0];
  if (!timelinePart) return [];
  return [{
    partId: timelinePart.id,
    marker: {
      ...marker,
      layerId: targetLayerId ?? marker.layerId,
      start: roundTwo(absoluteStart - timelinePart.start),
    },
  }];
}

export function applyMotionMarkerOverwrite(item: Part, zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[], insertedIds: Set<string>) {
  const protectedZoomIds = expandExplicitTimelineMarkerMendIds([...item.zoomMarkers, ...zoomMarkers], insertedIds, item.id);
  const protectedTranslationIds = expandExplicitTimelineMarkerMendIds([...item.translationMarkers, ...translationMarkers], insertedIds, item.id);
  const insertedRanges = getInsertedOverwriteRanges([...zoomMarkers, ...translationMarkers], new Set([...protectedZoomIds, ...protectedTranslationIds]));
  const splitIdSuffix = Date.now().toString(36);

  function trimCollection<T extends ZoomMarker | TranslationMarker>(markers: T[]) {
    return overwriteTimelineMarkers(markers, insertedRanges, { createSplitId: (marker, _range, index) => `${marker.id}_split_${splitIdSuffix}_${index.toString(36)}` });
  }

  return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(trimCollection(zoomMarkers)), trimCollection(translationMarkers));
}

export function applySceneMotionMarkerOverwrite(zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[], insertedIds: Set<string>) {
  const protectedZoomIds = expandExplicitTimelineMarkerMendIds(zoomMarkers, insertedIds, TIMELINE_MOTION_PART_ID);
  const protectedTranslationIds = expandExplicitTimelineMarkerMendIds(translationMarkers, insertedIds, TIMELINE_MOTION_PART_ID);
  const insertedRanges = getInsertedOverwriteRanges([...zoomMarkers, ...translationMarkers], new Set([...protectedZoomIds, ...protectedTranslationIds]));
  const splitIdSuffix = Date.now().toString(36);
  const trimCollection = <T extends ZoomMarker | TranslationMarker>(markers: T[]) => overwriteTimelineMarkers(markers, insertedRanges, { createSplitId: (marker, _range, index) => `${marker.id}_split_${splitIdSuffix}_${index.toString(36)}` });
  return { zoomMarkers: normalizeMendedZoomMarkerFocus(trimCollection(zoomMarkers)), translationMarkers: trimCollection(translationMarkers) };
}

export function applyAdjustmentLayerOverwrite(layers: AdjustmentLayer[], insertedIds: Set<string>) {
  const insertedRanges = getInsertedOverwriteRanges(layers, insertedIds);
  const splitIdSuffix = Date.now().toString(36);
  return overwriteTimelineMarkers(layers, insertedRanges, { createSplitId: (layer, _range, index) => `${layer.id}_split_${splitIdSuffix}_${index.toString(36)}` });
}

export function getAdjustmentPointControlFramePoint(layer: AdjustmentLayer, control: AdjustmentEffectPointControl): Point {
  const xValue = Number(layer.effect.params?.[control.xKey]);
  const yValue = Number(layer.effect.params?.[control.yKey]);
  const x = Number.isFinite(xValue) ? xValue : control.xDefault;
  const y = Number.isFinite(yValue) ? yValue : control.yDefault;
  return control.coordinateSpace === "percent"
    ? { x: Math.round(clamp(x, 0, 100) / 100 * FRAME_WIDTH), y: Math.round(clamp(y, 0, 100) / 100 * FRAME_HEIGHT) }
    : { x: Math.round(clamp(x, 0, FRAME_WIDTH)), y: Math.round(clamp(y, 0, FRAME_HEIGHT)) };
}

export function uniqueMarkerSelections(keys: string[]) {
  return Array.from(new Map(keys.map((key) => {
    const selection = parseTimelineMarkerKey(key);
    return [key, selection];
  })).values()).filter((selection) => selection.partId);
}
