import toast from "react-hot-toast";
import { TIMELINE_MOTION_PART_ID, type TranslationMarkerSelection, type ZoomMarkerSelection } from "../../types";
import { FRAME_HEIGHT, FRAME_WIDTH, type MotionEase, type MotionEffectId, type Part, type Point, type TimelineLayerState, type TimelineMode, type TranslationMarker, type ZoomMarker } from "../../../core/types";
import { centerOf } from "../../../core/frameInteraction";
import { framePointToCameraTranslation, formatCameraPreviewTransform, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../../core/camera";
import { getMendedMarkerIds, normalizeMendedZoomMarkerFocus } from "../../../core/markers";
import { clamp, roundTenth, roundTwo } from "../../../core/math";
import { getMotionEffectByKind, getMotionEffectPackage } from "../../../core/effects/registry";
import { createDefaultMotionBlockByEffectId, motionBlocksToTranslationMarkers, motionBlocksToZoomMarkers } from "../../../core/motionEffects";
import { buildLinearTimeline, getAvailableZoomPlacement, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTranslationMarkerMendKey, getZoomMarkerMendKey, getZoomMiddleSnap, isZoomMiddleSnapActive, type TimelineMarkerMove, type TimelineMarkerResize } from "../../../core/timeline";
import { applyMotionMarkerOverwrite, applySceneMotionMarkerOverwrite, placeMotionMarkerOnTimeline, remapMovedMarkerMendIds, timelineMarkerKey, timelineMoveKey, uniqueMarkerSelections, withMotionMarkers } from "./timelineMutationHelpers";

type SceneMotionState = {
  id: string;
  name: string;
  compositions: Part[];
  duration?: number;
  translationMarkers?: TranslationMarker[];
  zoomMarkers?: ZoomMarker[];
};

type MotionLayerState = NonNullable<TimelineLayerState["motionLayers"]>[number];

type UseMotionMarkerCommandsInput = {
  activeTimelinePart: Part | null | undefined;
  cameraRef: { current: HTMLElement | null };
  hiddenMotionLayerIds: Set<string>;
  isPickingTranslationPosition: boolean;
  isPickingZoomFocus: boolean;
  markerDurationSeconds: number;
  motionLayers: MotionLayerState[];
  part: Part;
  pendingZoomScalePreviewRef: { current: CameraPreviewTransform | null };
  previewTime: number;
  scene: SceneMotionState;
  sceneDurationSeconds: number;
  selectedObjectBounds: { x: number; y: number; width: number; height: number } | null;
  selectedTranslationMarkers: TranslationMarkerSelection[];
  selectedZoomMarkers: ZoomMarkerSelection[];
  timelineMode: TimelineMode;
  zoomScalePreviewFrameRef: { current: number };
  assignAvailableMotionLayerKind: (layerId: string | undefined, kind: "motion") => void;
  setFocusPickZoomMarker: (selection: { partId: string; markerId: string } | null) => void;
  setPositionPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  setSelectedZoomMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  updateCurrentPart: (part: Part) => void;
  updateSceneMotionMarkers: (updater: (markers: { zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] }) => { zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] }) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
  updateTimelineLayers: (updater: (state: TimelineLayerState) => TimelineLayerState, options?: { history?: boolean }) => void;
};

export function useMotionMarkerCommands({
  activeTimelinePart,
  cameraRef,
  hiddenMotionLayerIds,
  isPickingTranslationPosition,
  isPickingZoomFocus,
  markerDurationSeconds,
  motionLayers,
  part,
  pendingZoomScalePreviewRef,
  previewTime,
  scene,
  sceneDurationSeconds,
  selectedObjectBounds,
  selectedTranslationMarkers,
  selectedZoomMarkers,
  timelineMode,
  zoomScalePreviewFrameRef,
  assignAvailableMotionLayerKind,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setSelectedObjectId,
  setSelectedTranslationMarker,
  setSelectedTranslationMarkers,
  setSelectedZoomMarker,
  setSelectedZoomMarkers,
  updateCurrentPart,
  updateSceneMotionMarkers,
  updateSceneParts,
  updateTimelineLayers,
}: UseMotionMarkerCommandsInput) {
  const selectedObjectCenter = selectedObjectBounds ? centerOf(selectedObjectBounds) : null;

  function updateZoomMarker(partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, part) : marker))), translationMarkers }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function previewZoomScale(partId: string, markerId: string, scale: number) {
    if (timelineMode !== "composition" || isPickingZoomFocus) return;
    if (partId === TIMELINE_MOTION_PART_ID) {
      const activeStart = activeTimelinePart?.start ?? 0;
      const previewZoomMarkers = (scene.zoomMarkers ?? []).map((marker) => (marker.id === markerId ? { ...marker, scale } : marker)).map((marker) => ({ ...marker, start: marker.start - activeStart }));
      pendingZoomScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...part, zoomMarkers: previewZoomMarkers, translationMarkers: (scene.translationMarkers ?? []).map((marker) => ({ ...marker, start: marker.start - activeStart })) }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
      if (zoomScalePreviewFrameRef.current) return;
      zoomScalePreviewFrameRef.current = requestAnimationFrame(() => {
        zoomScalePreviewFrameRef.current = 0;
        const transform = pendingZoomScalePreviewRef.current;
        if (!transform || !cameraRef.current) return;
        cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
      });
      return;
    }
    const previewPart = scene.compositions.find((item) => item.id === partId);
    if (!previewPart || previewPart.id !== part.id) return;
    const previewZoomMarkers = previewPart.zoomMarkers.map((marker) => (marker.id === markerId ? { ...marker, scale } : marker));
    pendingZoomScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...previewPart, zoomMarkers: previewZoomMarkers }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
    if (zoomScalePreviewFrameRef.current) return;
    zoomScalePreviewFrameRef.current = requestAnimationFrame(() => {
      zoomScalePreviewFrameRef.current = 0;
      const transform = pendingZoomScalePreviewRef.current;
      if (!transform || !cameraRef.current) return;
      cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
    });
  }

  function clearZoomScalePreview() {
    pendingZoomScalePreviewRef.current = null;
    if (zoomScalePreviewFrameRef.current) {
      cancelAnimationFrame(zoomScalePreviewFrameRef.current);
      zoomScalePreviewFrameRef.current = 0;
    }
  }

  function updateZoomMarkers(partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(updater(zoomMarkers, part)), translationMarkers }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(updater(item.zoomMarkers, item)), item.translationMarkers);
    }));
  }

  function updateTranslationMarker(partId: string, markerId: string, updater: (marker: TranslationMarker, part: Part) => TranslationMarker) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.map((marker) => (marker.id === markerId ? updater(marker, part) : marker)) }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker)));
    }));
  }

  function updateTranslationMarkers(partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: updater(translationMarkers, part) }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, item.zoomMarkers, updater(item.translationMarkers, item));
    }));
  }

  function getAbsoluteZoomMarkers() {
    return (scene.zoomMarkers ?? []).map((marker) => ({ ...marker, id: timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id), partId: TIMELINE_MOTION_PART_ID, start: marker.start }));
  }

  function getAbsoluteTranslationMarkers() {
    return (scene.translationMarkers ?? []).map((marker) => ({ ...marker, id: timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id), partId: TIMELINE_MOTION_PART_ID, start: marker.start }));
  }

  function updateZoomMarkerFocusGroup(partId: string, markerId: string, focus: Point) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const markerKeys = getMendedMarkerIds(absoluteMarkers, timelineMarkerKey(partId, markerId));
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
      const nextZoomMarkers = zoomMarkers.map((marker) => (markerKeys.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, focus } : marker));
      return { zoomMarkers: normalizeMendedZoomMarkerFocus(nextZoomMarkers), translationMarkers };
    });
  }

  function updateSelectedZoomSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedZoomMarkers) selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    const timelineMotionIds = selectedIdsByPart.get(TIMELINE_MOTION_PART_ID);
    if (timelineMotionIds) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({
        zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.map((marker) => timelineMotionIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker)),
        translationMarkers,
      }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker);
      return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(zoomMarkers), item.translationMarkers);
    }));
  }

  function updateSelectedTranslationSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedTranslationMarkers) selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    const timelineMotionIds = selectedIdsByPart.get(TIMELINE_MOTION_PART_ID);
    if (timelineMotionIds) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({
        zoomMarkers,
        translationMarkers: translationMarkers.map((marker) => timelineMotionIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker),
      }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      return withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.map((marker) => selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker));
    }));
  }

  function moveZoomMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) {
    assignAvailableMotionLayerKind(targetLayerId, "motion");
    if (sourcePartId === TIMELINE_MOTION_PART_ID || targetPartId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const marker = zoomMarkers.find((item) => item.id === markerId);
        if (!marker) return { zoomMarkers, translationMarkers };
        const nextMarker = { ...marker, layerId: targetLayerId ?? marker.layerId, start: roundTwo(start) };
        return applySceneMotionMarkerOverwrite([...zoomMarkers.filter((item) => item.id !== markerId), nextMarker], translationMarkers, new Set([markerId]));
      });
      setSelectedZoomMarker({ partId: TIMELINE_MOTION_PART_ID, markerId });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const targetTimelinePart = timelineParts.find((item) => item.id === targetPartId);
      const marker = sourcePart?.zoomMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !targetTimelinePart || !marker) return parts;
      const segments = placeMotionMarkerOnTimeline(marker, targetTimelinePart.start + start, timelineParts, targetLayerId, targetPartId);
      const insertedIds = new Set(segments.map((segment) => segment.marker.id));
      return parts.map((item) => {
        const itemSegments = segments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        const zoomMarkers = [...item.zoomMarkers.filter((current) => current.id !== markerId), ...itemSegments];
        if (itemSegments.length === 0 && zoomMarkers.length === item.zoomMarkers.length) return item;
        return applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });
    if (sourcePartId !== targetPartId) setSelectedZoomMarker({ partId: targetPartId, markerId });
  }

  function moveZoomMarkers(moves: TimelineMarkerMove[]) {
    for (const move of moves) assignAvailableMotionLayerKind(move.targetLayerId, "motion");
    if (moves.some((move) => move.sourcePartId === TIMELINE_MOTION_PART_ID || move.targetPartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const moveById = new Map(moves.map((move) => [move.markerId, move]));
        const insertedIds = new Set(moves.map((move) => move.markerId));
        const nextZoomMarkers = zoomMarkers.map((marker) => {
          const move = moveById.get(marker.id);
          return move ? remapMovedMarkerMendIds({ ...marker, layerId: move.targetLayerId ?? marker.layerId, start: roundTwo(move.start) }, new Map()) : marker;
        });
        return applySceneMotionMarkerOverwrite(nextZoomMarkers, translationMarkers, insertedIds);
      });
      const nextSelection = selectedZoomMarkers.map((selection) => ({ ...selection, partId: TIMELINE_MOTION_PART_ID }));
      setSelectedZoomMarkers(nextSelection);
      setSelectedZoomMarker(nextSelection.at(-1) ?? (moves[0] ? { partId: TIMELINE_MOTION_PART_ID, markerId: moves[0].markerId } : null));
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const movedMarkerKeys = new Map(moves.map((move) => [timelineMoveKey(move.sourcePartId, move.markerId), timelineMoveKey(move.targetPartId, move.markerId)]));
      const movedSegments = new Map<string, Array<{ partId: string; marker: ZoomMarker }>>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const targetTimelinePart = timelineParts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !targetTimelinePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline(remapMovedMarkerMendIds(marker, movedMarkerKeys), targetTimelinePart.start + move.start, timelineParts, move.targetLayerId, move.targetPartId);
        movedSegments.set(timelineMoveKey(move.sourcePartId, move.markerId), segments);
        for (const segment of segments) targetMovesByPart.set(segment.partId, [...(targetMovesByPart.get(segment.partId) ?? []), move]);
        removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
      }
      if (movedSegments.size === 0) return parts;
      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((current) => !removeKeys.has(current.id)) : item.zoomMarkers;
        for (const move of targetMoves) {
          const segments = movedSegments.get(timelineMoveKey(move.sourcePartId, move.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          zoomMarkers = [...zoomMarkers.filter((current) => current.id !== move.markerId), ...segments.map((segment) => segment.marker)];
        }
        return zoomMarkers === item.zoomMarkers ? item : applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });
    const nextSelection = selectedZoomMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedZoomMarkers(nextSelection);
      setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedZoomMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function moveTranslationMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) {
    assignAvailableMotionLayerKind(targetLayerId, "motion");
    if (sourcePartId === TIMELINE_MOTION_PART_ID || targetPartId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const marker = translationMarkers.find((item) => item.id === markerId);
        if (!marker) return { zoomMarkers, translationMarkers };
        const nextMarker = { ...marker, layerId: targetLayerId ?? marker.layerId, start: roundTwo(start) };
        return applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers.filter((item) => item.id !== markerId), nextMarker], new Set([markerId]));
      });
      setSelectedTranslationMarker({ partId: TIMELINE_MOTION_PART_ID, markerId });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const targetTimelinePart = timelineParts.find((item) => item.id === targetPartId);
      const marker = sourcePart?.translationMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !targetTimelinePart || !marker) return parts;
      const segments = placeMotionMarkerOnTimeline(marker, targetTimelinePart.start + start, timelineParts, targetLayerId, targetPartId);
      const insertedIds = new Set(segments.map((segment) => segment.marker.id));
      return parts.map((item) => {
        const itemSegments = segments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        const translationMarkers = [...item.translationMarkers.filter((current) => current.id !== markerId), ...itemSegments];
        if (itemSegments.length === 0 && translationMarkers.length === item.translationMarkers.length) return item;
        return applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });
    if (sourcePartId !== targetPartId) setSelectedTranslationMarker({ partId: targetPartId, markerId });
  }

  function moveTranslationMarkers(moves: TimelineMarkerMove[]) {
    for (const move of moves) {
      const sourceMarker = scene.compositions.find((item) => item.id === move.sourcePartId)?.translationMarkers.find((item) => item.id === move.markerId) ?? (move.sourcePartId === TIMELINE_MOTION_PART_ID ? scene.translationMarkers?.find((item) => item.id === move.markerId) : undefined);
      if (sourceMarker) assignAvailableMotionLayerKind(move.targetLayerId, "motion");
    }
    if (moves.some((move) => move.sourcePartId === TIMELINE_MOTION_PART_ID || move.targetPartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const moveById = new Map(moves.map((move) => [move.markerId, move]));
        const insertedIds = new Set(moves.map((move) => move.markerId));
        const nextTranslationMarkers = translationMarkers.map((marker) => {
          const move = moveById.get(marker.id);
          return move ? remapMovedMarkerMendIds({ ...marker, layerId: move.targetLayerId ?? marker.layerId, start: roundTwo(move.start) }, new Map()) : marker;
        });
        return applySceneMotionMarkerOverwrite(zoomMarkers, nextTranslationMarkers, insertedIds);
      });
      const nextSelection = selectedTranslationMarkers.map((selection) => ({ ...selection, partId: TIMELINE_MOTION_PART_ID }));
      setSelectedTranslationMarkers(nextSelection);
      setSelectedTranslationMarker(nextSelection.at(-1) ?? (moves[0] ? { partId: TIMELINE_MOTION_PART_ID, markerId: moves[0].markerId } : null));
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const movedMarkerKeys = new Map(moves.map((move) => [timelineMoveKey(move.sourcePartId, move.markerId), timelineMoveKey(move.targetPartId, move.markerId)]));
      const movedSegments = new Map<string, Array<{ partId: string; marker: TranslationMarker }>>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const targetTimelinePart = timelineParts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !targetTimelinePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline(remapMovedMarkerMendIds(marker, movedMarkerKeys), targetTimelinePart.start + move.start, timelineParts, move.targetLayerId, move.targetPartId);
        movedSegments.set(timelineMoveKey(move.sourcePartId, move.markerId), segments);
        for (const segment of segments) targetMovesByPart.set(segment.partId, [...(targetMovesByPart.get(segment.partId) ?? []), move]);
        removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
      }
      if (movedSegments.size === 0) return parts;
      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let translationMarkers = removeKeys ? item.translationMarkers.filter((current) => !removeKeys.has(current.id)) : item.translationMarkers;
        for (const move of targetMoves) {
          const segments = movedSegments.get(timelineMoveKey(move.sourcePartId, move.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          translationMarkers = [...translationMarkers.filter((current) => current.id !== move.markerId), ...segments.map((segment) => segment.marker)];
        }
        return translationMarkers === item.translationMarkers ? item : applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });
    const nextSelection = selectedTranslationMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedTranslationMarkers(nextSelection);
      setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedTranslationMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function resizeZoomMarkers(resizes: TimelineMarkerResize[]) {
    if (resizes.some((resize) => resize.sourcePartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const resizeById = new Map(resizes.map((resize) => [resize.markerId, resize]));
        const insertedIds = new Set(resizes.map((resize) => resize.markerId));
        const nextZoomMarkers = zoomMarkers.map((marker) => {
          const resize = resizeById.get(marker.id);
          return resize ? { ...marker, start: roundTwo(resize.absoluteStart), duration: roundTwo(resize.duration) } : marker;
        });
        return applySceneMotionMarkerOverwrite(nextZoomMarkers, translationMarkers, insertedIds);
      });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const resizedSegments = new Map<string, Array<{ partId: string; marker: ZoomMarker }>>();
      const targetResizesByPart = new Map<string, TimelineMarkerResize[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const resize of resizes) {
        const sourcePart = parts.find((item) => item.id === resize.sourcePartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === resize.markerId);
        if (!sourcePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline({ ...marker, duration: resize.duration }, resize.absoluteStart, timelineParts, undefined, resize.sourcePartId);
        resizedSegments.set(timelineMoveKey(resize.sourcePartId, resize.markerId), segments);
        for (const segment of segments) targetResizesByPart.set(segment.partId, [...(targetResizesByPart.get(segment.partId) ?? []), resize]);
        removeKeysByPart.set(resize.sourcePartId, (removeKeysByPart.get(resize.sourcePartId) ?? new Set()).add(resize.markerId));
      }
      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetResizes = targetResizesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((marker) => !removeKeys.has(marker.id)) : item.zoomMarkers;
        for (const resize of targetResizes) {
          const segments = resizedSegments.get(timelineMoveKey(resize.sourcePartId, resize.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          zoomMarkers = [...zoomMarkers.filter((marker) => marker.id !== resize.markerId), ...segments.map((segment) => segment.marker)];
        }
        return zoomMarkers === item.zoomMarkers ? item : applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });
  }

  function resizeTranslationMarkers(resizes: TimelineMarkerResize[]) {
    if (resizes.some((resize) => resize.sourcePartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const resizeById = new Map(resizes.map((resize) => [resize.markerId, resize]));
        const insertedIds = new Set(resizes.map((resize) => resize.markerId));
        const nextTranslationMarkers = translationMarkers.map((marker) => {
          const resize = resizeById.get(marker.id);
          return resize ? { ...marker, start: roundTwo(resize.absoluteStart), duration: roundTwo(resize.duration) } : marker;
        });
        return applySceneMotionMarkerOverwrite(zoomMarkers, nextTranslationMarkers, insertedIds);
      });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const resizedSegments = new Map<string, Array<{ partId: string; marker: TranslationMarker }>>();
      const targetResizesByPart = new Map<string, TimelineMarkerResize[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const resize of resizes) {
        const sourcePart = parts.find((item) => item.id === resize.sourcePartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === resize.markerId);
        if (!sourcePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline({ ...marker, duration: resize.duration }, resize.absoluteStart, timelineParts, undefined, resize.sourcePartId);
        resizedSegments.set(timelineMoveKey(resize.sourcePartId, resize.markerId), segments);
        for (const segment of segments) targetResizesByPart.set(segment.partId, [...(targetResizesByPart.get(segment.partId) ?? []), resize]);
        removeKeysByPart.set(resize.sourcePartId, (removeKeysByPart.get(resize.sourcePartId) ?? new Set()).add(resize.markerId));
      }
      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetResizes = targetResizesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let translationMarkers = removeKeys ? item.translationMarkers.filter((marker) => !removeKeys.has(marker.id)) : item.translationMarkers;
        for (const resize of targetResizes) {
          const segments = resizedSegments.get(timelineMoveKey(resize.sourcePartId, resize.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          translationMarkers = [...translationMarkers.filter((marker) => marker.id !== resize.markerId), ...segments.map((segment) => segment.marker)];
        }
        return translationMarkers === item.translationMarkers ? item : applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });
  }

  function deleteZoomMarker(partId: string, markerId: string) {
    if (partId === TIMELINE_MOTION_PART_ID) updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.filter((marker) => marker.id !== markerId)), translationMarkers }));
    else updateSceneParts((parts) => parts.map((item) => (item.id === partId ? withMotionMarkers(item, item.zoomMarkers.filter((marker) => marker.id !== markerId), item.translationMarkers) : item)));
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
  }

  function deleteTranslationMarker(partId: string, markerId: string) {
    if (partId === TIMELINE_MOTION_PART_ID) updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.filter((marker) => marker.id !== markerId) }));
    else updateSceneParts((parts) => parts.map((item) => (item.id === partId ? withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.filter((marker) => marker.id !== markerId)) : item)));
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function addZoomMarker() {
    const placement = getAvailableZoomPlacement(part.zoomMarkers, part.duration, previewTime);
    if (!placement) {
      toast.error("No room for another 1s zoom marker.");
      return;
    }
    const marker: ZoomMarker = { id: `zom_${Date.now().toString(36)}`, start: placement.start, duration: placement.duration, focus: selectedObjectCenter ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, scale: 1.8 };
    updateCurrentPart({ ...part, zoomMarkers: [...part.zoomMarkers, marker] });
    setSelectedZoomMarker({ partId: part.id, markerId: marker.id });
    setSelectedZoomMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
  }

  function addTranslationMarker() {
    const effect = getMotionEffectByKind("pan");
    if (!effect) return;
    const placement = getAvailableZoomPlacement(part.translationMarkers, part.duration, previewTime);
    if (!placement) {
      toast.error("No room for another 1s pan marker.");
      return;
    }
    const marker = effect.createDefaultBlock({ id: `trn_${Date.now().toString(36)}`, layerId: effect.id, start: placement.start, duration: placement.duration, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, position: selectedObjectCenter ? framePointToCameraTranslation(selectedObjectCenter) : { x: 0, y: 0 } }) as TranslationMarker;
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function addRotationMarker() {
    const effect = getMotionEffectByKind("rotate");
    if (!effect) return;
    const rotationMarkers = part.translationMarkers.filter((marker) => marker.effectId === effect.id);
    const placement = getAvailableZoomPlacement(rotationMarkers, part.duration, previewTime);
    if (!placement) {
      toast.error("No room for another 1s rotate marker.");
      return;
    }
    const marker = effect.createDefaultBlock({ id: `rot_${Date.now().toString(36)}`, layerId: effect.id, start: placement.start, duration: placement.duration, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, position: { x: 0, y: 0 } }) as TranslationMarker;
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function addMotionEffect(effectId: MotionEffectId, layerId: string, sceneTime: number) {
    const effect = getMotionEffectPackage(effectId);
    if (!effect) return;
    const kind = effect.kind;
    const targetLayer = motionLayers.find((layer) => layer.id === layerId);
    const canRetagLayer = targetLayer?.kind === "empty";
    if (!targetLayer) return;
    if (canRetagLayer) {
      updateTimelineLayers((state) => ({
        ...state,
        motionLayers: (state.motionLayers ?? []).map((layer) => (layer.id === layerId ? { ...layer, kind: "motion" } : layer)),
      }), { history: true });
    }
    const duration = Math.min(markerDurationSeconds, Math.max(sceneDurationSeconds, 0.1));
    const absoluteStart = roundTenth(Math.max(sceneTime - duration / 2, 0));
    const markerIdPrefix = kind === "zoom" ? "zom" : kind === "rotate" ? "rot" : kind === "perspective" ? "prs" : "trn";
    const marker = createDefaultMotionBlockByEffectId(effect.id, {
      id: `${markerIdPrefix}_${Date.now().toString(36)}`,
      layerId,
      start: 0,
      duration,
      focus: selectedObjectCenter ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      position: selectedObjectCenter ? framePointToCameraTranslation(selectedObjectCenter) : { x: 0, y: 0 },
    });
    if (kind === "zoom") {
      const zoomMarker = motionBlocksToZoomMarkers([marker])[0];
      if (!zoomMarker) return;
      const nextMarker = { ...zoomMarker, start: absoluteStart, layerId };
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite([...zoomMarkers, nextMarker], translationMarkers, new Set([nextMarker.id])));
      const selection = [{ partId: TIMELINE_MOTION_PART_ID, markerId: nextMarker.id }];
      setSelectedZoomMarker(selection[0]);
      setSelectedZoomMarkers(selection);
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      return;
    }
    const translationMarker = motionBlocksToTranslationMarkers([marker])[0];
    if (!translationMarker) return;
    const nextMarker = { ...translationMarker, start: absoluteStart, layerId };
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers, nextMarker], new Set([nextMarker.id])));
    const selection = [{ partId: TIMELINE_MOTION_PART_ID, markerId: nextMarker.id }];
    setSelectedTranslationMarker(selection[0]);
    setSelectedTranslationMarkers(selection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
  }

  function snapZoomMiddle(targetPart = part) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const absolutePreviewTime = (activeTimelinePart?.start ?? 0) + previewTime;
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey) ?? (targetPart.id === part.id ? getZoomMiddleSnap(absoluteMarkers, absolutePreviewTime, getZoomMarkerMendKey) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(absoluteMarkers, snap);
    const selectedIds = new Set(selectedZoomIds.length > 0 ? selectedZoomIds : targetPartSelectedZoomIds);
    const nextSelection = snap.pairs.length > 1 ? uniqueMarkerSelections(absoluteMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => marker.id)) : uniqueMarkerSelections([snap.pairs[0].previousId, snap.pairs[0].nextId]);
    const nextBounds = new Map(absoluteMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    const sharedFocus = absoluteMarkers.find((marker) => marker.id === snap.pairs[0].previousId)?.focus;
    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true, mendInId: pair.previousId });
      }
    }
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
      const nextZoomMarkers = zoomMarkers.map((marker) => {
        const key = timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id);
        if (!mendedIds.has(key)) return marker;
        const bounds = nextBounds.get(key);
        if (!bounds) return marker;
        return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), focus: !middleSnapActive && sharedFocus && mendedIds.has(key) ? sharedFocus : marker.focus, snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
      });
      return { zoomMarkers: normalizeMendedZoomMarkerFocus(nextZoomMarkers), translationMarkers };
    });
    setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    setSelectedZoomMarkers(nextSelection);
  }

  function updateZoomMiddleTransition(_targetPart: Part, mode: "instant" | "transition") {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: zoomMarkers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker), translationMarkers }));
  }

  function updateZoomMiddleEase(_targetPart: Part, ease: MotionEase | undefined) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: zoomMarkers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, middleEase: ease } : marker), translationMarkers }));
  }

  function snapTranslationMiddle(targetPart = part) {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const absolutePreviewTime = (activeTimelinePart?.start ?? 0) + previewTime;
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? (targetPart.id === part.id ? getZoomMiddleSnap(absoluteMarkers, absolutePreviewTime, getTranslationMarkerMendKey) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(absoluteMarkers, snap);
    const selectedIds = new Set(selectedTranslationIds.length > 0 ? selectedTranslationIds : targetPartSelectedTranslationIds);
    const nextSelection = snap.pairs.length > 1 ? uniqueMarkerSelections(absoluteMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => marker.id)) : uniqueMarkerSelections([snap.pairs[0].previousId, snap.pairs[0].nextId]);
    const nextBounds = new Map(absoluteMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true, mendInId: pair.previousId });
      }
    }
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
      const nextTranslationMarkers = translationMarkers.map((marker) => {
        const key = timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id);
        if (!mendedIds.has(key)) return marker;
        const bounds = nextBounds.get(key);
        if (!bounds) return marker;
        return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
      });
      return { zoomMarkers, translationMarkers: nextTranslationMarkers };
    });
    setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    setSelectedTranslationMarkers(nextSelection);
  }

  function updateTranslationMiddleTransition(_targetPart: Part, mode: "instant" | "transition") {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker) }));
  }

  function updateTranslationMiddleEase(_targetPart: Part, ease: MotionEase | undefined) {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, middleEase: ease } : marker) }));
  }

  return {
    addMotionEffect,
    addRotationMarker,
    addTranslationMarker,
    addZoomMarker,
    clearZoomScalePreview,
    deleteTranslationMarker,
    deleteZoomMarker,
    moveTranslationMarker,
    moveTranslationMarkers,
    moveZoomMarker,
    moveZoomMarkers,
    previewZoomScale,
    resizeTranslationMarkers,
    resizeZoomMarkers,
    snapTranslationMiddle,
    snapZoomMiddle,
    updateSelectedTranslationSnap,
    updateSelectedZoomSnap,
    updateTranslationMarker,
    updateTranslationMarkers,
    updateTranslationMiddleEase,
    updateTranslationMiddleTransition,
    updateZoomMarker,
    updateZoomMarkerFocusGroup,
    updateZoomMarkers,
    updateZoomMiddleEase,
    updateZoomMiddleTransition,
  };
}
