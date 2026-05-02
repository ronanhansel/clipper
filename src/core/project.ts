import { roundTwo, sanitizeProjectNumbers } from "./math";
import { getCanonicalMotionMarkers, getMotionMarkerViews, motionBlocksToMotionMarkers, withCanonicalMotionMarkers } from "./motionEffects";
import { adjustmentEffectPackages, normalizeAdjustmentEffectId } from "./effects/registry";
import { getExecutableAdjustmentLayers } from "./timeline";
import type { AdjustmentLayer, AssetItem, CodeViewportState, ComposeLayoutState, CompositionClip, CompositionDocument, EditorLayoutState, EffectsPanelState, FileManagerState, PreviewViewportState, ProjectManifest, Scene, TimelineDocument, TimelineLayerState, TimelineMode, TimelineViewportState } from "./types";
import { getDisplayNameFromPath } from "./fileNames";

export const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
export const defaultTimelineMode: TimelineMode = "compose";
export const defaultPreviewViewportState: PreviewViewportState = { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false };
export const defaultEditorLayoutState: EditorLayoutState = { leftPanelWidth: 286, rightPanelWidth: 350, timelineHeight: 340 };
export const defaultComposeLayoutState: ComposeLayoutState = { leftPanelWidth: 286 };
export const defaultTimelineLayerState: TimelineLayerState = {
  compositionLayers: [{ id: "comp" }],
  adjustmentLayers: [{ id: "adjust" }],
  motionLayers: [{ id: "motion", kind: "empty" }],
  transitionLayers: [{ id: "transition" }],
};

export const emptyTimelineLayerState: TimelineLayerState = {
  compositionLayers: [],
  adjustmentLayers: [],
  motionLayers: [],
  transitionLayers: [],
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

function normalizeEditorLayoutState(state: EditorLayoutState | undefined): EditorLayoutState {
  return {
    leftPanelWidth: Math.round(Math.min(Math.max(state?.leftPanelWidth ?? defaultEditorLayoutState.leftPanelWidth, 220), 560)),
    rightPanelWidth: Math.round(Math.min(Math.max(state?.rightPanelWidth ?? defaultEditorLayoutState.rightPanelWidth, 280), 620)),
    timelineHeight: Math.round(Math.min(Math.max(state?.timelineHeight ?? defaultEditorLayoutState.timelineHeight, 220), 560)),
  };
}

function normalizeComposeLayoutState(state: ComposeLayoutState | undefined): ComposeLayoutState {
  return {
    leftPanelWidth: Math.round(Math.min(Math.max(state?.leftPanelWidth ?? defaultComposeLayoutState.leftPanelWidth, 220), 560)),
  };
}

function normalizeTimelineViewportState(state: TimelineViewportState | undefined): TimelineViewportState {
  return {
    displacement: roundTwo(Math.max(state?.displacement ?? defaultTimelineViewportState.displacement, 0)),
    zoom: roundTwo(Math.min(Math.max(state?.zoom ?? defaultTimelineViewportState.zoom, 0.01), 4)),
  };
}

function normalizeTimelineMode(mode: unknown): TimelineMode {
  return mode === "composition" ? "composition" : "compose";
}

function normalizeTimelineLayerState(state: TimelineLayerState | undefined): TimelineLayerState {
  const sourceCompositionLayers = state?.compositionLayers?.length ? state.compositionLayers : [{ id: "comp", hidden: state?.compHidden || undefined }];
  const seenCompositionLayerIds = new Set<string>();
  const compositionLayers = sourceCompositionLayers.flatMap((layer) => {
    if (!layer.id || seenCompositionLayerIds.has(layer.id)) return [];
    seenCompositionLayerIds.add(layer.id);
    return [{ id: layer.id, hidden: layer.hidden || undefined, locked: layer.locked || undefined }];
  });
  const sourceAdjustmentLayers = state?.adjustmentLayers?.length ? state.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!;
  const seenAdjustmentLayerIds = new Set<string>();
  const adjustmentLayers = sourceAdjustmentLayers.flatMap((layer) => {
    if (!layer.id || seenAdjustmentLayerIds.has(layer.id)) return [];
    seenAdjustmentLayerIds.add(layer.id);
    return [{ id: layer.id, hidden: layer.hidden || undefined, locked: layer.locked || undefined }];
  });
  const motionLayers = state?.motionLayers?.filter((layer) => layer.kind === "empty" || layer.kind === "motion") ?? defaultTimelineLayerState.motionLayers!;
  const rowHeights = normalizeTimelineLayerRowHeights(state?.rowHeights);
  return {
    compHidden: state?.compHidden || undefined,
    compositionLayers: compositionLayers.length > 0 ? compositionLayers : defaultTimelineLayerState.compositionLayers!,
    adjustmentLayers: adjustmentLayers.length > 0 ? adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!,
    motionLayers: (motionLayers.length > 0 ? motionLayers : defaultTimelineLayerState.motionLayers!).map((layer) => ({ ...layer, kind: layer.kind, hidden: layer.hidden || undefined, locked: layer.locked || undefined })),
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

export const defaultAssets: AssetItem[] = [];

function normalizeAssets(assets: AssetItem[] | undefined): AssetItem[] {
  return (assets ?? defaultAssets).flatMap((asset) => {
    if (asset.kind === "folder") {
      const children = normalizeAssets(asset.children ?? []);
      return [{ ...asset, children }];
    }
    return [asset];
  });
}

export function replacePartInProject(project: ProjectManifest, compositionId: string, updater: (composition: CompositionClip) => CompositionClip): ProjectManifest {
  let nextCompositionId = compositionId;
  const nextCompositions = project.compositions?.map((currentComposition) => {
    if (currentComposition.id !== compositionId) return currentComposition;
    const nextComposition = updater(currentComposition);
    nextCompositionId = nextComposition.id;
    return { ...nextComposition, source: nextComposition.source ?? currentComposition.source } as CompositionDocument;
  });
  const nextCompositionLibrary = project.compositionLibrary?.map((currentComposition) => {
    if (currentComposition.id !== compositionId) return currentComposition;
    const nextComposition = updater(currentComposition);
    nextCompositionId = nextComposition.id;
    return nextComposition;
  });
  const nextTimelines = nextCompositionId === compositionId ? project.timelines : project.timelines?.map((timeline) => ({
    ...timeline,
    clips: timeline.clips.map((clip) => (clip.compositionId === compositionId ? { ...clip, compositionId: nextCompositionId } : clip)),
  }));
  return {
    ...project,
    compositions: nextCompositions,
    compositionLibrary: nextCompositionLibrary,
    timelines: nextTimelines,
  };
}

function normalizeComposition(composition: CompositionClip): CompositionClip {
  const { name: _name, ...rest } = composition as any;
  const motionMarkers = getCanonicalMotionMarkers(rest);
  const motionCollections = withCanonicalMotionMarkers(motionMarkers);
  return {
    ...rest,
    compositionId: rest.compositionId || undefined,
    start: typeof rest.start === "number" && Number.isFinite(rest.start) ? roundTwo(Math.max(rest.start, 0)) : undefined,
    layerId: rest.layerId || undefined,
    sourceMissing: rest.sourceMissing || undefined,
    background: {
      ...rest.background,
      stretchToElements: rest.background.stretchToElements || undefined,
      elements: rest.background.elements ?? [],
    },
    ...motionCollections,
  };
}

function normalizeCompositionDocument(composition: CompositionClip, sources: Record<string, string>): CompositionDocument | undefined {
  const normalized = normalizeComposition(composition);
  const source = composition.source ?? sources[composition.filePath];
  if (source === undefined) return undefined;
  return {
    ...normalized,
    source,
  };
}

function getCompositionLibrary(project: ProjectManifest) {
  const library = project.compositionLibrary ?? project.compositions ?? [];
  return Array.from(new Map(library.map((composition) => [composition.filePath, { ...normalizeComposition(composition), source: composition.source }])).values());
}

function getCompositionDocuments(project: ProjectManifest) {
  const sources = normalizeCompositionSources(project.compositionSources);
  const compositions = [...(project.compositionLibrary ?? []), ...(project.compositions ?? [])];
  return Array.from(new Map(compositions.map((composition) => [composition.id, normalizeCompositionDocument(composition, sources)]).filter((entry): entry is [string, CompositionDocument] => entry[1] !== undefined)).values());
}

export { getCompositionDocuments };

export function getSceneFromProject(project: ProjectManifest, sceneId: string): Scene | undefined {
  const compositionDocs = getCompositionDocuments(project);
  return getSceneFromProjectWithDocs(project, sceneId, compositionDocs);
}

function getSceneFromProjectWithDocs(project: ProjectManifest, sceneId: string, compositionDocs: CompositionDocument[]): Scene | undefined {
  const timeline = (project.timelines ?? []).find((t) => t.id === sceneId);
  if (!timeline) return undefined;
  const compositionsById = new Map(compositionDocs.map((composition) => [composition.id, composition]));
  return {
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
      const composition = compositionsById.get(clip.compositionId);
      return composition ? [{ ...composition, id: clip.id, compositionId: clip.compositionId, start: clip.start, layerId: clip.layerId, duration: clip.duration ?? composition.duration, motionMarkers: [] }] : [];
    }),
  };
}

function getProjectTimelines(project: ProjectManifest): TimelineDocument[] {
  const timelines = project.timelines ?? [];
  return timelines.map((timeline) => {
    const clipMotion = timeline.clips.flatMap((clip) => {
      const motionMarkers = getCanonicalMotionMarkers(clip);
      const clipStart = roundTwo(Math.max(clip.start ?? 0, 0));
      return motionMarkers.map((marker) => ({ ...marker, start: roundTwo(clipStart + marker.start) }));
    });
    const timelineMotionMarkers = motionBlocksToMotionMarkers([
      ...getCanonicalMotionMarkers(timeline),
      ...clipMotion,
    ]);
    const { name: _name, ...rest } = timeline as any;
    return {
      ...rest,
      filePath: rest.filePath ?? `timelines/${rest.id}.timeline.json`,
      clips: rest.clips.map((clip: any) => {
        const { name: _clipName, ...clipRest } = clip;
        return {
          ...clipRest,
          motionMarkers: [],
        };
      }),
      adjustmentLayers: normalizeAdjustmentLayers(rest.adjustmentLayers),
      motionMarkers: timelineMotionMarkers,
      settings: rest.settings ?? {},
    };
  });
}

// Derives Scene[] from timelines for persistence / backward compat.
// Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
function getScenesFromTimelines(timelines: TimelineDocument[], compositions: CompositionDocument[]): Scene[] {
  const compositionsById = new Map(compositions.map((composition) => [composition.id, composition]));
  return timelines.map((timeline) => ({
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
        const composition = compositionsById.get(clip.compositionId);
        return composition ? [{ ...composition, id: clip.id, compositionId: clip.compositionId, start: clip.start, layerId: clip.layerId, duration: clip.duration ?? composition.duration, motionMarkers: [] }] : [];
      }),
  }));
}

export function serializeProjectForSave(project: ProjectManifest): ProjectManifest {
  return pruneStaleAdjustmentLayers(normalizeProject(project));
}

function pruneStaleAdjustmentLayers(project: ProjectManifest): ProjectManifest {
  const timelineLayers = project.editorState?.timelineLayers;
  return {
    ...project,
    timelines: project.timelines?.map((timeline) => ({
      ...timeline,
      adjustmentLayers: getExecutableAdjustmentLayers(timeline.adjustmentLayers, timelineLayers, { includeHiddenRows: true }),
    })),
  };
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

function normalizeEffectsPanelState(state: EffectsPanelState | undefined): EffectsPanelState | undefined {
  if (!state) return undefined;
  return {
    openGroups: state.openGroups && typeof state.openGroups === "object" ? Object.fromEntries(Object.entries(state.openGroups).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")) : undefined,
  };
}

function normalizeEditorMarkerSelection(scene: Scene | undefined, selection: { partId: string; markerId: string } | null | undefined) {
  if (!scene || !selection) return null;
  if (selection.partId === "__timeline_motion__") {
    return getCanonicalMotionMarkers(scene).some((marker) => marker.id === selection.markerId) ? selection : null;
  }
  const part = scene.compositions.find((composition) => composition.id === selection.partId);
  return part && getCanonicalMotionMarkers(part).some((marker) => marker.id === selection.markerId) ? selection : null;
}

function normalizeAdjustmentLayers(layers: AdjustmentLayer[] | undefined): AdjustmentLayer[] {
  return (layers ?? []).map((layer) => ({
    ...layer,
    start: roundTwo(Math.max(layer.start, 0)),
    duration: roundTwo(Math.max(layer.duration, 0.1)),
    effect: {
      effectId: normalizeAdjustmentEffectId(layer.effect.effectId),
      params: { ...layer.effect.params, every: Math.max(1, Math.round(Number(layer.effect.params?.every) || 1)) },
    },
  }));
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineMode = normalizeTimelineMode(project.editorState?.timelineMode);
  const previewState = project.editorState?.preview ?? defaultPreviewViewportState;
  const compositionDocuments = getCompositionDocuments(project);
  const timelines = getProjectTimelines(project);
  const scenes = getScenesFromTimelines(timelines, compositionDocuments);
  const selectedSceneId = timelines.some((timeline) => timeline.id === (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId)) ? (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId) : undefined;
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const selectedMotionMarker = normalizeEditorMarkerSelection(selectedScene, project.editorState?.selectedMotionMarker);
  const selectedPartId = selectedScene?.compositions.some((composition) => composition.id === project.editorState?.selectedPartId) ? project.editorState?.selectedPartId : undefined;

  const normalized = sanitizeProjectNumbers({
    ...project,
    editorState: {
      ...project.editorState,
      timeline: normalizeTimelineViewportState(project.editorState?.timeline),
      composeTimeline: normalizeTimelineViewportState(project.editorState?.composeTimeline),
      timelineLayers: normalizeTimelineLayerState(project.editorState?.timelineLayers),
      timelineMode,
      mode: project.editorState?.mode === "code" ? "code" : "interactive",
      leftPanelTab: project.editorState?.leftPanelTab === "tools" ? "tools" : "assets",
      rightPanelTab: normalizeRightPanelTab(project.editorState?.rightPanelTab),
      selectedTimelineId: timelines.some((timeline) => timeline.id === project.editorState?.selectedTimelineId) ? project.editorState?.selectedTimelineId : undefined,
      selectedSceneId,
      selectedPartId,
      selectedMotionMarker,
      currentSceneTime: roundTwo(Math.max(project.editorState?.currentSceneTime ?? 0, 0)),
      layout: normalizeEditorLayoutState(project.editorState?.layout),
      composeLayout: normalizeComposeLayoutState(project.editorState?.composeLayout),
      preview: {
        scale: roundTwo(Math.min(Math.max(previewState.scale, 0.25), 1)),
        scrollLeft: roundTwo(Math.max(previewState.scrollLeft, 0)),
        scrollTop: roundTwo(Math.max(previewState.scrollTop, 0)),
        zoomBarOpen: Boolean(previewState.zoomBarOpen),
      },
      code: normalizeCodeViewportStates(project.editorState?.code),
      fileManagerState: normalizeFileManagerState(project.editorState?.fileManagerState),
      effectsPanelState: normalizeEffectsPanelState(project.editorState?.effectsPanelState),
    },
    // scenes is derived from timelines via getScenesFromTimelines.
    // Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
    scenes,
    timelines,
    timelineOrder: timelines.map((timeline) => timeline.id),
    compositions: compositionDocuments,
    compositionOrder: compositionDocuments.map((composition) => composition.id),
    compositionSources: Object.fromEntries([...(project.compositionLibrary ?? []).filter((c) => c.source).map((c) => [c.filePath, c.source!]), ...compositionDocuments.map((composition) => [composition.filePath, composition.source])]),
    assets: normalizeAssets(project.assets),
  }) as ProjectManifest;

  delete (normalized as ProjectManifest & { fileManagerState?: FileManagerState }).fileManagerState;

  normalized.compositionLibrary = getCompositionLibrary({ ...project, compositions: normalized.compositions });
  normalized.compositionFolders = getCompositionFolders(project, normalized.compositionLibrary);
  return normalized;
}

export function getActiveTimeline(project: ProjectManifest, timelineId: string | undefined) {
  return project.timelines?.find((timeline) => timeline.id === timelineId) ?? null;
}

export function deleteCompositionFromProject(project: ProjectManifest, compositionId: string): ProjectManifest {
  const nextProject = {
    ...project,
    compositions: (project.compositions ?? []).filter((composition) => composition.id !== compositionId),
    compositionLibrary: (project.compositionLibrary ?? []).filter((composition) => composition.id !== compositionId),
    timelines: (project.timelines ?? []).map((timeline) => ({ ...timeline, clips: timeline.clips.filter((clip) => clip.compositionId !== compositionId && clip.id !== compositionId) })),
  };
  return normalizeProject(nextProject);
}
