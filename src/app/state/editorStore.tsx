import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { defaultFramePreviewScale, defaultNewMarkerDurationSeconds, defaultPausePlaybackOnScrub, defaultScrubCommitThrottleMs, defaultTimelineEndPaddingFraction, defaultTimelinePrecision } from "../config";
import type { AdjustmentLayerSelection, CompositionSelection, ContextMenuState, ExportDialogTab, LeftPanelTab, Mode, MotionMarkerSelection, PlaybackClock, ProjectExportFormat, RightPanelTab, SettingsSection, VideoExportProgress } from "../types";
import { defaultPreviewViewportState, defaultTimelineMode } from "../../core/project";
import type { Bounds, EditorState, PersistedEditorTab, Point, ProjectManifest, SelectionPayload, TimelineMode } from "../../core/types";

type Setter<T> = T | ((current: T) => T);
const closedEditorTabStackLimit = 20;

type MarkerSelection = { partId: string; markerId: string } | null;

function normalizeMode(mode: EditorState["mode"] | undefined): Mode {
  return mode === "editor" || mode === "code" ? "editor" : "preview";
}

export type EditorStoreState = {
  mode: Mode;
  timelineMode: TimelineMode;
  selectedSceneId: string;
  selectedPartId: string;
  selectedParts: CompositionSelection[];
  selectedObjectId: string | null;
  editingTextObjectId: string | null;
  selectedMotionMarker: MarkerSelection;
  selectedMotionMarkers: MotionMarkerSelection[];
  focusPickZoomMarker: MarkerSelection;
  positionPickTranslationMarker: MarkerSelection;
  selectedAdjustmentLayerId: string | null;
  selectedAdjustmentLayers: AdjustmentLayerSelection[];
  selectedTransitionLayerId: string | null;
  selectedTransitionLayers: Array<{ layerId: string }>;
  selectionPayload: SelectionPayload | null;
  framePickPreviewPoint: Point | null;
  dragStart: Point | null;
  dragBox: Bounds | null;
  marqueeDragging: boolean;
  currentSceneTime: number;
  isPlaying: boolean;
  playbackClock: PlaybackClock;
  frameZoomBarOpen: boolean;
  framePreviewScale: number;
  scrubSnapEnabled: boolean;
  scrubCommitThrottleMs: number;
  defaultNewMarkerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  timelinePrecision: number;
  pausePlaybackOnScrub: boolean;
  fastSelectEnabled: boolean;
  leftPanelTab: LeftPanelTab;
  rightPanelTab: RightPanelTab;
  sourceStatus: string;
  appContextMenu: ContextMenuState;
  renamingProject: boolean;
  projectNameDraft: string;
  exportDialogOpen: boolean;
  exportDialogTab: ExportDialogTab;
  projectExportFormat: ProjectExportFormat;
  exportIncludeSources: boolean;
  isExporting: boolean;
  exportProgress: string | null;
  videoExportProgress: VideoExportProgress | null;
  videoExportCancelling: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  editorTabs: EditorTab[];
  closedEditorTabs: ClosedEditorTab[];
  activeEditorTabId: string | null;
};

export type EditorTab = {
  id: string;
  filePath: string;
  source?: string;
  language: string;
  unsupportedReason?: string;
  isComposition?: boolean;
  isPinned: boolean;
};

export type ClosedEditorTab = Omit<EditorTab, "source">;

function tabsFromEditorSession(editorState: EditorState | undefined): EditorTab[] {
  return editorState?.editorSession?.tabs.map((tab: PersistedEditorTab) => ({ ...tab, isPinned: true })) ?? [];
}

function activeTabIdFromEditorSession(editorState: EditorState | undefined) {
  const tabs = editorState?.editorSession?.tabs ?? [];
  const activeTabId = editorState?.editorSession?.activeTabId ?? null;
  return activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? null;
}

export type EditorStoreActions = {
  setMode: (mode: Setter<Mode>) => void;
  setTimelineMode: (mode: Setter<TimelineMode>) => void;
  setSelectedSceneId: (sceneId: Setter<string>) => void;
  setSelectedPartId: (partId: Setter<string>) => void;
  setSelectedParts: (parts: Setter<CompositionSelection[]>) => void;
  setSelectedObjectId: (objectId: Setter<string | null>) => void;
  setEditingTextObjectId: (objectId: Setter<string | null>) => void;
  setSelectedMotionMarker: (selection: Setter<MarkerSelection>) => void;
  setSelectedMotionMarkers: (selection: Setter<MotionMarkerSelection[]>) => void;
  setFocusPickZoomMarker: (selection: Setter<MarkerSelection>) => void;
  setPositionPickTranslationMarker: (selection: Setter<MarkerSelection>) => void;
  setSelectedAdjustmentLayerId: (id: Setter<string | null>) => void;
  setSelectedAdjustmentLayers: (selection: Setter<AdjustmentLayerSelection[]>) => void;
  setSelectedTransitionLayerId: (id: Setter<string | null>) => void;
  setSelectedTransitionLayers: (selection: Setter<Array<{ layerId: string }>>) => void;
  setSelectionPayload: (payload: Setter<SelectionPayload | null>) => void;
  setFramePickPreviewPoint: (point: Setter<Point | null>) => void;
  setDragStart: (point: Setter<Point | null>) => void;
  setDragBox: (bounds: Setter<Bounds | null>) => void;
  setMarqueeDragging: (dragging: Setter<boolean>) => void;
  setCurrentSceneTime: (time: Setter<number>) => void;
  setIsPlaying: (playing: Setter<boolean>) => void;
  setPlaybackClock: (clock: Setter<PlaybackClock>) => void;
  setFrameZoomBarOpen: (open: Setter<boolean>) => void;
  setFramePreviewScale: (scale: Setter<number>) => void;
  setScrubSnapEnabled: (enabled: Setter<boolean>) => void;
  setScrubCommitThrottleMs: (ms: Setter<number>) => void;
  setDefaultNewMarkerDurationSeconds: (seconds: Setter<number>) => void;
  setTimelineEndPaddingFraction: (fraction: Setter<number>) => void;
  setTimelinePrecision: (precision: Setter<number>) => void;
  setPausePlaybackOnScrub: (enabled: Setter<boolean>) => void;
  setFastSelectEnabled: (enabled: Setter<boolean>) => void;
  setLeftPanelTab: (tab: Setter<LeftPanelTab>) => void;
  setRightPanelTab: (tab: Setter<RightPanelTab>) => void;
  setSourceStatus: (status: Setter<string>) => void;
  setAppContextMenu: (menu: Setter<ContextMenuState>) => void;
  setRenamingProject: (renaming: Setter<boolean>) => void;
  setProjectNameDraft: (draft: Setter<string>) => void;
  setExportDialogOpen: (open: Setter<boolean>) => void;
  setExportDialogTab: (tab: Setter<ExportDialogTab>) => void;
  setProjectExportFormat: (format: Setter<ProjectExportFormat>) => void;
  setExportIncludeSources: (include: Setter<boolean>) => void;
  setIsExporting: (exporting: Setter<boolean>) => void;
  setExportProgress: (progress: Setter<string | null>) => void;
  setVideoExportProgress: (progress: Setter<VideoExportProgress | null>) => void;
  setVideoExportCancelling: (cancelling: Setter<boolean>) => void;
  setSettingsOpen: (open: Setter<boolean>) => void;
  setSettingsSection: (section: Setter<SettingsSection>) => void;
  openEditorTab: (tab: Omit<EditorTab, "isPinned"> & { isPinned?: boolean }) => void;
  openTemporaryEditorTab: (tab: Omit<EditorTab, "isPinned"> & { isPinned?: boolean }) => void;
  pinEditorTab: (tabId: string) => void;
  updateEditorTab: (tabId: string, patch: Partial<EditorTab>) => void;
  selectEditorTab: (tabId: string) => void;
  closeEditorTab: (tabId: string) => void;
  restoreClosedEditorTab: () => boolean;
  applyEditorState: (editorState: EditorState, fallbackSceneId: string, options?: { preserveMarkerSelection?: boolean }) => void;
  clearMarkerSelection: () => void;
  clearNodeSelection: () => void;
};

export type EditorStore = EditorStoreState & EditorStoreActions;

function resolveSetter<T>(current: T, setter: Setter<T>) {
  return typeof setter === "function" ? (setter as (current: T) => T)(current) : setter;
}

function createFieldSetter<T extends keyof EditorStoreState>(set: StoreApi<EditorStore>["setState"], field: T) {
  return (setter: Setter<EditorStoreState[T]>) => set((state) => {
    const nextValue = resolveSetter(state[field], setter);
    return Object.is(nextValue, state[field]) ? state : ({ [field]: nextValue } as Pick<EditorStoreState, T>);
  });
}

function getInitialState(project: ProjectManifest): EditorStoreState {
  const editorState = project.editorState;
  const mode = normalizeMode(editorState?.mode);
  return {
    mode,
    timelineMode: editorState?.timelineMode ?? defaultTimelineMode,
    selectedSceneId: editorState?.selectedSceneId ?? "",
    selectedPartId: editorState?.selectedPartId ?? "",
    selectedParts: editorState?.selectedPartId ? [{ partId: editorState.selectedPartId }] : [],
    selectedObjectId: null,
    editingTextObjectId: null,
    selectedMotionMarker: editorState?.selectedMotionMarker ?? null,
    selectedMotionMarkers: editorState?.selectedMotionMarker ? [editorState.selectedMotionMarker] : [],
    focusPickZoomMarker: null,
    positionPickTranslationMarker: null,
    selectedAdjustmentLayerId: null,
    selectedAdjustmentLayers: [],
    selectedTransitionLayerId: null,
    selectedTransitionLayers: [],
    selectionPayload: null,
    framePickPreviewPoint: null,
    dragStart: null,
    dragBox: null,
    marqueeDragging: false,
    currentSceneTime: editorState?.currentSceneTime ?? 2.6,
    isPlaying: false,
    playbackClock: null,
    frameZoomBarOpen: editorState?.preview?.zoomBarOpen ?? defaultPreviewViewportState.zoomBarOpen,
    framePreviewScale: editorState?.preview?.scale ?? defaultFramePreviewScale,
    scrubSnapEnabled: false,
    scrubCommitThrottleMs: defaultScrubCommitThrottleMs,
    defaultNewMarkerDurationSeconds: editorState?.defaultNewMarkerDurationSeconds ?? defaultNewMarkerDurationSeconds,
    timelineEndPaddingFraction: editorState?.timelineEndPaddingFraction ?? defaultTimelineEndPaddingFraction,
    timelinePrecision: editorState?.timelinePrecision ?? defaultTimelinePrecision,
    pausePlaybackOnScrub: editorState?.pausePlaybackOnScrub ?? defaultPausePlaybackOnScrub,
    fastSelectEnabled: false,
    leftPanelTab: editorState?.leftPanelTab ?? "assets",
    rightPanelTab: editorState?.rightPanelTab ?? "video",
    sourceStatus: "Loading TypeScript composition sources...",
    appContextMenu: null,
    renamingProject: false,
    projectNameDraft: project.name,
    exportDialogOpen: false,
    exportDialogTab: "media",
    projectExportFormat: "project-package",
    exportIncludeSources: true,
    isExporting: false,
    exportProgress: null,
    videoExportProgress: null,
    videoExportCancelling: false,
    settingsOpen: false,
    settingsSection: "playback",
    editorTabs: tabsFromEditorSession(editorState),
    closedEditorTabs: [],
    activeEditorTabId: activeTabIdFromEditorSession(editorState),
  };
}

function toClosedEditorTab(tab: EditorTab): ClosedEditorTab {
  const { source: _source, ...closedTab } = tab;
  return closedTab;
}

export function createEditorStore(project: ProjectManifest) {
  return createStore<EditorStore>((set, get) => ({
    ...getInitialState(project),
    setMode: createFieldSetter(set, "mode"),
    setTimelineMode: createFieldSetter(set, "timelineMode"),
    setSelectedSceneId: createFieldSetter(set, "selectedSceneId"),
    setSelectedPartId: createFieldSetter(set, "selectedPartId"),
    setSelectedParts: createFieldSetter(set, "selectedParts"),
    setSelectedObjectId: createFieldSetter(set, "selectedObjectId"),
    setEditingTextObjectId: createFieldSetter(set, "editingTextObjectId"),
    setSelectedMotionMarker: createFieldSetter(set, "selectedMotionMarker"),
    setSelectedMotionMarkers: createFieldSetter(set, "selectedMotionMarkers"),
    setFocusPickZoomMarker: createFieldSetter(set, "focusPickZoomMarker"),
    setPositionPickTranslationMarker: createFieldSetter(set, "positionPickTranslationMarker"),
    setSelectedAdjustmentLayerId: createFieldSetter(set, "selectedAdjustmentLayerId"),
    setSelectedAdjustmentLayers: createFieldSetter(set, "selectedAdjustmentLayers"),
    setSelectedTransitionLayerId: createFieldSetter(set, "selectedTransitionLayerId"),
    setSelectedTransitionLayers: createFieldSetter(set, "selectedTransitionLayers"),
    setSelectionPayload: createFieldSetter(set, "selectionPayload"),
    setFramePickPreviewPoint: createFieldSetter(set, "framePickPreviewPoint"),
    setDragStart: createFieldSetter(set, "dragStart"),
    setDragBox: createFieldSetter(set, "dragBox"),
    setMarqueeDragging: createFieldSetter(set, "marqueeDragging"),
    setCurrentSceneTime: createFieldSetter(set, "currentSceneTime"),
    setIsPlaying: createFieldSetter(set, "isPlaying"),
    setPlaybackClock: createFieldSetter(set, "playbackClock"),
    setFrameZoomBarOpen: createFieldSetter(set, "frameZoomBarOpen"),
    setFramePreviewScale: createFieldSetter(set, "framePreviewScale"),
    setScrubSnapEnabled: createFieldSetter(set, "scrubSnapEnabled"),
    setScrubCommitThrottleMs: createFieldSetter(set, "scrubCommitThrottleMs"),
    setDefaultNewMarkerDurationSeconds: createFieldSetter(set, "defaultNewMarkerDurationSeconds"),
    setTimelineEndPaddingFraction: createFieldSetter(set, "timelineEndPaddingFraction"),
    setTimelinePrecision: createFieldSetter(set, "timelinePrecision"),
    setPausePlaybackOnScrub: createFieldSetter(set, "pausePlaybackOnScrub"),
    setFastSelectEnabled: createFieldSetter(set, "fastSelectEnabled"),
    setLeftPanelTab: createFieldSetter(set, "leftPanelTab"),
    setRightPanelTab: createFieldSetter(set, "rightPanelTab"),
    setSourceStatus: createFieldSetter(set, "sourceStatus"),
    setAppContextMenu: createFieldSetter(set, "appContextMenu"),
    setRenamingProject: createFieldSetter(set, "renamingProject"),
    setProjectNameDraft: createFieldSetter(set, "projectNameDraft"),
    setExportDialogOpen: createFieldSetter(set, "exportDialogOpen"),
    setExportDialogTab: createFieldSetter(set, "exportDialogTab"),
    setProjectExportFormat: createFieldSetter(set, "projectExportFormat"),
    setExportIncludeSources: createFieldSetter(set, "exportIncludeSources"),
    setIsExporting: createFieldSetter(set, "isExporting"),
    setExportProgress: createFieldSetter(set, "exportProgress"),
    setVideoExportProgress: createFieldSetter(set, "videoExportProgress"),
    setVideoExportCancelling: createFieldSetter(set, "videoExportCancelling"),
    setSettingsOpen: createFieldSetter(set, "settingsOpen"),
    setSettingsSection: createFieldSetter(set, "settingsSection"),
    openEditorTab: (tab) => set((state) => {
      const existingTab = state.editorTabs.find((item) => item.id === tab.id);
      const pinnedTab = { ...tab, isPinned: true };
      const editorTabs = existingTab ? state.editorTabs.map((item) => item.id === tab.id ? { ...item, ...pinnedTab } : item) : [...state.editorTabs, pinnedTab];
      return { editorTabs, closedEditorTabs: state.closedEditorTabs.filter((closedTab) => closedTab.id !== tab.id), activeEditorTabId: tab.id };
    }),
    openTemporaryEditorTab: (tab) => set((state) => {
      const existingTab = state.editorTabs.find((item) => item.id === tab.id);
      if (existingTab) {
        const editorTabs = state.editorTabs.map((item) => item.id === tab.id ? { ...item, ...tab } : item);
        return { editorTabs, closedEditorTabs: state.closedEditorTabs.filter((closedTab) => closedTab.id !== tab.id), activeEditorTabId: tab.id };
      }
      const temporaryTab: EditorTab = { ...tab, isPinned: false };
      const temporaryIndex = state.editorTabs.findIndex((item) => !item.isPinned);
      const editorTabs = temporaryIndex >= 0 ? state.editorTabs.map((item, index) => index === temporaryIndex ? temporaryTab : item) : [...state.editorTabs, temporaryTab];
      return { editorTabs, closedEditorTabs: state.closedEditorTabs.filter((closedTab) => closedTab.id !== tab.id), activeEditorTabId: tab.id };
    }),
    pinEditorTab: (tabId) => set((state) => state.editorTabs.some((tab) => tab.id === tabId && !tab.isPinned) ? { editorTabs: state.editorTabs.map((tab) => tab.id === tabId ? { ...tab, isPinned: true } : tab) } : state),
    updateEditorTab: (tabId, patch) => set((state) => {
      if (!state.editorTabs.some((tab) => tab.id === tabId)) return state;
      return { editorTabs: state.editorTabs.map((tab) => tab.id === tabId ? { ...tab, ...patch, id: tab.id } : tab) };
    }),
    selectEditorTab: (tabId) => set((state) => state.activeEditorTabId === tabId || !state.editorTabs.some((tab) => tab.id === tabId) ? state : { activeEditorTabId: tabId }),
    closeEditorTab: (tabId) => set((state) => {
      const tabIndex = state.editorTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex < 0) return state;
      const closedTab = toClosedEditorTab(state.editorTabs[tabIndex]);
      const editorTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
      const closedEditorTabs = [closedTab, ...state.closedEditorTabs.filter((tab) => tab.id !== tabId)].slice(0, closedEditorTabStackLimit);
      if (state.activeEditorTabId !== tabId) return { editorTabs, closedEditorTabs };
      const nextActiveTab = editorTabs[Math.min(tabIndex, editorTabs.length - 1)] ?? null;
      return { editorTabs, closedEditorTabs, activeEditorTabId: nextActiveTab?.id ?? null };
    }),
    restoreClosedEditorTab: () => {
      const state = get();
      const restoreIndex = state.closedEditorTabs.findIndex((tab) => !state.editorTabs.some((openTab) => openTab.id === tab.id));
      if (restoreIndex < 0) {
        if (state.closedEditorTabs.length) set({ closedEditorTabs: [] });
        return false;
      }
      const restoredTab = state.closedEditorTabs[restoreIndex];
      const remainingClosedTabs = state.closedEditorTabs.filter((_, index) => index > restoreIndex || (index < restoreIndex && !state.editorTabs.some((openTab) => openTab.id === state.closedEditorTabs[index].id)));
      const editorTabs = restoredTab.isPinned ? [...state.editorTabs, restoredTab] : (() => {
        const temporaryIndex = state.editorTabs.findIndex((tab) => !tab.isPinned);
        return temporaryIndex >= 0 ? state.editorTabs.map((tab, index) => index === temporaryIndex ? restoredTab : tab) : [...state.editorTabs, restoredTab];
      })();
      set({ editorTabs, closedEditorTabs: remainingClosedTabs, activeEditorTabId: restoredTab.id });
      return true;
    },
    applyEditorState: (editorState, fallbackSceneId, options) => set((state) => ({
      mode: normalizeMode(editorState.mode),
      timelineMode: editorState.timelineMode ?? defaultTimelineMode,
      selectedSceneId: editorState.selectedSceneId ?? fallbackSceneId,
      selectedPartId: editorState.selectedPartId ?? "",
      selectedParts: editorState.selectedPartId ? [{ partId: editorState.selectedPartId }] : [],
      selectedMotionMarker: options?.preserveMarkerSelection ? state.selectedMotionMarker : (editorState.selectedMotionMarker ?? null),
      selectedMotionMarkers: options?.preserveMarkerSelection ? state.selectedMotionMarkers : (editorState.selectedMotionMarker ? [editorState.selectedMotionMarker] : []),
      selectedObjectId: null,
      editingTextObjectId: null,
      selectedAdjustmentLayerId: null,
      selectedAdjustmentLayers: [],
      selectedTransitionLayerId: null,
      selectedTransitionLayers: [],
      selectionPayload: null,
      currentSceneTime: editorState.currentSceneTime ?? 2.6,
      defaultNewMarkerDurationSeconds: editorState.defaultNewMarkerDurationSeconds ?? defaultNewMarkerDurationSeconds,
      timelineEndPaddingFraction: editorState.timelineEndPaddingFraction ?? defaultTimelineEndPaddingFraction,
      timelinePrecision: editorState.timelinePrecision ?? defaultTimelinePrecision,
      pausePlaybackOnScrub: editorState.pausePlaybackOnScrub ?? defaultPausePlaybackOnScrub,
      frameZoomBarOpen: editorState.preview?.zoomBarOpen ?? defaultPreviewViewportState.zoomBarOpen,
      framePreviewScale: editorState.preview?.scale ?? defaultFramePreviewScale,
      leftPanelTab: editorState.leftPanelTab ?? "assets",
      rightPanelTab: editorState.rightPanelTab ?? "video",
      editorTabs: tabsFromEditorSession(editorState),
      closedEditorTabs: [],
      activeEditorTabId: activeTabIdFromEditorSession(editorState),
    })),
    clearMarkerSelection: () => set({
      selectedMotionMarker: null,
      selectedMotionMarkers: [],
      focusPickZoomMarker: null,
      positionPickTranslationMarker: null,
      framePickPreviewPoint: null,
    }),
    clearNodeSelection: () => set({
      editingTextObjectId: null,
      selectedPartId: "",
      selectedParts: [],
      selectedObjectId: null,
      selectionPayload: null,
      selectedMotionMarker: null,
      selectedMotionMarkers: [],
      focusPickZoomMarker: null,
      positionPickTranslationMarker: null,
      selectedAdjustmentLayerId: null,
      selectedAdjustmentLayers: [],
      selectedTransitionLayerId: null,
      selectedTransitionLayers: [],
      framePickPreviewPoint: null,
    }),
  }));
}

const EditorStoreContext = createContext<StoreApi<EditorStore> | null>(null);

export function EditorStoreProvider({ children, project }: PropsWithChildren<{ project: ProjectManifest }>) {
  const storeRef = useRef<StoreApi<EditorStore> | null>(null);
  if (!storeRef.current) storeRef.current = createEditorStore(project);
  return <EditorStoreContext.Provider value={storeRef.current}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore<T>(selector: (store: EditorStore) => T) {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used within EditorStoreProvider");
  return useStore(store, selector);
}

export function useEditorStoreApi() {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStoreApi must be used within EditorStoreProvider");
  return store;
}

export function useAppEditorState() {
  return useEditorStore(useShallow((state) => ({
    mode: state.mode,
    setMode: state.setMode,
    timelineMode: state.timelineMode,
    setTimelineMode: state.setTimelineMode,
    selectedSceneId: state.selectedSceneId,
    setSelectedSceneId: state.setSelectedSceneId,
    selectedPartId: state.selectedPartId,
    setSelectedPartId: state.setSelectedPartId,
    selectedParts: state.selectedParts,
    setSelectedParts: state.setSelectedParts,
    selectedObjectId: state.selectedObjectId,
    setSelectedObjectId: state.setSelectedObjectId,
    editingTextObjectId: state.editingTextObjectId,
    setEditingTextObjectId: state.setEditingTextObjectId,
    selectedMotionMarker: state.selectedMotionMarker,
    setSelectedMotionMarker: state.setSelectedMotionMarker,
    selectedMotionMarkers: state.selectedMotionMarkers,
    setSelectedMotionMarkers: state.setSelectedMotionMarkers,
    focusPickZoomMarker: state.focusPickZoomMarker,
    setFocusPickZoomMarker: state.setFocusPickZoomMarker,
    positionPickTranslationMarker: state.positionPickTranslationMarker,
    setPositionPickTranslationMarker: state.setPositionPickTranslationMarker,
    selectedAdjustmentLayerId: state.selectedAdjustmentLayerId,
    setSelectedAdjustmentLayerId: state.setSelectedAdjustmentLayerId,
    selectedAdjustmentLayers: state.selectedAdjustmentLayers,
    setSelectedAdjustmentLayers: state.setSelectedAdjustmentLayers,
    selectedTransitionLayerId: state.selectedTransitionLayerId,
    setSelectedTransitionLayerId: state.setSelectedTransitionLayerId,
    selectedTransitionLayers: state.selectedTransitionLayers,
    setSelectedTransitionLayers: state.setSelectedTransitionLayers,
    selectionPayload: state.selectionPayload,
    setSelectionPayload: state.setSelectionPayload,
    framePickPreviewPoint: state.framePickPreviewPoint,
    setFramePickPreviewPoint: state.setFramePickPreviewPoint,
    dragStart: state.dragStart,
    setDragStart: state.setDragStart,
    dragBox: state.dragBox,
    setDragBox: state.setDragBox,
    marqueeDragging: state.marqueeDragging,
    setMarqueeDragging: state.setMarqueeDragging,
    isPlaying: state.isPlaying,
    setIsPlaying: state.setIsPlaying,
    playbackClock: state.playbackClock,
    setPlaybackClock: state.setPlaybackClock,
    frameZoomBarOpen: state.frameZoomBarOpen,
    setFrameZoomBarOpen: state.setFrameZoomBarOpen,
    framePreviewScale: state.framePreviewScale,
    setFramePreviewScale: state.setFramePreviewScale,
    scrubSnapEnabled: state.scrubSnapEnabled,
    setScrubSnapEnabled: state.setScrubSnapEnabled,
    scrubCommitThrottleMs: state.scrubCommitThrottleMs,
    setScrubCommitThrottleMs: state.setScrubCommitThrottleMs,
    defaultNewMarkerDurationSeconds: state.defaultNewMarkerDurationSeconds,
    setDefaultNewMarkerDurationSeconds: state.setDefaultNewMarkerDurationSeconds,
    timelineEndPaddingFraction: state.timelineEndPaddingFraction,
    setTimelineEndPaddingFraction: state.setTimelineEndPaddingFraction,
    timelinePrecision: state.timelinePrecision,
    setTimelinePrecision: state.setTimelinePrecision,
    pausePlaybackOnScrub: state.pausePlaybackOnScrub,
    setPausePlaybackOnScrub: state.setPausePlaybackOnScrub,
    fastSelectEnabled: state.fastSelectEnabled,
    setFastSelectEnabled: state.setFastSelectEnabled,
    leftPanelTab: state.leftPanelTab,
    setLeftPanelTab: state.setLeftPanelTab,
    rightPanelTab: state.rightPanelTab,
    setRightPanelTab: state.setRightPanelTab,
    sourceStatus: state.sourceStatus,
    setSourceStatus: state.setSourceStatus,
    appContextMenu: state.appContextMenu,
    setAppContextMenu: state.setAppContextMenu,
    renamingProject: state.renamingProject,
    setRenamingProject: state.setRenamingProject,
    projectNameDraft: state.projectNameDraft,
    setProjectNameDraft: state.setProjectNameDraft,
    exportDialogOpen: state.exportDialogOpen,
    setExportDialogOpen: state.setExportDialogOpen,
    exportDialogTab: state.exportDialogTab,
    setExportDialogTab: state.setExportDialogTab,
    projectExportFormat: state.projectExportFormat,
    setProjectExportFormat: state.setProjectExportFormat,
    exportIncludeSources: state.exportIncludeSources,
    setExportIncludeSources: state.setExportIncludeSources,
    isExporting: state.isExporting,
    setIsExporting: state.setIsExporting,
    exportProgress: state.exportProgress,
    setExportProgress: state.setExportProgress,
    videoExportProgress: state.videoExportProgress,
    setVideoExportProgress: state.setVideoExportProgress,
    videoExportCancelling: state.videoExportCancelling,
    setVideoExportCancelling: state.setVideoExportCancelling,
    settingsOpen: state.settingsOpen,
    setSettingsOpen: state.setSettingsOpen,
    settingsSection: state.settingsSection,
    setSettingsSection: state.setSettingsSection,
    editorTabs: state.editorTabs,
    closedEditorTabs: state.closedEditorTabs,
    activeEditorTabId: state.activeEditorTabId,
    openEditorTab: state.openEditorTab,
    updateEditorTab: state.updateEditorTab,
    selectEditorTab: state.selectEditorTab,
    closeEditorTab: state.closeEditorTab,
    restoreClosedEditorTab: state.restoreClosedEditorTab,
    openTemporaryEditorTab: state.openTemporaryEditorTab,
    pinEditorTab: state.pinEditorTab,
    setCurrentSceneTime: state.setCurrentSceneTime,
    applyEditorState: state.applyEditorState,
    clearMarkerSelection: state.clearMarkerSelection,
    clearNodeSelection: state.clearNodeSelection,
  })));
}
