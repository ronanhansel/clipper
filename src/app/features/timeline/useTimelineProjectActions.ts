import {
  defaultTimelineLayerState,
  defaultTimelineViewportState,
  getSceneFromProject,
  replacePartInProject,
} from "../../../core/project";
import { getCanonicalMotionMarkers } from "../../../core/motionEffects";
import type {
  AdjustmentLayer,
  EditorState,
  MotionMarker,
  Part,
  ProjectManifest,
  TimelineLayerState,
  TimelineMode,
  TimelineViewportState,
  TransitionLayer,
} from "../../../core/types";
import { timelineClipFromPart } from "./timelineLayerHelpers";

type UpdateProject = (
  updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest),
  options?: {
    history?: boolean;
    syncSources?: boolean;
    coalesceHistory?: boolean;
  },
) => void;
type UpdateEditorState = (
  updater: (state: EditorState) => EditorState,
  options?: { history?: boolean; coalesceHistory?: boolean },
) => void;
type UpdateCompositionOptions = {
  history?: boolean;
  syncSources?: boolean;
  coalesceHistory?: boolean;
};
export type SceneMotionMarkerUpdate = { motionMarkers: MotionMarker[] };

type UseTimelineProjectActionsInput = {
  scene: {
    id: string;
    compositions: Part[];
    adjustmentLayers?: AdjustmentLayer[];
    motionMarkers?: MotionMarker[];
    transitionLayers?: TransitionLayer[];
  };
  timelineMode: TimelineMode;
  updateEditorState: UpdateEditorState;
  updateProject: UpdateProject;
};

export function useTimelineProjectActions({
  scene,
  timelineMode,
  updateEditorState,
  updateProject,
}: UseTimelineProjectActionsInput) {
  function updateSceneParts(updater: (compositions: Part[]) => Part[]) {
    updateProject(
      (current) => {
        const currentScene = getSceneFromProject(current, scene.id) ?? scene;
        const nextParts = updater(currentScene.compositions);
        return {
          ...current,
          timelines: (current.timelines ?? []).map((timeline) =>
            timeline.id === scene.id
              ? { ...timeline, clips: nextParts.map(timelineClipFromPart) }
              : timeline,
          ),
        };
      },
      { history: true },
    );
  }

  function updateSceneMotionMarkers(
    updater: (markers: MotionMarker[]) => SceneMotionMarkerUpdate,
  ) {
    updateProject(
      (current) => {
        const currentTimeline = current.timelines?.find(
          (timeline) => timeline.id === scene.id,
        );
        const currentMotionMarkers = getCanonicalMotionMarkers(
          currentTimeline ?? scene,
        );
        const nextMarkers = updater(currentMotionMarkers);
        const nextMotionMarkers = nextMarkers.motionMarkers;
        return {
          ...current,
          timelines: (current.timelines ?? []).map((timeline) =>
            timeline.id === scene.id
              ? { ...timeline, motionMarkers: nextMotionMarkers }
              : timeline,
          ),
        };
      },
      { history: true },
    );
  }

  function updateSceneAdjustmentLayers(
    updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[],
  ) {
    updateProject(
      (current) => {
        const currentTimeline = current.timelines?.find(
          (timeline) => timeline.id === scene.id,
        );
        const nextLayers = updater(
          currentTimeline?.adjustmentLayers ?? scene.adjustmentLayers ?? [],
        );
        return {
          ...current,
          timelines: current.timelines?.map((timeline) =>
            timeline.id === scene.id
              ? { ...timeline, adjustmentLayers: nextLayers }
              : timeline,
          ),
        };
      },
      { history: true },
    );
  }

  function updateSceneTransitionLayers(
    updater: (layers: TransitionLayer[]) => TransitionLayer[],
  ) {
    updateProject(
      (current) => {
        const currentTimeline = current.timelines?.find(
          (timeline) => timeline.id === scene.id,
        );
        const nextLayers = updater(
          currentTimeline?.transitionLayers ?? scene.transitionLayers ?? [],
        );
        return {
          ...current,
          timelines: current.timelines?.map((timeline) =>
            timeline.id === scene.id
              ? { ...timeline, transitionLayers: nextLayers }
              : timeline,
          ),
        };
      },
      { history: true },
    );
  }

  function updateCurrentPart(nextPart: Part) {
    updateSceneParts((parts) =>
      parts.map((item) => (item.id === nextPart.id ? nextPart : item)),
    );
  }

  function updateCompositionForTimelinePart(
    partId: string,
    updater: (composition: Part) => Part,
    options: UpdateCompositionOptions = { history: true },
  ) {
    updateProject((current) => {
      const currentScene = getSceneFromProject(current, scene.id);
      const timelinePart = currentScene?.compositions.find(
        (item) => item.id === partId,
      );
      const compositionId = timelinePart?.compositionId ?? partId;
      return replacePartInProject(current, compositionId, updater);
    }, options);
  }

  function updateTimelineViewportState(
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) {
    updateEditorState((state) => ({
      ...state,
      timeline: updater(state.timeline ?? defaultTimelineViewportState),
      timelineMode,
    }));
  }

  function updateTimelineLayers(
    updater: (state: TimelineLayerState) => TimelineLayerState,
    options: { history?: boolean } = {},
  ) {
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                timelineLayers: updater(
                  timeline.timelineLayers ?? defaultTimelineLayerState,
                ),
              }
            : timeline,
        ),
      }),
      { history: options.history, coalesceHistory: false },
    );
  }

  return {
    updateCompositionForTimelinePart,
    updateCurrentPart,
    updateSceneAdjustmentLayers,
    updateSceneMotionMarkers,
    updateSceneParts,
    updateSceneTransitionLayers,
    updateTimelineLayers,
    updateTimelineViewportState,
  };
}
