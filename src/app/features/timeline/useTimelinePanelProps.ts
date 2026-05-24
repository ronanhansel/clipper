import { useMemo, type RefObject } from "react";
import type { TimelinePanelProps } from "../../../components/timeline/timelineTypes";
import { defaultTimelineViewportState } from "../../../core/project";
import type { ProjectManifest, TimelinePart } from "../../../core/types";

type ScrubFn = (time: number) => void;

export type UseTimelinePanelPropsParams = {
  activeTimelineName: string;
  composeMode: boolean;
  previewTime: number;
  currentSceneTime: number;
  isPlaying: boolean;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  timelineScrubbingRef: RefObject<boolean>;
  fastSelectEnabled: boolean;
  scrubCommitThrottleMs: number;
  markerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  timelinePrecision: number;
  scrubSnapEnabled: boolean;
  visiblePrerenderCoverage: TimelinePanelProps["prerenderCacheCoverage"];
  manualPrerenderCompositionIds: TimelinePanelProps["prerenderedCompositionIds"];
  manualPrerenderRanges: TimelinePanelProps["prerenderedCompositionRanges"];
  sceneDurationSeconds: number;
  selectedPartId: TimelinePanelProps["selectedPartId"];
  selectedParts: TimelinePanelProps["selectedParts"];
  selectedMotionMarker: { partId: string; markerId: string } | null;
  selectedMotionMarkers: TimelinePanelProps["selectedMotionMarkers"];
  selectedAdjustmentLayerId: TimelinePanelProps["selectedAdjustmentLayerId"];
  selectedAdjustmentLayers: TimelinePanelProps["selectedAdjustmentLayers"];
  timelineMode: TimelinePanelProps["mode"];
  project: ProjectManifest;
  timeline: TimelinePart[];
  scene: {
    motionMarkers?: TimelinePanelProps["motionMarkers"];
    adjustmentLayers?: TimelinePanelProps["adjustmentLayers"];
    transitionLayers?: TimelinePanelProps["transitionLayers"];
  };
  timelineLayers: TimelinePanelProps["timelineLayers"];
  handleTimelineModeChange: TimelinePanelProps["onModeChange"];
  updateComposeTimelineViewportState: TimelinePanelProps["onTimelineViewportStateChange"];
  updateTimelineViewportState: TimelinePanelProps["onTimelineViewportStateChange"];
  updateTimelineLayers: TimelinePanelProps["onTimelineLayersChange"];
  addCompositionTimelineLayer: TimelinePanelProps["onAddCompositionLayer"];
  removeCompositionTimelineLayer: TimelinePanelProps["onRemoveCompositionLayer"];
  addAdjustmentTimelineLayer: TimelinePanelProps["onAddAdjustmentLayer"];
  removeAdjustmentTimelineLayer: TimelinePanelProps["onRemoveAdjustmentLayer"];
  addMotionLayer: TimelinePanelProps["onAddMotionLayer"];
  removeMotionLayer: TimelinePanelProps["onRemoveMotionLayer"];
  selectPart: TimelinePanelProps["onSelectPart"];
  openComposePart: TimelinePanelProps["onOpenComposePart"];
  selectMotionMarker: TimelinePanelProps["onSelectMotionMarker"];
  selectMotionMarkers: TimelinePanelProps["onSelectMotionMarkers"];
  selectAdjustmentLayer: TimelinePanelProps["onSelectAdjustmentLayer"];
  selectAdjustmentLayers: TimelinePanelProps["onSelectAdjustmentLayers"];
  selectTimelineNodes: TimelinePanelProps["onSelectTimelineNodes"];
  clearNodeSelection: TimelinePanelProps["onClearTimelineSelection"];
  openTimelineNodeContextMenu: TimelinePanelProps["onOpenNodeContextMenu"];
  openTimelineBlankContextMenu: TimelinePanelProps["onOpenBlankContextMenu"];
  moveAdjustmentLayer: TimelinePanelProps["onMoveAdjustmentLayer"];
  moveAdjustmentLayers: TimelinePanelProps["onMoveAdjustmentLayers"];
  updateAdjustmentLayer: TimelinePanelProps["onUpdateAdjustmentLayer"];
  reorderPart: TimelinePanelProps["onReorderPart"];
  moveCompositionMarker: TimelinePanelProps["onMoveComposition"];
  moveCompositionMarkers: TimelinePanelProps["onMoveCompositions"];
  updateCompositionMarker: TimelinePanelProps["onUpdateComposition"];
  moveMotionMarker: TimelinePanelProps["onMoveMotionMarker"];
  moveMotionMarkers: TimelinePanelProps["onMoveMotionMarkers"];
  activeTimelinePart: TimelinePart | null | undefined;
  scrubComposePlaybackTime: ScrubFn;
  scrubToSceneTime: ScrubFn;
  pausePlaybackOnScrub: boolean;
  pausePlaybackForTimelineScrub: () => void;
  resumePlaybackAfterTimelineScrub: () => void;
  updateMotionMarkers: TimelinePanelProps["onUpdateMotionMarkers"];
  resizeMotionMarkers: TimelinePanelProps["onResizeMotionMarkers"];
  addCompositionFromLibrary: TimelinePanelProps["onAddComposition"];
  handleSelectTimeline: TimelinePanelProps["onOpenTimeline"];
  addAdjustmentLayerAt: TimelinePanelProps["onAddAdjustmentEffect"];
  addMotionEffect: TimelinePanelProps["onAddMotionEffect"];
  addTransitionLayerAt: TimelinePanelProps["onAddTransitionEffect"];
  selectedTransitionLayerId: TimelinePanelProps["selectedTransitionLayerId"];
  selectedTransitionLayers: TimelinePanelProps["selectedTransitionLayers"];
  selectTransitionLayer: TimelinePanelProps["onSelectTransitionLayer"];
  selectTransitionLayers: TimelinePanelProps["onSelectTransitionLayers"];
  moveTransitionLayer: TimelinePanelProps["onMoveTransitionLayer"];
  moveTransitionLayers: TimelinePanelProps["onMoveTransitionLayers"];
  shiftTimelineGapMarkers: TimelinePanelProps["onShiftTimelineGapMarkers"];
  updateTransitionLayer: TimelinePanelProps["onUpdateTransitionLayer"];
  hasActiveComposition: boolean;
  part: TimelinePanelProps["composeAnimationPart"];
  selectedComposeObjectIds: TimelinePanelProps["selectedObjectIds"];
  updateTimelineMode: (mode: TimelinePanelProps["mode"]) => void;
  inspectComposeObject: TimelinePanelProps["onInspectComposeObject"];
  selectComposeLayerObjects: TimelinePanelProps["onSelectComposeObjects"];
  persistComposeSelection: TimelinePanelProps["onPersistComposeSelection"];
  renameComposeAnimationLayer: TimelinePanelProps["onRenameComposeAnimationLayer"];
  toggleComposeLayerHidden: TimelinePanelProps["onToggleComposeLayerHidden"];
  reorderComposeObjects: TimelinePanelProps["onReorderComposeObjects"];
  updateComposeObject: TimelinePanelProps["onUpdateComposeObject"];
  setAppContextMenu: TimelinePanelProps["setAppContextMenu"];
};

const noopScrubLifecycle = () => {};

export function useTimelinePanelProps(
  params: UseTimelinePanelPropsParams,
): TimelinePanelProps {
  const {
    activeTimelineName,
    composeMode,
    previewTime,
    currentSceneTime,
    isPlaying,
    playbackPlayheadRef,
    timelineScrubbingRef,
    fastSelectEnabled,
    scrubCommitThrottleMs,
    markerDurationSeconds,
    timelineEndPaddingFraction,
    timelinePrecision,
    scrubSnapEnabled,
    visiblePrerenderCoverage,
    manualPrerenderCompositionIds,
    manualPrerenderRanges,
    sceneDurationSeconds,
    selectedPartId,
    selectedParts,
    selectedMotionMarker,
    selectedMotionMarkers,
    selectedAdjustmentLayerId,
    selectedAdjustmentLayers,
    timelineMode,
    project,
    timeline,
    scene,
    timelineLayers,
    handleTimelineModeChange,
    updateComposeTimelineViewportState,
    updateTimelineViewportState,
    updateTimelineLayers,
    addCompositionTimelineLayer,
    removeCompositionTimelineLayer,
    addAdjustmentTimelineLayer,
    removeAdjustmentTimelineLayer,
    addMotionLayer,
    removeMotionLayer,
    selectPart,
    openComposePart,
    selectMotionMarker,
    selectMotionMarkers,
    selectAdjustmentLayer,
    selectAdjustmentLayers,
    selectTimelineNodes,
    clearNodeSelection,
    openTimelineNodeContextMenu,
    openTimelineBlankContextMenu,
    moveAdjustmentLayer,
    moveAdjustmentLayers,
    updateAdjustmentLayer,
    reorderPart,
    moveCompositionMarker,
    moveCompositionMarkers,
    updateCompositionMarker,
    moveMotionMarker,
    moveMotionMarkers,
    activeTimelinePart,
    scrubComposePlaybackTime,
    scrubToSceneTime,
    pausePlaybackOnScrub,
    pausePlaybackForTimelineScrub,
    resumePlaybackAfterTimelineScrub,
    updateMotionMarkers,
    resizeMotionMarkers,
    addCompositionFromLibrary,
    handleSelectTimeline,
    addAdjustmentLayerAt,
    addMotionEffect,
    addTransitionLayerAt,
    selectedTransitionLayerId,
    selectedTransitionLayers,
    selectTransitionLayer,
    selectTransitionLayers,
    moveTransitionLayer,
    moveTransitionLayers,
    shiftTimelineGapMarkers,
    updateTransitionLayer,
    hasActiveComposition,
    part,
    selectedComposeObjectIds,
    updateTimelineMode,
    inspectComposeObject,
    selectComposeLayerObjects,
    persistComposeSelection,
    renameComposeAnimationLayer,
    toggleComposeLayerHidden,
    reorderComposeObjects,
    updateComposeObject,
    setAppContextMenu,
  } = params;

  const onScrub =
    composeMode && activeTimelinePart
      ? scrubComposePlaybackTime
      : scrubToSceneTime;

  return useMemo<TimelinePanelProps>(
    () => ({
      timelineName: activeTimelineName,
      currentSceneTime: composeMode ? previewTime : currentSceneTime,
      isPlaying,
      playbackPlayheadRef,
      scrubbingRef: timelineScrubbingRef,
      fastSelectEnabled,
      scrubCommitThrottleMs,
      defaultNewMarkerDurationSeconds: markerDurationSeconds,
      timelineEndPaddingFraction,
      timelinePrecision,
      scrubSnapEnabled,
      prerenderCacheCoverage: !composeMode ? visiblePrerenderCoverage : null,
      prerenderedCompositionIds: manualPrerenderCompositionIds,
      prerenderedCompositionRanges: manualPrerenderRanges,
      sceneDuration: sceneDurationSeconds,
      selectedPartId,
      selectedParts,
      selectedMotionMarkerPartId: selectedMotionMarker?.partId ?? null,
      selectedMotionMarkerId: selectedMotionMarker?.markerId ?? null,
      selectedMotionMarkers,
      selectedAdjustmentLayerId,
      selectedAdjustmentLayers,
      mode: timelineMode,
      timelineViewportState: composeMode
        ? (project.editorState?.composeTimeline ?? defaultTimelineViewportState)
        : (project.editorState?.timeline ?? defaultTimelineViewportState),
      timeline,
      motionMarkers: scene.motionMarkers ?? [],
      timelineLayers,
      adjustmentLayers: scene.adjustmentLayers ?? [],
      transitionLayers: scene.transitionLayers ?? [],
      onModeChange: handleTimelineModeChange,
      onTimelineViewportStateChange: composeMode
        ? updateComposeTimelineViewportState
        : updateTimelineViewportState,
      onTimelineLayersChange: updateTimelineLayers,
      onAddCompositionLayer: addCompositionTimelineLayer,
      onRemoveCompositionLayer: removeCompositionTimelineLayer,
      onAddAdjustmentLayer: addAdjustmentTimelineLayer,
      onRemoveAdjustmentLayer: removeAdjustmentTimelineLayer,
      onAddMotionLayer: addMotionLayer,
      onRemoveMotionLayer: removeMotionLayer,
      onSelectPart: selectPart,
      onOpenComposePart: openComposePart,
      onSelectMotionMarker: selectMotionMarker,
      onSelectMotionMarkers: selectMotionMarkers,
      onSelectAdjustmentLayer: selectAdjustmentLayer,
      onSelectAdjustmentLayers: selectAdjustmentLayers,
      onSelectTimelineNodes: selectTimelineNodes,
      onClearTimelineSelection: clearNodeSelection,
      onOpenNodeContextMenu: openTimelineNodeContextMenu,
      onOpenBlankContextMenu: openTimelineBlankContextMenu,
      onMoveAdjustmentLayer: moveAdjustmentLayer,
      onMoveAdjustmentLayers: moveAdjustmentLayers,
      onUpdateAdjustmentLayer: updateAdjustmentLayer,
      onReorderPart: reorderPart,
      onMoveComposition: moveCompositionMarker,
      onMoveCompositions: moveCompositionMarkers,
      onUpdateComposition: updateCompositionMarker,
      onMoveMotionMarker: moveMotionMarker,
      onMoveMotionMarkers: moveMotionMarkers,
      onScrub,
      onScrubStart: pausePlaybackOnScrub
        ? pausePlaybackForTimelineScrub
        : noopScrubLifecycle,
      onScrubEnd: pausePlaybackOnScrub
        ? resumePlaybackAfterTimelineScrub
        : noopScrubLifecycle,
      onUpdateMotionMarkers: updateMotionMarkers,
      onResizeMotionMarkers: resizeMotionMarkers,
      onAddComposition: addCompositionFromLibrary,
      onOpenTimeline: handleSelectTimeline,
      onAddAdjustmentEffect: addAdjustmentLayerAt,
      onAddMotionEffect: addMotionEffect,
      onAddTransitionEffect: addTransitionLayerAt,
      selectedTransitionLayerId,
      selectedTransitionLayers,
      onSelectTransitionLayer: selectTransitionLayer,
      onSelectTransitionLayers: selectTransitionLayers,
      onMoveTransitionLayer: moveTransitionLayer,
      onMoveTransitionLayers: moveTransitionLayers,
      onShiftTimelineGapMarkers: shiftTimelineGapMarkers,
      onUpdateTransitionLayer: updateTransitionLayer,
      composeAnimationPart: hasActiveComposition ? part : null,
      selectedObjectIds: selectedComposeObjectIds,
      onExitCompose: () => updateTimelineMode("direct"),
      onInspectComposeObject: inspectComposeObject,
      onSelectComposeObjects: selectComposeLayerObjects,
      onPersistComposeSelection: persistComposeSelection,
      onRenameComposeAnimationLayer: renameComposeAnimationLayer,
      onToggleComposeLayerHidden: toggleComposeLayerHidden,
      onReorderComposeObjects: reorderComposeObjects,
      onUpdateComposeObject: updateComposeObject,
      setAppContextMenu,
    }),
    [
      activeTimelineName,
      composeMode,
      previewTime,
      currentSceneTime,
      isPlaying,
      playbackPlayheadRef,
      timelineScrubbingRef,
      fastSelectEnabled,
      scrubCommitThrottleMs,
      markerDurationSeconds,
      timelineEndPaddingFraction,
      timelinePrecision,
      scrubSnapEnabled,
      visiblePrerenderCoverage,
      manualPrerenderCompositionIds,
      manualPrerenderRanges,
      sceneDurationSeconds,
      selectedPartId,
      selectedParts,
      selectedMotionMarker,
      selectedMotionMarkers,
      selectedAdjustmentLayerId,
      selectedAdjustmentLayers,
      timelineMode,
      project.editorState?.composeTimeline,
      project.editorState?.timeline,
      timeline,
      scene.motionMarkers,
      scene.adjustmentLayers,
      scene.transitionLayers,
      timelineLayers,
      handleTimelineModeChange,
      updateComposeTimelineViewportState,
      updateTimelineViewportState,
      updateTimelineLayers,
      addCompositionTimelineLayer,
      removeCompositionTimelineLayer,
      addAdjustmentTimelineLayer,
      removeAdjustmentTimelineLayer,
      addMotionLayer,
      removeMotionLayer,
      selectPart,
      openComposePart,
      selectMotionMarker,
      selectMotionMarkers,
      selectAdjustmentLayer,
      selectAdjustmentLayers,
      selectTimelineNodes,
      clearNodeSelection,
      openTimelineNodeContextMenu,
      openTimelineBlankContextMenu,
      moveAdjustmentLayer,
      moveAdjustmentLayers,
      updateAdjustmentLayer,
      reorderPart,
      moveCompositionMarker,
      moveCompositionMarkers,
      updateCompositionMarker,
      moveMotionMarker,
      moveMotionMarkers,
      onScrub,
      pausePlaybackOnScrub,
      pausePlaybackForTimelineScrub,
      resumePlaybackAfterTimelineScrub,
      updateMotionMarkers,
      resizeMotionMarkers,
      addCompositionFromLibrary,
      handleSelectTimeline,
      addAdjustmentLayerAt,
      addMotionEffect,
      addTransitionLayerAt,
      selectedTransitionLayerId,
      selectedTransitionLayers,
      selectTransitionLayer,
      selectTransitionLayers,
      moveTransitionLayer,
      moveTransitionLayers,
      shiftTimelineGapMarkers,
      updateTransitionLayer,
      hasActiveComposition,
      part,
      selectedComposeObjectIds,
      updateTimelineMode,
      inspectComposeObject,
      selectComposeLayerObjects,
      persistComposeSelection,
      renameComposeAnimationLayer,
      toggleComposeLayerHidden,
      reorderComposeObjects,
      updateComposeObject,
      setAppContextMenu,
    ],
  );
}
