import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { defaultFramePreviewScale, defaultNewMarkerDurationSeconds, defaultScrubCommitThrottleMs, defaultTimelineEndPaddingFraction, defaultTimelinePrecision } from "../config";
import type { AdjustmentLayerSelection, CompositionSelection, ContextMenuState, ExportDialogTab, LeftPanelTab, Mode, MotionMarkerSelection, PlaybackClock, ProjectExportFormat, RightPanelTab, SettingsSection, VideoExportProgress } from "../types";
import { defaultPreviewViewportState, defaultTimelineMode } from "../../core/project";
import type { Bounds, EditorState, Point, ProjectManifest, SelectionPayload, TimelineMode } from "../../core/types";

type Setter<T> = T | ((current: T) => T);

type MarkerSelection = { partId: string; markerId: string } | null;

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
};

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
  applyEditorState: (editorState: EditorState, fallbackSceneId: string) => void;
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
  return {
    mode: editorState?.mode ?? "interactive",
    timelineMode: editorState?.timelineMode ?? defaultTimelineMode,
    selectedSceneId: editorState?.selectedSceneId ?? project.timelines?.[0]?.id ?? "",
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
  };
}

export function createEditorStore(project: ProjectManifest) {
  return createStore<EditorStore>((set) => ({
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
    applyEditorState: (editorState, fallbackSceneId) => set({
      mode: editorState.mode ?? "interactive",
      timelineMode: editorState.timelineMode ?? defaultTimelineMode,
      selectedSceneId: editorState.selectedSceneId ?? fallbackSceneId,
      selectedPartId: editorState.selectedPartId ?? "",
      selectedParts: editorState.selectedPartId ? [{ partId: editorState.selectedPartId }] : [],
      selectedMotionMarker: editorState.selectedMotionMarker ?? null,
      selectedMotionMarkers: editorState.selectedMotionMarker ? [editorState.selectedMotionMarker] : [],
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
      frameZoomBarOpen: editorState.preview?.zoomBarOpen ?? defaultPreviewViewportState.zoomBarOpen,
      framePreviewScale: editorState.preview?.scale ?? defaultFramePreviewScale,
      leftPanelTab: editorState.leftPanelTab ?? "assets",
      rightPanelTab: editorState.rightPanelTab ?? "video",
    }),
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
    setCurrentSceneTime: state.setCurrentSceneTime,
    applyEditorState: state.applyEditorState,
    clearMarkerSelection: state.clearMarkerSelection,
    clearNodeSelection: state.clearNodeSelection,
  })));
}
