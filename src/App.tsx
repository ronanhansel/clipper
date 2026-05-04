import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { useEditorPanelResize } from "./app/features/editor-layout/useEditorPanelResize";
import { useFramePreviewZoomCommands } from "./app/features/editor-layout/useFramePreviewZoomCommands";
import { usePreviewScrollPersistence } from "./app/features/editor-layout/usePreviewScrollPersistence";
import { useExportCommands } from "./app/features/export/useExportCommands";
import { usePlaybackController } from "./app/features/playback/usePlaybackController";
import { usePrerenderCache } from "./app/features/preview/usePrerenderCache";
import { usePresentationController } from "./app/features/presentation/usePresentationController";
import { isEditorTarget, useGlobalEditorShortcuts } from "./app/features/shortcuts/useGlobalEditorShortcuts";
import { useSettingsShortcut } from "./app/features/shortcuts/useSettingsShortcut";
import { getProjectFolderSiblingNames } from "./app/features/file-manager/compositionLibraryMutations";
import { getDirectoryPath } from "./app/features/file-manager/fileManagerPaths";
import { useFileManagerController } from "./app/features/file-manager/useFileManagerController";
import { useFileManagerProjectActions } from "./app/features/file-manager/useFileManagerProjectActions";
import { useFrameInteractionController, type FrameInteractionController } from "./app/features/frame-interactions/useFrameInteractionController";
import { useFrameObjectCommands } from "./app/features/frame-interactions/useFrameObjectCommands";
import { useAdjustmentLayerCommands } from "./app/features/timeline/useAdjustmentLayerCommands";
import { useCompositionTimelineCommands } from "./app/features/timeline/useCompositionTimelineCommands";
import { ConnectedTimelinePanel, TimelineProvider } from "./app/features/timeline/TimelineProvider";
import { getAdjustmentPointControlFramePoint, remapMovedMarkerMendIds, timelineMarkerKey, timelineMoveKey, uniqueMarkerSelections } from "./app/features/timeline/timelineMutationHelpers";
import { useTimelineLayerCommands } from "./app/features/timeline/useTimelineLayerCommands";
import { useMotionMarkerCommands } from "./app/features/timeline/useMotionMarkerCommands";
import { useTimelineClipboardCommands } from "./app/features/timeline/useTimelineClipboardCommands";
import { useTimelineProjectActions } from "./app/features/timeline/useTimelineProjectActions";
import { useTimelineSelectionCommands } from "./app/features/timeline/useTimelineSelectionCommands";
import { clipperHost } from "./app/clipperHost";
import { getDisplayNameFromPath } from "./core/fileNames";
import { useActiveProjectBoot, type BootProject } from "./app/project/useActiveProjectBoot";
import { useProjectDocumentController } from "./app/project/useProjectDocumentController";
import { useProjectFileWatcher } from "./app/project/useProjectFileWatcher";
import { projectPersistenceService } from "./app/services/projectPersistenceService";
import { AppDialogs } from "./app/shell/AppDialogs";
import { AppHeader } from "./app/shell/AppHeader";
import { CenterPreviewPane } from "./app/shell/CenterPreviewPane";
import { ConnectedInspectorContent } from "./app/shell/ConnectedInspectorContent";
import { EditorWorkspace, TimelineResizeHandle } from "./app/shell/EditorWorkspace";
import { LeftSidebar } from "./app/shell/LeftSidebar";
import { PresentationControls } from "./app/shell/PresentationControls";
import { RightInspectorPanel } from "./app/shell/RightInspectorPanel";
import { useEditorViewportState } from "./app/shell/useEditorViewportState";
import { useEditorModeCommands } from "./app/shell/useEditorModeCommands";
import { useProjectTitleRename } from "./app/shell/useProjectTitleRename";
import { defaultPrerenderBlockDurationMs, defaultScrubCommitThrottleMs, defaultVideoExportTileHeight, maxPrerenderBlockDurationMs, maxVideoExportTileHeight, minPrerenderBlockDurationMs, minVideoExportTileHeight, selectorHandleSizePx, selectorOffsetPx } from "./app/config";
import { useEditorStatePersistence } from "./app/project/useEditorStatePersistence";
import { useEditorDerivedState } from "./app/state/editorDerivedState";
import { getFramePreviewTimelineLayers } from "./app/state/framePreviewRenderModel";
import { EditorStoreProvider, useAppEditorState, useEditorStoreApi, type EditorTab } from "./app/state/editorStore";
import { ProjectStoreProvider } from "./app/state/projectStore";
import { type AdjustmentLayerSelection, type CompositionSelection, type ExportDialogTab, type LeftPanelTab, type PlaybackClock, type ProjectExportFormat, type RightPanelTab, type SettingsSection } from "./app/types";
import { getTimeSensitiveDisplayDuration, getTimeSensitiveDisplayTime } from "./core/adjustments";
import { isMarkerOnMotionLayer, type CameraPreviewTransform } from "./core/camera";
import { getBoundsUnion, getFrameObjectWithPreviewBounds, getPartFrameObject, selectionObjectFromFrameObject, type ObjectDrag, type ObjectResize } from "./core/frameInteraction";
import { boundsToPoints } from "./core/geometry";
import { clamp, roundToPrecision, roundTenth } from "./core/math";
import type { AdjustmentEffectPointControl } from "./core/effects/types";
import { getTransitionEffectPackage } from "./core/effects/registry";
import { normalizeSymmetricTransitionLayer } from "./core/transitions";
import { defaultComposeLayoutState, defaultEditorLayoutState, defaultPreviewViewportState, defaultTimelineLayerState, defaultTimelineMode, defaultTimelineViewportState, emptyTimelineLayerState } from "./core/project";
import { getExecutableAdjustmentLayers, getExecutableTransitionLayers } from "./core/timeline";
import type { TimelineLayerCategory } from "./core/timelineLayers";
import { FRAME_HEIGHT, FRAME_WIDTH, type Bounds, type CompositionClip, type EditorSessionState, type EditorState, type FrameObject, type LayerAnimation, type MotionEffectKind, type Part, type Point, type ProjectManifest, type SelectionPayload, type TimelineClip, type TimelineLayerState, type TimelineViewportState } from "./core/types";
import { FindMediaDialog } from "./components/FileManager";
import type { EditorPaneDocument, EditorPaneTab } from "./components/EditorPane";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { consumePendingFileManagerFindMedia, fileManagerFindMediaEvent, type FileManagerFindMediaDetail } from "./lib/fileManagerEvents";

const defaultEditorState: EditorState = {
  timeline: defaultTimelineViewportState,
  composeTimeline: defaultTimelineViewportState,
  timelineMode: defaultTimelineMode,
  mode: "preview",
  leftPanelTab: "assets",
  rightPanelTab: "video",
  currentSceneTime: 0,
  layout: defaultEditorLayoutState,
  composeLayout: defaultComposeLayoutState,
  preview: defaultPreviewViewportState,
  editor: {},
};

const unsupportedEditorExtensions = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv", "mp3", "wav", "aiff", "flac", "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip"]);

function getEditorLanguage(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "js" || extension === "jsx") return "javascript";
  if (extension === "css") return "css";
  if (extension === "json") return "json";
  if (extension === "md") return "markdown";
  if (extension === "html") return "html";
  return "plaintext";
}

function isUnsupportedEditorFile(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return unsupportedEditorExtensions.has(extension);
}

function toPersistedEditorSession(editorTabs: EditorTab[], activeEditorTabId: string | null): EditorSessionState {
  const pinnedTabs = editorTabs.filter((tab) => tab.isPinned);
  const activePinnedTabId = activeEditorTabId && pinnedTabs.some((tab) => tab.id === activeEditorTabId) ? activeEditorTabId : pinnedTabs[0]?.id ?? null;
  const session: EditorSessionState = {
    tabs: pinnedTabs.map((tab) => ({
      id: tab.id,
      filePath: tab.filePath,
      language: tab.language,
      ...(tab.unsupportedReason ? { unsupportedReason: tab.unsupportedReason } : {}),
      ...(tab.isComposition ? { isComposition: true } : {}),
      isPinned: true,
    })),
  };
  if (activePinnedTabId) session.activeTabId = activePinnedTabId;
  return session;
}

function PathToastMessage({ action, path }: { action: string; path: string }) {
  const suffixLength = Math.min(32, Math.max(12, Math.floor(path.length / 3)));
  const splitIndex = Math.max(path.length - suffixLength, 0);

  return (
    <span className="grid min-w-0 max-w-[min(560px,calc(100vw_-_120px))] gap-0.5 leading-tight">
      <span>{action}</span>
      <span className="flex min-w-0 whitespace-nowrap" title={path}>
        <span className="min-w-0 overflow-hidden text-ellipsis">{path.slice(0, splitIndex)}</span>
        <span className="shrink-0">{path.slice(splitIndex)}</span>
      </span>
    </span>
  );
}

export function App() {
  const { bootError, bootProject, isWelcome, recentProjects, openProjectFromBoot, createNewProject, openRecentProject, deleteRecentProject, closeProject } = useActiveProjectBoot();

  if (isWelcome || bootError) {
    return (
      <WelcomeScreen
        error={bootError}
        recentProjects={recentProjects}
        onCreateNewProject={createNewProject}
        onDeleteRecentProject={deleteRecentProject}
        onOpenProject={openProjectFromBoot}
        onOpenRecentProject={openRecentProject}
      />
    );
  }

  if (!bootProject) {
    return <main className="grid h-screen place-items-center bg-[#12141a] text-sm font-bold text-[#dfe2ea]">Opening project...</main>;
  }

  return <AppProviders bootProject={bootProject} onCloseProject={closeProject} />;
}

function AppProviders({ bootProject, onCloseProject }: { bootProject: BootProject; onCloseProject: () => void }) {
  return (
    <ProjectStoreProvider key={bootProject.manifestPath} project={bootProject.project} compositionSources={bootProject.compositionSources}>
      <EditorStoreProvider project={bootProject.project}>
        <AppContent initialProjectManifestPath={bootProject.manifestPath} initialSourceStatus={bootProject.sourceStatus} onCloseProject={onCloseProject} />
      </EditorStoreProvider>
    </ProjectStoreProvider>
  );
}

function AppContent({ initialProjectManifestPath, initialSourceStatus, onCloseProject }: { initialProjectManifestPath: string; initialSourceStatus: string; onCloseProject: () => void }) {
  const editorStore = useEditorStoreApi();
  const [currentSceneTime, setRenderCurrentSceneTime] = useState(() => editorStore.getState().currentSceneTime);
  const [trackerPickTranslationMarker, setTrackerPickTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [pointPickAdjustment, setPointPickAdjustment] = useState<{ layerId: string; control: AdjustmentEffectPointControl } | null>(null);
  const [findMediaRequest, setFindMediaRequest] = useState<FileManagerFindMediaDetail | null>(null);
  const [reusePrerenderCacheForExport, setReusePrerenderCacheForExportState] = useState(isPrerenderCacheReuseEnabledByDefault);
  const [prerenderCacheEnabled, setPrerenderCacheEnabledState] = useState(isPrerenderCacheEnabledByDefault);
  const [debugSettingsEnabled, setDebugSettingsEnabledState] = useState(isDebugSettingsEnabledByDefault);
  const [prerenderCacheBlackMissDebug, setPrerenderCacheBlackMissDebugState] = useState(isPrerenderCacheBlackMissDebugEnabledByDefault);
  const {
    mode, setMode,
    timelineMode, setTimelineMode,
    selectedSceneId, setSelectedSceneId,
    selectedPartId, setSelectedPartId,
    selectedParts, setSelectedParts,
    selectedObjectId, setSelectedObjectId,
    editingTextObjectId, setEditingTextObjectId,
    selectedMotionMarker, setSelectedMotionMarker,
    selectedMotionMarkers, setSelectedMotionMarkers,
    focusPickZoomMarker, setFocusPickZoomMarker,
    positionPickTranslationMarker, setPositionPickTranslationMarker,
    selectedAdjustmentLayerId, setSelectedAdjustmentLayerId,
    selectedAdjustmentLayers, setSelectedAdjustmentLayers,
    selectedTransitionLayerId, setSelectedTransitionLayerId,
    selectedTransitionLayers, setSelectedTransitionLayers,
    selectionPayload, setSelectionPayload,
    framePickPreviewPoint, setFramePickPreviewPoint,
    dragStart, setDragStart,
    dragBox, setDragBox,
    marqueeDragging, setMarqueeDragging,
    isPlaying, setIsPlaying,
    playbackClock, setPlaybackClock,
    frameZoomBarOpen, setFrameZoomBarOpen,
    framePreviewScale, setFramePreviewScale,
    scrubSnapEnabled, setScrubSnapEnabled,
    scrubCommitThrottleMs, setScrubCommitThrottleMs,
    defaultNewMarkerDurationSeconds: markerDurationSeconds, setDefaultNewMarkerDurationSeconds,
    timelineEndPaddingFraction, setTimelineEndPaddingFraction,
    timelinePrecision, setTimelinePrecision,
    fastSelectEnabled, setFastSelectEnabled,
    leftPanelTab, setLeftPanelTab,
    rightPanelTab, setRightPanelTab,
    sourceStatus, setSourceStatus,
    appContextMenu, setAppContextMenu,
    renamingProject, setRenamingProject,
    projectNameDraft, setProjectNameDraft,
    exportDialogOpen, setExportDialogOpen,
    exportDialogTab, setExportDialogTab,
    projectExportFormat, setProjectExportFormat,
    exportIncludeSources, setExportIncludeSources,
    isExporting, setIsExporting,
    exportProgress, setExportProgress,
    videoExportProgress, setVideoExportProgress,
    videoExportCancelling, setVideoExportCancelling,
    settingsOpen, setSettingsOpen,
    settingsSection, setSettingsSection,
    editorTabs,
    activeEditorTabId,
    openEditorTab,
    openTemporaryEditorTab,
    pinEditorTab,
    updateEditorTab,
    selectEditorTab,
    closeEditorTab,
    restoreClosedEditorTab,
    setCurrentSceneTime,
    applyEditorState: applyStoredEditorState,
    clearMarkerSelection: clearStoredMarkerSelection,
    clearNodeSelection: clearStoredNodeSelection,
  } = useAppEditorState();
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const appRootRef = useRef<HTMLElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const frameZoomControlRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const activePartFilePathRef = useRef("");
  const currentSceneTimeRef = useRef(currentSceneTime);
  const cachedPreviewDisplayReadyRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const playbackClockRef = useRef<PlaybackClock>(null);
  const wasPlayingRef = useRef(false);
  const timelineScrubbingRef = useRef(false);
  const timelineScrubPausedPlaybackRef = useRef(false);
  const presentationScrubPausedPlaybackRef = useRef(false);
  const numberInputScrubPausedPlaybackRef = useRef(false);
  const playbackTimeLabelRef = useRef<HTMLSpanElement | null>(null);
  const playbackPlayheadRef = useRef<HTMLDivElement | null>(null);
  const [videoExportTileHeight, setVideoExportTileHeightState] = useState(
    getInitialVideoExportTileHeight,
  );
  const [prerenderBlockDurationMs, setPrerenderBlockDurationMsState] = useState(
    getInitialPrerenderBlockDurationMs,
  );
  const [prerenderCacheResetToken, setPrerenderCacheResetToken] = useState(0);
  const playbackBorderScrubberRef = useRef<HTMLInputElement | null>(null);
  const pendingScrubTimeRef = useRef<number | null>(null);
  const scrubFrameRef = useRef(0);
  const pendingFramePickPointRef = useRef<Point | null>(null);
  const framePickFrameRef = useRef(0);
  const dragStartRef = useRef<Point | null>(null);
  const pendingDragBoxRef = useRef<Bounds | null>(null);
  const dragBoxFrameRef = useRef(0);
  const marqueeDraggingRef = useRef(false);
  const marqueeLastPointRef = useRef<Point | null>(null);
  const marqueeSpacePanningRef = useRef(false);
  const liveDragSelectionIdsRef = useRef("");
  const objectDragRef = useRef<ObjectDrag | null>(null);
  const objectDragFrameRef = useRef(0);
  const objectDragDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const objectResizeRef = useRef<ObjectResize | null>(null);
  const objectResizeFrameRef = useRef(0);
  const objectResizeDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const objectResizePreserveAspectRef = useRef(false);
  const centerPreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const centerPreviewScrollFrameRef = useRef(0);
  const pendingZoomScalePreviewRef = useRef<CameraPreviewTransform | null>(null);
  const zoomScalePreviewFrameRef = useRef(0);
  const timelineModeRef = useRef(timelineMode);
  const frameInteractionControllerRef = useRef<FrameInteractionController | null>(null);

  function cancelFramePickPreview() {
    frameInteractionControllerRef.current?.cancelFramePickPreview();
  }

  function clearObjectDrag() {
    frameInteractionControllerRef.current?.clearObjectDrag();
  }

  function clearObjectResize() {
    frameInteractionControllerRef.current?.clearObjectResize();
  }

  function clearDragBox() {
    frameInteractionControllerRef.current?.clearDragBox();
  }

  const notifyError = useCallback((error: unknown, fallback: string) => {
    toast.error(error instanceof Error ? error.message : fallback);
  }, []);

  const notifyOpenSuccess = useCallback((path: string) => {
    toast.success(<PathToastMessage action="Opened" path={path} />);
  }, []);

  const {
    activeProjectManifestPath,
    activeProjectManifestPathRef,
    compositionSources,
    compositionSourcesRef,
    implicitFileOperation,
    isFileSystemBusy,
    openProjectManifest,
    project,
    projectRef,
    replaceProject,
    redoProjectChange,
    reloadProject,
    saveAllChanges,
    saveAllChangesRef,
    savedCompositionSourcesSnapshot,
    savedProjectSnapshot,
    scheduleImplicitFileOperationSave,
    setCompositionSources,
    syncCompositionSourcesFromProject,
    undoProjectChange,
    updateCompositionFromSource,
    updateEditorState,
    updateProject,
    watchedProjectDirectory,
    executeFileManagerCommand,
    fileSystemRevision,
  } = useProjectDocumentController({
    applyStoredEditorState,
    centerPreviewScrollRef,
    defaultEditorState,
    initialProjectManifestPath,
    modeRef,
    notifyError,
    notifyOpenSuccess,
    setSourceStatus,
    setTimelineMode,
    timelineModeRef,
  });

  useProjectFileWatcher({
    manifestPath: activeProjectManifestPath,
    project,
    compositionSources,
    updateCompositionFromSource,
    replaceProject,
    reloadProject,
    notifyError: (error, fallback) => toast.error(error instanceof Error ? error.message : fallback),
    isFileSystemBusy,
  });

  const { updateMode, updateTimelineMode } = useEditorModeCommands({
    modeRef,
    timelineModeRef,
    setMode,
    setTimelineMode,
    updateEditorState,
  });
  const { updateEditorViewportState } = useEditorViewportState(updateEditorState);
  const { toggleFrameZoomBar, updateFramePreviewScale } = useFramePreviewZoomCommands({
    frameZoomBarOpen,
    frameZoomControlRef,
    setFramePreviewScale,
    setFrameZoomBarOpen,
  });
  const { saveCenterPreviewScroll } = usePreviewScrollPersistence({
    centerPreviewScrollFrameRef,
    centerPreviewScrollRef,
    updateEditorState,
  });
  const { cancelProjectRename, commitProjectRename, openProjectTitleMenu } = useProjectTitleRename({
    projectName: project.name,
    projectNameDraft,
    projectRef,
    setAppContextMenu,
    setProjectNameDraft,
    setRenamingProject,
    updateProject,
  });

  const {
    activeTimelinePart,
    agentContext,
    assets = [],
    cameraPreviewTransform,
    canSelectFrameObjects,
    editorStateSnapshot,
    framePickPoint,
    hasUnsavedChanges,
    hasActiveComposition,
    inspectorAdjustmentMiddleSnap,
    inspectorCompositionMiddleSnap,
    inspectorMotionMiddleSnap,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    part,
    compositionSourcesSnapshot,
    previewTime,
    previewParts,
    renderableScene,
    transitionPreviewParts,
    scene,
    sceneDurationSeconds,
    selectedObject,
    selectedAdjustmentLayer,
    selectedPart,
    selectedMotion,
    selectedMotionPart,
    selectedMotionPartMiddleEase,
    selectedMotionPartMiddleSnapActive,
    selectedMotionPartMiddleTransitionMode,
    selectedMotionSnapInActive,
    selectedMotionSnapMarkers,
    selectedMotionSnapOutActive,
    timeline,
    validationErrors,
    zoomScale,
  } = useEditorDerivedState({
    currentSceneTime,
    focusPickZoomMarker,
    framePickPreviewPoint,
    compositionSources,
    positionPickTranslationMarker,
    project,
    savedCompositionSourcesSnapshot,
    savedProjectSnapshot,
    selectedObjectId,
    selectedAdjustmentLayerId,
    selectedPartId,
    selectedSceneId,
    selectedMotionMarker,
    selectedMotionMarkers,
    selectionPayload,
    timelineMode,
  });
  const composeMode = timelineMode === "compose";
  const composePlaybackRange = composeMode && activeTimelinePart ? { start: activeTimelinePart.start, end: activeTimelinePart.start + part.duration, localLabels: true } : undefined;
  const compositionLibrary = project.compositionLibrary ?? [];
  const timelines = project.timelines ?? [];
  const activeTimelineName = getDisplayNameFromPath(selectedSceneId ?? "");
  const timelineCompositionIds = new Set(scene.compositions.map((composition) => composition.id));
  const hasActiveTimeline = timelines.some((t) => t.id === selectedSceneId);
  const storedTimelineLayers = getFramePreviewTimelineLayers(project, selectedSceneId);
  const timelineLayers = (hasActiveTimeline || composeMode) ? {
    ...defaultTimelineLayerState,
    ...storedTimelineLayers,
    compositionLayers: storedTimelineLayers?.compositionLayers?.length ? storedTimelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers,
    adjustmentLayers: storedTimelineLayers?.adjustmentLayers?.length ? storedTimelineLayers.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers,
    motionLayers: storedTimelineLayers?.motionLayers?.length ? storedTimelineLayers.motionLayers : defaultTimelineLayerState.motionLayers,
    transitionLayers: storedTimelineLayers?.transitionLayers?.length ? storedTimelineLayers.transitionLayers : defaultTimelineLayerState.transitionLayers,
  } : emptyTimelineLayerState;
  const baseMotionLayers = timelineLayers.motionLayers?.length ? timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const motionLayers = baseMotionLayers;
  const hiddenMotionLayerIds = new Set(motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id));
  const hiddenCompositionLayerIds = new Set((timelineLayers.compositionLayers ?? []).filter((layer) => layer.hidden).map((layer) => layer.id));
  const visibleSceneAdjustmentLayers = useMemo(() => getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayers), [scene.adjustmentLayers, timelineLayers]);
  const visibleSceneTransitionLayers = useMemo(() => getExecutableTransitionLayers(scene.transitionLayers, timelineLayers), [scene.transitionLayers, timelineLayers]);
  const activeCompositionHidden = Boolean(activeTimelinePart && hiddenCompositionLayerIds.has(activeTimelinePart.layerId ?? "comp"));
  const hasPreviewComposition = hasActiveComposition;
  const prerenderCache = usePrerenderCache({
    blockDurationMs: prerenderBlockDurationMs,
    cacheResetToken: prerenderCacheResetToken,
    enabled: prerenderCacheEnabled && mode === "preview" && !composeMode,
    hasActiveComposition: hasPreviewComposition,
    isPlaying,
    manifestPath: activeProjectManifestPath,
    project,
    scene: renderableScene,
    sceneDuration: sceneDurationSeconds,
    sceneTime: currentSceneTime,
    tileHeight: videoExportTileHeight,
  });
  const {
    formatPlaybackTimeLabel,
    jumpToEnd,
    jumpToNextPart,
    jumpToStart,
    pausePlaybackAtCurrentTime,
    pausePlaybackForPresentationScrub,
    pausePlaybackForTimelineScrub,
    resumePlaybackAfterPresentationScrub,
    resumePlaybackAfterTimelineScrub,
    scrubToPlaybackDisplayTime,
    scrubToSceneTime,
    stepSceneTime,
    togglePlayback,
  } = usePlaybackController({
    compositions: scene.compositions,
    playbackRange: composePlaybackRange,
    currentSceneTime,
    currentSceneTimeRef,
    editorStore,
    frameViewportRef,
    hasCachedPreviewFrameAtTime: prerenderCache.hasFrameAtTime,
    isCachedPreviewPaintReadyAtTime: () => cachedPreviewDisplayReadyRef.current,
    isPlaying,
    isPlayingRef,
    numberInputScrubPausedPlaybackRef,
    pendingScrubTimeRef,
    playbackBorderScrubberRef,
    playbackClockRef,
    playbackPlayheadRef,
    playbackTimeLabelRef,
    presentationScrubPausedPlaybackRef,
    sceneDurationSeconds,
    scrubFrameRef,
    setCurrentSceneTime,
    setIsPlaying,
    setPlaybackClock,
    setRenderCurrentSceneTime,
    requestCachedPreviewAtTime: prerenderCache.requestCacheAtTime,
    useCachedPreviewPlayback: prerenderCacheEnabled && mode === "preview" && !composeMode,
    timeline,
    timelineLayers,
    timelineEndPaddingFraction,
    transitionLayers: visibleSceneTransitionLayers,
    timelineScrubPausedPlaybackRef,
    timelineScrubbingRef,
    updateEditorState,
    visibleSceneAdjustmentLayers,
    wasPlayingRef,
  });
  const {
    enterFrameFullscreen,
    enterTheaterMode,
    exitPresentationMode,
    presentationControlsVisible,
    presentationDisplayTime,
    presentationMode,
    presentationModeRef,
    presentationViewport,
    scrubPresentationTime,
    showPresentationControls,
  } = usePresentationController({
    appRootRef,
    centerPreviewScrollRef,
    currentSceneTime,
    currentSceneTimeRef,
    isPlaying,
    pausePlaybackAtCurrentTime,
    sceneDurationSeconds,
    scrubToSceneTime,
    updateMode,
  });
  const previewSelectionObjects = useMemo(() => selectionPayload?.objects.map((selected) => {
    const object = getPartFrameObject(part, selected.id);
    return object ? selectionObjectFromFrameObject(getFrameObjectWithPreviewBounds(object, previewTime, part.duration)) : selected;
  }) ?? [], [part, previewTime, selectionPayload]);
  function setVideoExportTileHeight(value: number) {
    const nextValue = clampVideoExportTileHeight(value);
    setVideoExportTileHeightState(nextValue);
    window.localStorage.setItem("clipper:video-export-tile-height", String(nextValue));
  }
  function setReusePrerenderCacheForExport(reuse: boolean) {
    setReusePrerenderCacheForExportState(reuse);
    window.localStorage.setItem("clipper:reuse-prerender-cache-export", reuse ? "1" : "0");
  }
  function setPrerenderCacheEnabled(enabled: boolean) {
    setPrerenderCacheEnabledState(enabled);
    window.localStorage.setItem("clipper:prerender-cache", enabled ? "1" : "0");
  }
  function setDebugSettingsEnabled(enabled: boolean) {
    setDebugSettingsEnabledState(enabled);
    window.localStorage.setItem("clipper:debug-settings", enabled ? "1" : "0");
    if (!enabled) setPrerenderCacheBlackMissDebug(false);
  }
  function setPrerenderCacheBlackMissDebug(enabled: boolean) {
    setPrerenderCacheBlackMissDebugState(enabled);
    window.localStorage.setItem("clipper:prerender-cache-black-miss-debug", enabled ? "1" : "0");
  }
  function setPrerenderBlockDurationMs(value: number) {
    const nextValue = clampPrerenderBlockDurationMs(value);
    setPrerenderBlockDurationMsState(nextValue);
    window.localStorage.setItem("clipper:prerender-block-duration-ms", String(nextValue));
    setPrerenderCacheResetToken((token) => token + 1);
    void clipperHost.clearPrerenderCache(activeProjectManifestPath);
  }
  async function clearAllPrerenderCaches() {
    try {
      const result = await clipperHost.clearAllPrerenderCaches();
      await clipperHost.clearPrerenderCache(activeProjectManifestPath);
      setPrerenderCacheResetToken((token) => token + 1);
      toast.success(`Cleared prerender caches for ${result.clearedCount} project${result.clearedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear prerender caches.");
    }
  }
  const { exportProject, exportRenderedMedia, stopVideoExport } = useExportCommands({
    projectRef,
    manifestPath: activeProjectManifestPath,
    selectedSceneId,
    projectExportFormat,
    exportIncludeSources,
    reusePrerenderCacheForExport,
    videoExportTileHeight,
    compositionSources,
    saveAllChanges,
    setExportDialogOpen,
    setExportProgress,
    setIsExporting,
    setVideoExportCancelling,
    setVideoExportProgress,
    notifyProjectExported: (path) => toast.success(<PathToastMessage action="Exported to" path={path} />),
    notifyProjectDownloaded: () => toast.success("Export downloaded"),
    notifyRenderedMedia: (path) => toast.success(<PathToastMessage action="Rendered video to" path={path} />),
    notifyError: (message) => toast.error(message),
  });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    function openFindMediaDialog(event: Event) {
      const detail = (event as CustomEvent<FileManagerFindMediaDetail>).detail;
      if (!detail?.compositionId || !detail.fileName) return;
      setFindMediaRequest(detail);
    }

    window.addEventListener(fileManagerFindMediaEvent, openFindMediaDialog);
    const pending = consumePendingFileManagerFindMedia();
    if (pending) setFindMediaRequest(pending);
    return () => window.removeEventListener(fileManagerFindMediaEvent, openFindMediaDialog);
  }, []);

  useEffect(() => {
    timelineModeRef.current = timelineMode;
  }, [timelineMode]);

  useEffect(() => {
    activePartFilePathRef.current = hasActiveComposition ? part.filePath : "";
  }, [hasActiveComposition, part.filePath]);

  useEffect(() => {
    updateEditorState((state) => ({
      ...state,
      mode,
      timelineMode,
      leftPanelTab,
      rightPanelTab,
      selectedSceneId,
      selectedPartId: selectedPartId || undefined,
      selectedMotionMarker,
      defaultNewMarkerDurationSeconds: markerDurationSeconds,
      timelineEndPaddingFraction,
      timelinePrecision,
      preview: {
        ...(state.preview ?? defaultPreviewViewportState),
        scale: framePreviewScale,
        zoomBarOpen: frameZoomBarOpen,
      },
    }));
  }, [framePreviewScale, frameZoomBarOpen, leftPanelTab, markerDurationSeconds, mode, rightPanelTab, selectedMotionMarker, selectedPartId, selectedSceneId, timelineEndPaddingFraction, timelinePrecision, timelineMode]);

  useEffect(() => {
    const editorSession = toPersistedEditorSession(editorTabs, activeEditorTabId);
    if (JSON.stringify(project.editorState?.editorSession) === JSON.stringify(editorSession)) return;
    updateEditorState((state) => ({ ...state, editorSession }), { history: false });
  }, [activeEditorTabId, editorTabs, project.editorState?.editorSession, updateEditorState]);

  useEditorStatePersistence({ activeProjectManifestPath, editorState: project.editorState, editorStateSnapshot });
  useSettingsShortcut({ setSettingsOpen });

  useEffect(() => () => {
    if (framePickFrameRef.current) cancelAnimationFrame(framePickFrameRef.current);
    if (dragBoxFrameRef.current) cancelAnimationFrame(dragBoxFrameRef.current);
    if (objectDragFrameRef.current) cancelAnimationFrame(objectDragFrameRef.current);
    if (zoomScalePreviewFrameRef.current) cancelAnimationFrame(zoomScalePreviewFrameRef.current);
    if (centerPreviewScrollFrameRef.current) cancelAnimationFrame(centerPreviewScrollFrameRef.current);
  }, []);

  useEffect(() => {
    setSourceStatus(initialSourceStatus);
  }, [initialSourceStatus]);

  useEffect(() => {
    const cleanup = window.clipper?.onExportProject?.(() => {
      void exportProjectToClipper();
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    if (selectedPartId && activeTimelinePart && activeTimelinePart.id !== selectedPartId) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
    }
  }, [activeTimelinePart, selectedMotionMarker, selectedPartId]);

  useEffect(() => {
    if (timelineMode === "compose") {
      clearMarkerSelection();
      return;
    }

    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearObjectDrag();
    clearDragBox();
  }, [timelineMode]);

  useEffect(() => {
    let selectedObjectMissing = false;

    setSelectionPayload((current) => {
      if (!current?.objects.length) return current;
      const nextObjects = current.objects.flatMap((selected) => {
        const object = part.objects.find((item) => item.id === selected.id) ?? part.background.elements.find((item) => item.id === selected.id);
        return object ? [selectionObjectFromFrameObject(object)] : [];
      });

      if (nextObjects.length !== current.objects.length) {
        selectedObjectMissing = true;
        return null;
      }

      const unchanged = nextObjects.every((object, index) => {
        const previous = current.objects[index];
        return object.id === previous.id
          && object.name === previous.name
          && object.selector === previous.selector
          && object.type === previous.type
          && object.bounds.x === previous.bounds.x
          && object.bounds.y === previous.bounds.y
          && object.bounds.width === previous.bounds.width
          && object.bounds.height === previous.bounds.height;
      });
      if (unchanged) return current;

      const selectionBox = getBoundsUnion(nextObjects.map((object) => object.bounds));
      return { selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextObjects };
    });

    if (selectedObjectMissing) setSelectedObjectId(null);
  }, [part.background.elements, part.objects]);

  useEffect(() => {
    function clearFrameSelectionOnOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (isEditorTarget(target) || isInspectorTarget(target) || isSelectPopoverTarget(target) || isComposeLayersTarget(target) || isTimelineTarget(target)) return;
      if (frameViewportRef.current?.contains(event.target as Node)) return;
      setEditingTextObjectId(null);
      setSelectedObjectId(null);
      setSelectionPayload(null);
      clearObjectDrag();
      clearDragBox();
    }

    window.addEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
  }, []);

  useEffect(() => {
    if (!marqueeDragging) return;

    function clearMarqueeAfterPointerRelease() {
      requestAnimationFrame(() => clearDragBox());
    }

    window.addEventListener("pointerup", clearMarqueeAfterPointerRelease);
    window.addEventListener("pointercancel", clearMarqueeAfterPointerRelease);
    return () => {
      window.removeEventListener("pointerup", clearMarqueeAfterPointerRelease);
      window.removeEventListener("pointercancel", clearMarqueeAfterPointerRelease);
    };
  }, [marqueeDragging]);

  useEffect(() => {
    function syncObjectResizeAspectPreview(event: KeyboardEvent) {
      if (event.key !== "Shift" || !objectResizeRef.current) return;
      frameInteractionControllerRef.current?.syncObjectResizeAspectPreview(event.type === "keydown");
    }

    window.addEventListener("keydown", syncObjectResizeAspectPreview);
    window.addEventListener("keyup", syncObjectResizeAspectPreview);
    return () => {
      window.removeEventListener("keydown", syncObjectResizeAspectPreview);
      window.removeEventListener("keyup", syncObjectResizeAspectPreview);
    };
  }, []);

  const { updateCompositionForTimelinePart, updateCurrentPart, updateSceneAdjustmentLayers, updateSceneMotionMarkers, updateSceneParts, updateSceneTransitionLayers, updateTimelineLayers, updateTimelineViewportState } = useTimelineProjectActions({ scene, timelineMode, updateEditorState, updateProject });

  const {
    clearMarkerSelection,
    clearNodeSelection,
    openComposePart,
    selectAdjustmentLayer,
    selectAdjustmentLayers,
    selectPart,
    selectTimelineNodes,
    selectMotionMarker,
    selectMotionMarkers,
  } = useTimelineSelectionCommands({
    currentSceneTimeRef,
    rightPanelTab,
    timeline,
    cancelFramePickPreview,
    clearStoredMarkerSelection,
    clearStoredNodeSelection,
    pausePlaybackAtCurrentTime,
    scrubToSceneTime,
    setFocusPickZoomMarker,
    setPositionPickTranslationMarker,
    setRightPanelTab,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedObjectId,
    setSelectedPartId,
    setSelectedParts,
    setSelectedMotionMarker,
    setSelectedMotionMarkers,
    setSelectedTransitionLayerId,
    setSelectedTransitionLayers,
    setSelectionPayload,
    setTrackerPickTranslationMarker,
    updateTimelineMode,
  });

  const {
    addAdjustmentTimelineLayer,
    addCompositionTimelineLayer,
    addMotionLayer,
    assignAvailableMotionLayerKind,
    motionLayerHasMarkers,
    removeAdjustmentTimelineLayer,
    removeCompositionTimelineLayer,
    removeMotionLayer,
  } = useTimelineLayerCommands({
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
  });

  const {
    addAdjustmentLayer,
    addAdjustmentLayerAt,
    deleteAdjustmentLayer,
    moveAdjustmentLayer,
    snapAdjustmentMiddle,
    startAdjustmentPointPick,
    updateAdjustmentLayer,
  } = useAdjustmentLayerCommands({
    currentSceneTimeRef,
    pointPickAdjustment,
    scene,
    sceneDurationSeconds,
    selectedAdjustmentLayerId,
    timelineLayers,
    pausePlaybackAtCurrentTime,
    selectAdjustmentLayer,
    setFocusPickZoomMarker,
    setFramePickPreviewPoint,
    setPointPickAdjustment,
    setPositionPickTranslationMarker,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedPartId,
    setTrackerPickTranslationMarker,
    timelinePrecision,
    updateSceneAdjustmentLayers,
  });

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

  function moveTransitionLayer(layerId: string, start: number, targetLayerId?: string) {
    updateProject((current) => ({
      ...current,
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, transitionLayers: (timeline.transitionLayers ?? []).map((layer) => layer.id === layerId ? { ...layer, start: roundToPrecision(start, timelinePrecision), layerId: targetLayerId ?? layer.layerId } : layer) } : timeline)),
    }), { history: true });
  }

  function updateTransitionLayer(layerId: string, updater: (layer: import("./core/types").TransitionLayer) => import("./core/types").TransitionLayer) {
    updateProject((current) => ({
      ...current,
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, transitionLayers: (timeline.transitionLayers ?? []).map((layer) => layer.id === layerId ? normalizeSymmetricTransitionLayer(updater(layer)) : layer) } : timeline)),
    }), { history: true });
  }

  function addTransitionLayerAt(effectId: string, sceneTime: number, layerId?: string) {
    const effect = getTransitionEffectPackage(effectId);
    if (!effect) return;
    const newLayerId = `transition-${Date.now().toString(36)}`;
    const duration = effect.defaultDuration;
    const midPoint = duration / 2;
    const start = roundToPrecision(Math.max(sceneTime, 0), timelinePrecision);
    const newLayer = effect.createDefaultLayer({ id: newLayerId, layerId, start, duration, midPoint });
    updateProject((current) => ({
      ...current,
      timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, transitionLayers: [...(timeline.transitionLayers ?? []), newLayer] } : timeline)),
    }), { history: true });
    selectTransitionLayer(newLayerId);
  }

  const {
    reorderComposeObjects,
    selectComposeLayerObjects,
    updateObjectById,
    updatePartBackground,
    updatePartFrame,
    updateSelectedObject,
    updateSelectedPartDuration,
    updateTextObjectContent,
  } = useFrameObjectCommands({
    part,
    selectedObjectId,
    selectedPart,
    clearMarkerSelection,
    setEditingTextObjectId,
    setRightPanelTab,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedObjectId,
    setSelectedPartId,
    setSelectedParts,
    setSelectionPayload,
    updateCompositionForTimelinePart,
    updateSceneParts,
  });

  function updateComposeObjectMotion(objectId: string, updater: (motion: FrameObject["motion"] | undefined, object: FrameObject) => FrameObject["motion"] | undefined) {
    updateObjectById(objectId, (object) => ({ ...object, motion: updater(object.motion, object) }));
  }

  function updateComposeBackgroundMotion(updater: (motion: Part["background"]["motion"] | undefined, background: Part["background"]) => Part["background"]["motion"] | undefined) {
    updatePartBackground((background) => ({ ...background, motion: updater(background.motion, background) }));
  }

  function updateComposeObjectAnimation(objectId: string, updater: (animations: LayerAnimation[]) => LayerAnimation[]) {
    updateObjectById(objectId, (object) => ({ ...object, animations: updater(object.animations ?? []) }));
  }

  function updateComposeBackgroundAnimation(updater: (animations: LayerAnimation[]) => LayerAnimation[]) {
    updatePartBackground((background) => ({ ...background, animations: updater(background.animations ?? []) }));
  }

  function toggleComposeLayerHidden(layerId: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({ ...background, hidden: !background.hidden || undefined }));
      return;
    }
    const element = part.background.elements.find((el) => el.id === layerId);
    if (element) {
      updatePartBackground((background) => ({
        ...background,
        elements: background.elements.map((el) => el.id === layerId ? { ...el, hidden: !el.hidden || undefined } : el),
      }));
      return;
    }
    updateObjectById(layerId, (object) => ({ ...object, hidden: !object.hidden || undefined }));
  }

  function toggleComposeLayerLocked(layerId: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({ ...background, locked: !background.locked || undefined }));
      return;
    }
    const element = part.background.elements.find((el) => el.id === layerId);
    if (element) {
      updatePartBackground((background) => ({
        ...background,
        elements: background.elements.map((el) => el.id === layerId ? { ...el, locked: !el.locked || undefined } : el),
      }));
      return;
    }
    updateObjectById(layerId, (object) => ({ ...object, locked: !object.locked || undefined }));
  }

  function renameComposeAnimationLayer(layerId: string, name: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({ ...background, name }));
      return;
    }
    updateObjectById(layerId, (object) => ({ ...object, name }));
  }

  function updateComposeTimelineViewportState(updater: (state: TimelineViewportState) => TimelineViewportState) {
    updateEditorState((state) => ({ ...state, composeTimeline: updater(state.composeTimeline ?? defaultTimelineViewportState) }));
  }

  function startZoomFocusPick(partId: string, markerId: string) {
    if (focusPickZoomMarker?.partId === partId && focusPickZoomMarker.markerId === markerId) {
      setFocusPickZoomMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
    setFocusPickZoomMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function startTranslationPositionPick(partId: string, markerId: string) {
    if (positionPickTranslationMarker?.partId === partId && positionPickTranslationMarker.markerId === markerId) {
      setPositionPickTranslationMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
    setPositionPickTranslationMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function startTranslationTrackerPick(partId: string, markerId: string) {
    if (trackerPickTranslationMarker?.partId === partId && trackerPickTranslationMarker.markerId === markerId) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setFramePickPreviewPoint(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
    setTrackerPickTranslationMarker({ partId, markerId });
  }

  function cancelActiveSelector() {
    const hasActivePicker = Boolean(focusPickZoomMarker || positionPickTranslationMarker || trackerPickTranslationMarker || pointPickAdjustment);
    const hasSelection = Boolean(selectedPartId || selectedParts.length || selectedObjectId || selectionPayload || selectedMotionMarker || selectedMotionMarkers.length || selectedAdjustmentLayerId || selectedAdjustmentLayers.length || selectedTransitionLayerId || selectedTransitionLayers.length);
    if (!hasActivePicker && !hasSelection) return false;

    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setPointPickAdjustment(null);
    cancelFramePickPreview();
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    return true;
  }

  function commitTranslationTrackerPick(objectId: string) {
    const pick = trackerPickTranslationMarker;
    if (!pick) return;

    if (!objectId) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    updateMotionMarker(pick.partId, pick.markerId, (marker) => ({ ...marker, followId: objectId || undefined }));
    setTrackerPickTranslationMarker(null);
  }

  const {
    addCompositionFromLibrary,
    deleteCompositionFromTimeline,
    deleteCompositionsFromTimeline,
    moveCompositionMarker,
    moveCompositionMarkers,
    reorderPart,
    snapCompositionMiddle,
    updateCompositionMarker,
  } = useCompositionTimelineCommands({
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
  });

  const { addMotionEffect, addMotionMarker: addZoomMarker, previewMotionScale: previewZoomScale, clearMotionScalePreview: clearZoomScalePreview, deleteMotionMarker, moveMotionMarker, moveMotionMarkers, resizeMotionMarkers, snapMotionMiddle, updateMotionMiddleTransition, updateMotionMiddleEase, updateSelectedMotionSnap, updateMotionMarker, updateMotionMarkers, updateMotionMarkerFocusGroup } = useMotionMarkerCommands({
    activeTimelinePart,
    cameraRef,
    hiddenMotionLayerIds,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    markerDurationSeconds,
    motionLayers,
    part,
    pendingScalePreviewRef: pendingZoomScalePreviewRef,
    previewTime,
    scene,
    sceneDurationSeconds,
    selectedObjectBounds: selectedObject?.bounds ?? null,
    selectedMotionMarkers,
    timelineMode,
    timelinePrecision,
    scalePreviewFrameRef: zoomScalePreviewFrameRef,
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
  });

  const frameInteractionController = useFrameInteractionController({
    cameraPreviewTransform,
    cameraRef,
    canSelectFrameObjects,
    dragBox,
    dragBoxFrameRef,
    dragSelectionBoxRef,
    dragStart,
    dragStartRef,
    focusPickZoomMarker,
    framePickFrameRef,
    framePickPreviewPoint,
    framePreviewScale,
    frameViewportRef,
    liveDragSelectionIdsRef,
    marqueeDraggingRef,
    marqueeLastPointRef,
    marqueeSpacePanningRef,
    mode,
    objectDragDeltaRef,
    objectDragFrameRef,
    objectDragRef,
    objectResizeDeltaRef,
    objectResizeFrameRef,
    objectResizePreserveAspectRef,
    objectResizeRef,
    part,
    pendingDragBoxRef,
    pendingFramePickPointRef,
    pointPickAdjustment,
    positionPickTranslationMarker,
    previewTime,
    selectionPayload,
    trackerPickTranslationMarker,
    zoomScale,
    clearMarkerSelection,
    clearNodeSelection,
    setDragBox,
    setDragStart,
    setEditingTextObjectId,
    setFramePickPreviewPoint,
    setMarqueeDragging,
    setRightPanelTab,
    setSelectedObjectId,
    setSelectionPayload,
    updateAdjustmentLayer,
    updateCompositionForTimelinePart,
    updateTranslationMarker: updateMotionMarker,
    updateZoomMarkerFocusGroup: updateMotionMarkerFocusGroup,
  });
  frameInteractionControllerRef.current = frameInteractionController;
  const {
    onFramePointerCancel,
    onFramePointerDown,
    onFramePointerDownCapture,
    onFramePointerMove,
    onFramePointerUp,
    startObjectDrag,
    startObjectResize,
    startTextObjectEdit,
  } = frameInteractionController;

  const {
    copySelectedTimelineNodes,
    cutSelectedTimelineNodes,
    deleteSelectedTimelineNodes,
    openTimelineBlankContextMenu,
    openTimelineNodeContextMenu,
    pasteTimelineNodesSilently,
  } = useTimelineClipboardCommands({
    currentSceneTimeRef,
    scene,
    sceneDurationSeconds,
    selectedAdjustmentLayer,
    selectedAdjustmentLayerId,
    selectedAdjustmentLayers,
    selectedPartId,
    selectedParts,
    selectedMotionMarker,
    selectedMotionMarkers,
    selectedTransitionLayerId,
    selectedTransitionLayers,
    timeline,
    deleteCompositionsFromTimeline,
    openCompositionInEditor,
    selectAdjustmentLayer,
    selectPart,
    selectMotionMarker,
    selectMotionMarkers,
    selectTransitionLayer,
    setAppContextMenu,
    setFocusPickZoomMarker,
    setPositionPickTranslationMarker,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedMotionMarker,
    setSelectedMotionMarkers,
    setSelectedTransitionLayerId,
    setSelectedTransitionLayers,
    timelinePrecision,
    updateSceneAdjustmentLayers,
    updateSceneMotionMarkers,
    updateSceneParts,
    updateSceneTransitionLayers,
  });

  useGlobalEditorShortcuts({
    cancelActiveSelector,
    activeEditorTabId,
    closeEditorTab,
    copySelectedTimelineNodes,
    cutSelectedTimelineNodes,
    deleteSelectedTimelineNodes,
    enterFrameFullscreen,
    enterTheaterMode,
    exitPresentationMode,
    jumpToEnd,
    jumpToNextPart,
    jumpToStart,
    marqueeDraggingRef,
    marqueeSpacePanningRef,
    pasteTimelineNodesSilently,
    presentationModeRef,
    pausePlaybackAtCurrentTime,
    redoProjectChange,
    restoreClosedEditorTab,
    saveAllChangesRef,
    selectedPartId,
    setFastSelectEnabled,
    setScrubSnapEnabled,
    showPresentationControls,
    stepSceneTime,
    togglePlayback,
    undoProjectChange,
    updateMode,
    updateTimelineMode,
  });

  function isMotionLayerVacant(layerId: string) {
    return !(scene.motionMarkers ?? []).some((marker) => marker.layerId === layerId);
  }

  function updateEffectsPanelState(effectsPanelState: NonNullable<EditorState["effectsPanelState"]>) {
    updateEditorState((state) => ({ ...state, effectsPanelState }));
  }

  const { startEditorPanelResize } = useEditorPanelResize({
    appRootRef,
    projectRef,
    updateEditorState,
    scheduleImplicitFileOperationSave,
  });

  const fileManagerActions = useFileManagerProjectActions({
    addCompositionFromLibrary,
    assets,
    clearNodeSelection,
    compositionLibrary,
    compositionSourcesRef,
    defaultEditorState,
    part,
    project,
    projectRef,
    selectedSceneId,
    setCompositionSources,
    setCurrentSceneTime,
    setSelectedPartId,
    setSelectedSceneId,
    updateTimelineMode,
    updateEditorState,
    updateProject,
    watchedProjectDirectory,
  });

  const fileManagerProps = useFileManagerController({
    assets,
    compositions: compositionLibrary,
    compositionFolders: project.compositionFolders ?? [],
    compositionRootPath: watchedProjectDirectory,
    fileManagerState: project.editorState?.fileManagerState,
    findMediaRequest,
    implicitFileOperation,
    timelines,
    timelineCompositionIds,
    onFindMediaRequestChange: setFindMediaRequest,
    actions: { ...fileManagerActions, reloadProject, openCompositionFile: openCompositionInEditor },
  });
  const editorLayout = project.editorState?.layout ?? defaultEditorLayoutState;
  const composeLayout = project.editorState?.composeLayout ?? defaultComposeLayoutState;
  const appShellStyle = {
    "--clipper-left-panel-width": `${editorLayout.leftPanelWidth}px`,
    "--clipper-compose-left-panel-width": `${composeLayout.leftPanelWidth}px`,
    "--clipper-right-panel-width": `${editorLayout.rightPanelWidth}px`,
    "--clipper-timeline-height": `${editorLayout.timelineHeight}px`,
    "--clipper-presentation-width": `${presentationViewport.width}px`,
    "--clipper-presentation-height": `${presentationViewport.height}px`,
    "--clipper-presentation-scale": presentationViewport.scale,
    gridTemplateRows: `48px minmax(0, 1fr) var(--clipper-timeline-height)`,
  } as CSSProperties;
  const editorShellStyle = { gridTemplateColumns: `${composeMode ? "var(--clipper-compose-left-panel-width)" : "var(--clipper-left-panel-width)"} minmax(640px, 1fr) var(--clipper-right-panel-width)` } as CSSProperties;
  const presentationTime = presentationMode ? presentationDisplayTime : currentSceneTime;
  const presentationProgress = sceneDurationSeconds > 0 ? `${clamp(presentationTime / sceneDurationSeconds, 0, 1) * 100}%` : "0%";
  const presentationScrubberStyle = { "--clipper-presentation-progress": presentationProgress } as CSSProperties;
  const playbackDisplayDuration = composePlaybackRange ? Math.max(composePlaybackRange.end - composePlaybackRange.start, 0) : getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
  const playbackDisplayTime = composePlaybackRange ? clamp(currentSceneTime - composePlaybackRange.start, 0, playbackDisplayDuration) : clamp(getTimeSensitiveDisplayTime(currentSceneTime, visibleSceneAdjustmentLayers), 0, playbackDisplayDuration);
  const playbackProgress = playbackDisplayDuration > 0 ? `${clamp(playbackDisplayTime / playbackDisplayDuration, 0, 1) * 100}%` : "0%";
  const playbackScrubberStyle = { "--clipper-playback-progress": playbackProgress } as CSSProperties;
  const blankFrameViewportStyle = { width: FRAME_WIDTH * framePreviewScale, height: FRAME_HEIGHT * framePreviewScale } as CSSProperties;
  const adjustmentPickLayer = pointPickAdjustment ? scene.adjustmentLayers?.find((layer) => layer.id === pointPickAdjustment.layerId) : null;
  const adjustmentFramePickPoint = pointPickAdjustment && adjustmentPickLayer ? getAdjustmentPointControlFramePoint(adjustmentPickLayer, pointPickAdjustment.control) : null;
  const activeFramePickPoint = (pointPickAdjustment ? framePickPreviewPoint ?? adjustmentFramePickPoint : framePickPoint) ?? null;
  const selectedComposeObjectIds = useMemo(() => selectionPayload?.objects.map((object) => object.id) ?? (selectedObjectId ? [selectedObjectId] : []), [selectedObjectId, selectionPayload]);
  const projectDirectory = activeProjectManifestPath.endsWith(".json") ? getDirectoryPath(activeProjectManifestPath) : undefined;
  const activeEditorTab = editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
  const activeEditorComposition = activeEditorTab?.isComposition ? compositionLibrary.find((item) => item.id === activeEditorTab.id || item.filePath === activeEditorTab.filePath || item.filePath.endsWith(`/${activeEditorTab.filePath}`)) ?? scene.compositions.find((item) => item.id === activeEditorTab.id || item.filePath === activeEditorTab.filePath || item.filePath.endsWith(`/${activeEditorTab.filePath}`)) ?? null : null;
  const activeEditorDocument: EditorPaneDocument | null = activeEditorTab ? {
    id: activeEditorTab.id,
    filePath: activeEditorTab.filePath,
    source: activeEditorTab.isComposition && activeEditorComposition ? compositionSources[activeEditorComposition.filePath] ?? activeEditorComposition.source : activeEditorTab.source,
    language: activeEditorTab.language,
    unsupportedReason: activeEditorTab.unsupportedReason,
    showCompositionApiStatus: Boolean(activeEditorTab.isComposition),
  } : null;
  const editorPaneTabs: EditorPaneTab[] = editorTabs.map((tab) => ({ id: tab.id, filePath: tab.filePath, unsupportedReason: tab.unsupportedReason, isPinned: tab.isPinned }));
  const activeEditorViewportState = activeEditorDocument ? project.editorState?.editor?.[activeEditorDocument.id] ?? project.editorState?.code?.[activeEditorDocument.id] : undefined;

  useEffect(() => {
    if (!activeEditorTab || activeEditorTab.isComposition || activeEditorTab.source !== undefined || activeEditorTab.unsupportedReason) return;
    const { id, filePath } = activeEditorTab;
    if (isUnsupportedEditorFile(filePath)) {
      updateEditorTab(id, { language: "plaintext", unsupportedReason: "Clipper can only edit text-based project files in the editor. This file cannot be rendered or edited inline." });
      return;
    }

    let cancelled = false;
    void clipperHost.readTextFile(filePath).then((source) => {
      if (!cancelled) updateEditorTab(id, { source, language: getEditorLanguage(filePath) });
    }).catch((error) => {
      if (!cancelled) updateEditorTab(id, { language: "plaintext", unsupportedReason: error instanceof Error ? error.message : "Unable to open this file in the editor." });
    });
    return () => {
      cancelled = true;
    };
  }, [activeEditorTab, updateEditorTab]);

  async function exportProjectToClipper() {
    try {
      const defaultFileName = `${projectRef.current.name || "Untitled"}.clipper`;
      const path = await clipperHost.exportProjectDialog(defaultFileName);
      if (!path) return;
      await projectPersistenceService.saveProject({ manifestPath: path, project: projectRef.current });
      toast.success(<PathToastMessage action="Exported to" path={path} />);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export project.");
    }
  }

  async function handleCloseProject() {
    if (hasUnsavedChanges) await saveAllChanges();
    onCloseProject();
  }

  const isDirectoryMode = activeProjectManifestPath.endsWith(".json");

  async function handleReloadProject() {
    await reloadProject();
  }

  function handleSelectComposition(_compositionId: string) {
    // Compositions are only added to the timeline via drag-and-drop.
    // Clicking a composition in the file manager does not insert it.
  }

  function projectRelativeFilePath(filePath: string) {
    const editableRoot = filePath.startsWith(`${watchedProjectDirectory}/file-manager/`) ? `${watchedProjectDirectory}/file-manager` : watchedProjectDirectory;
    const relativePath = filePath.startsWith(`${editableRoot}/`) ? filePath.slice(editableRoot.length + 1) : filePath;
    return relativePath.startsWith("file-manager/") ? relativePath.slice("file-manager/".length) : relativePath;
  }

  function openCompositionInEditor(compositionId: string, options?: { temporary?: boolean }) {
    const composition = compositionLibrary.find((item) => item.id === compositionId || item.filePath === compositionId) ?? scene.compositions.find((item) => item.id === compositionId || item.filePath === compositionId);
    if (!composition) return;
    const tab = { id: composition.id, filePath: composition.filePath, source: compositionSources[composition.filePath] ?? composition.source, language: "typescript", isComposition: true };
    if (options?.temporary) openTemporaryEditorTab(tab);
    else openEditorTab(tab);
    updateMode("editor");
  }

  async function openProjectFileInEditor(filePath: string, options?: { isComposition?: boolean; temporary?: boolean }) {
    updateMode("editor");
    if (options?.isComposition) {
      const relativePath = projectRelativeFilePath(filePath);
      const composition = compositionLibrary.find((item) => item.filePath === relativePath || item.filePath.endsWith(`/${relativePath}`));
      if (composition) {
        const tab = { id: composition.id, filePath: composition.filePath, source: compositionSources[composition.filePath] ?? composition.source, language: "typescript", isComposition: true };
        if (options.temporary) openTemporaryEditorTab(tab);
        else openEditorTab(tab);
        return;
      }
    }

    const openTab = options?.temporary ? openTemporaryEditorTab : openEditorTab;

    if (isUnsupportedEditorFile(filePath)) {
      openTab({ id: filePath, filePath, language: "plaintext", unsupportedReason: "Clipper can only edit text-based project files in the editor. This file cannot be rendered or edited inline." });
      return;
    }

    try {
      const source = await clipperHost.readTextFile(filePath);
      openTab({ id: filePath, filePath, source, language: getEditorLanguage(filePath), isComposition: options?.isComposition });
    } catch (error) {
      openTab({ id: filePath, filePath, language: "plaintext", unsupportedReason: error instanceof Error ? error.message : "Unable to open this file in the editor." });
    }
  }

  function handleSelectTimeline(timelineId: string) {
    updateTimelineMode("composition");
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  return (
    <>
    <main ref={appRootRef} className="relative grid h-screen bg-[#12141a] text-[#f7f7f8]" data-clipper-frame-presentation={presentationMode ?? undefined} style={appShellStyle} onPointerMove={presentationMode ? showPresentationControls : undefined}>
      <AppHeader
        hasUnsavedChanges={hasUnsavedChanges}
        projectName={project.name}
        projectNameDraft={projectNameDraft}
        renamingProject={renamingProject}
        sceneName={getDisplayNameFromPath(selectedSceneId ?? "")}
        onCancelProjectRename={cancelProjectRename}
        onCloseProject={handleCloseProject}
        onCommitProjectRename={commitProjectRename}
        onExportOpen={() => setExportDialogOpen(true)}
        onOpenProject={() => void openProjectManifest()}
        onProjectNameDraftChange={setProjectNameDraft}
        onProjectTitleContextMenu={openProjectTitleMenu}
        onSaveAll={() => void saveAllChanges()}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      <EditorWorkspace composeMode={composeMode} style={editorShellStyle} onPanelResizePointerDown={startEditorPanelResize}>
        <LeftSidebar
          composeMode={composeMode}
          effectsPanelState={project.editorState?.effectsPanelState}
          fileManagerProps={fileManagerProps}
          hasActiveComposition={hasActiveComposition}
          leftPanelTab={leftPanelTab}
          osFileManagerProps={isDirectoryMode ? {
            projectDirectory: watchedProjectDirectory,
            compositionLibrary,
            selectedTimelineId: selectedSceneId,
            fileSystemRevision,
            onReloadProject: handleReloadProject,
            onOpenFile: openProjectFileInEditor,
            onSelectComposition: handleSelectComposition,
            onSelectTimeline: handleSelectTimeline,
            executeFileManagerCommand,
          } : undefined}
          part={part}
          selectedObjectIds={selectionPayload?.objects.map((object) => object.id) ?? (selectedObjectId ? [selectedObjectId] : [])}
          timelineMode={timelineMode}
          onEffectsPanelStateChange={updateEffectsPanelState}
          onLeftPanelTabChange={setLeftPanelTab}
          onReorderComposeObjects={reorderComposeObjects}
          onSelectComposeLayerObjects={selectComposeLayerObjects}
          onToggleComposeLayerHidden={toggleComposeLayerHidden}
          onToggleComposeLayerLocked={toggleComposeLayerLocked}
        />

        <CenterPreviewPane
          blankFrameViewportStyle={blankFrameViewportStyle}
          currentSceneTimeRef={currentSceneTimeRef}
          editorPaneProps={activeEditorDocument ? { document: activeEditorDocument, tabs: editorPaneTabs, viewportState: activeEditorViewportState, projectDirectory, onCloseTab: closeEditorTab, onRestoreClosedTab: restoreClosedEditorTab, onSaveAll: saveAllChanges, onSelectTab: selectEditorTab, onPinTab: pinEditorTab, onSourceChange: (source) => {
            pinEditorTab(activeEditorDocument.id);
            return activeEditorComposition ? updateCompositionFromSource(activeEditorComposition, source, { history: false, syncSource: false }).then(() => updateEditorTab(activeEditorDocument.id, { source })) : clipperHost.writeTextFile(activeEditorDocument.filePath, source).then(() => updateEditorTab(activeEditorDocument.id, { source }));
          }, onViewportStateChange: updateEditorViewportState } : null}
          framePreviewProps={hasPreviewComposition ? { cameraRef, dragBox, dragSelectionBoxRef, framePickPoint: activeFramePickPoint, focusPicking: isPickingZoomFocus || isPickingTranslationPosition || Boolean(pointPickAdjustment), trackerPicking: Boolean(trackerPickTranslationMarker), canSelectObjects: canSelectFrameObjects && !isPlaying, cameraTransform: cameraPreviewTransform, frameViewportRef, frameScale: framePreviewScale, isPlaying, part, partStart: activeTimelinePart?.start ?? 0, previewParts: composeMode ? [] : previewParts, transitionPreviewParts: composeMode ? null : transitionPreviewParts, adjustmentLayers: composeMode ? [] : visibleSceneAdjustmentLayers, transitionLayers: composeMode ? [] : visibleSceneTransitionLayers, playbackClock, previewTime, sceneTime: currentSceneTime, timelineMode, motionLayers: composeMode ? [] : motionLayers, hiddenMotionLayerIds: composeMode ? new Set<string>() : hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition || Boolean(pointPickAdjustment), pickingZoomFocus: isPickingZoomFocus || Boolean(pointPickAdjustment), compHidden: composeMode ? false : activeCompositionHidden, selectedObjects: previewSelectionObjects, marqueeDragging, editingTextObjectId: isPlaying ? null : editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown: startObjectDrag, onObjectResizePointerDown: startObjectResize, onTextEditCommit: updateTextObjectContent, onTextObjectDoubleClick: startTextObjectEdit, onTrackerTargetPick: commitTranslationTrackerPick } : null}
          hasActiveComposition={hasPreviewComposition}
          getPrerenderCacheBlockAtTime={prerenderCache.getBlockAtTime}
          isPlaying={isPlaying}
          mode={mode}
          onCachedPreviewDisplayReadyChange={(ready) => { cachedPreviewDisplayReadyRef.current = ready; }}
          prerenderCacheBlackMissDebug={prerenderCacheBlackMissDebug}
          prerenderCacheEnabled={prerenderCacheEnabled && !composeMode}
          prerenderCacheBlock={prerenderCache.block}
          previewKey={part.id}
          stageRef={centerPreviewScrollRef}
          onModeChange={updateMode}
          onScroll={saveCenterPreviewScroll}
          playbackBarProps={{ currentSceneTime, fastSelectEnabled, framePreviewScale, frameZoomBarOpen, frameZoomControlRef, isPlaying, playbackBorderScrubberRef, playbackDisplayDuration, playbackDisplayTime, playbackScrubberStyle, playbackTimeLabelRef, scrubSnapEnabled, formatPlaybackTimeLabel, jumpToEnd, jumpToNextPart, jumpToStart, pausePlaybackAtCurrentTime, pausePlaybackForTimelineScrub, resumePlaybackAfterTimelineScrub, scrubToPlaybackDisplayTime, setFastSelectEnabled, setScrubSnapEnabled, stepSceneTime, toggleFrameZoomBar, togglePlayback, updateFramePreviewScale }}
        />

        {presentationMode ? <PresentationControls controlsVisible={presentationControlsVisible} isPlaying={isPlaying} sceneDurationSeconds={sceneDurationSeconds} scrubberStyle={presentationScrubberStyle} time={presentationTime} jumpToEnd={jumpToEnd} jumpToStart={jumpToStart} pausePlaybackForPresentationScrub={pausePlaybackForPresentationScrub} resumePlaybackAfterPresentationScrub={resumePlaybackAfterPresentationScrub} scrubPresentationTime={scrubPresentationTime} stepSceneTime={stepSceneTime} togglePlayback={togglePlayback} /> : null}

        <RightInspectorPanel activeTab={rightPanelTab} validationErrors={validationErrors} onTabChange={setRightPanelTab}>
          <ConnectedInspectorContent
            rightPanelTab={rightPanelTab}
            part={part}
            sourceStatus={sourceStatus}
            agentContext={agentContext}
            selectedMotion={selectedMotion}
            selectedMotionPart={selectedMotionPart}
            selectedMotionMarkerCount={selectedMotionMarkers.length}
            selectedMotionSnapInActive={selectedMotionSnapInActive}
            selectedMotionSnapOutActive={selectedMotionSnapOutActive}
            selectedMotionPartMiddleSnapActive={selectedMotionPartMiddleSnapActive}
            selectedMotionPartMiddleEase={selectedMotionPartMiddleEase}
            selectedMotionPartMiddleTransitionMode={selectedMotionPartMiddleTransitionMode}
            focusPickMotionMarker={focusPickZoomMarker}
            canSnapMotionMiddle={Boolean(inspectorMotionMiddleSnap)}
            canSnapAdjustmentMiddle={Boolean(inspectorAdjustmentMiddleSnap)}
            canSnapCompositionMiddle={Boolean(inspectorCompositionMiddleSnap)}
            positionPickMotionMarker={positionPickTranslationMarker}
            trackerPickMotionMarker={trackerPickTranslationMarker}
            selectedObject={selectedObject}
            selectedAdjustmentLayer={selectedAdjustmentLayer}
            selectedTransitionLayer={scene.transitionLayers?.find((l) => l.id === selectedTransitionLayerId) ?? null}
            sceneDurationSeconds={sceneDurationSeconds}
            pointPickAdjustment={pointPickAdjustment}
            selectedPart={selectedPart}
            onUpdateMotionMarker={updateMotionMarker}
            onPreviewMotionScale={previewZoomScale}
            onClearMotionScalePreview={clearZoomScalePreview}
            onUpdateMotionMarkerFocusGroup={updateMotionMarkerFocusGroup}
            onUpdateSelectedMotionSnap={updateSelectedMotionSnap}
            onUpdateMotionMiddleTransition={updateMotionMiddleTransition}
            onUpdateMotionMiddleEase={updateMotionMiddleEase}
            onDeleteMotionMarker={deleteMotionMarker}
            onStartMotionFocusPick={startZoomFocusPick}
            onStartMotionPositionPick={startTranslationPositionPick}
            onStartMotionTrackerPick={startTranslationTrackerPick}
            onSnapMotionMiddle={snapMotionMiddle}
            onSnapAdjustmentMiddle={snapAdjustmentMiddle}
            onSnapCompositionMiddle={snapCompositionMiddle}
            onUpdateSelectedObject={updateSelectedObject}
            onUpdateAdjustmentLayer={updateAdjustmentLayer}
            onDeleteAdjustmentLayer={deleteAdjustmentLayer}
            onUpdateTransitionLayer={updateTransitionLayer}
            onDeleteTransitionLayer={(layerId) => {
              updateProject((current) => ({
                ...current,
                timelines: (current.timelines ?? []).map((timeline) => (timeline.id === scene.id ? { ...timeline, transitionLayers: (timeline.transitionLayers ?? []).filter((l) => l.id !== layerId) } : timeline)),
              }), { history: true });
              setSelectedTransitionLayerId(null);
              setSelectedTransitionLayers([]);
            }}
            onStartAdjustmentPointPick={startAdjustmentPointPick}
            onUpdateSelectedPartDuration={updateSelectedPartDuration}
            onUpdatePartFrame={updatePartFrame}
            onUpdatePartBackground={updatePartBackground}
          />
        </RightInspectorPanel>

      </EditorWorkspace>

      <TimelineResizeHandle onPointerDown={startEditorPanelResize} />

      <TimelineProvider panelProps={{
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
        prerenderCacheCoverage: prerenderCacheEnabled && !composeMode ? prerenderCache.coverage : null,
        sceneDuration: sceneDurationSeconds,
        selectedPartId,
        selectedParts,
        selectedMotionMarkerPartId: selectedMotionMarker?.partId ?? null,
        selectedMotionMarkerId: selectedMotionMarker?.markerId ?? null,
        selectedMotionMarkers,
        selectedAdjustmentLayerId,
        selectedAdjustmentLayers,
        mode: timelineMode,
        timelineViewportState: composeMode ? project.editorState?.composeTimeline ?? defaultTimelineViewportState : project.editorState?.timeline ?? defaultTimelineViewportState,
        timeline,
        motionMarkers: scene.motionMarkers ?? [],
        timelineLayers,
        adjustmentLayers: scene.adjustmentLayers ?? [],
        transitionLayers: scene.transitionLayers ?? [],
        onModeChange: updateTimelineMode,
        onTimelineViewportStateChange: composeMode ? updateComposeTimelineViewportState : updateTimelineViewportState,
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
        onUpdateAdjustmentLayer: updateAdjustmentLayer,
        onReorderPart: reorderPart,
        onMoveComposition: moveCompositionMarker,
        onMoveCompositions: moveCompositionMarkers,
        onUpdateComposition: updateCompositionMarker,
        onMoveMotionMarker: moveMotionMarker,
        onMoveMotionMarkers: moveMotionMarkers,
        onScrub: composeMode && activeTimelinePart ? scrubToPlaybackDisplayTime : scrubToSceneTime,
        onScrubStart: pausePlaybackForTimelineScrub,
        onScrubEnd: resumePlaybackAfterTimelineScrub,
        onUpdateMotionMarkers: updateMotionMarkers as any,
        onResizeMotionMarkers: resizeMotionMarkers as any,
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
        onUpdateTransitionLayer: updateTransitionLayer,
        composeAnimationPart: composeMode && hasActiveComposition ? part : null,
        selectedObjectIds: selectedComposeObjectIds,
        onExitCompose: () => updateTimelineMode("composition"),
        onSelectComposeObjects: selectComposeLayerObjects,
        onRenameComposeAnimationLayer: renameComposeAnimationLayer,
        onUpdateComposeBackgroundMotion: updateComposeBackgroundMotion,
        onUpdateComposeObjectMotion: updateComposeObjectMotion,
        onUpdateComposeBackgroundAnimation: updateComposeBackgroundAnimation,
        onUpdateComposeObjectAnimation: updateComposeObjectAnimation,
      }}>
        <ConnectedTimelinePanel />
      </TimelineProvider>
    </main>
    <AppDialogs
      appContextMenu={appContextMenu}
      debugSettingsEnabled={debugSettingsEnabled}
      defaultNewMarkerDurationSeconds={markerDurationSeconds}
      exportDialogOpen={exportDialogOpen}
      exportDialogTab={exportDialogTab}
      exportIncludeSources={exportIncludeSources}
      exportProgress={exportProgress}
      isExporting={isExporting}
      partCount={scene.compositions.length}
      prerenderCacheEnabled={prerenderCacheEnabled}
      prerenderCacheBlackMissDebug={prerenderCacheBlackMissDebug}
      prerenderBlockDurationMs={prerenderBlockDurationMs}
      projectExportFormat={projectExportFormat}
      projectName={project.name}
      resolution={project.resolution}
      reusePrerenderCacheForExport={reusePrerenderCacheForExport}
      sceneDurationSeconds={sceneDurationSeconds}
      sceneName={getDisplayNameFromPath(selectedSceneId ?? "")}
      scrubCommitThrottleMs={scrubCommitThrottleMs}
      settingsOpen={settingsOpen}
      settingsSection={settingsSection}
      timelineEndPaddingFraction={timelineEndPaddingFraction}
      timelinePrecision={timelinePrecision}
      videoExportCancelling={videoExportCancelling}
      videoExportTileHeight={videoExportTileHeight}
      videoExportProgress={videoExportProgress}
      onAppContextMenuClose={() => setAppContextMenu(null)}
      onDebugSettingsEnabledChange={setDebugSettingsEnabled}
      onDefaultNewMarkerDurationSecondsChange={setDefaultNewMarkerDurationSeconds}
      onExportDialogOpenChange={setExportDialogOpen}
      onExportDialogTabChange={setExportDialogTab}
      onExportIncludeSourcesChange={setExportIncludeSources}
      onMediaExport={() => void exportRenderedMedia()}
      onProjectExport={() => void exportProject()}
      onPrerenderCacheEnabledChange={setPrerenderCacheEnabled}
      onPrerenderCacheBlackMissDebugChange={setPrerenderCacheBlackMissDebug}
      onPrerenderBlockDurationMsChange={setPrerenderBlockDurationMs}
      onClearAllPrerenderCaches={() => void clearAllPrerenderCaches()}
      onProjectExportFormatChange={setProjectExportFormat}
      onReusePrerenderCacheForExportChange={setReusePrerenderCacheForExport}
      onScrubCommitThrottleMsChange={setScrubCommitThrottleMs}
      onSettingsOpenChange={setSettingsOpen}
      onSettingsSectionChange={setSettingsSection}
      onTimelineEndPaddingFractionChange={setTimelineEndPaddingFraction}
      onTimelinePrecisionChange={setTimelinePrecision}
      onVideoExportTileHeightChange={setVideoExportTileHeight}
      onVideoExportCancel={() => void stopVideoExport()}
    />
    <FindMediaDialog findMediaRequest={findMediaRequest} onFindCompositionMedia={fileManagerActions.findCompositionMedia} onFindMediaRequestChange={setFindMediaRequest} />
    </>
  );
}

function isPrerenderCacheReuseEnabledByDefault() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("clipper:reuse-prerender-cache-export") !== "0";
}

function isPrerenderCacheEnabledByDefault() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("clipper:prerender-cache") !== "0";
}

function isDebugSettingsEnabledByDefault() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("clipper:debug-settings") === "1";
}

function isPrerenderCacheBlackMissDebugEnabledByDefault() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem("clipper:debug-settings") !== "1") return false;
  return window.localStorage.getItem("clipper:prerender-cache-black-miss-debug") === "1";
}

function getInitialVideoExportTileHeight() {
  if (typeof window === "undefined") return defaultVideoExportTileHeight;
  const storedValue = Number.parseInt(
    window.localStorage.getItem("clipper:video-export-tile-height") ?? "",
    10,
  );
  return clampVideoExportTileHeight(storedValue);
}

function getInitialPrerenderBlockDurationMs() {
  if (typeof window === "undefined") return defaultPrerenderBlockDurationMs;
  const storedValue = Number.parseInt(
    window.localStorage.getItem("clipper:prerender-block-duration-ms") ?? "",
    10,
  );
  return clampPrerenderBlockDurationMs(storedValue);
}

function clampVideoExportTileHeight(value: number) {
  if (!Number.isFinite(value)) return defaultVideoExportTileHeight;
  return Math.min(
    Math.max(Math.round(value), minVideoExportTileHeight),
    maxVideoExportTileHeight,
  );
}

function clampPrerenderBlockDurationMs(value: number) {
  if (!Number.isFinite(value)) return defaultPrerenderBlockDurationMs;
  return Math.min(
    Math.max(Math.round(value), minPrerenderBlockDurationMs),
    maxPrerenderBlockDurationMs,
  );
}

function isInspectorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-inspector-panel]"));
}

function isSelectPopoverTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-radix-select-content], [data-radix-popper-content-wrapper]"));
}

function isComposeLayersTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-compose-layers-panel]"));
}

function isTimelineTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-timeline-panel]"));
}
