import { defaultTimelineLayerState, defaultTimelineMode, defaultTimelineViewportState, getSceneFromProject } from "../../../core/project";
import { getCanonicalMotionMarkers, getMotionMarkerViews } from "../../../core/motionEffects";
import { getAdjustmentLayerRowId, isMotionMarkerOnLayerId, removeTimelineAdjustmentLayerMarkers, removeTimelineMotionLayerMarkers } from "../../../core/timeline";
import { getTimelineStateLayers, insertTimelineStateLayer } from "../../../core/timelineLayers";
import type { AdjustmentLayerSelection, MotionMarkerSelection } from "../../types";
import type { AdjustmentLayer, MotionMarker, Part, ProjectManifest, SelectionPayload, TimelineLayerState, TimelineMotionLayerKind, TimelineMotionLayerState, TransitionLayer } from "../../../core/types";
import { createAdjustmentTimelineLayer, createBlankAdjustmentLayer, createBlankCompositionLayer, createBlankMotionLayer, createBlankTransitionLayer, createCompositionTimelineLayer, createMotionTimelineLayer, createTransitionTimelineLayer, timelineClipFromPart } from "./timelineLayerHelpers";

type UpdateProject = (updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest), options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
type UpdateTimelineLayers = (updater: (state: TimelineLayerState) => TimelineLayerState, options?: { history?: boolean }) => void;

type UseTimelineLayerCommandsInput = {
  motionLayers: TimelineMotionLayerState[];
  scene: {
    id: string;
    compositions: Part[];
    adjustmentLayers?: AdjustmentLayer[];
    motionMarkers?: MotionMarker[];
  };
  timelineLayers: TimelineLayerState;
  clearMarkerSelection: () => void;
  setFocusPickZoomMarker: (selection: { partId: string; markerId: string } | null) => void;
  setPositionPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedMotionMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  setSelectionPayload: (payload: SelectionPayload | null) => void;
  setTrackerPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  updateProject: UpdateProject;
  updateTimelineLayers: UpdateTimelineLayers;
};

export function useTimelineLayerCommands({
  motionLayers,
  scene,
  timelineLayers,
  clearMarkerSelection,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedObjectId,
  setSelectedPartId,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  setSelectionPayload,
  setTrackerPickTranslationMarker,
  updateProject,
  updateTimelineLayers,
}: UseTimelineLayerCommandsInput) {
  function addMotionLayer(kind: TimelineMotionLayerKind = "empty", targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = createMotionTimelineLayer(kind);
    updateTimelineLayers((state) => ({
      ...state,
      motionLayers: insertTimelineStateLayer(state.motionLayers ?? defaultTimelineLayerState.motionLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function addAdjustmentTimelineLayer(targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = createAdjustmentTimelineLayer();
    updateTimelineLayers((state) => ({
      ...state,
      adjustmentLayers: insertTimelineStateLayer(state.adjustmentLayers ?? defaultTimelineLayerState.adjustmentLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function addCompositionTimelineLayer(targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = createCompositionTimelineLayer();
    updateTimelineLayers((state) => ({
      ...state,
      compositionLayers: insertTimelineStateLayer(state.compositionLayers ?? defaultTimelineLayerState.compositionLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function removeCompositionTimelineLayer(layerId: string) {
    const layers = getTimelineStateLayers(timelineLayers, "comp", defaultTimelineLayerState);
    const hasCompositions = scene.compositions.some((composition) => (composition.layerId ?? "comp") === layerId);
    const nextCompositionLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [createBlankCompositionLayer()];
    updateProject((current) => ({
      ...current,
      editorState: {
        ...current.editorState,
        timeline: current.editorState?.timeline ?? defaultTimelineViewportState,
        timelineMode: current.editorState?.timelineMode ?? defaultTimelineMode,
        timelineLayers: {
          ...(current.editorState?.timelineLayers ?? defaultTimelineLayerState),
          compositionLayers: nextCompositionLayers,
        },
      },
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, clips: timeline.clips.filter((clip) => (clip.layerId ?? "comp") !== layerId) } : timeline)),
    }), { history: true });

    if (hasCompositions) {
      setSelectedPartId(scene.compositions.find((composition) => (composition.layerId ?? "comp") !== layerId)?.id ?? "");
      setSelectedObjectId(null);
      setSelectionPayload(null);
      clearMarkerSelection();
    }
  }

  function removeAdjustmentTimelineLayer(layerId: string) {
    const layers = getTimelineStateLayers(timelineLayers, "adjust", defaultTimelineLayerState);
    const hasLayers = (scene.adjustmentLayers ?? []).some((layer) => getAdjustmentLayerRowId(layer) === layerId);
    const nextAdjustmentLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [createBlankAdjustmentLayer()];
    updateProject((current) => ({
      ...current,
      editorState: {
        ...current.editorState,
        timeline: current.editorState?.timeline ?? defaultTimelineViewportState,
        timelineMode: current.editorState?.timelineMode ?? defaultTimelineMode,
        timelineLayers: {
          ...(current.editorState?.timelineLayers ?? defaultTimelineLayerState),
          adjustmentLayers: nextAdjustmentLayers,
        },
      },
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, adjustmentLayers: removeTimelineAdjustmentLayerMarkers(timeline.adjustmentLayers ?? [], layerId) } : timeline)),
    }), { history: true });

    if (hasLayers) {
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
    }
  }

  function removeMotionLayer(layerId: string) {
    const hasMarkers = motionLayerHasMarkers(layerId);
    const nextMotionLayers = motionLayers.length > 1 ? motionLayers.filter((layer) => layer.id !== layerId) : [createBlankMotionLayer()];
    updateProject((current) => ({
      ...current,
      editorState: {
        ...current.editorState,
        timeline: current.editorState?.timeline ?? defaultTimelineViewportState,
        timelineMode: current.editorState?.timelineMode ?? defaultTimelineMode,
        timelineLayers: {
          ...(current.editorState?.timelineLayers ?? defaultTimelineLayerState),
          motionLayers: nextMotionLayers,
        },
      },
      timelines: (current.timelines ?? []).map((timeline) => {
        if (timeline.id !== scene.id) return timeline;
        const currentScene = getSceneFromProject(current, scene.id) ?? scene;
        const clipsById = new Map(removeTimelineMotionLayerMarkers(currentScene.compositions, layerId).map((item) => [item.id, timelineClipFromPart(item)]));
        return {
          ...timeline,
          clips: timeline.clips.map((clip) => clipsById.get(clip.id) ?? clip),
          motionMarkers: getCanonicalMotionMarkers(timeline).filter((marker) => !isMotionMarkerOnLayerId(marker, layerId)),
        };
      }),
    }), { history: true });

    if (hasMarkers) {
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setFocusPickZoomMarker(null);
      setPositionPickTranslationMarker(null);
      setTrackerPickTranslationMarker(null);
    }
  }

  function motionLayerHasMarkers(layerId: string) {
    const motionViews = getMotionMarkerViews(scene);
    return motionViews.motionMarkers.some((marker) => isMotionMarkerOnLayerId(marker, layerId));
  }

  function assignAvailableMotionLayerKind(layerId: string | undefined, _kind: Exclude<TimelineMotionLayerKind, "empty">) {
    if (!layerId) return;
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!layer || (layer.kind !== "empty" && motionLayerHasMarkers(layerId))) return;
    updateTimelineLayers((state) => ({
      ...state,
      motionLayers: (state.motionLayers ?? []).map((item) => (item.id === layerId ? { ...item, kind: "motion" } : item)),
    }), { history: true });
  }

  function addTransitionTimelineLayer(targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = createTransitionTimelineLayer();
    updateTimelineLayers((state) => ({
      ...state,
      transitionLayers: insertTimelineStateLayer(state.transitionLayers ?? defaultTimelineLayerState.transitionLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function removeTransitionTimelineLayer(layerId: string) {
    const layers = getTimelineStateLayers(timelineLayers, "transition", defaultTimelineLayerState);
    const nextTransitionLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [createBlankTransitionLayer()];
    updateProject((current) => ({
      ...current,
      editorState: {
        ...current.editorState,
        timeline: current.editorState?.timeline ?? defaultTimelineViewportState,
        timelineMode: current.editorState?.timelineMode ?? defaultTimelineMode,
        timelineLayers: {
          ...(current.editorState?.timelineLayers ?? defaultTimelineLayerState),
          transitionLayers: nextTransitionLayers,
        },
      },
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, transitionLayers: (timeline.transitionLayers ?? []).filter((layer) => (layer.layerId ?? transitionLayerRowId(layer)) !== layerId) } : timeline)),
    }), { history: true });
  }

  return {
    addAdjustmentTimelineLayer,
    addCompositionTimelineLayer,
    addMotionLayer,
    addTransitionTimelineLayer,
    assignAvailableMotionLayerKind,
    motionLayerHasMarkers,
    removeAdjustmentTimelineLayer,
    removeCompositionTimelineLayer,
    removeMotionLayer,
    removeTransitionTimelineLayer,
  };
}

function transitionLayerRowId(layer: TransitionLayer) {
  return layer.layerId ?? layer.effect.effectId;
}
