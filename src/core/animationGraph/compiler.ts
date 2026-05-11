import { getAnimationDefinition } from "../animations/registry";
import {
  getAnimationGraphTemporalStart,
  type AnimationGraphTemporalNode,
} from "../animationGraphSequencing";
import type {
  AnimationGraphEdge,
  FrameObject,
  LayerAnimation,
  TypedAnimationGraphNode,
  TypedAnimationGraphState,
} from "../types";

type NodeKind = TypedAnimationGraphNode["kind"] | "layer";

function isTypedNode(node: unknown): node is TypedAnimationGraphNode {
  return Boolean(
    node && typeof node === "object" && "kind" in node && "config" in node,
  );
}

function getTypedNode(graph: TypedAnimationGraphState, nodeId: string) {
  const node = graph.nodes[nodeId];
  return isTypedNode(node) ? node : undefined;
}

export function compileTypedAnimationGraphForObject(
  object: FrameObject,
  graph: TypedAnimationGraphState,
): LayerAnimation[] {
  const layerGraph = getTypedAnimationGraphLayer(graph, object.id);
  if (layerGraph && layerGraph !== graph)
    return compileTypedAnimationGraphForObject(object, layerGraph);
  const nodes = Object.values(graph.nodes)
    .filter(isTypedNode)
    .filter(
      (node) => node.kind !== "source" || node.config.objectId === object.id,
    );
  const nodeKinds = new Map<string, NodeKind>(
    nodes.map((node) => [node.id, node.kind]),
  );
  nodeKinds.set(`layer:${object.id}`, "source");
  const edges = graph.edges.filter(
    (edge) => nodeKinds.has(edge.fromNodeId) && nodeKinds.has(edge.toNodeId),
  );
  const outNodeId = nodes.find((node) => node.kind === "out")?.id;
  if (!outNodeId) return [];
  const connected = getConnectedToOutNodeIds(edges, outNodeId);
  const emittedPropertiesByTime = new Set<string>();
  return nodes.flatMap((node) => {
    if (node.kind !== "effect" || !connected.has(node.id)) return [];
    const timeNodeId = getAnimationTimeNodeId(node.id, edges, nodeKinds);
    if (!timeNodeId || !connected.has(timeNodeId)) return [];
    const timeNode = getTypedNode(graph, timeNodeId);
    if (!timeNode || timeNode.kind !== "time") return [];
    const keyframes = getEffectKeyframes(node, graph, edges, nodeKinds);
    if (!keyframes) return [];
    const propertyTimeKey = `${timeNodeId}:${node.config.effects.map((effect) => effect.property).join("+")}`;
    if (emittedPropertiesByTime.has(propertyTimeKey)) return [];
    emittedPropertiesByTime.add(propertyTimeKey);
    const splitNodeId = getSplitNodeIdForTarget(
      timeNodeId,
      graph,
      edges,
      nodeKinds,
      outNodeId,
    );
    const conditionNodeIds = getConditionNodeIdsForSplit(
      splitNodeId,
      outNodeId,
      edges,
      nodeKinds,
    );
    const delay = getTimeStart(timeNodeId, graph, edges, nodeKinds, [object]);
    return [
      {
        id: `graph:${node.id}`,
        name: node.label,
        keyframes,
        options: getTimeOptions(
          timeNode,
          graph,
          delay,
          splitNodeId,
          conditionNodeIds,
          object,
        ),
      },
    ];
  });
}

export function isTypedAnimationGraphObjectConnectedToOut(
  objectId: string,
  graph: TypedAnimationGraphState,
) {
  const layerGraph = getTypedAnimationGraphLayer(graph, objectId);
  if (layerGraph && layerGraph !== graph)
    return isTypedAnimationGraphObjectConnectedToOut(objectId, layerGraph);
  const outNodeId = Object.values(graph.nodes).find(
    (node) => node.kind === "out",
  )?.id;
  const sourceNodeId = Object.values(graph.nodes).find(
    (node) => node.kind === "source" && node.config.objectId === objectId,
  )?.id;
  if (!outNodeId || !sourceNodeId) return true;
  return getConnectedToOutNodeIds(graph.edges, outNodeId).has(sourceNodeId);
}

function getTypedAnimationGraphLayer(
  graph: TypedAnimationGraphState,
  objectId: string,
): TypedAnimationGraphState | undefined {
  const layer = graph.layers?.find((item) => item.id === objectId);
  return layer
    ? { ...graph, nodes: layer.nodes, edges: layer.edges, layers: undefined }
    : graph;
}

function getSplitNodeIdForTarget(
  timeNodeId: string,
  graph: TypedAnimationGraphState,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
  targetNodeId: string,
) {
  const direct = edges.find(
    (edge) => edge.fromNodeId === timeNodeId && edge.toNodeId === targetNodeId,
  );
  if (direct) return null;
  const splitEdge = edges.find(
    (edge) =>
      edge.fromNodeId === timeNodeId &&
      nodeKinds.get(edge.toNodeId) === "split",
  );
  if (!splitEdge) return null;
  const splitNode = getTypedNode(graph, splitEdge.toNodeId);
  return splitNode?.kind === "split" &&
    temporalPathReachesTarget(
      splitEdge.toNodeId,
      targetNodeId,
      edges,
      nodeKinds,
    )
    ? splitEdge.toNodeId
    : null;
}

function getAnimationTimeNodeId(
  animationNodeId: string,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
) {
  const upstream = edges.find(
    (edge) =>
      edge.toNodeId === animationNodeId &&
      nodeKinds.get(edge.fromNodeId) === "time",
  );
  if (upstream) return upstream.fromNodeId;
  const downstream = edges.find(
    (edge) =>
      edge.fromNodeId === animationNodeId &&
      nodeKinds.get(edge.toNodeId) === "time",
  );
  return downstream?.toNodeId ?? null;
}

function getConditionNodeIdsForSplit(
  splitNodeId: string | null,
  targetNodeId: string,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
) {
  if (!splitNodeId) return [];
  return edges.flatMap((edge) =>
    edge.fromNodeId === splitNodeId &&
    nodeKinds.get(edge.toNodeId) === "condition" &&
    temporalPathReachesTarget(edge.toNodeId, targetNodeId, edges, nodeKinds)
      ? [edge.toNodeId]
      : [],
  );
}

function temporalPathReachesTarget(
  startNodeId: string,
  targetNodeId: string,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
) {
  const stack = [startNodeId];
  const visited = new Set<string>();
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of edges.filter(
      (candidate) => candidate.fromNodeId === nodeId,
    )) {
      if (edge.toNodeId === targetNodeId) return true;
      const kind = nodeKinds.get(edge.toNodeId);
      if (kind === "time" || kind === "split" || kind === "condition")
        stack.push(edge.toNodeId);
    }
  }
  return false;
}

function getConnectedToOutNodeIds(
  edges: AnimationGraphEdge[],
  outNodeId: string,
) {
  const reverse = new Map<string, string[]>();
  for (const edge of edges)
    reverse.set(edge.toNodeId, [
      ...(reverse.get(edge.toNodeId) ?? []),
      edge.fromNodeId,
    ]);
  const connected = new Set<string>();
  const stack = [outNodeId];
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (connected.has(nodeId)) continue;
    connected.add(nodeId);
    for (const upstream of reverse.get(nodeId) ?? []) stack.push(upstream);
  }
  return connected;
}

function getEffectKeyframes(
  node: Extract<TypedAnimationGraphNode, { kind: "effect" }>,
  graph: TypedAnimationGraphState,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
): LayerAnimation["keyframes"] | null {
  const effects = getMergedEffectConfigs(node, graph, edges, nodeKinds);
  const keyframes = effects.reduce<LayerAnimation["keyframes"]>(
    (merged, effect) => ({
      ...merged,
      ...getSingleCssEffectKeyframes(effect),
    }),
    {},
  );
  return Object.keys(keyframes).length ? keyframes : null;
}

function getMergedEffectConfigs(
  node: Extract<TypedAnimationGraphNode, { kind: "effect" }>,
  graph: TypedAnimationGraphState,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
) {
  const visited = new Set<string>();
  const collect = (
    current: Extract<TypedAnimationGraphNode, { kind: "effect" }>,
  ): typeof current.config.effects => {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    const upstream = edges.flatMap((edge) => {
      if (
        edge.toNodeId !== current.id ||
        nodeKinds.get(edge.fromNodeId) !== "effect"
      )
        return [];
      const candidate = getTypedNode(graph, edge.fromNodeId);
      return candidate?.kind === "effect" ? [candidate] : [];
    });
    return [
      ...upstream.flatMap((candidate) => collect(candidate)),
      ...current.config.effects,
    ];
  };
  return collect(node);
}

function getSingleCssEffectKeyframes(
  effect: Extract<
    TypedAnimationGraphNode,
    { kind: "effect" }
  >["config"]["effects"][number],
): LayerAnimation["keyframes"] {
  const property = effect.property;
  const definition = getAnimationDefinition(property);
  if (definition)
    return definition.materializeKeyframes({
      readNumber: (key, fallback) => {
        const field = definition.fieldGroups
          .flatMap((group) => group.fields)
          .find((item) => item.key === key);
        return clampNumber(
          parseGraphNumber(readEffectFieldValue(effect, key), fallback),
          field?.min,
          field?.max,
        );
      },
    });
  const key = property === "background" ? "backgroundColor" : property;
  return {
    [key]: [
      parseGraphKeyframeValue(effect.from, 0),
      parseGraphKeyframeValue(effect.to, 0),
    ],
  } as LayerAnimation["keyframes"];
}

function readEffectFieldValue(
  effect: Extract<
    TypedAnimationGraphNode,
    { kind: "effect" }
  >["config"]["effects"][number],
  key: string,
) {
  if (key === "from" && effect.from !== undefined) return effect.from;
  if (key === "to" && effect.to !== undefined) return effect.to;
  return effect.values[key];
}

function getTimeStart(
  nodeId: string,
  graph: TypedAnimationGraphState,
  edges: AnimationGraphEdge[],
  nodeKinds: Map<string, NodeKind>,
  objects: FrameObject[],
) {
  const temporalNodes = Array.from(nodeKinds.entries()).flatMap(
    ([id, kind]) => {
      if (kind !== "time" && kind !== "split") return [];
      const node = getTypedNode(graph, id);
      const details = graphNodeConfigToTemporalDetails(node);
      return [{ id, kind, details } satisfies AnimationGraphTemporalNode];
    },
  );
  const node = temporalNodes.find((candidate) => candidate.id === nodeId);
  if (!node) return 0;
  return getAnimationGraphTemporalStart(node, {
    edges,
    nodes: temporalNodes,
    getMode: (candidate) => (candidate.kind === "split" ? "overlay" : "stack"),
    getScheduleMode: (candidate) =>
      candidate.details?.schedule === "absolute" ? "absolute" : "relative",
    getDelay: (candidate) =>
      parseGraphSeconds(candidate.details?.delay ?? "0s"),
    getDuration: (candidate) =>
      parseGraphSeconds(candidate.details?.duration ?? "0s"),
    getSplitTokenCount: (candidate) =>
      getSplitTokenCount(objects, candidate.details?.mode ?? "word"),
  });
}

function getTimeOptions(
  timeNode: Extract<TypedAnimationGraphNode, { kind: "time" }>,
  graph: TypedAnimationGraphState,
  delay: number,
  splitNodeId: string | null,
  conditionNodeIds: string[],
  object: FrameObject,
): LayerAnimation["options"] {
  return {
    delay,
    duration: timeNode.config.duration,
    ease: normalizeEase(timeNode.config.ease),
    type: "tween",
    repeat: parseRepeat(timeNode.config.repeat),
    repeatType: normalizeRepeatType(timeNode.config.repeatType),
    split: splitNodeId
      ? getSplitOptions(splitNodeId, graph, conditionNodeIds, object)
      : undefined,
  };
}

function getSplitOptions(
  splitNodeId: string,
  graph: TypedAnimationGraphState,
  conditionNodeIds: string[],
  object: FrameObject,
) {
  const splitNode = getTypedNode(graph, splitNodeId);
  if (!splitNode || splitNode.kind !== "split") return undefined;
  const mode = resolveSplitMode(splitNode.config);
  const tokenDelays = getConditionTokenDelays(
    conditionNodeIds,
    graph,
    object,
    mode,
    splitNode.config,
  );
  return {
    mode,
    stagger: splitNode.config.stagger,
    order: splitNode.config.order,
    repeatScope: splitNode.config.repeatScope,
    tokenDelays: Object.keys(tokenDelays).length ? tokenDelays : undefined,
  } satisfies NonNullable<LayerAnimation["options"]["split"]>;
}

function resolveSplitMode(
  config: Extract<TypedAnimationGraphNode, { kind: "split" }>["config"],
): "word" | "character" {
  if (config.mode === "character") return "character";
  if (config.mode === "pattern" && config.pattern) return "word";
  return "word";
}

function getConditionTokenDelays(
  conditionNodeIds: string[],
  graph: TypedAnimationGraphState,
  object: FrameObject,
  mode: string,
  splitConfig?: Extract<TypedAnimationGraphNode, { kind: "split" }>["config"],
) {
  const tokens = getTextTokens(object, mode, splitConfig);
  const tokenDelays: Record<number, number> = {};
  for (const conditionNodeId of conditionNodeIds) {
    const node = getTypedNode(graph, conditionNodeId);
    if (!node || node.kind !== "condition") continue;
    for (const rule of node.config.rules) {
      if (rule.action !== "setDelay") continue;
      const delay = rule.delay ?? 0;
      tokens.forEach((token, index) => {
        if (evaluateConditionRule(rule, token)) {
          tokenDelays[index] = Math.max(0, delay);
        }
      });
    }
  }
  return tokenDelays;
}

function evaluateConditionRule(
  rule: { target: string; operator: string; value: string | number },
  token: string,
): boolean {
  const ruleValue = String(rule.value);
  if (rule.target === "type") {
    const tokenType = inferTokenType(token);
    return evaluateOperator(rule.operator, tokenType, ruleValue);
  }
  return evaluateOperator(rule.operator, token, ruleValue);
}

function evaluateOperator(
  operator: string,
  actual: string,
  expected: string,
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "notContains":
      return !actual.includes(expected);
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

function inferTokenType(token: string): string {
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return "number";
  if (/^#[0-9a-fA-F]{3,8}$/.test(token)) return "color";
  return "string";
}

function getTextTokens(
  object: FrameObject,
  mode: string,
  splitConfig?: Extract<TypedAnimationGraphNode, { kind: "split" }>["config"],
) {
  if (object.type !== "text") return [object.name];
  const text =
    object.richText?.map((segment) => segment.text).join("") ??
    object.content ??
    "";
  if (!text) return [];
  if (mode === "character")
    return Array.from(text).filter((char) => char !== "\n" && !/\s/.test(char));
  if (splitConfig?.mode === "pattern" && splitConfig.pattern) {
    try {
      const regex = new RegExp(splitConfig.pattern, "g");
      return text.match(regex) ?? [];
    } catch {
      return text.match(/\S+/g) ?? [];
    }
  }
  return text.match(/\S+/g) ?? [];
}

function getSplitTokenCount(objects: FrameObject[], mode: string) {
  const counts = objects.map((object) =>
    Math.max(1, getTextTokens(object, mode).length),
  );
  return counts.length ? Math.max(...counts) : 1;
}

function graphNodeConfigToTemporalDetails(
  node: TypedAnimationGraphNode | undefined,
): Record<string, string> {
  if (node?.kind === "time")
    return {
      delay: String(node.config.delay),
      duration: String(node.config.duration),
      schedule: node.config.schedule,
    };
  if (node?.kind === "split")
    return {
      delay: "0",
      duration: "0",
      mode: node.config.mode,
    };
  return {};
}

function parseGraphKeyframeValue(
  value: string | number | undefined,
  fallback: number,
) {
  if (typeof value === "number") return value;
  if (value === undefined || value === "") return fallback;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed)
    ? numeric
    : trimmed;
}

function parseGraphSeconds(value: string) {
  return parseGraphNumber(value, 0);
}
function parseGraphNumber(
  value: string | number | boolean | undefined,
  fallback: number,
) {
  if (typeof value === "number") return value;
  const numeric = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(numeric) ? numeric : fallback;
}
function clampNumber(
  value: number,
  min: number | undefined,
  max: number | undefined,
) {
  return Math.min(Math.max(value, min ?? -Infinity), max ?? Infinity);
}
function parseRepeat(value: number | undefined) {
  if (!value) return undefined;
  return Number.isFinite(value) ? value : Infinity;
}
function normalizeEase(
  value: LayerAnimation["options"]["ease"],
): LayerAnimation["options"]["ease"] {
  return value === "easeIn" ||
    value === "easeOut" ||
    value === "easeInOut" ||
    value === "inAndOut" ||
    value === "expoIn" ||
    value === "expoOut" ||
    value === "circOut" ||
    value === "backOut"
    ? value
    : "linear";
}
function normalizeRepeatType(
  value: string | undefined,
): LayerAnimation["options"]["repeatType"] {
  return value === "loop" || value === "reverse" || value === "mirror"
    ? value
    : undefined;
}
