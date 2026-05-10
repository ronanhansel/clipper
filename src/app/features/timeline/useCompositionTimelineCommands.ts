import { defaultTimelineLayerState } from "../../../core/project";
import {
  buildLinearTimeline,
  rebaseCompositionTimelineMarkers,
  getMotionMiddleSnap,
  isMotionMiddleSnapActive,
  type TimelineMendMarker,
} from "../../../core/timeline";
import { roundToPrecision, roundTenth } from "../../../core/math";
import { getDisplayName } from "../../../core/fileNames";
import type { CompositionSelection } from "../../types";
import type {
  Part,
  SelectionPayload,
  TimelineLayerState,
} from "../../../core/types";

type UpdateSceneParts = (updater: (compositions: Part[]) => Part[]) => void;

type UseCompositionTimelineCommandsInput = {
  compositionLibrary: Part[];
  currentSceneTimeRef: { current: number };
  scene: {
    id: string;
    compositions: Part[];
  };
  timelineLayers: TimelineLayerState;
  clearMarkerSelection: () => void;
  clearNodeSelection: () => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedParts: (selection: CompositionSelection[]) => void;
  setSelectionPayload: (payload: SelectionPayload | null) => void;
  timelinePrecision: number;
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
  timelinePrecision,
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

  function moveCompositionMarker(
    compositionId: string,
    start: number,
    layerId?: string,
  ) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({
        ...scene,
        compositions: parts,
      });
      const startsById = new Map(
        timelineParts.map((composition) => [composition.id, composition.start]),
      );
      return parts.map((composition) => {
        const previousStart =
          startsById.get(composition.id) ?? composition.start ?? 0;
        const nextStart =
          composition.id === compositionId
            ? roundToPrecision(Math.max(start, 0), timelinePrecision)
            : roundToPrecision(previousStart, timelinePrecision);
        const nextComposition =
          composition.id === compositionId
            ? {
                ...composition,
                start: nextStart,
                layerId: layerId || undefined,
              }
            : { ...composition, start: nextStart };
        return rebaseCompositionTimelineMarkers(
          nextComposition,
          previousStart,
          nextStart,
        );
      });
    });
  }

  function moveCompositionMarkers(
    moves: Array<{
      compositionId: string;
      start: number;
      targetLayerId?: string;
    }>,
  ) {
    if (moves.length === 0) return;
    const moveById = new Map(moves.map((move) => [move.compositionId, move]));
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({
        ...scene,
        compositions: parts,
      });
      const startsById = new Map(
        timelineParts.map((composition) => [composition.id, composition.start]),
      );
      return parts.map((composition) => {
        const previousStart =
          startsById.get(composition.id) ?? composition.start ?? 0;
        const move = moveById.get(composition.id);
        const nextStart = roundToPrecision(
          Math.max(move?.start ?? previousStart, 0),
          timelinePrecision,
        );
        const nextComposition = move
          ? {
              ...composition,
              start: nextStart,
              layerId: move.targetLayerId || undefined,
            }
          : {
              ...composition,
              start: roundToPrecision(previousStart, timelinePrecision),
            };
        return rebaseCompositionTimelineMarkers(
          nextComposition,
          previousStart,
          nextStart,
        );
      });
    });
  }

  function updateCompositionMarker(
    compositionId: string,
    updater: (composition: Part) => Part,
  ) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({
        ...scene,
        compositions: parts,
      });
      const startsById = new Map(
        timelineParts.map((composition) => [composition.id, composition.start]),
      );
      return parts.map((composition) => {
        const previousStart =
          startsById.get(composition.id) ?? composition.start ?? 0;
        const withExplicitStart = {
          ...composition,
          start: roundToPrecision(previousStart, timelinePrecision),
        };
        const nextComposition =
          composition.id === compositionId
            ? updater(withExplicitStart)
            : withExplicitStart;
        return rebaseCompositionTimelineMarkers(
          nextComposition,
          previousStart,
          nextComposition.start ?? previousStart,
        );
      });
    });
  }

  function deleteCompositionFromTimeline(compositionId: string) {
    deleteCompositionsFromTimeline([compositionId]);
  }

  function deleteCompositionsFromTimeline(compositionIds: string[]) {
    const deleteIds = new Set(compositionIds);
    if (deleteIds.size === 0) return;
    const firstDeletedIndex = scene.compositions.findIndex((composition) =>
      deleteIds.has(composition.id),
    );
    if (firstDeletedIndex < 0) return;
    const remaining = scene.compositions.filter(
      (composition) => !deleteIds.has(composition.id),
    );
    const nextSelection =
      remaining[firstDeletedIndex]?.id ??
      remaining[firstDeletedIndex - 1]?.id ??
      "";
    updateSceneParts((parts) =>
      parts.filter((composition) => !deleteIds.has(composition.id)),
    );
    setSelectedPartId(nextSelection);
    setSelectedParts(nextSelection ? [{ partId: nextSelection }] : []);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
  }

  function addCompositionFromLibrary(
    compositionId: string,
    targetLayerId?: string,
    start = currentSceneTimeRef.current,
  ) {
    const compositionKey = normalizeDroppedCompositionKey(compositionId);
    const libraryComposition = compositionLibrary.find((composition) => {
      const fileName = composition.filePath?.split("/").pop() ?? "";
      const filePath = composition.filePath ?? "";
      return (
        composition.id === compositionKey ||
        filePath === compositionKey ||
        Boolean(filePath && compositionKey.endsWith(`/${filePath}`)) ||
        Boolean(
          filePath && compositionKey.endsWith(`/file-manager/${filePath}`),
        ) ||
        Boolean(filePath.endsWith(`/${compositionKey}`)) ||
        fileName === compositionKey ||
        getDisplayName(fileName) === compositionKey
      );
    });
    const fallbackFilePath = getCompositionFilePathFromDropKey(compositionKey);
    if (!libraryComposition && !fallbackFilePath) return;
    const sourceComposition =
      libraryComposition ??
      createDroppedCompositionPlaceholder(fallbackFilePath!);
    const clipId = `clip_${Date.now().toString(36)}`;
    const layerId =
      targetLayerId ??
      (timelineLayers.compositionLayers?.length
        ? timelineLayers.compositionLayers
        : defaultTimelineLayerState.compositionLayers!)?.[0]?.id ??
      "comp";
    const timelineComposition = {
      ...sourceComposition,
      id: clipId,
      compositionId: sourceComposition.compositionId ?? sourceComposition.id,
      start: roundToPrecision(Math.max(start, 0), timelinePrecision),
      layerId,
    };
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
    const nextBounds = new Map(
      markers.map((marker) => [
        marker.id,
        {
          start: marker.start,
          end: marker.start + marker.duration,
          snapIn: marker.snapIn,
          snapOut: marker.snapOut,
          mendInId: marker.mendInId,
          mendOutId: marker.mendOutId,
        },
      ]),
    );
    const mendedIds = new Set(
      snap.pairs.flatMap((pair: { previousId: string; nextId: string }) => [
        pair.previousId,
        pair.nextId,
      ]),
    );
    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds)
          nextBounds.set(pair.previousId, {
            ...previousBounds,
            mendOutId: undefined,
          });
        if (nextMarkerBounds)
          nextBounds.set(pair.nextId, {
            ...nextMarkerBounds,
            mendInId: undefined,
          });
      } else {
        if (previousBounds)
          nextBounds.set(pair.previousId, {
            ...previousBounds,
            end: pair.time,
            mendOutId: pair.nextId,
          });
        if (nextMarkerBounds)
          nextBounds.set(pair.nextId, {
            ...nextMarkerBounds,
            start: pair.time,
            mendInId: pair.previousId,
          });
      }
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({
        ...scene,
        compositions: parts,
      });
      const startsById = new Map(
        timelineParts.map((composition) => [composition.id, composition.start]),
      );
      return parts.map((composition) => {
        const previousStart =
          startsById.get(composition.id) ?? composition.start ?? 0;
        if (!mendedIds.has(composition.id)) {
          const fixedStart = roundToPrecision(previousStart, timelinePrecision);
          return rebaseCompositionTimelineMarkers(
            { ...composition, start: fixedStart },
            previousStart,
            fixedStart,
          );
        }
        const bounds = nextBounds.get(composition.id);
        if (!bounds)
          return {
            ...composition,
            start: roundToPrecision(previousStart, timelinePrecision),
          };
        const nextComposition = {
          ...composition,
          start: roundToPrecision(bounds.start, timelinePrecision),
          duration: roundToPrecision(
            bounds.end - bounds.start,
            timelinePrecision,
          ),
          snapIn: bounds.snapIn,
          snapOut: bounds.snapOut,
          mendInId: bounds.mendInId,
          mendOutId: bounds.mendOutId,
        };
        return rebaseCompositionTimelineMarkers(
          nextComposition,
          previousStart,
          nextComposition.start,
        );
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

function normalizeDroppedCompositionKey(value: string) {
  return value
    .replace(/^os-file:/, "")
    .replace(/\\/g, "/")
    .replace(/^file-manager\//, "")
    .replace(/\.composition3d\.json$/, ".composition.ts");
}

function getCompositionFilePathFromDropKey(value: string) {
  const fileManagerIndex = value.lastIndexOf("/file-manager/");
  const path =
    fileManagerIndex >= 0
      ? value.slice(fileManagerIndex + "/file-manager/".length)
      : value.startsWith("file-manager/")
        ? value.slice("file-manager/".length)
        : value;
  if (!path) return null;
  return path.endsWith(".composition.ts") || path.endsWith(".composition.json")
    ? path
    : null;
}

function createDroppedCompositionPlaceholder(filePath: string): Part {
  return {
    id: filePath,
    compositionId: filePath,
    filePath,
    duration: 5,
    frame: { width: 1920, height: 1080, style: {} },
    background: {
      id: "background",
      name: "Background",
      style: {},
      elements: [],
    },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}
