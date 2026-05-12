import { roundTwo, sanitizeProjectNumbers } from "./math";
import {
  getCanonicalMotionMarkers,
  getMotionMarkerViews,
  motionBlocksToMotionMarkers,
  withCanonicalMotionMarkers,
} from "./motionEffects";
import {
  adjustmentEffectPackages,
  normalizeAdjustmentEffectId,
} from "./effects/registry";
import { getExecutableAdjustmentLayers } from "./timeline";
import type {
  AdjustmentLayer,
  AnimationGraphCustomNode,
  AnimationGraphEdge,
  AnimationGraphGroup,
  AnimationGraphPort,
  AnimationGraphState,
  AssetItem,
  CodeViewportState,
  ComposeLayoutState,
  CompositionClip,
  CompositionDocument,
  CompositionRenderMode,
  EditorLayoutState,
  EditorSessionState,
  EditorState,
  EffectsPanelState,
  FileManagerState,
  FrameObject,
  LayerAnimation,
  PartFrame,
  PersistedEditorTab,
  PreviewViewportState,
  ProjectManifest,
  Scene,
  TimelineClip,
  TimelineDocument,
  TimelineLayerState,
  TimelineMode,
  TimelineViewportState,
  TransitionLayer,
  TypedAnimationGraphState,
} from "./types";
import { getDisplayNameFromPath } from "./fileNames";
import {
  compileAnimationGraphForObject,
  isAnimationGraphObjectConnectedToOut,
  type AnimationGraphObjectCompileResult,
  type AnimationGraphCompileOptions,
} from "./animationGraph/compiler";
import { validateAnimationGraph } from "./animationGraph/validation";
import type {
  AnimationGraph as StrictAnimationGraph,
  AnimationGraphEdge as StrictAnimationGraphEdge,
  AnimationGraphNode as StrictAnimationGraphNode,
} from "./animationGraph/types";

export const defaultTimelineViewportState: TimelineViewportState = {
  displacement: 0,
  zoom: 1,
};
export const defaultTimelineMode: TimelineMode = "compose";
export const defaultPreviewViewportState: PreviewViewportState = {
  scale: 0.5,
  scrollLeft: 0,
  scrollTop: 0,
  zoomBarOpen: false,
};
export const defaultEditorLayoutState: EditorLayoutState = {
  leftPanelWidth: 286,
  rightPanelWidth: 350,
  timelineHeight: 340,
};
export const defaultComposeLayoutState: ComposeLayoutState = {
  leftPanelWidth: 286,
};
export const defaultTimelineLayerState: TimelineLayerState = {
  compositionLayers: [{ id: "comp", name: "Composition" }],
  adjustmentLayers: [{ id: "adjust" }],
  motionLayers: [{ id: "motion", kind: "empty" }],
  transitionLayers: [{ id: "transition" }],
};

export function createDefaultTimelineLayerState(): TimelineLayerState {
  return {
    compositionLayers: defaultTimelineLayerState.compositionLayers?.map(
      (layer) => ({ ...layer }),
    ),
    adjustmentLayers: defaultTimelineLayerState.adjustmentLayers?.map(
      (layer) => ({ ...layer }),
    ),
    motionLayers: defaultTimelineLayerState.motionLayers?.map((layer) => ({
      ...layer,
    })),
    transitionLayers: defaultTimelineLayerState.transitionLayers?.map(
      (layer) => ({ ...layer }),
    ),
  };
}

export const emptyTimelineLayerState: TimelineLayerState = {
  compositionLayers: [],
  adjustmentLayers: [],
  motionLayers: [],
  transitionLayers: [],
};

type TimelineLayerArrayKey = {
  [Key in keyof TimelineLayerState]-?: NonNullable<
    TimelineLayerState[Key]
  > extends unknown[]
    ? Key
    : never;
}[keyof TimelineLayerState];

const timelineLayerKeys = Object.keys(defaultTimelineLayerState).filter(
  (key): key is TimelineLayerArrayKey =>
    Array.isArray(defaultTimelineLayerState[key as keyof TimelineLayerState]),
);

function normalizeRightPanelTab(tab: unknown) {
  if (tab === "agent") return tab;
  return "video";
}

function normalizeCodeViewportState(
  state: CodeViewportState | undefined,
): CodeViewportState {
  return {
    scrollLeft: roundTwo(Math.max(state?.scrollLeft ?? 0, 0)),
    scrollTop: roundTwo(Math.max(state?.scrollTop ?? 0, 0)),
  };
}

function normalizeCodeViewportStates(
  states: Record<string, CodeViewportState> | undefined,
) {
  if (!states) return {};
  return Object.fromEntries(
    Object.entries(states).map(([filePath, state]) => [
      filePath,
      normalizeCodeViewportState(state),
    ]),
  );
}

function normalizeEditorLayoutState(
  state: EditorLayoutState | undefined,
): EditorLayoutState {
  return {
    leftPanelWidth: Math.round(
      Math.min(
        Math.max(
          state?.leftPanelWidth ?? defaultEditorLayoutState.leftPanelWidth,
          220,
        ),
        560,
      ),
    ),
    rightPanelWidth: Math.round(
      Math.min(
        Math.max(
          state?.rightPanelWidth ?? defaultEditorLayoutState.rightPanelWidth,
          280,
        ),
        620,
      ),
    ),
    timelineHeight: Math.round(
      Math.min(
        Math.max(
          state?.timelineHeight ?? defaultEditorLayoutState.timelineHeight,
          220,
        ),
        560,
      ),
    ),
  };
}

function normalizeComposeLayoutState(
  state: ComposeLayoutState | undefined,
): ComposeLayoutState {
  return {
    leftPanelWidth: Math.round(
      Math.min(
        Math.max(
          state?.leftPanelWidth ?? defaultComposeLayoutState.leftPanelWidth,
          220,
        ),
        560,
      ),
    ),
  };
}

function normalizeTimelineViewportState(
  state: TimelineViewportState | undefined,
): TimelineViewportState {
  return {
    displacement: roundTwo(
      Math.max(
        state?.displacement ?? defaultTimelineViewportState.displacement,
        0,
      ),
    ),
    zoom: roundTwo(
      Math.min(
        Math.max(state?.zoom ?? defaultTimelineViewportState.zoom, 0.01),
        4,
      ),
    ),
  };
}

const animationGraphPorts = new Set<AnimationGraphPort>([
  "top",
  "right",
  "bottom",
  "left",
]);

export function normalizeAnimationGraphState(
  graph: AnimationGraphState | undefined,
): AnimationGraphState | undefined {
  if (!graph || typeof graph !== "object") return undefined;
  const nodes = Object.fromEntries(
    Object.entries(graph.nodes ?? {}).flatMap(([nodeId, position]) => {
      if (!nodeId || !position || typeof position !== "object") return [];
      const x =
        typeof position.x === "number" && Number.isFinite(position.x)
          ? roundTwo(position.x)
          : 0;
      const y =
        typeof position.y === "number" && Number.isFinite(position.y)
          ? roundTwo(position.y)
          : 0;
      return [[nodeId, { x, y }]];
    }),
  );
  const customNodes =
    graph.customNodes && typeof graph.customNodes === "object"
      ? Object.fromEntries(
          Object.entries(graph.customNodes).flatMap(([nodeId, node]) => {
            if (!nodeId || !node || typeof node !== "object") return [];
            const rawKind = (node as { kind?: unknown }).kind;
            const kind: AnimationGraphCustomNode["kind"] | undefined =
              rawKind === "animation"
                ? "effect"
                : rawKind === "effect" ||
                    rawKind === "effectMix" ||
                    rawKind === "time" ||
                    rawKind === "split" ||
                    rawKind === "condition" ||
                    rawKind === "group" ||
                    rawKind === "oscillate"
                  ? rawKind
                  : undefined;
            const label =
              typeof node.label === "string" && node.label
                ? node.label
                : undefined;
            const scopeKey =
              typeof node.scopeKey === "string" && node.scopeKey
                ? node.scopeKey
                : undefined;
            if (!kind || !label || !scopeKey) return [];
            const details =
              node.details && typeof node.details === "object"
                ? Object.fromEntries(
                    Object.entries(node.details).flatMap(([key, value]) =>
                      typeof value === "string" ? [[key, value]] : [],
                    ),
                  )
                : undefined;
            return [
              [
                nodeId,
                {
                  kind,
                  label,
                  scopeKey,
                  details:
                    details && Object.keys(details).length
                      ? details
                      : undefined,
                },
              ],
            ];
          }),
        )
      : undefined;
  const normalizedCustomNodes =
    customNodes && Object.keys(customNodes).length ? customNodes : undefined;
  const groups = normalizeAnimationGraphGroups(graph.groups);
  const normalizedGroups =
    groups && Object.keys(groups).length ? groups : undefined;
  const hasGraphNode = (nodeId: string) =>
    Boolean(
      nodes[nodeId] ||
      normalizedCustomNodes?.[nodeId] ||
      nodeId.startsWith("layer:"),
    );
  const seenEdges = new Set<string>();
  const edges = (Array.isArray(graph.edges) ? graph.edges : []).flatMap(
    (edge): AnimationGraphEdge[] => {
      if (!edge || typeof edge !== "object") return [];
      const fromNodeId =
        typeof edge.fromNodeId === "string" ? edge.fromNodeId : "";
      const toNodeId = typeof edge.toNodeId === "string" ? edge.toNodeId : "";
      if (
        fromNodeId.startsWith("enter:") ||
        fromNodeId.startsWith("exit:") ||
        toNodeId.startsWith("enter:") ||
        toNodeId.startsWith("exit:")
      )
        return [];
      if (
        !fromNodeId ||
        !toNodeId ||
        !hasGraphNode(fromNodeId) ||
        !hasGraphNode(toNodeId)
      )
        return [];
      const fromPort = animationGraphPorts.has(edge.fromPort)
        ? edge.fromPort
        : "right";
      const toPort = animationGraphPorts.has(edge.toPort)
        ? edge.toPort
        : "left";
      const fromSocket =
        typeof (edge as { fromSocket?: unknown }).fromSocket === "string"
          ? (edge as { fromSocket: string }).fromSocket
          : undefined;
      const toSocket =
        typeof (edge as { toSocket?: unknown }).toSocket === "string"
          ? (edge as { toSocket: string }).toSocket
          : undefined;
      const id =
        typeof edge.id === "string" && edge.id
          ? edge.id
          : `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`;
      if (seenEdges.has(id)) return [];
      seenEdges.add(id);
      return [
        { id, fromNodeId, fromPort, toNodeId, toPort, fromSocket, toSocket },
      ];
    },
  );
  const viewport =
    graph.viewport && typeof graph.viewport === "object"
      ? {
          scrollLeft: roundTwo(
            Math.max(
              typeof graph.viewport.scrollLeft === "number" &&
                Number.isFinite(graph.viewport.scrollLeft)
                ? graph.viewport.scrollLeft
                : 0,
              0,
            ),
          ),
          scrollTop: roundTwo(
            Math.max(
              typeof graph.viewport.scrollTop === "number" &&
                Number.isFinite(graph.viewport.scrollTop)
                ? graph.viewport.scrollTop
                : 0,
              0,
            ),
          ),
          zoom:
            typeof graph.viewport.zoom === "number" &&
            Number.isFinite(graph.viewport.zoom)
              ? roundTwo(Math.min(Math.max(graph.viewport.zoom, 0.01), 4))
              : undefined,
        }
      : undefined;
  const viewports =
    graph.viewports && typeof graph.viewports === "object"
      ? Object.fromEntries(
          Object.entries(graph.viewports).flatMap(([key, value]) => {
            if (!key || !value || typeof value !== "object") return [];
            const scrollLeft = roundTwo(
              Math.max(
                typeof value.scrollLeft === "number" &&
                  Number.isFinite(value.scrollLeft)
                  ? value.scrollLeft
                  : 0,
                0,
              ),
            );
            const scrollTop = roundTwo(
              Math.max(
                typeof value.scrollTop === "number" &&
                  Number.isFinite(value.scrollTop)
                  ? value.scrollTop
                  : 0,
                0,
              ),
            );
            const zoom =
              typeof value.zoom === "number" && Number.isFinite(value.zoom)
                ? roundTwo(Math.min(Math.max(value.zoom, 0.01), 4))
                : undefined;
            return [[key, { scrollLeft, scrollTop, zoom }]];
          }),
        )
      : undefined;
  const normalizedViewports =
    viewports && Object.keys(viewports).length ? viewports : undefined;
  const parameters =
    graph.parameters && typeof graph.parameters === "object"
      ? Object.fromEntries(
          Object.entries(graph.parameters).flatMap(([nodeId, values]) => {
            if (!nodeId || !values || typeof values !== "object") return [];
            const nodeValues = Object.fromEntries(
              Object.entries(values).flatMap(([key, value]) =>
                typeof value === "string" ? [[key, value]] : [],
              ),
            );
            return Object.keys(nodeValues).length ? [[nodeId, nodeValues]] : [];
          }),
        )
      : undefined;
  const normalizedParameters =
    parameters && Object.keys(parameters).length ? parameters : undefined;
  return Object.keys(nodes).length ||
    edges.length ||
    normalizedCustomNodes ||
    normalizedGroups ||
    viewport ||
    normalizedViewports ||
    normalizedParameters
    ? {
        nodes,
        edges,
        customNodes: normalizedCustomNodes,
        groups: normalizedGroups,
        parameters: normalizedParameters,
        viewport,
        viewports: normalizedViewports,
      }
    : undefined;
}

export function normalizeTypedAnimationGraphState(
  graph: TypedAnimationGraphState | StrictAnimationGraph | undefined,
): StrictAnimationGraph | undefined {
  return normalizeStrictAnimationGraph(graph);
}

export function createDefaultComposition2dAnimationGraph(
  object: FrameObject,
): StrictAnimationGraph {
  const sourceId = `source:${object.id}`;
  const outId = "composition2d:out";
  return {
    id: `graph:${object.id}`,
    sourceObjectId: object.id,
    nodes: {
      [sourceId]: {
        id: sourceId,
        kind: "source",
        position: { x: 60, y: 12 },
        config: { objectId: object.id },
      },
      [outId]: {
        id: outId,
        kind: "out",
        position: { x: 68, y: 12 },
        config: {},
      },
    },
    edges: [
      {
        id: `${sourceId}:out->${outId}:in`,
        from: { nodeId: sourceId, portId: "out" },
        to: { nodeId: outId, portId: "in" },
      },
    ],
  };
}

function normalizeStrictAnimationGraph(
  graph: unknown,
): StrictAnimationGraph | undefined {
  if (!graph || typeof graph !== "object") return undefined;
  const sourceObjectId = (graph as { sourceObjectId?: unknown }).sourceObjectId;
  if (typeof sourceObjectId !== "string" || !sourceObjectId) return undefined;
  const id =
    typeof (graph as { id?: unknown }).id === "string" &&
    (graph as { id: string }).id
      ? (graph as { id: string }).id
      : `graph:${sourceObjectId}`;
  const nodes = Object.fromEntries(
    Object.entries(
      (graph as { nodes?: unknown }).nodes &&
        typeof (graph as { nodes?: unknown }).nodes === "object"
        ? (graph as { nodes: Record<string, unknown> }).nodes
        : {},
    ).flatMap(([nodeId, node]) => {
      if (!nodeId || !node || typeof node !== "object") return [];
      const kind = (node as { kind?: unknown }).kind;
      if (typeof kind !== "string" || !kind) return [];
      return [
        [
          nodeId,
          {
            id: nodeId,
            kind,
            position: normalizeGraphPosition(
              (node as { position?: unknown }).position,
            ),
            config: (node as { config?: unknown }).config ?? {},
          } satisfies StrictAnimationGraphNode,
        ],
      ];
    }),
  );
  const edges = (
    Array.isArray((graph as { edges?: unknown }).edges)
      ? (graph as { edges: unknown[] }).edges
      : []
  ).flatMap((edge): StrictAnimationGraphEdge[] => {
    if (!edge || typeof edge !== "object") return [];
    const from = (edge as { from?: unknown }).from;
    const to = (edge as { to?: unknown }).to;
    if (!from || typeof from !== "object" || !to || typeof to !== "object")
      return [];
    const fromNodeId = (from as { nodeId?: unknown }).nodeId;
    const fromPortId = (from as { portId?: unknown }).portId;
    const toNodeId = (to as { nodeId?: unknown }).nodeId;
    const toPortId = (to as { portId?: unknown }).portId;
    if (
      typeof fromNodeId !== "string" ||
      typeof fromPortId !== "string" ||
      typeof toNodeId !== "string" ||
      typeof toPortId !== "string"
    )
      return [];
    return [
      {
        id:
          typeof (edge as { id?: unknown }).id === "string" &&
          (edge as { id: string }).id
            ? (edge as { id: string }).id
            : `${fromNodeId}:${fromPortId}->${toNodeId}:${toPortId}`,
        from: { nodeId: fromNodeId, portId: fromPortId },
        to: { nodeId: toNodeId, portId: toPortId },
      },
    ];
  });
  const normalized = {
    id,
    sourceObjectId,
    nodes,
    edges,
    viewport: normalizeGraphViewport((graph as { viewport?: any }).viewport),
  };
  return validateAnimationGraph(normalized).some(
    (diagnostic) => diagnostic.severity === "error",
  )
    ? undefined
    : normalized;
}

function normalizeGraphPosition(position: unknown) {
  if (!position || typeof position !== "object") return { x: 0, y: 0 };
  const value = position as { x?: unknown; y?: unknown };
  return {
    x:
      typeof value.x === "number" && Number.isFinite(value.x)
        ? roundTwo(value.x)
        : 0,
    y:
      typeof value.y === "number" && Number.isFinite(value.y)
        ? roundTwo(value.y)
        : 0,
  };
}

function normalizeGraphViewport(
  viewport: TypedAnimationGraphState["viewport"],
) {
  if (!viewport || typeof viewport !== "object") return undefined;
  return {
    scrollLeft: roundTwo(Math.max(viewport.scrollLeft ?? 0, 0)),
    scrollTop: roundTwo(Math.max(viewport.scrollTop ?? 0, 0)),
    zoom:
      typeof viewport.zoom === "number" && Number.isFinite(viewport.zoom)
        ? roundTwo(Math.min(Math.max(viewport.zoom, 0.01), 4))
        : undefined,
  };
}

function normalizeGraphViewports(
  viewports: TypedAnimationGraphState["viewports"],
) {
  if (!viewports || typeof viewports !== "object") return undefined;
  const normalized = Object.fromEntries(
    Object.entries(viewports).flatMap(([key, viewport]) => {
      const next = normalizeGraphViewport(viewport);
      return key && next ? [[key, next]] : [];
    }),
  );
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeAnimationGraphGroups(
  groups: AnimationGraphState["groups"],
): Record<string, AnimationGraphGroup> | undefined {
  if (!groups || typeof groups !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(groups).flatMap(([groupId, group]) => {
      if (!groupId || !group || typeof group !== "object") return [];
      const outNodeId =
        typeof group.outNodeId === "string" && group.outNodeId
          ? group.outNodeId
          : `${groupId}:out`;
      const name =
        typeof group.name === "string" && group.name ? group.name : "Group";
      const nodes = Object.fromEntries(
        Object.entries(group.nodes ?? {}).flatMap(([nodeId, position]) => {
          if (!nodeId || !position || typeof position !== "object") return [];
          const x =
            typeof position.x === "number" && Number.isFinite(position.x)
              ? roundTwo(position.x)
              : 0;
          const y =
            typeof position.y === "number" && Number.isFinite(position.y)
              ? roundTwo(position.y)
              : 0;
          return [[nodeId, { x, y }]];
        }),
      );
      if (!nodes[outNodeId]) nodes[outNodeId] = { x: 6, y: 10 };
      const customNodes =
        group.customNodes && typeof group.customNodes === "object"
          ? Object.fromEntries(
              Object.entries(group.customNodes).flatMap(([nodeId, node]) => {
                if (!nodeId || !node || typeof node !== "object") return [];
                const rawKind = (node as { kind?: unknown }).kind;
                const kind: AnimationGraphCustomNode["kind"] | undefined =
                  rawKind === "animation"
                    ? "effect"
                    : rawKind === "effect" ||
                        rawKind === "effectMix" ||
                        rawKind === "time" ||
                        rawKind === "split" ||
                        rawKind === "condition" ||
                        rawKind === "group"
                      ? rawKind
                      : undefined;
                const label =
                  typeof node.label === "string" && node.label
                    ? node.label
                    : undefined;
                const scopeKey =
                  typeof node.scopeKey === "string" && node.scopeKey
                    ? node.scopeKey
                    : groupId;
                if (!kind || !label) return [];
                const details =
                  node.details && typeof node.details === "object"
                    ? Object.fromEntries(
                        Object.entries(node.details).flatMap(([key, value]) =>
                          typeof value === "string" ? [[key, value]] : [],
                        ),
                      )
                    : undefined;
                return [
                  [
                    nodeId,
                    {
                      kind,
                      label,
                      scopeKey,
                      details:
                        details && Object.keys(details).length
                          ? details
                          : undefined,
                    } satisfies AnimationGraphCustomNode,
                  ],
                ];
              }),
            )
          : undefined;
      const repairedNodes = nodes;
      const repairedCustomNodes = customNodes;
      const hasNode = (nodeId: string) =>
        Boolean(
          repairedNodes[nodeId] ||
          repairedCustomNodes?.[nodeId] ||
          nodeId === outNodeId,
        );
      const seenEdges = new Set<string>();
      const edges = (Array.isArray(group.edges) ? group.edges : []).flatMap(
        (edge): AnimationGraphEdge[] => {
          if (!edge || typeof edge !== "object") return [];
          const fromNodeId =
            typeof edge.fromNodeId === "string" ? edge.fromNodeId : "";
          const toNodeId =
            typeof edge.toNodeId === "string" ? edge.toNodeId : "";
          if (
            !fromNodeId ||
            !toNodeId ||
            !hasNode(fromNodeId) ||
            !hasNode(toNodeId)
          )
            return [];
          const fromPort = animationGraphPorts.has(edge.fromPort)
            ? edge.fromPort
            : "right";
          const toPort = animationGraphPorts.has(edge.toPort)
            ? edge.toPort
            : "left";
          const fromSocket =
            typeof (edge as { fromSocket?: unknown }).fromSocket === "string"
              ? (edge as { fromSocket: string }).fromSocket
              : undefined;
          const toSocket =
            typeof (edge as { toSocket?: unknown }).toSocket === "string"
              ? (edge as { toSocket: string }).toSocket
              : undefined;
          const id =
            typeof edge.id === "string" && edge.id
              ? edge.id
              : `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`;
          if (seenEdges.has(id)) return [];
          seenEdges.add(id);
          return [
            {
              id,
              fromNodeId,
              fromPort,
              toNodeId,
              toPort,
              fromSocket,
              toSocket,
            },
          ];
        },
      );
      const parameters =
        group.parameters && typeof group.parameters === "object"
          ? Object.fromEntries(
              Object.entries(group.parameters).flatMap(([nodeId, values]) => {
                if (!nodeId || !values || typeof values !== "object") return [];
                const nodeValues = Object.fromEntries(
                  Object.entries(values).flatMap(([key, value]) =>
                    typeof value === "string" ? [[key, value]] : [],
                  ),
                );
                return Object.keys(nodeValues).length
                  ? [[nodeId, nodeValues]]
                  : [];
              }),
            )
          : undefined;
      const repairedParameters = parameters;
      return [
        [
          groupId,
          {
            id: groupId,
            name,
            nodes: repairedNodes,
            edges,
            customNodes:
              repairedCustomNodes && Object.keys(repairedCustomNodes).length
                ? repairedCustomNodes
                : undefined,
            parameters:
              repairedParameters && Object.keys(repairedParameters).length
                ? repairedParameters
                : undefined,
            outNodeId,
          },
        ],
      ];
    }),
  );
}

function normalizeTimelineMode(mode: unknown): TimelineMode {
  return mode === "composition" ? "composition" : "compose";
}

function normalizeCompositionRenderMode(mode: unknown): CompositionRenderMode {
  return mode === "webgl" ? mode : "dom";
}

function normalizeEditorMode(mode: unknown): "preview" | "editor" {
  return mode === "editor" || mode === "code" ? "editor" : "preview";
}

export function withRequiredTimelineLayerTypes(
  state: TimelineLayerState | undefined,
): TimelineLayerState {
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

function normalizeTimelineLayerState(
  state: TimelineLayerState | undefined,
): TimelineLayerState {
  const layerState = withRequiredTimelineLayerTypes(state);
  const sourceCompositionLayers = state?.compositionLayers?.length
    ? state.compositionLayers
    : [
        {
          id: "comp",
          name: "Composition",
          hidden: state?.compHidden || undefined,
        },
      ];
  const seenCompositionLayerIds = new Set<string>();
  const compositionLayers = sourceCompositionLayers.flatMap((layer) => {
    if (!layer.id || seenCompositionLayerIds.has(layer.id)) return [];
    seenCompositionLayerIds.add(layer.id);
    return [
      {
        id: layer.id,
        name: layer.name || undefined,
        hidden: layer.hidden || undefined,
        locked: layer.locked || undefined,
      },
    ];
  });
  const sourceAdjustmentLayers = layerState.adjustmentLayers!;
  const seenAdjustmentLayerIds = new Set<string>();
  const adjustmentLayers = sourceAdjustmentLayers.flatMap((layer) => {
    if (!layer.id || seenAdjustmentLayerIds.has(layer.id)) return [];
    seenAdjustmentLayerIds.add(layer.id);
    return [
      {
        id: layer.id,
        name: layer.name || undefined,
        hidden: layer.hidden || undefined,
        locked: layer.locked || undefined,
      },
    ];
  });
  const motionLayers = layerState.motionLayers!.filter(
    (layer) => layer.kind === "empty" || layer.kind === "motion",
  );
  const sourceTransitionLayers = layerState.transitionLayers!.slice(0, 1);
  const seenTransitionLayerIds = new Set<string>();
  const transitionLayers = sourceTransitionLayers.flatMap((layer) => {
    if (!layer.id || seenTransitionLayerIds.has(layer.id)) return [];
    seenTransitionLayerIds.add(layer.id);
    return [
      {
        id: layer.id,
        name: layer.name || undefined,
        hidden: undefined,
        locked: layer.locked || undefined,
      },
    ];
  });
  const rowHeights = normalizeTimelineLayerRowHeights(state?.rowHeights);
  return {
    compHidden: state?.compHidden || undefined,
    compositionLayers:
      compositionLayers.length > 0
        ? compositionLayers
        : defaultTimelineLayerState.compositionLayers!,
    adjustmentLayers:
      adjustmentLayers.length > 0
        ? adjustmentLayers
        : defaultTimelineLayerState.adjustmentLayers!,
    motionLayers: (motionLayers.length > 0
      ? motionLayers
      : defaultTimelineLayerState.motionLayers!
    ).map((layer) => ({
      ...layer,
      kind: layer.kind,
      name: layer.name || undefined,
      hidden: layer.hidden || undefined,
      locked: layer.locked || undefined,
    })),
    transitionLayers:
      transitionLayers.length > 0
        ? transitionLayers
        : defaultTimelineLayerState.transitionLayers!,
    rowHeights: Object.keys(rowHeights).length ? rowHeights : undefined,
  };
}

function normalizeTimelineLayerRowHeights(
  rowHeights: Record<string, number> | undefined,
) {
  if (!rowHeights) return {};
  return Object.fromEntries(
    Object.entries(rowHeights).flatMap(([key, value]) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      return [[key, Math.round(Math.min(Math.max(value, 42), 140))]];
    }),
  );
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

export function replacePartInProject(
  project: ProjectManifest,
  compositionId: string,
  updater: (composition: CompositionClip) => CompositionClip,
): ProjectManifest {
  let nextCompositionId = compositionId;
  const nextCompositions = project.compositions?.map((currentComposition) => {
    if (currentComposition.id !== compositionId) return currentComposition;
    const nextComposition = updater(currentComposition);
    nextCompositionId = nextComposition.id;
    return nextComposition as CompositionDocument;
  });
  const nextCompositionLibrary = project.compositionLibrary?.map(
    (currentComposition) => {
      if (currentComposition.id !== compositionId) return currentComposition;
      const nextComposition = updater(currentComposition);
      nextCompositionId = nextComposition.id;
      return nextComposition;
    },
  );
  const nextTimelines =
    nextCompositionId === compositionId
      ? project.timelines
      : project.timelines?.map((timeline) => ({
          ...timeline,
          clips: timeline.clips.map((clip) =>
            clip.compositionId === compositionId
              ? { ...clip, compositionId: nextCompositionId }
              : clip,
          ),
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
  const backgroundElements = stripGeneratedGraphAnimations(
    rest.background.elements ?? [],
  );
  return {
    ...rest,
    compositionId: rest.compositionId || undefined,
    start:
      typeof rest.start === "number" && Number.isFinite(rest.start)
        ? roundTwo(Math.max(rest.start, 0))
        : undefined,
    trimStart:
      typeof rest.trimStart === "number" && Number.isFinite(rest.trimStart)
        ? roundTwo(Math.max(rest.trimStart, 0))
        : undefined,
    layerId: rest.layerId || undefined,
    sourceMissing: rest.sourceMissing || undefined,
    compositionError:
      typeof rest.compositionError === "string" && rest.compositionError
        ? rest.compositionError
        : undefined,
    animationGraph:
      normalizeTypedAnimationGraphState(rest.animationGraph) ??
      createDefaultComposition2dGraphForComposition(rest),
    renderMode: normalizeCompositionRenderMode(rest.renderMode),
    background: {
      ...rest.background,
      stretchToElements: rest.background.stretchToElements || undefined,
      elements: backgroundElements,
    },
    objects,
    ...motionCollections,
  };
}

function createDefaultComposition2dGraphForComposition(
  composition: CompositionClip,
) {
  if (normalizeCompositionRenderMode(composition.renderMode) === "webgl")
    return undefined;
  const object = (composition.objects ?? [])[0];
  return object ? createDefaultComposition2dAnimationGraph(object) : undefined;
}

function stripGeneratedGraphAnimations<T extends FrameObject>(
  objects: T[],
): T[] {
  return objects.map((object) => {
    const animations = object.animations?.filter(
      (animation) => !animation.id.startsWith("graph:"),
    );
    if (animations?.length === object.animations?.length) return object;
    return {
      ...object,
      animations: animations?.length ? animations : undefined,
    };
  });
}

const missingCompositionFrame: PartFrame = {
  width: 1920,
  height: 1080,
  style: {},
};

function createMissingCompositionPlaceholder(
  compositionId: string,
  clip?: { duration?: number },
): CompositionClip {
  return {
    id: compositionId,
    filePath: compositionId,
    sourceMissing: true,
    duration: Math.max(clip?.duration ?? 3, 0.1),
    frame: missingCompositionFrame,
    background: {
      id: "missing-background",
      name: "Missing media",
      style: {},
      elements: [],
    },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

function normalizeCompositionDocument(
  composition: CompositionClip,
  sources: Record<string, string>,
): CompositionDocument | undefined {
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
  return Array.from(
    new Map(
      library.map((composition) => [
        composition.filePath,
        normalizeComposition(composition),
      ]),
    ).values(),
  );
}

function getCompositionDocuments(project: ProjectManifest) {
  const sources = normalizeCompositionSources(project.compositionSources);
  const compositions = [
    ...(project.compositionLibrary ?? []),
    ...(project.compositions ?? []),
  ];
  const graphStateById = new Map(
    compositions.flatMap((composition) => [
      [composition.id, composition],
      [composition.filePath, composition],
    ]),
  );
  return Array.from(
    new Map(
      compositions
        .map((composition) => [
          composition.id,
          mergeCompositionDocumentGraphState(
            normalizeCompositionDocument(composition, sources),
            graphStateById.get(composition.id) ??
              graphStateById.get(composition.filePath),
          ),
        ])
        .filter(
          (entry): entry is [string, CompositionDocument] =>
            entry[1] !== undefined,
        ),
    ).values(),
  );
}

function mergeCompositionDocumentGraphState(
  document: CompositionDocument | undefined,
  state: CompositionClip | undefined,
): CompositionDocument | undefined {
  if (!document || !state) return document;
  return {
    ...document,
    animationGraph:
      normalizeTypedAnimationGraphState(state.animationGraph) ??
      document.animationGraph,
  };
}

export { getCompositionDocuments };

export function getSceneFromProject(
  project: ProjectManifest,
  sceneId: string,
): Scene | undefined {
  const compositionDocs = getCompositionDocuments(project);
  return getSceneFromProjectWithDocs(project, sceneId, compositionDocs);
}

function getSceneFromProjectWithDocs(
  project: ProjectManifest,
  sceneId: string,
  compositionDocs: CompositionDocument[],
): Scene | undefined {
  const timeline = (project.timelines ?? []).find((t) => t.id === sceneId);
  if (!timeline) return undefined;
  const compositionsById = new Map<string, CompositionClip>([
    ...getCompositionLibrary(project).map(
      (composition): [string, CompositionClip] => [composition.id, composition],
    ),
    ...getCompositionLibrary(project).map(
      (composition): [string, CompositionClip] => [
        composition.filePath,
        composition,
      ],
    ),
    ...compositionDocs.map((composition): [string, CompositionClip] => [
      composition.id,
      composition,
    ]),
    ...compositionDocs.map((composition): [string, CompositionClip] => [
      composition.filePath,
      composition,
    ]),
  ]);
  return {
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
      const composition =
        compositionsById.get(clip.compositionId) ??
        createMissingCompositionPlaceholder(clip.compositionId, clip);
      const animationGraph = normalizeTypedAnimationGraphState(
        composition.animationGraph,
      );
      const renderMode = normalizeCompositionRenderMode(
        clip.renderMode ?? composition.renderMode,
      );
      return [
        {
          ...applyAnimationGraphToComposition(composition, animationGraph),
          id: clip.id,
          compositionId: clip.compositionId,
          start: clip.start,
          trimStart: clip.trimStart,
          layerId: clip.layerId,
          duration: clip.duration ?? composition.duration,
          prerender: clip.prerender || undefined,
          motionMarkers: [],
          animationGraph,
          renderMode,
        },
      ];
    }),
  };
}

function getProjectTimelines(
  project: ProjectManifest,
  legacyPrerenderCompositionIds: Set<string> = new Set(),
): TimelineDocument[] {
  const timelines = project.timelines ?? [];
  const legacyTimelineLayers = project.editorState?.timelineLayers
    ? normalizeTimelineLayerState(project.editorState.timelineLayers)
    : undefined;
  return timelines.map((timeline) => {
    const timelineLayers = normalizeTimelineLayerState(
      timeline.timelineLayers ?? legacyTimelineLayers,
    );
    const transitionLayerId =
      timelineLayers.transitionLayers?.[0]?.id ??
      defaultTimelineLayerState.transitionLayers![0].id;
    const clipMotion = timeline.clips.flatMap((clip) => {
      const motionMarkers = getCanonicalMotionMarkers(clip);
      const clipStart = roundTwo(Math.max(clip.start ?? 0, 0));
      return motionMarkers.map((marker) => ({
        ...marker,
        start: roundTwo(clipStart + marker.start),
      }));
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
        const {
          name: _clipName,
          animationGraph: _animationGraph,
          ...clipRest
        } = clip;
        const start =
          typeof clipRest.start === "number" && Number.isFinite(clipRest.start)
            ? roundTwo(Math.max(clipRest.start, 0))
            : undefined;
        const trimStart =
          typeof clipRest.trimStart === "number" &&
          Number.isFinite(clipRest.trimStart)
            ? roundTwo(Math.max(clipRest.trimStart, 0))
            : undefined;
        const duration =
          typeof clipRest.duration === "number" &&
          Number.isFinite(clipRest.duration)
            ? roundTwo(Math.max(clipRest.duration, 0.1))
            : undefined;
        return {
          ...clipRest,
          start,
          trimStart,
          duration,
          prerender:
            clipRest.prerender ||
            legacyPrerenderCompositionIds.has(clipRest.compositionId) ||
            undefined,
          motionMarkers: [],
          renderMode: normalizeCompositionRenderMode(clipRest.renderMode),
        };
      }),
      adjustmentLayers: normalizeAdjustmentLayers(rest.adjustmentLayers),
      transitionLayers: normalizeTransitionLayers(
        rest.transitionLayers,
        transitionLayerId,
      ),
      motionMarkers: timelineMotionMarkers,
      timelineLayers,
      settings: rest.settings ?? {},
    };
  });
}

// Derives Scene[] from timelines for persistence / backward compat.
// Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
function getScenesFromTimelines(
  timelines: TimelineDocument[],
  compositions: CompositionClip[],
): Scene[] {
  const compositionsById = new Map(
    compositions.map((composition) => [composition.id, composition]),
  );
  for (const composition of compositions)
    compositionsById.set(composition.filePath, composition);
  return timelines.map((timeline) => ({
    id: timeline.id,
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.flatMap((clip) => {
      const composition =
        compositionsById.get(clip.compositionId) ??
        createMissingCompositionPlaceholder(clip.compositionId, clip);
      const animationGraph = normalizeTypedAnimationGraphState(
        composition.animationGraph,
      );
      const renderMode = normalizeCompositionRenderMode(
        clip.renderMode ?? composition.renderMode,
      );
      return [
        {
          ...applyAnimationGraphToComposition(composition, animationGraph),
          id: clip.id,
          compositionId: clip.compositionId,
          start: clip.start,
          trimStart: clip.trimStart,
          layerId: clip.layerId,
          duration: clip.duration ?? composition.duration,
          prerender: clip.prerender || undefined,
          motionMarkers: [],
          animationGraph,
          renderMode,
        },
      ];
    }),
  }));
}

export function applyAnimationGraphToComposition(
  composition: CompositionClip,
  graph: StrictAnimationGraph | undefined,
  options: Omit<AnimationGraphCompileOptions, "sourceObject" | "trace"> = {},
): CompositionClip {
  if (
    !graph &&
    !composition.objects?.length &&
    !composition.background.elements.length
  )
    return composition;
  const baseObjects = stripGraphGeneratedObjects(composition.objects ?? []);
  const baseBackgroundElements = stripGraphGeneratedObjects(
    composition.background.elements ?? [],
  );
  const generatedObjects: FrameObject[] = [];
  const generatedBackgroundElements: FrameObject[] = [];
  const nextObjects = baseObjects.map((object) => {
    const graphCompile = graph
      ? compileGraphForObject(object, graph, options)
      : undefined;
    const graphAnimations = graphCompile?.animations ?? [];
    const generatedGeometry = graphCompile?.generatedGeometry ?? [];
    generatedObjects.push(...(graphCompile?.generatedObjects ?? []));
    const baseAnimations = (object.animations ?? []).filter(
      (animation) => !animation.id.startsWith("graph:"),
    );
    if (
      !graphAnimations.length &&
      !generatedGeometry.length &&
      baseAnimations.length === (object.animations ?? []).length
    )
      return graph && !isAnimationGraphObjectConnectedToOut(object.id, graph)
        ? { ...object, hidden: true, animations: [] }
        : object;
    return {
      ...object,
      hidden: graph
        ? !isAnimationGraphObjectConnectedToOut(object.id, graph)
        : object.hidden,
      animations: [...baseAnimations, ...graphAnimations],
      generatedGeometry: generatedGeometry.length
        ? generatedGeometry
        : undefined,
    };
  });
  const nextBackgroundElements = baseBackgroundElements.map((object) => {
    const graphCompile = graph
      ? compileGraphForObject(object, graph, options)
      : undefined;
    const graphAnimations = graphCompile?.animations ?? [];
    const generatedGeometry = graphCompile?.generatedGeometry ?? [];
    generatedBackgroundElements.push(...(graphCompile?.generatedObjects ?? []));
    const baseAnimations = (object.animations ?? []).filter(
      (animation) => !animation.id.startsWith("graph:"),
    );
    if (
      !graphAnimations.length &&
      !generatedGeometry.length &&
      baseAnimations.length === (object.animations ?? []).length
    )
      return graph && !isAnimationGraphObjectConnectedToOut(object.id, graph)
        ? { ...object, hidden: true, animations: [] }
        : object;
    return {
      ...object,
      hidden: graph
        ? !isAnimationGraphObjectConnectedToOut(object.id, graph)
        : object.hidden,
      animations: [...baseAnimations, ...graphAnimations],
      generatedGeometry: generatedGeometry.length
        ? generatedGeometry
        : undefined,
    };
  });
  const objectsChanged = nextObjects.some(
    (object, index) => object !== baseObjects[index],
  );
  const backgroundChanged = nextBackgroundElements.some(
    (object, index) => object !== baseBackgroundElements[index],
  );
  const hasGeneratedObjects =
    generatedObjects.length > 0 ||
    generatedBackgroundElements.length > 0 ||
    baseObjects.length !== (composition.objects ?? []).length ||
    baseBackgroundElements.length !== composition.background.elements.length;
  return objectsChanged || backgroundChanged || hasGeneratedObjects
    ? {
        ...composition,
        objects: [...nextObjects, ...generatedObjects],
        background: {
          ...composition.background,
          elements: [...nextBackgroundElements, ...generatedBackgroundElements],
        },
      }
    : composition;
}

export function pruneTypedAnimationGraphForObjects(
  graph: StrictAnimationGraph | undefined,
  objects: readonly FrameObject[],
): StrictAnimationGraph | undefined {
  if (!graph) return undefined;
  const objectIds = new Set(objects.map((object) => object.id));
  return objectIds.has(graph.sourceObjectId) ? graph : undefined;
}

function compileGraphForObject(
  object: FrameObject,
  graph: StrictAnimationGraph,
  options: Omit<AnimationGraphCompileOptions, "sourceObject" | "trace"> = {},
): AnimationGraphObjectCompileResult {
  return compileAnimationGraphForObject(object, graph, options);
}

export function serializeProjectForSave(
  project: ProjectManifest,
): ProjectManifest {
  return stripEmbeddedCompositionSources(
    pruneStaleAdjustmentLayers(normalizeProject(project)),
  );
}

function stripEmbeddedCompositionSources(
  project: ProjectManifest,
): ProjectManifest {
  return {
    ...project,
    compositions: project.compositions?.map(
      ({ source: _source, ...composition }) =>
        composition as CompositionDocument,
    ),
    compositionLibrary: project.compositionLibrary?.map(
      ({ source: _source, ...composition }) => composition,
    ),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      compositions: scene.compositions.map(
        ({ source: _source, ...composition }) => ({
          ...composition,
          objects: stripGeneratedGraphGeometry(
            stripGeneratedGraphAnimations(composition.objects ?? []),
          ),
          background: {
            ...composition.background,
            elements: stripGeneratedGraphGeometry(
              stripGeneratedGraphAnimations(
                composition.background.elements ?? [],
              ),
            ),
          },
        }),
      ),
    })),
  };
}

function stripGeneratedGraphGeometry(objects: FrameObject[]) {
  return stripGraphGeneratedObjects(objects).map(
    ({ generatedGeometry: _generatedGeometry, ...object }) =>
      object as FrameObject,
  );
}

function stripGraphGeneratedObjects(objects: FrameObject[]) {
  return objects.filter((object) => !object.generatedByGraph);
}

function pruneStaleAdjustmentLayers(project: ProjectManifest): ProjectManifest {
  return {
    ...project,
    timelines: project.timelines?.map((timeline) => ({
      ...timeline,
      adjustmentLayers: getExecutableAdjustmentLayers(
        timeline.adjustmentLayers,
        timeline.timelineLayers,
        { includeHiddenRows: true },
      ),
    })),
  };
}

function getCompositionFolders(
  project: ProjectManifest,
  library: CompositionClip[],
) {
  const folderPaths = new Set(
    (project.compositionFolders ?? [])
      .map(normalizeCompositionFolderPath)
      .filter(Boolean),
  );
  for (const composition of library) {
    const slashIndex = composition.filePath.lastIndexOf("/");
    if (slashIndex > 0) {
      const folderPath = normalizeCompositionFolderPath(
        composition.filePath.slice(0, slashIndex),
      );
      if (folderPath) folderPaths.add(folderPath);
    }
  }
  return [...folderPaths].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function normalizeCompositionFolderPath(folderPath: string) {
  const normalized = folderPath
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^file-manager\//, "");
  return normalized === "compositions" ? "" : normalized;
}

function normalizeCompositionSources(
  sources: Record<string, string> | undefined,
) {
  if (!sources) return {};
  return Object.fromEntries(
    Object.entries(sources)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([filePath, source]) => [
        filePath,
        stripCompositionSourcePrerenderMark(source),
      ]),
  );
}

function stripCompositionSourcePrerenderMark(source: string) {
  return source.replace(/\n\s*prerender:\s*(?:true|false),?/g, "");
}

function getLegacyPrerenderCompositionIds(project: ProjectManifest) {
  const sources = project.compositionSources ?? {};
  const marked = new Set<string>();
  for (const composition of [
    ...(project.compositionLibrary ?? []),
    ...(project.compositions ?? []),
  ]) {
    const source = sources[composition.filePath] ?? "";
    if (composition.prerender || /\n\s*prerender:\s*true\s*,?/.test(source))
      marked.add(composition.id);
  }
  return marked;
}

function normalizeFileManagerState(
  state: FileManagerState | undefined,
): FileManagerState | undefined {
  if (!state) return undefined;
  return {
    tree: Array.isArray(state.tree) ? state.tree : undefined,
    openState:
      state.openState && typeof state.openState === "object"
        ? Object.fromEntries(
            Object.entries(state.openState).filter(
              (entry): entry is [string, boolean] =>
                typeof entry[1] === "boolean",
            ),
          )
        : undefined,
  };
}

function normalizeEffectsPanelState(
  state: EffectsPanelState | undefined,
): EffectsPanelState | undefined {
  if (!state) return undefined;
  return {
    openGroups:
      state.openGroups && typeof state.openGroups === "object"
        ? Object.fromEntries(
            Object.entries(state.openGroups).filter(
              (entry): entry is [string, boolean] =>
                typeof entry[1] === "boolean",
            ),
          )
        : undefined,
  };
}

function normalizeEditorSessionState(
  state: EditorSessionState | undefined,
  compositionLibrary: CompositionClip[],
): EditorSessionState | undefined {
  if (!state || !Array.isArray(state.tabs)) return undefined;
  const compositionIds = new Set(
    compositionLibrary.map((composition) => composition.id),
  );
  const compositionPaths = new Set(
    compositionLibrary.map((composition) => composition.filePath),
  );
  const seen = new Set<string>();
  const tabs = state.tabs.flatMap((tab) => {
    if (
      !tab ||
      typeof tab.id !== "string" ||
      typeof tab.filePath !== "string" ||
      seen.has(tab.id)
    )
      return [];
    if (
      tab.isComposition &&
      !compositionIds.has(tab.id) &&
      !compositionPaths.has(tab.filePath)
    )
      return [];
    seen.add(tab.id);
    const normalizedTab = {
      id: tab.id,
      filePath: tab.filePath,
      language:
        typeof tab.language === "string" && tab.language
          ? tab.language
          : "plaintext",
      ...(typeof tab.unsupportedReason === "string"
        ? { unsupportedReason: tab.unsupportedReason }
        : {}),
      ...(tab.isComposition === true ? { isComposition: true } : {}),
      isPinned: true,
    } satisfies PersistedEditorTab;
    return [normalizedTab];
  });
  return {
    tabs,
    activeTabId:
      typeof state.activeTabId === "string" &&
      tabs.some((tab) => tab.id === state.activeTabId)
        ? state.activeTabId
        : (tabs[0]?.id ?? null),
  };
}

function normalizeProjectEditorState(
  project: ProjectManifest,
  timelines: TimelineDocument[],
  compositionLibrary: CompositionClip[],
  timelineMode: TimelineMode,
  selectedSceneId: string | undefined,
  selectedMotionMarker: { partId: string; markerId: string } | null,
  selectedPartId: string | undefined,
) {
  const previewState =
    project.editorState?.preview ?? defaultPreviewViewportState;
  const editorState = {
    ...project.editorState,
    timeline: normalizeTimelineViewportState(project.editorState?.timeline),
    composeTimeline: normalizeTimelineViewportState(
      project.editorState?.composeTimeline,
    ),
    timelineMode,
    mode:
      timelineMode === "compose"
        ? "preview"
        : normalizeEditorMode(project.editorState?.mode),
    leftPanelTab:
      project.editorState?.leftPanelTab === "tools" ? "tools" : "assets",
    rightPanelTab: normalizeRightPanelTab(project.editorState?.rightPanelTab),
    selectedTimelineId: timelines.some(
      (timeline) => timeline.id === project.editorState?.selectedTimelineId,
    )
      ? project.editorState?.selectedTimelineId
      : undefined,
    selectedSceneId,
    selectedPartId,
    selectedComposeObjectIds: Array.isArray(
      project.editorState?.selectedComposeObjectIds,
    )
      ? project.editorState.selectedComposeObjectIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : undefined,
    selectedMotionMarker,
    currentSceneTime: roundTwo(
      Math.max(project.editorState?.currentSceneTime ?? 0, 0),
    ),
    layout: normalizeEditorLayoutState(project.editorState?.layout),
    composeLayout: normalizeComposeLayoutState(
      project.editorState?.composeLayout,
    ),
    preview: {
      scale: roundTwo(Math.min(Math.max(previewState.scale, 0.25), 1)),
      scrollLeft: roundTwo(Math.max(previewState.scrollLeft, 0)),
      scrollTop: roundTwo(Math.max(previewState.scrollTop, 0)),
      zoomBarOpen: Boolean(previewState.zoomBarOpen),
    },
    editor: normalizeCodeViewportStates(
      project.editorState?.editor ?? project.editorState?.code,
    ),
    fileManagerState: normalizeFileManagerState(
      project.editorState?.fileManagerState,
    ),
    effectsPanelState: normalizeEffectsPanelState(
      project.editorState?.effectsPanelState,
    ),
    editorSession: normalizeEditorSessionState(
      project.editorState?.editorSession,
      compositionLibrary,
    ),
  };
  delete (editorState as EditorState).timelineLayers;
  return editorState;
}

function normalizeEditorMarkerSelection(
  scene: Scene | undefined,
  selection: { partId: string; markerId: string } | null | undefined,
) {
  if (!scene || !selection) return null;
  if (selection.partId === "__timeline_motion__") {
    return getCanonicalMotionMarkers(scene).some(
      (marker) => marker.id === selection.markerId,
    )
      ? selection
      : null;
  }
  const part = scene.compositions.find(
    (composition) => composition.id === selection.partId,
  );
  return part &&
    getCanonicalMotionMarkers(part).some(
      (marker) => marker.id === selection.markerId,
    )
    ? selection
    : null;
}

function normalizeAdjustmentLayers(
  layers: AdjustmentLayer[] | undefined,
): AdjustmentLayer[] {
  return (layers ?? []).map((layer) => ({
    ...layer,
    start: roundTwo(Math.max(layer.start, 0)),
    duration: roundTwo(Math.max(layer.duration, 0.1)),
    effect: {
      effectId: normalizeAdjustmentEffectId(layer.effect.effectId),
      params: {
        ...layer.effect.params,
        every: Math.max(1, Math.round(Number(layer.effect.params?.every) || 1)),
      },
    },
  }));
}

function normalizeTransitionLayers(
  layers: TransitionLayer[] | undefined,
  layerId: string,
): TransitionLayer[] {
  return (layers ?? []).map((layer) => ({
    ...layer,
    layerId,
    start: roundTwo(Math.max(layer.start, 0)),
    duration: roundTwo(Math.max(layer.duration, 0.1)),
  }));
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineMode = normalizeTimelineMode(project.editorState?.timelineMode);
  const legacyPrerenderCompositionIds =
    getLegacyPrerenderCompositionIds(project);
  const compositionDocuments = getCompositionDocuments(project);
  const liveCompositionDocuments = compositionDocuments.map(
    ({ source: _source, ...composition }) => composition as CompositionDocument,
  );
  const compositionLibrary = getCompositionLibrary({
    ...project,
    compositions: compositionDocuments,
  });
  const timelines = getProjectTimelines(project, legacyPrerenderCompositionIds);
  const scenes = getScenesFromTimelines(timelines, compositionLibrary);
  const selectedSceneId = timelines.some(
    (timeline) =>
      timeline.id ===
      (project.editorState?.selectedTimelineId ??
        project.editorState?.selectedSceneId),
  )
    ? (project.editorState?.selectedTimelineId ??
      project.editorState?.selectedSceneId)
    : undefined;
  const selectedScene =
    scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const selectedMotionMarker = normalizeEditorMarkerSelection(
    selectedScene,
    project.editorState?.selectedMotionMarker,
  );
  const selectedPartId = selectedScene?.compositions.some(
    (composition) => composition.id === project.editorState?.selectedPartId,
  )
    ? project.editorState?.selectedPartId
    : undefined;

  const normalized = sanitizeProjectNumbers({
    ...project,
    editorState: normalizeProjectEditorState(
      project,
      timelines,
      compositionLibrary,
      timelineMode,
      selectedSceneId,
      selectedMotionMarker,
      selectedPartId,
    ),
    // scenes is derived from timelines via getScenesFromTimelines.
    // Editing mutations write only to project.timelines; runtime reads use getSceneFromProject.
    scenes,
    timelines,
    timelineOrder: timelines.map((timeline) => timeline.id),
    compositions: liveCompositionDocuments,
    compositionOrder: liveCompositionDocuments.map(
      (composition) => composition.id,
    ),
    compositionSources: normalizeCompositionSources(project.compositionSources),
    assets: normalizeAssets(project.assets),
  }) as ProjectManifest;

  delete (
    normalized as ProjectManifest & { fileManagerState?: FileManagerState }
  ).fileManagerState;

  normalized.compositionLibrary = compositionLibrary;
  normalized.compositionFolders = getCompositionFolders(
    project,
    normalized.compositionLibrary,
  );
  return normalized;
}

export function getActiveTimeline(
  project: ProjectManifest,
  timelineId: string | undefined,
) {
  return (
    project.timelines?.find((timeline) => timeline.id === timelineId) ?? null
  );
}

export function deleteCompositionFromProject(
  project: ProjectManifest,
  compositionId: string,
): ProjectManifest {
  const removedComposition =
    (project.compositionLibrary ?? project.compositions ?? []).find(
      (composition) => composition.id === compositionId,
    ) ?? createMissingCompositionPlaceholder(compositionId);
  const missingComposition = {
    ...removedComposition,
    source: undefined,
    sourceMissing: true,
  };
  const {
    [removedComposition.filePath]: _removedSource,
    ...nextCompositionSources
  } = project.compositionSources ?? {};
  const nextProject = {
    ...project,
    compositionSources: nextCompositionSources,
    compositions: (project.compositions ?? []).filter(
      (composition) => composition.id !== compositionId,
    ),
    compositionLibrary: [
      ...(project.compositionLibrary ?? []).filter(
        (composition) => composition.id !== compositionId,
      ),
      missingComposition,
    ],
  };
  return normalizeProject(nextProject);
}
