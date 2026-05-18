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
import {
  usePrerenderCache,
  type PrerenderManualCompositionRange,
} from "./app/features/preview/usePrerenderCache";
import { usePresentationController } from "./app/features/presentation/usePresentationController";
import {
  isEditorTarget,
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
import {
  compositionMatchesIdentity,
  resolveCanonicalComposition,
} from "./app/features/file-manager/compositionIdentity";
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
import { useFrameObjectCommands } from "./app/features/frame-interactions/useFrameObjectCommands";
import { useAdjustmentLayerCommands } from "./app/features/timeline/useAdjustmentLayerCommands";
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
import { usePenDraftShortcuts } from "./app/features/compose/usePenDraftShortcuts";
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
import { useProjectTitleRename } from "./app/shell/useProjectTitleRename";
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
import { useExportSettings } from "./app/features/export/useExportSettings";
import {
  appSettingKeys,
  clampLiveDomPostProcessMaxFps,
  clampPrerenderBlockDurationMs,
  getInitialLiveDomPostProcessMaxFps,
  getInitialPrerenderBlockDurationMs,
  isDebugSettingsEnabledByDefault,
  isPrerenderCacheBlackMissDebugEnabledByDefault,
  isPrerenderCacheEnabledByDefault,
  isPrerenderCacheReuseEnabledByDefault,
  readStoredAppSettings,
  readStoredBooleanSetting,
  readStoredStringSetting,
  writeStoredAppSetting,
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
import {
  getMasterTimelineClockSnapshot,
  subscribeMasterTimelineClock,
} from "./app/features/playback/playbackTimeStore";
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
import {
  applyAdjustmentLayersToVisualStyle,
  getTimeSensitiveDisplayDuration,
} from "./core/adjustments";
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
import { type FillValue, fillValueToCss, isFillValue } from "./core/fillValue";
import { clamp, roundToPrecision, roundTenth } from "./core/math";
import type {
  AdjustmentEffectPointControl,
  AdjustmentVisualOverlay,
} from "./core/effects/types";
import { getTransitionEffectPackage } from "./core/effects/registry";
import { normalizeSymmetricTransitionLayer } from "./core/transitions";
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
  type BackgroundLayer,
  type Bounds,
  type CompositionClip,
  type EditorState,
  type FrameObject,
  type LayerAnimation,
  type MotionEffectKind,
  type Part,
  type PartFrame,
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
  const currentSceneTimeRef = useRef(currentSceneTime);
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
  // Mirror the structural editor-store currentSceneTime into the ref so
  // event-handler reads stay accurate at preview-key boundaries.
  useEffect(() => {
    currentSceneTimeRef.current = currentSceneTime;
  }, [currentSceneTime]);
  // Subscribe to the master timeline clock and update the ref imperatively on
  // every tick (no setState, no React rerender). Event handlers that read
  // currentSceneTimeRef.current during playback get the live time, while
  // AppContent itself is unaffected.
  useEffect(() => {
    return subscribeMasterTimelineClock(() => {
      const snap = getMasterTimelineClockSnapshot();
      if (snap.source !== "playback" && snap.source !== "scrub") return;
      currentSceneTimeRef.current = snap.sceneTime;
    });
  }, []);

  useEffect(() => {
    function blurPointerFocusedControl(event: PointerEvent) {
      if (event.pointerType === "keyboard") return;
      const target = event.target as HTMLElement | null;
      const control = target?.closest(
        "button, [role='button'], [role='switch'], [role='checkbox'], [role='combobox'], [data-radix-select-trigger]",
      ) as HTMLElement | null;
      if (!control || isTextEditingTarget(control)) return;
      requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active === control || control.contains(active)))
          active.blur();
      });
    }

    document.addEventListener("pointerup", blurPointerFocusedControl, true);
    document.addEventListener("click", blurPointerFocusedControl, true);
    return () => {
      document.removeEventListener(
        "pointerup",
        blurPointerFocusedControl,
        true,
      );
      document.removeEventListener("click", blurPointerFocusedControl, true);
    };
  }, []);
  const [prerenderBlockDurationMs, setPrerenderBlockDurationMsState] = useState(
    getInitialPrerenderBlockDurationMs,
  );
  const [prerenderCacheResetToken, setPrerenderCacheResetToken] = useState(0);
  const {
    autoDownloadUpdates,
    updateStatus,
    setAutoDownloadUpdates,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useAppUpdates();

  useEffect(() => {
    let cancelled = false;
    void readStoredAppSettings().then((settings) => {
      if (cancelled) return;
      setPrerenderBlockDurationMsState(
        clampPrerenderBlockDurationMs(
          Number.parseInt(
            readStoredStringSetting(
              settings,
              appSettingKeys.prerenderBlockDurationMs,
            ) ?? "",
            10,
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const pendingAdjustmentPreviewRef = useRef<AdjustmentLayer[] | null>(null);
  const adjustmentPreviewFrameRef = useRef(0);
  const pendingTransitionPreviewRef = useRef<TransitionLayer[] | null>(null);
  const transitionPreviewFrameRef = useRef(0);
  const [previewTransitionLayers, setPreviewTransitionLayers] = useState<
    TransitionLayer[] | null
  >(null);
  const timelineModeRef = useRef(timelineMode);
  const frameInteractionControllerRef =
    useRef<FrameInteractionController | null>(null);

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

  function previewAdjustmentLayer(
    layerId: string,
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) {
    const nextLayers = visibleSceneAdjustmentLayers.map((layer) =>
      layer.id === layerId ? updater(layer) : layer,
    );
    pendingAdjustmentPreviewRef.current = nextLayers;
    if (adjustmentPreviewFrameRef.current) return;
    adjustmentPreviewFrameRef.current = requestAnimationFrame(() => {
      adjustmentPreviewFrameRef.current = 0;
      const layers = pendingAdjustmentPreviewRef.current;
      if (!layers) return;
      window.dispatchEvent(
        new CustomEvent("clipper:preview-postprocess-adjustment", {
          detail: { layers },
        }),
      );
      applyAdjustmentPreviewDom(
        applyAdjustmentLayersToVisualStyle(currentSceneTimeRef.current, layers),
      );
    });
  }

  function clearAdjustmentPreview() {
    pendingAdjustmentPreviewRef.current = null;
    window.dispatchEvent(
      new CustomEvent("clipper:preview-postprocess-adjustment", {
        detail: { layers: null },
      }),
    );
    if (adjustmentPreviewFrameRef.current) {
      cancelAnimationFrame(adjustmentPreviewFrameRef.current);
      adjustmentPreviewFrameRef.current = 0;
    }
  }

  function previewTransitionLayer(
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) {
    const nextLayers = visibleSceneTransitionLayers.map((layer) =>
      layer.id === layerId ? updater(layer) : layer,
    );
    pendingTransitionPreviewRef.current = nextLayers;
    if (transitionPreviewFrameRef.current) return;
    transitionPreviewFrameRef.current = requestAnimationFrame(() => {
      transitionPreviewFrameRef.current = 0;
      const layers = pendingTransitionPreviewRef.current;
      if (!layers) return;
      setPreviewTransitionLayers(layers);
    });
  }

  function clearTransitionPreview() {
    pendingTransitionPreviewRef.current = null;
    setPreviewTransitionLayers(null);
    if (transitionPreviewFrameRef.current) {
      cancelAnimationFrame(transitionPreviewFrameRef.current);
      transitionPreviewFrameRef.current = 0;
    }
  }

  function applyAdjustmentPreviewDom(
    style: ReturnType<typeof applyAdjustmentLayersToVisualStyle>,
  ) {
    const visualElement = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-visual-adjustments]",
    );
    if (visualElement) {
      if (style.filter) visualElement.style.filter = style.filter;
      else visualElement.style.removeProperty("filter");
    }
    syncAdjustmentPreviewOverlays(
      "frame",
      style.overlays?.filter((overlay) => overlay.target === "frame"),
    );
    syncAdjustmentPreviewOverlays(
      "camera",
      style.overlays?.filter(
        (overlay) => (overlay.target ?? "camera") === "camera",
      ),
    );
  }

  function syncAdjustmentPreviewOverlays(
    target: "frame" | "camera",
    overlays: AdjustmentVisualOverlay[] | undefined,
  ) {
    const container = frameViewportRef.current?.querySelector<HTMLElement>(
      `[data-clipper-visual-adjustment-overlays="${target}"]`,
    );
    if (!container) return;
    container.replaceChildren(
      ...(overlays ?? []).map((overlay) => {
        const element = document.createElement("div");
        element.className = "pointer-events-none absolute inset-0";
        element.style.zIndex = "2147483647";
        Object.assign(element.style, overlay.style);
        return element;
      }),
    );
  }

  function cssStylePropertyName(key: string) {
    return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  function cssEscape(value: string) {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(value)
      : value.replace(/"/g, '\\"');
  }

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
  function setPrerenderBlockDurationMs(value: number) {
    const nextValue = clampPrerenderBlockDurationMs(value);
    setPrerenderBlockDurationMsState(nextValue);
    writeStoredAppSetting(
      appSettingKeys.prerenderBlockDurationMs,
      String(nextValue),
    );
    setPrerenderCacheResetToken((token) => token + 1);
    void clipperHost.clearPrerenderCache(activeProjectManifestPath);
  }
  async function clearAllPrerenderCaches() {
    try {
      const result = await clipperHost.clearAllPrerenderCaches();
      await clipperHost.clearPrerenderCache(activeProjectManifestPath);
      setPrerenderCacheResetToken((token) => token + 1);
      toast.success(
        `Cleared prerender caches for ${result.clearedCount} project${result.clearedCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to clear prerender caches.",
      );
    }
  }
  async function togglePrerenderCompositionFromLibrary(compositionId: string) {
    const isTimelineClipTarget = scene.compositions.some(
      (composition) => composition.id === compositionId,
    );
    const sourceComposition = resolveCanonicalComposition(
      compositionLibrary,
      scene.compositions,
      compositionId,
    );
    const sourceId =
      sourceComposition?.compositionId ??
      sourceComposition?.id ??
      compositionId;
    const matchingTimelineClips = scene.compositions.filter((composition) =>
      compositionMatchesManualPrerenderId(composition, compositionId),
    );
    const currentlyMarked =
      matchingTimelineClips.length > 0
        ? matchingTimelineClips.every((composition) => composition.prerender)
        : manualPrerenderCompositionIds.has(sourceId);
    if (currentlyMarked) {
      implicitFileOperation(setCompositionPrerenderMark)(
        compositionId,
        false,
        isTimelineClipTarget ? compositionId : undefined,
      );
      return;
    }
    implicitFileOperation(setCompositionPrerenderMark)(
      compositionId,
      true,
      isTimelineClipTarget ? compositionId : undefined,
    );
    const result = await prerenderCache.prerenderComposition(compositionId);
    if (
      result.visibleRanges === 0 ||
      result.queuedBlocks === 0 ||
      !result.completed
    )
      return;
  }
  function setCompositionPrerenderMark(
    compositionId: string,
    marked: boolean,
    timelineClipId?: string,
  ) {
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                clips: timeline.clips.map((clip) => {
                  const matchesClip = timelineClipId
                    ? clip.id === timelineClipId
                    : clip.compositionId === compositionId ||
                      clip.id === compositionId;
                  return matchesClip
                    ? { ...clip, prerender: marked || undefined }
                    : clip;
                }),
              }
            : timeline,
        ),
      }),
      { history: true },
    );
  }
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

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    function openFindMediaDialog(event: Event) {
      const detail = (event as CustomEvent<BinFindMediaDetail>).detail;
      if (!detail?.compositionId || !detail.fileName) return;
      setFindMediaRequest(detail);
    }

    window.addEventListener(binFindMediaEvent, openFindMediaDialog);
    const pending = consumePendingBinFindMedia();
    if (pending) setFindMediaRequest(pending);
    return () =>
      window.removeEventListener(binFindMediaEvent, openFindMediaDialog);
  }, []);

  useEffect(() => {
    timelineModeRef.current = timelineMode;
  }, [timelineMode]);

  useEffect(() => {
    const stage = centerPreviewScrollRef.current;
    if (!stage || mode !== "preview") return;
    stage.addEventListener("wheel", zoomFramePreviewFromWheel, {
      passive: false,
    });
    return () => stage.removeEventListener("wheel", zoomFramePreviewFromWheel);
  }, [mode, zoomFramePreviewAtPoint]);

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
      pausePlaybackOnScrub,
      preview: {
        ...(state.preview ?? defaultPreviewViewportState),
        scale: framePreviewScale,
        zoomBarOpen: frameZoomBarOpen,
      },
    }));
  }, [
    framePreviewScale,
    frameZoomBarOpen,
    leftPanelTab,
    markerDurationSeconds,
    mode,
    pausePlaybackOnScrub,
    rightPanelTab,
    selectedMotionMarker,
    selectedPartId,
    selectedSceneId,
    timelineEndPaddingFraction,
    timelinePrecision,
    timelineMode,
  ]);

  useSettingsShortcut({ setSettingsOpen });

  useEffect(
    () => () => {
      if (framePickFrameRef.current)
        cancelAnimationFrame(framePickFrameRef.current);
      if (dragBoxFrameRef.current)
        cancelAnimationFrame(dragBoxFrameRef.current);
      if (objectDragFrameRef.current)
        cancelAnimationFrame(objectDragFrameRef.current);
      if (cameraPreviewFrameRef.current)
        cancelAnimationFrame(cameraPreviewFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    setSourceStatus(initialSourceStatus);
  }, [initialSourceStatus]);

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
    if (timelineMode === "compose") return;
    clearObjectDrag();
    clearDragBox();
  }, [timelineMode]);

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

  useEffect(() => {
    const pendingIds = pendingComposeSelectionObjectIdsRef.current;
    if (pendingIds.length === 0) return;
    const pendingObjects = pendingIds
      .map((id) =>
        id === part.background.id
          ? frameObjectFromBackgroundLayer(part.background)
          : (part.background.elements.find((object) => object.id === id) ??
            part.objects.find((object) => object.id === id)),
      )
      .filter((object): object is FrameObject => Boolean(object));
    if (pendingObjects.length !== pendingIds.length) return;
    pendingComposeSelectionObjectIdsRef.current = [];
    setComposeSelectionObjects(pendingObjects);
  }, [part.background, part.background.elements, part.objects]);

  const hydratedComposeSelectionFromProjectRef = useRef(false);
  useEffect(() => {
    hydratedComposeSelectionFromProjectRef.current = false;
  }, [part.id]);
  useEffect(() => {
    if (
      hydratedComposeSelectionFromProjectRef.current ||
      timelineMode !== "compose" ||
      selectionPayload?.objects.length ||
      selectedObjectId ||
      selectedComposeObjectIds.length > 0
    )
      return;
    const persistedIds = project.editorState?.selectedComposeObjectIds ?? [];
    if (persistedIds.length === 0) {
      hydratedComposeSelectionFromProjectRef.current = true;
      return;
    }
    const selectedIds = persistedIds.filter(
      (id) =>
        id === part.background.id ||
        part.background.elements.some((object) => object.id === id) ||
        part.objects.some((object) => object.id === id),
    );
    if (selectedIds.length === 0) return;
    const selectedObjects = selectedIds
      .map((id) =>
        id === part.background.id
          ? frameObjectFromBackgroundLayer(part.background)
          : (part.background.elements.find((object) => object.id === id) ??
            part.objects.find((object) => object.id === id)),
      )
      .filter((object): object is FrameObject => Boolean(object));
    if (selectedObjects.length === 0) return;
    hydratedComposeSelectionFromProjectRef.current = true;
    setComposeSelectionObjects(selectedObjects);
  }, [
    part.objects,
    project.editorState?.selectedComposeObjectIds,
    selectedObjectId,
    selectedComposeObjectIds,
    selectionPayload,
    timelineMode,
  ]);

  useEffect(() => {
    function clearFrameSelectionOnOutsidePointer(
      event: globalThis.PointerEvent,
    ) {
      const target = event.target as HTMLElement | null;
      if (
        isEditorTarget(target) ||
        isInspectorTarget(target) ||
        isSelectPopoverTarget(target) ||
        isComposeLayersTarget(target) ||
        isTimelineTarget(target)
      )
        return;
      if (frameViewportRef.current?.contains(event.target as Node)) return;
      if (timelineMode === "compose" && isPreviewStageTarget(target))
        setComposeSelectionObjects([]);
      setEditingTextObjectId(null);
      clearObjectDrag();
      clearDragBox();
    }

    window.addEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
    return () =>
      window.removeEventListener(
        "pointerdown",
        clearFrameSelectionOnOutsidePointer,
      );
  }, [timelineMode, updateEditorState]);

  useEffect(() => {
    if (!marqueeDragging) return;

    function clearMarqueeAfterPointerRelease() {
      if (objectDragRef.current) return;
      requestAnimationFrame(() => clearDragBox());
    }

    window.addEventListener("pointerup", clearMarqueeAfterPointerRelease);
    window.addEventListener("pointercancel", clearMarqueeAfterPointerRelease);
    return () => {
      window.removeEventListener("pointerup", clearMarqueeAfterPointerRelease);
      window.removeEventListener(
        "pointercancel",
        clearMarqueeAfterPointerRelease,
      );
    };
  }, [marqueeDragging]);

  useEffect(() => {
    function syncObjectResizeAspectPreview(event: KeyboardEvent) {
      if (event.key !== "Shift" || !objectResizeRef.current) return;
      frameInteractionControllerRef.current?.syncObjectResizeAspectPreview(
        event.type === "keydown",
      );
    }

    window.addEventListener("keydown", syncObjectResizeAspectPreview);
    window.addEventListener("keyup", syncObjectResizeAspectPreview);
    return () => {
      window.removeEventListener("keydown", syncObjectResizeAspectPreview);
      window.removeEventListener("keyup", syncObjectResizeAspectPreview);
    };
  }, []);

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

  function moveAdjustmentLayers(
    moves: Array<{ layerId: string; start: number; targetLayerId?: string }>,
  ) {
    const moveById = new Map(moves.map((move) => [move.layerId, move]));
    updateSceneAdjustmentLayers((layers) =>
      layers.map((layer) => {
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

  function updateTransitionLayer(
    layerId: string,
    updater: (
      layer: import("./core/types").TransitionLayer,
    ) => import("./core/types").TransitionLayer,
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

  function previewSelectedObject(
    updater: (object: FrameObject) => FrameObject,
  ) {
    const source = selectedObject;
    if (!source) return;
    const next = updater(source);
    const selector =
      next.id === part.background.id
        ? `[data-layer-id="${cssEscape(next.id)}"]`
        : `[data-clipper-render-object-id="${cssEscape(next.id)}"]`;
    const target =
      frameViewportRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.style.left = `${next.bounds.x}px`;
    target.style.top = `${next.bounds.y}px`;
    target.style.width = `${next.bounds.width}px`;
    target.style.height = `${next.bounds.height}px`;
    window.dispatchEvent(
      new CustomEvent("clipper:object-preview-bounds", {
        detail: { bounds: next.bounds, objectId: next.id },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("clipper:object-preview-stroke", {
        detail: { stroke: next.stroke ?? null, objectId: next.id },
      }),
    );
    for (const [key, value] of Object.entries(next.style)) {
      if (value === undefined)
        target.style.removeProperty(cssStylePropertyName(key));
      else if (key === "backgroundColor" && isFillValue(value)) {
        const fill = value as unknown as FillValue;
        if (fill.mode === "gradient") {
          target.style.setProperty("background-color", "transparent");
          target.style.setProperty("background-image", fillValueToCss(fill));
        } else {
          target.style.setProperty("background-color", fillValueToCss(fill));
          target.style.setProperty("background-image", "none");
        }
      } else
        target.style.setProperty(
          cssStylePropertyName(key),
          formatPreviewStyleValue(key, value),
        );
    }
    if (next.transform && typeof next.transform === "object") {
      const t = next.transform as Record<string, unknown>;
      const parts: string[] = [];
      const pushTransform = (key: string, unit: string) => {
        const v = t[key];
        if (typeof v === "number" && Number.isFinite(v))
          parts.push(`${key}(${v}${unit})`);
      };
      pushTransform("perspective", "px");
      pushTransform("translateX", "px");
      pushTransform("translateY", "px");
      pushTransform("translateZ", "px");
      pushTransform("scale", "");
      pushTransform("scaleX", "");
      pushTransform("scaleY", "");
      pushTransform("rotate", "deg");
      pushTransform("rotateX", "deg");
      pushTransform("rotateY", "deg");
      pushTransform("rotateZ", "deg");
      pushTransform("skewX", "deg");
      pushTransform("skewY", "deg");
      target.style.transform = parts.length ? parts.join(" ") : "";
    }
    if (next.shadow) {
      const shadow = next.shadow;
      if (shadow.enabled === false) {
        target.style.removeProperty("filter");
        target.style.removeProperty("text-shadow");
        target.style.removeProperty("box-shadow");
      } else {
        applyPreviewShadowStyle(target, next);
      }
    }
  }

  function applyPreviewShadowStyle(target: HTMLElement, object: FrameObject) {
    const shadow = object.shadow;
    if (!shadow || shadow.enabled === false) return;
    const x =
      typeof shadow.x === "number" && Number.isFinite(shadow.x) ? shadow.x : 0;
    const y =
      typeof shadow.y === "number" && Number.isFinite(shadow.y) ? shadow.y : 0;
    const blur =
      typeof shadow.blur === "number" && Number.isFinite(shadow.blur)
        ? Math.max(0, shadow.blur)
        : 0;
    const spread =
      typeof shadow.spread === "number" && Number.isFinite(shadow.spread)
        ? Math.max(0, Math.min(64, shadow.spread))
        : 0;
    const color = typeof shadow.color === "string" ? shadow.color : "#000000";
    const alpha = typeof shadow.alpha === "number" ? shadow.alpha : 100;
    const rgba = previewShadowRgba(color, alpha);
    if (!rgba) return;
    target.style.removeProperty("filter");
    target.style.removeProperty("text-shadow");
    target.style.removeProperty("box-shadow");
    if (object.type === "rect" || object.type === "pattern2d") {
      target.style.boxShadow =
        x.toFixed(2) +
        "px " +
        y.toFixed(2) +
        "px " +
        blur.toFixed(2) +
        "px " +
        spread.toFixed(2) +
        "px " +
        rgba;
    } else {
      target.style.filter =
        "drop-shadow(" +
        x.toFixed(2) +
        "px " +
        y.toFixed(2) +
        "px " +
        blur.toFixed(2) +
        "px " +
        rgba +
        ")";
    }
  }

  function previewShadowRgba(color: string, alphaPct: number) {
    const hex = color.startsWith("#") ? color.slice(1) : color;
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((channel) => channel + channel)
            .join("")
        : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alphaPct / 100));
    return "rgba(" + r + ", " + g + ", " + b + ", " + a.toFixed(2) + ")";
  }

  function formatPreviewStyleValue(key: string, value: string | number) {
    if (typeof value !== "number" || !Number.isFinite(value))
      return String(value);
    if (key === "fontSize")
      return `calc(${value}px * var(--clipper-scale-preview, 1))`;
    return lengthPreviewStyleKeys.has(key) ? `${value}px` : String(value);
  }

  const lengthPreviewStyleKeys = new Set([
    "borderRadius",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
    "fontSize",
    "letterSpacing",
  ]);

  function previewPartFrame(updater: (frame: PartFrame) => PartFrame) {
    const next = updater(part.frame);
    const target = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-frame-content]",
    );
    const background = next.style.background;
    if (target && background !== undefined)
      target.style.background = String(background);
  }

  function previewPartBackground(
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) {
    const next = updater(part.background);
    const target = frameViewportRef.current?.querySelector<HTMLElement>(
      `[data-layer-id="${cssEscape(next.id)}"] > div`,
    );
    const background = next.style.background;
    if (target && background !== undefined)
      target.style.background = String(background);
  }

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

  useComposeToolShortcuts({
    activeTool,
    activeToolRef,
    composeMode,
    hasPreviewComposition,
    mode,
    addNullObjectToFrameCenter,
    setActiveTool,
    setObjectResizeMode,
  });

  useActiveToolCleanup({
    activeTool,
    pathDraftRef,
    shapeDrawPreviewRef,
    setShapeDrawPreview,
  });

  function addNullObjectToFrameCenter() {
    if (!part) return;
    const size = 80;
    const id = `null-${Date.now().toString(36)}`;
    const object: FrameObject = {
      id,
      name: "Null object",
      type: "null",
      selector: `[data-object-id='${id}']`,
      bounds: {
        x: Math.round((FRAME_WIDTH - size) / 2),
        y: Math.round((FRAME_HEIGHT - size) / 2),
        width: size,
        height: size,
      },
      style: {
        background: "transparent",
      },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    pendingComposeSelectionObjectIdsRef.current = [object.id];
    persistComposeSelection([object.id]);
    activeToolRef.current = null;
    setActiveTool(null);
  }

  function createTextObjectAtPoint(point: Point) {
    if (!part) return;
    const width = 440;
    const height = 120;
    const id = `text-${Date.now().toString(36)}`;
    const object: FrameObject = {
      id,
      name: "Text",
      type: "text",
      selector: `[data-object-id='${id}']`,
      bounds: {
        x: Math.round(point.x),
        y: Math.round(point.y),
        width,
        height,
      },
      content: "Text",
      style: {
        color: "#ffffff",
        fontSize: 72,
        fontWeight: 400,
        lineHeight: 1.1,
      },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    pendingComposeSelectionObjectIdsRef.current = [object.id];
    persistComposeSelection([object.id]);
    setEditingTextObjectId(object.id);
  }

  usePenDraftShortcuts({
    pathDraftRef,
    shapeDrawPreviewRef,
    commitPathDraftObject,
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

  function updateComposeDrawSnapGuides(guides: ObjectSnapGuide[]) {
    const current = objectSnapGuidesRef.current;
    if (
      current.length === guides.length &&
      current.every(
        (guide, index) =>
          guide.axis === guides[index]?.axis &&
          guide.position === guides[index]?.position,
      )
    )
      return;
    objectSnapGuidesRef.current = guides;
    setObjectSnapGuides(guides);
  }

  function clearComposeDrawSnapGuides() {
    if (objectSnapGuidesRef.current.length === 0) return;
    objectSnapGuidesRef.current = [];
    setObjectSnapGuides([]);
  }

  function getShapeDrawSnapEnd(
    start: Point,
    end: Point,
    constrain: boolean,
  ): Point {
    if (!part) return end;
    const bounds = computeShapeDrawBox(start, end, constrain);
    const stops = getFrameObjectSnapStops([
      ...part.background.elements,
      ...part.objects,
    ]);
    const threshold =
      8 /
      Math.max(displayFramePreviewScale * cameraPreviewTransform.scale, 0.001);
    const xSnap = getDrawAxisSnap(
      [
        {
          position: end.x >= start.x ? bounds.x + bounds.width : bounds.x,
          influence: 1,
        },
        { position: bounds.x + bounds.width / 2, influence: 0.5 },
      ],
      stops.x,
      threshold,
    );
    const ySnap = getDrawAxisSnap(
      [
        {
          position: end.y >= start.y ? bounds.y + bounds.height : bounds.y,
          influence: 1,
        },
        { position: bounds.y + bounds.height / 2, influence: 0.5 },
      ],
      stops.y,
      threshold,
    );
    const guides: ObjectSnapGuide[] = [];
    if (xSnap) guides.push({ axis: "x", position: xSnap.position });
    if (ySnap) guides.push({ axis: "y", position: ySnap.position });
    updateComposeDrawSnapGuides(guides);
    return {
      x: end.x + (xSnap?.endOffset ?? 0),
      y: end.y + (ySnap?.endOffset ?? 0),
    };
  }

  function commitPathDraftObject(draft: PathDraft) {
    if (!part || draft.segments.length === 0) return;
    const { bounds, path } = getPenPathData(draft.segments, draft.closed);
    const id = `${draft.tool}-${Date.now().toString(36)}`;
    const end = getLastPathPoint(draft);
    const object: FrameObject = {
      id,
      name: getDrawToolName(draft.tool),
      type: "svg",
      selector: `[data-object-id='${id}']`,
      bounds,
      content: getSvgDrawContent(
        draft.tool,
        draft.start,
        end,
        undefined,
        path,
        bounds,
      ),
      style: {
        background: "transparent",
        overflow: "visible",
        clipperPath: JSON.stringify({
          tool: draft.tool,
          segments: draft.segments,
          closed: draft.closed,
        }),
      },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    pendingComposeSelectionObjectIdsRef.current = [object.id];
    persistComposeSelection([object.id]);
    if (draft.tool === "textPath") setEditingTextObjectId(object.id);
    activeToolRef.current = null;
    setActiveTool(null);
  }

  function updatePathObjectControl(
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
    point: Point,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
    },
  ) {
    updateObjectById(
      objectId,
      (object) => {
        const pathStyle = parseClipperPathStyle(object.style.clipperPath);
        if (!pathStyle) return object;
        const segments = denormalizePathSegments(pathStyle, object.bounds);
        const segment = segments[segmentIndex];
        if (!segment) return object;
        if (control === "start" && segmentIndex === 0) {
          segment.start = point;
          if (pathStyle.closed && segments.length > 1) {
            segments[segments.length - 1].end = point;
          }
        } else if (control === "end") {
          segment.end = point;
          if (segments[segmentIndex + 1]) {
            segments[segmentIndex + 1].start = point;
          } else if (pathStyle.closed && segmentIndex === segments.length - 1) {
            segments[0].start = point;
          }
        } else if (control === "c1" || control === "c2") {
          segment.kind = "curve";
          segment[control] = point;
          if (!segment.c1) segment.c1 = segment.start;
          if (!segment.c2) segment.c2 = segment.end;
        }
        const { bounds, path } = getPenPathData(
          segments,
          Boolean(pathStyle.closed),
        );
        const end = segments[segments.length - 1]?.end ?? segment.end;
        return {
          ...object,
          bounds,
          content: getSvgDrawContent(
            pathStyle.tool,
            segments[0]?.start ?? point,
            end,
            undefined,
            path,
            bounds,
          ),
          style: {
            ...object.style,
            clipperPath: JSON.stringify({ ...pathStyle, segments }),
          },
        };
      },
      options,
    );
  }

  function deletePathObjectJoint(
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
  ) {
    updateObjectById(objectId, (object) => {
      const pathStyle = parseClipperPathStyle(object.style.clipperPath);
      if (!pathStyle) return object;
      const segments = denormalizePathSegments(pathStyle, object.bounds);
      const nextSegments = removePathJoint(
        segments,
        segmentIndex,
        control,
        Boolean(pathStyle.closed),
      );
      if (
        nextSegments === segments ||
        nextSegments.length === segments.length
      ) {
        return object;
      }
      const closed = Boolean(pathStyle.closed) && nextSegments.length > 1;
      const pathObjectUpdate = buildPathObjectUpdate(
        nextSegments,
        pathStyle.tool,
        closed,
      );
      return {
        ...object,
        bounds: pathObjectUpdate.bounds,
        content: pathObjectUpdate.content,
        style: {
          ...object.style,
          clipperPath: pathObjectUpdate.clipperPath,
        },
      };
    });
  }

  function updateTextPathOffset(
    objectId: string,
    offset: number,
    options?: { history?: boolean },
  ) {
    updateObjectById(
      objectId,
      (object) => {
        if (!isTextPathObject(object) || !object.content) return object;
        return {
          ...object,
          content: updateTextPathOffsetInContent(object.content, offset),
        };
      },
      options,
    );
  }

  const handleObjectCornerRadiusChange = useCallback(
    (objectId: string, radius: number) => {
      updateObjectById(objectId, (object) => {
        const {
          borderTopLeftRadius,
          borderTopRightRadius,
          borderBottomRightRadius,
          borderBottomLeftRadius,
          ...style
        } = object.style;
        void borderTopLeftRadius;
        void borderTopRightRadius;
        void borderBottomRightRadius;
        void borderBottomLeftRadius;
        const nextStyle = { ...style };
        if (radius > 0) nextStyle.borderRadius = radius;
        else delete nextStyle.borderRadius;
        return { ...object, style: nextStyle };
      });
    },
    [updateObjectById],
  );
  const handleTextEditEnd = useCallback(
    () => setEditingTextObjectId(null),
    [setEditingTextObjectId],
  );

  function handlePathControlPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const frameElement = frameViewportRef.current;
    if (!frameElement) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startClientPoint = { x: event.clientX, y: event.clientY };
    let latestPoint = framePointFromClient(event.nativeEvent, frameElement);
    let frameId = 0;
    let moved = false;
    const flushPreview = () => {
      frameId = 0;
      flushSync(() => {
        updatePathObjectControl(objectId, segmentIndex, control, latestPoint, {
          history: false,
        });
      });
    };
    const move = (nativeEvent: PointerEvent) => {
      const deltaX = nativeEvent.clientX - startClientPoint.x;
      const deltaY = nativeEvent.clientY - startClientPoint.y;
      if (Math.hypot(deltaX, deltaY) > 3) {
        moved = true;
      }
      if (!moved) return;
      latestPoint = framePointFromClient(nativeEvent, frameElement);
      if (!frameId) frameId = requestAnimationFrame(flushPreview);
    };
    const up = (nativeEvent: PointerEvent) => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      if (!moved && (control === "start" || control === "end")) {
        deletePathObjectJoint(objectId, segmentIndex, control);
      } else {
        updatePathObjectControl(
          objectId,
          segmentIndex,
          control,
          framePointFromClient(nativeEvent, frameElement),
          { history: true },
        );
      }
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleShapeToolPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const tool = activeToolRef.current;
    if (!tool) return false;
    if (event.button !== 0) return false;
    const el = event.currentTarget;
    const rawPoint = framePointFromClient(event.nativeEvent, el);
    if (tool === "text") {
      // If clicking an existing text or text-on-path object, edit it directly
      const hitElement = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-object-id]",
      );
      const hitObjectId = hitElement?.dataset.objectId;
      if (hitObjectId && part) {
        const allObjects = [...part.background.elements, ...part.objects];
        const hitObject = allObjects.find((o) => o.id === hitObjectId);
        if (
          hitObject &&
          (hitObject.type === "text" || isTextPathObject(hitObject))
        ) {
          startTextObjectEdit(
            event as unknown as React.MouseEvent<HTMLDivElement>,
            hitObject,
          );
          return true;
        }
      }
      createTextObjectAtPoint(rawPoint);
      return true;
    }
    if (isBezierDrawTool(tool)) {
      const draft =
        pathDraftRef.current?.tool === tool
          ? pathDraftRef.current
          : {
              tool,
              start: rawPoint,
              segments: [],
              pointerId: null,
              downPoint: null,
              current: null,
              outHandle: null,
              previewPoint: null,
              anchor: null,
              closed: false,
              disconnected: false,
            };
      const point = getPathDraftSnapPoint(draft, rawPoint);
      if (draft.segments.length === 0 && !draft.anchor) {
        draft.anchor = point;
      }
      if (draft.disconnected) {
        draft.anchor = point;
        draft.outHandle = null;
      }
      draft.pointerId = event.pointerId;
      draft.downPoint = point;
      draft.current = null;
      draft.previewPoint = point;
      pathDraftRef.current = draft;
      el.setPointerCapture(event.pointerId);
      return true;
    }
    shapeDrawStartRef.current = {
      x: rawPoint.x,
      y: rawPoint.y,
      pointerId: event.pointerId,
      points: [rawPoint],
    };
    el.setPointerCapture(event.pointerId);
    return true;
  }

  function handleShapeToolPointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const start = shapeDrawStartRef.current;
    const tool = activeToolRef.current;
    if (!tool) return false;
    const el = event.currentTarget;
    const rawEnd = framePointFromClient(event.nativeEvent, el);
    const draft = pathDraftRef.current;
    const end =
      draft && isBezierDrawTool(tool)
        ? getPathDraftSnapPoint(draft, rawEnd)
        : rawEnd;
    if (!draft && isBezierDrawTool(tool)) {
      shapeDrawPreviewRef.current = {
        bounds: getDirectedDrawBounds([end]),
        start: end,
        end,
        path: "",
        joints: [end],
      };
      if (!shapeDrawPreviewFrameRef.current) {
        shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
          shapeDrawPreviewFrameRef.current = 0;
          setShapeDrawPreview(shapeDrawPreviewRef.current);
        });
      }
      return true;
    }
    if (draft && draft.pointerId === null && isBezierDrawTool(tool)) {
      draft.previewPoint = end;
      const previewSegments = getDraftPreviewSegments(draft);
      const handles = draft.outHandle
        ? [{ anchor: getLastPathPoint(draft), handle: draft.outHandle }]
        : [];
      const joints = getDraftJoints(draft, previewSegments);
      if (
        joints.length > 0 ||
        previewSegments.length > 0 ||
        handles.length > 0
      ) {
        const { bounds, path } = getPenPreviewData(
          previewSegments,
          handles,
          joints,
          draft.closed,
        );
        shapeDrawPreviewRef.current = {
          bounds,
          start: draft.start,
          end,
          path,
          joints,
          handles: handles.length > 0 ? handles : undefined,
        };
        if (!shapeDrawPreviewFrameRef.current) {
          shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
            shapeDrawPreviewFrameRef.current = 0;
            setShapeDrawPreview(shapeDrawPreviewRef.current);
          });
        }
      }
      return true;
    }
    if (draft?.pointerId === event.pointerId && isBezierDrawTool(tool)) {
      const segmentStart = getLastPathPoint(draft);
      const downPoint = draft.downPoint ?? segmentStart;
      const draggedHandle =
        getPointDistance(rawEnd, downPoint) >= 3 ? rawEnd : null;
      const incomingHandle = draggedHandle
        ? getMirroredPoint(downPoint, draggedHandle)
        : null;
      draft.current =
        getPointDistance(segmentStart, downPoint) >= 0.5
          ? createPathSegment(
              segmentStart,
              downPoint,
              draft.outHandle,
              incomingHandle,
            )
          : null;
      draft.previewPoint = downPoint;
      const previewSegments = draft.current
        ? [...draft.segments, draft.current]
        : draft.segments;
      const handles = [
        ...(draft.current?.c1
          ? [{ anchor: segmentStart, handle: draft.current.c1 }]
          : []),
        ...(draft.current?.c2
          ? [{ anchor: downPoint, handle: draft.current.c2 }]
          : []),
        ...(incomingHandle && !draft.current
          ? [{ anchor: downPoint, handle: incomingHandle }]
          : []),
        ...(draggedHandle
          ? [{ anchor: downPoint, handle: draggedHandle }]
          : []),
      ];
      const joints = getDraftJoints(draft, previewSegments);
      if (
        previewSegments.length === 0 &&
        handles.length === 0 &&
        joints.length === 0
      )
        return true;
      const { bounds, path } = getPenPreviewData(
        previewSegments,
        handles,
        joints,
        draft.closed,
      );
      shapeDrawPreviewRef.current = {
        bounds,
        start: draft.start,
        end: downPoint,
        path,
        joints,
        handles: handles.length > 0 ? handles : undefined,
      };
      if (!shapeDrawPreviewFrameRef.current) {
        shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
          shapeDrawPreviewFrameRef.current = 0;
          setShapeDrawPreview(shapeDrawPreviewRef.current);
        });
      }
      return true;
    }
    if (!start || start.pointerId !== event.pointerId) return false;
    const shouldSnapDraw = event.metaKey || event.ctrlKey;
    const drawEnd =
      shouldSnapDraw && !isPathDrawTool(tool)
        ? getShapeDrawSnapEnd(start, end, event.shiftKey)
        : end;
    if (!shouldSnapDraw || isPathDrawTool(tool)) clearComposeDrawSnapGuides();
    if (tool === "pencil") {
      const lastPoint = start.points[start.points.length - 1] ?? start;
      const distance = Math.hypot(
        drawEnd.x - lastPoint.x,
        drawEnd.y - lastPoint.y,
      );
      if (distance >= 2) start.points.push(drawEnd);
    }
    const drawData = isPathDrawTool(tool)
      ? getPathDrawData(tool, start, drawEnd, start.points)
      : null;
    const bounds =
      drawData?.bounds ?? computeShapeDrawBox(start, drawEnd, event.shiftKey);
    shapeDrawPreviewRef.current = {
      bounds,
      start,
      end: drawEnd,
      points: tool === "pencil" ? [...start.points] : undefined,
      path: tool === "pencil" ? drawData?.path : undefined,
    };
    if (!shapeDrawPreviewFrameRef.current) {
      shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
        shapeDrawPreviewFrameRef.current = 0;
        setShapeDrawPreview(shapeDrawPreviewRef.current);
      });
    }
    return true;
  }

  function handleShapeToolPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const tool = activeToolRef.current;
    const draft = pathDraftRef.current;
    if (
      tool &&
      draft?.pointerId === event.pointerId &&
      isBezierDrawTool(tool)
    ) {
      const el = event.currentTarget;
      const rawEnd = framePointFromClient(event.nativeEvent, el);
      const segmentStart = getLastPathPoint(draft);
      const downPoint = draft.downPoint ?? segmentStart;
      const draggedHandle =
        getPointDistance(rawEnd, downPoint) >= 3 ? rawEnd : null;
      const incomingHandle = draggedHandle
        ? getMirroredPoint(downPoint, draggedHandle)
        : null;
      const disconnectedStart = draft.disconnected;
      const segment =
        draft.current ??
        (!disconnectedStart && getPointDistance(segmentStart, downPoint) >= 0.5
          ? createPathSegment(
              segmentStart,
              downPoint,
              draft.outHandle,
              incomingHandle,
            )
          : null);
      const closing =
        draft.segments.length >= 2 &&
        getPointDistance(downPoint, draft.start) <= 8;
      if (segment && getPointDistance(segment.end, segment.start) >= 3) {
        draft.segments.push(
          closing
            ? {
                ...segment,
                end: draft.start,
                c2: incomingHandle ?? draft.start,
              }
            : segment,
        );
      }
      draft.anchor = downPoint;
      draft.outHandle = draggedHandle;
      draft.previewPoint = closing ? null : downPoint;
      draft.closed = closing;
      draft.disconnected = false;
      draft.pointerId = null;
      draft.downPoint = null;
      draft.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      const shouldCommit =
        event.detail >= 2 || (event.nativeEvent as PointerEvent).detail >= 2;
      if (shouldCommit && draft.segments.length > 0) {
        commitPathDraftObject(draft);
        pathDraftRef.current = null;
        shapeDrawPreviewRef.current = null;
        setShapeDrawPreview(null);
      } else if (draft.segments.length > 0) {
        const previewSegments = getDraftPreviewSegments(draft);
        const handles = draft.outHandle
          ? [{ anchor: getLastPathPoint(draft), handle: draft.outHandle }]
          : [];
        const joints = getDraftJoints(draft, previewSegments);
        const { bounds, path } = getPenPreviewData(
          previewSegments,
          handles,
          joints,
          draft.closed,
        );
        shapeDrawPreviewRef.current = {
          bounds,
          start: draft.start,
          end: draft.previewPoint ?? getLastPathPoint(draft),
          path,
          joints,
          handles: handles.length > 0 ? handles : undefined,
        };
        setShapeDrawPreview(shapeDrawPreviewRef.current);
      }
      return true;
    }
    const start = shapeDrawStartRef.current;
    if (!tool || !start || start.pointerId !== event.pointerId) return false;
    shapeDrawStartRef.current = null;
    pathDraftRef.current = null;
    shapeDrawPreviewRef.current = null;
    const shouldSnapDraw = event.metaKey || event.ctrlKey;
    if (shapeDrawPreviewFrameRef.current) {
      cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
      shapeDrawPreviewFrameRef.current = 0;
    }
    setShapeDrawPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);

    const el = event.currentTarget;
    const rawEnd = framePointFromClient(event.nativeEvent, el);
    const end =
      shouldSnapDraw && !isPathDrawTool(tool)
        ? getShapeDrawSnapEnd(start, rawEnd, event.shiftKey)
        : rawEnd;
    clearComposeDrawSnapGuides();
    const minSize = 10;
    if (tool === "pencil") start.points.push(end);
    const points = tool === "pencil" ? start.points : [start, end];
    const { x, y, width, height } = isPathDrawTool(tool)
      ? getPathDrawData(tool, start, end, points).bounds
      : computeShapeDrawBox(start, end, event.shiftKey);
    // Only create if dragged enough
    if (width < minSize && height < minSize) return true;

    const isEllipse = tool === "ellipse";
    const isText = tool === "text";
    const isNullObject = tool === "null";
    const isSvg = isSvgDrawTool(tool);
    const isPattern2d = tool === "pattern2d";
    const id = `${tool}-${Date.now().toString(36)}`;
    const object: FrameObject = {
      id,
      name: getDrawToolName(tool),
      type: isText
        ? "text"
        : isNullObject
          ? "null"
          : isSvg
            ? "svg"
            : isPattern2d
              ? "pattern2d"
              : "rect",
      selector: `[data-object-id='${id}']`,
      bounds: {
        x,
        y,
        width: Math.max(width, minSize),
        height: Math.max(height, minSize),
      },
      content: isText ? "Text" : undefined,
      style: isText
        ? {
            color: "#ffffff",
            fontSize: Math.max(16, Math.round(Math.max(height, minSize) * 0.6)),
            fontWeight: 400,
            lineHeight: 1.1,
          }
        : isNullObject
          ? {
              backgroundColor: "transparent",
            }
          : isSvg
            ? {
                backgroundColor: "transparent",
                overflow: "visible",
              }
            : isPattern2d
              ? {
                  backgroundColor: "transparent",
                  overflow: "hidden",
                }
              : {
                  backgroundColor: "#D5D5D5",
                  ...(isEllipse ? { borderRadius: 9999 } : {}),
                  ...(tool === "polygon"
                    ? {
                        clipPath:
                          "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                      }
                    : {}),
                  ...(tool === "star"
                    ? {
                        clipPath:
                          "polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%)",
                      }
                    : {}),
                },
    };
    if (isSvg) object.content = getSvgDrawContent(tool, start, end, points);
    if (isPattern2d) {
      object.props = {
        preset: "polkaDots",
        seed: 1,
        ...getPattern2dDefaults("polkaDots"),
      };
    }
    if (part) {
      updateCompositionForTimelinePart(part.id, (composition) => ({
        ...composition,
        objects: [...composition.objects, object],
      }));
      pendingComposeSelectionObjectIdsRef.current = [object.id];
      persistComposeSelection([object.id]);
      activeToolRef.current = null;
      setActiveTool(null);
    }
    return true;
  }

  function wrappedOnFramePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (handleShapeToolPointerDown(event)) return;
    onFramePointerDown(event);
  }

  function wrappedOnFramePointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (handleShapeToolPointerMove(event)) return;
    onFramePointerMove(event);
  }

  function wrappedOnFramePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (handleShapeToolPointerUp(event)) return;
    onFramePointerUp(event);
  }

  function wrappedOnFramePointerCancel(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    shapeDrawStartRef.current = null;
    pathDraftRef.current = null;
    shapeDrawPreviewRef.current = null;
    if (shapeDrawPreviewFrameRef.current) {
      cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
      shapeDrawPreviewFrameRef.current = 0;
    }
    setShapeDrawPreview(null);
    onFramePointerCancel(event);
  }

  function wrappedOnFramePointerLeave(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    shapeDrawPreviewRef.current = null;
    if (shapeDrawPreviewFrameRef.current) {
      cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
      shapeDrawPreviewFrameRef.current = 0;
    }
    setShapeDrawPreview(null);
    onFramePointerMove(event);
  }

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
    if (nextMode === "preview") {
      setPrerenderCacheResetToken((token) => token + 1);
    }
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
      onFramePointerCancel: wrappedOnFramePointerCancel,
      onFramePointerDown: wrappedOnFramePointerDown,
      onFramePointerDownCapture,
      onFramePointerMove: wrappedOnFramePointerMove,
      onFramePointerLeave: wrappedOnFramePointerLeave,
      onFramePointerUp: wrappedOnFramePointerUp,
      onObjectPointerDown: startObjectDrag,
      onObjectContextMenu: openComposeObjectContextMenu,
      onObjectResizePointerDown: startObjectResize,
      onPathControlPointerDown: handlePathControlPointerDown,
      onObjectCornerRadiusChange: handleObjectCornerRadiusChange,
      onTextEditCommit: updateTextObjectContent,
      onTextEditEnd: handleTextEditEnd,
      onTextPathOffsetChange: updateTextPathOffset,
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
    wrappedOnFramePointerCancel,
    wrappedOnFramePointerDown,
    onFramePointerDownCapture,
    wrappedOnFramePointerMove,
    wrappedOnFramePointerLeave,
    wrappedOnFramePointerUp,
    startObjectDrag,
    openComposeObjectContextMenu,
    startObjectResize,
    handlePathControlPointerDown,
    handleObjectCornerRadiusChange,
    updateTextObjectContent,
    handleTextEditEnd,
    updateTextPathOffset,
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
                    onAddNullObject: addNullObjectToFrameCenter,
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

function isInspectorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-inspector-panel]"));
}

function isSelectPopoverTarget(target: HTMLElement | null) {
  return Boolean(
    target?.closest(
      "[data-radix-select-content], [data-radix-popper-content-wrapper]",
    ),
  );
}

function isComposeLayersTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-compose-layers-panel]"));
}

function isTimelineTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-timeline-panel]"));
}

function isPreviewStageTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-clipper-preview-stage]"));
}
