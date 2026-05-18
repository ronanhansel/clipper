import { normalizeSymmetricTransitionLayer } from "../../../core/transitions";
import { roundToPrecision, roundTenth } from "../../../core/math";
import type {
  AdjustmentLayer,
  EditorState,
  ProjectManifest,
} from "../../../core/types";

type UseTimelineGapCommandsParams = {
  currentSceneTimeRef: { current: number };
  defaultEditorState: EditorState;
  scene: { id: string };
  timelinePrecision: number;
  scrubToSceneTime: (time: number) => void;
  updateProject: (
    updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest),
    options?: { history?: boolean },
  ) => void;
  updateSceneAdjustmentLayers: (
    updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[],
  ) => void;
};

export function useTimelineGapCommands({
  currentSceneTimeRef,
  defaultEditorState,
  scene,
  timelinePrecision,
  scrubToSceneTime,
  updateProject,
  updateSceneAdjustmentLayers,
}: UseTimelineGapCommandsParams) {
  function moveAdjustmentLayers(
    moves: Array<{ layerId: string; start: number; targetLayerId?: string }>,
  ) {
    const moveById = new Map(moves.map((move) => [move.layerId, move]));
    updateSceneAdjustmentLayers((layers: AdjustmentLayer[]) =>
      layers.map((layer: AdjustmentLayer) => {
        const move = moveById.get(layer.id);
        return move
          ? {
              ...layer,
              start: roundToPrecision(move.start, timelinePrecision),
              layerId: move.targetLayerId ?? layer.layerId,
            }
          : layer;
      }),
    );
  }

  function shiftTimelineGapMarkers(moves: {
    gapStart: number;
    gapEnd: number;
    delta: number;
    compositions: Array<{ compositionId: string; start: number }>;
    adjustmentLayers: Array<{ layerId: string; start: number }>;
    motionMarkers: Array<{ markerId: string; start: number }>;
    transitionLayers: Array<{ layerId: string; start: number }>;
  }) {
    const compositionStarts = new Map(
      moves.compositions.map((move) => [move.compositionId, move.start]),
    );
    const adjustmentStarts = new Map(
      moves.adjustmentLayers.map((move) => [move.layerId, move.start]),
    );
    const motionStarts = new Map(
      moves.motionMarkers.map((move) => [move.markerId, move.start]),
    );
    const transitionStarts = new Map(
      moves.transitionLayers.map((move) => [move.layerId, move.start]),
    );
    const playheadTime = currentSceneTimeRef.current;
    const nextPlayheadTime =
      playheadTime >= moves.gapEnd - 0.000001
        ? roundToPrecision(
            Math.max(0, playheadTime + moves.delta),
            timelinePrecision,
          )
        : playheadTime > moves.gapStart && playheadTime < moves.gapEnd
          ? roundToPrecision(moves.gapStart, timelinePrecision)
          : playheadTime;
    updateProject(
      (current) => ({
        ...current,
        editorState: {
          ...(current.editorState ?? defaultEditorState),
          currentSceneTime: nextPlayheadTime,
        },
        timelines: (current.timelines ?? []).map((timeline) => {
          if (timeline.id !== scene.id) return timeline;
          return {
            ...timeline,
            clips: timeline.clips.map((clip) => {
              const start = compositionStarts.get(clip.id);
              if (start === undefined) return clip;
              const previousStart = clip.start ?? 0;
              const delta = roundToPrecision(
                previousStart - start,
                timelinePrecision,
              );
              return {
                ...clip,
                start,
                motionMarkers: clip.motionMarkers?.map((marker) => ({
                  ...marker,
                  start: roundToPrecision(
                    marker.start + delta,
                    timelinePrecision,
                  ),
                })),
              };
            }),
            adjustmentLayers: (timeline.adjustmentLayers ?? []).map((layer) =>
              adjustmentStarts.has(layer.id)
                ? { ...layer, start: adjustmentStarts.get(layer.id)! }
                : layer,
            ),
            motionMarkers: (timeline.motionMarkers ?? []).map((marker) =>
              motionStarts.has(marker.id)
                ? { ...marker, start: motionStarts.get(marker.id)! }
                : marker,
            ),
            transitionLayers: (timeline.transitionLayers ?? []).map((layer) =>
              transitionStarts.has(layer.id)
                ? normalizeSymmetricTransitionLayer({
                    ...layer,
                    start: transitionStarts.get(layer.id)!,
                  })
                : layer,
            ),
          };
        }),
      }),
      { history: true },
    );
    if (Math.abs(nextPlayheadTime - playheadTime) >= 0.001)
      scrubToSceneTime(nextPlayheadTime);
  }

  return {
    moveAdjustmentLayers,
    shiftTimelineGapMarkers,
  };
}
