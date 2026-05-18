import { getTransitionEffectPackage } from "../../../core/effects/registry";
import { normalizeSymmetricTransitionLayer } from "../../../core/transitions";
import { roundToPrecision } from "../../../core/math";
import type {
  ProjectManifest,
  TransitionLayer,
  SelectionPayload,
} from "../../../core/types";

type UpdateProject = (
  updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest),
  options?: {
    history?: boolean;
    syncSources?: boolean;
    coalesceHistory?: boolean;
  },
) => void;

type UseTransitionLayerCommandsInput = {
  scene: {
    id: string;
    transitionLayers?: TransitionLayer[];
  };
  timelinePrecision: number;
  updateProject: UpdateProject;
  setSelectedTransitionLayerId: (id: string | null) => void;
  setSelectedTransitionLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedParts: (selection: Array<{ partId: string }>) => void;
  setSelectedMotionMarker: (
    selection: { partId: string; markerId: string } | null,
  ) => void;
  setSelectedMotionMarkers: (
    selection: Array<{ partId: string; markerId: string }>,
  ) => void;
  clearMarkerSelection: () => void;
};

export function useTransitionLayerCommands({
  scene,
  timelinePrecision,
  updateProject,
  setSelectedTransitionLayerId,
  setSelectedTransitionLayers,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedPartId,
  setSelectedParts,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  clearMarkerSelection,
}: UseTransitionLayerCommandsInput) {
  function selectTransitionLayer(layerId: string) {
    setSelectedTransitionLayerId(layerId);
    setSelectedTransitionLayers([{ layerId }]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    clearMarkerSelection();
  }

  function selectTransitionLayers(selection: Array<{ layerId: string }>) {
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers(selection);
  }

  function moveTransitionLayer(
    layerId: string,
    start: number,
    targetLayerId?: string,
  ) {
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                transitionLayers: (timeline.transitionLayers ?? []).map(
                  (layer) =>
                    layer.id === layerId
                      ? {
                          ...layer,
                          start: roundToPrecision(start, timelinePrecision),
                          layerId: targetLayerId ?? layer.layerId,
                        }
                      : layer,
                ),
              }
            : timeline,
        ),
      }),
      { history: true },
    );
  }

  function moveTransitionLayers(
    moves: Array<{ layerId: string; start: number; targetLayerId?: string }>,
  ) {
    const moveById = new Map(moves.map((move) => [move.layerId, move]));
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                transitionLayers: (timeline.transitionLayers ?? []).map(
                  (layer) => {
                    const move = moveById.get(layer.id);
                    return move
                      ? {
                          ...layer,
                          start: roundToPrecision(
                            move.start,
                            timelinePrecision,
                          ),
                          layerId: move.targetLayerId ?? layer.layerId,
                        }
                      : layer;
                  },
                ),
              }
            : timeline,
        ),
      }),
      { history: true },
    );
  }

  function updateTransitionLayer(
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) {
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                transitionLayers: (timeline.transitionLayers ?? []).map(
                  (layer) =>
                    layer.id === layerId
                      ? normalizeSymmetricTransitionLayer(updater(layer))
                      : layer,
                ),
              }
            : timeline,
        ),
      }),
      { history: true },
    );
  }

  function addTransitionLayerAt(
    effectId: string,
    sceneTime: number,
    layerId?: string,
  ) {
    const effect = getTransitionEffectPackage(effectId);
    if (!effect) return;
    const newLayerId = `transition-${Date.now().toString(36)}`;
    const duration = effect.defaultDuration;
    const midPoint = duration / 2;
    const start = roundToPrecision(Math.max(sceneTime, 0), timelinePrecision);
    const newLayer = effect.createDefaultLayer({
      id: newLayerId,
      layerId,
      start,
      duration,
      midPoint,
    });
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                transitionLayers: [
                  ...(timeline.transitionLayers ?? []),
                  newLayer,
                ],
              }
            : timeline,
        ),
      }),
      { history: true },
    );
    selectTransitionLayer(newLayerId);
  }

  return {
    selectTransitionLayer,
    selectTransitionLayers,
    moveTransitionLayer,
    moveTransitionLayers,
    updateTransitionLayer,
    addTransitionLayerAt,
  };
}
