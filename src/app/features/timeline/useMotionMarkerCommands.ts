import toast from "react-hot-toast";
import { TIMELINE_MOTION_PART_ID, type MotionMarkerSelection } from "../../types";
import { FRAME_HEIGHT, FRAME_WIDTH, type MotionEase, type MotionEffectId, type MotionMarker, type Part, type Point, type TimelineLayerState, type TimelineMode } from "../../../core/types";
import { centerOf } from "../../../core/frameInteraction";
import { framePointToCameraTranslation, formatCameraPreviewTransform, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../../core/camera";
import { getMendedMarkerIds, normalizeMendedMotionMarkerFocus } from "../../../core/markers";
import { clamp, roundTenth, roundTwo } from "../../../core/math";
import { getMotionEffectByKind, getMotionEffectPackage } from "../../../core/effects/registry";
import { createDefaultMotionBlockByEffectId, getMotionMarkerViews, motionBlocksToMotionMarkers } from "../../../core/motionEffects";
import { buildLinearTimeline, getAvailableMotionPlacement, getSelectedActiveMiddleMend, getSelectedMotionMiddleSnap, getMotionMarkerMendKey, getMotionMiddleSnap, isMotionMiddleSnapActive, type TimelineMarkerMove, type TimelineMarkerResize } from "../../../core/timeline";
import { applyMotionMarkerOverwrite, applySceneMotionMarkerOverwrite, placeMotionMarkerOnTimeline, remapMovedMarkerMendIds, motionBlockFromMarker, timelineMarkerKey, timelineMoveKey, uniqueMarkerSelections, withMotionMarkers } from "./timelineMutationHelpers";
import type { SceneMotionMarkerUpdate } from "./useTimelineProjectActions";

type SceneMotionState = {
  id: string;
  name: string;
  compositions: Part[];
  duration?: number;
  motionMarkers?: MotionMarker[];
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
  pendingScalePreviewRef: { current: CameraPreviewTransform | null };
  previewTime: number;
  scene: SceneMotionState;
  sceneDurationSeconds: number;
  selectedObjectBounds: { x: number; y: number; width: number; height: number } | null;
  selectedMotionMarkers: MotionMarkerSelection[];
  timelineMode: TimelineMode;
  scalePreviewFrameRef: { current: number };
  assignAvailableMotionLayerKind: (layerId: string | undefined, kind: "motion") => void;
  setFocusPickZoomMarker: (selection: { partId: string; markerId: string } | null) => void;
  setPositionPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedMotionMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  updateCurrentPart: (part: Part) => void;
  updateSceneMotionMarkers: (updater: (markers: MotionMarker[]) => SceneMotionMarkerUpdate) => void;
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
  pendingScalePreviewRef,
  previewTime,
  scene,
  sceneDurationSeconds,
  selectedObjectBounds,
  selectedMotionMarkers,
  timelineMode,
  scalePreviewFrameRef,
  assignAvailableMotionLayerKind,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setSelectedObjectId,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  updateCurrentPart,
  updateSceneMotionMarkers,
  updateSceneParts,
  updateTimelineLayers,
}: UseMotionMarkerCommandsInput) {
  const selectedObjectCenter = selectedObjectBounds ? centerOf(selectedObjectBounds) : null;
  const timelineMotionPart = { ...part, id: TIMELINE_MOTION_PART_ID, name: "Timeline motion", duration: Math.max(sceneDurationSeconds, 0.1), motionMarkers: scene.motionMarkers ?? [] };

  function getAbsoluteMotionMarkers() {
    return getMotionMarkerViews(scene).motionMarkers.map((marker) => ({ ...marker, id: timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id), partId: TIMELINE_MOTION_PART_ID, start: marker.start }));
  }

  // ── update / move / resize / delete ──────────────────────────────

  function updateMotionMarker(partId: string, markerId: string, updater: (marker: MotionMarker, part: Part) => MotionMarker) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers((markers) => ({ motionMarkers: normalizeMendedMotionMarkerFocus(markers.map((m) => (m.id === markerId ? updater(m, timelineMotionPart) : m))) }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      const motionMarkers = getMotionMarkerViews(item).motionMarkers;
      return withMotionMarkers(item, normalizeMendedMotionMarkerFocus(motionMarkers.map((m) => (m.id === markerId ? updater(m, item) : m))));
    }));
  }

  function updateMotionMarkers(partId: string, updater: (markers: MotionMarker[], part: Part) => MotionMarker[]) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers((markers) => ({ motionMarkers: normalizeMendedMotionMarkerFocus(updater(markers, timelineMotionPart)) }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, normalizeMendedMotionMarkerFocus(updater(getMotionMarkerViews(item).motionMarkers, item)));
    }));
  }

  function updateMotionMarkerFocusGroup(partId: string, markerId: string, focus: Point) {
    const absoluteMarkers = getAbsoluteMotionMarkers();
    const markerKeys = getMendedMarkerIds(absoluteMarkers, timelineMarkerKey(partId, markerId));
    updateSceneMotionMarkers((markers) => {
      const nextMarkers = normalizeMendedMotionMarkerFocus(markers.map((m) => (markerKeys.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, m.id)) ? { ...m, focus } : m)));
      return { motionMarkers: nextMarkers };
    });
  }

  function moveMotionMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) {
    assignAvailableMotionLayerKind(targetLayerId, "motion");
    if (sourcePartId === TIMELINE_MOTION_PART_ID || targetPartId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers((markers) => {
        const marker = markers.find((m) => m.id === markerId);
        if (!marker) return { motionMarkers: markers };
        const nextMarker = { ...marker, layerId: targetLayerId ?? marker.layerId, start: roundTwo(start) };
        return applySceneMotionMarkerOverwrite([...markers.filter((m) => m.id !== markerId), nextMarker], new Set([markerId])) as SceneMotionMarkerUpdate;
      });
      setSelectedMotionMarker({ partId: TIMELINE_MOTION_PART_ID, markerId });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const targetTimelinePart = timelineParts.find((item) => item.id === targetPartId);
      const marker = sourcePart ? getMotionMarkerViews(sourcePart).motionMarkers.find((m) => m.id === markerId) : undefined;
      if (!sourcePart || !targetTimelinePart || !marker) return parts;
      const segments = placeMotionMarkerOnTimeline(marker, targetTimelinePart.start + start, timelineParts, targetLayerId, targetPartId);
      const insertedIds = new Set(segments.map((segment) => segment.marker.id));
      return parts.map((item) => {
        const itemSegments = segments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        const itemMarkers = getMotionMarkerViews(item).motionMarkers;
        const nextMarkers = [...itemMarkers.filter((current) => current.id !== markerId), ...itemSegments];
        if (itemSegments.length === 0 && nextMarkers.length === itemMarkers.length) return item;
        return applyMotionMarkerOverwrite(item, nextMarkers, insertedIds);
      });
    });
    if (sourcePartId !== targetPartId) setSelectedMotionMarker({ partId: targetPartId, markerId });
  }

  function moveMotionMarkers(moves: TimelineMarkerMove[]) {
    for (const move of moves) assignAvailableMotionLayerKind(move.targetLayerId, "motion");
    if (moves.some((move) => move.sourcePartId === TIMELINE_MOTION_PART_ID || move.targetPartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers((markers) => {
        const moveById = new Map(moves.map((move) => [move.markerId, move]));
        const insertedIds = new Set(moves.map((move) => move.markerId));
        const nextMarkers = markers.map((marker) => {
          const move = moveById.get(marker.id);
          return move ? remapMovedMarkerMendIds({ ...marker, layerId: move.targetLayerId ?? marker.layerId, start: roundTwo(move.start) }, new Map()) : marker;
        });
        return applySceneMotionMarkerOverwrite(nextMarkers, insertedIds) as SceneMotionMarkerUpdate;
      });
      const nextSelection = selectedMotionMarkers.map((selection) => ({ ...selection, partId: TIMELINE_MOTION_PART_ID }));
      setSelectedMotionMarkers(nextSelection);
      setSelectedMotionMarker(nextSelection.at(-1) ?? (moves[0] ? { partId: TIMELINE_MOTION_PART_ID, markerId: moves[0].markerId } : null));
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const movedMarkerKeys = new Map(moves.map((move) => [timelineMoveKey(move.sourcePartId, move.markerId), timelineMoveKey(move.targetPartId, move.markerId)]));
      const movedSegments = new Map<string, Array<{ partId: string; marker: MotionMarker }>>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const targetTimelinePart = timelineParts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart ? getMotionMarkerViews(sourcePart).motionMarkers.find((m) => m.id === move.markerId) : undefined;
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
        const itemMarkers = getMotionMarkerViews(item).motionMarkers;
        let nextMarkers = removeKeys ? itemMarkers.filter((current) => !removeKeys.has(current.id)) : itemMarkers;
        for (const move of targetMoves) {
          const segments = movedSegments.get(timelineMoveKey(move.sourcePartId, move.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          nextMarkers = [...nextMarkers.filter((current) => current.id !== move.markerId), ...segments.map((segment) => segment.marker)];
        }
        return nextMarkers === itemMarkers ? item : applyMotionMarkerOverwrite(item, nextMarkers, insertedIds);
      });
    });
    const nextSelection = selectedMotionMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedMotionMarkers(nextSelection);
      setSelectedMotionMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedMotionMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function resizeMotionMarkers(resizes: TimelineMarkerResize[]) {
    if (resizes.some((resize) => resize.sourcePartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers((markers) => {
        const resizeById = new Map(resizes.map((resize) => [resize.markerId, resize]));
        const insertedIds = new Set(resizes.map((resize) => resize.markerId));
        const nextMarkers = markers.map((marker) => {
          const resize = resizeById.get(marker.id);
          return resize ? { ...marker, start: roundTwo(resize.absoluteStart), duration: roundTwo(resize.duration) } : marker;
        });
        return applySceneMotionMarkerOverwrite(nextMarkers, insertedIds) as SceneMotionMarkerUpdate;
      });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const resizedSegments = new Map<string, Array<{ partId: string; marker: MotionMarker }>>();
      const targetResizesByPart = new Map<string, TimelineMarkerResize[]>();
      const removeKeysByPart = new Map<string, Set<string>>();
      for (const resize of resizes) {
        const sourcePart = parts.find((item) => item.id === resize.sourcePartId);
        const marker = sourcePart ? getMotionMarkerViews(sourcePart).motionMarkers.find((m) => m.id === resize.markerId) : undefined;
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
        const itemMarkers = getMotionMarkerViews(item).motionMarkers;
        let nextMarkers = removeKeys ? itemMarkers.filter((marker) => !removeKeys.has(marker.id)) : itemMarkers;
        for (const resize of targetResizes) {
          const segments = resizedSegments.get(timelineMoveKey(resize.sourcePartId, resize.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          nextMarkers = [...nextMarkers.filter((marker) => marker.id !== resize.markerId), ...segments.map((segment) => segment.marker)];
        }
        return nextMarkers === itemMarkers ? item : applyMotionMarkerOverwrite(item, nextMarkers, insertedIds);
      });
    });
  }

  function deleteMotionMarker(partId: string, markerId: string) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers((markers) => ({ motionMarkers: normalizeMendedMotionMarkerFocus(markers.filter((m) => m.id !== markerId)) }));
    } else {
      updateSceneParts((parts) => parts.map((item) => (item.id === partId ? withMotionMarkers(item, getMotionMarkerViews(item).motionMarkers.filter((m) => m.id !== markerId)) : item)));
    }
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
  }

  // ── add / scale preview ─────────────────────────────────────────

  function addMotionMarker(kind: "zoom" | "pan" | "rotate") {
    const motionMarkers = getMotionMarkerViews(part).motionMarkers;
    const filtered = kind === "zoom" ? motionMarkers.filter((m) => (m as any).scale !== undefined) : motionMarkers.filter((m) => (m as any).scale === undefined);
    const placement = getAvailableMotionPlacement(filtered, part.duration, previewTime);
    if (!placement) {
      toast.error(`No room for another 1s ${kind} marker.`);
      return;
    }
    const markerIdPrefix = kind === "zoom" ? "zom" : kind === "rotate" ? "rot" : "trn";
    const effect = getMotionEffectByKind(kind);
    if (!effect) return;
    const block = effect.createDefaultBlock({
      id: `${markerIdPrefix}_${Date.now().toString(36)}`,
      layerId: effect.id,
      start: placement.start,
      duration: placement.duration,
      focus: selectedObjectCenter ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      position: selectedObjectCenter ? framePointToCameraTranslation(selectedObjectCenter) : { x: 0, y: 0 },
    });
    const marker = motionBlocksToMotionMarkers([block])[0];
    if (!marker) return;
    updateCurrentPart(withMotionMarkers(part, [...motionMarkers, marker]));
    setSelectedMotionMarker({ partId: part.id, markerId: marker.id });
    setSelectedMotionMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
  }

  function addMotionEffect(effectId: MotionEffectId, layerId: string, sceneTime: number) {
    const effect = getMotionEffectPackage(effectId);
    if (!effect) return;
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
    const markerIdPrefix = effect.kind === "zoom" ? "zom" : effect.kind === "rotate" ? "rot" : effect.kind === "perspective" ? "prs" : "trn";
    const block = createDefaultMotionBlockByEffectId(effect.id, {
      id: `${markerIdPrefix}_${Date.now().toString(36)}`,
      layerId,
      start: 0,
      duration,
      focus: selectedObjectCenter ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      position: selectedObjectCenter ? framePointToCameraTranslation(selectedObjectCenter) : { x: 0, y: 0 },
    });
    const marker = motionBlocksToMotionMarkers([block])[0];
    if (!marker) return;
    const nextMarker = { ...marker, start: absoluteStart, layerId };
    updateSceneMotionMarkers((markers) => applySceneMotionMarkerOverwrite([...markers, nextMarker], new Set([nextMarker.id])) as SceneMotionMarkerUpdate);
    const selection = [{ partId: TIMELINE_MOTION_PART_ID, markerId: nextMarker.id }];
    setSelectedMotionMarker(selection[0]);
    setSelectedMotionMarkers(selection);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
  }

  function previewMotionScale(partId: string, markerId: string, scale: number) {
    if (timelineMode !== "composition" || isPickingZoomFocus) return;
    if (partId === TIMELINE_MOTION_PART_ID) {
      const activeStart = activeTimelinePart?.start ?? 0;
      const previewMotionMarkers = getMotionMarkerViews(scene).motionMarkers.map((marker) => ({ ...marker, ...(marker.id === markerId ? { scale } : {}), start: marker.start - activeStart }));
      pendingScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...part, motionMarkers: motionBlocksToMotionMarkers(previewMotionMarkers) }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
      if (scalePreviewFrameRef.current) return;
      scalePreviewFrameRef.current = requestAnimationFrame(() => {
        scalePreviewFrameRef.current = 0;
        const transform = pendingScalePreviewRef.current;
        if (!transform || !cameraRef.current) return;
        cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
      });
      return;
    }
    const previewPart = scene.compositions.find((item) => item.id === partId);
    if (!previewPart || previewPart.id !== part.id) return;
    const previewMotionMarkers = getMotionMarkerViews(previewPart).motionMarkers.map((marker) => ({ ...marker, ...(marker.id === markerId ? { scale } : {}) }));
    pendingScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...previewPart, motionMarkers: motionBlocksToMotionMarkers(previewMotionMarkers) }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
    if (scalePreviewFrameRef.current) return;
    scalePreviewFrameRef.current = requestAnimationFrame(() => {
      scalePreviewFrameRef.current = 0;
      const transform = pendingScalePreviewRef.current;
      if (!transform || !cameraRef.current) return;
      cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
    });
  }

  function clearMotionScalePreview() {
    pendingScalePreviewRef.current = null;
    if (scalePreviewFrameRef.current) {
      cancelAnimationFrame(scalePreviewFrameRef.current);
      scalePreviewFrameRef.current = 0;
    }
  }

  // ── snap / mend ──────────────────────────────────────────────────

  function updateSelectedMotionSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedMotionMarkers) selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    const timelineMotionIds = selectedIdsByPart.get(TIMELINE_MOTION_PART_ID);
    if (timelineMotionIds) {
      updateSceneMotionMarkers((markers) => ({
        motionMarkers: normalizeMendedMotionMarkerFocus(markers.map((marker) => timelineMotionIds.has(marker.id)
          ? { ...marker, [key]: enabled || undefined }
          : marker)),
      }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      const motionMarkers = getMotionMarkerViews(item).motionMarkers.map((marker) => selectedIds.has(marker.id)
        ? { ...marker, [key]: enabled || undefined }
        : marker);
      return withMotionMarkers(item, normalizeMendedMotionMarkerFocus(motionMarkers));
    }));
  }

  function snapMotionMiddle(targetPart = part) {
    const absoluteMarkers = getAbsoluteMotionMarkers();
    const targetPartSelectedIds = selectedMotionMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedIds = selectedMotionMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const absolutePreviewTime = (activeTimelinePart?.start ?? 0) + previewTime;
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedIds, getMotionMarkerMendKey)
      ?? getSelectedMotionMiddleSnap(absoluteMarkers, selectedIds, getMotionMarkerMendKey)
      ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedIds, getMotionMarkerMendKey)
      ?? getSelectedMotionMiddleSnap(absoluteMarkers, targetPartSelectedIds, getMotionMarkerMendKey)
      ?? (targetPart.id === part.id ? getMotionMiddleSnap(absoluteMarkers, absolutePreviewTime, getMotionMarkerMendKey) : null);
    if (!snap) return;
    const middleSnapActive = isMotionMiddleSnapActive(absoluteMarkers, snap);
    const activeSelectedIds = new Set(selectedIds.length > 0 ? selectedIds : targetPartSelectedIds);
    const nextSelection = snap.pairs.length > 1
      ? uniqueMarkerSelections(absoluteMarkers.filter((marker) => activeSelectedIds.has(marker.id)).map((marker) => marker.id))
      : uniqueMarkerSelections([snap.pairs[0].previousId, snap.pairs[0].nextId]);
    const nextBounds = new Map(absoluteMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    const sharedFocus = absoluteMarkers.find((marker) => marker.id === snap.pairs[0].previousId)?.focus;
    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, mendInId: pair.previousId });
      }
    }
    updateSceneMotionMarkers((markers) => {
      const nextMarkers = normalizeMendedMotionMarkerFocus(markers.map((marker) => {
        const key = timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id);
        if (!mendedIds.has(key)) return marker;
        const bounds = nextBounds.get(key);
        if (!bounds) return marker;
        return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), focus: !middleSnapActive && sharedFocus && mendedIds.has(key) ? sharedFocus : marker.focus, snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
      }));
      return { motionMarkers: nextMarkers };
    });
    setSelectedMotionMarker(nextSelection.at(-1) ?? null);
    setSelectedMotionMarkers(nextSelection);
  }

  function updateMotionMiddleTransition(_targetPart: Part, mode: "instant" | "transition") {
    const absoluteMarkers = getAbsoluteMotionMarkers();
    const selectedIds = selectedMotionMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedIds, getMotionMarkerMendKey)
      ?? getSelectedMotionMiddleSnap(absoluteMarkers, selectedIds, getMotionMarkerMendKey);
    if (!snap || !isMotionMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers((markers) => ({
      motionMarkers: markers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id))
        ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined }
        : marker),
    }));
  }

  function updateMotionMiddleEase(_targetPart: Part, ease: MotionEase | undefined) {
    const absoluteMarkers = getAbsoluteMotionMarkers();
    const selectedIds = selectedMotionMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedIds, getMotionMarkerMendKey)
      ?? getSelectedMotionMiddleSnap(absoluteMarkers, selectedIds, getMotionMarkerMendKey);
    if (!snap || !isMotionMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));
    updateSceneMotionMarkers((markers) => ({
      motionMarkers: markers.map((marker) => nextMarkerIds.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id))
        ? { ...marker, middleEase: ease }
        : marker),
    }));
  }

  return {
    addMotionEffect,
    addMotionMarker,
    previewMotionScale,
    clearMotionScalePreview,
    deleteMotionMarker,
    moveMotionMarker,
    moveMotionMarkers,
    resizeMotionMarkers,
    snapMotionMiddle,
    updateMotionMiddleTransition,
    updateMotionMiddleEase,
    updateSelectedMotionSnap,
    updateMotionMarker,
    updateMotionMarkers,
    updateMotionMarkerFocusGroup,
  };
}
