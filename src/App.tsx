import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import toast from "react-hot-toast";
import { useEditorPanelResize } from "./app/features/editor-layout/useEditorPanelResize";
import { useFramePreviewZoomCommands } from "./app/features/editor-layout/useFramePreviewZoomCommands";
import { usePreviewScrollPersistence } from "./app/features/editor-layout/usePreviewScrollPersistence";
import { useExportCommands } from "./app/features/export/useExportCommands";
import { usePlaybackController } from "./app/features/playback/usePlaybackController";
import { useLiveSceneTimeRef } from "./app/features/playback/useLiveSceneTimeRef";
import {
  usePrerenderCache,
  type PrerenderManualCompositionRange,
} from "./app/features/preview/usePrerenderCache";
import { usePresentationController } from "./app/features/presentation/usePresentationController";
import {
  isTextEditingTarget,
  useGlobalEditorShortcuts,
} from "./app/features/shortcuts/useGlobalEditorShortcuts";
import { useSettingsShortcut } from "./app/features/shortcuts/useSettingsShortcut";
import { useAppUpdates } from "./app/features/updates/useAppUpdates";
import { useEditorTabsBridge } from "./app/features/editor-tabs/useEditorTabsBridge";
import {
  usePickingOrchestration,
  type UpdateMotionMarkerFn,
} from "./app/features/picking/usePickingOrchestration";
import { getProjectFolderSiblingNames } from "./app/features/file-manager/compositionLibraryMutations";
import { compositionMatchesIdentity } from "./app/features/file-manager/compositionIdentity";
import { getDirectoryPath } from "./app/features/file-manager/binPaths";
import {
  findBinItem,
  normalizeProjectBin,
} from "./app/features/file-manager/projectBinMutations";
import { useBinProjectActions } from "./app/features/file-manager/useBinProjectActions";
import {
  useFrameInteractionController,
  type FrameInteractionController,
} from "./app/features/frame-interactions/useFrameInteractionController";
import { useFrameInteractionEffects } from "./app/features/frame-interactions/useFrameInteractionEffects";
import { useFrameObjectCommands } from "./app/features/frame-interactions/useFrameObjectCommands";
import { useComposeObjectPreview } from "./app/features/frame-interactions/useComposeObjectPreview";
import { useAdjustmentLayerCommands } from "./app/features/timeline/useAdjustmentLayerCommands";
import { useTransitionLayerCommands } from "./app/features/timeline/useTransitionLayerCommands";
import { useTimelineGapCommands } from "./app/features/timeline/useTimelineGapCommands";
import { useCompositionTimelineCommands } from "./app/features/timeline/useCompositionTimelineCommands";
import {
  ConnectedTimelinePanel,
  TimelineProvider,
} from "./app/features/timeline/TimelineProvider";
import {
  getAdjustmentPointControlFramePoint,
  remapMovedMarkerMendIds,
  timelineMarkerKey,
  timelineMoveKey,
  uniqueMarkerSelections,
} from "./app/features/timeline/timelineMutationHelpers";
import {
  createPathSegment,
  computeShapeDrawBox,
  buildPathObjectUpdate,
  denormalizePathSegments,
  getDirectedDrawBounds,
  getDrawAxisSnap,
  getDraftJoints,
  getDraftPreviewSegments,
  getDrawToolName,
  getLastPathPoint,
  getMirroredPoint,
  getPathDraftSnapPoint,
  getPathDrawData,
  getPenPathData,
  getPenPreviewData,
  getPointDistance,
  getSvgDrawContent,
  isBezierDrawTool,
  isPathDrawTool,
  isSvgDrawTool,
  isTextPathObject,
  parseClipperPathStyle,
  removePathJoint,
  updateTextPathOffsetInContent,
  type ComposeDrawTool,
  type PathDraft,
  type ShapeDrawPreview,
} from "./app/features/compose/composeDrawing";
import { useActiveToolCleanup } from "./app/features/compose/useActiveToolCleanup";
import { useComposeToolShortcuts } from "./app/features/compose/useComposeToolShortcuts";
import { useComposeClipboard } from "./app/features/compose/useComposeClipboard";
import { useComposeSelectionPersistence } from "./app/features/compose/useComposeSelectionPersistence";
import { useComposeSelectionHydration } from "./app/features/compose/useComposeSelectionHydration";
import { usePenDraftShortcuts } from "./app/features/compose/usePenDraftShortcuts";
import { useComposeDrawing } from "./app/features/compose/useComposeDrawing";
import { useTimelineLayerCommands } from "./app/features/timeline/useTimelineLayerCommands";
import { useMotionMarkerCommands } from "./app/features/timeline/useMotionMarkerCommands";
import { useTimelineClipboardCommands } from "./app/features/timeline/useTimelineClipboardCommands";
import { useTimelineProjectActions } from "./app/features/timeline/useTimelineProjectActions";
import { useTimelineSelectionCommands } from "./app/features/timeline/useTimelineSelectionCommands";
import { clipperHost } from "./app/clipperHost";
import { getDisplayNameFromPath } from "./core/fileNames";
import { resolveProjectPreviewFps } from "./core/previewFps";
import {
  useActiveProjectBoot,
  type BootProject,
} from "./app/project/useActiveProjectBoot";
import { useProjectDocumentController } from "./app/project/useProjectDocumentController";
import { AppDialogs } from "./app/shell/AppDialogs";
import { AppHeader } from "./app/shell/AppHeader";
import { CenterPreviewPane } from "./app/shell/CenterPreviewPane";
import { ConnectedInspectorContent } from "./app/shell/ConnectedInspectorContent";
import {
  EditorWorkspace,
  TimelineResizeHandle,
} from "./app/shell/EditorWorkspace";
import { LeftSidebar } from "./app/shell/LeftSidebar";
import { PresentationControls } from "./app/shell/PresentationControls";
import { RightInspectorPanel } from "./app/shell/RightInspectorPanel";
import { useEditorViewportState } from "./app/shell/useEditorViewportState";
import { useEditorModeCommands } from "./app/shell/useEditorModeCommands";
import { usePointerFocusCleanup } from "./app/shell/usePointerFocusCleanup";
import { useProjectTitleRename } from "./app/shell/useProjectTitleRename";
import { useEditorStateSync } from "./app/shell/useEditorStateSync";
import { useAppLocalEventEffects } from "./app/shell/useAppLocalEventEffects";
import {
  defaultPrerenderBlockDurationMs,
  defaultScrubCommitThrottleMs,
  maxPrerenderBlockDurationMs,
  minPrerenderBlockDurationMs,
  selectorHandleSizePx,
  selectorOffsetPx,
} from "./app/config";
import { useEditorDerivedState } from "./app/state/editorDerivedState";
import { usePreviewLifecycle } from "./app/features/preview/usePreviewLifecycle";
import { usePostProcessLayerPreview } from "./app/features/preview/usePostProcessLayerPreview";
import {
  usePrerenderCompositionActions,
  usePrerenderSettings,
} from "./app/features/preview/usePrerenderSettings";
import { useExportSettings } from "./app/features/export/useExportSettings";
import {
  clampLiveDomPostProcessMaxFps,
  getInitialLiveDomPostProcessMaxFps,
  isDebugSettingsEnabledByDefault,
  isPrerenderCacheBlackMissDebugEnabledByDefault,
  isPrerenderCacheEnabledByDefault,
  isPrerenderCacheReuseEnabledByDefault,
  readStoredBooleanSetting,
} from "./app/state/storedAppSettings";
import { getFramePreviewTimelineLayers } from "./app/state/framePreviewRenderModel";
import {
  EditorStoreProvider,
  useEditorStore,
  useEditorStoreApi,
  useShellEditorState,
  useSelectionEditorState,
  usePlaybackEditorState,
  useViewportEditorState,
  useExportEditorState,
} from "./app/state/editorStore";
import { ProjectStoreProvider } from "./app/state/projectStore";
import { CodeObjectRuntimeHostBridge } from "./render-engine/codeObjectRuntimeHostBridge";
import {
  type AdjustmentLayerSelection,
  type CompositionSelection,
  type LeftPanelTab,
  type PlaybackClock,
  type RightPanelTab,
  type SettingsSection,
} from "./app/types";
import { getTimeSensitiveDisplayDuration } from "./core/adjustments";
import {
  isMarkerOnMotionLayer,
  type CameraPreviewTransform,
} from "./core/camera";
import {
  frameObjectFromBackgroundLayer,
  getFrameObjectSnapStops,
  getBoundsUnion,
  getPartFrameObject,
  selectionObjectFromBackgroundLayer,
  selectionObjectFromFrameObject,
  selectionPayloadFromObjects,
  type ObjectDrag,
  type ObjectResize,
  type ObjectSnapGuide,
} from "./core/frameInteraction";
import { boundsToPoints, framePointFromClient } from "./core/geometry";
import { clamp, roundToPrecision, roundTenth } from "./core/math";
import type { AdjustmentEffectPointControl } from "./core/effects/types";
import {
  defaultComposeLayoutState,
  defaultEditorLayoutState,
  defaultPreviewViewportState,
  defaultTimelineLayerState,
  defaultTimelineMode,
  defaultTimelineViewportState,
  emptyTimelineLayerState,
  replacePartInProject,
} from "./core/project";
import {
  getExecutableAdjustmentLayers,
  getExecutableTransitionLayers,
  getTopTimelinePartAtTime,
  type TimelinePreviewStackPart,
} from "./core/timeline";
import type { TimelineLayerCategory } from "./core/timelineLayers";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type Bounds,
  type CompositionClip,
  type EditorState,
  type FrameObject,
  type LayerAnimation,
  type MotionEffectKind,
  type Part,
  type Point,
  type ProjectManifest,
  type SelectionPayload,
  type TimelineClip,
  type TimelineLayerState,
  type TimelineMode,
  type TimelineMotionLayerState,
  type TransitionLayer,
  type TimelineViewportState,
} from "./core/types";
import { getPattern2dDefaults } from "./core/graphics/pattern2d";
import { FindMediaDialog } from "./components/FindMediaDialog";
import { WelcomeScreen } from "./components/WelcomeScreen";
import {
  consumePendingBinFindMedia,
  binFindMediaEvent,
  type BinFindMediaDetail,
} from "./lib/binEvents";

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

const wheelLineDeltaPx = 16;
const wheelPageDeltaPx = 600;
const frameWheelZoomSensitivity = 0.008;

function PathToastMessage({ action, path }: { action: string; path: string }) {
  const suffixLength = Math.min(32, Math.max(12, Math.floor(path.length / 3)));
  const splitIndex = Math.max(path.length - suffixLength, 0);

  return (
    <span className="grid min-w-0 max-w-[min(560px,calc(100vw_-_120px))] gap-0.5 leading-tight">
      <span>{action}</span>
      <span className="flex min-w-0 whitespace-nowrap" title={path}>
        <span className="min-w-0 overflow-hidden text-ellipsis">
          {path.slice(0, splitIndex)}
        </span>
        <span className="shrink-0">{path.slice(splitIndex)}</span>
      </span>
    </span>
  );
}

export function App() {
  const {
    bootError,
    bootProject,
    isWelcome,
    recentProjects,
    openProjectFromBoot,
    createNewProject,
    openRecentProject,
    deleteRecentProject,
    closeProject,
  } = useActiveProjectBoot();

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
    return (
      <main className="grid h-screen place-items-center bg-[#12141a] text-sm font-bold text-[#dfe2ea]">
        Opening project...
      </main>
    );
  }

  return (
    <AppProviders bootProject={bootProject} onCloseProject={closeProject} />
  );
}

function AppProviders({
  bootProject,
  onCloseProject,
}: {
  bootProject: BootProject;
  onCloseProject: () => void;
}) {
  return (
    <ProjectStoreProvider
      key={bootProject.manifestPath}
      project={bootProject.project}
      compositionSources={bootProject.compositionSources}
    >
      <EditorStoreProvider
        key={bootProject.manifestPath}
        project={bootProject.project}
      >
        <CodeObjectRuntimeHostBridge />
        <AppContent
          initialProjectManifestPath={bootProject.manifestPath}
          initialSourceStatus={bootProject.sourceStatus}
          onCloseProject={onCloseProject}
        />
      </EditorStoreProvider>
    </ProjectStoreProvider>
  );
}

function AppContent({
  initialProjectManifestPath,
  initialSourceStatus,
  onCloseProject,
}: {
  initialProjectManifestPath: string;
  initialSourceStatus: string;
  onCloseProject: () => void;
}) {
  const editorStore = useEditorStoreApi();
  const currentSceneTime = useEditorStore((s) => s.currentSceneTime);
  const [findMediaRequest, setFindMediaRequest] =
    useState<BinFindMediaDetail | null>(null);
  const {
    reusePrerenderCacheForExport,
    prerenderCacheEnabled,
    debugSettingsEnabled,
    prerenderCacheBlackMissDebug,
    liveDomPostProcessMaxFps,
    motionEffectPreviewScrubActive,
    prerenderDisplayReadyRef,
    setReusePrerenderCacheForExport,
    setPrerenderCacheEnabled,
    setDebugSettingsEnabled,
    setPrerenderCacheBlackMissDebug,
    setLiveDomPostProcessMaxFps,
    setMotionEffectPreviewScrubActive,
  } = usePreviewLifecycle();
  const {
    exportFrameRate,
    setExportFrameRate,
    mediaExportFormat,
    setMediaExportFormat,
    mediaExportRenderMode,
    setMediaExportRenderMode,
    exportRenderQuality,
    setExportRenderQuality,
    videoExportTileHeight,
    setVideoExportTileHeight,
    exportWorkerMapping,
    setExportWorkerMapping,
    exportWorkerConfigurationMode,
    setExportWorkerConfigurationMode,
    exportTileMapping,
    setExportTileMapping,
    stableSlowGridPreset,
    setStableSlowGridPreset,
    stableSlowValidationSamples,
    setStableSlowValidationSamples,
    previewRenderHeight,
    setPreviewRenderHeight,
    playbackFpsOption,
    setPlaybackFpsOption,
    agentProvider,
    setAgentProvider,
  } = useExportSettings();
  const [objectResizeMode, setObjectResizeMode] = useState<"resize" | "scale">(
    "resize",
  );
  const [activeTool, setActiveTool] = useState<ComposeDrawTool | null>(null);
  const activeToolRef = useRef<ComposeDrawTool | null>(null);
  const shapeDrawStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
    points: Point[];
  } | null>(null);
  const pathDraftRef = useRef<PathDraft | null>(null);
  const [shapeDrawPreview, setShapeDrawPreview] =
    useState<ShapeDrawPreview | null>(null);
  const shapeDrawPreviewRef = useRef<ShapeDrawPreview | null>(null);
  const shapeDrawPreviewFrameRef = useRef(0);
  const pendingComposeSelectionObjectIdsRef = useRef<string[]>([]);
  const {
    mode,
    setMode,
    timelineMode,
    setTimelineMode,
    leftPanelTab,
    setLeftPanelTab,
    rightPanelTab,
    setRightPanelTab,
    sourceStatus,
    setSourceStatus,
    appContextMenu,
    setAppContextMenu,
    renamingProject,
    setRenamingProject,
    projectNameDraft,
    setProjectNameDraft,
    settingsOpen,
    setSettingsOpen,
    settingsSection,
    setSettingsSection,
    applyEditorState: applyStoredEditorState,
  } = useShellEditorState();
  const {
    selectedSceneId,
    setSelectedSceneId,
    selectedPartId,
    setSelectedPartId,
    selectedParts,
    setSelectedParts,
    selectedObjectId,
    setSelectedObjectId,
    selectedComposeObjectIds,
    setSelectedComposeObjectIds,
    editingTextObjectId,
    setEditingTextObjectId,
    selectedMotionMarker,
    setSelectedMotionMarker,
    selectedMotionMarkers,
    setSelectedMotionMarkers,
    selectedAdjustmentLayerId,
    setSelectedAdjustmentLayerId,
    selectedAdjustmentLayers,
    setSelectedAdjustmentLayers,
    selectedTransitionLayerId,
    setSelectedTransitionLayerId,
    selectedTransitionLayers,
    setSelectedTransitionLayers,
    selectionPayload,
    setSelectionPayload,
    dragStart,
    setDragStart,
    dragBox,
    setDragBox,
    marqueeDragging,
    setMarqueeDragging,
    clearMarkerSelection: clearStoredMarkerSelection,
    clearDirectSelection,
    clearComposeSelection,
    setComposeSelection,
    applyComposeLayerSelection,
  } = useSelectionEditorState();
  const {
    isPlaying,
    setIsPlaying,
    setCurrentSceneTime,
    scrubSnapEnabled,
    setScrubSnapEnabled,
    scrubCommitThrottleMs,
    setScrubCommitThrottleMs,
    pausePlaybackOnScrub,
    setPausePlaybackOnScrub,
    fastSelectEnabled,
    setFastSelectEnabled,
  } = usePlaybackEditorState();
  const {
    framePreviewScale,
    setFramePreviewScale,
    frameZoomBarOpen,
    setFrameZoomBarOpen,
    timelineEndPaddingFraction,
    setTimelineEndPaddingFraction,
    timelinePrecision,
    setTimelinePrecision,
    defaultNewMarkerDurationSeconds: markerDurationSeconds,
    setDefaultNewMarkerDurationSeconds,
  } = useViewportEditorState();
  const {
    exportDialogOpen,
    setExportDialogOpen,
    isExporting,
    setIsExporting,
    exportProgress,
    setExportProgress,
    videoExportProgress,
    setVideoExportProgress,
    videoExportCancelling,
    setVideoExportCancelling,
  } = useExportEditorState();
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const appRootRef = useRef<HTMLElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const frameZoomControlRef = useRef<HTMLDivElement | null>(null);
  const uiPersistRef = useRef({ selectedComposeObjectIds: [] as string[] });
  uiPersistRef.current.selectedComposeObjectIds = selectedComposeObjectIds;
  const modeRef = useRef(mode);
  const activePartFilePathRef = useRef("");
  const currentSceneTimeRef = useLiveSceneTimeRef(currentSceneTime);
  const isPlayingRef = useRef(isPlaying);
  const playbackClockRef = useRef<PlaybackClock>(null);
  const wasPlayingRef = useRef(false);
  const timelineScrubbingRef = useRef(false);
  const timelineScrubPausedPlaybackRef = useRef(false);
  const presentationScrubPausedPlaybackRef = useRef(false);
  const numberInputScrubPausedPlaybackRef = useRef(false);
  const playbackTimeLabelRef = useRef<HTMLSpanElement | null>(null);
  const playbackPlayheadRef = useRef<HTMLDivElement | null>(null);
  const pausePlaybackAtCurrentTimeRef = useRef<(() => void) | null>(null);
  const updateMotionMarkerRef = useRef<UpdateMotionMarkerFn | null>(null);
  const {
    focusPickZoomMarker,
    setFocusPickZoomMarker,
    positionPickTranslationMarker,
    setPositionPickTranslationMarker,
    trackerPickTranslationMarker,
    setTrackerPickTranslationMarker,
    pointPickAdjustment,
    setPointPickAdjustment,
    framePickPreviewPoint,
    setFramePickPreviewPoint,
    isPickingZoomFocus,
    isPickingTranslationPosition,
    startZoomFocusPick,
    startTranslationPositionPick,
    startTranslationTrackerPick,
    commitTranslationTrackerPick,
    previewMotionPickPoint,
    clearMotionPickPointPreview,
  } = usePickingOrchestration({
    pausePlaybackAtCurrentTimeRef,
    updateMotionMarkerRef,
    frameViewportRef,
    framePreviewScale,
  });
  usePointerFocusCleanup();
  const {
    autoDownloadUpdates,
    updateStatus,
    setAutoDownloadUpdates,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useAppUpdates();

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
  const [objectSnapGuides, setObjectSnapGuides] = useState<ObjectSnapGuide[]>(
    [],
  );
  const objectSnapGuidesRef = useRef<ObjectSnapGuide[]>([]);
  const objectResizeRef = useRef<ObjectResize | null>(null);
  const objectResizeFrameRef = useRef(0);
  const objectResizeDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const objectResizePreserveAspectRef = useRef(false);
  const [, setObjectResizingActive] = useState(false);
  const centerPreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingCameraPreviewRef = useRef<CameraPreviewTransform | null>(null);
  const cameraPreviewFrameRef = useRef(0);
  const timelineModeRef = useRef(timelineMode);
  const frameInteractionControllerRef =
    useRef<FrameInteractionController | null>(null);
  const [previewTransitionLayers, setPreviewTransitionLayers] = useState<
    TransitionLayer[] | null
  >(null);

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
    compositionSourcesRef,
    implicitFileOperation,
    isFileSystemBusy,
    lastSavedAt,
    openProjectManifest,
    project,
    projectRef,
    replaceProject,
    redoProjectChange,
    requestUiPersist,
    saveAllChanges,
    scheduleImplicitFileOperationSave,
    setCompositionSources,
    undoProjectChange,
    updateEditorState,
    updateProject,
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
    uiPersistRef,
  });

  const {
    prerenderBlockDurationMs,
    prerenderCacheResetToken,
    setPrerenderBlockDurationMs,
    clearAllPrerenderCaches,
    resetPrerenderCache,
  } = usePrerenderSettings({ activeProjectManifestPath });

  function withInspectorScrollPreserved(fn: () => void) {
    const panel = document.querySelector<HTMLElement>("[data-inspector-panel]");
    const scrollTop = panel?.scrollTop ?? 0;
    fn();
    if (panel)
      requestAnimationFrame(() => {
        panel.scrollTop = scrollTop;
      });
  }

  function undoWithScrollPreserved() {
    withInspectorScrollPreserved(() => undoProjectChange());
  }

  function redoWithScrollPreserved() {
    withInspectorScrollPreserved(() => redoProjectChange());
  }

  // Export resolution is user-selectable via dropdown and threads through the full export backend (wired in v0.2.10).
  const [exportResolution, setExportResolution] = useState<{
    width: number;
    height: number;
  }>(() => project.resolution);

  const { updateMode, updateTimelineMode } = useEditorModeCommands({
    modeRef,
    timelineModeRef,
    setMode,
    setTimelineMode,
    updateEditorState,
  });
  const { updateEditorViewportState } =
    useEditorViewportState(updateEditorState);
  const {
    toggleFrameZoomBar,
    updateFramePreviewScale,
    zoomFramePreviewAtPoint,
  } = useFramePreviewZoomCommands({
    centerPreviewScrollRef,
    framePreviewScale,
    frameZoomBarOpen,
    frameZoomControlRef,
    setFramePreviewScale,
    setFrameZoomBarOpen,
  });
  const { saveCenterPreviewScroll } = usePreviewScrollPersistence({
    centerPreviewScrollRef,
    updateEditorState,
  });
  const { cancelProjectRename, commitProjectRename, openProjectTitleMenu } =
    useProjectTitleRename({
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
    adjustedSceneTime,
    agentContext,
    assets = [],
    cameraPreviewTransform,
    canSelectFrameObjects,
    framePickPoint,
    hasActiveComposition,
    inspectorAdjustmentMiddleSnap,
    inspectorCompositionMiddleSnap,
    inspectorMotionMiddleSnap,
    part,
    partStart: displayPartStart,
    sceneMotionPart,
    sceneWrap,
    previewSceneContext,
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
    previewTransitionLayers: previewTransitionLayers ?? undefined,
    positionPickTranslationMarker,
    project,
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
  const composePlaybackRangeRef = useRef<
    { start: number; end: number; localLabels: true } | undefined
  >(undefined);
  const nextComposePlaybackRange =
    composeMode && activeTimelinePart
      ? {
          start: activeTimelinePart.start,
          end: activeTimelinePart.start + part.duration,
          localLabels: true as const,
        }
      : undefined;
  if (!isPlaying) composePlaybackRangeRef.current = nextComposePlaybackRange;
  const composePlaybackRange = isPlaying
    ? composePlaybackRangeRef.current
    : nextComposePlaybackRange;

  const compositionLibrary = project.compositionLibrary ?? [];
  const {
    editorTabs,
    activeEditorTabId,
    closeEditorTab,
    selectEditorTab,
    pinEditorTab,
    restoreClosedEditorTab,
    activeEditorDocument,
    editorPaneTabs,
    activeEditorViewportState,
    openCompositionInEditor,
    openProjectFileInEditor,
    handleSelectComposition,
    commitActiveEditorSource,
    restoreRemovedEditorTabFile,
  } = useEditorTabsBridge({
    project,
    projectRef,
    scene,
    compositionLibrary,
    updateMode,
    updateEditorState,
    updateProject,
  });
  const timelines = project.timelines ?? [];
  const activeTimeline = timelines.find((t) => t.id === selectedSceneId);
  const activeTimelineName = getDisplayNameFromPath(
    activeTimeline?.filePath ?? activeTimeline?.id ?? selectedSceneId ?? "",
  );
  const hasActiveTimeline = Boolean(activeTimeline);
  const previewFps = resolveProjectPreviewFps(
    project,
    selectedSceneId,
    playbackFpsOption === "follow" ? undefined : playbackFpsOption,
  );
  const storedTimelineLayers = getFramePreviewTimelineLayers(
    project,
    selectedSceneId,
  );
  const timelineLayers =
    hasActiveTimeline || composeMode
      ? {
          ...defaultTimelineLayerState,
          ...storedTimelineLayers,
          compositionLayers: storedTimelineLayers?.compositionLayers?.length
            ? storedTimelineLayers.compositionLayers
            : defaultTimelineLayerState.compositionLayers,
          adjustmentLayers: storedTimelineLayers?.adjustmentLayers?.length
            ? storedTimelineLayers.adjustmentLayers
            : defaultTimelineLayerState.adjustmentLayers,
          motionLayers: storedTimelineLayers?.motionLayers?.length
            ? storedTimelineLayers.motionLayers
            : defaultTimelineLayerState.motionLayers,
          transitionLayers: storedTimelineLayers?.transitionLayers?.length
            ? storedTimelineLayers.transitionLayers
            : defaultTimelineLayerState.transitionLayers,
        }
      : emptyTimelineLayerState;
  const baseMotionLayers = timelineLayers.motionLayers?.length
    ? timelineLayers.motionLayers
    : defaultTimelineLayerState.motionLayers!;
  const motionLayers = baseMotionLayers;
  const hiddenMotionLayerIds = new Set(
    motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id),
  );
  const hiddenCompositionLayerIds = new Set(
    (timelineLayers.compositionLayers ?? [])
      .filter((layer) => layer.hidden)
      .map((layer) => layer.id),
  );
  const visibleSceneAdjustmentLayers = useMemo(
    () => getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayers),
    [scene.adjustmentLayers, timelineLayers],
  );
  const visibleSceneTransitionLayers = useMemo(
    () => getExecutableTransitionLayers(scene.transitionLayers, timelineLayers),
    [scene.transitionLayers, timelineLayers],
  );
  const activeCompositionHidden = Boolean(
    activeTimelinePart &&
    hiddenCompositionLayerIds.has(activeTimelinePart.layerId ?? "comp"),
  );
  const {
    previewAdjustmentLayer,
    clearAdjustmentPreview,
    previewTransitionLayer,
    clearTransitionPreview,
  } = usePostProcessLayerPreview({
    currentSceneTimeRef,
    frameViewportRef,
    visibleSceneAdjustmentLayers,
    visibleSceneTransitionLayers,
    setPreviewTransitionLayers,
  });
  const hasPreviewComposition = hasActiveComposition;
  const manualPrerenderRanges = useMemo(
    () =>
      getManualPrerenderRangesForMarkedCompositions(
        renderableScene.compositions,
        sceneDurationSeconds,
        timelineLayers,
      ),
    [renderableScene.compositions, sceneDurationSeconds, timelineLayers],
  );
  const manualPrerenderCompositionIds = useMemo(
    () => new Set(manualPrerenderRanges.map((range) => range.compositionId)),
    [manualPrerenderRanges],
  );
  const manualPrerenderActiveAtCurrentTime = useMemo(
    () =>
      manualPrerenderRanges.some(
        (range) =>
          currentSceneTime >= range.start && currentSceneTime < range.end,
      ),
    [currentSceneTime, manualPrerenderRanges],
  );

  const prerenderPlaybackEnabled =
    (prerenderCacheEnabled || manualPrerenderActiveAtCurrentTime) &&
    mode === "preview" &&
    !composeMode;
  const prerenderScheduleRanges = prerenderCacheEnabled
    ? []
    : manualPrerenderRanges;
  const prerenderSchedulingEnabled =
    (prerenderCacheEnabled || manualPrerenderActiveAtCurrentTime) &&
    mode === "preview" &&
    !composeMode;
  const prerenderCache = usePrerenderCache({
    blockDurationMs: prerenderBlockDurationMs,
    cacheResetToken: prerenderCacheResetToken,
    enabled: prerenderSchedulingEnabled,
    hasActiveComposition: hasPreviewComposition,
    isPlaying,
    manifestPath: activeProjectManifestPath,
    project,
    scene: renderableScene,
    sceneDuration: sceneDurationSeconds,
    sceneTime: currentSceneTime,
    tileHeight: videoExportTileHeight,
    timelineLayers,
    scheduleRanges: prerenderScheduleRanges,
  });
  const { togglePrerenderCompositionFromLibrary } =
    usePrerenderCompositionActions({
      compositionLibrary,
      scene,
      manualPrerenderCompositionIds,
      prerenderCache,
      implicitFileOperation,
      updateProject,
    });
  const visiblePrerenderCoverage = useMemo(() => {
    if (prerenderCacheEnabled) return prerenderCache.coverage;
    if (manualPrerenderRanges.length === 0) return null;
    return filterPrerenderCoverageToRanges(
      prerenderCache.coverage,
      manualPrerenderRanges,
    );
  }, [manualPrerenderRanges, prerenderCache.coverage, prerenderCacheEnabled]);
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
    toPlaybackDisplayTime,
    togglePlayback,
  } = usePlaybackController({
    compositions: scene.compositions,
    playbackRange: composePlaybackRange,
    currentSceneTime,
    currentSceneTimeRef,
    editorStore,
    frameViewportRef,
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
    requestPrerenderAtTime: prerenderCache.requestCacheAtTime,
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
  pausePlaybackAtCurrentTimeRef.current = pausePlaybackAtCurrentTime;
  const scrubComposePlaybackTime = useCallback(
    (time: number) => {
      if (!composePlaybackRange) {
        scrubToPlaybackDisplayTime(time);
        return;
      }

      const duration = Math.max(
        composePlaybackRange.end - composePlaybackRange.start,
        0,
      );
      const boundedTime =
        duration > 0
          ? clamp(time, 0.000001, Math.max(duration - 0.000001, 0))
          : 0;
      scrubToSceneTime(composePlaybackRange.start + boundedTime);
    },
    [composePlaybackRange, scrubToPlaybackDisplayTime, scrubToSceneTime],
  );
  const {
    enterFrameFullscreen,
    enterTheaterMode,
    exitPresentationMode,
    presentationControlsVisible,
    presentationMode,
    presentationModeRef,
    presentationViewport,
    scrubPresentationTime,
    showPresentationControls,
  } = usePresentationController({
    appRootRef,
    centerPreviewScrollRef,
    pausePlaybackAtCurrentTime,
    scrubToSceneTime,
    updateMode,
  });
  const previewSelectionObjects = selectionPayload?.objects ?? [];
  const { exportRenderedMedia, stopVideoExport } = useExportCommands({
    projectRef,
    manifestPath: activeProjectManifestPath,
    selectedSceneId,
    exportFrameRate,
    exportRenderQuality,
    exportResolution,
    mediaExportRenderMode,
    stableSlowGridPreset,
    stableSlowValidationSamples,
    exportTileMapping,
    exportWorkerMapping,
    mediaExportFormat,
    reusePrerenderCacheForExport,
    videoExportTileHeight,
    saveAllChanges,
    setExportDialogOpen,
    setExportProgress,
    setIsExporting,
    setVideoExportCancelling,
    setVideoExportProgress,
    notifyRenderedMedia: (path) =>
      toast.success(
        <PathToastMessage action="Rendered video to" path={path} />,
      ),
    notifyError: (message) => toast.error(message),
  });

  useEditorStateSync({
    mode,
    modeRef,
    timelineMode,
    timelineModeRef,
    hasActiveComposition,
    partFilePath: part.filePath,
    activePartFilePathRef,
    leftPanelTab,
    rightPanelTab,
    selectedSceneId,
    selectedPartId,
    selectedMotionMarker,
    markerDurationSeconds,
    timelineEndPaddingFraction,
    timelinePrecision,
    pausePlaybackOnScrub,
    framePreviewScale,
    frameZoomBarOpen,
    initialSourceStatus,
    updateEditorState,
    setSourceStatus,
  });

  useAppLocalEventEffects({
    centerPreviewScrollRef,
    mode,
    setFindMediaRequest,
    zoomFramePreviewFromWheel,
  });

  useSettingsShortcut({ setSettingsOpen });

  useEffect(() => {
    if (
      selectedPartId &&
      timelineMode !== "compose" &&
      activeTimelinePart &&
      activeTimelinePart.id !== selectedPartId
    ) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
    }
  }, [activeTimelinePart, selectedMotionMarker, selectedPartId, timelineMode]);

  useEffect(() => {
    let selectedObjectMissing = false;

    setSelectionPayload((current) => {
      if (!current?.objects.length) return current;
      const nextObjects = current.objects.flatMap((selected) => {
        if (selected.id === part.background.id)
          return [selectionObjectFromBackgroundLayer(part.background)];
        const object =
          part.objects.find((item) => item.id === selected.id) ??
          part.background.elements.find((item) => item.id === selected.id);
        return object ? [selectionObjectFromFrameObject(object)] : [];
      });

      if (nextObjects.length !== current.objects.length) {
        selectedObjectMissing = true;
        return null;
      }

      if (timelineMode === "compose") return current;

      const unchanged = nextObjects.every((object, index) => {
        const previous = current.objects[index];
        return (
          object.id === previous.id &&
          object.name === previous.name &&
          object.selector === previous.selector &&
          object.type === previous.type &&
          object.bounds.x === previous.bounds.x &&
          object.bounds.y === previous.bounds.y &&
          object.bounds.width === previous.bounds.width &&
          object.bounds.height === previous.bounds.height
        );
      });
      if (unchanged) return current;

      const selectionBox = getBoundsUnion(
        nextObjects.map((object) => object.bounds),
      );
      return {
        selectionBox,
        coordinates: boundsToPoints(selectionBox),
        objects: nextObjects,
      };
    });

    if (selectedObjectMissing) setSelectedObjectId(null);
  }, [part.background.elements, part.objects, timelineMode]);

  useComposeSelectionHydration({
    part,
    timelineMode,
    project,
    selectedObjectId,
    selectedComposeObjectIds,
    selectionPayload,
    pendingComposeSelectionObjectIdsRef,
    setComposeSelectionObjects,
  });

  useFrameInteractionEffects({
    cameraPreviewFrameRef,
    dragBoxFrameRef,
    frameInteractionControllerRef,
    framePickFrameRef,
    frameViewportRef,
    marqueeDragging,
    objectDragFrameRef,
    objectDragRef,
    objectResizeRef,
    timelineMode,
    clearDragBox,
    clearObjectDrag,
    setComposeSelectionObjects,
    setEditingTextObjectId,
  });

  const {
    updateCompositionForTimelinePart,
    updateCurrentPart,
    updateSceneAdjustmentLayers,
    updateSceneMotionMarkers,
    updateSceneParts,
    updateSceneTransitionLayers,
    updateTimelineLayers,
    updateTimelineViewportState,
  } = useTimelineProjectActions({
    scene,
    timelineMode,
    updateEditorState,
    updateProject,
  });

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
    timeline,
    cancelFramePickPreview,
    clearStoredMarkerSelection,
    clearStoredNodeSelection: clearDirectSelection,
    pausePlaybackAtCurrentTime,
    scrubToSceneTime,
    setFocusPickZoomMarker,
    setPositionPickTranslationMarker,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedPartId,
    setSelectedParts,
    setSelectedMotionMarker,
    setSelectedMotionMarkers,
    setSelectedTransitionLayerId,
    setSelectedTransitionLayers,
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

  const {
    selectTransitionLayer,
    selectTransitionLayers,
    moveTransitionLayer,
    moveTransitionLayers,
    updateTransitionLayer,
    addTransitionLayerAt,
  } = useTransitionLayerCommands({
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
  });

  const { moveAdjustmentLayers, shiftTimelineGapMarkers } =
    useTimelineGapCommands({
      currentSceneTimeRef,
      defaultEditorState,
      scene,
      timelinePrecision,
      scrubToSceneTime,
      updateProject,
      updateSceneAdjustmentLayers,
    });

  function persistComposeSelection(objectIds: string[]) {
    setSelectedComposeObjectIds(objectIds);
  }

  function setComposeSelectionObjects(objects: FrameObject[]) {
    if (objects.length === 0) {
      setComposeSelection({
        selectedObjectId: null,
        selectedComposeObjectIds: [],
        selectionPayload: null,
      });
      return;
    }

    const objectIds = objects.map((object) => object.id);
    setComposeSelection({
      selectedObjectId: objects[0].id,
      selectedComposeObjectIds: objectIds,
      selectionPayload: selectionPayloadFromObjects(
        objects.map(selectionObjectFromFrameObject),
      ),
    });
  }

  function inspectComposeObject(object: FrameObject | null) {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    setSelectedObjectId(object?.id ?? null);
    setSelectionPayload(null);
    persistComposeSelection([]);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
  }

  function selectComposeFrameSettings() {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    persistComposeSelection([]);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedPartId(part.id);
    setSelectedParts([{ partId: part.id }]);
  }

  const {
    createComposeObject,
    deleteComposeObjects,
    reorderComposeObjects,
    selectComposeLayerObjects,
    updateObjectById,
    updatePartBackground,
    updatePartFrame,
    updatePartRenderMode,
    updateSelectedObject,
    updateSelectedPartDuration,
    updateTextObjectContent,
  } = useFrameObjectCommands({
    part,
    selectedObjectId,
    selectedPart,
    setEditingTextObjectId,
    setComposeSelectionObjects,
    applyComposeLayerSelection,
    updateCompositionForTimelinePart,
    updateSceneParts,
  });
  const { previewSelectedObject, previewPartFrame, previewPartBackground } =
    useComposeObjectPreview({
      frameViewportRef,
      selectedObject,
      part,
    });

  function updateComposeObjectAnimation(
    objectId: string,
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) {
    updateObjectById(objectId, (object) => ({
      ...object,
      animations: updater(object.animations ?? []),
    }));
  }

  function updateComposeObject(
    objectId: string,
    updater: (object: FrameObject) => FrameObject,
  ) {
    updateObjectById(objectId, updater);
  }

  function updateComposeBackgroundAnimation(
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) {
    updatePartBackground((background) => ({
      ...background,
      animations: updater(background.animations ?? []),
    }));
  }

  function toggleComposeLayerHidden(layerId: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({
        ...background,
        hidden: !background.hidden || undefined,
      }));
      return;
    }
    const element = part.background.elements.find((el) => el.id === layerId);
    if (element) {
      updatePartBackground((background) => ({
        ...background,
        elements: background.elements.map((el) =>
          el.id === layerId ? { ...el, hidden: !el.hidden || undefined } : el,
        ),
      }));
      return;
    }
    updateObjectById(layerId, (object) => ({
      ...object,
      hidden: !object.hidden || undefined,
    }));
  }

  function toggleComposeLayerLocked(layerId: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({
        ...background,
        locked: !background.locked || undefined,
      }));
      return;
    }
    const element = part.background.elements.find((el) => el.id === layerId);
    if (element) {
      updatePartBackground((background) => ({
        ...background,
        elements: background.elements.map((el) =>
          el.id === layerId ? { ...el, locked: !el.locked || undefined } : el,
        ),
      }));
      return;
    }
    updateObjectById(layerId, (object) => ({
      ...object,
      locked: !object.locked || undefined,
    }));
  }

  function openComposeObjectContextMenu(
    event: React.MouseEvent,
    object: import("./core/types").FrameObject,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const targetIds = selectedComposeObjectIds.includes(object.id)
      ? selectedComposeObjectIds
      : [object.id];
    const targetObjects = [...part.background.elements, ...part.objects].filter(
      (o) => targetIds.includes(o.id),
    );
    const allHidden = targetObjects.every((o) => o.hidden);
    const allLocked = targetObjects.every((o) => o.locked);
    const label =
      targetIds.length > 1
        ? `${targetIds.length} objects`
        : (object.name ?? "Object");
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: `Duplicate ${label}`,
          action: () => {
            const suffix = Date.now().toString(36);
            const offset = 24;
            const duplicated = targetObjects.map((o, index) => {
              const id = `${o.id}:copy:${suffix}:${index}`;
              return {
                ...structuredClone(o),
                id,
                selector: `[data-object-id='${id}']`,
                bounds: {
                  ...o.bounds,
                  x: o.bounds.x + offset,
                  y: o.bounds.y + offset,
                },
              };
            });
            updateCompositionForTimelinePart(part.id, (composition) => ({
              ...composition,
              objects: [...composition.objects, ...duplicated],
            }));
            setComposeSelectionObjects(duplicated);
          },
        },
        {
          label: allHidden ? `Show ${label}` : `Hide ${label}`,
          action: () => {
            for (const id of targetIds) toggleComposeLayerHidden(id);
          },
        },
        {
          label: allLocked ? `Unlock ${label}` : `Lock ${label}`,
          action: () => {
            for (const id of targetIds) toggleComposeLayerLocked(id);
          },
        },
        {
          label: `Delete ${label}`,
          danger: true,
          action: () => deleteComposeObjects(targetIds),
        },
      ],
    });
  }

  function renameComposeAnimationLayer(layerId: string, name: string) {
    if (part.background.id === layerId) {
      updatePartBackground((background) => ({ ...background, name }));
      return;
    }
    updateObjectById(layerId, (object) => ({ ...object, name }));
  }

  function updateComposeTimelineViewportState(
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) {
    updateEditorState((state) => ({
      ...state,
      composeTimeline: updater(
        state.composeTimeline ?? defaultTimelineViewportState,
      ),
    }));
  }

  function cancelActiveSelector() {
    const hasActivePicker = Boolean(
      focusPickZoomMarker ||
      positionPickTranslationMarker ||
      trackerPickTranslationMarker ||
      pointPickAdjustment,
    );
    const hasSelection = Boolean(
      selectedPartId ||
      selectedParts.length ||
      selectedObjectId ||
      selectionPayload ||
      selectedComposeObjectIds.length ||
      selectedMotionMarker ||
      selectedMotionMarkers.length ||
      selectedAdjustmentLayerId ||
      selectedAdjustmentLayers.length ||
      selectedTransitionLayerId ||
      selectedTransitionLayers.length,
    );
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
    persistComposeSelection([]);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    return true;
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
    clearNodeSelection: clearDirectSelection,
    setSelectedPartId,
    setSelectedParts,
    timelinePrecision,
    updateSceneParts,
  });

  const {
    addMotionEffect,
    addMotionMarker: addZoomMarker,
    previewMotionMarker,
    clearMotionPreview,
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
  } = useMotionMarkerCommands({
    activeTimelinePart,
    cameraRef,
    hiddenMotionLayerIds,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    markerDurationSeconds,
    motionLayers,
    part,
    pendingPreviewRef: pendingCameraPreviewRef,
    previewTime,
    scene,
    sceneDurationSeconds,
    selectedObjectBounds: selectedObject?.bounds ?? null,
    selectedMotionMarkers,
    timelineMode,
    timelinePrecision,
    previewFrameRef: cameraPreviewFrameRef,
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
  updateMotionMarkerRef.current = updateMotionMarker;

  const previewRenderScale = previewRenderHeight / FRAME_HEIGHT;
  const displayFramePreviewScale = presentationMode
    ? presentationViewport.scale
    : framePreviewScale;
  const frameSelectionOverlayScale =
    displayFramePreviewScale / previewRenderScale;

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
    frameDisplayScale: displayFramePreviewScale,
    framePreviewScale: previewRenderScale,
    selectionOverlayScale: frameSelectionOverlayScale,
    frameViewportRef,
    liveDragSelectionIdsRef,
    marqueeDraggingRef,
    marqueeLastPointRef,
    marqueeSpacePanningRef,
    mode,
    objectDragDeltaRef,
    objectDragFrameRef,
    objectDragRef,
    objectSnapGuidesRef,
    objectResizeDeltaRef,
    objectResizeFrameRef,
    objectResizeMode,
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
    clearNodeSelection: clearComposeSelection,
    onSelectFrameSettings: selectComposeFrameSettings,
    setDragBox,
    setDragStart,
    setEditingTextObjectId,
    setFramePickPreviewPoint,
    setMarqueeDragging,
    setObjectResizingActive,
    setObjectSnapGuides,
    setRightPanelTab,
    setSelectedComposeObjectIds,
    setSelectedObjectId,
    setSelectionPayload,
    setComposeSelection,
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

  const composeDrawing = useComposeDrawing({
    part,
    activeToolRef,
    cameraPreviewScale: cameraPreviewTransform.scale,
    shapeDrawStartRef,
    pathDraftRef,
    shapeDrawPreviewRef,
    shapeDrawPreviewFrameRef,
    objectSnapGuidesRef,
    frameViewportRef,
    displayFramePreviewScale,
    pendingComposeSelectionObjectIdsRef,
    updateCompositionForTimelinePart,
    updateObjectById,
    persistComposeSelection,
    setActiveTool,
    setShapeDrawPreview,
    setEditingTextObjectId,
    setObjectSnapGuides,
    startTextObjectEdit,
    onFramePointerCancel,
    onFramePointerDown,
    onFramePointerMove,
    onFramePointerUp,
  });

  useActiveToolCleanup({
    activeTool,
    pathDraftRef,
    shapeDrawPreviewRef,
    setShapeDrawPreview,
  });

  useComposeToolShortcuts({
    activeTool,
    activeToolRef,
    composeMode,
    hasPreviewComposition,
    mode,
    addNullObjectToFrameCenter: composeDrawing.addNullObjectToFrameCenter,
    setActiveTool,
    setObjectResizeMode,
  });

  usePenDraftShortcuts({
    pathDraftRef,
    shapeDrawPreviewRef,
    commitPathDraftObject: composeDrawing.commitPathDraftObject,
    setShapeDrawPreview,
  });

  useComposeClipboard({
    composeMode,
    editingTextObjectId,
    mode,
    part,
    selectedComposeObjectIds,
    deleteComposeObjects,
    setComposeSelectionObjects,
    updateCompositionForTimelinePart,
  });

  useComposeSelectionPersistence({
    project,
    requestUiPersist,
    selectedComposeObjectIds,
    timelineMode,
  });

  const {
    copySelectedTimelineNodes,
    cutSelectedTimelineNodes,
    deleteSelectedTimelineNodes,
    openTimelineBlankContextMenu,
    openTimelineNodeContextMenu,
    pasteTimelineAttributesSilently,
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
    prerenderComposition: togglePrerenderCompositionFromLibrary,
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
    setSelectedParts,
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
    pasteTimelineAttributesSilently,
    pasteTimelineNodesSilently,
    presentationModeRef,
    pausePlaybackAtCurrentTime,
    redoProjectChange: redoWithScrollPreserved,
    restoreClosedEditorTab,
    selectedPartId,
    setFastSelectEnabled,
    setObjectResizeMode,
    setScrubSnapEnabled,
    showPresentationControls,
    stepSceneTime,
    timelineMode,
    togglePlayback,
    undoProjectChange: undoWithScrollPreserved,
    updateMode,
    updateTimelineMode,
  });

  function isMotionLayerVacant(layerId: string) {
    return !(scene.motionMarkers ?? []).some(
      (marker) => marker.layerId === layerId,
    );
  }

  function updateEffectsPanelState(
    effectsPanelState: NonNullable<EditorState["effectsPanelState"]>,
  ) {
    updateEditorState((state) => ({ ...state, effectsPanelState }));
  }

  const { previewEditorLayout, startEditorPanelResize } = useEditorPanelResize({
    projectRef,
    updateEditorState,
  });

  const projectDirectory = activeProjectManifestPath.includes("/")
    ? activeProjectManifestPath.slice(
        0,
        activeProjectManifestPath.lastIndexOf("/"),
      )
    : undefined;

  const binActions = useBinProjectActions({
    addCompositionFromLibrary,
    assets,
    clearNodeSelection: clearDirectSelection,
    compositionLibrary,
    compositionSourcesRef,
    defaultEditorState,
    part,
    project,
    projectRef,
    selectedSceneId,
    setCurrentSceneTime,
    setCompositionSources,
    setSelectedPartId,
    setSelectedSceneId,
    updateTimelineMode,
    updateEditorState,
    updateProject,
    projectDirectory: projectDirectory ?? "",
    scheduleImplicitFileOperationSave,
  });

  const editorLayout =
    previewEditorLayout ??
    project.editorState?.layout ??
    defaultEditorLayoutState;
  const appShellStyle = {
    "--clipper-left-panel-width": `${editorLayout.leftPanelWidth}px`,
    "--clipper-right-panel-width": `${editorLayout.rightPanelWidth}px`,
    "--clipper-timeline-height": `${editorLayout.timelineHeight}px`,
    "--clipper-presentation-width": `${presentationViewport.width}px`,
    "--clipper-presentation-height": `${presentationViewport.height}px`,
    "--clipper-presentation-scale": presentationViewport.scale,
    gridTemplateRows: `48px minmax(0, 1fr) var(--clipper-timeline-height)`,
  } as CSSProperties;
  const editorShellStyle = {
    gridTemplateColumns:
      "var(--clipper-left-panel-width) minmax(640px, 1fr) var(--clipper-right-panel-width)",
  } as CSSProperties;
  const playbackDisplayDuration = composePlaybackRange
    ? Math.max(composePlaybackRange.end - composePlaybackRange.start, 0)
    : getTimeSensitiveDisplayDuration(
        sceneDurationSeconds,
        visibleSceneAdjustmentLayers,
      );
  const blankFrameViewportStyle = {
    width: FRAME_WIDTH * displayFramePreviewScale,
    height: FRAME_HEIGHT * displayFramePreviewScale,
  } as CSSProperties;
  function zoomFramePreviewFromWheel(event: globalThis.WheelEvent) {
    if (mode !== "preview" || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const deltaY =
      event.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * wheelLineDeltaPx
        : event.deltaMode === globalThis.WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * wheelPageDeltaPx
          : event.deltaY;
    zoomFramePreviewAtPoint(
      Math.exp(-deltaY * frameWheelZoomSensitivity),
      event.clientX,
      event.clientY,
    );
  }
  const adjustmentPickLayer = pointPickAdjustment
    ? scene.adjustmentLayers?.find(
        (layer) => layer.id === pointPickAdjustment.layerId,
      )
    : null;
  const adjustmentFramePickPoint =
    pointPickAdjustment && adjustmentPickLayer
      ? getAdjustmentPointControlFramePoint(
          adjustmentPickLayer,
          pointPickAdjustment.control,
        )
      : null;
  const activeFramePickPoint =
    (pointPickAdjustment
      ? (framePickPreviewPoint ?? adjustmentFramePickPoint)
      : framePickPoint) ?? null;
  const leftSidebarPlaybackInputRef = useRef({
    part,
    selectedComposeObjectIds,
  });
  if (!isPlaying)
    leftSidebarPlaybackInputRef.current = { part, selectedComposeObjectIds };
  const leftSidebarPart = isPlaying
    ? leftSidebarPlaybackInputRef.current.part
    : part;
  const leftSidebarSelectedObjectIds = isPlaying
    ? leftSidebarPlaybackInputRef.current.selectedComposeObjectIds
    : selectedComposeObjectIds;

  async function handleCloseProject() {
    await saveAllChanges();
    onCloseProject();
  }

  function handleSelectTimeline(timelineId: string) {
    updateTimelineMode("composition");
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({
      ...state,
      selectedSceneId: timelineId,
      currentSceneTime: 0,
    }));
    clearDirectSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  function handleTimelineModeChange(nextMode: TimelineMode) {
    // Switching from Compose -> Direct should not implicitly "select" whatever
    // timeline clip happened to be used as the compose target.
    if (timelineMode === "compose" && nextMode === "composition") {
      clearDirectSelection();
    }
    updateTimelineMode(nextMode);
  }

  function handleModeChange(nextMode: typeof mode) {
    if (nextMode === "preview") resetPrerenderCache();
    updateMode(nextMode);
  }

  const openExportDialog = useCallback(
    () => setExportDialogOpen(true),
    [setExportDialogOpen],
  );
  const openSettings = useCallback(
    () => setSettingsOpen(true),
    [setSettingsOpen],
  );
  const openProjectAction = useCallback(
    () => void openProjectManifest(),
    [openProjectManifest],
  );
  const closeAppContextMenu = useCallback(
    () => setAppContextMenu(null),
    [setAppContextMenu],
  );
  const handleAutoDownloadUpdatesChange = useCallback(
    (enabled: boolean) => void setAutoDownloadUpdates(enabled),
    [setAutoDownloadUpdates],
  );
  const handleCheckForUpdates = useCallback(
    () => void checkForUpdates(),
    [checkForUpdates],
  );
  const handleDownloadUpdate = useCallback(
    () => void downloadUpdate(),
    [downloadUpdate],
  );
  const handleMediaExport = useCallback(
    () => void exportRenderedMedia(),
    [exportRenderedMedia],
  );
  const handleClearAllPrerenderCaches = useCallback(
    () => void clearAllPrerenderCaches(),
    [clearAllPrerenderCaches],
  );
  const handleVideoExportCancel = useCallback(
    () => void stopVideoExport(),
    [stopVideoExport],
  );
  const handleInstallUpdate = useCallback(
    () => void installUpdate(),
    [installUpdate],
  );

  const binPropsRef = useRef<typeof binActions>(binActions);
  binPropsRef.current = binActions;
  const openProjectFileInEditorRef = useRef(openProjectFileInEditor);
  openProjectFileInEditorRef.current = openProjectFileInEditor;
  const binProps = useMemo(
    () => ({
      bin: normalizeProjectBin(project),
      compositionLibrary: project.compositionLibrary ?? [],
      selectedCompositionId: selectedPartId,
      createComposition: (
        ...args: Parameters<typeof binActions.createBinComposition>
      ) => binPropsRef.current.createBinComposition(...args),
      createFile: (...args: Parameters<typeof binActions.createBinFile>) =>
        binPropsRef.current.createBinFile(...args),
      createFolder: (...args: Parameters<typeof binActions.createBinFolder>) =>
        binPropsRef.current.createBinFolder(...args),
      createTimeline: (
        ...args: Parameters<typeof binActions.createBinTimeline>
      ) => binPropsRef.current.createBinTimeline(...args),
      deleteItem: (...args: Parameters<typeof binActions.deleteBinItem>) =>
        binPropsRef.current.deleteBinItem(...args),
      deleteItems: (...args: Parameters<typeof binActions.deleteBinItems>) =>
        binPropsRef.current.deleteBinItems(...args),
      dropFiles: (...args: Parameters<typeof binActions.dropBinFiles>) =>
        binPropsRef.current.dropBinFiles(...args),
      duplicateItem: (
        ...args: Parameters<typeof binActions.duplicateBinItem>
      ) => binPropsRef.current.duplicateBinItem(...args),
      duplicateItems: (
        ...args: Parameters<typeof binActions.duplicateBinItems>
      ) => binPropsRef.current.duplicateBinItems(...args),
      moveItem: (...args: Parameters<typeof binActions.moveBinItem>) =>
        binPropsRef.current.moveBinItem(...args),
      onOpenFile: (...args: Parameters<typeof openProjectFileInEditor>) =>
        openProjectFileInEditorRef.current(...args),
      renameItem: (...args: Parameters<typeof binActions.renameBinItem>) =>
        binPropsRef.current.renameBinItem(...args),
      revealItem: (...args: Parameters<typeof binActions.revealBinItem>) =>
        binPropsRef.current.revealBinItem(...args),
    }),
    [project, selectedPartId],
  );

  const framePreviewProps = useMemo(() => {
    return {
      cameraRef,
      dragBox: hasPreviewComposition && composeMode ? dragBox : null,
      dragSelectionBoxRef,
      framePickPoint:
        hasPreviewComposition && composeMode ? activeFramePickPoint : null,
      focusPicking:
        hasPreviewComposition &&
        (isPickingZoomFocus ||
          isPickingTranslationPosition ||
          Boolean(pointPickAdjustment)),
      trackerPicking:
        hasPreviewComposition && Boolean(trackerPickTranslationMarker),
      canSelectObjects:
        hasPreviewComposition && canSelectFrameObjects && !isPlaying,
      cameraTransform: cameraPreviewTransform,
      frameViewportRef,
      frameScale: displayFramePreviewScale,
      isPlaying,
      part,
      sceneMotionPart,
      sceneWrap,
      partStart: displayPartStart,
      previewParts,
      transitionPreviewParts,
      adjustmentLayers: visibleSceneAdjustmentLayers,
      transitionLayers: visibleSceneTransitionLayers,
      motionLayers,
      hiddenMotionLayerIds,
      compHidden: activeCompositionHidden,
      previewTime,
      sceneTime: adjustedSceneTime,
      timelineMode,
      pickingTranslationPosition:
        hasPreviewComposition &&
        (isPickingTranslationPosition || Boolean(pointPickAdjustment)),
      pickingZoomFocus:
        hasPreviewComposition &&
        (isPickingZoomFocus || Boolean(pointPickAdjustment)),
      previewSceneContext,
      activeCompositionHidden,
      selectedObjects:
        hasPreviewComposition && composeMode ? previewSelectionObjects : [],
      objectSnapGuides:
        hasPreviewComposition && composeMode ? objectSnapGuides : [],
      marqueeDragging: hasPreviewComposition && composeMode && marqueeDragging,
      editingTextObjectId:
        hasPreviewComposition && composeMode && !isPlaying
          ? editingTextObjectId
          : null,
      activeShapeTool: composeMode ? activeTool : null,
      shapeDrawPreview: composeMode ? shapeDrawPreview : null,
      onFramePointerCancel: composeDrawing.wrappedOnFramePointerCancel,
      onFramePointerDown: composeDrawing.wrappedOnFramePointerDown,
      onFramePointerDownCapture,
      onFramePointerMove: composeDrawing.wrappedOnFramePointerMove,
      onFramePointerLeave: composeDrawing.wrappedOnFramePointerLeave,
      onFramePointerUp: composeDrawing.wrappedOnFramePointerUp,
      onObjectPointerDown: startObjectDrag,
      onObjectContextMenu: openComposeObjectContextMenu,
      onObjectResizePointerDown: startObjectResize,
      onPathControlPointerDown: composeDrawing.handlePathControlPointerDown,
      onObjectCornerRadiusChange: composeDrawing.handleObjectCornerRadiusChange,
      onTextEditCommit: updateTextObjectContent,
      onTextEditEnd: composeDrawing.handleTextEditEnd,
      onTextPathOffsetChange: composeDrawing.updateTextPathOffset,
      onTextObjectDoubleClick: startTextObjectEdit,
      onTrackerTargetPick: commitTranslationTrackerPick,
    };
  }, [
    cameraRef,
    hasPreviewComposition,
    dragBox,
    dragSelectionBoxRef,
    activeFramePickPoint,
    isPickingZoomFocus,
    isPickingTranslationPosition,
    pointPickAdjustment,
    trackerPickTranslationMarker,
    canSelectFrameObjects,
    isPlaying,
    cameraPreviewTransform,
    frameViewportRef,
    displayFramePreviewScale,
    part,
    sceneMotionPart,
    sceneWrap,
    composeMode,
    displayPartStart,
    previewParts,
    transitionPreviewParts,
    visibleSceneAdjustmentLayers,
    visibleSceneTransitionLayers,
    previewTime,
    adjustedSceneTime,
    timelineMode,
    motionLayers,
    hiddenMotionLayerIds,
    activeCompositionHidden,
    previewSceneContext,
    previewSelectionObjects,
    objectSnapGuides,
    marqueeDragging,
    editingTextObjectId,
    activeTool,
    shapeDrawPreview,
    composeDrawing.wrappedOnFramePointerCancel,
    composeDrawing.wrappedOnFramePointerDown,
    onFramePointerDownCapture,
    composeDrawing.wrappedOnFramePointerMove,
    composeDrawing.wrappedOnFramePointerLeave,
    composeDrawing.wrappedOnFramePointerUp,
    startObjectDrag,
    openComposeObjectContextMenu,
    startObjectResize,
    composeDrawing.handlePathControlPointerDown,
    composeDrawing.handleObjectCornerRadiusChange,
    updateTextObjectContent,
    composeDrawing.handleTextEditEnd,
    composeDrawing.updateTextPathOffset,
    startTextObjectEdit,
    commitTranslationTrackerPick,
  ]);

  return (
    <>
      <main
        ref={appRootRef}
        className="relative grid h-screen bg-[#12141a] text-[#f7f7f8]"
        data-clipper-frame-presentation={presentationMode ?? undefined}
        style={appShellStyle}
        onPointerMove={presentationMode ? showPresentationControls : undefined}
      >
        <AppHeader
          lastSavedAt={lastSavedAt}
          projectName={project.name}
          projectNameDraft={projectNameDraft}
          renamingProject={renamingProject}
          sceneName={activeTimelineName}
          onCancelProjectRename={cancelProjectRename}
          onCloseProject={handleCloseProject}
          onCommitProjectRename={commitProjectRename}
          onExportOpen={openExportDialog}
          onOpenProject={openProjectAction}
          onProjectNameDraftChange={setProjectNameDraft}
          onProjectTitleContextMenu={openProjectTitleMenu}
          onSettingsOpen={openSettings}
        />

        <EditorWorkspace
          composeMode={composeMode}
          style={editorShellStyle}
          onPanelResizePointerDown={startEditorPanelResize}
        >
          <LeftSidebar
            composeMode={composeMode}
            effectsPanelState={project.editorState?.effectsPanelState}
            hasActiveComposition={hasActiveComposition}
            isPlaying={isPlaying}
            leftPanelTab={leftPanelTab}
            binProps={binProps}
            part={leftSidebarPart}
            selectedObjectIds={leftSidebarSelectedObjectIds}
            timelineMode={timelineMode}
            onEffectsPanelStateChange={updateEffectsPanelState}
            onLeftPanelTabChange={setLeftPanelTab}
            onReorderComposeObjects={reorderComposeObjects}
            onSelectComposeLayerObjects={selectComposeLayerObjects}
            onSelectComposeFrameSettings={selectComposeFrameSettings}
            onToggleComposeLayerHidden={toggleComposeLayerHidden}
            onToggleComposeLayerLocked={toggleComposeLayerLocked}
          />

          <CenterPreviewPane
            blankFrameViewportStyle={blankFrameViewportStyle}
            currentSceneTimeRef={currentSceneTimeRef}
            editorPaneProps={
              activeEditorDocument
                ? {
                    document: activeEditorDocument,
                    tabs: editorPaneTabs,
                    viewportState: activeEditorViewportState,
                    onCloseTab: closeEditorTab,
                    onRestoreClosedTab: restoreClosedEditorTab,
                    onSelectTab: selectEditorTab,
                    onPinTab: pinEditorTab,
                    onSourceChange: commitActiveEditorSource,
                    onViewportStateChange: updateEditorViewportState,
                    onRestoreRemovedFile: restoreRemovedEditorTabFile,
                  }
                : null
            }
            framePreviewProps={framePreviewProps}
            hasActiveComposition={hasPreviewComposition}
            liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
            mode={mode}
            previewFps={previewFps}
            previewKey={part.id}
            previewRenderScale={previewRenderScale}
            stageRef={centerPreviewScrollRef}
            onModeChange={handleModeChange}
            onScroll={saveCenterPreviewScroll}
            composeToolbarProps={
              composeMode && mode === "preview" && hasPreviewComposition
                ? {
                    activeTool,
                    onAddNullObject: composeDrawing.addNullObjectToFrameCenter,
                    onAddCodeObject: () => createComposeObject("code"),
                    onActiveToolChange: setActiveTool,
                    resizeMode: objectResizeMode,
                    onResizeModeChange: setObjectResizeMode,
                  }
                : null
            }
            playbackBarProps={{
              fastSelectEnabled,
              framePreviewScale,
              frameZoomBarOpen,
              frameZoomControlRef,
              isPlaying,
              playbackBorderScrubberRef,
              playbackDisplayDuration,
              playbackTimeLabelRef,
              scrubSnapEnabled,
              formatPlaybackTimeLabel,
              toPlaybackDisplayTime,
              jumpToEnd,
              jumpToNextPart,
              jumpToStart,
              pausePlaybackAtCurrentTime,
              pausePlaybackForTimelineScrub,
              resumePlaybackAfterTimelineScrub,
              scrubToPlaybackDisplayTime,
              setFastSelectEnabled,
              setScrubSnapEnabled,
              stepSceneTime,
              toggleFrameZoomBar,
              togglePlayback,
              updateFramePreviewScale,
            }}
          />

          {presentationMode ? (
            <PresentationControls
              controlsVisible={presentationControlsVisible}
              isPlaying={isPlaying}
              sceneDurationSeconds={sceneDurationSeconds}
              jumpToEnd={jumpToEnd}
              jumpToStart={jumpToStart}
              pausePlaybackForPresentationScrub={
                pausePlaybackForPresentationScrub
              }
              resumePlaybackAfterPresentationScrub={
                resumePlaybackAfterPresentationScrub
              }
              scrubPresentationTime={scrubPresentationTime}
              stepSceneTime={stepSceneTime}
              togglePlayback={togglePlayback}
            />
          ) : null}

          <RightInspectorPanel
            activeTab={rightPanelTab}
            validationErrors={validationErrors}
            onTabChange={setRightPanelTab}
          >
            <ConnectedInspectorContent
              rightPanelTab={rightPanelTab}
              part={part}
              composeMode={composeMode}
              selectedMotion={selectedMotion}
              selectedMotionPart={selectedMotionPart}
              selectedMotionMarkerCount={selectedMotionMarkers.length}
              selectedMotionSnapInActive={selectedMotionSnapInActive}
              selectedMotionSnapOutActive={selectedMotionSnapOutActive}
              selectedMotionPartMiddleSnapActive={
                selectedMotionPartMiddleSnapActive
              }
              selectedMotionPartMiddleEase={selectedMotionPartMiddleEase}
              selectedMotionPartMiddleTransitionMode={
                selectedMotionPartMiddleTransitionMode
              }
              focusPickMotionMarker={focusPickZoomMarker}
              canSnapMotionMiddle={Boolean(inspectorMotionMiddleSnap)}
              canSnapAdjustmentMiddle={Boolean(inspectorAdjustmentMiddleSnap)}
              canSnapCompositionMiddle={Boolean(inspectorCompositionMiddleSnap)}
              positionPickMotionMarker={positionPickTranslationMarker}
              trackerPickMotionMarker={trackerPickTranslationMarker}
              isPlaying={isPlaying}
              selectedObject={selectedObject}
              selectedAdjustmentLayer={selectedAdjustmentLayer}
              selectedTransitionLayer={
                (previewTransitionLayers ?? scene.transitionLayers)?.find(
                  (l) => l.id === selectedTransitionLayerId,
                ) ?? null
              }
              currentSceneTime={composeMode ? previewTime : currentSceneTime}
              sceneDurationSeconds={sceneDurationSeconds}
              pointPickAdjustment={pointPickAdjustment}
              selectedPart={selectedPart}
              onUpdateMotionMarker={updateMotionMarker}
              onPreviewMotionMarker={previewMotionMarker}
              onPreviewMotionPickPoint={previewMotionPickPoint}
              onMotionPreviewScrubStart={() =>
                setMotionEffectPreviewScrubActive(true)
              }
              onMotionPreviewScrubEnd={() =>
                setMotionEffectPreviewScrubActive(false)
              }
              onClearMotionPreview={() => {
                setMotionEffectPreviewScrubActive(false);
                clearMotionPreview();
                clearMotionPickPointPreview();
              }}
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
              onPreviewSelectedObject={previewSelectedObject}
              onUpdateAdjustmentLayer={updateAdjustmentLayer}
              onPreviewAdjustmentLayer={previewAdjustmentLayer}
              onClearAdjustmentPreview={clearAdjustmentPreview}
              onDeleteAdjustmentLayer={deleteAdjustmentLayer}
              onUpdateTransitionLayer={updateTransitionLayer}
              onPreviewTransitionLayer={previewTransitionLayer}
              onClearTransitionPreview={clearTransitionPreview}
              onDeleteTransitionLayer={(layerId) => {
                updateProject(
                  (current) => ({
                    ...current,
                    timelines: (current.timelines ?? []).map((timeline) =>
                      timeline.id === scene.id
                        ? {
                            ...timeline,
                            transitionLayers: (
                              timeline.transitionLayers ?? []
                            ).filter((l) => l.id !== layerId),
                          }
                        : timeline,
                    ),
                  }),
                  { history: true },
                );
                setSelectedTransitionLayerId(null);
                setSelectedTransitionLayers([]);
              }}
              onStartAdjustmentPointPick={startAdjustmentPointPick}
              onUpdateSelectedPartDuration={updateSelectedPartDuration}
              onUpdatePartFrame={updatePartFrame}
              onUpdatePartBackground={updatePartBackground}
              onPreviewPartFrame={previewPartFrame}
              onPreviewPartBackground={previewPartBackground}
              onUpdatePartRenderMode={updatePartRenderMode}
            />
          </RightInspectorPanel>
        </EditorWorkspace>

        <TimelineResizeHandle onPointerDown={startEditorPanelResize} />

        <TimelineProvider
          panelProps={{
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
            prerenderCacheCoverage: !composeMode
              ? visiblePrerenderCoverage
              : null,
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
              ? (project.editorState?.composeTimeline ??
                defaultTimelineViewportState)
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
            onScrub:
              composeMode && activeTimelinePart
                ? scrubComposePlaybackTime
                : scrubToSceneTime,
            onScrubStart: pausePlaybackOnScrub
              ? pausePlaybackForTimelineScrub
              : () => {},
            onScrubEnd: pausePlaybackOnScrub
              ? resumePlaybackAfterTimelineScrub
              : () => {},
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
            onMoveTransitionLayers: moveTransitionLayers,
            onShiftTimelineGapMarkers: shiftTimelineGapMarkers,
            onUpdateTransitionLayer: updateTransitionLayer,
            composeAnimationPart: hasActiveComposition ? part : null,
            selectedObjectIds: selectedComposeObjectIds,
            onExitCompose: () => updateTimelineMode("composition"),
            onInspectComposeObject: inspectComposeObject,
            onSelectComposeObjects: selectComposeLayerObjects,
            onPersistComposeSelection: persistComposeSelection,
            onRenameComposeAnimationLayer: renameComposeAnimationLayer,
            onUpdateComposeObject: updateComposeObject,
            setAppContextMenu,
          }}
        >
          <ConnectedTimelinePanel />
        </TimelineProvider>
      </main>
      <AppDialogs
        appContextMenu={appContextMenu}
        agentProvider={agentProvider}
        autoDownloadUpdates={autoDownloadUpdates}
        debugSettingsEnabled={debugSettingsEnabled}
        defaultNewMarkerDurationSeconds={markerDurationSeconds}
        exportDialogOpen={exportDialogOpen}
        exportFrameRate={exportFrameRate}
        exportProgress={exportProgress}
        exportRenderQuality={exportRenderQuality}
        exportResolution={exportResolution}
        exportTileMapping={exportTileMapping}
        exportWorkerConfigurationMode={exportWorkerConfigurationMode}
        exportWorkerMapping={exportWorkerMapping}
        isExporting={isExporting}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        mediaExportFormat={mediaExportFormat}
        mediaExportRenderMode={mediaExportRenderMode}
        stableSlowGridPreset={stableSlowGridPreset}
        stableSlowValidationSamples={stableSlowValidationSamples}
        pausePlaybackOnScrub={pausePlaybackOnScrub}
        partCount={scene.compositions.length}
        prerenderCacheEnabled={prerenderCacheEnabled}
        prerenderCacheBlackMissDebug={prerenderCacheBlackMissDebug}
        prerenderBlockDurationMs={prerenderBlockDurationMs}
        previewRenderHeight={previewRenderHeight}
        playbackFpsOption={playbackFpsOption}
        projectName={project.name}
        resolution={project.resolution}
        reusePrerenderCacheForExport={reusePrerenderCacheForExport}
        sceneDurationSeconds={sceneDurationSeconds}
        sceneName={activeTimelineName}
        scrubCommitThrottleMs={scrubCommitThrottleMs}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        timelineEndPaddingFraction={timelineEndPaddingFraction}
        timelinePrecision={timelinePrecision}
        videoExportCancelling={videoExportCancelling}
        videoExportTileHeight={videoExportTileHeight}
        videoExportProgress={videoExportProgress}
        updateStatus={updateStatus}
        onAppContextMenuClose={closeAppContextMenu}
        onAgentProviderChange={setAgentProvider}
        onAutoDownloadUpdatesChange={handleAutoDownloadUpdatesChange}
        onCheckForUpdates={handleCheckForUpdates}
        onDownloadUpdate={handleDownloadUpdate}
        onDebugSettingsEnabledChange={setDebugSettingsEnabled}
        onDefaultNewMarkerDurationSecondsChange={
          setDefaultNewMarkerDurationSeconds
        }
        onExportDialogOpenChange={setExportDialogOpen}
        onExportFrameRateChange={setExportFrameRate}
        onExportRenderQualityChange={setExportRenderQuality}
        onExportResolutionChange={setExportResolution}
        onExportTileMappingChange={setExportTileMapping}
        onExportWorkerConfigurationModeChange={setExportWorkerConfigurationMode}
        onExportWorkerMappingChange={setExportWorkerMapping}
        onMediaExport={handleMediaExport}
        onMediaExportFormatChange={setMediaExportFormat}
        onMediaExportRenderModeChange={setMediaExportRenderMode}
        onStableSlowGridPresetChange={setStableSlowGridPreset}
        onStableSlowValidationSamplesChange={setStableSlowValidationSamples}
        onLiveDomPostProcessMaxFpsChange={setLiveDomPostProcessMaxFps}
        onPausePlaybackOnScrubChange={setPausePlaybackOnScrub}
        onPrerenderCacheEnabledChange={setPrerenderCacheEnabled}
        onPrerenderCacheBlackMissDebugChange={setPrerenderCacheBlackMissDebug}
        onPrerenderBlockDurationMsChange={setPrerenderBlockDurationMs}
        onPreviewRenderHeightChange={setPreviewRenderHeight}
        onPlaybackFpsOptionChange={setPlaybackFpsOption}
        onClearAllPrerenderCaches={handleClearAllPrerenderCaches}
        onReusePrerenderCacheForExportChange={setReusePrerenderCacheForExport}
        onScrubCommitThrottleMsChange={setScrubCommitThrottleMs}
        onSettingsOpenChange={setSettingsOpen}
        onSettingsSectionChange={setSettingsSection}
        onTimelineEndPaddingFractionChange={setTimelineEndPaddingFraction}
        onTimelinePrecisionChange={setTimelinePrecision}
        onVideoExportTileHeightChange={setVideoExportTileHeight}
        onVideoExportCancel={handleVideoExportCancel}
        onInstallUpdate={handleInstallUpdate}
      />
      <FindMediaDialog
        findMediaRequest={findMediaRequest}
        onFindCompositionMedia={binActions.findCompositionMedia}
        onFindMediaRequestChange={setFindMediaRequest}
      />
    </>
  );
}

function getManualPrerenderRangesForComposition(
  compositions: CompositionClip[],
  compositionId: string,
  sceneDuration: number,
  timelineLayers: TimelineLayerState | undefined,
): PrerenderManualCompositionRange[] {
  const boundaries = new Set<number>([0, sceneDuration]);
  for (const composition of compositions) {
    const start = Math.max(composition.start ?? 0, 0);
    const end = Math.min(start + composition.duration, sceneDuration);
    if (end <= start) continue;
    boundaries.add(start);
    boundaries.add(end);
  }
  const sorted = [...boundaries].sort((left, right) => left - right);
  const ranges: PrerenderManualCompositionRange[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const top = getTopTimelinePartAtTime(
      getCompositionTimelineRanges(compositions),
      start + (end - start) / 2,
      timelineLayers,
    );
    if (!top || !compositionMatchesManualPrerenderId(top, compositionId))
      continue;
    const key = top.id;
    const last = ranges[ranges.length - 1];
    if (last && last.compositionId === key && Math.abs(last.end - start) < 1e-6)
      last.end = end;
    else ranges.push({ compositionId: key, start, end });
  }
  return ranges;
}

function getCompositionTimelineRanges(compositions: CompositionClip[]) {
  return compositions.map((composition) => {
    const start = composition.start ?? 0;
    return { ...composition, start, end: start + composition.duration };
  });
}

function getManualPrerenderRangesForMarkedCompositions(
  compositions: CompositionClip[],
  sceneDuration: number,
  timelineLayers: TimelineLayerState | undefined,
) {
  const markedIds = new Set(
    compositions
      .filter((composition) => composition.prerender)
      .map((composition) => composition.id),
  );
  return mergeManualPrerenderRanges(
    [...markedIds].flatMap((compositionId) =>
      getManualPrerenderRangesForComposition(
        compositions,
        compositionId,
        sceneDuration,
        timelineLayers,
      ),
    ),
  );
}

function compositionMatchesManualPrerenderId(
  composition: CompositionClip,
  compositionId: string,
) {
  return compositionMatchesIdentity(composition, compositionId);
}

function filterPrerenderCoverageToRanges(
  coverage: {
    blocks: Array<{
      start: number;
      duration: number;
      state: "enqueued" | "queued" | "cached";
    }>;
  },
  ranges: PrerenderManualCompositionRange[],
) {
  const clippedBlocks = coverage.blocks.flatMap((block) => {
    const blockEnd = block.start + block.duration;
    return ranges.flatMap((range) => {
      const start = Math.max(block.start, range.start);
      const end = Math.min(blockEnd, range.end);
      return end > start ? [{ ...block, start, duration: end - start }] : [];
    });
  });
  const covered = clippedBlocks.some((block) => block.state !== "enqueued");
  return {
    blocks: covered
      ? clippedBlocks
      : ranges.map((range) => ({
          start: range.start,
          duration: range.end - range.start,
          state: "enqueued" as const,
        })),
  };
}

function mergeManualPrerenderRanges(ranges: PrerenderManualCompositionRange[]) {
  const sorted = ranges
    .slice()
    .sort(
      (left, right) =>
        left.compositionId.localeCompare(right.compositionId) ||
        left.start - right.start,
    );
  const merged: PrerenderManualCompositionRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (
      !last ||
      last.compositionId !== range.compositionId ||
      range.start > last.end
    ) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged;
}
