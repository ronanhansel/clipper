import { defaultTimelineLayerState, defaultTimelineViewportState, replacePartInProject } from "../../../core/project";
import type { AdjustmentLayer, EditorState, Part, ProjectManifest, TimelineLayerState, TimelineMode, TimelineViewportState, TranslationMarker, ZoomMarker } from "../../../core/types";
import { timelineClipFromPart } from "./timelineLayerHelpers";

type UpdateProject = (updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest), options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
type UpdateEditorState = (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean }) => void;

type UseTimelineProjectActionsInput = {
  scene: {
    id: string;
    compositions: Part[];
    adjustmentLayers?: AdjustmentLayer[];
    translationMarkers?: TranslationMarker[];
    zoomMarkers?: ZoomMarker[];
  };
  timelineMode: TimelineMode;
  updateEditorState: UpdateEditorState;
  updateProject: UpdateProject;
};

export function useTimelineProjectActions({ scene, timelineMode, updateEditorState, updateProject }: UseTimelineProjectActionsInput) {
  function updateSceneParts(updater: (compositions: Part[]) => Part[]) {
    updateProject((current) => {
      const currentScene = current.scenes.find((item) => item.id === scene.id) ?? scene;
      const nextParts = updater(currentScene.compositions);
      return {
        ...current,
        timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, clips: nextParts.map(timelineClipFromPart) } : timeline)),
      };
    });
  }

  function updateSceneMotionMarkers(updater: (markers: { zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] }) => { zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] }) {
    updateProject((current) => {
      const currentTimeline = current.timelines?.find((timeline) => timeline.id === scene.id);
      const nextMarkers = updater({ zoomMarkers: currentTimeline?.zoomMarkers ?? scene.zoomMarkers ?? [], translationMarkers: currentTimeline?.translationMarkers ?? scene.translationMarkers ?? [] });
      return {
        ...current,
        timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, zoomMarkers: nextMarkers.zoomMarkers, translationMarkers: nextMarkers.translationMarkers } : timeline)),
      };
    });
  }

  function updateSceneAdjustmentLayers(updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[]) {
    updateProject((current) => {
      const currentTimeline = current.timelines?.find((timeline) => timeline.id === scene.id);
      const nextLayers = updater(currentTimeline?.adjustmentLayers ?? scene.adjustmentLayers ?? []);
      return {
        ...current,
        timelines: current.timelines?.map((timeline) => (timeline.id === scene.id ? { ...timeline, adjustmentLayers: nextLayers } : timeline)),
      };
    });
  }

  function updateCurrentPart(nextPart: Part) {
    updateSceneParts((parts) => parts.map((item) => (item.id === nextPart.id ? nextPart : item)));
  }

  function updateCompositionForTimelinePart(partId: string, updater: (composition: Part) => Part) {
    updateProject((current) => {
      const currentScene = current.scenes.find((item) => item.id === scene.id);
      const timelinePart = currentScene?.compositions.find((item) => item.id === partId);
      const compositionId = timelinePart?.compositionId ?? partId;
      return replacePartInProject(current, compositionId, updater);
    });
  }

  function updateTimelineViewportState(updater: (state: TimelineViewportState) => TimelineViewportState) {
    updateEditorState((state) => ({ ...state, timeline: updater(state.timeline ?? defaultTimelineViewportState), timelineMode }));
  }

  function updateTimelineLayers(updater: (state: TimelineLayerState) => TimelineLayerState, options: { history?: boolean } = {}) {
    updateEditorState((state) => ({ ...state, timelineLayers: updater(state.timelineLayers ?? defaultTimelineLayerState) }), { history: options.history, coalesceHistory: false });
  }

  return {
    updateCompositionForTimelinePart,
    updateCurrentPart,
    updateSceneAdjustmentLayers,
    updateSceneMotionMarkers,
    updateSceneParts,
    updateTimelineLayers,
    updateTimelineViewportState,
  };
}
