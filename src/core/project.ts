import { roundTwo, sanitizeProjectNumbers } from "./math";
import { normalizeMendedZoomMarkerFocus } from "./markers";
import { compositionToSource } from "./compositionSource";
import type { AdjustmentLayer, AssetItem, CodeViewportState, CompositionClip, CompositionDocument, FileManagerState, PreviewViewportState, ProjectManifest, Scene, TimelineClip, TimelineDocument, TimelineLayerState, TimelineMode, TimelineMotionLayerKind, TimelineViewportState } from "./types";

export const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
export const defaultTimelineMode: TimelineMode = "edit";
export const defaultPreviewViewportState: PreviewViewportState = { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false };
export const defaultTimelineLayerState: TimelineLayerState = {
  compName: "Comp",
  adjustName: "Adjust",
  motionLayers: [
    { id: "motion_pan", kind: "pan", name: "MOTION" },
    { id: "motion_zoom", kind: "zoom", name: "MOTION" },
  ],
};

function normalizeRightPanelTab(tab: unknown) {
  return tab === "motion" || tab === "agent" ? tab : "video";
}

function normalizeCodeViewportState(state: CodeViewportState | undefined): CodeViewportState {
  return {
    scrollLeft: roundTwo(Math.max(state?.scrollLeft ?? 0, 0)),
    scrollTop: roundTwo(Math.max(state?.scrollTop ?? 0, 0)),
  };
}

function normalizeCodeViewportStates(states: Record<string, CodeViewportState> | undefined) {
  if (!states) return {};
  return Object.fromEntries(Object.entries(states).map(([filePath, state]) => [filePath, normalizeCodeViewportState(state)]));
}

function normalizeTimelineLayerState(state: TimelineLayerState | undefined): TimelineLayerState {
  const motionLayers = state?.motionLayers?.filter((layer) => layer.kind === "empty" || layer.kind === "pan" || layer.kind === "zoom" || layer.kind === "rotate") ?? defaultTimelineLayerState.motionLayers!;
  const rowHeights = normalizeTimelineLayerRowHeights(state?.rowHeights);
  return {
    compName: state?.compName?.trim() || defaultTimelineLayerState.compName,
    compHidden: state?.compHidden || undefined,
    adjustName: state?.adjustName?.trim() || defaultTimelineLayerState.adjustName,
    adjustHidden: state?.adjustHidden || undefined,
    motionLayers: motionLayers.map((layer) => ({ ...layer, name: layer.name.trim() || formatDefaultMotionLayerName(layer.kind), hidden: layer.hidden || undefined })),
    rowHeights: Object.keys(rowHeights).length ? rowHeights : undefined,
  };
}

function normalizeTimelineLayerRowHeights(rowHeights: Record<string, number> | undefined) {
  if (!rowHeights) return {};
  return Object.fromEntries(Object.entries(rowHeights).flatMap(([key, value]) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    return [[key, Math.round(Math.min(Math.max(value, 42), 140))]];
  }));
}

function formatDefaultMotionLayerName(kind: TimelineMotionLayerKind) {
  return kind === "empty" ? "New Motion" : "MOTION";
}

export const defaultAssets: AssetItem[] = [];
const legacyDefaultAssetFolderIds = new Set(["ast_folder_media", "ast_folder_audio"]);

function normalizeAssets(assets: AssetItem[] | undefined): AssetItem[] {
  return (assets ?? defaultAssets).flatMap((asset) => {
    if (asset.kind === "folder") {
      const children = normalizeAssets(asset.children ?? []);
      if (legacyDefaultAssetFolderIds.has(asset.id) && children.length === 0) return [];
      return [{ ...asset, children }];
    }
    return [asset];
  });
}

export function replacePartInProject(project: ProjectManifest, compositionId: string, updater: (composition: CompositionClip) => CompositionClip): ProjectManifest {
  const nextCompositions = project.compositions?.map((currentComposition) => {
    if (currentComposition.id !== compositionId) return currentComposition;
    const nextComposition = updater(currentComposition);
    return { ...nextComposition, source: nextComposition.source ?? currentComposition.source } as CompositionDocument;
  });
  return {
    ...project,
    compositions: nextCompositions,
    compositionLibrary: project.compositionLibrary?.map((currentComposition) => (currentComposition.id === compositionId ? updater(currentComposition) : currentComposition)),
    scenes: project.scenes.map((currentScene) => ({
      ...currentScene,
      compositions: currentScene.compositions.map((currentComposition) => (currentComposition.id === compositionId ? updater(currentComposition) : currentComposition)),
    })),
  };
}

type LegacyScene = Omit<Scene, "compositions"> & { parts?: CompositionClip[]; compositions?: CompositionClip[] };

function getSceneCompositions(scene: Scene | LegacyScene): CompositionClip[] {
  return scene.compositions ?? ("parts" in scene ? scene.parts ?? [] : []);
}

function normalizeComposition(composition: CompositionClip): CompositionClip {
  return {
    ...composition,
    sourceMissing: composition.sourceMissing || undefined,
    background: {
      ...composition.background,
      stretchToElements: composition.background.stretchToElements || undefined,
      elements: composition.background.elements ?? [],
    },
    zoomMarkers: normalizeMendedZoomMarkerFocus(composition.zoomMarkers ?? []),
    translationMarkers: composition.translationMarkers ?? [],
  };
}

function normalizeCompositionDocument(composition: CompositionClip, sources: Record<string, string>): CompositionDocument {
  const normalized = normalizeComposition(composition);
  return {
    ...normalized,
    source: composition.source ?? sources[composition.filePath] ?? compositionToSource(normalized),
  };
}

function getCompositionLibrary(project: ProjectManifest, scenes: Scene[]) {
  const library = project.compositionLibrary ?? project.compositions ?? scenes.flatMap((scene) => scene.compositions);
  return Array.from(new Map(library.map((composition) => [composition.filePath, normalizeComposition(composition)])).values());
}

function getCompositionDocuments(project: ProjectManifest, scenes: Scene[]) {
  const sources = normalizeCompositionSources(project.compositionSources);
  const compositions = project.compositions ?? project.compositionLibrary ?? scenes.flatMap((scene) => scene.compositions);
  return Array.from(new Map(compositions.map((composition) => [composition.id, normalizeCompositionDocument(composition, sources)])).values());
}

function getTimelineClipFromComposition(composition: CompositionClip): TimelineClip {
  return {
    id: composition.id,
    compositionId: composition.id,
    zoomMarkers: normalizeMendedZoomMarkerFocus(composition.zoomMarkers ?? []),
    translationMarkers: composition.translationMarkers ?? [],
  };
}

function getProjectTimelines(project: ProjectManifest, scenes: Scene[]): TimelineDocument[] {
  const hasRuntimeScenes = scenes.some((scene) => scene.compositions.length > 0);
  const timelinesById = new Map((project.timelines ?? []).map((timeline) => [timeline.id, timeline]));
  const timelines = hasRuntimeScenes ? scenes.map((scene) => ({
    ...timelinesById.get(scene.id),
    id: scene.id,
    name: scene.name,
    filePath: timelinesById.get(scene.id)?.filePath ?? `timelines/${scene.id}.timeline.json`,
    clips: scene.compositions.map(getTimelineClipFromComposition),
    adjustmentLayers: scene.adjustmentLayers ?? [],
    settings: timelinesById.get(scene.id)?.settings ?? {},
  })) : project.timelines ?? [];
  return timelines.map((timeline) => ({
    ...timeline,
    filePath: timeline.filePath ?? `timelines/${timeline.id}.timeline.json`,
    clips: timeline.clips.map((clip) => ({
      ...clip,
      zoomMarkers: normalizeMendedZoomMarkerFocus(clip.zoomMarkers ?? []),
      translationMarkers: clip.translationMarkers ?? [],
    })),
    adjustmentLayers: normalizeAdjustmentLayers(timeline.adjustmentLayers),
    settings: timeline.settings ?? {},
  }));
}

function getScenesFromTimelines(timelines: TimelineDocument[], compositions: CompositionDocument[]): Scene[] {
  const compositionsById = new Map(compositions.map((composition) => [composition.id, composition]));
  return timelines.map((timeline) => ({
    id: timeline.id,
    name: timeline.name,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
      const composition = compositionsById.get(clip.compositionId);
      return composition ? [{ ...composition, id: clip.id, zoomMarkers: clip.zoomMarkers, translationMarkers: clip.translationMarkers }] : [];
    }),
  }));
}

function getCompositionFolders(project: ProjectManifest, library: CompositionClip[]) {
  const folderPaths = new Set(project.compositionFolders ?? []);
  for (const composition of library) {
    const slashIndex = composition.filePath.lastIndexOf("/");
    if (slashIndex > 0) folderPaths.add(composition.filePath.slice(0, slashIndex));
  }
  return [...folderPaths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeCompositionSources(sources: Record<string, string> | undefined) {
  if (!sources) return {};
  return Object.fromEntries(Object.entries(sources).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function normalizeFileManagerState(state: FileManagerState | undefined): FileManagerState | undefined {
  if (!state) return undefined;
  return {
    tree: Array.isArray(state.tree) ? state.tree : undefined,
    openState: state.openState && typeof state.openState === "object" ? Object.fromEntries(Object.entries(state.openState).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")) : undefined,
  };
}

function normalizeAdjustmentLayers(layers: AdjustmentLayer[] | undefined): AdjustmentLayer[] {
  return (layers ?? []).map((layer) => ({
    ...layer,
    start: roundTwo(Math.max(layer.start, 0)),
    duration: roundTwo(Math.max(layer.duration, 0.1)),
    effect: layer.effect.kind === "frameSkip" ? { kind: "frameSkip", every: Math.max(1, Math.round(layer.effect.every || 1)) } : layer.effect,
  }));
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineState = project.editorState?.timeline ?? defaultTimelineViewportState;
  const timelineMode = project.editorState?.timelineMode === "composition" ? "composition" : defaultTimelineMode;
  const previewState = project.editorState?.preview ?? defaultPreviewViewportState;
  const legacyFileManagerState = (project as ProjectManifest & { fileManagerState?: FileManagerState }).fileManagerState;

  const legacyScenes = project.scenes.map((scene) => ({
    ...scene,
    adjustmentLayers: normalizeAdjustmentLayers(scene.adjustmentLayers),
    compositions: getSceneCompositions(scene).map(normalizeComposition),
  }));
  const compositionDocuments = getCompositionDocuments(project, legacyScenes);
  const timelines = getProjectTimelines(project, legacyScenes);
  const scenes = getScenesFromTimelines(timelines, compositionDocuments);

  const normalized = sanitizeProjectNumbers({
    ...project,
    editorState: {
      ...project.editorState,
      timeline: {
        displacement: roundTwo(Math.max(timelineState.displacement, 0)),
        zoom: roundTwo(Math.min(Math.max(timelineState.zoom, 0.01), 4)),
      },
      timelineLayers: normalizeTimelineLayerState(project.editorState?.timelineLayers),
      timelineMode,
      mode: project.editorState?.mode === "code" ? "code" : "interactive",
      leftPanelTab: project.editorState?.leftPanelTab === "tools" ? "tools" : "assets",
      rightPanelTab: normalizeRightPanelTab(project.editorState?.rightPanelTab),
      selectedTimelineId: timelines.some((timeline) => timeline.id === project.editorState?.selectedTimelineId) ? project.editorState?.selectedTimelineId : timelines[0]?.id,
      selectedSceneId: timelines.some((timeline) => timeline.id === (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId)) ? (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId) : timelines[0]?.id,
      currentSceneTime: roundTwo(Math.max(project.editorState?.currentSceneTime ?? 2.6, 0)),
      preview: {
        scale: roundTwo(Math.min(Math.max(previewState.scale, 0.25), 1)),
        scrollLeft: roundTwo(Math.max(previewState.scrollLeft, 0)),
        scrollTop: roundTwo(Math.max(previewState.scrollTop, 0)),
        zoomBarOpen: Boolean(previewState.zoomBarOpen),
      },
      code: normalizeCodeViewportStates(project.editorState?.code),
      fileManagerState: normalizeFileManagerState(project.editorState?.fileManagerState ?? legacyFileManagerState),
    },
    scenes,
    timelines,
    timelineOrder: timelines.map((timeline) => timeline.id),
    compositions: compositionDocuments,
    compositionOrder: compositionDocuments.map((composition) => composition.id),
    compositionSources: Object.fromEntries(compositionDocuments.map((composition) => [composition.filePath, composition.source])),
    assets: normalizeAssets(project.assets),
  }) as ProjectManifest;

  delete (normalized as ProjectManifest & { fileManagerState?: FileManagerState }).fileManagerState;

  normalized.compositionLibrary = getCompositionLibrary({ ...project, compositions: normalized.compositions }, normalized.scenes);
  normalized.compositionFolders = getCompositionFolders(project, normalized.compositionLibrary);
  return normalized;
}

export function getActiveTimeline(project: ProjectManifest, timelineId: string | undefined) {
  return project.timelines?.find((timeline) => timeline.id === timelineId) ?? project.timelines?.[0] ?? null;
}

export function deleteCompositionFromProject(project: ProjectManifest, compositionId: string): ProjectManifest {
  const nextProject = {
    ...project,
    compositions: (project.compositions ?? []).filter((composition) => composition.id !== compositionId),
    compositionLibrary: (project.compositionLibrary ?? []).filter((composition) => composition.id !== compositionId),
    timelines: (project.timelines ?? []).map((timeline) => ({ ...timeline, clips: timeline.clips.filter((clip) => clip.compositionId !== compositionId && clip.id !== compositionId) })),
    scenes: project.scenes.map((scene) => ({ ...scene, compositions: scene.compositions.filter((composition) => composition.id !== compositionId) })),
  };
  return normalizeProject(nextProject);
}
