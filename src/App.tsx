import { Folder, Magnet, Pause, Play, RotateCcw, Scissors, Search, Signpost, SkipBack, SkipForward, Sparkles, StepBack, StepForward } from "lucide-react";
import { nanoid } from "nanoid";
import { startTransition, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Input } from "./components/ui/input";
import { AgentPanel } from "./components/AgentPanel";
import { AppContextMenu } from "./components/AppContextMenu";
import { FileManager, type FileManagerProps, type FileManagerTreeSnapshot } from "./components/FileManager";
import { CodePane } from "./components/CodePane";
import { ExportMediaDialog, VideoExportOverlay } from "./components/export/ExportMediaDialog";
import { FrameZoomBar } from "./components/FrameZoomBar";
import { AdjustmentInspector, ChartInspector, EmptyInspector, FrameInspector, ObjectInspector, TranslationInspector, ZoomInspector } from "./components/inspector/InspectorPanels";
import { FramePreview } from "./components/preview/FramePreview";
import { QuickAccessTooltip } from "./components/QuickAccessTooltip";
import { SettingsDialog } from "./components/SettingsDialog";
import { TimelinePanel } from "./components/timeline/TimelinePanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { appBarActionButtonBase, appBarSaveButtonClass, appDragRegion, appNoDragRegion, defaultFramePreviewScale, defaultScrubCommitThrottleMs, maxProjectHistoryActions, projectHistoryCoalesceMs, sectionTitle, segmentedTabActive, segmentedTabBase, segmentedTabInactive, selectorOffsetPx } from "./app/config";
import { exportService } from "./app/services/exportService";
import { clipperHost } from "./app/clipperHost";
import { projectPersistenceService } from "./app/services/projectPersistenceService";
import { useEditorDerivedState } from "./app/state/editorDerivedState";
import { EditorStoreProvider, useAppEditorState, useEditorStoreApi } from "./app/state/editorStore";
import { getProjectContentSnapshot, ProjectStoreProvider, useProjectDocumentState } from "./app/state/projectStore";
import type { AdjustmentLayerSelection, ContextMenuState, ExportDialogTab, LeftPanelTab, Mode, PlaybackClock, ProjectExportFormat, ProjectUpdater, RightPanelTab, SettingsSection, TimelineNodeContextTarget, TranslationMarkerSelection, VideoExportProgress, ZoomMarkerSelection } from "./app/types";
import { applyAdjustmentLayersToSceneTime } from "./core/adjustments";
import { appendAssetsToFolder, duplicateAssetTree, getAssetPath, moveAssetTree, removeAsset, sortAssetsInParent, updateAssetTree, type AssetDropIntent, type AssetSortMode } from "./core/assetTree";
import { boundsToViewport, framePointToCameraTranslation, getActiveTranslation, getActiveZoom, getCameraPreviewTransform, type CameraPreviewTransform } from "./core/camera";
import { centerOf, constrainDragDeltaToDominantAxis, getBoundsUnion, getDraggedObjects, getResizedObjects, insetBounds, isVisibleMarqueeBounds, moveBounds, selectionObjectFromFrameObject, selectionPayloadFromObjects, updateDragSelectionBoxElement, type ObjectDrag, type ObjectResize, type ResizeHandle } from "./core/frameInteraction";
import { boundsToPoints, createSelectionPayload, framePointFromClient, normalizeBounds } from "./core/geometry";
import { getMendedMarkerIds, normalizeMendedZoomMarkerFocus } from "./core/markers";
import { clamp, roundTenth, roundTwo } from "./core/math";
import { compositionFromSource, compositionToSource } from "./core/compositionSource";
import { defaultAssets, defaultPreviewViewportState, defaultTimelineMode, defaultTimelineViewportState, deleteCompositionFromProject, normalizeProject, replacePartInProject } from "./core/project";
import { formatTime, getAdjustmentPlacement, getAvailableZoomPlacement, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getZoomMiddleSnap, isZoomMiddleSnapActive, updatePartObject, type TimelineMarkerMove } from "./core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type CodeViewportState, type CompositionClip, type EditorState, type FrameObject, type MotionEase, type Part, type PartFrame, type Point, type ProjectManifest, type RichTextSegment, type SelectionPayload, type TimelineMode, type TimelineViewportState, type TranslationMarker, type ZoomMarker } from "./core/types";
import { fallbackProject } from "./fallbackProject";

const fallbackProjectManifestPath = "clipper/untitled-project.clipper";
const activeProjectManifestStorageKey = "clipper.activeProjectManifestPath";
const appStatePath = "clipper/app-state.json";
const initialProject = normalizeProject(fallbackProject);

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

function getProjectCompositionSources(project: ProjectManifest) {
  const compositions = Array.from(new Map([...(project.compositionLibrary ?? []), ...project.scenes.flatMap((scene) => scene.compositions)].map((part) => [part.filePath, part])).values()).filter((part) => !part.sourceMissing);
  const embeddedSources = project.compositionSources ?? {};
  return Object.fromEntries(compositions.map((part) => [part.filePath, embeddedSources[part.filePath] ?? compositionToSource(part)]));
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

  return localStorage.getItem(activeProjectManifestStorageKey) ?? fallbackProjectManifestPath;
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
  const { project, sourceStatus, usedFallback } = await projectPersistenceService.loadProject({ manifestPath, fallbackProject });
  const normalizedProject = normalizeProject(project);
  const activeManifestPath = usedFallback ? fallbackProjectManifestPath : clipperContainerPath(manifestPath);

  try {
    await writeStoredActiveProjectManifestPath(activeManifestPath);
  } catch {
    // Browser/dev fallback can still rely on localStorage.
  }

    return {
      manifestPath: activeManifestPath,
      project: normalizedProject,
      sourceStatus: usedFallback ? sourceStatus : `Project loaded from ${activeManifestPath}.`,
      compositionSources: getProjectCompositionSources(normalizedProject),
    };
}

export function App() {
  const [bootProject, setBootProject] = useState<BootProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBootProject().then((loadedProject) => {
      if (!cancelled) setBootProject(loadedProject);
    }).catch(() => {
      if (!cancelled) {
        setBootProject({
          manifestPath: fallbackProjectManifestPath,
          project: initialProject,
          sourceStatus: "Started an empty fallback project.",
          compositionSources: getProjectCompositionSources(initialProject),
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!bootProject) {
    return <main className="grid h-screen place-items-center bg-[#12141a] text-sm font-bold text-[#dfe2ea]">Opening project...</main>;
  }

  return (
    <ProjectStoreProvider project={bootProject.project} compositionSources={bootProject.compositionSources}>
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
  const [activeProjectManifestPath, setActiveProjectManifestPath] = useState(initialProjectManifestPath);
  const {
    mode, setMode,
    timelineMode, setTimelineMode,
    selectedSceneId, setSelectedSceneId,
    selectedPartId, setSelectedPartId,
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
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const frameZoomControlRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const savedCompositionSourcesSnapshotRef = useRef(savedCompositionSourcesSnapshot);
  const hasUnsavedChangesRef = useRef(false);
  const timelineNodeClipboardRef = useRef<TimelineNodeClipboard | null>(null);
  const modeRef = useRef(mode);
  const activePartFilePathRef = useRef("");
  const projectHistoryRef = useRef<{ past: ProjectManifest[]; future: ProjectManifest[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const implicitFileOperationSaveTimeoutRef = useRef(0);
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null);
  const videoExportIdRef = useRef<string | null>(null);
  const currentSceneTimeRef = useRef(currentSceneTime);
  const isPlayingRef = useRef(isPlaying);
  const playbackClockRef = useRef<PlaybackClock>(null);
  const wasPlayingRef = useRef(false);
  const timelineScrubbingRef = useRef(false);
  const playbackTimeLabelRef = useRef<HTMLSpanElement | null>(null);
  const playbackPlayheadRef = useRef<HTMLDivElement | null>(null);
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

  const {
    activeTimelinePart,
    agentContext,
    assets,
    cameraPreviewTransform,
    canSelectFrameObjects,
    editorStateSnapshot,
    framePickPoint,
    hasUnsavedChanges,
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
  const timelineCompositionIds = new Set(scene.compositions.map((composition) => composition.id));
  function replaceProject(nextProject: ProjectManifest, options: { history?: boolean; syncSources?: boolean } = {}) {
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
      const isCoalescedAction = now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs && projectHistoryRef.current.past.length > 0;

      projectHistoryRef.current = {
        past: isCoalescedAction ? projectHistoryRef.current.past : [...projectHistoryRef.current.past, currentProject].slice(-maxProjectHistoryActions),
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

  function updateEditorState(updater: (state: EditorState) => EditorState) {
    const current = projectRef.current;
    const nextProject = normalizeProject({
      ...current,
      editorState: updater(current.editorState ?? initialProject.editorState!),
    });
    if (JSON.stringify(nextProject.editorState) === JSON.stringify(current.editorState)) return;
    projectRef.current = nextProject;
    setProject(nextProject);
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function getSyncedCompositionSources(nextProject: ProjectManifest, previousProject: ProjectManifest | undefined, currentSources: Record<string, string>) {
    let changed = false;
    const nextSources = { ...currentSources };
    const nextParts = Array.from(new Map([...(nextProject.compositionLibrary ?? []), ...nextProject.scenes.flatMap((item) => item.compositions)].map((item) => [item.filePath, item])).values());
    const previousPartsByPath = new Map([...(previousProject?.compositionLibrary ?? []), ...(previousProject?.scenes.flatMap((item) => item.compositions) ?? [])].map((item) => [item.filePath, item]));
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

  function syncCompositionSourcesFromProject(nextProject: ProjectManifest) {
    const nextSources = getProjectCompositionSources(nextProject);
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
  }

  function resetProjectHistory() {
    projectHistoryRef.current = { past: [], future: [] };
    lastProjectHistoryAtRef.current = 0;
  }

  async function storeActiveProjectManifestPath(manifestPath: string) {
    localStorage.setItem(activeProjectManifestStorageKey, manifestPath);
    try {
      await writeStoredActiveProjectManifestPath(manifestPath);
    } catch {
      // Browser/dev fallback can still rely on localStorage.
    }
  }

  async function loadProjectFromManifest(manifestPath: string) {
    const { project: loadedProject, sourceStatus: nextSourceStatus } = await projectPersistenceService.loadProject({ manifestPath, fallbackProject });
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
    const previousProject = projectHistoryRef.current.past.at(-1);
    if (!previousProject) return;

    projectHistoryRef.current = {
      past: projectHistoryRef.current.past.slice(0, -1),
      future: [projectRef.current, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
    };
    lastProjectHistoryAtRef.current = 0;
    projectRef.current = previousProject;
    setProject(previousProject);
    setTimelineMode(previousProject.editorState?.timelineMode ?? defaultTimelineMode);
    syncCompositionSourcesFromProject(previousProject);
  }

  function redoProjectChange() {
    const nextProject = projectHistoryRef.current.future[0];
    if (!nextProject) return;

    projectHistoryRef.current = {
      past: [...projectHistoryRef.current.past, projectRef.current].slice(-maxProjectHistoryActions),
      future: projectHistoryRef.current.future.slice(1),
    };
    lastProjectHistoryAtRef.current = 0;
    projectRef.current = nextProject;
    setProject(nextProject);
    setTimelineMode(nextProject.editorState?.timelineMode ?? defaultTimelineMode);
    syncCompositionSourcesFromProject(nextProject);
  }

  function syncPlaybackDom(time: number) {
    if (playbackTimeLabelRef.current) playbackTimeLabelRef.current.textContent = formatTime(time);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.setProperty("--clipper-playhead-left", `${sceneDurationSeconds > 0 ? (time / sceneDurationSeconds) * 100 : 0}%`);
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.removeProperty("--clipper-playhead-x");
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
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    activePartFilePathRef.current = part.filePath;
  }, [part.filePath]);

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
  }, [currentSceneTime, isPlaying]);

  useEffect(() => {
    if (timelineScrubbingRef.current) return;
    commitPlayheadEditorState(currentSceneTime);
  }, [currentSceneTime]);

  useEffect(() => {
    updateEditorState((state) => ({
      ...state,
      mode,
      timelineMode,
      leftPanelTab,
      rightPanelTab,
      selectedSceneId,
      preview: {
        ...(state.preview ?? defaultPreviewViewportState),
        scale: framePreviewScale,
        zoomBarOpen: frameZoomBarOpen,
      },
    }));
  }, [framePreviewScale, frameZoomBarOpen, leftPanelTab, mode, rightPanelTab, selectedSceneId, timelineMode]);

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

  useEffect(() => () => {
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    if (scrubFrameRef.current) cancelAnimationFrame(scrubFrameRef.current);
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
    if (selectedPartId && activeTimelinePart && activeTimelinePart.id !== selectedPartId) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
    }
  }, [activeTimelinePart, selectedPartId, selectedTranslationMarker, selectedZoomMarker]);

  useEffect(() => {
    if (timelineMode === "edit") {
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
    let lastCommittedPartId = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(currentSceneTimeRef.current, scene.adjustmentLayers))?.id ?? activeTimelinePart?.id ?? "";
    let frame = 0;

    function tick(now: number) {
      const clock = playbackClockRef.current ?? { startedAt: now, startedFrom: currentSceneTimeRef.current };
      playbackClockRef.current = clock;
      const nextTime = Math.min(clock.startedFrom + (now - clock.startedAt) / 1000, sceneDurationSeconds);
      const nextTimelinePart = getTimelinePartAtTime(timeline, applyAdjustmentLayersToSceneTime(nextTime, scene.adjustmentLayers));
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
  }, [activeTimelinePart?.id, isPlaying, scene.adjustmentLayers, sceneDurationSeconds, timeline]);

  useEffect(() => {
    if (isPlaying && currentSceneTime >= sceneDurationSeconds) {
      setIsPlaying(false);
    }
  }, [currentSceneTime, isPlaying, sceneDurationSeconds]);

  useEffect(() => {
    function switchModeShortcut(key: "1" | "2" | "3" | "4") {
      if (key === "1") setMode("interactive");
      if (key === "2") setMode("code");
      if (key === "3") updateTimelineMode("edit");
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

      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

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
        pasteTimelineNodesWithToast();
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

      if ((event.key === "Backspace" || event.key === "Delete") && selectedZoomMarker) {
        event.preventDefault();
        deleteZoomMarker(selectedZoomMarker.partId, selectedZoomMarker.markerId);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedTranslationMarker) {
        event.preventDefault();
        deleteTranslationMarker(selectedTranslationMarker.partId, selectedTranslationMarker.markerId);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && (selectedAdjustmentLayers.length > 0 || selectedAdjustmentLayer)) {
        event.preventDefault();
        const layerIds = selectedAdjustmentLayers.length > 0 ? selectedAdjustmentLayers.map((selection) => selection.layerId) : selectedAdjustmentLayer ? [selectedAdjustmentLayer.id] : [];
        deleteTimelineClipboardNodes({ kind: "adjustment", nodes: (scene.adjustmentLayers ?? []).filter((layer) => layerIds.includes(layer.id)).map((layer) => ({ absoluteStart: layer.start, layer })) });
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedPartId) {
        event.preventDefault();
        deleteCompositionFromTimeline(selectedPartId);
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
  }, [isPlaying, scene, sceneDurationSeconds, selectedAdjustmentLayer, selectedAdjustmentLayers, selectedPartId, selectedTranslationMarker, selectedTranslationMarkers, selectedZoomMarker, selectedZoomMarkers, timeline]);

  function updateCurrentPart(nextPart: Part) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => {
        if (currentScene.id !== scene.id) return currentScene;
        return { ...currentScene, compositions: currentScene.compositions.map((item) => (item.id === nextPart.id ? nextPart : item)) };
      }),
    }));
  }

  function updateSceneParts(updater: (compositions: Part[]) => Part[]) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => (currentScene.id === scene.id ? { ...currentScene, compositions: updater(currentScene.compositions) } : currentScene)),
    }));
  }

  function updateTimelineViewportState(updater: (state: TimelineViewportState) => TimelineViewportState) {
    updateEditorState((state) => ({ ...state, timeline: updater(state.timeline ?? defaultTimelineViewportState), timelineMode }));
  }

  function updateTimelineMode(nextMode: TimelineMode) {
    setTimelineMode(nextMode);
    updateEditorState((state) => ({ ...state, timelineMode: nextMode }));
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
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => {
        if (currentScene.id !== scene.id) return currentScene;
        return { ...currentScene, compositions: updatePartObject(currentScene.compositions, part.id, objectId, (object) => syncChartObjectBounds(updater(object))) };
      }),
    }));
  }

  function updateSelectedObject(updater: (object: FrameObject) => FrameObject) {
    if (!selectedObjectId) return;
    updateObject(selectedObjectId, updater);
  }

  function updateTextObjectContent(objectId: string, content: string, richText?: RichTextSegment[]) {
    updateObject(objectId, (object) => (object.type === "text" ? { ...object, content, richText } : object));
  }

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCurrentPart({ ...part, frame: updater(part.frame) });
  }

  function updateSelectedPartDuration(duration: number) {
    if (!selectedPart) return;
    updateSceneParts((parts) => parts.map((item) => (item.id === selectedPart.id ? { ...item, duration } : item)));
  }

  function updatePartBackground(updater: (background: BackgroundLayer) => BackgroundLayer) {
    updateCurrentPart({ ...part, background: updater(part.background) });
  }

  function clearMarkerSelection() {
    cancelFramePickPreview();
    clearStoredMarkerSelection();
  }

  function clearNodeSelection() {
    cancelFramePickPreview();
    clearStoredNodeSelection();
  }

  async function updateCompositionFromSource(basePart: Part, source: string, options: { syncSource?: boolean; history?: boolean } = {}) {
    const nextSources = { ...compositionSourcesRef.current, [basePart.filePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    const nextPart = await compositionFromSource(basePart, source);
    const nextProject = replacePartInProject({ ...projectRef.current, compositionSources: nextSources }, basePart.id, (currentPart) => ({
      ...nextPart,
      zoomMarkers: currentPart.zoomMarkers,
      translationMarkers: currentPart.translationMarkers,
      snapshot: currentPart.snapshot,
    }));

    replaceProject(nextProject, { history: options.history, syncSources: options.syncSource !== false });

    setSourceStatus(`Preview updated from ${nextPart.filePath}.`);
  }

  async function saveProject(projectToSave = projectRef.current) {
    const embeddedProject = normalizeProject({ ...projectToSave, compositionSources: compositionSourcesRef.current });
    const snapshot = getProjectContentSnapshot(embeddedProject);

    try {
      const result = await projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPath, project: embeddedProject });
      setSavedProjectSnapshot(result.projectSnapshot ? getProjectContentSnapshot(JSON.parse(result.projectSnapshot) as ProjectManifest) : snapshot);
      setSavedCompositionSourcesSnapshot(result.compositionSourcesSnapshot);
      setSourceStatus(result.sourceStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save project.");
    }
  }

  async function saveAllChanges() {
    if (!hasUnsavedChanges) return;
    await saveProject(projectRef.current);
  }

  function scheduleImplicitFileOperationSave() {
    const projectToSave = normalizeProject({ ...projectRef.current, compositionSources: compositionSourcesRef.current });
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
        .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to save file operation."));
    }, 150);
  }

  function implicitFileOperation<T extends unknown[]>(operation: (...args: T) => void) {
    return (...args: T) => {
      operation(...args);
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
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarker(partId: string, markerId: string) {
    setSelectedPartId(partId);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarkers(selection: ZoomMarkerSelection[]) {
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedZoomMarker(primarySelection);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
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
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setFocusPickZoomMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function selectTranslationMarker(partId: string, markerId: string) {
    setSelectedPartId(partId);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectTranslationMarkers(selection: TranslationMarkerSelection[]) {
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedTranslationMarker(primarySelection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
  }

  function selectAdjustmentLayer(layerId: string) {
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers(layerId ? [{ layerId }] : []);
    setSelectedPartId("");
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
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  function updateSceneAdjustmentLayers(updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[]) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => (currentScene.id === scene.id ? { ...currentScene, adjustmentLayers: updater(currentScene.adjustmentLayers ?? []) } : currentScene)),
    }));
  }

  function updateAdjustmentLayer(layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) {
    updateSceneAdjustmentLayers((layers) => layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)));
  }

  function moveAdjustmentLayer(layerId: string, start: number) {
    updateAdjustmentLayer(layerId, (layer) => ({ ...layer, start: roundTenth(clamp(start, 0, Math.max(sceneDurationSeconds - layer.duration, 0))) }));
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers([{ layerId }]);
    setSelectedPartId("");
  }

  function addAdjustmentLayer() {
    const placement = getAdjustmentPlacement(scene.adjustmentLayers, sceneDurationSeconds, currentSceneTimeRef.current);
    const layer: AdjustmentLayer = {
      id: `adj_${Date.now().toString(36)}`,
      name: "Frame Skip",
      start: placement.start,
      duration: placement.duration,
      effect: { kind: "frameSkip", every: 2 },
    };
    updateSceneAdjustmentLayers((layers) => [...layers, layer]);
    selectAdjustmentLayer(layer.id);
  }

  function deleteAdjustmentLayer(layerId: string) {
    updateSceneAdjustmentLayers((layers) => layers.filter((layer) => layer.id !== layerId));
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
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
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setPositionPickTranslationMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
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

    pendingScrubTimeRef.current = nextTime;
    if (scrubFrameRef.current) return;

    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      const committedTime = pendingScrubTimeRef.current;
      pendingScrubTimeRef.current = null;
      if (committedTime === null) return;
      if (!timelineScrubbingRef.current) commitPlayheadEditorState(committedTime);
      startTransition(() => setCurrentSceneTime(committedTime));
    });
  }

  function togglePlayback() {
    if (isPlayingRef.current) {
      const settledTime = currentSceneTimeRef.current;
      syncPlaybackDom(settledTime);
      commitPlayheadEditorState(settledTime);
      setCurrentSceneTime(settledTime);
      setRenderCurrentSceneTime(settledTime);
      isPlayingRef.current = false;
      updatePlaybackClock(null);
      setIsPlaying(false);
      return;
    }

    if (currentSceneTimeRef.current >= sceneDurationSeconds) {
      currentSceneTimeRef.current = 0;
      syncPlaybackDom(0);
      setCurrentSceneTime(0);
    }

    updatePlaybackClock({ startedAt: performance.now(), startedFrom: currentSceneTimeRef.current });
    isPlayingRef.current = true;
    setIsPlaying(true);
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

  function deleteCompositionFromTimeline(compositionId: string) {
    if (scene.compositions.length <= 1) {
      toast.error("A timeline needs at least one composition.");
      return;
    }

    const deletedIndex = scene.compositions.findIndex((composition) => composition.id === compositionId);
    if (deletedIndex < 0) return;
    const nextSelection = scene.compositions[deletedIndex + 1]?.id ?? scene.compositions[deletedIndex - 1]?.id ?? "";
    updateSceneParts((parts) => parts.filter((composition) => composition.id !== compositionId));
    setSelectedPartId(nextSelection);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    toast.success("Composition removed from timeline. The project composition is still available in Assets.");
  }

  function addCompositionFromLibrary(compositionId: string) {
    const libraryComposition = compositionLibrary.find((composition) => composition.id === compositionId);
    if (!libraryComposition) return;
    if (scene.compositions.some((composition) => composition.id === compositionId)) {
      toast.error("That composition is already on the timeline.");
      return;
    }

    updateSceneParts((parts) => [...parts, libraryComposition]);
    setSelectedPartId(libraryComposition.id);
    clearNodeSelection();
    setSelectedPartId(libraryComposition.id);
    toast.success("Composition added to timeline.");
  }

  function updateZoomMarker(partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function previewZoomScale(partId: string, markerId: string, scale: number) {
    if (timelineMode !== "composition" || isPickingZoomFocus) return;
    const previewPart = scene.compositions.find((item) => item.id === partId);
    if (!previewPart || previewPart.id !== part.id) return;
    const previewZoomMarkers = previewPart.zoomMarkers.map((marker) => (marker.id === markerId ? { ...marker, scale } : marker));
    const activeZoom = getActiveZoom(previewZoomMarkers, previewTime);
    const activeTranslation = isPickingTranslationPosition ? null : getActiveTranslation(previewPart.translationMarkers, previewTime, previewPart);
    pendingZoomScalePreviewRef.current = getCameraPreviewTransform(activeZoom, activeTranslation);
    if (zoomScalePreviewFrameRef.current) return;
    zoomScalePreviewFrameRef.current = requestAnimationFrame(() => {
      zoomScalePreviewFrameRef.current = 0;
      const transform = pendingZoomScalePreviewRef.current;
      if (!transform || !cameraRef.current) return;
      cameraRef.current.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
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
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(updater(item.zoomMarkers, item)) };
    }));
  }

  function updateZoomMarkerFocusGroup(partId: string, markerId: string, focus: Point) {
    updateZoomMarkers(partId, (markers) => {
      const markerIds = getMendedMarkerIds(markers, markerId);
      return markers.map((marker) => (markerIds.has(marker.id) ? { ...marker, focus } : marker));
    });
  }

  function updateSelectedZoomSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedZoomMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined } : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function updateSelectedTranslationSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedTranslationMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      return { ...item, translationMarkers: item.translationMarkers.map((marker) => (selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined } : marker)) };
    }));
  }

  function updateTranslationMarkers(partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, translationMarkers: updater(item.translationMarkers, item) };
    }));
  }

  function moveZoomMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number) {
    updateSceneParts((parts) => {
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const marker = sourcePart?.zoomMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !marker) return parts;

      return parts.map((item) => {
        if (item.id === sourcePartId && item.id !== targetPartId) {
          return { ...item, zoomMarkers: item.zoomMarkers.filter((current) => current.id !== markerId) };
        }

        if (item.id !== targetPartId) return item;

        const movedMarker = { ...marker, start: clamp(start, 0, Math.max(item.duration - marker.duration, 0)) };
        const existingMarkerIndex = item.zoomMarkers.findIndex((current) => current.id === markerId);
        if (existingMarkerIndex >= 0) {
          return { ...item, zoomMarkers: item.zoomMarkers.map((current) => (current.id === markerId ? movedMarker : current)) };
        }

        return { ...item, zoomMarkers: [...item.zoomMarkers, movedMarker] };
      });
    });

    if (sourcePartId !== targetPartId) setSelectedZoomMarker({ partId: targetPartId, markerId });
  }

  function moveZoomMarkers(moves: TimelineMarkerMove[]) {
    updateSceneParts((parts) => {
      const movedMarkers = new Map<string, ZoomMarker>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !marker) continue;

        movedMarkers.set(move.markerId, { ...marker, start: clamp(move.start, 0, Math.max(targetPart.duration - marker.duration, 0)) });
        targetMovesByPart.set(move.targetPartId, [...(targetMovesByPart.get(move.targetPartId) ?? []), move]);
        if (move.sourcePartId !== move.targetPartId) {
          removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
        }
      }

      if (movedMarkers.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((current) => !removeKeys.has(current.id)) : item.zoomMarkers;

        for (const move of targetMoves) {
          const movedMarker = movedMarkers.get(move.markerId);
          if (!movedMarker) continue;
          const existingMarkerIndex = zoomMarkers.findIndex((current) => current.id === move.markerId);
          zoomMarkers = existingMarkerIndex >= 0
            ? zoomMarkers.map((current) => (current.id === move.markerId ? movedMarker : current))
            : [...zoomMarkers, movedMarker];
        }

        return zoomMarkers === item.zoomMarkers ? item : { ...item, zoomMarkers };
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
      return { ...item, translationMarkers: item.translationMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker)) };
    }));
  }

  function moveTranslationMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number) {
    updateSceneParts((parts) => {
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const marker = sourcePart?.translationMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !marker) return parts;

      return parts.map((item) => {
        if (item.id === sourcePartId && item.id !== targetPartId) {
          return { ...item, translationMarkers: item.translationMarkers.filter((current) => current.id !== markerId) };
        }

        if (item.id !== targetPartId) return item;

        const movedMarker = { ...marker, start: clamp(start, 0, Math.max(item.duration - marker.duration, 0)) };
        const existingMarkerIndex = item.translationMarkers.findIndex((current) => current.id === markerId);
        if (existingMarkerIndex >= 0) {
          return { ...item, translationMarkers: item.translationMarkers.map((current) => (current.id === markerId ? movedMarker : current)) };
        }

        return { ...item, translationMarkers: [...item.translationMarkers, movedMarker] };
      });
    });

    if (sourcePartId !== targetPartId) setSelectedTranslationMarker({ partId: targetPartId, markerId });
  }

  function moveTranslationMarkers(moves: TimelineMarkerMove[]) {
    updateSceneParts((parts) => {
      const movedMarkers = new Map<string, TranslationMarker>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !marker) continue;

        movedMarkers.set(move.markerId, { ...marker, start: clamp(move.start, 0, Math.max(targetPart.duration - marker.duration, 0)) });
        targetMovesByPart.set(move.targetPartId, [...(targetMovesByPart.get(move.targetPartId) ?? []), move]);
        if (move.sourcePartId !== move.targetPartId) {
          removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
        }
      }

      if (movedMarkers.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        let translationMarkers = removeKeys ? item.translationMarkers.filter((current) => !removeKeys.has(current.id)) : item.translationMarkers;

        for (const move of targetMoves) {
          const movedMarker = movedMarkers.get(move.markerId);
          if (!movedMarker) continue;
          const existingMarkerIndex = translationMarkers.findIndex((current) => current.id === move.markerId);
          translationMarkers = existingMarkerIndex >= 0
            ? translationMarkers.map((current) => (current.id === move.markerId ? movedMarker : current))
            : [...translationMarkers, movedMarker];
        }

        return translationMarkers === item.translationMarkers ? item : { ...item, translationMarkers };
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

  function deleteZoomMarker(partId: string, markerId: string) {
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? { ...item, zoomMarkers: item.zoomMarkers.filter((marker) => marker.id !== markerId) } : item)));
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
  }

  function deleteTranslationMarker(partId: string, markerId: string) {
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? { ...item, translationMarkers: item.translationMarkers.filter((marker) => marker.id !== markerId) } : item)));
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
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (zoomNodes.length > 0) return { kind: "zoom", nodes: zoomNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    const translationSelection = uniqueTimelineMarkerSelections(selectedTranslationMarkers.length > 0 ? selectedTranslationMarkers : selectedTranslationMarker ? [selectedTranslationMarker] : []);
    const translationNodes = translationSelection.flatMap((selection) => {
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart?.translationMarkers.find((item) => item.id === selection.markerId);
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (translationNodes.length > 0) return { kind: "translation", nodes: translationNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    if (showToast && selectedPartId) toast.error("Compositions can't be copied.");
    return null;
  }

  function getTimelineNodeClipboardForTarget(target: TimelineNodeContextTarget): TimelineNodeClipboard | null {
    if (target.kind === "part") return null;

    if (target.kind === "adjustment") {
      const layer = scene.adjustmentLayers?.find((item) => item.id === target.layerId);
      return layer ? { kind: "adjustment", nodes: [{ absoluteStart: layer.start, layer }] } : null;
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
      const markerIdsByPart = new Map<string, Set<string>>();
      for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
      updateSceneParts((parts) => parts.map((item) => {
        const markerIds = markerIdsByPart.get(item.id);
        return markerIds ? { ...item, zoomMarkers: item.zoomMarkers.filter((marker) => !markerIds.has(marker.id)) } : item;
      }));
      setSelectedZoomMarker(null);
      setSelectedZoomMarkers([]);
      setFocusPickZoomMarker(null);
      return;
    }

    const markerIdsByPart = new Map<string, Set<string>>();
    for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
    updateSceneParts((parts) => parts.map((item) => {
      const markerIds = markerIdsByPart.get(item.id);
      return markerIds ? { ...item, translationMarkers: item.translationMarkers.filter((marker) => !markerIds.has(marker.id)) } : item;
    }));
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function copySelectedTimelineNodes(showToast = true) {
    const clipboard = getSelectedTimelineNodeClipboard(showToast);
    if (!clipboard) return false;
    timelineNodeClipboardRef.current = clipboard;
    if (showToast) toast.success(`${clipboard.nodes.length} timeline node${clipboard.nodes.length === 1 ? "" : "s"} copied`);
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

  function pasteTimelineNodes() {
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    const pasteStart = clamp(currentSceneTimeRef.current, 0, sceneDurationSeconds);
    const sourceStart = Math.min(...clipboard.nodes.map((node) => node.absoluteStart));

    if (clipboard.kind === "adjustment") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(pasteStart + node.absoluteStart - sourceStart, 0, Math.max(sceneDurationSeconds - node.layer.duration, 0));
        return { ...node.layer, id: pastedTimelineNodeId("adj", index), name: `${node.layer.name} copy`, start: roundTenth(start) };
      });
      updateSceneAdjustmentLayers((layers) => [...layers, ...pastedLayers]);
      selectAdjustmentLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "zoom") {
      const pastedSelections: ZoomMarkerSelection[] = [];
      updateSceneParts((parts) => parts.map((item) => {
        const timelinePart = timeline.find((partItem) => partItem.id === item.id);
        if (!timelinePart) return item;
        const pastedMarkers = clipboard.nodes.flatMap((node, index) => {
          const absoluteStart = pasteStart + node.absoluteStart - sourceStart;
          if (absoluteStart < timelinePart.start || absoluteStart > timelinePart.start + item.duration) return [];
          const start = clamp(absoluteStart - timelinePart.start, 0, Math.max(item.duration - node.marker.duration, 0));
          if (start + node.marker.duration > item.duration + 0.001) return [];
          const marker = { ...node.marker, id: pastedTimelineNodeId("zom", index), start: roundTenth(start) };
          pastedSelections.push({ partId: item.id, markerId: marker.id });
          return [marker];
        });
        return pastedMarkers.length > 0 ? { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus([...item.zoomMarkers, ...pastedMarkers]) } : item;
      }));
      if (pastedSelections.length === 0) return false;
      selectZoomMarkers(pastedSelections);
      return true;
    }

    const pastedSelections: TranslationMarkerSelection[] = [];
    updateSceneParts((parts) => parts.map((item) => {
      const timelinePart = timeline.find((partItem) => partItem.id === item.id);
      if (!timelinePart) return item;
      const pastedMarkers = clipboard.nodes.flatMap((node, index) => {
        const absoluteStart = pasteStart + node.absoluteStart - sourceStart;
        if (absoluteStart < timelinePart.start || absoluteStart > timelinePart.start + item.duration) return [];
        const start = clamp(absoluteStart - timelinePart.start, 0, Math.max(item.duration - node.marker.duration, 0));
        if (start + node.marker.duration > item.duration + 0.001) return [];
        const marker = { ...node.marker, id: pastedTimelineNodeId("trn", index), start: roundTenth(start) };
        pastedSelections.push({ partId: item.id, markerId: marker.id });
        return [marker];
      });
      return pastedMarkers.length > 0 ? { ...item, translationMarkers: [...item.translationMarkers, ...pastedMarkers] } : item;
    }));
    if (pastedSelections.length === 0) return false;
    selectTranslationMarkers(pastedSelections);
    return true;
  }

  function pasteTimelineNodesWithToast() {
    if (pasteTimelineNodes()) {
      toast.success("Timeline node pasted");
      return;
    }
    toast.error(timelineNodeClipboardRef.current ? "No room to paste timeline node here." : "No timeline node copied.");
  }

  function openTimelineNodeContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const targetKey = `${"partId" in target ? target.partId : ""}:${"markerId" in target ? target.markerId : "layerId" in target ? target.layerId : ""}`;
    const targetAlreadySelected = target.kind === "adjustment"
      ? selectedAdjustmentLayers.some((selection) => selection.layerId === target.layerId) || selectedAdjustmentLayerId === target.layerId
      : target.kind === "part"
        ? selectedPartId === target.partId && !selectedZoomMarker && !selectedTranslationMarker
        : target.kind === "zoom"
        ? selectedZoomMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedZoomMarker?.partId === target.partId && selectedZoomMarker.markerId === target.markerId)
        : selectedTranslationMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedTranslationMarker?.partId === target.partId && selectedTranslationMarker.markerId === target.markerId);
    const menuClipboard = targetAlreadySelected ? getSelectedTimelineNodeClipboard() : getTimelineNodeClipboardForTarget(target);
    if (target.kind === "adjustment") selectAdjustmentLayer(target.layerId);
    if (target.kind === "part") selectPart(target.partId);
    if (target.kind === "zoom") selectZoomMarker(target.partId, target.markerId);
    if (target.kind === "translation") selectTranslationMarker(target.partId, target.markerId);
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Copy", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
          toast.success(`${menuClipboard.nodes.length} timeline node${menuClipboard.nodes.length === 1 ? "" : "s"} copied`);
        } },
        { label: "Cut", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
          deleteTimelineClipboardNodes(menuClipboard);
          toast.success(`${menuClipboard.nodes.length} timeline node${menuClipboard.nodes.length === 1 ? "" : "s"} cut`);
        } },
        { label: "Paste", action: pasteTimelineNodesWithToast, disabled: !timelineNodeClipboardRef.current },
        { label: "Delete", danger: true, action: () => {
          if (target.kind === "part") deleteCompositionFromTimeline(target.partId);
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
    const placement = getAvailableZoomPlacement(part.translationMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s pan marker.");
      return;
    }

    const marker: TranslationMarker = {
      id: `trn_${Date.now().toString(36)}`,
      start: placement.start,
      duration: placement.duration,
      position: selectedObject ? framePointToCameraTranslation(centerOf(selectedObject.bounds)) : { x: 0, y: 0 },
    };
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function snapZoomMiddle(targetPart = part) {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(targetPart.zoomMarkers, snap);
    const selectedIds = new Set(targetPartSelectedZoomIds);
    const nextSelection = snap.pairs.length > 1
      ? targetPart.zoomMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => ({ partId: targetPart.id, markerId: marker.id }))
      : [{ partId: targetPart.id, markerId: snap.pairs[0].previousId }, { partId: targetPart.id, markerId: snap.pairs[0].nextId }];
    const nextBounds = new Map(targetPart.zoomMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    const sharedFocus = targetPart.zoomMarkers.find((marker) => marker.id === snap.pairs[0].previousId)?.focus;

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => {
          const bounds = nextBounds.get(marker.id);
          if (!bounds) return marker;
          return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), focus: !middleSnapActive && sharedFocus && mendedIds.has(marker.id) ? sharedFocus : marker.focus, snapIn: bounds.snapIn, snapOut: bounds.snapOut };
        }),
      };
    }));
    setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    setSelectedZoomMarkers(nextSelection);
  }

  function updateZoomMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.zoomMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)),
      };
    }));
  }

  function updateZoomMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.zoomMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleEase: ease } : marker)),
      };
    }));
  }

  function snapTranslationMiddle(targetPart = part) {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(targetPart.translationMarkers, snap);
    const selectedIds = new Set(targetPartSelectedTranslationIds);
    const nextSelection = snap.pairs.length > 1
      ? targetPart.translationMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => ({ partId: targetPart.id, markerId: marker.id }))
      : [{ partId: targetPart.id, markerId: snap.pairs[0].previousId }, { partId: targetPart.id, markerId: snap.pairs[0].nextId }];
    const nextBounds = new Map(targetPart.translationMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut }]));

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => {
          const bounds = nextBounds.get(marker.id);
          if (!bounds) return marker;
          return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut };
        }),
      };
    }));
    setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    setSelectedTranslationMarkers(nextSelection);
  }

  function updateTranslationMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.translationMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)),
      };
    }));
  }

  function updateTranslationMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.translationMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleEase: ease } : marker)),
      };
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
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== drag.partId) return item;
      return {
        ...item,
        objects: item.objects.map((object) => {
          const nextBounds = nextBoundsById.get(object.id);
          return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
        }),
      };
    }));
    updateObjectDragSelection(nextObjects);
    finishCommittedObjectDrag(drag.objects);
  }

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "interactive" || !cameraRef.current || objectDragRef.current || objectResizeRef.current) return;
    if (focusPickZoomMarker) {
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
    if (!focusPickZoomMarker && !positionPickTranslationMarker) return;
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
    if (focusPickZoomMarker || positionPickTranslationMarker) {
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

    if (focusPickZoomMarker || positionPickTranslationMarker) {
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
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== resize.partId) return item;
      return {
        ...item,
        objects: item.objects.map((object) => {
          const nextBounds = nextBoundsById.get(object.id);
          return nextBounds ? syncChartObjectBounds({ ...object, bounds: nextBounds }) : object;
        }),
      };
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

  function createAssetFolder(parentFolderId?: string) {
    const folder = { id: `ast_folder_${Date.now().toString(36)}`, name: "New folder", kind: "folder" as const, children: [] };
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
    toast.success("Composition added to the library.");
  }

  function createCompositionFolder(parentFolderPath = watchedProjectDirectory) {
    const folderPath = `${parentFolderPath}/new-folder-${Date.now().toString(36)}`;
    updateProject((current) => ({ ...current, compositionFolders: Array.from(new Set([...(current.compositionFolders ?? []), folderPath])) }));
  }

  function createTimeline() {
    const timelineId = `tl_${nanoid(8)}`;
    const firstComposition = compositionLibrary[0];
    updateProject((current) => ({
      ...current,
      scenes: [...current.scenes, {
        id: timelineId,
        name: `Timeline ${(current.timelines?.length ?? current.scenes.length) + 1}`,
        compositions: firstComposition ? [firstComposition] : [],
        adjustmentLayers: [],
      }],
      timelines: [...(current.timelines ?? []), {
        id: timelineId,
        name: `Timeline ${(current.timelines?.length ?? current.scenes.length) + 1}`,
        filePath: `${watchedProjectDirectory}/${timelineId}.timeline.json`,
        clips: firstComposition ? [{ id: firstComposition.id, compositionId: firstComposition.id, zoomMarkers: [], translationMarkers: [] }] : [],
        adjustmentLayers: [],
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
      scenes: current.scenes.map((scene) => scene.id === timelineId ? { ...scene, name: nextName } : scene),
      timelines: (current.timelines ?? []).map((timeline) => timeline.id === timelineId ? { ...timeline, name: nextName } : timeline),
    }));
  }

  function reorderTimeline(sourceTimelineId: string, targetTimelineId: string, action: "before" | "after") {
    if (sourceTimelineId === targetTimelineId) return;
    updateProject((current) => {
      const timelines = current.timelines ?? [];
      const scenes = current.scenes;
      const sourceTimelineIndex = timelines.findIndex((timeline) => timeline.id === sourceTimelineId);
      const targetTimelineIndex = timelines.findIndex((timeline) => timeline.id === targetTimelineId);
      const sourceSceneIndex = scenes.findIndex((scene) => scene.id === sourceTimelineId);
      const targetSceneIndex = scenes.findIndex((scene) => scene.id === targetTimelineId);
      if (sourceTimelineIndex < 0 || targetTimelineIndex < 0 || sourceSceneIndex < 0 || targetSceneIndex < 0) return current;

      return {
        ...current,
        timelines: reorderByIntent(timelines, sourceTimelineIndex, targetTimelineIndex, action),
        scenes: reorderByIntent(scenes, sourceSceneIndex, targetSceneIndex, action),
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
    updateProject((current) => ({ ...current, scenes: current.scenes.filter((scene) => scene.id !== timelineId), timelines: (current.timelines ?? []).filter((timeline) => timeline.id !== timelineId) }));
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
      scenes: current.scenes.map((currentScene) => ({ ...currentScene, compositions: currentScene.compositions.map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item) })),
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
      scenes: current.scenes.map((currentScene) => ({
        ...currentScene,
        compositions: currentScene.compositions.map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item),
      })),
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
      const nextSceneById = new Map(current.scenes.map((currentScene) => [currentScene.id, {
        ...currentScene,
        compositions: currentScene.compositions.map((composition) => ({ ...composition, filePath: snapshot.compositionFilePaths[composition.id] ?? composition.filePath })),
      }]));

      return {
        ...current,
        assets: snapshot.assets,
        compositionSources: nextSources,
        compositionFolders: snapshot.compositionFolders,
        editorState: { ...(current.editorState ?? initialProject.editorState!), fileManagerState: snapshot.fileManagerState },
        compositionLibrary: [...snapshot.compositionOrder.flatMap((id) => nextCompositionById.get(id) ?? []), ...library.filter((composition) => !orderedCompositionIds.has(composition.id)).map((composition) => nextCompositionById.get(composition.id) ?? composition)],
        timelines: [...snapshot.timelineOrder.flatMap((id) => nextTimelineById.get(id) ?? []), ...timelines.filter((timeline) => !orderedTimelineIds.has(timeline.id)).map((timeline) => nextTimelineById.get(timeline.id) ?? timeline)],
        scenes: [...snapshot.timelineOrder.flatMap((id) => nextSceneById.get(id) ?? []), ...current.scenes.filter((currentScene) => !orderedTimelineIds.has(currentScene.id)).map((currentScene) => nextSceneById.get(currentScene.id) ?? currentScene)],
      };
    }, { syncSources: false });
  }

  function updateFileManagerState(fileManagerState: EditorState["fileManagerState"]) {
    updateEditorState((state) => ({ ...state, fileManagerState }));
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
      scenes: current.scenes.map((currentScene) => ({ ...currentScene, compositions: currentScene.compositions.filter((item) => !affectedIds.has(item.id)) })),
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

  const fileManagerProps: FileManagerProps = {
    assets,
    compositions: compositionLibrary,
    compositionFolders: project.compositionFolders ?? [],
    compositionRootPath: watchedProjectDirectory,
    fileManagerState: project.editorState?.fileManagerState,
    timelines,
    timelineCompositionIds,
    onAddComposition: addCompositionFromLibrary,
    onApplyTreeSnapshot: implicitFileOperation(applyFileManagerTreeSnapshot),
    onCopyAsset: copyAssetPath,
    onCopyCompositionPath: copyCompositionPath,
    onCreateComposition: implicitFileOperation(createComposition),
    onCreateCompositionFolder: implicitFileOperation(createCompositionFolder),
    onCreateFolder: implicitFileOperation(createAssetFolder),
    onCreateTimeline: implicitFileOperation(createTimeline),
    onDeleteAsset: implicitFileOperation(deleteAsset),
    onDeleteComposition: implicitFileOperation(deleteCompositionFile),
    onDeleteCompositionFolder: implicitFileOperation(deleteCompositionFolder),
    onDeleteTimeline: implicitFileOperation(deleteTimeline),
    onDropFiles: implicitFileOperation(importDroppedAssets),
    onDuplicateAsset: implicitFileOperation(duplicateAsset),
    onDuplicateComposition: implicitFileOperation(duplicateComposition),
    onFileManagerStateChange: updateFileManagerState,
    onMoveComposition: implicitFileOperation(moveComposition),
    onMoveTimeline: implicitFileOperation(moveTimeline),
    onRenameAsset: implicitFileOperation(renameAsset),
    onRenameComposition: implicitFileOperation(renameComposition),
    onRenameCompositionFolder: implicitFileOperation(renameCompositionFolder),
    onRenameTimeline: implicitFileOperation(renameTimeline),
    onRevealAssetRoot: revealAssetRoot,
    onRevealComposition: revealComposition,
    onRevealCompositionFolder: revealCompositionFolder,
    onSelectTimeline: selectTimeline,
    onSortAssets: implicitFileOperation(sortAssets),
  };

  return (
    <>
    <main className="grid h-screen grid-rows-[48px_minmax(0,1fr)_340px] bg-[#12141a] text-[#f7f7f8]">
      <header className={`${appDragRegion} grid grid-cols-[220px_1fr_430px] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(22,24,31,0.98)] px-[22px]`}>
        <div />
        <div className={`${appNoDragRegion} flex min-w-0 items-baseline justify-center gap-2 justify-self-center text-center leading-none`} onContextMenu={openProjectTitleMenu} title="Right-click to rename project">
          {renamingProject ? <Input autoFocus className="h-7 w-[240px] border-[var(--clipper-accent)] bg-[#171920] px-2 py-0 text-center text-[14px] font-bold" value={projectNameDraft} onBlur={commitProjectRename} onChange={(event) => setProjectNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitProjectRename(); if (event.key === "Escape") cancelProjectRename(); }} /> : <strong className="truncate text-[14px] font-bold">{project.name}</strong>}
          {!renamingProject ? <span className="text-xs text-[#565b66]">/</span> : null}
          {!renamingProject ? <span className="truncate text-xs text-[#9b9da7]">{scene.name} / {part.name}</span> : null}
        </div>
        <div className={`${appNoDragRegion} flex justify-end gap-1.5`}>
          <button className={appBarActionButtonBase} title="Open a Clipper .clipper project" onClick={() => void openProjectManifest()}>Open</button>
          <button className={appBarActionButtonBase} title="Settings (Cmd/Ctrl+,)" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className={appBarActionButtonBase} onClick={() => setExportDialogOpen(true)}>Export</button>
          <button className={appBarSaveButtonClass(hasUnsavedChanges)} disabled={!hasUnsavedChanges} title="Save every project, timeline, inspector, and active code change (Ctrl+S or Cmd+S)" onClick={() => void saveAllChanges()}>Save</button>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[286px_minmax(640px,1fr)_350px] border-b border-[#2d313b]">
        <aside className="min-h-0 overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
          <div className="mb-4 grid grid-cols-2 gap-1">
            <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "assets" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("assets")}><Folder size={14} />Assets</button>
            <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "tools" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("tools")}><Sparkles size={14} />Effects</button>
          </div>
          {leftPanelTab === "assets" ? (
            <FileManager {...fileManagerProps} />
          ) : (
            <ToolsPanel timelineMode={timelineMode} canSnapMiddle={Boolean(zoomMiddleSnap)} onAddAdjustmentLayer={addAdjustmentLayer} onAddTranslationMarker={addTranslationMarker} onAddZoomMarker={addZoomMarker} onSnapMiddle={() => snapZoomMiddle()} />
          )}
        </aside>

        <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]">
          <div className="grid place-items-center border-b border-[#2d313b] px-[18px]">
            <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "interactive" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => setMode("interactive")}>Interactive</button>
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "code" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => setMode("code")}>Code</button>
            </div>
          </div>

          <div ref={centerPreviewScrollRef} className={`timeline-scrollbar relative grid min-h-0 ${mode === "interactive" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`} onScroll={saveCenterPreviewScroll}>
            {mode === "interactive" ? (
              <FramePreview
                key={part.id}
                cameraRef={cameraRef}
                dragBox={dragBox}
                dragSelectionBoxRef={dragSelectionBoxRef}
                framePickPoint={framePickPoint}
                focusPicking={isPickingZoomFocus || isPickingTranslationPosition}
                canSelectObjects={canSelectFrameObjects}
                cameraTransform={cameraPreviewTransform}
                frameViewportRef={frameViewportRef}
                frameScale={framePreviewScale}
                isPlaying={isPlaying}
                part={part}
                partStart={activeTimelinePart?.start ?? 0}
                adjustmentLayers={scene.adjustmentLayers}
                playbackClock={playbackClock}
                previewTime={previewTime}
                timelineMode={timelineMode}
                zoomMarkers={part.zoomMarkers}
                pickingTranslationPosition={isPickingTranslationPosition}
                pickingZoomFocus={isPickingZoomFocus}
                selectedObjects={selectionPayload?.objects ?? []}
                marqueeDragging={marqueeDragging}
                editingTextObjectId={editingTextObjectId}
                onFramePointerCancel={onFramePointerCancel}
                onFramePointerDown={onFramePointerDown}
                onFramePointerDownCapture={onFramePointerDownCapture}
                onFramePointerMove={onFramePointerMove}
                onFramePointerUp={onFramePointerUp}
                onObjectPointerDown={startObjectDrag}
                onObjectResizePointerDown={startObjectResize}
                onTextEditCommit={updateTextObjectContent}
                onTextObjectDoubleClick={startTextObjectEdit}
              />
            ) : null}
            {mode === "code" ? (
              <div className="min-h-0 h-full w-full">
                <CodePane key={part.id} part={part} source={compositionSources[part.filePath]} viewportState={project.editorState?.code?.[part.id]} onSaveAll={saveAllChanges} onSourceChange={(source) => updateCompositionFromSource(part, source, { history: false, syncSource: false })} onViewportStateChange={updateCodeViewportState} />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-[#2d313b] bg-[#171920] px-7">
            <span ref={playbackTimeLabelRef} className="justify-self-start text-[#9b9da7] tabular-nums">{formatTime(currentSceneTime)}</span>
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

        <aside className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#171920] p-4" data-inspector-panel>
          <section className="mb-3 grid gap-2.5">
            <h2 className={sectionTitle}>Inspector</h2>
             <div className="grid grid-cols-3 gap-1">{(["video", "motion", "agent"] as const).map((tab) => <button className={`${segmentedTabBase} capitalize ${rightPanelTab === tab ? segmentedTabActive : segmentedTabInactive}`} key={tab} onClick={() => setRightPanelTab(tab)}>{tab}</button>)}</div>
          </section>
          <section className="mb-5 grid gap-2.5">
            {rightPanelTab === "agent" ? <AgentPanel part={part} sourceStatus={sourceStatus} agentContext={agentContext} /> : selectedZoom && selectedZoomPart ? <ZoomInspector marker={selectedZoom} part={selectedZoomPart} selectedMarkerCount={selectedZoomSnapMarkers.length} selectedSnapInActive={selectedZoomSnapInActive} selectedSnapOutActive={selectedZoomSnapOutActive} middleSnapActive={selectedZoomPartMiddleSnapActive} middleTransitionMode={selectedZoomPartMiddleTransitionMode} pickingFocus={focusPickZoomMarker?.partId === selectedZoomPart.id && focusPickZoomMarker.markerId === selectedZoom.id} canSnapMiddle={Boolean(inspectorZoomMiddleSnap)} onChange={(updater) => updateZoomMarker(selectedZoomPart.id, selectedZoom.id, updater)} onScalePreview={(scale) => previewZoomScale(selectedZoomPart.id, selectedZoom.id, scale)} onScalePreviewEnd={clearZoomScalePreview} onChangeFocus={(focus) => updateZoomMarkerFocusGroup(selectedZoomPart.id, selectedZoom.id, focus)} onChangeSelectedSnap={updateSelectedZoomSnap} onChangeMiddleTransition={(mode) => updateZoomMiddleTransition(selectedZoomPart, mode)} onChangeMiddleEase={(ease) => updateZoomMiddleEase(selectedZoomPart, ease)} onDelete={() => deleteZoomMarker(selectedZoomPart.id, selectedZoom.id)} onPickFocus={() => startZoomFocusPick(selectedZoomPart.id, selectedZoom.id)} onSnapMiddle={() => snapZoomMiddle(selectedZoomPart)} /> : selectedTranslation && selectedTranslationPart ? <TranslationInspector marker={selectedTranslation} part={selectedTranslationPart} selectedMarkerCount={selectedTranslationSnapMarkers.length} selectedSnapInActive={selectedTranslationSnapInActive} selectedSnapOutActive={selectedTranslationSnapOutActive} middleSnapActive={selectedTranslationPartMiddleSnapActive} middleTransitionMode={selectedTranslationPartMiddleTransitionMode} pickingPosition={positionPickTranslationMarker?.partId === selectedTranslationPart.id && positionPickTranslationMarker.markerId === selectedTranslation.id} canSnapMiddle={Boolean(inspectorTranslationMiddleSnap)} onChange={(updater) => updateTranslationMarker(selectedTranslationPart.id, selectedTranslation.id, updater)} onChangeSelectedSnap={updateSelectedTranslationSnap} onChangeMiddleTransition={(mode) => updateTranslationMiddleTransition(selectedTranslationPart, mode)} onChangeMiddleEase={(ease) => updateTranslationMiddleEase(selectedTranslationPart, ease)} onDelete={() => deleteTranslationMarker(selectedTranslationPart.id, selectedTranslation.id)} onPickPosition={() => startTranslationPositionPick(selectedTranslationPart.id, selectedTranslation.id)} onSnapMiddle={() => snapTranslationMiddle(selectedTranslationPart)} /> : selectedObject?.type === "chart" && selectedObject.chart ? <ChartInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedObject ? <ObjectInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedAdjustmentLayer ? <AdjustmentInspector layer={selectedAdjustmentLayer} sceneDuration={sceneDurationSeconds} onChange={(updater) => updateAdjustmentLayer(selectedAdjustmentLayer.id, updater)} onDelete={() => deleteAdjustmentLayer(selectedAdjustmentLayer.id)} /> : selectedPart ? <FrameInspector part={selectedPart} onDurationChange={updateSelectedPartDuration} onFrameChange={updatePartFrame} onBackgroundChange={updatePartBackground} /> : <EmptyInspector />}
          </section>
          {validationErrors.length > 0 ? <section className="mb-5 grid gap-2.5 text-[#ffbf66]"><h2 className={sectionTitle}>Validation</h2>{validationErrors.map((error) => <p key={error}>{error}</p>)}</section> : null}
        </aside>
      </section>

      <TimelinePanel
        currentSceneTime={currentSceneTime}
        isPlaying={isPlaying}
        playbackPlayheadRef={playbackPlayheadRef}
        scrubbingRef={timelineScrubbingRef}
        fastSelectEnabled={fastSelectEnabled}
        scrubCommitThrottleMs={scrubCommitThrottleMs}
        scrubSnapEnabled={scrubSnapEnabled}
        sceneDuration={sceneDurationSeconds}
        selectedPartId={selectedPartId}
        selectedZoomMarkerPartId={selectedZoomMarker?.partId ?? null}
        selectedZoomMarkerId={selectedZoomMarker?.markerId ?? null}
        selectedZoomMarkers={selectedZoomMarkers}
        selectedTranslationMarkerPartId={selectedTranslationMarker?.partId ?? null}
        selectedTranslationMarkerId={selectedTranslationMarker?.markerId ?? null}
        selectedTranslationMarkers={selectedTranslationMarkers}
        selectedAdjustmentLayerId={selectedAdjustmentLayerId}
        selectedAdjustmentLayers={selectedAdjustmentLayers}
        mode={timelineMode}
        timelineViewportState={project.editorState?.timeline ?? defaultTimelineViewportState}
        timeline={timeline}
        adjustmentLayers={scene.adjustmentLayers ?? []}
        onModeChange={updateTimelineMode}
        onTimelineViewportStateChange={updateTimelineViewportState}
        onSelectPart={selectPart}
        onSelectZoomMarker={selectZoomMarker}
        onSelectZoomMarkers={selectZoomMarkers}
        onSelectTranslationMarker={selectTranslationMarker}
        onSelectTranslationMarkers={selectTranslationMarkers}
        onSelectAdjustmentLayer={selectAdjustmentLayer}
        onSelectAdjustmentLayers={selectAdjustmentLayers}
        onClearTimelineSelection={clearNodeSelection}
        onOpenNodeContextMenu={openTimelineNodeContextMenu}
        onMoveAdjustmentLayer={moveAdjustmentLayer}
        onUpdateAdjustmentLayer={updateAdjustmentLayer}
        onReorderPart={reorderPart}
        onMoveZoomMarker={moveZoomMarker}
        onMoveZoomMarkers={moveZoomMarkers}
        onMoveTranslationMarker={moveTranslationMarker}
        onMoveTranslationMarkers={moveTranslationMarkers}
        onScrub={scrubToSceneTime}
        onUpdateZoomMarkers={updateZoomMarkers}
        onUpdateTranslationMarkers={updateTranslationMarkers}
        onAddComposition={addCompositionFromLibrary}
      />
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
      onActiveSectionChange={setSettingsSection}
      onOpenChange={setSettingsOpen}
      onScrubCommitThrottleMsChange={setScrubCommitThrottleMs}
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
