import { getAnimationGraphNodeDefinition } from "../../core/animationGraph/registry";
import { validateAnimationGraph } from "../../core/animationGraph/validation";
import type {
  AnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge,
  AnimationGraphExecutionTrace,
  AnimationGraphNode,
  AnimationGraphStreamTrace,
} from "../../core/animationGraph/types";
import { getGraphEffectPackageByEditorAlias } from "../../core/effects/registry";
import { getGraphPortCompatibilityError } from "../../core/animationGraph/portCompatibility";
import type { GraphParameterEditorSchema } from "./GraphParameterEditor";

type Point = { x: number; y: number };

type StrictEditorNode = Partial<AnimationGraphNode> & {
  id?: string;
  kind?: string;
  label?: string;
  position?: Point;
  x?: number;
  y?: number;
  config?: unknown;
  details?: Record<string, string>;
};

export type StrictComposition2dEditorGraph = {
  nodes?: Record<string, StrictEditorNode | Point | undefined>;
  edges?: ReadonlyArray<unknown>;
  viewport?: AnimationGraph["viewport"];
};

export type StrictComposition2dCanvasNode = StrictEditorNode & {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  typedNode?: AnimationGraphNode;
};

export type StrictComposition2dDragEdge = {
  portId?: string;
  sourcePortId?: string;
};

const newConditionOutputPortId = "new-output";
const schemaSectionsKey = "gro" + "ups";

export type StrictComposition2dNodeDiagnosticSummary = {
  count: number;
  errorCount: number;
  warningCount: number;
  messages: string[];
  traces: string[];
};

export type StrictComposition2dEdgeDebugSummary = {
  label?: string;
  streams: string[];
  diagnostic?: AnimationGraphDiagnostic;
};

export type StrictComposition2dCanvasDiagnostics = {
  status: "ok" | "warning" | "error";
  diagnostics: AnimationGraphDiagnostic[];
  nodes: Map<string, StrictComposition2dNodeDiagnosticSummary>;
  edges: Map<string, StrictComposition2dEdgeDebugSummary>;
};

export function isStrictComposition2dGraph(
  graph: unknown,
): graph is AnimationGraph {
  return (
    typeof graph === "object" &&
    graph !== null &&
    typeof (graph as { sourceObjectId?: unknown }).sourceObjectId === "string"
  );
}

export function saveStrictComposition2dGraph(
  editorGraph: StrictComposition2dEditorGraph,
  currentGraph: AnimationGraph | undefined,
  sourceObjectId: string,
): AnimationGraph {
  const nodes = Object.fromEntries(
    Object.entries(editorGraph.nodes ?? {}).flatMap(([id, node]) => {
      const strictNode = editorNodeToStrictNode(id, node);
      return strictNode ? [[id, strictNode]] : [];
    }),
  );
  const baseGraph = {
    id:
      currentGraph?.sourceObjectId === sourceObjectId
        ? currentGraph.id
        : `graph:${sourceObjectId}`,
    sourceObjectId,
    nodes,
    edges: [],
    viewport: editorGraph.viewport ?? currentGraph?.viewport,
  } satisfies AnimationGraph;
  return {
    ...baseGraph,
    edges: keepValidStrictComposition2dEdges(
      baseGraph,
      (editorGraph.edges ?? []).flatMap(strictOnlyEdge),
    ),
  };
}

export function updateStrictComposition2dNodeParameter(
  graph: AnimationGraph,
  nodeId: string,
  key: string,
  value: string,
): AnimationGraph {
  const node = graph.nodes[nodeId];
  if (!node) return graph;
  const definition = getAnimationGraphNodeDefinition(node.kind);
  if (!definition?.controls) return graph;
  if (!isStrictControlKey(definition.controls, key)) return graph;
  const nextConfig = updateStrictNodeControlConfig(
    definition.normalizeConfig(node.config),
    key,
    value,
  );
  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: { ...node, config: nextConfig },
    },
  };
}

export function updateStrictComposition2dEditorNodeParameter(
  graph: StrictComposition2dEditorGraph,
  nodeId: string,
  key: string,
  value: string,
): StrictComposition2dEditorGraph {
  const current = graph.nodes?.[nodeId];
  if (!current || typeof current !== "object" || !("kind" in current))
    return graph;
  const node = current as StrictEditorNode;
  const definition = getAnimationGraphNodeDefinition(node.kind ?? "unknown");
  if (!definition?.controls) return graph;
  if (!isStrictControlKey(definition.controls, key)) return graph;
  const nextConfig = updateStrictNodeControlConfig(
    definition.normalizeConfig(node.config),
    key,
    value,
  );
  return {
    ...graph,
    nodes: {
      ...(graph.nodes ?? {}),
      [nodeId]: { ...node, config: nextConfig },
    },
  };
}

export function getStrictComposition2dCanvasDiagnostics(result: {
  diagnostics: AnimationGraphDiagnostic[];
  trace?: AnimationGraphExecutionTrace;
}): StrictComposition2dCanvasDiagnostics {
  const nodes = new Map<string, StrictComposition2dNodeDiagnosticSummary>();
  const edges = new Map<string, StrictComposition2dEdgeDebugSummary>();
  for (const diagnostic of result.diagnostics) {
    if (diagnostic.nodeId) {
      const current = nodes.get(diagnostic.nodeId) ?? {
        count: 0,
        errorCount: 0,
        warningCount: 0,
        messages: [],
        traces: [],
      };
      current.count += 1;
      if (diagnostic.severity === "error") current.errorCount += 1;
      else current.warningCount += 1;
      current.messages.push(diagnostic.message);
      nodes.set(diagnostic.nodeId, current);
    }
    if (diagnostic.edgeId) {
      const current = edges.get(diagnostic.edgeId) ?? { streams: [] };
      current.diagnostic = diagnostic;
      edges.set(diagnostic.edgeId, current);
    }
  }
  for (const event of result.trace?.events ?? []) {
    if (event.type === "edge") {
      const current = edges.get(event.edgeId) ?? { streams: [] };
      current.streams = event.streams.map(formatStrictComposition2dStreamTrace);
      current.label = current.streams.join(" | ");
      edges.set(event.edgeId, current);
      continue;
    }
    const current = nodes.get(event.nodeId) ?? {
      count: 0,
      errorCount: 0,
      warningCount: 0,
      messages: [],
      traces: [],
    };
    current.traces = Object.entries(event.outputs).flatMap(
      ([portId, streams]) =>
        streams.map(
          (stream) =>
            `${portId}: ${formatStrictComposition2dStreamTrace(stream)}`,
        ),
    );
    nodes.set(event.nodeId, current);
  }
  return {
    status: result.diagnostics.some((item) => item.severity === "error")
      ? "error"
      : result.diagnostics.length > 0
        ? "warning"
        : "ok",
    diagnostics: result.diagnostics,
    nodes,
    edges,
  };
}

export function getEmptyStrictComposition2dCanvasDiagnostics(): StrictComposition2dCanvasDiagnostics {
  return { status: "ok", diagnostics: [], nodes: new Map(), edges: new Map() };
}

export function createStrictComposition2dEdgeFromDrag(
  drag: StrictComposition2dDragEdge,
  fromNode: StrictComposition2dCanvasNode,
  toNode: StrictComposition2dCanvasNode,
  toPortId: string | undefined,
  existingEdges: readonly unknown[] = [],
): AnimationGraphEdge {
  const strictEdges = existingEdges.flatMap(strictOnlyEdge);
  const fromPort = getStrictComposition2dOutputPort(
    fromNode,
    drag.portId ?? drag.sourcePortId,
    strictEdges,
  );
  const toPort = getStrictComposition2dInputPort(toNode, toPortId);
  const from = { nodeId: fromNode.id, portId: fromPort?.id ?? "" };
  const to = { nodeId: toNode.id, portId: toPort?.id ?? "" };
  return {
    id: `${from.nodeId}:${from.portId}->${to.nodeId}:${to.portId}`,
    from,
    to,
  };
}

export function getStrictComposition2dConnectionError(
  fromNode: StrictComposition2dCanvasNode,
  toNode: StrictComposition2dCanvasNode,
  fromPortId: string | undefined,
  toPortId: string | undefined,
  existingEdges: readonly unknown[] = [],
) {
  const strictEdges = existingEdges.flatMap(strictOnlyEdge);
  const fromPort = getStrictComposition2dOutputPort(
    fromNode,
    fromPortId,
    strictEdges,
  );
  const toPort = getStrictComposition2dInputPort(toNode, toPortId);
  return getGraphPortCompatibilityError(fromPort, toPort);
}

export function getStrictComposition2dPorts(
  node: StrictComposition2dCanvasNode,
  edges: readonly unknown[] = [],
) {
  const strictEdges = edges.flatMap(strictOnlyEdge);
  const strictNode = toStrictComposition2dNode(node);
  if (!strictNode) return [];
  const ports =
    getAnimationGraphNodeDefinition(strictNode.kind)?.getPorts(strictNode) ??
    [];
  if (node.kind !== "condition") return ports;
  const usedOutputIds = new Set(
    strictEdges
      .filter((edge) => edge.from.nodeId === node.id)
      .map((edge) => edge.from.portId)
      .filter((id): id is string => Boolean(id)),
  );
  const dynamicPorts = Array.from(usedOutputIds)
    .filter((id) => id !== "default")
    .filter((id) => !ports.some((port) => port.id === id))
    .map((id) => ({
      id,
      label: id.replace(/^output:/, "Output "),
      direction: "output" as const,
      cardinality: "multi" as const,
      type: { kind: "animation" as const },
      role: "condition-output" as const,
    }));
  return [
    ...ports.filter(
      (port) => port.id !== "default" || usedOutputIds.has("default"),
    ),
    ...dynamicPorts,
    {
      id: newConditionOutputPortId,
      label: "New Output",
      direction: "output" as const,
      cardinality: "multi" as const,
      type: { kind: "animation" as const },
      role: "condition-output" as const,
    },
  ];
}

export function getStrictComposition2dOutputPort(
  node: StrictComposition2dCanvasNode,
  preferredPortId: string | undefined,
  edges: readonly AnimationGraphEdge[] = [],
) {
  const ports = getStrictComposition2dPorts(node, edges).filter(
    (port) => port.direction === "output",
  );
  if (preferredPortId && preferredPortId !== newConditionOutputPortId)
    return (
      ports.find((port) => port.id === preferredPortId) ??
      (node.kind === "condition" && preferredPortId.startsWith("output:")
        ? createStrictConditionOutputPort(preferredPortId)
        : undefined)
    );
  if (preferredPortId === newConditionOutputPortId) {
    const next = getNextStrictConditionOutputPortId(node, edges) ?? "output:1";
    return (
      ports.find((port) => port.id === next) ??
      createStrictConditionOutputPort(next)
    );
  }
  return ports[0];
}

function createStrictConditionOutputPort(id: string) {
  return {
    id,
    label: id.replace(/^output:/, "Output "),
    direction: "output" as const,
    cardinality: "multi" as const,
    type: { kind: "animation" as const },
    role: "condition-output" as const,
  };
}

export function getStrictComposition2dInputPort(
  node: StrictComposition2dCanvasNode,
  preferredPortId: string | undefined,
) {
  const ports = getStrictComposition2dPorts(node).filter(
    (port) => port.direction === "input",
  );
  return ports.find((port) => port.id === preferredPortId) ?? ports[0];
}

export function getStrictComposition2dParameterEditorSchema(
  node: StrictComposition2dCanvasNode,
  edges: readonly unknown[] = [],
): GraphParameterEditorSchema | null {
  if (!node.typedNode) return null;
  if (node.typedNode.kind === "condition")
    return getStrictConditionParameterEditorSchema(
      node,
      edges.flatMap(strictOnlyEdge),
    );
  const definition = getAnimationGraphNodeDefinition(node.typedNode.kind);
  if (!definition?.controls?.length) return null;
  const config = definition.normalizeConfig(node.typedNode.config);
  const fields = definition.controls.flatMap((group) => group.fields);
  return {
    width: 240,
    height: Math.max(72, 56 + fields.length * 34),
    [schemaSectionsKey]: definition.controls.map((group) => ({
      id: group.id,
      label: group.label,
      columns: group.columns,
      fields: group.fields.map((field) => ({
        key: field.key,
        label: field.label,
        value: getStrictControlFieldValue(
          config,
          field.key,
          field.defaultValue,
        ),
        type: field.type,
        unit: field.unit,
        min: field.min,
        max: field.max,
        step: field.step,
        options: field.options,
      })),
    })),
  } as unknown as GraphParameterEditorSchema;
}

function keepValidStrictComposition2dEdges(
  graph: AnimationGraph,
  edges: AnimationGraphEdge[],
) {
  const accepted: AnimationGraphEdge[] = [];
  for (const edge of edges) {
    const diagnostics = validateAnimationGraph({
      ...graph,
      edges: [...accepted, edge],
    });
    if (diagnostics.some((diagnostic) => diagnostic.edgeId === edge.id))
      continue;
    accepted.push(edge);
  }
  return accepted;
}

function editorNodeToStrictNode(
  id: string,
  node: StrictEditorNode | Point | undefined,
): AnimationGraphNode | null {
  if (!node || typeof node !== "object" || !("kind" in node)) return null;
  const rawKind = node.kind;
  const effectNode = getStrictEffectNodeFromEditorNode(id, node, rawKind);
  if (effectNode) return effectNode;
  if (rawKind === "layer") {
    const objectId = id.startsWith("layer:") ? id.slice("layer:".length) : id;
    return {
      id,
      kind: "source",
      position: roundGraphNodePosition(getEditorNodePosition(node)),
      config: { objectId },
    };
  }
  return {
    id,
    kind: rawKind ?? "unknown",
    position: roundGraphNodePosition(getEditorNodePosition(node)),
    config: node.config ?? {},
  };
}

function getStrictEffectNodeFromEditorNode(
  id: string,
  node: StrictEditorNode,
  rawKind: string | undefined,
): AnimationGraphNode | null {
  if (rawKind !== "effect" && rawKind !== "effectMix") return null;
  const config = node.config as
    | { effects?: Array<{ property: string; values: unknown }> }
    | undefined;
  const effect =
    rawKind === "effect" && config?.effects?.length === 1
      ? config.effects[0]
      : null;
  const property = effect?.property ?? node.details?.property;
  const effectPackage = property
    ? getGraphEffectPackageByEditorAlias(property)
    : undefined;
  if (!effectPackage) return null;
  return {
    id,
    kind: `effect:${effectPackage.id}`,
    position: roundGraphNodePosition(getEditorNodePosition(node)),
    config: { params: effect?.values ?? node.details ?? {} },
  };
}

function strictOnlyEdge(edge: unknown): AnimationGraphEdge[] {
  if (!edge || typeof edge !== "object") return [];
  if (Object.keys(edge).some((key) => !["id", "from", "to"].includes(key)))
    return [];
  const candidate = edge as Partial<AnimationGraphEdge>;
  const source = candidate.from;
  const target = candidate.to;
  if (!source?.nodeId || !source.portId || !target?.nodeId || !target.portId)
    return [];
  return [
    {
      id:
        candidate.id ||
        `${source.nodeId}:${source.portId}->${target.nodeId}:${target.portId}`,
      from: source,
      to: target,
    },
  ];
}

function isStrictControlKey(
  controls: NonNullable<
    ReturnType<typeof getAnimationGraphNodeDefinition>
  >["controls"],
  key: string,
) {
  return controls?.some((group) =>
    group.fields.some((field) => field.key === key),
  );
}

function updateStrictNodeControlConfig(
  config: unknown,
  key: string,
  value: string,
) {
  const base = typeof config === "object" && config !== null ? config : {};
  if ("params" in base && typeof base.params === "object" && base.params)
    return {
      ...base,
      params: { ...base.params, [key]: parseStrictControlValue(value) },
    };
  return { ...base, [key]: parseStrictControlValue(value) };
}

function parseStrictControlValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && String(numeric) === value
    ? numeric
    : value;
}

function getStrictControlFieldValue(
  config: unknown,
  key: string,
  defaultValue: string | number | boolean,
) {
  const source = typeof config === "object" && config !== null ? config : {};
  const params =
    "params" in source && typeof source.params === "object" && source.params
      ? source.params
      : undefined;
  const value =
    params && key in params
      ? params[key as keyof typeof params]
      : key in source
        ? source[key as keyof typeof source]
        : defaultValue;
  return String(value ?? "");
}

function getStrictConditionParameterEditorSchema(
  node: StrictComposition2dCanvasNode,
  edges: readonly AnimationGraphEdge[],
): GraphParameterEditorSchema {
  const values = strictConditionConfigToEditorValues(
    normalizeStrictConditionEditorConfig(node.typedNode?.config),
  );
  const outputOptions = getConditionOutputOptions(node, edges);
  const count = Math.min(
    4,
    Math.max(1, Number.parseInt(values.conditionCount ?? "1", 10) || 1),
  );
  const ruleGroups = Array.from({ length: count }, (_, index) => {
    const suffix = index === 0 ? "" : String(index + 1);
    const action = values[`action${suffix}`] ?? "setDelay";
    return {
      id: `condition-rule-${index + 1}`,
      label: `Condition ${index + 1}`,
      fields: [
        {
          key: `matchType${suffix}`,
          label: "matchType",
          value: values[`matchType${suffix}`] ?? "textEquals",
          options: matchTypeOptions,
        },
        {
          key: `value${suffix}`,
          label: "value",
          value: values[`value${suffix}`] ?? "",
          type: "text" as const,
        },
        {
          key: `action${suffix}`,
          label: "action",
          value: action,
          options: actionOptions,
        },
        ...(action === "setDelay"
          ? [
              {
                key: `delay${suffix}`,
                label: "delay",
                value: values[`delay${suffix}`] ?? "0s",
                type: "number" as const,
                unit: "s",
                min: 0,
                max: 120,
                step: 0.1,
              },
            ]
          : [
              {
                key: `outputPort${suffix}`,
                label: "output",
                value:
                  values[`outputPort${suffix}`] ??
                  outputOptions[Math.min(index, outputOptions.length - 1)]
                    ?.value ??
                  "",
                options: outputOptions,
              },
            ]),
        ...(index > 0
          ? [
              {
                key: "__deleteCondition",
                label: "Trash",
                value: String(index + 1),
                type: "button" as const,
              },
            ]
          : []),
      ],
    };
  });
  return {
    width: 240,
    height: 96 + count * 232,
    [schemaSectionsKey]: [
      ...ruleGroups,
      ...(count < 4
        ? [
            {
              id: "condition-add",
              fields: [
                {
                  key: "conditionCount",
                  label: "+ Add condition",
                  value: String(count + 1),
                  type: "button" as const,
                },
              ],
            },
          ]
        : []),
    ],
  } as unknown as GraphParameterEditorSchema;
}

function getConditionOutputOptions(
  node: StrictComposition2dCanvasNode,
  edges: readonly AnimationGraphEdge[],
) {
  const configOutputs =
    node.typedNode?.kind === "condition"
      ? normalizeStrictConditionEditorConfig(node.typedNode.config).outputs.map(
          (output) => output.id,
        )
      : [];
  const sockets = Array.from(
    new Set([
      ...configOutputs,
      ...getConditionOutputSockets(node.id, edges),
      getNextStrictConditionOutputPortId(node, edges) ?? "output:1",
    ]),
  ).filter((id) => id !== "default");
  return sockets.map((socket, index) => ({
    value: socket,
    label: socket.replace(/^output:/, "Output ") || `Output ${index + 1}`,
  }));
}

function getConditionOutputSockets(
  nodeId: string,
  edges: readonly AnimationGraphEdge[],
) {
  return Array.from(
    new Set(
      edges
        .filter((edge) => edge.from.nodeId === nodeId)
        .map((edge) => readConditionOutputSocket(edge.from.portId))
        .filter((socket): socket is string => Boolean(socket)),
    ),
  );
}

function readConditionOutputSocket(portId: string | undefined) {
  return portId?.startsWith("output:") ? portId : undefined;
}

function getNextStrictConditionOutputPortId(
  node: StrictComposition2dCanvasNode,
  edges: readonly AnimationGraphEdge[],
) {
  if (node.kind !== "condition") return "output:1";
  const used = new Set(
    edges
      .filter((edge) => edge.from.nodeId === node.id)
      .map((edge) => edge.from.portId)
      .filter((id): id is string => Boolean(id)),
  );
  for (let index = 1; index <= used.size + 1; index += 1) {
    const id = `output:${index}`;
    if (!used.has(id)) return id;
  }
  return "output:1";
}

function toStrictComposition2dNode(
  node: StrictComposition2dCanvasNode,
): AnimationGraphNode | null {
  const kind =
    node.typedNode?.kind ?? getComposition2dStrictNodeKind(node.kind);
  if (!kind || kind === "group") return null;
  const config =
    node.typedNode?.config ?? getStrictComposition2dDefaultConfig(node, kind);
  return { id: node.id, kind, position: { x: node.x, y: node.y }, config };
}

function getComposition2dStrictNodeKind(kind: string) {
  if (kind === "layer") return "source";
  if (
    kind === "out" ||
    kind === "time" ||
    kind === "split" ||
    kind === "condition" ||
    kind.startsWith("value:") ||
    kind.startsWith("effect:")
  )
    return kind;
  return undefined;
}

function getStrictComposition2dDefaultConfig(
  node: StrictComposition2dCanvasNode,
  kind: string,
) {
  if (kind === "source") return { objectId: node.id.replace(/^layer:/, "") };
  return (
    getAnimationGraphNodeDefinition(kind)?.createDefaultConfig({
      graphId: "editor",
    }) ?? {}
  );
}

function normalizeStrictConditionEditorConfig(config: unknown) {
  const raw =
    typeof config === "object" && config !== null
      ? (config as { outputs?: unknown; rules?: unknown })
      : {};
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.flatMap((output) =>
        output && typeof output === "object" && "id" in output
          ? [
              {
                id: String((output as { id: unknown }).id),
                label: String(
                  (output as { label?: unknown }).label ??
                    String((output as { id: unknown }).id).replace(
                      /^output:/,
                      "Output ",
                    ),
                ),
              },
            ]
          : [],
      )
    : [];
  const rules = Array.isArray(raw.rules) ? raw.rules : [];
  return { outputs, rules };
}

function strictConditionConfigToEditorValues(
  config: ReturnType<typeof normalizeStrictConditionEditorConfig>,
) {
  const values: Record<string, string> = {
    conditionCount: String(Math.max(1, config.rules.length || 1)),
  };
  config.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== "object") return;
    const suffix = index === 0 ? "" : String(index + 1);
    const raw = rule as Record<string, unknown>;
    values[`matchType${suffix}`] = "textEquals";
    values[`value${suffix}`] = String(raw.value ?? "");
    values[`action${suffix}`] = String(raw.action ?? "setDelay");
    values[`delay${suffix}`] = formatSeconds(Number(raw.delay ?? 0));
    values[`outputPort${suffix}`] = String(
      raw.output ?? config.outputs[index]?.id ?? `output:${index + 1}`,
    );
  });
  return values;
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value)) return "0s";
  return `${Math.round(value * 1000) / 1000}s`;
}

const matchTypeOptions = [
  { value: "textEquals", label: "Text equals" },
  { value: "textIncludes", label: "Text includes" },
  { value: "indexEquals", label: "Index equals" },
  { value: "indexModulo", label: "Index modulo" },
];

const actionOptions = [
  { value: "setDelay", label: "Set delay" },
  { value: "sendToOutput", label: "Send to output" },
  { value: "duplicateToOutput", label: "Duplicate to output" },
];

function getEditorNodePosition(node: StrictEditorNode | Point): Point {
  const position = "position" in node ? node.position : undefined;
  return {
    x: position?.x ?? node.x ?? 0,
    y: position?.y ?? node.y ?? 0,
  };
}

function roundGraphNodePosition(position: Point | undefined): Point {
  return {
    x: Math.round((position?.x ?? 0) * 10) / 10,
    y: Math.round((position?.y ?? 0) * 10) / 10,
  };
}

function formatStrictComposition2dStreamTrace(
  stream: AnimationGraphStreamTrace,
) {
  const parts: string[] = [stream.kind];
  if (stream.domain) parts.push(stream.domain);
  if (stream.structureKind) parts.push(stream.structureKind);
  if (stream.tokenCount !== undefined) parts.push(`${stream.tokenCount}t`);
  if (stream.maskCount !== undefined) parts.push(`${stream.maskCount}m`);
  if (stream.effectCount !== undefined) parts.push(`${stream.effectCount}fx`);
  if (stream.valueType) parts.push(stream.valueType);
  if (stream.controllerSummary) parts.push(stream.controllerSummary);
  else if (stream.controller)
    parts.push(
      `${stream.controller.start}/${stream.controller.delay}/${stream.controller.duration}`,
    );
  return parts.join(" ");
}
