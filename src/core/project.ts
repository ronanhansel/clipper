import { getAnimationDefinition } from "./animations/registry";
import { roundTwo, sanitizeProjectNumbers } from "./math";
import { getCanonicalMotionMarkers, getMotionMarkerViews, motionBlocksToMotionMarkers, withCanonicalMotionMarkers } from "./motionEffects";
import { adjustmentEffectPackages, normalizeAdjustmentEffectId } from "./effects/registry";
import { getExecutableAdjustmentLayers } from "./timeline";
import type { AdjustmentLayer, AnimationGraphEdge, AnimationGraphPort, AnimationGraphState, AssetItem, CodeViewportState, ComposeLayoutState, CompositionClip, CompositionDocument, EditorLayoutState, EditorSessionState, EditorState, EffectsPanelState, FileManagerState, FrameObject, LayerAnimation, PartFrame, PersistedEditorTab, PreviewViewportState, ProjectManifest, Scene, TimelineDocument, TimelineLayerState, TimelineMode, TimelineViewportState, TransitionLayer } from "./types";
import { getDisplayNameFromPath } from "./fileNames";

export const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
export const defaultTimelineMode: TimelineMode = "compose";
export const defaultPreviewViewportState: PreviewViewportState = { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false };
export const defaultEditorLayoutState: EditorLayoutState = { leftPanelWidth: 286, rightPanelWidth: 350, timelineHeight: 340 };
export const defaultComposeLayoutState: ComposeLayoutState = { leftPanelWidth: 286 };
export const defaultTimelineLayerState: TimelineLayerState = {
  compositionLayers: [{ id: "comp", name: "Composition" }],
  adjustmentLayers: [{ id: "adjust" }],
  motionLayers: [{ id: "motion", kind: "empty" }],
  transitionLayers: [{ id: "transition" }],
};

export function createDefaultTimelineLayerState(): TimelineLayerState {
  return {
    compositionLayers: defaultTimelineLayerState.compositionLayers?.map((layer) => ({ ...layer })),
    adjustmentLayers: defaultTimelineLayerState.adjustmentLayers?.map((layer) => ({ ...layer })),
    motionLayers: defaultTimelineLayerState.motionLayers?.map((layer) => ({ ...layer })),
    transitionLayers: defaultTimelineLayerState.transitionLayers?.map((layer) => ({ ...layer })),
  };
}

export const emptyTimelineLayerState: TimelineLayerState = {
  compositionLayers: [],
  adjustmentLayers: [],
  motionLayers: [],
  transitionLayers: [],
};

type TimelineLayerArrayKey = {
  [Key in keyof TimelineLayerState]-?: NonNullable<TimelineLayerState[Key]> extends unknown[] ? Key : never;
}[keyof TimelineLayerState];

const timelineLayerKeys = Object.keys(defaultTimelineLayerState).filter((key): key is TimelineLayerArrayKey => Array.isArray(defaultTimelineLayerState[key as keyof TimelineLayerState]));

function normalizeRightPanelTab(tab: unknown) {
  if (tab === "animation" || tab === "agent") return tab;
  if (tab === "motion") return "animation";
  return "video";
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

const animationGraphPorts = new Set<AnimationGraphPort>(["top", "right", "bottom", "left"]);

export function normalizeAnimationGraphState(graph: AnimationGraphState | undefined): AnimationGraphState | undefined {
  if (!graph || typeof graph !== "object") return undefined;
  const deletedNodeIds = Array.isArray(graph.deletedNodeIds) ? Array.from(new Set(graph.deletedNodeIds.filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId.length > 0))) : undefined;
  const normalizedDeletedNodeIds = deletedNodeIds?.length ? deletedNodeIds : undefined;
  const deletedNodeIdSet = new Set(normalizedDeletedNodeIds ?? []);
  const nodes = Object.fromEntries(Object.entries(graph.nodes ?? {}).flatMap(([nodeId, position]) => {
    if (deletedNodeIdSet.has(nodeId)) return [];
    if (!nodeId || !position || typeof position !== "object") return [];
    const x = typeof position.x === "number" && Number.isFinite(position.x) ? roundTwo(position.x) : 0;
    const y = typeof position.y === "number" && Number.isFinite(position.y) ? roundTwo(position.y) : 0;
    return [[nodeId, { x, y }]];
  }));
  const customNodes = graph.customNodes && typeof graph.customNodes === "object" ? Object.fromEntries(Object.entries(graph.customNodes).flatMap(([nodeId, node]) => {
    if (deletedNodeIdSet.has(nodeId)) return [];
    if (!nodeId || !node || typeof node !== "object") return [];
    const kind = node.kind === "animation" || node.kind === "time" ? node.kind : undefined;
    const label = typeof node.label === "string" && node.label ? node.label : undefined;
    const scopeKey = typeof node.scopeKey === "string" && node.scopeKey ? node.scopeKey : undefined;
    if (!kind || !label || !scopeKey) return [];
    const details = node.details && typeof node.details === "object" ? Object.fromEntries(Object.entries(node.details).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])) : undefined;
    return [[nodeId, { kind, label, scopeKey, details: details && Object.keys(details).length ? details : undefined }]];
  })) : undefined;
  const normalizedCustomNodes = customNodes && Object.keys(customNodes).length ? customNodes : undefined;
  const hasGraphNode = (nodeId: string) => Boolean(nodes[nodeId] || normalizedCustomNodes?.[nodeId] || nodeId.startsWith("layer:"));
  const seenEdges = new Set<string>();
  const edges = (Array.isArray(graph.edges) ? graph.edges : []).flatMap((edge): AnimationGraphEdge[] => {
    if (!edge || typeof edge !== "object") return [];
    const fromNodeId = typeof edge.fromNodeId === "string" ? edge.fromNodeId : "";
    const toNodeId = typeof edge.toNodeId === "string" ? edge.toNodeId : "";
    if (deletedNodeIdSet.has(fromNodeId) || deletedNodeIdSet.has(toNodeId)) return [];
    if (fromNodeId.startsWith("enter:") || fromNodeId.startsWith("exit:") || toNodeId.startsWith("enter:") || toNodeId.startsWith("exit:")) return [];
    if (!fromNodeId || !toNodeId || !hasGraphNode(fromNodeId) || !hasGraphNode(toNodeId)) return [];
    const fromPort = animationGraphPorts.has(edge.fromPort) ? edge.fromPort : "right";
    const toPort = animationGraphPorts.has(edge.toPort) ? edge.toPort : "left";
    const id = typeof edge.id === "string" && edge.id ? edge.id : `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`;
    if (seenEdges.has(id)) return [];
    seenEdges.add(id);
    return [{ id, fromNodeId, fromPort, toNodeId, toPort }];
  });
  const viewport = graph.viewport && typeof graph.viewport === "object" ? {
    scrollLeft: roundTwo(Math.max(typeof graph.viewport.scrollLeft === "number" && Number.isFinite(graph.viewport.scrollLeft) ? graph.viewport.scrollLeft : 0, 0)),
    scrollTop: roundTwo(Math.max(typeof graph.viewport.scrollTop === "number" && Number.isFinite(graph.viewport.scrollTop) ? graph.viewport.scrollTop : 0, 0)),
    zoom: typeof graph.viewport.zoom === "number" && Number.isFinite(graph.viewport.zoom) ? roundTwo(Math.min(Math.max(graph.viewport.zoom, 0.01), 4)) : undefined,
  } : undefined;
  const viewports = graph.viewports && typeof graph.viewports === "object" ? Object.fromEntries(Object.entries(graph.viewports).flatMap(([key, value]) => {
    if (!key || !value || typeof value !== "object") return [];
    const scrollLeft = roundTwo(Math.max(typeof value.scrollLeft === "number" && Number.isFinite(value.scrollLeft) ? value.scrollLeft : 0, 0));
    const scrollTop = roundTwo(Math.max(typeof value.scrollTop === "number" && Number.isFinite(value.scrollTop) ? value.scrollTop : 0, 0));
    const zoom = typeof value.zoom === "number" && Number.isFinite(value.zoom) ? roundTwo(Math.min(Math.max(value.zoom, 0.01), 4)) : undefined;
    return [[key, { scrollLeft, scrollTop, zoom }]];
  })) : undefined;
  const normalizedViewports = viewports && Object.keys(viewports).length ? viewports : undefined;
  const parameters = graph.parameters && typeof graph.parameters === "object" ? Object.fromEntries(Object.entries(graph.parameters).flatMap(([nodeId, values]) => {
    if (deletedNodeIdSet.has(nodeId)) return [];
    if (!nodeId || !values || typeof values !== "object") return [];
    const nodeValues = Object.fromEntries(Object.entries(values).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
    return Object.keys(nodeValues).length ? [[nodeId, nodeValues]] : [];
  })) : undefined;
  const normalizedParameters = parameters && Object.keys(parameters).length ? parameters : undefined;
  return Object.keys(nodes).length || edges.length || normalizedCustomNodes || viewport || normalizedViewports || normalizedParameters || normalizedDeletedNodeIds ? { nodes, edges, customNodes: normalizedCustomNodes, parameters: normalizedParameters, deletedNodeIds: normalizedDeletedNodeIds, viewport, viewports: normalizedViewports } : undefined;
}

function normalizeTimelineMode(mode: unknown): TimelineMode {
  return mode === "composition" ? "composition" : "compose";
}

function normalizeEditorMode(mode: unknown): "preview" | "editor" {
  return mode === "editor" || mode === "code" ? "editor" : "preview";
}

export function withRequiredTimelineLayerTypes(state: TimelineLayerState | undefined): TimelineLayerState {
  const defaults = createDefaultTimelineLayerState();
  const next = { ...(state ?? {}) };
  for (const key of timelineLayerKeys) {
    const layers = next[key];
    if (!Array.isArray(layers) || layers.length === 0) {
      (next as Record<TimelineLayerArrayKey, unknown>)[key] = defaults[key];
    }
  }
  return next;
}

function normalizeTimelineLayerState(state: TimelineLayerState | undefined): TimelineLayerState {
  const layerState = withRequiredTimelineLayerTypes(state);
  const sourceCompositionLayers = state?.compositionLayers?.length ? state.compositionLayers : [{ id: "comp", name: "Composition", hidden: state?.compHidden || undefined }];
  const seenCompositionLayerIds = new Set<string>();
  const compositionLayers = sourceCompositionLayers.flatMap((layer) => {
    if (!layer.id || seenCompositionLayerIds.has(layer.id)) return [];
    seenCompositionLayerIds.add(layer.id);
    return [{ id: layer.id, name: layer.name || undefined, hidden: layer.hidden || undefined, locked: layer.locked || undefined }];
  });
  const sourceAdjustmentLayers = layerState.adjustmentLayers!;
  const seenAdjustmentLayerIds = new Set<string>();
  const adjustmentLayers = sourceAdjustmentLayers.flatMap((layer) => {
    if (!layer.id || seenAdjustmentLayerIds.has(layer.id)) return [];
    seenAdjustmentLayerIds.add(layer.id);
    return [{ id: layer.id, name: layer.name || undefined, hidden: layer.hidden || undefined, locked: layer.locked || undefined }];
  });
  const motionLayers = layerState.motionLayers!.filter((layer) => layer.kind === "empty" || layer.kind === "motion");
  const sourceTransitionLayers = layerState.transitionLayers!.slice(0, 1);
  const seenTransitionLayerIds = new Set<string>();
  const transitionLayers = sourceTransitionLayers.flatMap((layer) => {
    if (!layer.id || seenTransitionLayerIds.has(layer.id)) return [];
    seenTransitionLayerIds.add(layer.id);
    return [{ id: layer.id, name: layer.name || undefined, hidden: undefined, locked: layer.locked || undefined }];
  });
  const rowHeights = normalizeTimelineLayerRowHeights(state?.rowHeights);
  return {
    compHidden: state?.compHidden || undefined,
    compositionLayers: compositionLayers.length > 0 ? compositionLayers : defaultTimelineLayerState.compositionLayers!,
    adjustmentLayers: adjustmentLayers.length > 0 ? adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!,
    motionLayers: (motionLayers.length > 0 ? motionLayers : defaultTimelineLayerState.motionLayers!).map((layer) => ({ ...layer, kind: layer.kind, name: layer.name || undefined, hidden: layer.hidden || undefined, locked: layer.locked || undefined })),
    transitionLayers: transitionLayers.length > 0 ? transitionLayers : defaultTimelineLayerState.transitionLayers!,
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
    return nextComposition as CompositionDocument;
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
  const { name: _name, prerender: _prerender, ...rest } = composition as any;
  const motionMarkers = getCanonicalMotionMarkers(rest);
  const motionCollections = withCanonicalMotionMarkers(motionMarkers);
  const objects = stripGeneratedGraphAnimations(rest.objects ?? []);
  const backgroundElements = stripGeneratedGraphAnimations(rest.background.elements ?? []);
  return {
    ...rest,
    compositionId: rest.compositionId || undefined,
    start: typeof rest.start === "number" && Number.isFinite(rest.start) ? roundTwo(Math.max(rest.start, 0)) : undefined,
    trimStart: typeof rest.trimStart === "number" && Number.isFinite(rest.trimStart) ? roundTwo(Math.max(rest.trimStart, 0)) : undefined,
    layerId: rest.layerId || undefined,
    sourceMissing: rest.sourceMissing || undefined,
    compositionError: typeof rest.compositionError === "string" && rest.compositionError ? rest.compositionError : undefined,
    background: {
      ...rest.background,
      stretchToElements: rest.background.stretchToElements || undefined,
      elements: backgroundElements,
    },
    objects,
    ...motionCollections,
  };
}

function stripGeneratedGraphAnimations<T extends FrameObject>(objects: T[]): T[] {
  return objects.map((object) => {
    const animations = object.animations?.filter((animation) => !animation.id.startsWith("graph:"));
    if (animations?.length === object.animations?.length) return object;
    return { ...object, animations: animations?.length ? animations : undefined };
  });
}

const missingCompositionFrame: PartFrame = { width: 1920, height: 1080, style: { background: "#050505" } };

function createMissingCompositionPlaceholder(compositionId: string, clip?: { duration?: number }): CompositionClip {
  return {
    id: compositionId,
    filePath: compositionId,
    sourceMissing: true,
    duration: Math.max(clip?.duration ?? 3, 0.1),
    frame: missingCompositionFrame,
    background: { id: "missing-background", name: "Missing media", style: { background: "#050505" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

function normalizeCompositionDocument(composition: CompositionClip, sources: Record<string, string>): CompositionDocument | undefined {
  const normalized = normalizeComposition(composition);
  const source = sources[composition.filePath];
  if (source === undefined) return undefined;
  return {
    ...normalized,
    source: stripCompositionSourcePrerenderMark(source),
  };
}

function getCompositionLibrary(project: ProjectManifest) {
  const library = project.compositionLibrary ?? project.compositions ?? [];
  return Array.from(new Map(library.map((composition) => [composition.filePath, normalizeComposition(composition)])).values());
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
  const compositionsById = new Map<string, CompositionClip>([
    ...getCompositionLibrary(project).map((composition): [string, CompositionClip] => [composition.id, composition]),
    ...compositionDocs.map((composition): [string, CompositionClip] => [composition.id, composition]),
  ]);
  return {
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
      const composition = compositionsById.get(clip.compositionId) ?? createMissingCompositionPlaceholder(clip.compositionId, clip);
      const animationGraph = normalizeAnimationGraphState(clip.animationGraph);
      return [{ ...applyAnimationGraphToComposition(composition, animationGraph), id: clip.id, compositionId: clip.compositionId, start: clip.start, trimStart: clip.trimStart, layerId: clip.layerId, duration: clip.duration ?? composition.duration, prerender: clip.prerender || undefined, motionMarkers: [], animationGraph }];
    }),
  };
}

function getProjectTimelines(project: ProjectManifest, legacyPrerenderCompositionIds: Set<string> = new Set()): TimelineDocument[] {
  const timelines = project.timelines ?? [];
  const legacyTimelineLayers = project.editorState?.timelineLayers ? normalizeTimelineLayerState(project.editorState.timelineLayers) : undefined;
  return timelines.map((timeline) => {
    const timelineLayers = normalizeTimelineLayerState(timeline.timelineLayers ?? legacyTimelineLayers);
    const transitionLayerId = timelineLayers.transitionLayers?.[0]?.id ?? defaultTimelineLayerState.transitionLayers![0].id;
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
          const start = typeof clipRest.start === "number" && Number.isFinite(clipRest.start) ? roundTwo(Math.max(clipRest.start, 0)) : undefined;
          const trimStart = typeof clipRest.trimStart === "number" && Number.isFinite(clipRest.trimStart) ? roundTwo(Math.max(clipRest.trimStart, 0)) : undefined;
          const duration = typeof clipRest.duration === "number" && Number.isFinite(clipRest.duration) ? roundTwo(Math.max(clipRest.duration, 0.1)) : undefined;
            return {
            ...clipRest,
            start,
            trimStart,
            duration,
            prerender: (clipRest.prerender || legacyPrerenderCompositionIds.has(clipRest.compositionId)) || undefined,
            motionMarkers: [],
            animationGraph: normalizeAnimationGraphState(clipRest.animationGraph),
        };
      }),
      adjustmentLayers: normalizeAdjustmentLayers(rest.adjustmentLayers),
      transitionLayers: normalizeTransitionLayers(rest.transitionLayers, transitionLayerId),
      motionMarkers: timelineMotionMarkers,
      timelineLayers,
      settings: rest.settings ?? {},
    };
  });
}

// Derives Scene[] from timelines for persistence / backward compat.
// Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
function getScenesFromTimelines(timelines: TimelineDocument[], compositions: CompositionClip[]): Scene[] {
  const compositionsById = new Map(compositions.map((composition) => [composition.id, composition]));
  return timelines.map((timeline) => ({
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
        const composition = compositionsById.get(clip.compositionId) ?? createMissingCompositionPlaceholder(clip.compositionId, clip);
        const animationGraph = normalizeAnimationGraphState(clip.animationGraph);
        return [{ ...applyAnimationGraphToComposition(composition, animationGraph), id: clip.id, compositionId: clip.compositionId, start: clip.start, trimStart: clip.trimStart, layerId: clip.layerId, duration: clip.duration ?? composition.duration, prerender: clip.prerender || undefined, motionMarkers: [], animationGraph }];
      }),
  }));
}

export function applyAnimationGraphToComposition(composition: CompositionClip, graph: AnimationGraphState | undefined): CompositionClip {
  if (!composition.objects?.length && !composition.background.elements.length) return composition;
  const nextObjects = composition.objects.map((object) => {
    const graphAnimations = graph ? getGraphLayerAnimationsForObject(object, graph) : [];
    const graphOwnedAnimationIds = graph ? getGraphOwnedAnimationIds(object, graph) : new Set<string>();
    const baseAnimations = (object.animations ?? []).filter((animation) => !animation.id.startsWith("graph:") && !graphOwnedAnimationIds.has(animation.id));
    if (!graphAnimations.length && baseAnimations.length === (object.animations ?? []).length) return object;
    return { ...object, animations: [...baseAnimations, ...graphAnimations] };
  });
  const nextBackgroundElements = composition.background.elements.map((object) => {
    const graphAnimations = graph ? getGraphLayerAnimationsForObject(object, graph) : [];
    const graphOwnedAnimationIds = graph ? getGraphOwnedAnimationIds(object, graph) : new Set<string>();
    const baseAnimations = (object.animations ?? []).filter((animation) => !animation.id.startsWith("graph:") && !graphOwnedAnimationIds.has(animation.id));
    if (!graphAnimations.length && baseAnimations.length === (object.animations ?? []).length) return object;
    return { ...object, animations: [...baseAnimations, ...graphAnimations] };
  });
  const objectsChanged = nextObjects.some((object, index) => object !== composition.objects[index]);
  const backgroundChanged = nextBackgroundElements.some((object, index) => object !== composition.background.elements[index]);
  return objectsChanged || backgroundChanged ? { ...composition, objects: nextObjects, background: { ...composition.background, elements: nextBackgroundElements } } : composition;
}

function getGraphOwnedAnimationIds(object: FrameObject, graph: AnimationGraphState) {
  const prefix = `animation:${object.id}:anim:`;
  const animationsById = new Map((object.animations ?? []).map((animation) => [animation.id, animation]));
  return new Set(
    Object.entries(graph.customNodes ?? {}).flatMap(([nodeId, node]) => {
      const property = node.details?.property;
      if (node.scopeKey !== object.id || !property || !nodeId.startsWith(prefix))
        return [];
      const suffix = `:${property}`;
      if (!nodeId.endsWith(suffix)) return [];
      const animationId = nodeId.slice(prefix.length, -suffix.length);
      const animation = animationsById.get(animationId);
      const definition = getAnimationDefinition(property);
      if (!animation || !definition?.getDetails(animation)) return [];
      return [animationId];
    }),
  );
}

function getGraphLayerAnimationsForObject(object: FrameObject, graph: AnimationGraphState): LayerAnimation[] {
  const scopeKey = object.id;
  const customNodes = Object.entries(graph.customNodes ?? {}).filter(([, node]) => node.scopeKey === scopeKey);
  if (!customNodes.length) return [];
  const nodeKinds = new Map<string, "animation" | "time" | "layer">([[`layer:${object.id}`, "layer"]]);
  for (const [nodeId, node] of customNodes) nodeKinds.set(nodeId, node.kind);
  const edges = (graph.edges ?? []).filter((edge) => nodeKinds.has(edge.fromNodeId) && nodeKinds.has(edge.toNodeId));
  const connected = getGraphConnectedToLayerNodeIds(edges, nodeKinds);
  const emittedPropertiesByTime = new Set<string>();
  return customNodes.flatMap(([nodeId, node]) => {
    if (node.kind !== "animation" || !connected.has(nodeId)) return [];
    const timeEdge = edges.find((edge) => edge.fromNodeId === nodeId && nodeKinds.get(edge.toNodeId) === "time");
    if (!timeEdge) return [];
    const timeNodeId = timeEdge.toNodeId;
    const property = node.details?.property;
    const timeNode = graph.customNodes?.[timeNodeId];
    if (!timeNode || !connected.has(timeNodeId)) return [];
    const delay = getGraphTimeStart(timeNodeId, graph, edges, nodeKinds, new Set());
    const duration = parseGraphSeconds(graph.parameters?.[timeNodeId]?.duration ?? timeNode.details?.duration ?? "0s");
    const ease = graph.parameters?.[timeNodeId]?.ease ?? timeNode.details?.ease;
    const keyframes = getGraphEffectKeyframes(nodeId, node, property, graph);
    if (!keyframes) return [];
    if (property) {
      const propertyTimeKey = `${timeNodeId}:${property}`;
      if (emittedPropertiesByTime.has(propertyTimeKey)) return [];
      emittedPropertiesByTime.add(propertyTimeKey);
    }
    return [{ id: `graph:${nodeId}`, name: node.label, keyframes, options: { delay, duration, ease: normalizeGraphEase(ease), type: "tween" as const } }];
  });
}

function getGraphEffectKeyframes(nodeId: string, node: { details?: Record<string, string> }, property: string | undefined, graph: AnimationGraphState): LayerAnimation["keyframes"] | null {
  const parameters = graph.parameters?.[nodeId] ?? {};
  const details = node.details ?? {};
  const definition = getAnimationDefinition(property);
  if (definition)
    return definition.materializeKeyframes({
      readNumber: (key, fallback) =>
        parseGraphNumber(parameters[key] ?? details[key], fallback),
    });
  if (property) {
    const key = property === "background" ? "backgroundColor" : property;
    return {
      [key]: [
        parseGraphKeyframeValue(parameters.from ?? details.from, 0),
        parseGraphKeyframeValue(parameters.to ?? details.to, 0),
      ],
    } as LayerAnimation["keyframes"];
  }
  return null;
}

function parseGraphKeyframeValue(value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed)
    ? numeric
    : trimmed;
}

function getGraphConnectedToLayerNodeIds(edges: AnimationGraphEdge[], nodeKinds: Map<string, "animation" | "time" | "layer">) {
  const reverse = new Map<string, string[]>();
  for (const edge of edges) reverse.set(edge.toNodeId, [...(reverse.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  const connected = new Set<string>();
  const stack = Array.from(nodeKinds.entries()).filter(([, kind]) => kind === "layer").map(([nodeId]) => nodeId);
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (connected.has(nodeId)) continue;
    connected.add(nodeId);
    for (const upstream of reverse.get(nodeId) ?? []) stack.push(upstream);
  }
  return connected;
}

function getGraphTimeStart(nodeId: string, graph: AnimationGraphState, edges: AnimationGraphEdge[], nodeKinds: Map<string, "animation" | "time" | "layer">, visiting: Set<string>): number {
  if (visiting.has(nodeId)) return 0;
  visiting.add(nodeId);
  const node = graph.customNodes?.[nodeId];
  const delay = parseGraphSeconds(graph.parameters?.[nodeId]?.delay ?? node?.details?.delay ?? "0s");
  const upstreamTimes = edges.filter((edge) => edge.toNodeId === nodeId && nodeKinds.get(edge.fromNodeId) === "time").map((edge) => edge.fromNodeId);
  if (!upstreamTimes.length) return delay;
  return Math.max(...upstreamTimes.map((upstreamId) => getGraphTimeStart(upstreamId, graph, edges, nodeKinds, new Set(visiting)) + getGraphTimeDuration(upstreamId, graph))) + delay;
}

function getGraphTimeDuration(nodeId: string, graph: AnimationGraphState) {
  const node = graph.customNodes?.[nodeId];
  return parseGraphSeconds(graph.parameters?.[nodeId]?.duration ?? node?.details?.duration ?? "0s");
}

function parseGraphSeconds(value: string) { return parseGraphNumber(value, 0); }
function parseGraphNumber(value: string | undefined, fallback: number) { const numeric = Number.parseFloat(value ?? ""); return Number.isFinite(numeric) ? numeric : fallback; }
function normalizeGraphEase(value: string | undefined): LayerAnimation["options"]["ease"] { return value === "easeIn" || value === "easeOut" || value === "easeInOut" || value === "circOut" || value === "backOut" ? value : "linear"; }

export function serializeProjectForSave(project: ProjectManifest): ProjectManifest {
  return stripEmbeddedCompositionSources(pruneStaleAdjustmentLayers(normalizeProject(project)));
}

function stripEmbeddedCompositionSources(project: ProjectManifest): ProjectManifest {
  return {
    ...project,
    compositions: project.compositions?.map(({ source: _source, ...composition }) => composition as CompositionDocument),
    compositionLibrary: project.compositionLibrary?.map(({ source: _source, ...composition }) => composition),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      compositions: scene.compositions.map(({ source: _source, ...composition }) => ({
        ...composition,
        objects: stripGeneratedGraphAnimations(composition.objects ?? []),
        background: {
          ...composition.background,
          elements: stripGeneratedGraphAnimations(composition.background.elements ?? []),
        },
      })),
    })),
  };
}

function pruneStaleAdjustmentLayers(project: ProjectManifest): ProjectManifest {
  return {
    ...project,
    timelines: project.timelines?.map((timeline) => ({
      ...timeline,
      adjustmentLayers: getExecutableAdjustmentLayers(timeline.adjustmentLayers, timeline.timelineLayers, { includeHiddenRows: true }),
    })),
  };
}

function getCompositionFolders(project: ProjectManifest, library: CompositionClip[]) {
  const folderPaths = new Set((project.compositionFolders ?? []).map(normalizeCompositionFolderPath).filter(Boolean));
  for (const composition of library) {
    const slashIndex = composition.filePath.lastIndexOf("/");
    if (slashIndex > 0) {
      const folderPath = normalizeCompositionFolderPath(composition.filePath.slice(0, slashIndex));
      if (folderPath) folderPaths.add(folderPath);
    }
  }
  return [...folderPaths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeCompositionFolderPath(folderPath: string) {
  const normalized = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/^file-manager\//, "");
  return normalized === "compositions" ? "" : normalized;
}

function normalizeCompositionSources(sources: Record<string, string> | undefined) {
  if (!sources) return {};
  return Object.fromEntries(Object.entries(sources).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([filePath, source]) => [filePath, stripCompositionSourcePrerenderMark(source)]));
}

function stripCompositionSourcePrerenderMark(source: string) {
  return source.replace(/\n\s*prerender:\s*(?:true|false),?/g, "");
}

function getLegacyPrerenderCompositionIds(project: ProjectManifest) {
  const sources = project.compositionSources ?? {};
  const marked = new Set<string>();
  for (const composition of [...(project.compositionLibrary ?? []), ...(project.compositions ?? [])]) {
    const source = sources[composition.filePath] ?? "";
    if (composition.prerender || /\n\s*prerender:\s*true\s*,?/.test(source)) marked.add(composition.id);
  }
  return marked;
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

function normalizeEditorSessionState(state: EditorSessionState | undefined, compositionLibrary: CompositionClip[]): EditorSessionState | undefined {
  if (!state || !Array.isArray(state.tabs)) return undefined;
  const compositionIds = new Set(compositionLibrary.map((composition) => composition.id));
  const compositionPaths = new Set(compositionLibrary.map((composition) => composition.filePath));
  const seen = new Set<string>();
  const tabs = state.tabs.flatMap((tab) => {
    if (!tab || typeof tab.id !== "string" || typeof tab.filePath !== "string" || seen.has(tab.id)) return [];
    if (tab.isComposition && !compositionIds.has(tab.id) && !compositionPaths.has(tab.filePath)) return [];
    seen.add(tab.id);
    const normalizedTab = {
      id: tab.id,
      filePath: tab.filePath,
      language: typeof tab.language === "string" && tab.language ? tab.language : "plaintext",
      ...(typeof tab.unsupportedReason === "string" ? { unsupportedReason: tab.unsupportedReason } : {}),
      ...(tab.isComposition === true ? { isComposition: true } : {}),
      isPinned: true,
    } satisfies PersistedEditorTab;
    return [normalizedTab];
  });
  return {
    tabs,
    activeTabId: typeof state.activeTabId === "string" && tabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : tabs[0]?.id ?? null,
  };
}

function normalizeProjectEditorState(project: ProjectManifest, timelines: TimelineDocument[], compositionLibrary: CompositionClip[], timelineMode: TimelineMode, selectedSceneId: string | undefined, selectedMotionMarker: { partId: string; markerId: string } | null, selectedPartId: string | undefined) {
  const previewState = project.editorState?.preview ?? defaultPreviewViewportState;
  const editorState = {
    ...project.editorState,
    timeline: normalizeTimelineViewportState(project.editorState?.timeline),
    composeTimeline: normalizeTimelineViewportState(project.editorState?.composeTimeline),
    timelineMode,
    mode: normalizeEditorMode(project.editorState?.mode),
    leftPanelTab: project.editorState?.leftPanelTab === "tools" ? "tools" : "assets",
    rightPanelTab: normalizeRightPanelTab(project.editorState?.rightPanelTab),
    selectedTimelineId: timelines.some((timeline) => timeline.id === project.editorState?.selectedTimelineId) ? project.editorState?.selectedTimelineId : undefined,
    selectedSceneId,
    selectedPartId,
    selectedComposeObjectIds: Array.isArray(project.editorState?.selectedComposeObjectIds) ? project.editorState.selectedComposeObjectIds.filter((id): id is string => typeof id === "string" && id.length > 0) : undefined,
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
    editor: normalizeCodeViewportStates(project.editorState?.editor ?? project.editorState?.code),
    fileManagerState: normalizeFileManagerState(project.editorState?.fileManagerState),
    effectsPanelState: normalizeEffectsPanelState(project.editorState?.effectsPanelState),
    editorSession: normalizeEditorSessionState(project.editorState?.editorSession, compositionLibrary),
  };
  delete (editorState as EditorState).timelineLayers;
  return editorState;
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

function normalizeTransitionLayers(layers: TransitionLayer[] | undefined, layerId: string): TransitionLayer[] {
  return (layers ?? []).map((layer) => ({
    ...layer,
    layerId,
    start: roundTwo(Math.max(layer.start, 0)),
    duration: roundTwo(Math.max(layer.duration, 0.1)),
  }));
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineMode = normalizeTimelineMode(project.editorState?.timelineMode);
  const legacyPrerenderCompositionIds = getLegacyPrerenderCompositionIds(project);
  const compositionDocuments = getCompositionDocuments(project);
  const liveCompositionDocuments = compositionDocuments.map(({ source: _source, ...composition }) => composition as CompositionDocument);
  const compositionLibrary = getCompositionLibrary({ ...project, compositions: compositionDocuments });
  const timelines = getProjectTimelines(project, legacyPrerenderCompositionIds);
  const scenes = getScenesFromTimelines(timelines, compositionLibrary);
  const selectedSceneId = timelines.some((timeline) => timeline.id === (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId)) ? (project.editorState?.selectedTimelineId ?? project.editorState?.selectedSceneId) : undefined;
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const selectedMotionMarker = normalizeEditorMarkerSelection(selectedScene, project.editorState?.selectedMotionMarker);
  const selectedPartId = selectedScene?.compositions.some((composition) => composition.id === project.editorState?.selectedPartId) ? project.editorState?.selectedPartId : undefined;

  const normalized = sanitizeProjectNumbers({
    ...project,
    editorState: normalizeProjectEditorState(project, timelines, compositionLibrary, timelineMode, selectedSceneId, selectedMotionMarker, selectedPartId),
    // scenes is derived from timelines via getScenesFromTimelines.
    // Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
    scenes,
    timelines,
    timelineOrder: timelines.map((timeline) => timeline.id),
    compositions: liveCompositionDocuments,
    compositionOrder: liveCompositionDocuments.map((composition) => composition.id),
    compositionSources: normalizeCompositionSources(project.compositionSources),
    assets: normalizeAssets(project.assets),
  }) as ProjectManifest;

  delete (normalized as ProjectManifest & { fileManagerState?: FileManagerState }).fileManagerState;

  normalized.compositionLibrary = compositionLibrary;
  normalized.compositionFolders = getCompositionFolders(project, normalized.compositionLibrary);
  return normalized;
}

export function getActiveTimeline(project: ProjectManifest, timelineId: string | undefined) {
  return project.timelines?.find((timeline) => timeline.id === timelineId) ?? null;
}

export function deleteCompositionFromProject(project: ProjectManifest, compositionId: string): ProjectManifest {
  const removedComposition = (project.compositionLibrary ?? project.compositions ?? []).find((composition) => composition.id === compositionId) ?? createMissingCompositionPlaceholder(compositionId);
  const missingComposition = { ...removedComposition, source: undefined, sourceMissing: true };
  const { [removedComposition.filePath]: _removedSource, ...nextCompositionSources } = project.compositionSources ?? {};
  const nextProject = {
    ...project,
    compositionSources: nextCompositionSources,
    compositions: (project.compositions ?? []).filter((composition) => composition.id !== compositionId),
    compositionLibrary: [...(project.compositionLibrary ?? []).filter((composition) => composition.id !== compositionId), missingComposition],
  };
  return normalizeProject(nextProject);
}
