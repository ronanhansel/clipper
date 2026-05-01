import { defaultTimelineLayerState } from "../../../core/project";
import { buildLinearTimeline, rebaseCompositionTimelineMarkers, getMotionMiddleSnap, isMotionMiddleSnapActive, type TimelineMendMarker } from "../../../core/timeline";
import { roundTenth } from "../../../core/math";
import type { CompositionSelection } from "../../types";
import type { Part, SelectionPayload, TimelineLayerState } from "../../../core/types";

type UpdateSceneParts = (updater: (compositions: Part[]) => Part[]) => void;

type UseCompositionTimelineCommandsInput = {
  compositionLibrary: Part[];
  currentSceneTimeRef: { current: number };
  scene: {
    id: string;
    name: string;
    compositions: Part[];
  };
  timelineLayers: TimelineLayerState;
  clearMarkerSelection: () => void;
  clearNodeSelection: () => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedParts: (selection: CompositionSelection[]) => void;
  setSelectionPayload: (payload: SelectionPayload | null) => void;
  updateSceneParts: UpdateSceneParts;
};

export function useCompositionTimelineCommands({
  compositionLibrary,
  currentSceneTimeRef,
  scene,
  timelineLayers,
  clearMarkerSelection,
  clearNodeSelection,
  setSelectedObjectId,
  setSelectedPartId,
  setSelectedParts,
  setSelectionPayload,
  updateSceneParts,
}: UseCompositionTimelineCommandsInput) {
  function reorderPart(sourcePartId: string, targetPartId: string) {
    if (sourcePartId === targetPartId) return;
    updateSceneParts((parts) => {
      const sourceIndex = parts.findIndex((item) => item.id === sourcePartId);
      const targetIndex = parts.findIndex((item) => item.id === targetPartId);
      if (sourceIndex < 0 || targetIndex < 0) return parts;
      const next = [...parts];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function moveCompositionMarker(compositionId: string, start: number, layerId?: string) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const nextStart = composition.id === compositionId ? roundTenth(Math.max(start, 0)) : roundTenth(previousStart);
        const nextComposition = composition.id === compositionId
          ? { ...composition, start: nextStart, layerId: layerId || undefined }
          : { ...composition, start: nextStart };
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextStart);
      });
    });
  }

  function moveCompositionMarkers(moves: Array<{ compositionId: string; start: number; targetLayerId?: string }>) {
    if (moves.length === 0) return;
    const moveById = new Map(moves.map((move) => [move.compositionId, move]));
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const move = moveById.get(composition.id);
        const nextStart = roundTenth(Math.max(move?.start ?? previousStart, 0));
        const nextComposition = move
          ? { ...composition, start: nextStart, layerId: move.targetLayerId || undefined }
          : { ...composition, start: roundTenth(previousStart) };
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextStart);
      });
    });
  }

  function updateCompositionMarker(compositionId: string, updater: (composition: Part) => Part) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const withExplicitStart = { ...composition, start: roundTenth(previousStart) };
        const nextComposition = composition.id === compositionId ? updater(withExplicitStart) : withExplicitStart;
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextComposition.start ?? previousStart);
      });
    });
  }

  function deleteCompositionFromTimeline(compositionId: string) {
    deleteCompositionsFromTimeline([compositionId]);
  }

  function deleteCompositionsFromTimeline(compositionIds: string[]) {
    const deleteIds = new Set(compositionIds);
    if (deleteIds.size === 0) return;
    const firstDeletedIndex = scene.compositions.findIndex((composition) => deleteIds.has(composition.id));
    if (firstDeletedIndex < 0) return;
    const remaining = scene.compositions.filter((composition) => !deleteIds.has(composition.id));
    const nextSelection = remaining[firstDeletedIndex]?.id ?? remaining[firstDeletedIndex - 1]?.id ?? "";
    updateSceneParts((parts) => parts.filter((composition) => !deleteIds.has(composition.id)));
    setSelectedPartId(nextSelection);
    setSelectedParts(nextSelection ? [{ partId: nextSelection }] : []);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
  }

  function addCompositionFromLibrary(compositionId: string, targetLayerId?: string, start = currentSceneTimeRef.current) {
    const libraryComposition = compositionLibrary.find((composition) => composition.id === compositionId);
    if (!libraryComposition) return;
    const clipId = `clip_${Date.now().toString(36)}`;
    const layerId = targetLayerId ?? (timelineLayers.compositionLayers?.length ? timelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers!)?.[0]?.id ?? "comp";
    const timelineComposition = { ...libraryComposition, id: clipId, compositionId: libraryComposition.compositionId ?? libraryComposition.id, start: roundTenth(Math.max(start, 0)), layerId };
    updateSceneParts((parts) => [...parts, timelineComposition]);
    setSelectedPartId(timelineComposition.id);
    clearNodeSelection();
    setSelectedPartId(timelineComposition.id);
    setSelectedParts([{ partId: timelineComposition.id }]);
  }

  function snapCompositionMiddle() {
    const markers: TimelineMendMarker[] = scene.compositions.map((comp) => ({
      id: comp.id,
      start: comp.start ?? 0,
      duration: comp.duration,
      layerId: comp.layerId ?? "comp",
      snapIn: comp.snapIn,
      snapOut: comp.snapOut,
      mendInId: comp.mendInId,
      mendOutId: comp.mendOutId,
    }));
    const snap = getMotionMiddleSnap(markers, currentSceneTimeRef.current);
    if (!snap) return;
    const middleSnapActive = isMotionMiddleSnapActive(markers, snap);
    const nextBounds = new Map(markers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair: { previousId: string; nextId: string }) => [pair.previousId, pair.nextId]));
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
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        if (!mendedIds.has(composition.id)) {
          return rebaseCompositionTimelineMarkers({ ...composition, start: roundTenth(previousStart) }, previousStart, roundTenth(previousStart));
        }
        const bounds = nextBounds.get(composition.id);
        if (!bounds) return { ...composition, start: roundTenth(previousStart) };
        const nextComposition = { ...composition, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextComposition.start);
      });
    });
  }

  return {
    addCompositionFromLibrary,
    deleteCompositionFromTimeline,
    deleteCompositionsFromTimeline,
    moveCompositionMarker,
    moveCompositionMarkers,
    reorderPart,
    snapCompositionMiddle,
    updateCompositionMarker,
  };
}
