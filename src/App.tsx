import { Folder, Magnet, Pause, Play, RotateCcw, Scissors, Search, Signpost, SkipBack, SkipForward, Sparkles, StepBack, StepForward } from "lucide-react";
import { nanoid } from "nanoid";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Input, numberInputScrubEndEvent, numberInputScrubStartEvent } from "./components/ui/input";
import { AgentPanel } from "./components/AgentPanel";
import { AppContextMenu } from "./components/AppContextMenu";
import type { FileManagerTreeSnapshot } from "./components/FileManager";
import { CodePane } from "./components/CodePane";
import { ComposeLayersPanel } from "./components/compose/ComposeLayersPanel";
import { ExportMediaDialog, VideoExportOverlay } from "./components/export/ExportMediaDialog";
import { FrameZoomBar } from "./components/FrameZoomBar";
import { AdjustmentInspector, ChartInspector, EmptyInspector, FrameInspector, ObjectInspector, TranslationInspector, ZoomInspector } from "./components/inspector/InspectorPanels";
import { FramePreview } from "./components/preview/FramePreview";
import { QuickAccessTooltip } from "./components/QuickAccessTooltip";
import { SettingsDialog } from "./components/SettingsDialog";
import { buildFileManagerWorkspaceProps, FileManagerWorkspace, type FileManagerWorkspaceProps } from "./app/features/file-manager/FileManagerWorkspace";
import { ConnectedTimelinePanel, TimelineProvider } from "./app/features/timeline/TimelineProvider";
import { ToolsPanel } from "./components/ToolsPanel";
import { appBarActionButtonBase, appBarSaveButtonClass, appDragRegion, appNoDragRegion, defaultFramePreviewScale, defaultScrubCommitThrottleMs, maxProjectHistoryActions, projectHistoryCoalesceMs, sectionTitle, segmentedTabActive, segmentedTabBase, segmentedTabInactive, selectorOffsetPx } from "./app/config";
import { exportService } from "./app/services/exportService";
import { clipperHost } from "./app/clipperHost";
import { projectPersistenceService } from "./app/services/projectPersistenceService";
import { useEditorDerivedState } from "./app/state/editorDerivedState";
import { EditorStoreProvider, useAppEditorState, useEditorStoreApi } from "./app/state/editorStore";
import { getProjectContentSnapshot, ProjectStoreProvider, useProjectDocumentState } from "./app/state/projectStore";
import { TIMELINE_MOTION_PART_ID, type AdjustmentLayerSelection, type CompositionSelection, type ContextMenuState, type ExportDialogTab, type LeftPanelTab, type Mode, type PlaybackClock, type ProjectExportFormat, type ProjectUpdater, type RightPanelTab, type SettingsSection, type TimelineBlankContextTarget, type TimelineNodeContextTarget, type TranslationMarkerSelection, type VideoExportProgress, type ZoomMarkerSelection } from "./app/types";
import { advanceTimeSensitiveSceneTime, applyAdjustmentLayersToSceneTime, applyAdjustmentLayersToVisualStyle, getSceneTimeForTimeSensitiveDisplayTime, getTimeSensitiveDisplayDuration, getTimeSensitiveDisplayTime } from "./core/adjustments";
import { appendAssetsToFolder, duplicateAssetTree, findAsset, getAssetPath, moveAssetTree, removeAsset, sortAssetsInParent, updateAssetTree, type AssetDropIntent, type AssetSortMode } from "./core/assetTree";
import { boundsToViewport, formatCameraPreviewTransform, framePointToCameraTranslation, getLayeredCameraPreviewTransform, isMarkerOnMotionLayer, type CameraPreviewTransform } from "./core/camera";
import { centerOf, constrainDragDeltaToDominantAxis, getBoundsUnion, getDraggedObjects, getResizedObjects, insetBounds, isVisibleMarqueeBounds, moveBounds, selectionObjectFromFrameObject, selectionPayloadFromObjects, updateDragSelectionBoxElement, type ObjectDrag, type ObjectResize, type ResizeHandle } from "./core/frameInteraction";
import { boundsToPoints, createSelectionPayload, framePointFromClient, normalizeBounds } from "./core/geometry";
import { getMendedMarkerIds, normalizeMendedZoomMarkerFocus } from "./core/markers";
import { clamp, roundTenth, roundTwo } from "./core/math";
import { defaultAdjustmentEffectPackage, getAdjustmentEffectPackage, getMotionEffectByKind, getMotionEffectPackage } from "./core/effects/registry";
import type { AdjustmentEffectPointControl } from "./core/effects/types";
import { createDefaultMotionBlockByEffectId, motionBlocksToTranslationMarkers, motionBlocksToZoomMarkers } from "./core/motionEffects";
import { compositionFromSource, compositionToSource } from "./core/compositionSource";
import { defaultAssets, defaultComposeLayoutState, defaultEditorLayoutState, defaultPreviewViewportState, defaultTimelineLayerState, defaultTimelineMode, defaultTimelineViewportState, deleteCompositionFromProject, normalizeProject, replacePartInProject, serializeProjectForSave } from "./core/project";
import { buildLinearTimeline, expandExplicitTimelineMarkerMendIds, formatTime, getAdjustmentLayerRowId, getAdjustmentPlacement, getAvailableZoomPlacement, getExecutableAdjustmentLayers, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getTranslationMarkerLayerId, getTranslationMarkerMendKey, getZoomMarkerLayerId, getZoomMarkerMendKey, getZoomMiddleSnap, isMotionMarkerOnLayerId, isZoomMiddleSnapActive, rebaseCompositionTimelineMarkers, removeTimelineAdjustmentLayerMarkers, removeTimelineMotionLayerMarkers, timelineDisplayDuration, type TimelineMarkerMove, type TimelineMarkerResize } from "./core/timeline";
import { getTimelineStateLayers, insertTimelineStateLayer, type TimelineLayerCategory } from "./core/timelineLayers";
import { getInsertedOverwriteRanges, overwriteTimelineMarkers, type TimelineOverwriteRange } from "./core/timelineOverwrite";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentEffectId, type AdjustmentLayer, type AssetItem, type BackgroundLayer, type Bounds, type CodeViewportState, type ComposeLayoutState, type CompositionClip, type EditorLayoutState, type EditorState, type FrameObject, type MotionBlock, type MotionEase, type MotionEffectId, type MotionEffectKind, type Part, type PartFrame, type Point, type ProjectManifest, type RichTextSegment, type SelectionPayload, type TimelineClip, type TimelineLayerState, type TimelineMode, type TimelineMotionLayerKind, type TimelineViewportState, type TranslationMarker, type ZoomMarker } from "./core/types";

const activeProjectManifestStorageKey = "clipper.activeProjectManifestPath";
const appStatePath = "clipper/app-state.json";
const defaultEditorState: EditorState = {
  timeline: defaultTimelineViewportState,
  timelineMode: defaultTimelineMode,
  mode: "interactive",
  leftPanelTab: "assets",
  rightPanelTab: "video",
  currentSceneTime: 0,
  layout: defaultEditorLayoutState,
  composeLayout: defaultComposeLayoutState,
  preview: defaultPreviewViewportState,
  code: {},
};

const editorPanelLayoutLimits = {
  leftMin: 220,
  leftMax: 560,
  rightMin: 280,
  rightMax: 620,
  timelineMin: 220,
  timelineMax: 560,
  centerMin: 640,
};

type EditorPanelResizeKind = "left" | "compose-left" | "right" | "timeline";

type EditorPanelResizeDrag = {
  kind: EditorPanelResizeKind;
  originX: number;
  originY: number;
  initialLayout: EditorLayoutState;
  initialComposeLayout: ComposeLayoutState;
  nextLayout: EditorLayoutState;
  nextComposeLayout: ComposeLayoutState;
  frame: number;
};

function createCompositionId() {
  return nanoid(8);
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

type BootProject = {
  manifestPath: string;
  project: ProjectManifest;
  sourceStatus: string;
  compositionSources: Record<string, string>;
};

type TimelineNodeClipboard =
  | { kind: "adjustment"; nodes: Array<{ absoluteStart: number; layer: AdjustmentLayer }> }
  | { kind: "translation"; nodes: Array<{ absoluteStart: number; partId: string; marker: TranslationMarker }> }
  | { kind: "zoom"; nodes: Array<{ absoluteStart: number; partId: string; marker: ZoomMarker }> };

type ProjectHistoryEntry = { project: ProjectManifest; implicitFileOperation?: boolean };

type PresentationMode = "frame" | "theater" | null;

function getProjectCompositionSources(project: ProjectManifest) {
  const compositions = Array.from(new Map([...(project.compositionLibrary ?? []), ...(project.compositions ?? [])].map((part) => [part.filePath, part])).values()).filter((part) => !part.sourceMissing);
  const embeddedSources = project.compositionSources ?? {};
  return Object.fromEntries(compositions.map((part) => {
    const source = embeddedSources[part.filePath] ?? part.source;
    if (source === undefined) throw new Error(`Composition ${part.filePath} is missing source.`);
    return [part.filePath, source];
  }));
}

function getDirectoryPath(relativePath: string) {
  const lastSlashIndex = relativePath.lastIndexOf("/");
  return lastSlashIndex > 0 ? relativePath.slice(0, lastSlashIndex) : relativePath;
}

function reorderByIntent<T>(items: T[], sourceIndex: number, targetIndex: number, action: "before" | "after") {
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(action === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, moved);
  return next;
}

async function readStoredActiveProjectManifestPath() {
  try {
    const state = JSON.parse(await clipperHost.readTextFile(appStatePath)) as { activeProjectManifestPath?: unknown };
    if (typeof state.activeProjectManifestPath === "string" && state.activeProjectManifestPath.startsWith("clipper/")) return state.activeProjectManifestPath;
  } catch {
    // New installs will not have app-state.json yet.
  }

  const localStoragePath = localStorage.getItem(activeProjectManifestStorageKey);
  if (localStoragePath) return localStoragePath;
  throw new Error("No active project path is stored.");
}

async function writeStoredActiveProjectManifestPath(manifestPath: string) {
  localStorage.setItem(activeProjectManifestStorageKey, manifestPath);
  await clipperHost.writeTextFile(appStatePath, `${JSON.stringify({ activeProjectManifestPath: manifestPath }, null, 2)}\n`);
}

function clipperContainerPath(manifestPath: string) {
  return manifestPath.endsWith(".clipper") ? manifestPath : manifestPath.replace(/(?:\/project)?\.json$/, ".clipper");
}

async function loadBootProject(): Promise<BootProject> {
  const manifestPath = await readStoredActiveProjectManifestPath();
  const { project } = await projectPersistenceService.loadProject({ manifestPath });
  const normalizedProject = normalizeProject(project);
  const activeManifestPath = clipperContainerPath(manifestPath);

  try {
    await writeStoredActiveProjectManifestPath(activeManifestPath);
  } catch {
    // Browser/dev can still rely on localStorage when host state is unavailable.
  }

    return {
      manifestPath: activeManifestPath,
      project: normalizedProject,
      sourceStatus: `Project loaded from ${activeManifestPath}.`,
      compositionSources: getProjectCompositionSources(normalizedProject),
    };
}

export function App() {
  const [bootProject, setBootProject] = useState<BootProject | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBootProject().then((loadedProject) => {
      if (!cancelled) setBootProject(loadedProject);
    }).catch((error) => {
      if (!cancelled) setBootError(error instanceof Error ? error.message : "Unable to open the active project.");
    });
    return () => { cancelled = true; };
  }, []);

  async function openProjectFromBoot() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;
      const { project } = await projectPersistenceService.loadProject({ manifestPath });
      const normalizedProject = normalizeProject(project);
      const activeManifestPath = clipperContainerPath(manifestPath);
      await writeStoredActiveProjectManifestPath(activeManifestPath);
      setBootProject({
        manifestPath: activeManifestPath,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${activeManifestPath}.`,
        compositionSources: getProjectCompositionSources(normalizedProject),
      });
      setBootError(null);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-[#12141a] px-6 text-[#dfe2ea]">
        <section className="grid max-w-md gap-4 rounded-2xl border border-white/10 bg-[#171a22] p-6 shadow-2xl">
          <div className="grid gap-2">
            <h1 className="text-lg font-bold">No project loaded</h1>
            <p className="text-sm text-[#a7adbb]">{bootError}</p>
          </div>
          <button type="button" className="rounded-xl bg-[#dfe2ea] px-4 py-2 text-sm font-bold text-[#12141a]" onClick={openProjectFromBoot}>Open Project</button>
        </section>
      </main>
    );
  }

  if (!bootProject) {
    return <main className="grid h-screen place-items-center bg-[#12141a] text-sm font-bold text-[#dfe2ea]">Opening project...</main>;
  }

  return <AppProviders bootProject={bootProject} />;
}

function AppProviders({ bootProject }: { bootProject: BootProject }) {
  return (
    <ProjectStoreProvider key={bootProject.manifestPath} project={bootProject.project} compositionSources={bootProject.compositionSources}>
      <EditorStoreProvider project={bootProject.project}>
        <AppContent initialProjectManifestPath={bootProject.manifestPath} initialSourceStatus={bootProject.sourceStatus} />
      </EditorStoreProvider>
    </ProjectStoreProvider>
  );
}

function AppContent({ initialProjectManifestPath, initialSourceStatus }: { initialProjectManifestPath: string; initialSourceStatus: string }) {
  const { project, setProject, savedProjectSnapshot, setSavedProjectSnapshot, compositionSources, setCompositionSources, savedCompositionSourcesSnapshot, setSavedCompositionSourcesSnapshot } = useProjectDocumentState();
  const editorStore = useEditorStoreApi();
  const [currentSceneTime, setRenderCurrentSceneTime] = useState(() => editorStore.getState().currentSceneTime);
  const [trackerPickTranslationMarker, setTrackerPickTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [pointPickAdjustment, setPointPickAdjustment] = useState<{ layerId: string; control: AdjustmentEffectPointControl } | null>(null);
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(null);
  const [presentationControlsVisible, setPresentationControlsVisible] = useState(false);
  const [presentationDisplayTime, setPresentationDisplayTime] = useState(currentSceneTime);
  const [presentationScale, setPresentationScale] = useState(() => window.innerWidth / FRAME_WIDTH);
  const [previewColumnHovered, setPreviewColumnHovered] = useState(false);
  const [activeProjectManifestPath, setActiveProjectManifestPath] = useState(initialProjectManifestPath);
  const {
    mode, setMode,
    timelineMode, setTimelineMode,
    selectedSceneId, setSelectedSceneId,
    selectedPartId, setSelectedPartId,
    selectedParts, setSelectedParts,
    selectedObjectId, setSelectedObjectId,
    editingTextObjectId, setEditingTextObjectId,
    selectedZoomMarker, setSelectedZoomMarker,
    selectedZoomMarkers, setSelectedZoomMarkers,
    focusPickZoomMarker, setFocusPickZoomMarker,
    selectedTranslationMarker, setSelectedTranslationMarker,
    selectedTranslationMarkers, setSelectedTranslationMarkers,
    positionPickTranslationMarker, setPositionPickTranslationMarker,
    selectedAdjustmentLayerId, setSelectedAdjustmentLayerId,
    selectedAdjustmentLayers, setSelectedAdjustmentLayers,
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
  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const savedCompositionSourcesSnapshotRef = useRef(savedCompositionSourcesSnapshot);
  const timelineNodeClipboardRef = useRef<TimelineNodeClipboard | null>(null);
  const presentationModeRef = useRef<PresentationMode>(presentationMode);
  const presentationControlsTimeoutRef = useRef(0);
  const modeRef = useRef(mode);
  const activePartFilePathRef = useRef("");
  const projectHistoryRef = useRef<{ past: ProjectHistoryEntry[]; future: ProjectHistoryEntry[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const implicitFileOperationSaveTimeoutRef = useRef(0);
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null);
  const videoExportIdRef = useRef<string | null>(null);
  const currentSceneTimeRef = useRef(currentSceneTime);
  const isPlayingRef = useRef(isPlaying);
  const playbackClockRef = useRef<PlaybackClock>(null);
  const wasPlayingRef = useRef(false);
  const timelineScrubbingRef = useRef(false);
  const timelineScrubPausedPlaybackRef = useRef(false);
  const presentationScrubPausedPlaybackRef = useRef(false);
  const editorPanelResizeRef = useRef<EditorPanelResizeDrag | null>(null);
  const numberInputScrubPausedPlaybackRef = useRef(false);
  const playbackTimeLabelRef = useRef<HTMLSpanElement | null>(null);
  const playbackPlayheadRef = useRef<HTMLDivElement | null>(null);
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
  const centerPreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const centerPreviewScrollFrameRef = useRef(0);
  const projectRenameCancelledRef = useRef(false);
  const pendingZoomScalePreviewRef = useRef<CameraPreviewTransform | null>(null);
  const zoomScalePreviewFrameRef = useRef(0);
  const timelineModeRef = useRef(timelineMode);

  const {
    activeTimelinePart,
    agentContext,
    assets,
    cameraPreviewTransform,
    canSelectFrameObjects,
    editorStateSnapshot,
    framePickPoint,
    hasUnsavedChanges,
    hasActiveComposition,
    inspectorTranslationMiddleSnap,
    inspectorZoomMiddleSnap,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    part,
    compositionSourcesSnapshot,
    previewTime,
    scene,
    sceneDurationSeconds,
    selectedObject,
    selectedAdjustmentLayer,
    selectedPart,
    selectedTranslation,
    selectedTranslationPart,
    selectedTranslationPartMiddleSnapActive,
    selectedTranslationPartMiddleTransitionMode,
    selectedTranslationSnapInActive,
    selectedTranslationSnapMarkers,
    selectedTranslationSnapOutActive,
    selectedZoom,
    selectedZoomPart,
    selectedZoomPartMiddleSnapActive,
    selectedZoomPartMiddleTransitionMode,
    selectedZoomSnapInActive,
    selectedZoomSnapMarkers,
    selectedZoomSnapOutActive,
    timeline,
    translationMiddleSnap,
    validationErrors,
    zoomMiddleSnap,
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
    selectedTranslationMarker,
    selectedTranslationMarkers,
    selectedZoomMarker,
    selectedZoomMarkers,
    selectionPayload,
    timelineMode,
  });
  const watchedProjectDirectory = getDirectoryPath(activeProjectManifestPath);
  const compositionLibrary = project.compositionLibrary ?? [];
  const timelines = project.timelines ?? [];
  const activeTimelineName = timelines.find((item) => item.id === selectedSceneId)?.name ?? scene.name;
  const timelineCompositionIds = new Set(scene.compositions.map((composition) => composition.id));
  const timelineLayers = project.editorState?.timelineLayers ?? defaultTimelineLayerState;
  const baseMotionLayers = timelineLayers.motionLayers?.length ? timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const motionLayers = baseMotionLayers;
  const hiddenMotionLayerIds = new Set(motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id));
  const visibleSceneAdjustmentLayers = useMemo(() => getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayers), [scene.adjustmentLayers, timelineLayers]);
  const visibleSceneAdjustmentSignature = useMemo(() => JSON.stringify(visibleSceneAdjustmentLayers.map((layer) => ({ id: layer.id, layerId: layer.layerId, start: layer.start, duration: layer.duration, effect: layer.effect }))), [visibleSceneAdjustmentLayers]);
  function replaceProject(nextProject: ProjectManifest, options: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean } = {}) {
    let normalizedProject = normalizeProject(nextProject);
    const currentProject = projectRef.current;
    let nextCompositionSources = normalizedProject.compositionSources ?? getProjectCompositionSources(normalizedProject);
    if (options.syncSources !== false) {
      nextCompositionSources = getSyncedCompositionSources(normalizedProject, currentProject, compositionSourcesRef.current);
      normalizedProject = normalizeProject({ ...normalizedProject, compositionSources: nextCompositionSources });
    }
    if (JSON.stringify(normalizedProject) === JSON.stringify(currentProject)) return;

    if (options.history !== false) {
      const now = Date.now();
      const isCoalescedAction = options.coalesceHistory !== false && now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs && projectHistoryRef.current.past.length > 0;

      projectHistoryRef.current = {
        past: isCoalescedAction ? projectHistoryRef.current.past : [...projectHistoryRef.current.past, { project: currentProject }].slice(-maxProjectHistoryActions),
        future: [],
      };
      lastProjectHistoryAtRef.current = now;
    }

    projectRef.current = normalizedProject;
    setProject(normalizedProject);
    setTimelineMode(normalizedProject.editorState?.timelineMode ?? defaultTimelineMode);
    compositionSourcesRef.current = nextCompositionSources;
    setCompositionSources(nextCompositionSources);
  }

  function applyEditorState(editorState: EditorState) {
    applyStoredEditorState(editorState, projectRef.current.scenes[0].id);

    requestAnimationFrame(() => {
      const viewport = centerPreviewScrollRef.current;
      if (!viewport) return;
      viewport.scrollLeft = editorState.preview?.scrollLeft ?? 0;
      viewport.scrollTop = editorState.preview?.scrollTop ?? 0;
    });
  }

  function updateEditorState(updater: (state: EditorState) => EditorState, options: { history?: boolean; coalesceHistory?: boolean } = {}) {
    const current = projectRef.current;
    const nextProject = normalizeProject({
      ...current,
      editorState: updater(current.editorState ?? defaultEditorState),
    });
    if (JSON.stringify(nextProject.editorState) === JSON.stringify(current.editorState)) return;
    if (options.history) {
      replaceProject(nextProject, { history: true, syncSources: false, coalesceHistory: options.coalesceHistory });
      return;
    }

    projectRef.current = nextProject;
    setProject(nextProject);
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function getSyncedCompositionSources(nextProject: ProjectManifest, previousProject: ProjectManifest | undefined, currentSources: Record<string, string>) {
    let changed = false;
    const nextSources = { ...currentSources };
    const nextParts = Array.from(new Map([...nextProject.scenes.flatMap((item) => item.compositions), ...(nextProject.compositionLibrary ?? []), ...(nextProject.compositions ?? [])].map((item) => [item.filePath, item])).values());
    const previousPartsByPath = new Map([...(previousProject?.scenes.flatMap((item) => item.compositions) ?? []), ...(previousProject?.compositionLibrary ?? []), ...(previousProject?.compositions ?? [])].map((item) => [item.filePath, item]));
    for (const nextPart of nextParts) {
      if (nextPart.sourceMissing) continue;
      const previousPart = previousPartsByPath.get(nextPart.filePath);
      if (previousPart && JSON.stringify(previousPart) === JSON.stringify(nextPart)) continue;
      nextSources[nextPart.filePath] = compositionToSource(nextPart);
      changed = true;
    }

    const livePaths = new Set(nextParts.filter((part) => !part.sourceMissing).map((part) => part.filePath));
    for (const filePath of Object.keys(nextSources)) {
      if (livePaths.has(filePath)) continue;
      delete nextSources[filePath];
      changed = true;
    }

    return changed ? nextSources : currentSources;
  }

  function getSavedProjectSnapshotProject() {
    try {
      return JSON.parse(savedProjectSnapshotRef.current) as ProjectManifest;
    } catch {
      return undefined;
    }
  }

  function syncCompositionSourcesFromProject(nextProject: ProjectManifest) {
    const nextSources = getProjectCompositionSources(nextProject);
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
  }

  function markLastHistoryEntryAsImplicitFileOperation() {
    const past = projectHistoryRef.current.past;
    if (past.length === 0) return;
    projectHistoryRef.current = {
      ...projectHistoryRef.current,
      past: past.map((entry, index) => (index === past.length - 1 ? { ...entry, implicitFileOperation: true } : entry)),
    };
  }

  function resetProjectHistory() {
    projectHistoryRef.current = { past: [], future: [] };
    lastProjectHistoryAtRef.current = 0;
  }

  function preserveCurrentPageMode(historyProject: ProjectManifest) {
    const currentEditorState = projectRef.current.editorState ?? defaultEditorState;
    return normalizeProject({
      ...historyProject,
      editorState: {
        ...(historyProject.editorState ?? currentEditorState),
        mode: modeRef.current,
        timelineMode: timelineModeRef.current,
      },
    });
  }

  async function storeActiveProjectManifestPath(manifestPath: string) {
    localStorage.setItem(activeProjectManifestStorageKey, manifestPath);
    try {
      await writeStoredActiveProjectManifestPath(manifestPath);
    } catch {
      // Browser/dev can still rely on localStorage when host state is unavailable.
    }
  }

  async function loadProjectFromManifest(manifestPath: string) {
    const { project: loadedProject, sourceStatus: nextSourceStatus } = await projectPersistenceService.loadProject({ manifestPath });
    const normalizedProject = normalizeProject(loadedProject);
    const activeManifestPath = clipperContainerPath(manifestPath);
    const loadedCompositionSources = getProjectCompositionSources(normalizedProject);

    await storeActiveProjectManifestPath(activeManifestPath);
    setActiveProjectManifestPath(activeManifestPath);
    resetProjectHistory();
    replaceProject(normalizedProject, { history: false, syncSources: false });
    applyEditorState(normalizedProject.editorState!);
    setCompositionSources(loadedCompositionSources);
    setSavedProjectSnapshot(getProjectContentSnapshot(normalizedProject));
    setSavedCompositionSourcesSnapshot(JSON.stringify(loadedCompositionSources));
    setSourceStatus(manifestPath === activeManifestPath ? nextSourceStatus : `Migrated ${manifestPath} to ${activeManifestPath}. Save to write the .clipper container.`);
  }

  async function openProjectManifest() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;
      await loadProjectFromManifest(manifestPath);
      toast.success(<PathToastMessage action="Opened" path={manifestPath} />);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  function undoProjectChange() {
    const previousEntry = projectHistoryRef.current.past.at(-1);
    if (!previousEntry) return;
    const restoredProject = preserveCurrentPageMode(previousEntry.project);

    projectHistoryRef.current = {
      past: projectHistoryRef.current.past.slice(0, -1),
      future: [{ project: projectRef.current, implicitFileOperation: previousEntry.implicitFileOperation }, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
    };
    lastProjectHistoryAtRef.current = 0;
    projectRef.current = restoredProject;
    setProject(restoredProject);
    setTimelineMode(timelineModeRef.current);
    syncCompositionSourcesFromProject(restoredProject);
    if (previousEntry.implicitFileOperation) scheduleImplicitFileOperationSave(restoredProject);
  }

  function redoProjectChange() {
    const nextEntry = projectHistoryRef.current.future[0];
    if (!nextEntry) return;
    const restoredProject = preserveCurrentPageMode(nextEntry.project);

    projectHistoryRef.current = {
      past: [...projectHistoryRef.current.past, { project: projectRef.current, implicitFileOperation: nextEntry.implicitFileOperation }].slice(-maxProjectHistoryActions),
      future: projectHistoryRef.current.future.slice(1),
    };
    lastProjectHistoryAtRef.current = 0;
    projectRef.current = restoredProject;
    setProject(restoredProject);
    setTimelineMode(timelineModeRef.current);
    syncCompositionSourcesFromProject(restoredProject);
    if (nextEntry.implicitFileOperation) scheduleImplicitFileOperationSave(restoredProject);
  }

  function syncPlaybackDom(time: number) {
    if (playbackTimeLabelRef.current) playbackTimeLabelRef.current.textContent = formatPlaybackTimeLabel(time);
    const displayDuration = timelineDisplayDuration(sceneDurationSeconds, timelineEndPaddingFraction);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.setProperty("--clipper-playhead-left", `${displayDuration > 0 ? (time / displayDuration) * 100 : 0}%`);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.removeProperty("--clipper-playhead-x");
    if (playbackBorderScrubberRef.current) {
      const displayTime = getTimeSensitiveDisplayTime(time, visibleSceneAdjustmentLayers);
      const displayPlaybackDuration = getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
      const progress = displayPlaybackDuration > 0 ? `${clamp(displayTime / displayPlaybackDuration, 0, 1) * 100}%` : "0%";
      playbackBorderScrubberRef.current.max = String(Math.max(displayPlaybackDuration, 0.001));
      playbackBorderScrubberRef.current.value = String(clamp(displayTime, 0, displayPlaybackDuration));
      playbackBorderScrubberRef.current.style.setProperty("--clipper-playback-progress", progress);
      playbackBorderScrubberRef.current.setAttribute("aria-valuenow", String(clamp(displayTime, 0, displayPlaybackDuration)));
    }
  }

  function syncFrameVisualAdjustmentDom(time: number) {
    const element = frameViewportRef.current?.querySelector<HTMLElement>("[data-clipper-visual-adjustments]");
    if (!element) return;
    const style = applyAdjustmentLayersToVisualStyle(time, visibleSceneAdjustmentLayers);
    if (style.filter) element.style.filter = String(style.filter);
    else element.style.removeProperty("filter");
    syncVisualAdjustmentOverlayDom("frame", style.overlays?.filter((overlay) => overlay.target === "frame"));
    syncVisualAdjustmentOverlayDom("camera", style.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera"));
  }

  function syncVisualAdjustmentOverlayDom(target: "frame" | "camera", overlays: NonNullable<ReturnType<typeof applyAdjustmentLayersToVisualStyle>["overlays"]> | undefined) {
    const overlaysElement = frameViewportRef.current?.querySelector<HTMLElement>(`[data-clipper-visual-adjustment-overlays="${target}"]`);
    if (!overlaysElement) return;
    overlaysElement.replaceChildren(...(overlays ?? []).map((overlay) => {
      const overlayElement = document.createElement("div");
      overlayElement.className = "pointer-events-none absolute inset-0";
      overlayElement.style.zIndex = "2147483647";
      Object.assign(overlayElement.style, overlay.style);
      return overlayElement;
    }));
  }

  function formatPlaybackTimeLabel(time: number) {
    const displayDuration = getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
    const displayTime = clamp(getTimeSensitiveDisplayTime(time, visibleSceneAdjustmentLayers), 0, displayDuration);
    return `${formatTime(displayTime)} / ${formatTime(displayDuration)}`;
  }

  function scrubToPlaybackDisplayTime(displayTime: number) {
    scrubToSceneTime(getSceneTimeForTimeSensitiveDisplayTime(displayTime, sceneDurationSeconds, visibleSceneAdjustmentLayers));
  }

  function updatePlaybackClock(nextClock: PlaybackClock) {
    playbackClockRef.current = nextClock;
    setPlaybackClock(nextClock);
  }

  useEffect(() => {
    let previousTime = editorStore.getState().currentSceneTime;
    return editorStore.subscribe((state) => {
      const nextTime = state.currentSceneTime;
      if (Math.abs(nextTime - previousTime) < 0.001) return;
      previousTime = nextTime;
      if (timelineScrubbingRef.current) {
        setRenderCurrentSceneTime(nextTime);
        return;
      }

      startTransition(() => setRenderCurrentSceneTime(nextTime));
    });
  }, [editorStore]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    compositionSourcesRef.current = compositionSources;
  }, [compositionSources]);

  useEffect(() => {
    activeProjectManifestPathRef.current = activeProjectManifestPath;
  }, [activeProjectManifestPath]);

  useEffect(() => {
    savedProjectSnapshotRef.current = savedProjectSnapshot;
  }, [savedProjectSnapshot]);

  useEffect(() => {
    savedCompositionSourcesSnapshotRef.current = savedCompositionSourcesSnapshot;
  }, [savedCompositionSourcesSnapshot]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    timelineModeRef.current = timelineMode;
  }, [timelineMode]);

  useEffect(() => {
    activePartFilePathRef.current = hasActiveComposition ? part.filePath : "";
  }, [hasActiveComposition, part.filePath]);

  useEffect(() => {
    return window.clipper?.onVideoExportProgress?.((exportId, progress) => {
      if (videoExportIdRef.current !== exportId) return;
      setVideoExportProgress(progress);
    });
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      wasPlayingRef.current = true;
      return;
    }

    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      const settledTime = currentSceneTimeRef.current;
      syncPlaybackDom(settledTime);
      commitPlayheadEditorState(settledTime);
      if (Math.abs(settledTime - currentSceneTime) >= 0.001) setCurrentSceneTime(settledTime);
      return;
    }

    currentSceneTimeRef.current = currentSceneTime;
    if (timelineScrubbingRef.current) return;
    syncPlaybackDom(currentSceneTime);
  }, [currentSceneTime, isPlaying, sceneDurationSeconds, timelineEndPaddingFraction, visibleSceneAdjustmentLayers]);

  useEffect(() => {
    if (timelineScrubbingRef.current) return;
    commitPlayheadEditorState(currentSceneTime);
  }, [currentSceneTime]);

  useEffect(() => {
    function pausePlaybackForNumberScrub() {
      if (!isPlayingRef.current) {
        numberInputScrubPausedPlaybackRef.current = false;
        return;
      }

      numberInputScrubPausedPlaybackRef.current = true;
      pausePlaybackAtCurrentTime();
    }

    function resumePlaybackAfterNumberScrub() {
      if (!numberInputScrubPausedPlaybackRef.current) return;

      numberInputScrubPausedPlaybackRef.current = false;
      if (isPlayingRef.current) return;
      startPlaybackFromCurrentTime();
    }

    window.addEventListener(numberInputScrubStartEvent, pausePlaybackForNumberScrub);
    window.addEventListener(numberInputScrubEndEvent, resumePlaybackAfterNumberScrub);
    return () => {
      window.removeEventListener(numberInputScrubStartEvent, pausePlaybackForNumberScrub);
      window.removeEventListener(numberInputScrubEndEvent, resumePlaybackAfterNumberScrub);
    };
  }, [sceneDurationSeconds]);

  useEffect(() => {
    updateEditorState((state) => ({
      ...state,
      mode,
      timelineMode,
      leftPanelTab,
      rightPanelTab,
      selectedSceneId,
      selectedPartId: selectedPartId || undefined,
      selectedZoomMarker,
      selectedTranslationMarker: selectedZoomMarker ? null : selectedTranslationMarker,
      defaultNewMarkerDurationSeconds: markerDurationSeconds,
      timelineEndPaddingFraction,
      preview: {
        ...(state.preview ?? defaultPreviewViewportState),
        scale: framePreviewScale,
        zoomBarOpen: frameZoomBarOpen,
      },
    }));
  }, [framePreviewScale, frameZoomBarOpen, leftPanelTab, markerDurationSeconds, mode, rightPanelTab, selectedPartId, selectedSceneId, selectedTranslationMarker, selectedZoomMarker, timelineEndPaddingFraction, timelineMode]);

  useEffect(() => {
    if (!frameZoomBarOpen) return;
    function dismissFrameZoomBar(event: globalThis.PointerEvent) {
      const control = frameZoomControlRef.current;
      if (control?.contains(event.target as Node)) return;
      setFrameZoomBarOpen(false);
    }

    document.addEventListener("pointerdown", dismissFrameZoomBar, true);
    return () => document.removeEventListener("pointerdown", dismissFrameZoomBar, true);
  }, [frameZoomBarOpen, setFrameZoomBarOpen]);

  useEffect(() => () => {
    const drag = editorPanelResizeRef.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    editorPanelResizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onEditorPanelResizeMove, true);
    window.removeEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.removeEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }, []);

  useEffect(() => {
    const editorState = project.editorState;
    if (!editorState) return;
    const timeout = window.setTimeout(() => {
      projectPersistenceService.saveEditorState(activeProjectManifestPath, editorState).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeProjectManifestPath, editorStateSnapshot, project.editorState]);

  useEffect(() => {
    function openSettingsShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== ",") return;
      event.preventDefault();
      setSettingsOpen(true);
    }

    window.addEventListener("keydown", openSettingsShortcut);
    const unsubscribeSettingsShortcut = window.clipper?.onSettingsShortcut?.(() => setSettingsOpen(true));
    return () => {
      window.removeEventListener("keydown", openSettingsShortcut);
      unsubscribeSettingsShortcut?.();
    };
  }, []);

  useEffect(() => {
    return window.clipper?.onWindowFullscreenChange?.((fullscreen) => {
      if (!fullscreen && presentationModeRef.current === "frame") setPresentationMode(null);
    });
  }, []);

  useEffect(() => {
    presentationModeRef.current = presentationMode;
  }, [presentationMode]);

  useEffect(() => {
    function updatePresentationScale() {
      const rect = centerPreviewScrollRef.current?.getBoundingClientRect();
      const width = rect?.width || window.innerWidth;
      setPresentationScale(width / FRAME_WIDTH);
    }

    updatePresentationScale();
    const resizeObserver = new ResizeObserver(updatePresentationScale);
    if (centerPreviewScrollRef.current) resizeObserver.observe(centerPreviewScrollRef.current);
    window.addEventListener("resize", updatePresentationScale);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePresentationScale);
    };
  }, [presentationMode]);

  useEffect(() => {
    function clearRendererFullscreenPresentation() {
      if (!document.fullscreenElement && presentationModeRef.current === "frame") setPresentationMode(null);
    }

    document.addEventListener("fullscreenchange", clearRendererFullscreenPresentation);
    return () => document.removeEventListener("fullscreenchange", clearRendererFullscreenPresentation);
  }, []);

  useEffect(() => {
    if (isPlaying || !presentationMode) return;
    setPresentationDisplayTime(currentSceneTime);
  }, [currentSceneTime, isPlaying, presentationMode]);

  useEffect(() => {
    if (!presentationMode || !isPlaying) return;
    let frame = 0;

    function tick() {
      setPresentationDisplayTime(currentSceneTimeRef.current);
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, presentationMode]);

  useEffect(() => () => {
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    if (scrubFrameRef.current) cancelAnimationFrame(scrubFrameRef.current);
    if (framePickFrameRef.current) cancelAnimationFrame(framePickFrameRef.current);
    if (dragBoxFrameRef.current) cancelAnimationFrame(dragBoxFrameRef.current);
    if (objectDragFrameRef.current) cancelAnimationFrame(objectDragFrameRef.current);
    if (zoomScalePreviewFrameRef.current) cancelAnimationFrame(zoomScalePreviewFrameRef.current);
    if (centerPreviewScrollFrameRef.current) cancelAnimationFrame(centerPreviewScrollFrameRef.current);
    window.clearTimeout(presentationControlsTimeoutRef.current);
  }, []);

  useEffect(() => {
    setSourceStatus(initialSourceStatus);
  }, [initialSourceStatus]);

  useEffect(() => {
    if (selectedPartId && activeTimelinePart && activeTimelinePart.id !== selectedPartId) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
    }
  }, [activeTimelinePart, selectedPartId, selectedTranslationMarker, selectedZoomMarker]);

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
        const object = part.objects.find((item) => item.id === selected.id);
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
  }, [part.objects]);

  useEffect(() => {
    function clearFrameSelectionOnOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (isCodeEditorTarget(target) || isInspectorTarget(target) || isSelectPopoverTarget(target)) return;
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
    if (!isPlaying) return;
    let lastCommittedPartId = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(currentSceneTimeRef.current, visibleSceneAdjustmentLayers))?.id ?? activeTimelinePart?.id ?? "";
    let frame = 0;

    function tick(now: number) {
      const clock = playbackClockRef.current ?? { startedAt: now, startedFrom: currentSceneTimeRef.current };
      playbackClockRef.current = clock;
      const nextTime = advanceTimeSensitiveSceneTime(clock.startedFrom, (now - clock.startedAt) / 1000, sceneDurationSeconds, visibleSceneAdjustmentLayers);
      const nextTimelinePart = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(nextTime, visibleSceneAdjustmentLayers));
      const partChanged = Boolean(nextTimelinePart?.id && nextTimelinePart.id !== lastCommittedPartId);
      const shouldSyncReact = partChanged || nextTime >= sceneDurationSeconds;

      currentSceneTimeRef.current = nextTime;
      syncPlaybackDom(nextTime);

      if (shouldSyncReact) {
        lastCommittedPartId = nextTimelinePart?.id ?? lastCommittedPartId;
        setCurrentSceneTime(nextTime);
      }

      if (nextTime >= sceneDurationSeconds) {
        commitPlayheadEditorState(nextTime);
        updatePlaybackClock(null);
        setIsPlaying(false);
        return;
      }

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeTimelinePart?.id, isPlaying, sceneDurationSeconds, timeline, visibleSceneAdjustmentLayers]);

  useEffect(() => {
    if (!isPlaying) return;
    updatePlaybackClock({ startedAt: performance.now(), startedFrom: currentSceneTimeRef.current });
  }, [isPlaying, visibleSceneAdjustmentSignature]);

  useEffect(() => {
    if (isPlaying && currentSceneTime >= sceneDurationSeconds) {
      setIsPlaying(false);
    }
  }, [currentSceneTime, isPlaying, sceneDurationSeconds]);

  useEffect(() => {
    function switchModeShortcut(key: "1" | "2" | "3" | "4") {
      if (key === "1") updateMode("interactive");
      if (key === "2") updateMode("code");
      if (key === "3") updateTimelineMode("compose");
      if (key === "4") updateTimelineMode("composition");
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveAllChangesRef.current?.();
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key === "1") {
          event.preventDefault();
          switchModeShortcut("1");
          return;
        }

        if (event.key === "2") {
          event.preventDefault();
          switchModeShortcut("2");
          return;
        }

        if (event.key === "3") {
          event.preventDefault();
          switchModeShortcut("3");
          return;
        }

        if (event.key === "4") {
          event.preventDefault();
          switchModeShortcut("4");
          return;
        }
      }

      const target = event.target as HTMLElement | null;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && presentationModeRef.current) {
        const key = event.key.toLowerCase();
        if (key === "escape" || key === "f" || key === "t") {
          event.preventDefault();
          void exitPresentationMode();
          return;
        }

        if (event.code === "Space") {
          event.preventDefault();
          togglePlayback();
          showPresentationControls();
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          stepSceneTime(-1);
          showPresentationControls();
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          stepSceneTime(1);
          showPresentationControls();
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          jumpToStart();
          showPresentationControls();
          return;
        }

        if (event.key === "End") {
          event.preventDefault();
          jumpToEnd();
          showPresentationControls();
          return;
        }
      }

      if (event.key === "Escape" && cancelActiveSelector()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isCodeEditorTarget(target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProjectChange();
        else undoProjectChange();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProjectChange();
        return;
      }

      const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
      if (isTextEditingTarget(target)) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          void enterFrameFullscreen();
          return;
        }

        if (event.key.toLowerCase() === "t") {
          event.preventDefault();
          enterTheaterMode();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (copySelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        if (cutSelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteTimelineNodesSilently();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (marqueeDraggingRef.current) {
          marqueeSpacePanningRef.current = true;
          return;
        }
        togglePlayback();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpToEnd();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepSceneTime(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpToNextPart();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setIsPlaying(false);
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setScrubSnapEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setFastSelectEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (isDeleteKey && deleteSelectedTimelineNodes()) {
        event.preventDefault();
        return;
      }

    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") marqueeSpacePanningRef.current = false;
    }

    const unsubscribeModeShortcut = window.clipper?.onModeShortcut(switchModeShortcut);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      unsubscribeModeShortcut?.();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [focusPickZoomMarker, isPlaying, positionPickTranslationMarker, scene, sceneDurationSeconds, selectedAdjustmentLayer, selectedAdjustmentLayers, selectedPartId, selectedParts, selectedTranslationMarker, selectedTranslationMarkers, selectedZoomMarker, selectedZoomMarkers, timeline, trackerPickTranslationMarker]);

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

  function timelineClipFromPart(item: Part): TimelineClip {
    return {
      id: item.id,
      compositionId: item.compositionId ?? item.id,
      start: item.start,
      layerId: item.layerId,
      duration: item.duration,
      motionBlocks: [],
      zoomMarkers: [],
      translationMarkers: [],
    };
  }

  function updateTimelineViewportState(updater: (state: TimelineViewportState) => TimelineViewportState) {
    updateEditorState((state) => ({ ...state, timeline: updater(state.timeline ?? defaultTimelineViewportState), timelineMode }));
  }

  function updateTimelineLayers(updater: (state: TimelineLayerState) => TimelineLayerState, options: { history?: boolean } = {}) {
    updateEditorState((state) => ({ ...state, timelineLayers: updater(state.timelineLayers ?? defaultTimelineLayerState) }), { history: options.history, coalesceHistory: false });
  }

  function addMotionLayer(kind: TimelineMotionLayerKind = "empty", targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = { id: `motion_${Date.now().toString(36)}`, kind: kind === "empty" ? "empty" : "motion", name: kind === "empty" ? "New Motion" : "Motion" } as const;
    updateTimelineLayers((state) => ({
      ...state,
      motionLayers: insertTimelineStateLayer(state.motionLayers ?? defaultTimelineLayerState.motionLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function addAdjustmentTimelineLayer(targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = { id: `adjust_${Date.now().toString(36)}`, name: "New Adjust" };
    updateTimelineLayers((state) => ({
      ...state,
      adjustmentLayers: insertTimelineStateLayer(state.adjustmentLayers ?? defaultTimelineLayerState.adjustmentLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function addCompositionTimelineLayer(targetLayerId?: string, placement: "before" | "after" = "after") {
    const newLayer = { id: `comp_${Date.now().toString(36)}`, name: "New Composition" };
    updateTimelineLayers((state) => ({
      ...state,
      compositionLayers: insertTimelineStateLayer(state.compositionLayers ?? defaultTimelineLayerState.compositionLayers!, newLayer, targetLayerId, placement),
    }), { history: true });
  }

  function blankCompositionLayer() {
    return { id: "comp", name: "Composition" };
  }

  function blankAdjustmentLayer() {
    return { id: "adjust", name: "Adjust" };
  }

  function blankMotionLayer() {
    return { id: "motion", kind: "empty" as const, name: "Motion" };
  }

  function removeCompositionTimelineLayer(layerId: string) {
    const layers = getTimelineStateLayers(timelineLayers, "comp", defaultTimelineLayerState);
    const hasCompositions = scene.compositions.some((composition) => (composition.layerId ?? "comp") === layerId);
    const nextCompositionLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [blankCompositionLayer()];
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
    const nextAdjustmentLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [blankAdjustmentLayer()];
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
    const layers = motionLayers;
    const hasMarkers = motionLayerHasMarkers(layerId);
    const nextMotionLayers = layers.length > 1 ? layers.filter((layer) => layer.id !== layerId) : [blankMotionLayer()];
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
        const currentScene = current.scenes.find((item) => item.id === scene.id) ?? scene;
        const clipsById = new Map(removeTimelineMotionLayerMarkers(currentScene.compositions, layerId).map((item) => [item.id, timelineClipFromPart(item)]));
        return {
          ...timeline,
          clips: timeline.clips.map((clip) => clipsById.get(clip.id) ?? clip),
          zoomMarkers: (timeline.zoomMarkers ?? []).filter((marker) => !isMotionMarkerOnLayerId(marker, layerId)),
          translationMarkers: (timeline.translationMarkers ?? []).filter((marker) => !isMotionMarkerOnLayerId(marker, layerId)),
        };
      }),
    }), { history: true });

    if (hasMarkers) {
      setSelectedZoomMarker(null);
      setSelectedZoomMarkers([]);
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      setFocusPickZoomMarker(null);
      setPositionPickTranslationMarker(null);
      setTrackerPickTranslationMarker(null);
    }
  }

  function motionLayerHasMarkers(layerId: string) {
    return (scene.zoomMarkers ?? []).some((marker) => isMotionMarkerOnLayerId(marker, layerId))
      || (scene.translationMarkers ?? []).some((marker) => isMotionMarkerOnLayerId(marker, layerId));
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

  function updateTimelineMode(nextMode: TimelineMode) {
    timelineModeRef.current = nextMode;
    setTimelineMode(nextMode);
    if (nextMode === "compose" && modeRef.current !== "interactive") {
      modeRef.current = "interactive";
      setMode("interactive");
    }
    updateEditorState((state) => ({ ...state, timelineMode: nextMode, mode: nextMode === "compose" ? "interactive" : state.mode }));
  }

  function updateMode(nextMode: Mode) {
    modeRef.current = nextMode;
    setMode(nextMode);
    updateEditorState((state) => ({ ...state, mode: nextMode }));
  }

  function commitPlayheadEditorState(time: number) {
    const currentDuration = Math.max(sceneDurationSeconds, 0);
    const currentSceneTime = roundTwo(clamp(time, 0, currentDuration));
    updateEditorState((state) => (state.currentSceneTime === currentSceneTime ? state : { ...state, currentSceneTime }));
  }

  function updateCodeViewportState(filePath: string, viewportState: CodeViewportState) {
    updateEditorState((state) => {
      const currentViewportState = state.code?.[filePath];
      if (currentViewportState?.scrollLeft === viewportState.scrollLeft && currentViewportState.scrollTop === viewportState.scrollTop) return state;
      return {
        ...state,
        code: {
          ...(state.code ?? {}),
          [filePath]: viewportState,
        },
      };
    });
  }

  function updateObject(objectId: string, updater: (object: FrameObject) => FrameObject) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: composition.objects.map((object) => (object.id === objectId ? syncChartObjectBounds(updater(object)) : object)),
    }));
  }

  function updateSelectedObject(updater: (object: FrameObject) => FrameObject) {
    if (!selectedObjectId) return;
    updateObject(selectedObjectId, updater);
  }

  function updateTextObjectContent(objectId: string, content: string, richText?: RichTextSegment[]) {
    updateObject(objectId, (object) => (object.type === "text" ? { ...object, content, richText } : object));
  }

  function selectComposeLayerObject(object: FrameObject | null) {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    if (!object) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
      return;
    }

    setSelectedPartId(part.id);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedObjectId(object.id);
    setSelectionPayload(selectionPayloadFromObjects([selectionObjectFromFrameObject(object)]));
  }

  function selectComposeLayerObjects(objects: FrameObject[]) {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    if (objects.length === 0) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
      return;
    }

    setSelectedPartId(part.id);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedObjectId(objects[0].id);
    setSelectionPayload(selectionPayloadFromObjects(objects.map(selectionObjectFromFrameObject)));
  }

  function reorderComposeObjects(objectIds: string[], targetIndex: number) {
    const movingIds = new Set(objectIds);
    if (movingIds.size === 0) return;
    updateCompositionForTimelinePart(part.id, (composition) => {
      const movingObjects = composition.objects.filter((object) => movingIds.has(object.id));
      if (movingObjects.length === 0) return composition;
      const remainingObjects = composition.objects.filter((object) => !movingIds.has(object.id));
      const boundedIndex = Math.max(0, Math.min(targetIndex, remainingObjects.length));
      return {
        ...composition,
        objects: [...remainingObjects.slice(0, boundedIndex), ...movingObjects, ...remainingObjects.slice(boundedIndex)],
      };
    });
  }

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCompositionForTimelinePart(part.id, (composition) => ({ ...composition, frame: updater(composition.frame) }));
  }

  function updateSelectedPartDuration(duration: number) {
    if (!selectedPart) return;
    updateSceneParts((parts) => parts.map((item) => (item.id === selectedPart.id ? { ...item, duration } : item)));
  }

  function updatePartBackground(updater: (background: BackgroundLayer) => BackgroundLayer) {
    updateCompositionForTimelinePart(part.id, (composition) => ({ ...composition, background: updater(composition.background) }));
  }

  function clearMarkerSelection() {
    cancelFramePickPreview();
    setTrackerPickTranslationMarker(null);
    clearStoredMarkerSelection();
  }

  function clearNodeSelection() {
    cancelFramePickPreview();
    setTrackerPickTranslationMarker(null);
    clearStoredNodeSelection();
  }

  async function updateCompositionFromSource(basePart: Part, source: string, options: { syncSource?: boolean; history?: boolean } = {}) {
    const nextSources = { ...compositionSourcesRef.current, [basePart.filePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    const compositionId = basePart.compositionId ?? basePart.id;
    const nextPart = await compositionFromSource({ ...basePart, id: compositionId }, source);
    const nextProject = replacePartInProject({ ...projectRef.current, compositionSources: nextSources }, compositionId, (currentPart) => ({
      ...nextPart,
      zoomMarkers: currentPart.zoomMarkers,
      translationMarkers: currentPart.translationMarkers,
      snapshot: currentPart.snapshot,
    }));

    replaceProject(nextProject, { history: options.history, syncSources: options.syncSource !== false });

    setSourceStatus(`Preview updated from ${nextPart.filePath}.`);
  }

  async function saveProject(projectToSave = projectRef.current) {
    const syncedSources = getSyncedCompositionSources(projectToSave, getSavedProjectSnapshotProject(), compositionSourcesRef.current);
    if (syncedSources !== compositionSourcesRef.current) {
      compositionSourcesRef.current = syncedSources;
      setCompositionSources(syncedSources);
    }
    const embeddedProject = normalizeProject({ ...projectToSave, compositionSources: syncedSources });
    const persistedProject = serializeProjectForSave(embeddedProject);
    const projectSnapshot = getProjectContentSnapshot(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(persistedProject.compositionSources ?? {});

    try {
      const result = await projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPathRef.current, project: persistedProject });
      const savedProjectSnapshot = result.projectSnapshot ? getProjectContentSnapshot(JSON.parse(result.projectSnapshot) as ProjectManifest) : projectSnapshot;
      const savedCompositionSourcesSnapshot = result.compositionSourcesSnapshot || compositionSourcesSnapshot;
      setSavedProjectSnapshot(savedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(savedCompositionSourcesSnapshot);
      savedProjectSnapshotRef.current = savedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current = savedCompositionSourcesSnapshot;
      setSourceStatus(result.sourceStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save project.");
    }
  }

  async function saveAllChanges() {
    await saveProject(projectRef.current);
  }

  function scheduleImplicitFileOperationSave(projectOverride = projectRef.current, errorMessage = "Unable to save file operation.") {
    const projectSources = projectOverride === projectRef.current ? compositionSourcesRef.current : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({ ...projectOverride, compositionSources: projectSources });
    const projectSnapshot = getProjectContentSnapshot(projectToSave);
    const compositionSourcesSnapshot = JSON.stringify(projectToSave.compositionSources ?? {});
    setSavedProjectSnapshot(projectSnapshot);
    setSavedCompositionSourcesSnapshot(compositionSourcesSnapshot);
    savedProjectSnapshotRef.current = projectSnapshot;
    savedCompositionSourcesSnapshotRef.current = compositionSourcesSnapshot;

    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPathRef.current, project: projectToSave })
        .then((result) => setSourceStatus(result.sourceStatus))
        .catch((error) => toast.error(error instanceof Error ? error.message : errorMessage));
    }, 150);
  }

  function implicitFileOperation<T extends unknown[]>(operation: (...args: T) => void) {
    return (...args: T) => {
      operation(...args);
      markLastHistoryEntryAsImplicitFileOperation();
      scheduleImplicitFileOperationSave();
    };
  }

  async function exportProject() {
    setIsExporting(true);

    try {
      const result = await exportService.exportProject({
        project: projectRef.current,
        sceneId: selectedSceneId,
        format: projectExportFormat,
        includeSources: exportIncludeSources,
        compositionSources,
      });

      if (result.kind === "host") toast.success(<PathToastMessage action="Exported to" path={result.path} />);
      else toast.success("Export downloaded");

      setExportDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export project.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportRenderedMedia() {
    setIsExporting(true);
    setExportProgress(null);
    setVideoExportCancelling(false);
    const exportId = crypto.randomUUID();
    videoExportIdRef.current = exportId;

    try {
      const currentProject = projectRef.current;
      const { scene: currentScene, totalFrames, defaultFileName } = exportService.prepareRenderedMediaExport({ project: currentProject, sceneId: selectedSceneId });
      setExportDialogOpen(false);
      setExportProgress(`Rendering ${totalFrames} frames`);
      setVideoExportProgress({ frame: 0, totalFrames, percent: 0, status: "Preparing export..." });
      const exportPath = await exportService.renderVideoExport(exportId, defaultFileName, currentProject, currentScene);
      if (!exportPath) return;
      toast.success(<PathToastMessage action="Rendered video to" path={exportPath} />);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to render media.";
      if (!message.includes("Video export cancelled.")) toast.error(message);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setVideoExportProgress(null);
      setVideoExportCancelling(false);
      videoExportIdRef.current = null;
    }
  }

  async function stopVideoExport() {
    const exportId = videoExportIdRef.current;
    if (!exportId) return;
    setVideoExportCancelling(true);
    await exportService.cancelVideoExport(exportId);
  }

  useEffect(() => {
    saveAllChangesRef.current = saveAllChanges;
  });

  function selectPart(partId: string) {
    setSelectedPartId(partId);
    setSelectedParts(partId ? [{ partId }] : []);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function openComposePart(partId: string) {
    const timelinePart = timeline.find((item) => item.id === partId);
    if (!timelinePart) return;
    const currentTime = currentSceneTimeRef.current;
    const insidePart = currentTime >= timelinePart.start && currentTime < timelinePart.start + timelinePart.duration;
    selectPart(partId);
    if (!insidePart) scrubToSceneTime(timelinePart.start);
    updateTimelineMode("compose");
  }

  function selectZoomMarker(partId: string, markerId: string) {
    if (partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(partId);
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedParts([]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarkers(selection: ZoomMarkerSelection[]) {
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedZoomMarker(primarySelection);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setIsPlaying(false);
    if (primarySelection && primarySelection.partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(primarySelection.partId);
  }

  function startZoomFocusPick(partId: string, markerId: string) {
    if (focusPickZoomMarker?.partId === partId && focusPickZoomMarker.markerId === markerId) {
      setFocusPickZoomMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setFocusPickZoomMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function selectTranslationMarker(partId: string, markerId: string) {
    if (partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(partId);
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectTranslationMarkers(selection: TranslationMarkerSelection[]) {
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedTranslationMarker(primarySelection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (primarySelection && primarySelection.partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(primarySelection.partId);
  }

  function selectAdjustmentLayer(layerId: string) {
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers(layerId ? [{ layerId }] : []);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  function selectAdjustmentLayers(selection: AdjustmentLayerSelection[]) {
    setSelectedAdjustmentLayers(selection);
    setSelectedAdjustmentLayerId(selection.at(-1)?.layerId ?? null);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  function selectTimelineNodes(selection: { adjustmentLayers: AdjustmentLayerSelection[]; compositions: CompositionSelection[]; zoomMarkers: ZoomMarkerSelection[]; translationMarkers: TranslationMarkerSelection[] }) {
    const primaryZoom = selection.zoomMarkers.at(-1) ?? null;
    const primaryTranslation = selection.translationMarkers.at(-1) ?? null;
    const primaryPart = selection.compositions.at(-1) ?? null;
    setSelectedAdjustmentLayers(selection.adjustmentLayers);
    setSelectedAdjustmentLayerId(selection.adjustmentLayers.at(-1)?.layerId ?? null);
    setSelectedParts(selection.compositions);
    setSelectedZoomMarkers(selection.zoomMarkers);
    setSelectedZoomMarker(primaryZoom);
    setSelectedTranslationMarkers(selection.translationMarkers);
    setSelectedTranslationMarker(primaryTranslation);
    setSelectedPartId(primaryPart?.partId ?? "");
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
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

  function adjustmentSplitId(layer: AdjustmentLayer, _range: TimelineOverwriteRange, index: number) {
    return `${layer.id}_split_${Date.now().toString(36)}_${index.toString(36)}`;
  }

  function overwriteAdjustmentLayers(layers: AdjustmentLayer[], insertedIds: Set<string>) {
    const ranges = getInsertedOverwriteRanges(layers, insertedIds);
    return overwriteTimelineMarkers(layers, ranges, { createSplitId: adjustmentSplitId });
  }

  function updateAdjustmentLayer(layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) {
    updateSceneAdjustmentLayers((layers) => overwriteAdjustmentLayers(layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)), new Set([layerId])));
  }

  function moveAdjustmentLayer(layerId: string, start: number, targetLayerId?: string) {
    updateAdjustmentLayer(layerId, (layer) => ({ ...layer, layerId: targetLayerId ?? layer.layerId, start: roundTenth(Math.max(start, 0)) }));
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers([{ layerId }]);
    setSelectedPartId("");
  }

  function addAdjustmentLayer() {
    addAdjustmentLayerAt(defaultAdjustmentEffectPackage.id, currentSceneTimeRef.current, timelineLayers.adjustmentLayers?.[0]?.id);
  }

  function addAdjustmentLayerAt(effectId: AdjustmentEffectId, sceneTime: number, layerId?: string) {
    const effect = getAdjustmentEffectPackage(effectId);
    if (!effect) return;
    const placement = getAdjustmentPlacement(scene.adjustmentLayers, sceneDurationSeconds, sceneTime);
    const layer = effect.createDefaultLayer({ id: `adj_${Date.now().toString(36)}`, layerId, start: placement.start, duration: placement.duration });
    updateSceneAdjustmentLayers((layers) => overwriteAdjustmentLayers([...layers, layer], new Set([layer.id])));
    selectAdjustmentLayer(layer.id);
  }

  function deleteAdjustmentLayer(layerId: string) {
    updateSceneAdjustmentLayers((layers) => layers.filter((layer) => layer.id !== layerId));
    if (pointPickAdjustment?.layerId === layerId) setPointPickAdjustment(null);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
  }

  function startAdjustmentPointPick(layerId: string, control: AdjustmentEffectPointControl) {
    if (pointPickAdjustment?.layerId === layerId && pointPickAdjustment.control.xKey === control.xKey && pointPickAdjustment.control.yKey === control.yKey) {
      setPointPickAdjustment(null);
      setFramePickPreviewPoint(null);
      return;
    }

    selectAdjustmentLayer(layerId);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setIsPlaying(false);
    setPointPickAdjustment({ layerId, control });
    setFramePickPreviewPoint(null);
  }

  function startTranslationPositionPick(partId: string, markerId: string) {
    if (positionPickTranslationMarker?.partId === partId && positionPickTranslationMarker.markerId === markerId) {
      setPositionPickTranslationMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setPositionPickTranslationMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function startTranslationTrackerPick(partId: string, markerId: string) {
    if (trackerPickTranslationMarker?.partId === partId && trackerPickTranslationMarker.markerId === markerId) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setFramePickPreviewPoint(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
    setTrackerPickTranslationMarker({ partId, markerId });
  }

  function cancelActiveSelector() {
    if (!focusPickZoomMarker && !positionPickTranslationMarker && !trackerPickTranslationMarker && !pointPickAdjustment) return false;

    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setPointPickAdjustment(null);
    cancelFramePickPreview();
    return true;
  }

  function commitTranslationTrackerPick(objectId: string) {
    const pick = trackerPickTranslationMarker;
    if (!pick) return;

    if (!objectId) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    updateTranslationMarker(pick.partId, pick.markerId, (marker) => ({ ...marker, followId: objectId || undefined }));
    setTrackerPickTranslationMarker(null);
  }

  function scrubToSceneTime(time: number) {
    const nextTime = clamp(time, 0, sceneDurationSeconds);
    if (Math.abs(nextTime - currentSceneTimeRef.current) < 0.001) {
      if (!timelineScrubbingRef.current) commitPlayheadEditorState(nextTime);
      return;
    }

    currentSceneTimeRef.current = nextTime;
    if (isPlayingRef.current) updatePlaybackClock({ startedAt: performance.now(), startedFrom: nextTime });
    if (!timelineScrubbingRef.current) syncPlaybackDom(nextTime);
    else syncFrameVisualAdjustmentDom(nextTime);

    pendingScrubTimeRef.current = nextTime;
    if (scrubFrameRef.current) return;

    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      const committedTime = pendingScrubTimeRef.current;
      pendingScrubTimeRef.current = null;
      if (committedTime === null) return;
      if (!timelineScrubbingRef.current) commitPlayheadEditorState(committedTime);
      if (timelineScrubbingRef.current) {
        setCurrentSceneTime(committedTime);
        return;
      }

      startTransition(() => setCurrentSceneTime(committedTime));
    });
  }

  function pausePlaybackAtCurrentTime() {
    const settledTime = currentSceneTimeRef.current;
    syncPlaybackDom(settledTime);
    commitPlayheadEditorState(settledTime);
    setCurrentSceneTime(settledTime);
    setRenderCurrentSceneTime(settledTime);
    isPlayingRef.current = false;
    updatePlaybackClock(null);
    setIsPlaying(false);
  }

  function startPlaybackFromCurrentTime() {
    if (currentSceneTimeRef.current >= sceneDurationSeconds) {
      currentSceneTimeRef.current = 0;
      syncPlaybackDom(0);
      setCurrentSceneTime(0);
    }

    updatePlaybackClock({ startedAt: performance.now(), startedFrom: currentSceneTimeRef.current });
    isPlayingRef.current = true;
    setIsPlaying(true);
  }

  function pausePlaybackForTimelineScrub() {
    if (!isPlayingRef.current) {
      timelineScrubPausedPlaybackRef.current = false;
      return;
    }

    timelineScrubPausedPlaybackRef.current = true;
    pausePlaybackAtCurrentTime();
  }

  function resumePlaybackAfterTimelineScrub() {
    if (!timelineScrubPausedPlaybackRef.current) return;

    timelineScrubPausedPlaybackRef.current = false;
    if (isPlayingRef.current) return;
    startPlaybackFromCurrentTime();
  }

  function pausePlaybackForPresentationScrub() {
    if (!isPlayingRef.current) {
      presentationScrubPausedPlaybackRef.current = false;
      return;
    }

    presentationScrubPausedPlaybackRef.current = true;
    pausePlaybackAtCurrentTime();
  }

  function resumePlaybackAfterPresentationScrub() {
    if (!presentationScrubPausedPlaybackRef.current) return;

    presentationScrubPausedPlaybackRef.current = false;
    if (isPlayingRef.current) return;
    startPlaybackFromCurrentTime();
  }

  function togglePlayback() {
    if (isPlayingRef.current) {
      pausePlaybackAtCurrentTime();
      return;
    }

    startPlaybackFromCurrentTime();
  }

  function stepSceneTime(delta: number) {
    setIsPlaying(false);
    scrubToSceneTime(currentSceneTimeRef.current + delta);
  }

  function jumpToStart() {
    setIsPlaying(false);
    scrubToSceneTime(0);
  }

  function jumpToNextPart() {
    setIsPlaying(false);
    const nextPart = timeline.find((item) => item.start > currentSceneTimeRef.current + 0.001);
    scrubToSceneTime(nextPart?.start ?? sceneDurationSeconds);
  }

  function jumpToEnd() {
    setIsPlaying(false);
    scrubToSceneTime(sceneDurationSeconds);
  }

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

  function moveCompositionMarker(compositionId: string, start: number, layerId?: string) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const nextStart = composition.id === compositionId ? roundTenth(Math.max(start, 0)) : roundTenth(previousStart);
        const nextComposition = composition.id === compositionId
          ? { ...composition, start: nextStart, layerId: layerId || undefined }
          : { ...composition, start: nextStart };
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextStart);
      });
    });
  }

  function moveCompositionMarkers(moves: Array<{ compositionId: string; start: number; targetLayerId?: string }>) {
    if (moves.length === 0) return;
    const moveById = new Map(moves.map((move) => [move.compositionId, move]));
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const move = moveById.get(composition.id);
        const nextStart = roundTenth(Math.max(move?.start ?? previousStart, 0));
        const nextComposition = move
          ? { ...composition, start: nextStart, layerId: move.targetLayerId || undefined }
          : { ...composition, start: roundTenth(previousStart) };
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextStart);
      });
    });
  }

  function updateCompositionMarker(compositionId: string, updater: (composition: Part) => Part) {
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const startsById = new Map(timelineParts.map((composition) => [composition.id, composition.start]));
      return parts.map((composition) => {
        const previousStart = startsById.get(composition.id) ?? composition.start ?? 0;
        const withExplicitStart = { ...composition, start: roundTenth(previousStart) };
        const nextComposition = composition.id === compositionId ? updater(withExplicitStart) : withExplicitStart;
        return rebaseCompositionTimelineMarkers(nextComposition, previousStart, nextComposition.start ?? previousStart);
      });
    });
  }

  function deleteCompositionFromTimeline(compositionId: string) {
    deleteCompositionsFromTimeline([compositionId]);
  }

  function deleteCompositionsFromTimeline(compositionIds: string[]) {
    const deleteIds = new Set(compositionIds);
    if (deleteIds.size === 0) return;
    const firstDeletedIndex = scene.compositions.findIndex((composition) => deleteIds.has(composition.id));
    if (firstDeletedIndex < 0) return;
    const remaining = scene.compositions.filter((composition) => !deleteIds.has(composition.id));
    const nextSelection = remaining[firstDeletedIndex]?.id ?? remaining[firstDeletedIndex - 1]?.id ?? "";
    updateSceneParts((parts) => parts.filter((composition) => !deleteIds.has(composition.id)));
    setSelectedPartId(nextSelection);
    setSelectedParts(nextSelection ? [{ partId: nextSelection }] : []);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
  }

  function addCompositionFromLibrary(compositionId: string, targetLayerId?: string, start = currentSceneTimeRef.current) {
    const libraryComposition = compositionLibrary.find((composition) => composition.id === compositionId);
    if (!libraryComposition) return;
    const clipId = `clip_${Date.now().toString(36)}`;
    const layerId = targetLayerId ?? (timelineLayers.compositionLayers?.length ? timelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers!)?.[0]?.id ?? "comp";
    const timelineComposition = { ...libraryComposition, id: clipId, compositionId: libraryComposition.compositionId ?? libraryComposition.id, start: roundTenth(Math.max(start, 0)), layerId, zoomMarkers: [], translationMarkers: [], motionBlocks: [] };
    updateSceneParts((parts) => [...parts, timelineComposition]);
    setSelectedPartId(timelineComposition.id);
    clearNodeSelection();
    setSelectedPartId(timelineComposition.id);
    setSelectedParts([{ partId: timelineComposition.id }]);
  }

  function updateZoomMarker(partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, part) : marker))), translationMarkers }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function previewZoomScale(partId: string, markerId: string, scale: number) {
    if (timelineMode !== "composition" || isPickingZoomFocus) return;
    if (partId === TIMELINE_MOTION_PART_ID) {
      const activeStart = activeTimelinePart?.start ?? 0;
      const previewZoomMarkers = (scene.zoomMarkers ?? []).map((marker) => (marker.id === markerId ? { ...marker, scale } : marker)).map((marker) => ({ ...marker, start: marker.start - activeStart }));
      pendingZoomScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...part, zoomMarkers: previewZoomMarkers, translationMarkers: (scene.translationMarkers ?? []).map((marker) => ({ ...marker, start: marker.start - activeStart })) }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
      if (zoomScalePreviewFrameRef.current) return;
      zoomScalePreviewFrameRef.current = requestAnimationFrame(() => {
        zoomScalePreviewFrameRef.current = 0;
        const transform = pendingZoomScalePreviewRef.current;
        if (!transform || !cameraRef.current) return;
        cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
      });
      return;
    }
    const previewPart = scene.compositions.find((item) => item.id === partId);
    if (!previewPart || previewPart.id !== part.id) return;
    const previewZoomMarkers = previewPart.zoomMarkers.map((marker) => (marker.id === markerId ? { ...marker, scale } : marker));
    pendingZoomScalePreviewRef.current = getLayeredCameraPreviewTransform({ ...previewPart, zoomMarkers: previewZoomMarkers }, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition });
    if (zoomScalePreviewFrameRef.current) return;
    zoomScalePreviewFrameRef.current = requestAnimationFrame(() => {
      zoomScalePreviewFrameRef.current = 0;
      const transform = pendingZoomScalePreviewRef.current;
      if (!transform || !cameraRef.current) return;
      cameraRef.current.style.transform = formatCameraPreviewTransform(transform);
    });
  }

  function clearZoomScalePreview() {
    pendingZoomScalePreviewRef.current = null;
    if (zoomScalePreviewFrameRef.current) {
      cancelAnimationFrame(zoomScalePreviewFrameRef.current);
      zoomScalePreviewFrameRef.current = 0;
    }
  }

  function updateZoomMarkers(partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(updater(zoomMarkers, part)), translationMarkers }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(updater(item.zoomMarkers, item)), item.translationMarkers);
    }));
  }

  function updateZoomMarkerFocusGroup(partId: string, markerId: string, focus: Point) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const markerKeys = getMendedMarkerIds(absoluteMarkers, timelineMarkerKey(partId, markerId));
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const nextZoomMarkers = zoomMarkers.map((marker) => (markerKeys.has(timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id)) ? { ...marker, focus } : marker));
        return { zoomMarkers: normalizeMendedZoomMarkerFocus(nextZoomMarkers), translationMarkers };
      });
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      let changed = false;
      const zoomMarkers = item.zoomMarkers.map((marker) => (markerKeys.has(timelineMarkerKey(item.id, marker.id)) ? { ...marker, focus } : marker));
      for (let index = 0; index < zoomMarkers.length; index += 1) {
        if (zoomMarkers[index] !== item.zoomMarkers[index]) changed = true;
      }
      return changed ? withMotionMarkers(item, zoomMarkers, item.translationMarkers) : item;
    }));
  }

  function updateSelectedZoomSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedZoomMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    const timelineMotionIds = selectedIdsByPart.get(TIMELINE_MOTION_PART_ID);
    if (timelineMotionIds) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({
        zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.map((marker) => timelineMotionIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker)),
        translationMarkers,
      }));
      return;
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => {
        if (!selectedIds.has(marker.id)) return marker;
        return { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId };
      });
      return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(zoomMarkers), item.translationMarkers);
    }));
  }

  function updateSelectedTranslationSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedTranslationMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    const timelineMotionIds = selectedIdsByPart.get(TIMELINE_MOTION_PART_ID);
    if (timelineMotionIds) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({
        zoomMarkers,
        translationMarkers: translationMarkers.map((marker) => timelineMotionIds.has(marker.id) ? { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId } : marker),
      }));
      return;
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      return withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.map((marker) => {
        if (!selectedIds.has(marker.id)) return marker;
        return { ...marker, [key]: enabled || undefined, mendInId: key === "snapIn" ? undefined : marker.mendInId, mendOutId: key === "snapOut" ? undefined : marker.mendOutId };
      }));
    }));
  }

  function updateTranslationMarkers(partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: updater(translationMarkers, part) }));
      return;
    }
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, item.zoomMarkers, updater(item.translationMarkers, item));
    }));
  }

  function motionBlockFromMarker(marker: ZoomMarker | TranslationMarker): MotionBlock {
    return {
      ...marker,
      params: {
        ...marker.params,
        ease: marker.ease,
        focus: "focus" in marker ? marker.focus : undefined,
        followId: "followId" in marker ? marker.followId : undefined,
        mendInId: marker.mendInId,
        mendOutId: marker.mendOutId,
        middleEase: marker.middleEase,
        middleTransition: marker.middleTransition,
        perspective: "perspective" in marker ? marker.perspective : undefined,
        position: "position" in marker ? marker.position : undefined,
        rotation: "rotation" in marker ? marker.rotation : undefined,
        scale: "scale" in marker ? marker.scale : undefined,
        snapIn: marker.snapIn,
        snapOut: marker.snapOut,
      },
    };
  }

  function placeMotionMarkerOnTimeline<T extends ZoomMarker | TranslationMarker>(marker: T, absoluteStart: number, timelineParts: Array<Part & { start: number; end: number }>, targetLayerId?: string, preferredPartId?: string) {
    const timelinePart = timelineParts.find((item) => item.id === preferredPartId)
      ?? getTimelinePartAtTime(timelineParts, absoluteStart)
      ?? timelineParts[0];
    if (!timelinePart) return [];
    return [{
      partId: timelinePart.id,
      marker: {
        ...marker,
        layerId: targetLayerId ?? marker.layerId,
        start: roundTwo(absoluteStart - timelinePart.start),
      },
    }];
  }

  function applyMotionMarkerOverwrite(item: Part, zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[], insertedIds: Set<string>) {
    const protectedZoomIds = expandExplicitTimelineMarkerMendIds([...item.zoomMarkers, ...zoomMarkers], insertedIds, item.id);
    const protectedTranslationIds = expandExplicitTimelineMarkerMendIds([...item.translationMarkers, ...translationMarkers], insertedIds, item.id);
    const insertedRanges = getInsertedOverwriteRanges([...zoomMarkers, ...translationMarkers], new Set([...protectedZoomIds, ...protectedTranslationIds]));
    const splitIdSuffix = Date.now().toString(36);

    function trimCollection<T extends ZoomMarker | TranslationMarker>(markers: T[]) {
      return overwriteTimelineMarkers(markers, insertedRanges, { createSplitId: (marker, _range, index) => `${marker.id}_split_${splitIdSuffix}_${index.toString(36)}` });
    }

    return withMotionMarkers(item, normalizeMendedZoomMarkerFocus(trimCollection(zoomMarkers)), trimCollection(translationMarkers));
  }

  function applySceneMotionMarkerOverwrite(zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[], insertedIds: Set<string>) {
    const protectedZoomIds = expandExplicitTimelineMarkerMendIds(zoomMarkers, insertedIds, TIMELINE_MOTION_PART_ID);
    const protectedTranslationIds = expandExplicitTimelineMarkerMendIds(translationMarkers, insertedIds, TIMELINE_MOTION_PART_ID);
    const insertedRanges = getInsertedOverwriteRanges([...zoomMarkers, ...translationMarkers], new Set([...protectedZoomIds, ...protectedTranslationIds]));
    const splitIdSuffix = Date.now().toString(36);
    const trimCollection = <T extends ZoomMarker | TranslationMarker>(markers: T[]) => overwriteTimelineMarkers(markers, insertedRanges, { createSplitId: (marker, _range, index) => `${marker.id}_split_${splitIdSuffix}_${index.toString(36)}` });
    return { zoomMarkers: normalizeMendedZoomMarkerFocus(trimCollection(zoomMarkers)), translationMarkers: trimCollection(translationMarkers) };
  }

  function withMotionMarkers(item: Part, zoomMarkers: ZoomMarker[], translationMarkers: TranslationMarker[]): Part {
    const motionBlocks = [...zoomMarkers.map(motionBlockFromMarker), ...translationMarkers.map(motionBlockFromMarker)].sort((left, right) => left.start - right.start);
    return {
      ...item,
      motionBlocks,
      zoomMarkers: motionBlocksToZoomMarkers(motionBlocks),
      translationMarkers: motionBlocksToTranslationMarkers(motionBlocks),
    };
  }

  function timelineMoveKey(partId: string, markerId: string) {
    return `${partId}:${markerId}`;
  }

  function remapMovedMarkerMendIds<T extends ZoomMarker | TranslationMarker>(marker: T, movedMarkerKeys: Map<string, string>): T {
    const mendInId = marker.mendInId ? movedMarkerKeys.get(marker.mendInId) ?? marker.mendInId : marker.mendInId;
    const mendOutId = marker.mendOutId ? movedMarkerKeys.get(marker.mendOutId) ?? marker.mendOutId : marker.mendOutId;
    return mendInId === marker.mendInId && mendOutId === marker.mendOutId ? marker : { ...marker, mendInId, mendOutId };
  }

  function moveZoomMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) {
    assignAvailableMotionLayerKind(targetLayerId, "motion");
    if (sourcePartId === TIMELINE_MOTION_PART_ID || targetPartId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const marker = zoomMarkers.find((item) => item.id === markerId);
        if (!marker) return { zoomMarkers, translationMarkers };
        const nextMarker = { ...marker, layerId: targetLayerId ?? marker.layerId, start: roundTwo(start) };
        return applySceneMotionMarkerOverwrite([...zoomMarkers.filter((item) => item.id !== markerId), nextMarker], translationMarkers, new Set([markerId]));
      });
      setSelectedZoomMarker({ partId: TIMELINE_MOTION_PART_ID, markerId });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const targetTimelinePart = timelineParts.find((item) => item.id === targetPartId);
      const marker = sourcePart?.zoomMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !targetTimelinePart || !marker) return parts;
      const segments = placeMotionMarkerOnTimeline(marker, targetTimelinePart.start + start, timelineParts, targetLayerId, targetPartId);
      const insertedIds = new Set(segments.map((segment) => segment.marker.id));

      return parts.map((item) => {
        const itemSegments = segments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        const zoomMarkers = [...item.zoomMarkers.filter((current) => current.id !== markerId), ...itemSegments];
        if (itemSegments.length === 0 && zoomMarkers.length === item.zoomMarkers.length) return item;
        return applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });

    if (sourcePartId !== targetPartId) setSelectedZoomMarker({ partId: targetPartId, markerId });
  }

  function moveZoomMarkers(moves: TimelineMarkerMove[]) {
    for (const move of moves) assignAvailableMotionLayerKind(move.targetLayerId, "motion");
    if (moves.some((move) => move.sourcePartId === TIMELINE_MOTION_PART_ID || move.targetPartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const moveById = new Map(moves.map((move) => [move.markerId, move]));
        const insertedIds = new Set(moves.map((move) => move.markerId));
        const nextZoomMarkers = zoomMarkers.map((marker) => {
          const move = moveById.get(marker.id);
          return move ? remapMovedMarkerMendIds({ ...marker, layerId: move.targetLayerId ?? marker.layerId, start: roundTwo(move.start) }, new Map()) : marker;
        });
        return applySceneMotionMarkerOverwrite(nextZoomMarkers, translationMarkers, insertedIds);
      });
      const nextSelection = selectedZoomMarkers.map((selection) => ({ ...selection, partId: TIMELINE_MOTION_PART_ID }));
      setSelectedZoomMarkers(nextSelection);
      setSelectedZoomMarker(nextSelection.at(-1) ?? (moves[0] ? { partId: TIMELINE_MOTION_PART_ID, markerId: moves[0].markerId } : null));
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const movedMarkerKeys = new Map(moves.map((move) => [timelineMoveKey(move.sourcePartId, move.markerId), timelineMoveKey(move.targetPartId, move.markerId)]));
      const movedSegments = new Map<string, Array<{ partId: string; marker: ZoomMarker }>>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const targetTimelinePart = timelineParts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !targetTimelinePart || !marker) continue;

        const segments = placeMotionMarkerOnTimeline(remapMovedMarkerMendIds(marker, movedMarkerKeys), targetTimelinePart.start + move.start, timelineParts, move.targetLayerId, move.targetPartId);
        movedSegments.set(timelineMoveKey(move.sourcePartId, move.markerId), segments);
        for (const segment of segments) targetMovesByPart.set(segment.partId, [...(targetMovesByPart.get(segment.partId) ?? []), move]);
        removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
      }

      if (movedSegments.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((current) => !removeKeys.has(current.id)) : item.zoomMarkers;

        for (const move of targetMoves) {
          const segments = movedSegments.get(timelineMoveKey(move.sourcePartId, move.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          zoomMarkers = [...zoomMarkers.filter((current) => current.id !== move.markerId), ...segments.map((segment) => segment.marker)];
        }

        return zoomMarkers === item.zoomMarkers ? item : applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });

    const nextSelection = selectedZoomMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedZoomMarkers(nextSelection);
      setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedZoomMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function updateTranslationMarker(partId: string, markerId: string, updater: (marker: TranslationMarker, part: Part) => TranslationMarker) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker)));
    }));
  }

  function moveTranslationMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) {
    assignAvailableMotionLayerKind(targetLayerId, "motion");
    if (sourcePartId === TIMELINE_MOTION_PART_ID || targetPartId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const marker = translationMarkers.find((item) => item.id === markerId);
        if (!marker) return { zoomMarkers, translationMarkers };
        const nextMarker = { ...marker, layerId: targetLayerId ?? marker.layerId, start: roundTwo(start) };
        return applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers.filter((item) => item.id !== markerId), nextMarker], new Set([markerId]));
      });
      setSelectedTranslationMarker({ partId: TIMELINE_MOTION_PART_ID, markerId });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const targetTimelinePart = timelineParts.find((item) => item.id === targetPartId);
      const marker = sourcePart?.translationMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !targetTimelinePart || !marker) return parts;
      const segments = placeMotionMarkerOnTimeline(marker, targetTimelinePart.start + start, timelineParts, targetLayerId, targetPartId);
      const insertedIds = new Set(segments.map((segment) => segment.marker.id));

      return parts.map((item) => {
        const itemSegments = segments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        const translationMarkers = [...item.translationMarkers.filter((current) => current.id !== markerId), ...itemSegments];
        if (itemSegments.length === 0 && translationMarkers.length === item.translationMarkers.length) return item;
        return applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });

    if (sourcePartId !== targetPartId) setSelectedTranslationMarker({ partId: targetPartId, markerId });
  }

  function moveTranslationMarkers(moves: TimelineMarkerMove[]) {
    for (const move of moves) {
      const sourceMarker = scene.compositions.find((item) => item.id === move.sourcePartId)?.translationMarkers.find((item) => item.id === move.markerId);
      if (sourceMarker) assignAvailableMotionLayerKind(move.targetLayerId, "motion");
    }
    if (moves.some((move) => move.sourcePartId === TIMELINE_MOTION_PART_ID || move.targetPartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const moveById = new Map(moves.map((move) => [move.markerId, move]));
        const insertedIds = new Set(moves.map((move) => move.markerId));
        const nextTranslationMarkers = translationMarkers.map((marker) => {
          const move = moveById.get(marker.id);
          return move ? remapMovedMarkerMendIds({ ...marker, layerId: move.targetLayerId ?? marker.layerId, start: roundTwo(move.start) }, new Map()) : marker;
        });
        return applySceneMotionMarkerOverwrite(zoomMarkers, nextTranslationMarkers, insertedIds);
      });
      const nextSelection = selectedTranslationMarkers.map((selection) => ({ ...selection, partId: TIMELINE_MOTION_PART_ID }));
      setSelectedTranslationMarkers(nextSelection);
      setSelectedTranslationMarker(nextSelection.at(-1) ?? (moves[0] ? { partId: TIMELINE_MOTION_PART_ID, markerId: moves[0].markerId } : null));
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const movedMarkerKeys = new Map(moves.map((move) => [timelineMoveKey(move.sourcePartId, move.markerId), timelineMoveKey(move.targetPartId, move.markerId)]));
      const movedSegments = new Map<string, Array<{ partId: string; marker: TranslationMarker }>>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const targetTimelinePart = timelineParts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !targetTimelinePart || !marker) continue;

        const segments = placeMotionMarkerOnTimeline(remapMovedMarkerMendIds(marker, movedMarkerKeys), targetTimelinePart.start + move.start, timelineParts, move.targetLayerId, move.targetPartId);
        movedSegments.set(timelineMoveKey(move.sourcePartId, move.markerId), segments);
        for (const segment of segments) targetMovesByPart.set(segment.partId, [...(targetMovesByPart.get(segment.partId) ?? []), move]);
        removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
      }

      if (movedSegments.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let translationMarkers = removeKeys ? item.translationMarkers.filter((current) => !removeKeys.has(current.id)) : item.translationMarkers;

        for (const move of targetMoves) {
          const segments = movedSegments.get(timelineMoveKey(move.sourcePartId, move.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          translationMarkers = [...translationMarkers.filter((current) => current.id !== move.markerId), ...segments.map((segment) => segment.marker)];
        }

        return translationMarkers === item.translationMarkers ? item : applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });

    const nextSelection = selectedTranslationMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedTranslationMarkers(nextSelection);
      setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedTranslationMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function resizeZoomMarkers(resizes: TimelineMarkerResize[]) {
    if (resizes.some((resize) => resize.sourcePartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const resizeById = new Map(resizes.map((resize) => [resize.markerId, resize]));
        const insertedIds = new Set(resizes.map((resize) => resize.markerId));
        const nextZoomMarkers = zoomMarkers.map((marker) => {
          const resize = resizeById.get(marker.id);
          return resize ? { ...marker, start: roundTwo(resize.absoluteStart), duration: roundTwo(resize.duration) } : marker;
        });
        return applySceneMotionMarkerOverwrite(nextZoomMarkers, translationMarkers, insertedIds);
      });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const resizedSegments = new Map<string, Array<{ partId: string; marker: ZoomMarker }>>();
      const targetResizesByPart = new Map<string, TimelineMarkerResize[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const resize of resizes) {
        const sourcePart = parts.find((item) => item.id === resize.sourcePartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === resize.markerId);
        if (!sourcePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline({ ...marker, duration: resize.duration }, resize.absoluteStart, timelineParts, undefined, resize.sourcePartId);
        resizedSegments.set(timelineMoveKey(resize.sourcePartId, resize.markerId), segments);
        for (const segment of segments) targetResizesByPart.set(segment.partId, [...(targetResizesByPart.get(segment.partId) ?? []), resize]);
        removeKeysByPart.set(resize.sourcePartId, (removeKeysByPart.get(resize.sourcePartId) ?? new Set()).add(resize.markerId));
      }

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetResizes = targetResizesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((marker) => !removeKeys.has(marker.id)) : item.zoomMarkers;

        for (const resize of targetResizes) {
          const segments = resizedSegments.get(timelineMoveKey(resize.sourcePartId, resize.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          zoomMarkers = [...zoomMarkers.filter((marker) => marker.id !== resize.markerId), ...segments.map((segment) => segment.marker)];
        }

        return zoomMarkers === item.zoomMarkers ? item : applyMotionMarkerOverwrite(item, zoomMarkers, item.translationMarkers, insertedIds);
      });
    });
  }

  function resizeTranslationMarkers(resizes: TimelineMarkerResize[]) {
    if (resizes.some((resize) => resize.sourcePartId === TIMELINE_MOTION_PART_ID)) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => {
        const resizeById = new Map(resizes.map((resize) => [resize.markerId, resize]));
        const insertedIds = new Set(resizes.map((resize) => resize.markerId));
        const nextTranslationMarkers = translationMarkers.map((marker) => {
          const resize = resizeById.get(marker.id);
          return resize ? { ...marker, start: roundTwo(resize.absoluteStart), duration: roundTwo(resize.duration) } : marker;
        });
        return applySceneMotionMarkerOverwrite(zoomMarkers, nextTranslationMarkers, insertedIds);
      });
      return;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const resizedSegments = new Map<string, Array<{ partId: string; marker: TranslationMarker }>>();
      const targetResizesByPart = new Map<string, TimelineMarkerResize[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const resize of resizes) {
        const sourcePart = parts.find((item) => item.id === resize.sourcePartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === resize.markerId);
        if (!sourcePart || !marker) continue;
        const segments = placeMotionMarkerOnTimeline({ ...marker, duration: resize.duration }, resize.absoluteStart, timelineParts, undefined, resize.sourcePartId);
        resizedSegments.set(timelineMoveKey(resize.sourcePartId, resize.markerId), segments);
        for (const segment of segments) targetResizesByPart.set(segment.partId, [...(targetResizesByPart.get(segment.partId) ?? []), resize]);
        removeKeysByPart.set(resize.sourcePartId, (removeKeysByPart.get(resize.sourcePartId) ?? new Set()).add(resize.markerId));
      }

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetResizes = targetResizesByPart.get(item.id) ?? [];
        const insertedIds = new Set<string>();
        let translationMarkers = removeKeys ? item.translationMarkers.filter((marker) => !removeKeys.has(marker.id)) : item.translationMarkers;

        for (const resize of targetResizes) {
          const segments = resizedSegments.get(timelineMoveKey(resize.sourcePartId, resize.markerId))?.filter((segment) => segment.partId === item.id) ?? [];
          for (const segment of segments) insertedIds.add(segment.marker.id);
          translationMarkers = [...translationMarkers.filter((marker) => marker.id !== resize.markerId), ...segments.map((segment) => segment.marker)];
        }

        return translationMarkers === item.translationMarkers ? item : applyMotionMarkerOverwrite(item, item.zoomMarkers, translationMarkers, insertedIds);
      });
    });
  }

  function deleteZoomMarker(partId: string, markerId: string) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.filter((marker) => marker.id !== markerId)), translationMarkers }));
      setSelectedZoomMarker(null);
      setSelectedZoomMarkers([]);
      setFocusPickZoomMarker(null);
      return;
    }
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? withMotionMarkers(item, item.zoomMarkers.filter((marker) => marker.id !== markerId), item.translationMarkers) : item)));
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
  }

  function deleteTranslationMarker(partId: string, markerId: string) {
    if (partId === TIMELINE_MOTION_PART_ID) {
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.filter((marker) => marker.id !== markerId) }));
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      setPositionPickTranslationMarker(null);
      return;
    }
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.filter((marker) => marker.id !== markerId)) : item)));
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function uniqueTimelineMarkerSelections<T extends { partId: string; markerId: string }>(selection: T[]) {
    return Array.from(new Map(selection.map((item) => [`${item.partId}:${item.markerId}`, item])).values());
  }

  function getSelectedTimelineNodeClipboard(showToast = false): TimelineNodeClipboard | null {
    if (selectedAdjustmentLayers.length > 0) {
      const nodes = selectedAdjustmentLayers.flatMap((selection) => {
        const layer = scene.adjustmentLayers?.find((item) => item.id === selection.layerId);
        return layer ? [{ absoluteStart: layer.start, layer }] : [];
      });
      if (nodes.length > 0) return { kind: "adjustment", nodes };
    }

    if (selectedAdjustmentLayer) {
      return { kind: "adjustment", nodes: [{ absoluteStart: selectedAdjustmentLayer.start, layer: selectedAdjustmentLayer }] };
    }

    const zoomSelection = uniqueTimelineMarkerSelections(selectedZoomMarkers.length > 0 ? selectedZoomMarkers : selectedZoomMarker ? [selectedZoomMarker] : []);
    const zoomNodes = zoomSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = (scene.zoomMarkers ?? []).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (zoomNodes.length > 0) return { kind: "zoom", nodes: zoomNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    const translationSelection = uniqueTimelineMarkerSelections(selectedTranslationMarkers.length > 0 ? selectedTranslationMarkers : selectedTranslationMarker ? [selectedTranslationMarker] : []);
    const translationNodes = translationSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = (scene.translationMarkers ?? []).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.translationMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (translationNodes.length > 0) return { kind: "translation", nodes: translationNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    if (showToast && (selectedPartId || selectedParts.length > 0)) toast.error("Compositions can't be copied.");
    return null;
  }

  function getTimelineNodeClipboardForTarget(target: TimelineNodeContextTarget): TimelineNodeClipboard | null {
    if (target.kind === "part") return null;

    if (target.kind === "adjustment") {
      const layer = scene.adjustmentLayers?.find((item) => item.id === target.layerId);
      return layer ? { kind: "adjustment", nodes: [{ absoluteStart: layer.start, layer }] } : null;
    }

    if (target.partId === TIMELINE_MOTION_PART_ID) {
      if (target.kind === "zoom") {
        const marker = (scene.zoomMarkers ?? []).find((item) => item.id === target.markerId);
        return marker ? { kind: "zoom", nodes: [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] } : null;
      }
      const marker = (scene.translationMarkers ?? []).find((item) => item.id === target.markerId);
      return marker ? { kind: "translation", nodes: [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] } : null;
    }

    const timelinePart = timeline.find((item) => item.id === target.partId);
    if (!timelinePart) return null;

    if (target.kind === "zoom") {
      const marker = timelinePart.zoomMarkers.find((item) => item.id === target.markerId);
      return marker ? { kind: "zoom", nodes: [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] } : null;
    }

    const marker = timelinePart.translationMarkers.find((item) => item.id === target.markerId);
    return marker ? { kind: "translation", nodes: [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] } : null;
  }

  function deleteTimelineClipboardNodes(clipboard: TimelineNodeClipboard) {
    if (clipboard.kind === "adjustment") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneAdjustmentLayers((layers) => layers.filter((layer) => !layerIds.has(layer.id)));
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
      return;
    }

    if (clipboard.kind === "zoom") {
      if (clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const markerIds = new Set(clipboard.nodes.map((node) => node.marker.id));
        updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.filter((marker) => !markerIds.has(marker.id))), translationMarkers }));
        setSelectedZoomMarker(null);
        setSelectedZoomMarkers([]);
        setFocusPickZoomMarker(null);
        return;
      }
      const markerIdsByPart = new Map<string, Set<string>>();
      for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
      updateSceneParts((parts) => parts.map((item) => {
        const markerIds = markerIdsByPart.get(item.id);
        return markerIds ? withMotionMarkers(item, item.zoomMarkers.filter((marker) => !markerIds.has(marker.id)), item.translationMarkers) : item;
      }));
      setSelectedZoomMarker(null);
      setSelectedZoomMarkers([]);
      setFocusPickZoomMarker(null);
      return;
    }

    if (clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
      const markerIds = new Set(clipboard.nodes.map((node) => node.marker.id));
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.filter((marker) => !markerIds.has(marker.id)) }));
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      setPositionPickTranslationMarker(null);
      return;
    }

    const markerIdsByPart = new Map<string, Set<string>>();
    for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
    updateSceneParts((parts) => parts.map((item) => {
      const markerIds = markerIdsByPart.get(item.id);
      return markerIds ? withMotionMarkers(item, item.zoomMarkers, item.translationMarkers.filter((marker) => !markerIds.has(marker.id))) : item;
    }));
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function deleteSelectedTimelineNodes() {
    const adjustmentLayerIds = selectedAdjustmentLayers.length > 0 ? selectedAdjustmentLayers.map((selection) => selection.layerId) : selectedAdjustmentLayer ? [selectedAdjustmentLayer.id] : [];
    const compositionIds = selectedParts.length > 0 ? selectedParts.map((selection) => selection.partId) : selectedPartId && !selectedZoomMarker && !selectedTranslationMarker ? [selectedPartId] : [];
    const zoomSelection = uniqueTimelineMarkerSelections(selectedZoomMarkers.length > 0 ? selectedZoomMarkers : selectedZoomMarker ? [selectedZoomMarker] : []);
    const translationSelection = uniqueTimelineMarkerSelections(selectedTranslationMarkers.length > 0 ? selectedTranslationMarkers : selectedTranslationMarker ? [selectedTranslationMarker] : []);
    const hasSelection = adjustmentLayerIds.length > 0 || compositionIds.length > 0 || zoomSelection.length > 0 || translationSelection.length > 0;
    if (!hasSelection) return false;

    if (compositionIds.length > 0) deleteCompositionsFromTimeline(compositionIds);

    const adjustmentNodes = (scene.adjustmentLayers ?? []).filter((layer) => adjustmentLayerIds.includes(layer.id)).map((layer) => ({ absoluteStart: layer.start, layer }));
    if (adjustmentNodes.length > 0) deleteTimelineClipboardNodes({ kind: "adjustment", nodes: adjustmentNodes });

    const zoomNodes = zoomSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = (scene.zoomMarkers ?? []).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (zoomNodes.length > 0) deleteTimelineClipboardNodes({ kind: "zoom", nodes: zoomNodes });

    const translationNodes = translationSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = (scene.translationMarkers ?? []).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.translationMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (translationNodes.length > 0) deleteTimelineClipboardNodes({ kind: "translation", nodes: translationNodes });

    return true;
  }

  function copySelectedTimelineNodes(showToast = false) {
    const clipboard = getSelectedTimelineNodeClipboard(showToast);
    if (!clipboard) return false;
    timelineNodeClipboardRef.current = clipboard;
    return true;
  }

  function cutSelectedTimelineNodes() {
    const clipboard = getSelectedTimelineNodeClipboard(true);
    if (!clipboard) return false;

    timelineNodeClipboardRef.current = clipboard;
    deleteTimelineClipboardNodes(clipboard);

    toast.success(`${clipboard.nodes.length} timeline node${clipboard.nodes.length === 1 ? "" : "s"} cut`);
    return true;
  }

  function pastedTimelineNodeId(prefix: string, index: number) {
    return `${prefix}_${Date.now().toString(36)}_${index.toString(36)}`;
  }

  function pasteTimelineNodes(targetStart?: number) {
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    const pasteStart = clamp(targetStart ?? currentSceneTimeRef.current, 0, sceneDurationSeconds);
    const sourceStart = Math.min(...clipboard.nodes.map((node) => node.absoluteStart));

    if (clipboard.kind === "adjustment") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        return { ...node.layer, id: pastedTimelineNodeId("adj", index), name: `${node.layer.name} copy`, start: roundTenth(start) };
      });
      updateSceneAdjustmentLayers((layers) => overwriteAdjustmentLayers([...layers, ...pastedLayers], new Set(pastedLayers.map((layer) => layer.id))));
      selectAdjustmentLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "zoom") {
      const pastedSelections: ZoomMarkerSelection[] = [];
      if (clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const pastedMarkers = clipboard.nodes.map((node, index) => ({ ...node.marker, id: pastedTimelineNodeId("zom", index), start: roundTwo(clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds)) }));
        updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite([...zoomMarkers, ...pastedMarkers], translationMarkers, new Set(pastedMarkers.map((marker) => marker.id))));
        selectZoomMarkers(pastedMarkers.map((marker) => ({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id })));
        return true;
      }
      updateSceneParts((parts) => {
        const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
        const pastedSegments = clipboard.nodes.flatMap((node, index) => {
          const absoluteStart = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
          const marker = { ...node.marker, id: pastedTimelineNodeId("zom", index) };
          return placeMotionMarkerOnTimeline(marker, absoluteStart, timelineParts);
        });
        const insertedIds = new Set(pastedSegments.map((segment) => segment.marker.id));
        pastedSelections.push(...pastedSegments.map((segment) => ({ partId: segment.partId, markerId: segment.marker.id })));

        return parts.map((item) => {
          const itemSegments = pastedSegments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
          return itemSegments.length > 0 ? applyMotionMarkerOverwrite(item, [...item.zoomMarkers, ...itemSegments], item.translationMarkers, insertedIds) : item;
        });
      });
      if (pastedSelections.length === 0) return false;
      selectZoomMarkers(pastedSelections);
      return true;
    }

    const pastedSelections: TranslationMarkerSelection[] = [];
    if (clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
      const pastedMarkers = clipboard.nodes.map((node, index) => ({ ...node.marker, id: pastedTimelineNodeId("trn", index), start: roundTwo(clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds)) }));
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers, ...pastedMarkers], new Set(pastedMarkers.map((marker) => marker.id))));
      selectTranslationMarkers(pastedMarkers.map((marker) => ({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id })));
      return true;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const pastedSegments = clipboard.nodes.flatMap((node, index) => {
        const absoluteStart = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        const marker = { ...node.marker, id: pastedTimelineNodeId("trn", index) };
        return placeMotionMarkerOnTimeline(marker, absoluteStart, timelineParts);
      });
      const insertedIds = new Set(pastedSegments.map((segment) => segment.marker.id));
      pastedSelections.push(...pastedSegments.map((segment) => ({ partId: segment.partId, markerId: segment.marker.id })));

      return parts.map((item) => {
        const itemSegments = pastedSegments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        return itemSegments.length > 0 ? applyMotionMarkerOverwrite(item, item.zoomMarkers, [...item.translationMarkers, ...itemSegments], insertedIds) : item;
      });
    });
    if (pastedSelections.length === 0) return false;
    selectTranslationMarkers(pastedSelections);
    return true;
  }

  function pasteTimelineNodesSilently() {
    pasteTimelineNodes();
  }

  function openTimelineBlankContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineBlankContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const pasteStart = target.time;
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Paste", action: () => { pasteTimelineNodes(pasteStart); }, disabled: !timelineNodeClipboardRef.current },
      ],
    });
  }

  function openTimelineNodeContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const targetKey = `${"partId" in target ? target.partId : ""}:${"markerId" in target ? target.markerId : "layerId" in target ? target.layerId : ""}`;
    const targetAlreadySelected = target.kind === "adjustment"
      ? selectedAdjustmentLayers.some((selection) => selection.layerId === target.layerId) || selectedAdjustmentLayerId === target.layerId
      : target.kind === "part"
        ? selectedParts.some((selection) => selection.partId === target.partId) || selectedPartId === target.partId
        : target.kind === "zoom"
        ? selectedZoomMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedZoomMarker?.partId === target.partId && selectedZoomMarker.markerId === target.markerId)
        : selectedTranslationMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedTranslationMarker?.partId === target.partId && selectedTranslationMarker.markerId === target.markerId);
    const menuClipboard = targetAlreadySelected ? getSelectedTimelineNodeClipboard() : getTimelineNodeClipboardForTarget(target);
    if (target.kind === "adjustment") selectAdjustmentLayer(target.layerId);
    if (target.kind === "part" && !targetAlreadySelected) selectPart(target.partId);
    if (target.kind === "zoom") selectZoomMarker(target.partId, target.markerId);
    if (target.kind === "translation") selectTranslationMarker(target.partId, target.markerId);
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Copy", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
        } },
        { label: "Cut", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
          deleteTimelineClipboardNodes(menuClipboard);
          toast.success(`${menuClipboard.nodes.length} timeline node${menuClipboard.nodes.length === 1 ? "" : "s"} cut`);
        } },
        { label: "Paste", action: () => { pasteTimelineNodes(target.time); }, disabled: !timelineNodeClipboardRef.current },
        { label: "Delete", danger: true, action: () => {
          if (target.kind === "part") deleteCompositionsFromTimeline(targetAlreadySelected ? selectedParts.map((selection) => selection.partId) : [target.partId]);
          if (target.kind !== "part" && menuClipboard) deleteTimelineClipboardNodes(menuClipboard);
        } },
      ],
    });
  }

  function addZoomMarker() {
    const placement = getAvailableZoomPlacement(part.zoomMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s zoom marker.");
      return;
    }

    const marker: ZoomMarker = {
      id: `zom_${Date.now().toString(36)}`,
      start: placement.start,
      duration: placement.duration,
      focus: selectedObject ? centerOf(selectedObject.bounds) : { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      scale: 1.8,
    };
    updateCurrentPart({ ...part, zoomMarkers: [...part.zoomMarkers, marker] });
    setSelectedZoomMarker({ partId: part.id, markerId: marker.id });
    setSelectedZoomMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
  }

  function addTranslationMarker() {
    const effect = getMotionEffectByKind("pan");
    if (!effect) return;
    const placement = getAvailableZoomPlacement(part.translationMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s pan marker.");
      return;
    }

    const marker = effect.createDefaultBlock({ id: `trn_${Date.now().toString(36)}`, layerId: effect.id, start: placement.start, duration: placement.duration, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, position: selectedObject ? framePointToCameraTranslation(centerOf(selectedObject.bounds)) : { x: 0, y: 0 } }) as TranslationMarker;
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function addRotationMarker() {
    const effect = getMotionEffectByKind("rotate");
    if (!effect) return;
    const rotationMarkers = part.translationMarkers.filter((marker) => marker.effectId === effect.id);
    const placement = getAvailableZoomPlacement(rotationMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s rotate marker.");
      return;
    }

    const marker = effect.createDefaultBlock({ id: `rot_${Date.now().toString(36)}`, layerId: effect.id, start: placement.start, duration: placement.duration, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, position: { x: 0, y: 0 } }) as TranslationMarker;
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function isMotionLayerVacant(layerId: string) {
    return !(scene.zoomMarkers ?? []).some((marker) => getZoomMarkerLayerId(marker) === layerId)
      && !(scene.translationMarkers ?? []).some((marker) => getTranslationMarkerLayerId(marker) === layerId);
  }

  function addMotionEffect(effectId: MotionEffectId, layerId: string, sceneTime: number) {
    const effect = getMotionEffectPackage(effectId);
    if (!effect) return;
    const kind = effect.kind;
    const targetLayer = motionLayers.find((layer) => layer.id === layerId);
    const canRetagLayer = targetLayer?.kind === "empty";
    if (!targetLayer) return;

    if (canRetagLayer) {
      updateTimelineLayers((state) => ({
        ...state,
          motionLayers: (state.motionLayers ?? []).map((layer) => (layer.id === layerId ? { ...layer, kind: "motion" } : layer)),
      }), { history: true });
    }

    const duration = Math.min(markerDurationSeconds, Math.max(sceneDurationSeconds, 0.1));
    const absoluteStart = roundTenth(Math.max(sceneTime - duration / 2, 0));
    const markerIdPrefix = kind === "zoom" ? "zom" : kind === "rotate" ? "rot" : kind === "perspective" ? "prs" : "trn";
    const marker = createDefaultMotionBlockByEffectId(effect.id, {
      id: `${markerIdPrefix}_${Date.now().toString(36)}`,
      layerId,
      start: 0,
      duration,
      focus: selectedObject ? centerOf(selectedObject.bounds) : { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      position: selectedObject ? framePointToCameraTranslation(centerOf(selectedObject.bounds)) : { x: 0, y: 0 },
    });
    if (kind === "zoom") {
      const zoomMarker = motionBlocksToZoomMarkers([marker])[0];
      if (!zoomMarker) return;
      const nextMarker = { ...zoomMarker, start: absoluteStart, layerId };
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite([...zoomMarkers, nextMarker], translationMarkers, new Set([nextMarker.id])));
      const selection = [{ partId: TIMELINE_MOTION_PART_ID, markerId: nextMarker.id }];
      setSelectedZoomMarker(selection[0]);
      setSelectedZoomMarkers(selection);
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      return;
    }

    const translationMarker = motionBlocksToTranslationMarkers([marker])[0];
    if (!translationMarker) return;
    const nextMarker = { ...translationMarker, start: absoluteStart, layerId };
    updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers, nextMarker], new Set([nextMarker.id])));
    const selection = [{ partId: TIMELINE_MOTION_PART_ID, markerId: nextMarker.id }];
    setSelectedTranslationMarker(selection[0]);
    setSelectedTranslationMarkers(selection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
  }

  function timelineMarkerKey(partId: string, markerId: string) {
    return `${partId}:${markerId}`;
  }

  function parseTimelineMarkerKey(key: string) {
    const separatorIndex = key.indexOf(":");
    return separatorIndex >= 0 ? { partId: key.slice(0, separatorIndex), markerId: key.slice(separatorIndex + 1) } : { partId: "", markerId: key };
  }

  function getAbsoluteZoomMarkers() {
    return (scene.zoomMarkers ?? []).map((marker) => ({ ...marker, id: timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id), partId: TIMELINE_MOTION_PART_ID, start: marker.start }));
  }

  function getAbsoluteTranslationMarkers() {
    return (scene.translationMarkers ?? []).map((marker) => ({ ...marker, id: timelineMarkerKey(TIMELINE_MOTION_PART_ID, marker.id), partId: TIMELINE_MOTION_PART_ID, start: marker.start }));
  }

  function uniqueMarkerSelections(keys: string[]) {
    return Array.from(new Map(keys.map((key) => {
      const selection = parseTimelineMarkerKey(key);
      return [key, selection];
    })).values()).filter((selection) => selection.partId);
  }

  function snapZoomMiddle(targetPart = part) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const absolutePreviewTime = (activeTimelinePart?.start ?? 0) + previewTime;
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey)
      ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey)
      ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey)
      ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey)
      ?? (targetPart.id === part.id ? getZoomMiddleSnap(absoluteMarkers, absolutePreviewTime, getZoomMarkerMendKey) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(absoluteMarkers, snap);
    const selectedIds = new Set(selectedZoomIds.length > 0 ? selectedZoomIds : targetPartSelectedZoomIds);
    const nextSelection = snap.pairs.length > 1
      ? uniqueMarkerSelections(absoluteMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => marker.id))
      : uniqueMarkerSelections([snap.pairs[0].previousId, snap.pairs[0].nextId]);
    const nextBounds = new Map(absoluteMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    const sharedFocus = absoluteMarkers.find((marker) => marker.id === snap.pairs[0].previousId)?.focus;

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true, mendInId: pair.previousId });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      const timelinePart = buildLinearTimeline({ ...scene, compositions: parts }).find((item) => item.id === currentPart.id);
      if (!timelinePart) return currentPart;
      const zoomMarkers = currentPart.zoomMarkers.map((marker) => {
        const key = timelineMarkerKey(currentPart.id, marker.id);
        if (!mendedIds.has(key)) return marker;
        const bounds = nextBounds.get(key);
        if (!bounds) return marker;
        return { ...marker, start: roundTenth(bounds.start - timelinePart.start), duration: roundTenth(bounds.end - bounds.start), focus: !middleSnapActive && sharedFocus && mendedIds.has(key) ? sharedFocus : marker.focus, snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
      });
      return withMotionMarkers(currentPart, zoomMarkers, currentPart.translationMarkers);
    }));
    setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    setSelectedZoomMarkers(nextSelection);
  }

  function updateZoomMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (!currentPart.zoomMarkers.some((marker) => nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)))) return currentPart;
      return withMotionMarkers(currentPart, currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)), currentPart.translationMarkers);
    }));
  }

  function updateZoomMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const absoluteMarkers = getAbsoluteZoomMarkers();
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedZoomIds = selectedZoomMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedZoomIds, getZoomMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedZoomIds, getZoomMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (!currentPart.zoomMarkers.some((marker) => nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)))) return currentPart;
      return withMotionMarkers(currentPart, currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)) ? { ...marker, middleEase: ease } : marker)), currentPart.translationMarkers);
    }));
  }

  function snapTranslationMiddle(targetPart = part) {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const absolutePreviewTime = (activeTimelinePart?.start ?? 0) + previewTime;
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey)
      ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey)
      ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey)
      ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey)
      ?? (targetPart.id === part.id ? getZoomMiddleSnap(absoluteMarkers, absolutePreviewTime, getTranslationMarkerMendKey) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(absoluteMarkers, snap);
    const selectedIds = new Set(selectedTranslationIds.length > 0 ? selectedTranslationIds : targetPartSelectedTranslationIds);
    const nextSelection = snap.pairs.length > 1
      ? uniqueMarkerSelections(absoluteMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => marker.id))
      : uniqueMarkerSelections([snap.pairs[0].previousId, snap.pairs[0].nextId]);
    const nextBounds = new Map(absoluteMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true, mendInId: pair.previousId });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      const timelinePart = buildLinearTimeline({ ...scene, compositions: parts }).find((item) => item.id === currentPart.id);
      if (!timelinePart) return currentPart;
      const translationMarkers = currentPart.translationMarkers.map((marker) => {
        const key = timelineMarkerKey(currentPart.id, marker.id);
        if (!mendedIds.has(key)) return marker;
        const bounds = nextBounds.get(key);
        if (!bounds) return marker;
        return { ...marker, start: roundTenth(bounds.start - timelinePart.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
      });
      return withMotionMarkers(currentPart, currentPart.zoomMarkers, translationMarkers);
    }));
    setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    setSelectedTranslationMarkers(nextSelection);
  }

  function updateTranslationMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (!currentPart.translationMarkers.some((marker) => nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)))) return currentPart;
      return withMotionMarkers(currentPart, currentPart.zoomMarkers, currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)));
    }));
  }

  function updateTranslationMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const absoluteMarkers = getAbsoluteTranslationMarkers();
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const selectedTranslationIds = selectedTranslationMarkers.map((selection) => timelineMarkerKey(selection.partId, selection.markerId));
    const snap = getSelectedActiveMiddleMend(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, selectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedActiveMiddleMend(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteMarkers, targetPartSelectedTranslationIds, getTranslationMarkerMendKey);
    if (!snap || !isZoomMiddleSnapActive(absoluteMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (!currentPart.translationMarkers.some((marker) => nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)))) return currentPart;
      return withMotionMarkers(currentPart, currentPart.zoomMarkers, currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(timelineMarkerKey(currentPart.id, marker.id)) ? { ...marker, middleEase: ease } : marker)));
    }));
  }

  function updateObjectDragSelection(nextObjects: SelectionPayload["objects"]) {
    setSelectionPayload(selectionPayloadFromObjects(nextObjects));
  }

  function getFrameObjectElement(objectId: string) {
    return frameViewportRef.current?.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(objectId)}"]`) ?? null;
  }

  function getFrameSelectionBoxElements() {
    return Array.from(frameViewportRef.current?.querySelectorAll<HTMLElement>("[data-frame-selection-box]") ?? []);
  }

  function getFrameSelectionBoxElement(objectId: string) {
    return frameViewportRef.current?.querySelector<HTMLElement>(`[data-frame-selection-box="${CSS.escape(objectId)}"]`) ?? null;
  }

  function setFrameSelectionBoxDragTransform(delta: Point) {
    for (const element of getFrameSelectionBoxElements()) {
      element.style.setProperty("--clipper-drag-x", `${delta.x * framePreviewScale * zoomScale}px`);
      element.style.setProperty("--clipper-drag-y", `${delta.y * framePreviewScale * zoomScale}px`);
    }
  }

  function clearFrameSelectionBoxDragTransform() {
    for (const element of getFrameSelectionBoxElements()) {
      element.style.removeProperty("--clipper-drag-x");
      element.style.removeProperty("--clipper-drag-y");
    }
  }

  function setObjectDragTransform(objectId: string, delta: Point) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.setProperty("--clipper-drag-x", `${delta.x}px`);
    element.style.setProperty("--clipper-drag-y", `${delta.y}px`);
  }

  function setObjectResizePreview(objectId: string, bounds: Bounds) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.left = `${bounds.x}px`;
    element.style.top = `${bounds.y}px`;
    element.style.width = `${bounds.width}px`;
    element.style.height = `${bounds.height}px`;
  }

  function clearObjectResizePreviews(objects: SelectionPayload["objects"]) {
    for (const object of objects) {
      const element = getFrameObjectElement(object.id);
      if (!element) continue;
      element.style.removeProperty("left");
      element.style.removeProperty("top");
      element.style.removeProperty("width");
      element.style.removeProperty("height");
    }
  }

  function setFrameSelectionBoxResizePreview(objectId: string, bounds: Bounds) {
    const viewportBounds = insetBounds(boundsToViewport(bounds, cameraPreviewTransform, framePreviewScale), -selectorOffsetPx);
    const element = getFrameSelectionBoxElement(objectId);
    if (!element) return;
    element.style.left = `${viewportBounds.x}px`;
    element.style.top = `${viewportBounds.y}px`;
    element.style.width = `${viewportBounds.width}px`;
    element.style.height = `${viewportBounds.height}px`;
  }

  function clearFrameSelectionBoxResizePreview() {
    for (const element of getFrameSelectionBoxElements()) {
      element.style.removeProperty("left");
      element.style.removeProperty("top");
      element.style.removeProperty("width");
      element.style.removeProperty("height");
    }
  }

  function clearObjectDragTransforms(objects: SelectionPayload["objects"]) {
    for (const object of objects) {
      const element = getFrameObjectElement(object.id);
      if (!element) continue;
      element.style.removeProperty("--clipper-drag-x");
      element.style.removeProperty("--clipper-drag-y");
    }
  }

  function scheduleObjectResizePreview(delta: Point) {
    objectResizeDeltaRef.current = delta;
    if (objectResizeFrameRef.current) return;

    objectResizeFrameRef.current = requestAnimationFrame(() => {
      objectResizeFrameRef.current = 0;
      const resize = objectResizeRef.current;
      if (!resize) return;

      const nextObjects = getResizedObjects(resize, objectResizeDeltaRef.current);
      for (const object of nextObjects) {
        setObjectResizePreview(object.id, object.bounds);
        setFrameSelectionBoxResizePreview(object.id, object.bounds);
      }
    });
  }

  function clearObjectResize() {
    if (objectResizeFrameRef.current) {
      cancelAnimationFrame(objectResizeFrameRef.current);
      objectResizeFrameRef.current = 0;
    }
    if (objectResizeRef.current) clearObjectResizePreviews(objectResizeRef.current.objects);
    clearFrameSelectionBoxResizePreview();
    objectResizeRef.current = null;
    objectResizeDeltaRef.current = { x: 0, y: 0 };
  }

  function finishCommittedObjectResize() {
    objectResizeRef.current = null;
    objectResizeDeltaRef.current = { x: 0, y: 0 };
  }

  function scheduleObjectDragPreview(delta: Point) {
    objectDragDeltaRef.current = delta;
    if (objectDragFrameRef.current) return;

    objectDragFrameRef.current = requestAnimationFrame(() => {
      objectDragFrameRef.current = 0;
      const drag = objectDragRef.current;
      if (!drag) return;

      for (const object of drag.objects) setObjectDragTransform(object.id, objectDragDeltaRef.current);
      setFrameSelectionBoxDragTransform(objectDragDeltaRef.current);
    });
  }

  function clearObjectDrag() {
    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }
    if (objectDragRef.current) clearObjectDragTransforms(objectDragRef.current.objects);
    clearFrameSelectionBoxDragTransform();
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
  }

  function finishCommittedObjectDrag(objects: SelectionPayload["objects"]) {
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    requestAnimationFrame(() => {
      clearObjectDragTransforms(objects);
      clearFrameSelectionBoxDragTransform();
    });
  }

  function scheduleDragBox(nextBounds: Bounds) {
    pendingDragBoxRef.current = nextBounds;
    if (dragBoxFrameRef.current) return;

    dragBoxFrameRef.current = requestAnimationFrame(() => {
      dragBoxFrameRef.current = 0;
      if (!marqueeDraggingRef.current) return;
      const nextDragBox = pendingDragBoxRef.current;
      if (nextDragBox && dragSelectionBoxRef.current) updateDragSelectionBoxElement(dragSelectionBoxRef.current, nextDragBox, framePreviewScale);
      if (!nextDragBox || !isVisibleMarqueeBounds(nextDragBox, framePreviewScale)) return;
      const payload = createSelectionPayload(nextDragBox, part.objects);
      const nextSelectionIds = payload.objects.map((object) => object.id).join("|");
      if (nextSelectionIds === liveDragSelectionIdsRef.current) return;
      liveDragSelectionIdsRef.current = nextSelectionIds;
      startTransition(() => {
        setSelectionPayload(payload.objects.length > 0 ? payload : null);
        setSelectedObjectId(payload.objects[0]?.id ?? null);
      });
    });
  }

  function clearDragBox() {
    marqueeDraggingRef.current = false;
    if (dragBoxFrameRef.current) {
      cancelAnimationFrame(dragBoxFrameRef.current);
      dragBoxFrameRef.current = 0;
    }
    dragStartRef.current = null;
    pendingDragBoxRef.current = null;
    marqueeLastPointRef.current = null;
    marqueeSpacePanningRef.current = false;
    liveDragSelectionIdsRef.current = "";
    if (dragSelectionBoxRef.current) dragSelectionBoxRef.current.style.display = "none";
    setMarqueeDragging(false);
    setDragStart(null);
    setDragBox(null);
  }

  function commitObjectDrag() {
    const drag = objectDragRef.current;
    if (!drag) return;

    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }

    const nextObjects = getDraggedObjects(drag, objectDragDeltaRef.current);
    const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
    updateCompositionForTimelinePart(drag.partId, (composition) => ({
      ...composition,
      objects: composition.objects.map((object) => {
        const nextBounds = nextBoundsById.get(object.id);
        return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
      }),
    }));
    updateObjectDragSelection(nextObjects);
    finishCommittedObjectDrag(drag.objects);
  }

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "interactive" || !cameraRef.current || objectDragRef.current || objectResizeRef.current) return;
    if (trackerPickTranslationMarker) return;
    if (focusPickZoomMarker || pointPickAdjustment) {
      startFramePickDrag(event);
      return;
    }
    if (positionPickTranslationMarker) {
      startFramePickDrag(event);
      return;
    }
    if (!canSelectFrameObjects) return;
    if ((event.target as HTMLElement).dataset.objectId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    dragStartRef.current = point;
    marqueeLastPointRef.current = point;
    pendingDragBoxRef.current = { x: point.x, y: point.y, width: 0, height: 0 };
    liveDragSelectionIdsRef.current = "";
    marqueeDraggingRef.current = true;
    setMarqueeDragging(true);
    setDragStart(point);
    setDragBox({ x: point.x, y: point.y, width: 0, height: 0 });
    clearNodeSelection();
  }

  function onFramePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (!focusPickZoomMarker && !positionPickTranslationMarker && !pointPickAdjustment) return;
    event.stopPropagation();
    startFramePickDrag(event);
  }

  function startFramePickDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFramePickFromPointer(event);
  }

  function updateFramePickFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!frameViewportRef.current) return;
    const point = framePointFromClient(event.nativeEvent, frameViewportRef.current);
    const nextPoint = { x: Math.round(clamp(point.x, 0, FRAME_WIDTH)), y: Math.round(clamp(point.y, 0, FRAME_HEIGHT)) };
    pendingFramePickPointRef.current = nextPoint;
    if (framePickFrameRef.current) return;

    framePickFrameRef.current = requestAnimationFrame(() => {
      framePickFrameRef.current = 0;
      setFramePickPreviewPoint(pendingFramePickPointRef.current);
    });
  }

  function commitFramePick() {
    const point = pendingFramePickPointRef.current ?? framePickPreviewPoint;
    if (!point) return;

    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }

    if (focusPickZoomMarker) {
      updateZoomMarkerFocusGroup(focusPickZoomMarker.partId, focusPickZoomMarker.markerId, point);
    }
    if (positionPickTranslationMarker) {
      updateTranslationMarker(positionPickTranslationMarker.partId, positionPickTranslationMarker.markerId, (marker) => ({ ...marker, position: framePointToCameraTranslation(point) }));
    }
    if (pointPickAdjustment) {
      const { control } = pointPickAdjustment;
      const nextX = control.coordinateSpace === "percent" ? roundTwo((point.x / FRAME_WIDTH) * 100) : point.x;
      const nextY = control.coordinateSpace === "percent" ? roundTwo((point.y / FRAME_HEIGHT) * 100) : point.y;
      updateAdjustmentLayer(pointPickAdjustment.layerId, (layer) => ({
        ...layer,
        effect: {
          ...layer.effect,
          params: {
            ...layer.effect.params,
            [control.xKey]: nextX,
            [control.yKey]: nextY,
          },
        },
      }));
    }
    pendingFramePickPointRef.current = null;
    requestAnimationFrame(() => setFramePickPreviewPoint(null));
  }

  function cancelFramePickPreview() {
    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }
    pendingFramePickPointRef.current = null;
    setFramePickPreviewPoint(null);
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (focusPickZoomMarker || positionPickTranslationMarker || pointPickAdjustment) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updateFramePickFromPointer(event);
      return;
    }

    const activeObjectDrag = objectDragRef.current;
    if (activeObjectDrag && canSelectFrameObjects) {
      const dx = (event.clientX - activeObjectDrag.origin.x) / (framePreviewScale * zoomScale);
      const dy = (event.clientY - activeObjectDrag.origin.y) / (framePreviewScale * zoomScale);
      scheduleObjectDragPreview(constrainDragDeltaToDominantAxis({ x: dx, y: dy }, event.shiftKey));
      return;
    }

    const activeObjectResize = objectResizeRef.current;
    if (activeObjectResize && canSelectFrameObjects) {
      const dx = (event.clientX - activeObjectResize.origin.x) / (framePreviewScale * cameraPreviewTransform.scale);
      const dy = (event.clientY - activeObjectResize.origin.y) / (framePreviewScale * cameraPreviewTransform.scale);
      scheduleObjectResizePreview({ x: dx, y: dy });
      return;
    }

    const currentDragStart = dragStartRef.current ?? dragStart;
    if (!currentDragStart || !canSelectFrameObjects) return;
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    if (marqueeSpacePanningRef.current && pendingDragBoxRef.current && marqueeLastPointRef.current) {
      const delta = { x: point.x - marqueeLastPointRef.current.x, y: point.y - marqueeLastPointRef.current.y };
      dragStartRef.current = { x: currentDragStart.x + delta.x, y: currentDragStart.y + delta.y };
      marqueeLastPointRef.current = point;
      scheduleDragBox(moveBounds(pendingDragBoxRef.current, delta));
      return;
    }
    marqueeLastPointRef.current = point;
    scheduleDragBox(normalizeBounds(currentDragStart, point));
  }

  function onFramePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (focusPickZoomMarker || positionPickTranslationMarker || pointPickAdjustment) {
      commitFramePick();
      return;
    }

    if (objectDragRef.current) {
      commitObjectDrag();
      return;
    }

    if (objectResizeRef.current) {
      commitObjectResize();
      return;
    }

    const finalDragBox = pendingDragBoxRef.current ?? dragBox;
    if (!finalDragBox || !canSelectFrameObjects || !isVisibleMarqueeBounds(finalDragBox, framePreviewScale)) {
      clearDragBox();
      return;
    }
    const payload = createSelectionPayload(finalDragBox, part.objects);
    if (payload.objects.length === 0) {
      clearNodeSelection();
    } else {
      setSelectionPayload(payload);
      setSelectedObjectId(payload.objects[0]?.id ?? null);
    }
    clearMarkerSelection();
    clearDragBox();
  }

  function onFramePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cancelFramePickPreview();
    clearObjectDrag();
    clearObjectResize();
    clearDragBox();
  }

  function startObjectDrag(event: PointerEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "interactive" || !canSelectFrameObjects) return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
    setEditingTextObjectId(null);
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const selectedObjectIds = new Set(selectionPayload?.objects.map((item) => item.id) ?? []);
    const nextSelectionObjects = selectedObjectIds.has(object.id)
      ? part.objects.filter((item) => selectedObjectIds.has(item.id)).map(selectionObjectFromFrameObject)
      : [selectionObjectFromFrameObject(object)];
    const selectionBox = getBoundsUnion(nextSelectionObjects.map((item) => item.bounds));

    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextSelectionObjects });
    const nextDrag = { origin: { x: event.clientX, y: event.clientY }, partId: part.id, objects: nextSelectionObjects };
    objectDragRef.current = nextDrag;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    for (const item of nextSelectionObjects) setObjectDragTransform(item.id, { x: 0, y: 0 });
  }

  function startObjectResize(event: PointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) {
    if (mode !== "interactive" || !canSelectFrameObjects || !selectionPayload?.objects.length) return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const preservedObjects = part.objects.filter((item) => selectionPayload.objects.some((selected) => selected.id === item.id)).map(selectionObjectFromFrameObject);
    const resizedObjects = objectId ? preservedObjects.filter((item) => item.id === objectId) : preservedObjects;
    if (resizedObjects.length === 0 || preservedObjects.length === 0) return;
    const selectionBox = getBoundsUnion(resizedObjects.map((item) => item.bounds));
    objectResizeRef.current = { origin: { x: event.clientX, y: event.clientY }, handle, partId: part.id, selectionBox, objects: resizedObjects, preservedObjects };
    objectResizeDeltaRef.current = { x: 0, y: 0 };
  }

  function commitObjectResize() {
    const resize = objectResizeRef.current;
    if (!resize) return;

    if (objectResizeFrameRef.current) {
      cancelAnimationFrame(objectResizeFrameRef.current);
      objectResizeFrameRef.current = 0;
    }

    const nextObjects = getResizedObjects(resize, objectResizeDeltaRef.current);
    const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
    updateCompositionForTimelinePart(resize.partId, (composition) => ({
      ...composition,
      objects: composition.objects.map((object) => {
        const nextBounds = nextBoundsById.get(object.id);
        return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
      }),
    }));
    const nextObjectsById = new Map(nextObjects.map((object) => [object.id, object]));
    const nextSelectionObjects = resize.preservedObjects.map((object) => nextObjectsById.get(object.id) ?? object);
    updateObjectDragSelection(nextSelectionObjects);
    finishCommittedObjectResize();
  }

  function startTextObjectEdit(event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "interactive" || object.type !== "text" || !canSelectFrameObjects) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox: object.bounds, coordinates: boundsToPoints(object.bounds), objects: [selectionObjectFromFrameObject(object)] });
    setRightPanelTab("video");
    setEditingTextObjectId(object.id);
  }

  function renameAsset(assetId: string, name: string) {
    updateProject((current) => ({ ...current, assets: updateAssetTree(current.assets ?? defaultAssets, assetId, (item) => ({ ...item, name: name.trim() || item.name })) }));
  }

  function nextNumberedName(baseName: string, siblingNames: Iterable<string>) {
    const names = new Set(Array.from(siblingNames).map((name) => name.trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName} ${index}`)) index += 1;
    return `${baseName} ${index}`;
  }

  function getAssetSiblingNames(items: AssetItem[], parentFolderId?: string) {
    const siblings = parentFolderId ? findAsset(items, parentFolderId)?.children ?? [] : items;
    return siblings.map((item) => item.name);
  }

  function getProjectFolderSiblingNames(parentFolderPath: string) {
    const names = new Set<string>();
    const addChildFolderName = (path: string) => {
      if (path === parentFolderPath || !path.startsWith(`${parentFolderPath}/`)) return;
      const name = path.slice(parentFolderPath.length + 1).split("/")[0]?.trim();
      if (name) names.add(name);
    };
    for (const folder of projectRef.current.compositionFolders ?? []) addChildFolderName(folder);
    for (const composition of projectRef.current.compositionLibrary ?? []) addChildFolderName(getDirectoryPath(composition.filePath));
    for (const timeline of projectRef.current.timelines ?? []) addChildFolderName(getDirectoryPath(timeline.filePath ?? `${watchedProjectDirectory}/${timeline.id}.timeline.json`));
    return names;
  }

  function createAssetFolder(parentFolderId?: string) {
    const currentAssets = projectRef.current.assets ?? defaultAssets;
    const folder = { id: `ast_folder_${Date.now().toString(36)}`, name: nextNumberedName("New folder", getAssetSiblingNames(currentAssets, parentFolderId)), kind: "folder" as const, children: [] };
    updateProject((current) => {
      const currentAssets = current.assets ?? defaultAssets;
      return { ...current, assets: parentFolderId ? appendAssetsToFolder(currentAssets, parentFolderId, [folder]) : [...currentAssets, folder] };
    });
  }

  function importDroppedAssets(files: FileList, targetFolderId?: string) {
    const nextFiles = Array.from(files).map((file) => ({ id: `ast_${Date.now().toString(36)}_${file.name}`, name: file.name, kind: "file" as const, path: (file as File & { path?: string }).path || file.name }));
    if (nextFiles.length === 0) return;
    updateProject((current) => {
      const currentAssets = current.assets ?? defaultAssets;
      return { ...current, assets: targetFolderId ? appendAssetsToFolder(currentAssets, targetFolderId, nextFiles) : [...currentAssets, ...nextFiles] };
    });
  }

  async function copyAssetPath(assetId: string) {
    const assetPath = getAssetPath(assets, assetId, project.assetsPath);
    if (!assetPath) return;

    try {
      await navigator.clipboard.writeText(assetPath);
      toast.success("Asset path copied");
    } catch {
      toast.error("Unable to copy asset path");
    }
  }

  async function copyCompositionPath(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;

    try {
      await navigator.clipboard.writeText(composition.filePath);
      toast.success("Composition path copied");
    } catch {
      toast.error("Unable to copy composition path");
    }
  }

  function revealComposition(compositionId?: string) {
    const composition = compositionId ? compositionLibrary.find((item) => item.id === compositionId) : null;
    void clipperHost.revealFile(composition?.filePath ?? watchedProjectDirectory).catch(() => toast.error("Unable to reveal in Finder."));
  }

  function revealAssetRoot() {
    void clipperHost.revealFile(project.assetsPath).catch(() => toast.error("Unable to reveal in Finder."));
  }

  function createComposition(folderPath = watchedProjectDirectory) {
    const compositionId = createCompositionId();
    const composition: Part = {
      ...part,
      id: compositionId,
      name: "New Composition",
      filePath: `${folderPath}/${compositionId}.ts`,
      duration: 3,
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };
    const source = compositionToSource(composition);
    const nextSources = { ...compositionSourcesRef.current, [composition.filePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({
      ...current,
      compositionSources: nextSources,
      compositionLibrary: [...(current.compositionLibrary ?? []), composition],
      compositionFolders: Array.from(new Set([...(current.compositionFolders ?? []), folderPath])),
    }), { syncSources: false });
  }

  function createCompositionFolder(parentFolderPath = watchedProjectDirectory) {
    const folderName = nextNumberedName("New folder", getProjectFolderSiblingNames(parentFolderPath));
    const folderPath = `${parentFolderPath}/${folderName}`;
    updateProject((current) => ({ ...current, compositionFolders: Array.from(new Set([...(current.compositionFolders ?? []), folderPath])) }));
  }

  function createTimeline() {
    const timelineId = `tl_${nanoid(8)}`;
    updateProject((current) => ({
      ...current,
      timelines: [...(current.timelines ?? []), {
        id: timelineId,
        name: `Timeline ${(current.timelines?.length ?? current.scenes.length) + 1}`,
        filePath: `${watchedProjectDirectory}/${timelineId}.timeline.json`,
        clips: [],
        adjustmentLayers: [],
        zoomMarkers: [],
        translationMarkers: [],
        settings: {},
      }],
    }));
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
  }

  function selectTimeline(timelineId: string) {
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  function renameTimeline(timelineId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    updateProject((current) => ({
      ...current,
      timelines: (current.timelines ?? []).map((timeline) => timeline.id === timelineId ? { ...timeline, name: nextName } : timeline),
    }));
  }

  function reorderTimeline(sourceTimelineId: string, targetTimelineId: string, action: "before" | "after") {
    if (sourceTimelineId === targetTimelineId) return;
    updateProject((current) => {
      const timelines = current.timelines ?? [];
      const sourceTimelineIndex = timelines.findIndex((timeline) => timeline.id === sourceTimelineId);
      const targetTimelineIndex = timelines.findIndex((timeline) => timeline.id === targetTimelineId);
      if (sourceTimelineIndex < 0 || targetTimelineIndex < 0) return current;

      return {
        ...current,
        timelines: reorderByIntent(timelines, sourceTimelineIndex, targetTimelineIndex, action),
      };
    });
  }

  function reorderComposition(sourceCompositionId: string, targetCompositionId: string, action: "before" | "after") {
    if (sourceCompositionId === targetCompositionId) return;
    updateProject((current) => {
      const library = current.compositionLibrary ?? compositionLibrary;
      const sourceIndex = library.findIndex((composition) => composition.id === sourceCompositionId);
      const targetIndex = library.findIndex((composition) => composition.id === targetCompositionId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      return { ...current, compositionLibrary: reorderByIntent(library, sourceIndex, targetIndex, action) };
    });
  }

  function reorderCompositionFolder(sourceFolderPath: string, targetFolderPath: string, action: "before" | "after") {
    if (sourceFolderPath === targetFolderPath) return;
    updateProject((current) => {
      const folders = current.compositionFolders ?? [];
      const sourceIndex = folders.indexOf(sourceFolderPath);
      const targetIndex = folders.indexOf(targetFolderPath);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      return { ...current, compositionFolders: reorderByIntent(folders, sourceIndex, targetIndex, action) };
    });
  }

  function moveTimeline(timelineId: string, folderPath: string) {
    updateProject((current) => ({
      ...current,
      compositionFolders: Array.from(new Set([...(current.compositionFolders ?? []), folderPath])),
      timelines: (current.timelines ?? []).map((timeline) => timeline.id === timelineId ? { ...timeline, filePath: `${folderPath}/${timeline.id}.timeline.json` } : timeline),
    }));
  }

  function deleteTimeline(timelineId: string) {
    if ((project.timelines?.length ?? 0) <= 1) {
      toast.error("A project needs at least one timeline.");
      return;
    }
    const remainingTimelines = (project.timelines ?? []).filter((timeline) => timeline.id !== timelineId);
    const nextTimelineId = remainingTimelines[0]?.id ?? selectedSceneId;
    updateProject((current) => ({ ...current, timelines: (current.timelines ?? []).filter((timeline) => timeline.id !== timelineId) }));
    if (timelineId === selectedSceneId) selectTimeline(nextTimelineId);
  }

  function compositionFilePathWithName(composition: Part, name: string) {
    const directory = getDirectoryPath(composition.filePath);
    const extensionIndex = composition.filePath.lastIndexOf(".");
    const extension = extensionIndex > composition.filePath.lastIndexOf("/") ? composition.filePath.slice(extensionIndex) : ".ts";
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || composition.id;
    return `${directory}/${slug}${extension}`;
  }

  function renameComposition(compositionId: string, name: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    const nextName = name.trim();
    if (!composition || !nextName) return;
    const nextFilePath = compositionFilePathWithName(composition, nextName);
    const source = compositionSourcesRef.current[composition.filePath];
    const { [composition.filePath]: _removed, ...rest } = compositionSourcesRef.current;
    const nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => replacePartInProject({
      ...current,
      compositionSources: nextSources,
      compositionLibrary: current.compositionLibrary ?? compositionLibrary,
    }, compositionId, (item) => ({ ...item, name: nextName, filePath: nextFilePath })), { syncSources: false });
  }

  function updateCompositionFilePath(currentProject: ProjectManifest, compositionId: string, nextFilePath: string) {
    return replacePartInProject({ ...currentProject, compositionLibrary: currentProject.compositionLibrary ?? compositionLibrary }, compositionId, (item) => ({ ...item, filePath: nextFilePath }));
  }

  function moveComposition(compositionId: string, folderPath: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition || getDirectoryPath(composition.filePath) === folderPath) return;
    const fileName = composition.filePath.slice(composition.filePath.lastIndexOf("/") + 1);
    const nextFilePath = `${folderPath}/${fileName}`;
    const source = compositionSourcesRef.current[composition.filePath];
    const { [composition.filePath]: _removed, ...rest } = compositionSourcesRef.current;
    const nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({ ...updateCompositionFilePath({ ...current, compositionSources: nextSources }, compositionId, nextFilePath), compositionFolders: Array.from(new Set([...(current.compositionFolders ?? []), folderPath])) }), { syncSources: false });
  }

  function renameCompositionFolder(folderPath: string, name: string) {
    const nextName = name.trim().replace(/[/\\]/g, "-");
    if (!nextName) return;
    const parentPath = getDirectoryPath(folderPath);
    const nextFolderPath = parentPath ? `${parentPath}/${nextName}` : nextName;
    const nextSources = Object.fromEntries(Object.entries(compositionSourcesRef.current).map(([path, source]) => [path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path, source]));
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({
      ...current,
      compositionSources: nextSources,
      compositionFolders: (current.compositionFolders ?? []).map((path) => path === folderPath || path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path),
      compositionLibrary: (current.compositionLibrary ?? compositionLibrary).map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item),
    }), { syncSources: false });
  }

  function moveCompositionFolder(folderPath: string, parentFolderPath: string) {
    if (parentFolderPath === folderPath || parentFolderPath.startsWith(`${folderPath}/`)) return;
    const folderName = folderPath.slice(folderPath.lastIndexOf("/") + 1);
    const nextFolderPath = parentFolderPath ? `${parentFolderPath}/${folderName}` : folderName;
    if (nextFolderPath === folderPath) return;

    const nextSources = Object.fromEntries(Object.entries(compositionSourcesRef.current).map(([path, source]) => [path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path, source]));
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({
      ...current,
      compositionSources: nextSources,
      compositionFolders: Array.from(new Set((current.compositionFolders ?? []).map((path) => path === folderPath || path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path))),
      compositionLibrary: (current.compositionLibrary ?? compositionLibrary).map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item),
    }), { syncSources: false });
  }

  function applyFileManagerTreeSnapshot(snapshot: FileManagerTreeSnapshot) {
    updateProject((current) => {
      const library = current.compositionLibrary ?? compositionLibrary;
      const timelines = current.timelines ?? [];
      const currentSources = compositionSourcesRef.current;
      let nextSources = currentSources;

      for (const composition of library) {
        const nextFilePath = snapshot.compositionFilePaths[composition.id];
        if (!nextFilePath || nextFilePath === composition.filePath) continue;
        const source = nextSources[composition.filePath];
        const { [composition.filePath]: _removed, ...rest } = nextSources;
        nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
      }

      if (nextSources !== currentSources) {
        compositionSourcesRef.current = nextSources;
        setCompositionSources(nextSources);
      }

      const nextCompositionById = new Map(library.map((composition) => [composition.id, { ...composition, filePath: snapshot.compositionFilePaths[composition.id] ?? composition.filePath }]));
      const orderedCompositionIds = new Set(snapshot.compositionOrder);
      const nextTimelineById = new Map(timelines.map((timeline) => [timeline.id, { ...timeline, filePath: snapshot.timelineFilePaths[timeline.id] ?? timeline.filePath }]));
      const orderedTimelineIds = new Set(snapshot.timelineOrder);

      return {
        ...current,
        assets: snapshot.assets,
        compositionSources: nextSources,
        compositionFolders: snapshot.compositionFolders,
        editorState: { ...(current.editorState ?? defaultEditorState), fileManagerState: snapshot.fileManagerState },
        compositionLibrary: [...snapshot.compositionOrder.flatMap((id) => nextCompositionById.get(id) ?? []), ...library.filter((composition) => !orderedCompositionIds.has(composition.id)).map((composition) => nextCompositionById.get(composition.id) ?? composition)],
        timelines: [...snapshot.timelineOrder.flatMap((id) => nextTimelineById.get(id) ?? []), ...timelines.filter((timeline) => !orderedTimelineIds.has(timeline.id)).map((timeline) => nextTimelineById.get(timeline.id) ?? timeline)],
      };
    }, { syncSources: false });
  }

  function updateFileManagerState(fileManagerState: EditorState["fileManagerState"]) {
    updateEditorState((state) => ({ ...state, fileManagerState }));
  }

  function updateEffectsPanelState(effectsPanelState: NonNullable<EditorState["effectsPanelState"]>) {
    updateEditorState((state) => ({ ...state, effectsPanelState }));
  }

  function deleteCompositionFolder(folderPath: string) {
    const affectedCompositions = compositionLibrary.filter((item) => item.filePath.startsWith(`${folderPath}/`));
    const affectedIds = new Set(affectedCompositions.map((item) => item.id));
    const nextSources = Object.fromEntries(Object.entries(compositionSourcesRef.current).filter(([path]) => !path.startsWith(`${folderPath}/`)));
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({
      ...current,
      compositionSources: nextSources,
      compositionFolders: (current.compositionFolders ?? []).filter((path) => path !== folderPath && !path.startsWith(`${folderPath}/`)),
      compositionLibrary: (current.compositionLibrary ?? compositionLibrary).filter((item) => !affectedIds.has(item.id)),
      timelines: (current.timelines ?? []).map((timeline) => ({ ...timeline, clips: timeline.clips.filter((clip) => !affectedIds.has(clip.compositionId)) })),
    }), { syncSources: false });
  }

  function revealCompositionFolder(folderPath: string) {
    void clipperHost.revealFile(folderPath).catch(() => toast.error("Unable to reveal in Finder."));
  }

  function duplicateComposition(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;
    const duplicateId = createCompositionId();
    const duplicate: Part = { ...composition, id: duplicateId, name: `${composition.name} copy`, filePath: `${getDirectoryPath(composition.filePath)}/${duplicateId}.ts`, zoomMarkers: [], translationMarkers: [], snapshot: [] };
    const source = compositionToSource(duplicate);
    const nextSources = { ...compositionSourcesRef.current, [duplicate.filePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => ({ ...current, compositionSources: nextSources, compositionLibrary: [...(current.compositionLibrary ?? compositionLibrary), duplicate] }), { syncSources: false });
  }

  function deleteCompositionFile(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;
    const { [composition.filePath]: _removed, ...nextSources } = compositionSourcesRef.current;
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    updateProject((current) => deleteCompositionFromProject({ ...current, compositionSources: nextSources }, compositionId), { syncSources: false });
  }

  function duplicateAsset(assetId: string) {
    updateProject((current) => ({ ...current, assets: duplicateAssetTree(current.assets ?? defaultAssets, assetId) }));
  }

  function deleteAsset(assetId: string) {
    updateProject((current) => ({ ...current, assets: removeAsset(current.assets ?? defaultAssets, assetId).items }));
  }

  function moveAsset(sourceId: string, intent: AssetDropIntent) {
    if (sourceId === intent.targetId) return;
    updateProject((current) => ({ ...current, assets: moveAssetTree(current.assets ?? defaultAssets, sourceId, intent) }));
  }

  function sortAssets(parentFolderId: string | null, mode: AssetSortMode) {
    updateProject((current) => ({ ...current, assets: sortAssetsInParent(current.assets ?? defaultAssets, parentFolderId, mode) }));
  }

  function openProjectTitleMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [{ label: "Rename project", action: startProjectRename }],
    });
  }

  function startProjectRename() {
    projectRenameCancelledRef.current = false;
    setProjectNameDraft(projectRef.current.name);
    setRenamingProject(true);
  }

  function commitProjectRename() {
    if (projectRenameCancelledRef.current) {
      projectRenameCancelledRef.current = false;
      return;
    }
    const nextName = projectNameDraft.trim();
    setRenamingProject(false);
    if (!nextName || nextName === projectRef.current.name) return;
    updateProject((current) => ({ ...current, name: nextName }));
  }

  function cancelProjectRename() {
    projectRenameCancelledRef.current = true;
    setProjectNameDraft(project.name);
    setRenamingProject(false);
  }

  function updateFramePreviewScale(nextScale: number) {
    setFramePreviewScale(roundTwo(clamp(nextScale, 0.25, 1)));
  }

  function clampEditorLayout(layout: EditorLayoutState): EditorLayoutState {
    const availablePanelWidth = Math.max(window.innerWidth - editorPanelLayoutLimits.centerMin, editorPanelLayoutLimits.leftMin + editorPanelLayoutLimits.rightMin);
    const rightPanelWidth = Math.round(clamp(layout.rightPanelWidth, editorPanelLayoutLimits.rightMin, Math.min(editorPanelLayoutLimits.rightMax, availablePanelWidth - editorPanelLayoutLimits.leftMin)));
    const leftPanelWidth = Math.round(clamp(layout.leftPanelWidth, editorPanelLayoutLimits.leftMin, Math.min(editorPanelLayoutLimits.leftMax, availablePanelWidth - rightPanelWidth)));
    const timelineMax = Math.max(editorPanelLayoutLimits.timelineMin, Math.min(editorPanelLayoutLimits.timelineMax, window.innerHeight - 48 - 220));
    const timelineHeight = Math.round(clamp(layout.timelineHeight, editorPanelLayoutLimits.timelineMin, timelineMax));
    return { leftPanelWidth, rightPanelWidth, timelineHeight };
  }

  function clampComposeLayout(layout: ComposeLayoutState): ComposeLayoutState {
    const currentLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;
    const availablePanelWidth = Math.max(window.innerWidth - editorPanelLayoutLimits.centerMin, editorPanelLayoutLimits.leftMin + editorPanelLayoutLimits.rightMin);
    const maxLeftPanelWidth = Math.min(editorPanelLayoutLimits.leftMax, availablePanelWidth - currentLayout.rightPanelWidth);
    return { leftPanelWidth: Math.round(clamp(layout.leftPanelWidth, editorPanelLayoutLimits.leftMin, maxLeftPanelWidth)) };
  }

  function applyEditorLayoutCss(layout: EditorLayoutState) {
    const root = appRootRef.current;
    if (!root) return;
    root.style.setProperty("--clipper-left-panel-width", `${layout.leftPanelWidth}px`);
    root.style.setProperty("--clipper-right-panel-width", `${layout.rightPanelWidth}px`);
    root.style.setProperty("--clipper-timeline-height", `${layout.timelineHeight}px`);
  }

  function applyComposeLayoutCss(layout: ComposeLayoutState) {
    const root = appRootRef.current;
    if (!root) return;
    root.style.setProperty("--clipper-compose-left-panel-width", `${layout.leftPanelWidth}px`);
  }

  function updateEditorLayout(layout: EditorLayoutState) {
    const nextLayout = clampEditorLayout(layout);
    const currentLayout = projectRef.current.editorState?.layout ?? defaultEditorLayoutState;
    if (JSON.stringify(nextLayout) === JSON.stringify(currentLayout)) return;
    updateEditorState((state) => ({ ...state, layout: nextLayout }));
    scheduleImplicitFileOperationSave(projectRef.current, "Unable to save layout.");
  }

  function updateComposeLayout(layout: ComposeLayoutState) {
    const nextLayout = clampComposeLayout(layout);
    const currentLayout = projectRef.current.editorState?.composeLayout ?? defaultComposeLayoutState;
    if (JSON.stringify(nextLayout) === JSON.stringify(currentLayout)) return;
    updateEditorState((state) => ({ ...state, composeLayout: nextLayout }));
    scheduleImplicitFileOperationSave(projectRef.current, "Unable to save compose layout.");
  }

  function startEditorPanelResize(event: PointerEvent<HTMLDivElement>, kind: EditorPanelResizeKind) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const initialLayout = clampEditorLayout(projectRef.current.editorState?.layout ?? defaultEditorLayoutState);
    const initialComposeLayout = clampComposeLayout(projectRef.current.editorState?.composeLayout ?? defaultComposeLayoutState);
    const drag: EditorPanelResizeDrag = { kind, originX: event.clientX, originY: event.clientY, initialLayout, initialComposeLayout, nextLayout: initialLayout, nextComposeLayout: initialComposeLayout, frame: 0 };
    editorPanelResizeRef.current = drag;
    document.body.style.cursor = kind === "timeline" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onEditorPanelResizeMove, true);
    window.addEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.addEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }

  function onEditorPanelResizeMove(event: globalThis.PointerEvent) {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.originX;
    const deltaY = event.clientY - drag.originY;
    const nextLayout = clampEditorLayout({
      ...drag.initialLayout,
      leftPanelWidth: drag.kind === "left" ? drag.initialLayout.leftPanelWidth + deltaX : drag.initialLayout.leftPanelWidth,
      rightPanelWidth: drag.kind === "right" ? drag.initialLayout.rightPanelWidth - deltaX : drag.initialLayout.rightPanelWidth,
      timelineHeight: drag.kind === "timeline" ? drag.initialLayout.timelineHeight - deltaY : drag.initialLayout.timelineHeight,
    });
    const nextComposeLayout = clampComposeLayout({
      ...drag.initialComposeLayout,
      leftPanelWidth: drag.kind === "compose-left" ? drag.initialComposeLayout.leftPanelWidth + deltaX : drag.initialComposeLayout.leftPanelWidth,
    });
    drag.nextLayout = nextLayout;
    drag.nextComposeLayout = nextComposeLayout;
    if (drag.frame) return;

    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      applyEditorLayoutCss(drag.nextLayout);
      applyComposeLayoutCss(drag.nextComposeLayout);
    });
  }

  function onEditorPanelResizeEnd() {
    const drag = editorPanelResizeRef.current;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    applyEditorLayoutCss(drag.nextLayout);
    applyComposeLayoutCss(drag.nextComposeLayout);
    if (drag.kind === "compose-left") updateComposeLayout(drag.nextComposeLayout);
    else updateEditorLayout(drag.nextLayout);
    editorPanelResizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onEditorPanelResizeMove, true);
    window.removeEventListener("pointerup", onEditorPanelResizeEnd, true);
    window.removeEventListener("pointercancel", onEditorPanelResizeEnd, true);
  }

  async function enterFrameFullscreen() {
    updateMode("interactive");
    setPresentationMode("frame");
    showPresentationControls();
    await setElectronWindowFullscreen(true);
  }

  function enterTheaterMode() {
    updateMode("interactive");
    setPresentationMode("theater");
    showPresentationControls();
  }

  async function setElectronWindowFullscreen(fullscreen: boolean) {
    if (window.clipper?.setWindowFullscreen) {
      try {
        await window.clipper.setWindowFullscreen(fullscreen);
        return;
      } catch {
        // Fall back for stale Electron main processes during development.
      }
    }

    if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
    if (fullscreen && !document.fullscreenElement) await appRootRef.current?.requestFullscreen();
  }

  async function exitPresentationMode() {
    const mode = presentationModeRef.current;
    setPresentationMode(null);
    setPresentationControlsVisible(false);
    window.clearTimeout(presentationControlsTimeoutRef.current);
    if (mode === "frame") await setElectronWindowFullscreen(false);
  }

  function showPresentationControls() {
    if (!presentationModeRef.current) return;
    setPresentationControlsVisible(true);
    window.clearTimeout(presentationControlsTimeoutRef.current);
    presentationControlsTimeoutRef.current = window.setTimeout(() => setPresentationControlsVisible(false), 2200);
  }

  function scrubPresentationTime(nextTime: number) {
    setIsPlaying(false);
    setPresentationDisplayTime(clamp(nextTime, 0, sceneDurationSeconds));
    scrubToSceneTime(nextTime);
    showPresentationControls();
  }

  function toggleFrameZoomBar() {
    setFrameZoomBarOpen((current) => !current);
  }

  function saveCenterPreviewScroll() {
    if (centerPreviewScrollFrameRef.current) return;
    centerPreviewScrollFrameRef.current = requestAnimationFrame(() => {
      centerPreviewScrollFrameRef.current = 0;
      const viewport = centerPreviewScrollRef.current;
      if (!viewport) return;
      updateEditorState((state) => ({
        ...state,
        preview: {
          ...(state.preview ?? defaultPreviewViewportState),
          scrollLeft: Math.max(Math.round(viewport.scrollLeft), 0),
          scrollTop: Math.max(Math.round(viewport.scrollTop), 0),
        },
      }));
    });
  }

  const fileManagerProps: FileManagerWorkspaceProps = buildFileManagerWorkspaceProps({
    assets,
    compositions: compositionLibrary,
    compositionFolders: project.compositionFolders ?? [],
    compositionRootPath: watchedProjectDirectory,
    fileManagerState: project.editorState?.fileManagerState,
    timelines,
    timelineCompositionIds,
    actions: {
      addComposition: addCompositionFromLibrary,
      applyTreeSnapshot: implicitFileOperation(applyFileManagerTreeSnapshot),
      copyAsset: copyAssetPath,
      copyCompositionPath,
      createComposition: implicitFileOperation(createComposition),
      createCompositionFolder: implicitFileOperation(createCompositionFolder),
      createFolder: implicitFileOperation(createAssetFolder),
      createTimeline: implicitFileOperation(createTimeline),
      deleteAsset: implicitFileOperation(deleteAsset),
      deleteComposition: implicitFileOperation(deleteCompositionFile),
      deleteCompositionFolder: implicitFileOperation(deleteCompositionFolder),
      deleteTimeline: implicitFileOperation(deleteTimeline),
      dropFiles: implicitFileOperation(importDroppedAssets),
      duplicateAsset: implicitFileOperation(duplicateAsset),
      duplicateComposition: implicitFileOperation(duplicateComposition),
      fileManagerStateChange: updateFileManagerState,
      moveComposition: implicitFileOperation(moveComposition),
      moveTimeline: implicitFileOperation(moveTimeline),
      renameAsset: implicitFileOperation(renameAsset),
      renameComposition: implicitFileOperation(renameComposition),
      renameCompositionFolder: implicitFileOperation(renameCompositionFolder),
      renameTimeline: implicitFileOperation(renameTimeline),
      revealAssetRoot,
      revealComposition,
      revealCompositionFolder,
      selectTimeline,
      sortAssets: implicitFileOperation(sortAssets),
    },
  });
  const editorLayout = project.editorState?.layout ?? defaultEditorLayoutState;
  const composeLayout = project.editorState?.composeLayout ?? defaultComposeLayoutState;
  const composeMode = timelineMode === "compose";
  const appShellStyle = {
    "--clipper-left-panel-width": `${editorLayout.leftPanelWidth}px`,
    "--clipper-compose-left-panel-width": `${composeLayout.leftPanelWidth}px`,
    "--clipper-right-panel-width": `${editorLayout.rightPanelWidth}px`,
    "--clipper-timeline-height": `${editorLayout.timelineHeight}px`,
    "--clipper-presentation-scale": presentationScale,
    gridTemplateRows: `48px minmax(0, 1fr) var(--clipper-timeline-height)`,
  } as CSSProperties;
  const editorShellStyle = { gridTemplateColumns: `${composeMode ? "var(--clipper-compose-left-panel-width)" : "var(--clipper-left-panel-width)"} minmax(640px, 1fr) var(--clipper-right-panel-width)` } as CSSProperties;
  const presentationTime = presentationMode ? presentationDisplayTime : currentSceneTime;
  const presentationProgress = sceneDurationSeconds > 0 ? `${clamp(presentationTime / sceneDurationSeconds, 0, 1) * 100}%` : "0%";
  const presentationScrubberStyle = { "--clipper-presentation-progress": presentationProgress } as CSSProperties;
  const playbackDisplayDuration = getTimeSensitiveDisplayDuration(sceneDurationSeconds, visibleSceneAdjustmentLayers);
  const playbackDisplayTime = clamp(getTimeSensitiveDisplayTime(currentSceneTime, visibleSceneAdjustmentLayers), 0, playbackDisplayDuration);
  const playbackProgress = playbackDisplayDuration > 0 ? `${clamp(playbackDisplayTime / playbackDisplayDuration, 0, 1) * 100}%` : "0%";
  const playbackScrubberStyle = { "--clipper-playback-progress": playbackProgress } as CSSProperties;
  const blankFrameViewportStyle = { width: FRAME_WIDTH * framePreviewScale, height: FRAME_HEIGHT * framePreviewScale } as CSSProperties;
  const adjustmentPickLayer = pointPickAdjustment ? scene.adjustmentLayers?.find((layer) => layer.id === pointPickAdjustment.layerId) : null;
  const adjustmentFramePickPoint = pointPickAdjustment && adjustmentPickLayer ? getAdjustmentPointControlFramePoint(adjustmentPickLayer, pointPickAdjustment.control) : null;
  const activeFramePickPoint = pointPickAdjustment ? framePickPreviewPoint ?? adjustmentFramePickPoint : framePickPoint;

  function getAdjustmentPointControlFramePoint(layer: AdjustmentLayer, control: AdjustmentEffectPointControl): Point {
    const xValue = Number(layer.effect.params?.[control.xKey]);
    const yValue = Number(layer.effect.params?.[control.yKey]);
    const x = Number.isFinite(xValue) ? xValue : control.xDefault;
    const y = Number.isFinite(yValue) ? yValue : control.yDefault;
    return control.coordinateSpace === "percent"
      ? { x: Math.round(clamp(x, 0, 100) / 100 * FRAME_WIDTH), y: Math.round(clamp(y, 0, 100) / 100 * FRAME_HEIGHT) }
      : { x: Math.round(clamp(x, 0, FRAME_WIDTH)), y: Math.round(clamp(y, 0, FRAME_HEIGHT)) };
  }

  return (
    <>
    <main ref={appRootRef} className="relative grid h-screen bg-[#12141a] text-[#f7f7f8]" data-clipper-frame-presentation={presentationMode ?? undefined} style={appShellStyle} onPointerMove={presentationMode ? showPresentationControls : undefined}>
      <header className={`${appDragRegion} grid grid-cols-[220px_1fr_430px] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(22,24,31,0.98)] px-[22px]`}>
        <div />
        <div className={`${appNoDragRegion} flex min-w-0 items-baseline justify-center gap-2 justify-self-center text-center leading-none`} onContextMenu={openProjectTitleMenu} title="Right-click to rename project">
          {renamingProject ? <Input autoFocus className="h-7 w-[240px] border-[var(--clipper-accent)] bg-[#171920] px-2 py-0 text-center text-[14px] font-bold" value={projectNameDraft} onBlur={commitProjectRename} onChange={(event) => setProjectNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitProjectRename(); if (event.key === "Escape") cancelProjectRename(); }} /> : <strong className="truncate text-[14px] font-bold">{project.name}</strong>}
          {!renamingProject ? <span className="text-xs text-[#565b66]">/</span> : null}
          {!renamingProject ? <span className="truncate text-xs text-[#9b9da7]">{hasActiveComposition ? `${scene.name} / ${part.name}` : scene.name}</span> : null}
        </div>
        <div className={`${appNoDragRegion} flex justify-end gap-1.5`}>
          <button className={appBarActionButtonBase} title="Open a Clipper .clipper project" onClick={() => void openProjectManifest()}>Open</button>
          <button className={appBarActionButtonBase} title="Settings (Cmd/Ctrl+,)" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className={appBarActionButtonBase} onClick={() => setExportDialogOpen(true)}>Export</button>
          <button className={appBarSaveButtonClass(hasUnsavedChanges)} disabled={!hasUnsavedChanges} title="Save every project, timeline, inspector, and active code change (Ctrl+S or Cmd+S)" onClick={() => void saveAllChanges()}>Save</button>
        </div>
      </header>

      <section className="relative grid min-h-0 border-b border-[#2d313b]" data-clipper-editor-shell style={editorShellStyle}>
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
          {composeMode ? (
            hasActiveComposition ? <ComposeLayersPanel part={part} selectedObjectIds={selectionPayload?.objects.map((object) => object.id) ?? (selectedObjectId ? [selectedObjectId] : [])} onSelectObjects={selectComposeLayerObjects} onHoverObject={() => undefined} onReorderObjects={reorderComposeObjects} /> : <div className="grid h-full place-items-center rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-5 text-center text-sm font-bold text-[#737884]">Move the playhead over a composition to inspect its layers.</div>
          ) : <>
            <div className="mb-4 grid shrink-0 grid-cols-2 gap-1">
              <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "assets" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("assets")}><Folder size={14} />Assets</button>
              <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "tools" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("tools")}><Sparkles size={14} />Effects</button>
            </div>
            <div className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "assets" ? "grid" : "hidden"}`} aria-hidden={leftPanelTab !== "assets"}>
              <FileManagerWorkspace {...fileManagerProps} />
            </div>
            <div className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "tools" ? "grid" : "hidden"}`} aria-hidden={leftPanelTab !== "tools"}>
              <ToolsPanel effectsPanelState={project.editorState?.effectsPanelState} timelineMode={timelineMode} onEffectsPanelStateChange={updateEffectsPanelState} />
            </div>
          </>}
        </aside>

        <div aria-label={composeMode ? "Resize compose layers panel" : "Resize left panel"} className="absolute inset-y-0 z-30 w-2 -translate-x-1 cursor-col-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" style={{ left: composeMode ? "var(--clipper-compose-left-panel-width)" : "var(--clipper-left-panel-width)" }} onPointerDown={(event) => startEditorPanelResize(event, composeMode ? "compose-left" : "left")} />

        <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]" data-clipper-preview-column onPointerEnter={() => setPreviewColumnHovered(true)} onPointerLeave={() => setPreviewColumnHovered(false)}>
          <div className="grid place-items-center border-b border-[#2d313b] px-[18px]" data-clipper-preview-toolbar>
            <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "interactive" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => updateMode("interactive")}>Interactive</button>
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "code" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => updateMode("code")}>Code</button>
            </div>
          </div>

          <div ref={centerPreviewScrollRef} className={`timeline-scrollbar relative grid min-h-0 ${mode === "interactive" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`} data-clipper-preview-stage onScroll={saveCenterPreviewScroll}>
            {mode === "interactive" && hasActiveComposition ? (
              <FramePreview
                key={part.id}
                cameraRef={cameraRef}
                dragBox={dragBox}
                dragSelectionBoxRef={dragSelectionBoxRef}
                framePickPoint={activeFramePickPoint}
                focusPicking={isPickingZoomFocus || isPickingTranslationPosition || Boolean(pointPickAdjustment)}
                trackerPicking={Boolean(trackerPickTranslationMarker)}
                canSelectObjects={canSelectFrameObjects && !isPlaying}
                cameraTransform={cameraPreviewTransform}
                frameViewportRef={frameViewportRef}
                frameScale={framePreviewScale}
                isPlaying={isPlaying}
                part={part}
                partStart={activeTimelinePart?.start ?? 0}
                adjustmentLayers={visibleSceneAdjustmentLayers}
                playbackClock={playbackClock}
                previewTime={previewTime}
                sceneTime={currentSceneTime}
                timelineMode={timelineMode}
                motionLayers={motionLayers}
                hiddenMotionLayerIds={hiddenMotionLayerIds}
                pickingTranslationPosition={isPickingTranslationPosition || Boolean(pointPickAdjustment)}
                pickingZoomFocus={isPickingZoomFocus || Boolean(pointPickAdjustment)}
                compHidden={Boolean(timelineLayers.compHidden)}
                selectedObjects={selectionPayload?.objects ?? []}
                marqueeDragging={marqueeDragging}
                editingTextObjectId={isPlaying ? null : editingTextObjectId}
                onFramePointerCancel={onFramePointerCancel}
                onFramePointerDown={onFramePointerDown}
                onFramePointerDownCapture={onFramePointerDownCapture}
                onFramePointerMove={onFramePointerMove}
                onFramePointerUp={onFramePointerUp}
                onObjectPointerDown={startObjectDrag}
                onObjectResizePointerDown={startObjectResize}
                onTextEditCommit={updateTextObjectContent}
                onTextObjectDoubleClick={startTextObjectEdit}
                onTrackerTargetPick={commitTranslationTrackerPick}
              />
            ) : null}
            {mode === "interactive" && !hasActiveComposition ? (
              <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" aria-label="Blank preview frame" data-clipper-blank-frame-preview style={blankFrameViewportStyle} />
            ) : null}
            {mode === "code" && hasActiveComposition ? (
              <div className="min-h-0 h-full w-full">
                <CodePane key={part.id} part={part} source={compositionSources[part.filePath]} viewportState={project.editorState?.code?.[part.id]} onSaveAll={saveAllChanges} onSourceChange={(source) => updateCompositionFromSource(part, source, { history: false, syncSource: false })} onViewportStateChange={updateCodeViewportState} />
              </div>
            ) : null}
            {mode === "code" && !hasActiveComposition ? (
              <div className="grid place-items-center p-6 text-center text-sm font-bold text-[#9b9da7]">No composition source is active for this timeline.</div>
            ) : null}
          </div>

          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center border-t border-[#2d313b] bg-[#171920] px-7" data-clipper-playback-bar>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0">
              <input ref={playbackBorderScrubberRef} aria-label="Playback scrubber" className={`clipper-playback-border-scrubber relative top-[-8px] w-full transition-opacity duration-200 ${isPlaying && previewColumnHovered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} max={Math.max(playbackDisplayDuration, 0.001)} min={0} step={0.01} style={playbackScrubberStyle} type="range" value={playbackDisplayTime} onChange={(event) => scrubToPlaybackDisplayTime(Number(event.currentTarget.value))} onPointerCancel={(event) => { resumePlaybackAfterTimelineScrub(); event.currentTarget.blur(); }} onPointerDown={pausePlaybackForTimelineScrub} onPointerUp={(event) => { resumePlaybackAfterTimelineScrub(); event.currentTarget.blur(); }} />
            </div>
            <span ref={playbackTimeLabelRef} className="justify-self-start text-[#9b9da7] tabular-nums">{formatPlaybackTimeLabel(currentSceneTime)}</span>
            <div className="flex items-center justify-center gap-3">
              <QuickAccessTooltip name="Jump to start" description="Move the scrubber to the first frame of the scene." shortcut="Home"><button aria-label="Jump to start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><SkipBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Back one second" description="Move the scrubber back by one second." shortcut="Left Arrow"><button aria-label="Back one second" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => stepSceneTime(-1)}><StepBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name={isPlaying ? "Pause" : "Play"} description={isPlaying ? "Pause timeline playback." : "Start timeline playback from the scrubber."} shortcut="Space"><button aria-label={isPlaying ? "Pause" : "Play"} className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#1d212b] text-[#e9e9ec] hover:bg-[#252a36]" onClick={togglePlayback}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button></QuickAccessTooltip>
              <QuickAccessTooltip name="Next composition" description="Jump the scrubber to the start of the next composition." shortcut="Right Arrow"><button aria-label="Next composition" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToNextPart}><StepForward size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Jump to end" description="Move the scrubber to the end of the scene." shortcut="End"><button aria-label="Jump to end" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToEnd}><SkipForward size={17} /></button></QuickAccessTooltip>
            </div>
            <div className="flex items-center justify-end gap-3">
              <QuickAccessTooltip name="Cut" description="Pause playback and prepare the current point for a cut action." shortcut="C"><button aria-label="Cut" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => setIsPlaying(false)}><Scissors size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Magnetic scrub" description="Snap scrubbing to composition, zoom, and pan edges. Hold Shift for a temporary snap." shortcut="M"><button aria-label="Magnetic scrub" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${scrubSnapEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={scrubSnapEnabled} onClick={() => setScrubSnapEnabled((current) => !current)}><Magnet size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Snap selector" description="Select the timeline item currently under the scrubber as you move." shortcut="S"><button aria-label="Snap selector" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${fastSelectEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={fastSelectEnabled} onClick={() => setFastSelectEnabled((current) => !current)}><Signpost size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Replay" description="Return the scrubber to the beginning of the scene." shortcut="R"><button aria-label="Replay from start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><RotateCcw size={16} /></button></QuickAccessTooltip>
              <div ref={frameZoomControlRef} className="relative">
                {frameZoomBarOpen ? <FrameZoomBar scale={framePreviewScale} onScaleChange={updateFramePreviewScale} /> : null}
                <QuickAccessTooltip name="Preview zoom" description="Show or hide the frame preview zoom controls." shortcut=""><button aria-label="Toggle preview zoom controls" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${frameZoomBarOpen ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={frameZoomBarOpen} onClick={toggleFrameZoomBar}><Search size={16} /></button></QuickAccessTooltip>
              </div>
            </div>
          </div>
        </section>

        {presentationMode ? <div className={`pointer-events-none fixed inset-x-0 bottom-8 z-[2147483647] flex justify-center px-6 transition-opacity duration-200 ${presentationControlsVisible ? "opacity-100" : "opacity-0"}`} data-clipper-presentation-controls>
          <div className="pointer-events-auto grid w-full max-w-[600px] gap-2.5 rounded-2xl border border-white/12 bg-black/72 px-4 py-3 text-white shadow-[0_18px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 text-[11px] font-bold tabular-nums text-white/72">
              <span>{formatTime(presentationTime)}</span>
              <span>{formatTime(sceneDurationSeconds)}</span>
            </div>
            <input aria-label="Presentation scrubber" className="clipper-presentation-scrubber w-full" max={Math.max(sceneDurationSeconds, 0.001)} min={0} step={0.01} style={presentationScrubberStyle} type="range" value={clamp(presentationTime, 0, sceneDurationSeconds)} onChange={(event) => scrubPresentationTime(Number(event.currentTarget.value))} onPointerCancel={(event) => { resumePlaybackAfterPresentationScrub(); event.currentTarget.blur(); }} onPointerDown={pausePlaybackForPresentationScrub} onPointerUp={(event) => { resumePlaybackAfterPresentationScrub(); event.currentTarget.blur(); }} />
            <div className="flex items-center justify-center gap-2">
              <button aria-label="Jump to start" className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white" onClick={jumpToStart}><SkipBack size={16} /></button>
              <button aria-label="Back one second" className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white" onClick={() => stepSceneTime(-1)}><StepBack size={16} /></button>
              <button aria-label={isPlaying ? "Pause" : "Play"} className="grid h-11 w-11 place-items-center rounded-full bg-white text-black transition hover:bg-white/88" onClick={togglePlayback}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
              <button aria-label="Forward one second" className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white" onClick={() => stepSceneTime(1)}><StepForward size={16} /></button>
              <button aria-label="Jump to end" className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white" onClick={jumpToEnd}><SkipForward size={16} /></button>
            </div>
          </div>
        </div> : null}

        <aside className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#171920] p-4" data-inspector-panel>
          <section className="mb-3 grid gap-2.5">
            <h2 className={sectionTitle}>Inspector</h2>
             <div className="grid grid-cols-3 gap-1">{(["video", "motion", "agent"] as const).map((tab) => <button className={`${segmentedTabBase} capitalize ${rightPanelTab === tab ? segmentedTabActive : segmentedTabInactive}`} key={tab} onClick={() => setRightPanelTab(tab)}>{tab}</button>)}</div>
          </section>
          <section className="mb-5 grid gap-2.5">
            {rightPanelTab === "agent" ? <AgentPanel part={part} sourceStatus={sourceStatus} agentContext={agentContext} /> : selectedZoom && selectedZoomPart ? <ZoomInspector marker={selectedZoom} part={selectedZoomPart} selectedMarkerCount={selectedZoomSnapMarkers.length} selectedSnapInActive={selectedZoomSnapInActive} selectedSnapOutActive={selectedZoomSnapOutActive} middleSnapActive={selectedZoomPartMiddleSnapActive} middleTransitionMode={selectedZoomPartMiddleTransitionMode} pickingFocus={focusPickZoomMarker?.partId === selectedZoomPart.id && focusPickZoomMarker.markerId === selectedZoom.id} canSnapMiddle={Boolean(inspectorZoomMiddleSnap)} onChange={(updater) => updateZoomMarker(selectedZoomPart.id, selectedZoom.id, updater)} onScalePreview={(scale) => previewZoomScale(selectedZoomPart.id, selectedZoom.id, scale)} onScalePreviewEnd={clearZoomScalePreview} onChangeFocus={(focus) => updateZoomMarkerFocusGroup(selectedZoomPart.id, selectedZoom.id, focus)} onChangeSelectedSnap={updateSelectedZoomSnap} onChangeMiddleTransition={(mode) => updateZoomMiddleTransition(selectedZoomPart, mode)} onChangeMiddleEase={(ease) => updateZoomMiddleEase(selectedZoomPart, ease)} onDelete={() => deleteZoomMarker(selectedZoomPart.id, selectedZoom.id)} onPickFocus={() => startZoomFocusPick(selectedZoomPart.id, selectedZoom.id)} onSnapMiddle={() => snapZoomMiddle(selectedZoomPart)} /> : selectedTranslation && selectedTranslationPart ? <TranslationInspector marker={selectedTranslation} part={selectedTranslationPart} selectedMarkerCount={selectedTranslationSnapMarkers.length} selectedSnapInActive={selectedTranslationSnapInActive} selectedSnapOutActive={selectedTranslationSnapOutActive} middleSnapActive={selectedTranslationPartMiddleSnapActive} middleTransitionMode={selectedTranslationPartMiddleTransitionMode} pickingPosition={positionPickTranslationMarker?.partId === selectedTranslationPart.id && positionPickTranslationMarker.markerId === selectedTranslation.id} pickingTracker={trackerPickTranslationMarker?.partId === selectedTranslationPart.id && trackerPickTranslationMarker.markerId === selectedTranslation.id} canSnapMiddle={Boolean(inspectorTranslationMiddleSnap)} onChange={(updater) => updateTranslationMarker(selectedTranslationPart.id, selectedTranslation.id, updater)} onChangeSelectedSnap={updateSelectedTranslationSnap} onChangeMiddleTransition={(mode) => updateTranslationMiddleTransition(selectedTranslationPart, mode)} onChangeMiddleEase={(ease) => updateTranslationMiddleEase(selectedTranslationPart, ease)} onDelete={() => deleteTranslationMarker(selectedTranslationPart.id, selectedTranslation.id)} onPickPosition={() => startTranslationPositionPick(selectedTranslationPart.id, selectedTranslation.id)} onPickTracker={() => startTranslationTrackerPick(selectedTranslationPart.id, selectedTranslation.id)} onSnapMiddle={() => snapTranslationMiddle(selectedTranslationPart)} /> : selectedObject?.type === "chart" && selectedObject.chart ? <ChartInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedObject ? <ObjectInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedAdjustmentLayer ? <AdjustmentInspector layer={selectedAdjustmentLayer} sceneDuration={sceneDurationSeconds} pickingPointKey={pointPickAdjustment?.layerId === selectedAdjustmentLayer.id ? `${pointPickAdjustment.control.xKey}:${pointPickAdjustment.control.yKey}` : null} onChange={(updater) => updateAdjustmentLayer(selectedAdjustmentLayer.id, updater)} onDelete={() => deleteAdjustmentLayer(selectedAdjustmentLayer.id)} onPickPoint={(control) => startAdjustmentPointPick(selectedAdjustmentLayer.id, control)} /> : selectedPart ? <FrameInspector part={selectedPart} onDurationChange={updateSelectedPartDuration} onFrameChange={updatePartFrame} onBackgroundChange={updatePartBackground} /> : <EmptyInspector />}
          </section>
          {validationErrors.length > 0 ? <section className="mb-5 grid gap-2.5 text-[#ffbf66]"><h2 className={sectionTitle}>Validation</h2>{validationErrors.map((error) => <p key={error}>{error}</p>)}</section> : null}
        </aside>

        <div aria-label="Resize right panel" className="absolute inset-y-0 right-[var(--clipper-right-panel-width)] z-30 w-2 translate-x-1 cursor-col-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" onPointerDown={(event) => startEditorPanelResize(event, "right")} />
      </section>

      <div aria-label="Resize timeline panel" className="absolute inset-x-0 bottom-[calc(var(--clipper-timeline-height)-4px)] z-40 h-2 cursor-row-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" onPointerDown={(event) => startEditorPanelResize(event, "timeline")} />

      <TimelineProvider panelProps={{
        timelineName: activeTimelineName,
        currentSceneTime,
        isPlaying,
        playbackPlayheadRef,
        scrubbingRef: timelineScrubbingRef,
        fastSelectEnabled,
        scrubCommitThrottleMs,
        defaultNewMarkerDurationSeconds: markerDurationSeconds,
        timelineEndPaddingFraction,
        scrubSnapEnabled,
        sceneDuration: sceneDurationSeconds,
        selectedPartId,
        selectedParts,
        selectedZoomMarkerPartId: selectedZoomMarker?.partId ?? null,
        selectedZoomMarkerId: selectedZoomMarker?.markerId ?? null,
        selectedZoomMarkers,
        selectedTranslationMarkerPartId: selectedTranslationMarker?.partId ?? null,
        selectedTranslationMarkerId: selectedTranslationMarker?.markerId ?? null,
        selectedTranslationMarkers,
        selectedAdjustmentLayerId,
        selectedAdjustmentLayers,
        mode: timelineMode,
        timelineViewportState: project.editorState?.timeline ?? defaultTimelineViewportState,
        timeline,
        zoomMarkers: scene.zoomMarkers ?? [],
        translationMarkers: scene.translationMarkers ?? [],
        timelineLayers,
        adjustmentLayers: scene.adjustmentLayers ?? [],
        onModeChange: updateTimelineMode,
        onTimelineViewportStateChange: updateTimelineViewportState,
        onTimelineLayersChange: updateTimelineLayers,
        onAddCompositionLayer: addCompositionTimelineLayer,
        onRemoveCompositionLayer: removeCompositionTimelineLayer,
        onAddAdjustmentLayer: addAdjustmentTimelineLayer,
        onRemoveAdjustmentLayer: removeAdjustmentTimelineLayer,
        onAddMotionLayer: addMotionLayer,
        onRemoveMotionLayer: removeMotionLayer,
        onSelectPart: selectPart,
        onOpenComposePart: openComposePart,
        onSelectZoomMarker: selectZoomMarker,
        onSelectZoomMarkers: selectZoomMarkers,
        onSelectTranslationMarker: selectTranslationMarker,
        onSelectTranslationMarkers: selectTranslationMarkers,
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
        onMoveZoomMarker: moveZoomMarker,
        onMoveZoomMarkers: moveZoomMarkers,
        onMoveTranslationMarker: moveTranslationMarker,
        onMoveTranslationMarkers: moveTranslationMarkers,
        onScrub: scrubToSceneTime,
        onScrubStart: pausePlaybackForTimelineScrub,
        onScrubEnd: resumePlaybackAfterTimelineScrub,
        onUpdateZoomMarkers: updateZoomMarkers,
        onUpdateTranslationMarkers: updateTranslationMarkers,
        onResizeZoomMarkers: resizeZoomMarkers,
        onResizeTranslationMarkers: resizeTranslationMarkers,
        onAddComposition: addCompositionFromLibrary,
        onAddAdjustmentEffect: addAdjustmentLayerAt,
        onAddMotionEffect: addMotionEffect,
      }}>
        <ConnectedTimelinePanel />
      </TimelineProvider>
    </main>
    <ExportMediaDialog
      activeTab={exportDialogTab}
      durationSeconds={sceneDurationSeconds}
      includeSources={exportIncludeSources}
      open={exportDialogOpen}
      partCount={scene.compositions.length}
      progress={exportProgress}
      projectFormat={projectExportFormat}
      projectName={project.name}
      resolution={project.resolution}
      sceneName={scene.name}
      validationErrorCount={validationErrors.length}
      exporting={isExporting}
      onProjectExport={() => void exportProject()}
      onMediaExport={() => void exportRenderedMedia()}
      onProjectFormatChange={setProjectExportFormat}
      onIncludeSourcesChange={setExportIncludeSources}
      onOpenChange={setExportDialogOpen}
      onTabChange={setExportDialogTab}
    />
    <SettingsDialog
      activeSection={settingsSection}
      open={settingsOpen}
      scrubCommitThrottleMs={scrubCommitThrottleMs}
      defaultNewMarkerDurationSeconds={markerDurationSeconds}
      timelineEndPaddingFraction={timelineEndPaddingFraction}
      onActiveSectionChange={setSettingsSection}
      onOpenChange={setSettingsOpen}
      onScrubCommitThrottleMsChange={setScrubCommitThrottleMs}
      onDefaultNewMarkerDurationSecondsChange={setDefaultNewMarkerDurationSeconds}
      onTimelineEndPaddingFractionChange={setTimelineEndPaddingFraction}
    />
    {videoExportProgress ? <VideoExportOverlay cancelling={videoExportCancelling} progress={videoExportProgress} onCancel={() => void stopVideoExport()} /> : null}
    <AppContextMenu menu={appContextMenu} onClose={() => setAppContextMenu(null)} />
    <Toaster
      position="bottom-left"
      toastOptions={{
        duration: 2800,
        style: {
          background: "#11141a",
          border: "1px solid #2d313b",
          borderRadius: "14px",
          boxShadow: "0 18px 60px rgba(0,0,0,0.42)",
          color: "#f7f7f8",
          fontSize: "13px",
          fontWeight: 700,
          maxWidth: "min(calc(100vw - 32px), 700px)",
        },
        error: {
          iconTheme: { primary: "#ff6b6b", secondary: "#1a0f10" },
          style: { border: "1px solid #5c2a2d", color: "#ffb4b4" },
        },
      }}
    />
    </>
  );
}

function syncChartObjectBounds(object: FrameObject): FrameObject {
  if (object.type !== "chart" || !object.chart) return object;
  return { ...object, chart: { ...object.chart, bounds: object.bounds } };
}

function isCodeEditorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".monaco-editor"));
}

function isInspectorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-inspector-panel]"));
}

function isSelectPopoverTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-radix-select-content], [data-radix-popper-content-wrapper]"));
}

function isTextEditingTarget(target: HTMLElement | null) {
  const editable = target?.closest("input, textarea, select, [contenteditable='true']") as HTMLElement | null;
  if (!editable) return false;
  return !(editable instanceof HTMLInputElement && editable.type === "range");
}
