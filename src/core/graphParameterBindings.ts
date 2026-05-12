import { areGraphPortsCompatible } from "./animationGraph/portCompatibility";
import { getAnimationGraphNodeDefinition } from "./animationGraph/registry";
import {
  evaluateGraphMathExpression,
  getGraphMathExpressionAliases,
  isGraphMathExpression,
  isPotentialGraphMathExpression,
} from "./graphInputExpression";
import type {
  AnimationGraph,
  AnimationGraphEdge,
  AnimationGraphNode,
  GraphPortDefinition,
  GraphPortId,
  ValueStream,
} from "./animationGraph/types";

export type GraphInputBindingOption = {
  alias: string;
  expression: string;
  label: string;
  nodeId: string;
  portId: string;
};

export function isGraphInputExpression(value: string) {
  const trimmed = value.trim();
  if (/^-?\d*(?:[.,]\d+)?$/.test(trimmed) && /\d/.test(trimmed)) return false;
  return isGraphMathExpression(value);
}

export function isPotentialGraphInputExpression(value: string) {
  return isPotentialGraphMathExpression(value);
}

export function getStrictGraphInputBindingOptions(
  graph: AnimationGraph | undefined,
  targetNodeId: string,
  targetPortId: GraphPortId,
): GraphInputBindingOption[] {
  return getStrictGraphInputBindingOptionsInternal(
    graph,
    targetNodeId,
    targetPortId,
    { connectedOnly: true },
  );
}

function getStrictGraphInputBindingOptionsInternal(
  graph: AnimationGraph | undefined,
  targetNodeId: string,
  targetPortId: GraphPortId,
  options: { connectedOnly: boolean },
): GraphInputBindingOption[] {
  const targetNode = graph?.nodes[targetNodeId];
  const targetPort = getNodePort(targetNode, targetPortId, "input");
  if (!graph || !targetNode || !targetPort) return [];
  const connectedOutputKeys = new Set(
    graph.edges.map((edge) => `${edge.from.nodeId}:${edge.from.portId}`),
  );
  const candidates = Object.values(graph.nodes).flatMap((node) => {
    if (node.id === targetNodeId) return [];
    return getNodeOutputPorts(node)
      .filter(
        (port) =>
          !options.connectedOnly ||
          connectedOutputKeys.has(`${node.id}:${port.id}`),
      )
      .filter((port) => areGraphPortsCompatible(port, targetPort))
      .map((port) => {
        const alias = getStrictGraphInputAlias(graph, node, port.id);
        return {
          alias,
          expression: `input.${alias}`,
          label: `${getGraphNodeLabel(node)}.${port.label || port.id}`,
          nodeId: node.id,
          portId: port.id,
        };
      });
  });
  return candidates.sort((a, b) => a.expression.localeCompare(b.expression));
}

export function getStrictGraphInputBindingExpression(
  graph: AnimationGraph | undefined,
  targetNodeId: string,
  targetPortId: GraphPortId,
) {
  const configExpression = readNodeConfigValue(
    graph?.nodes[targetNodeId],
    targetPortId,
  );
  if (
    typeof configExpression === "string" &&
    isGraphInputExpression(configExpression)
  )
    return configExpression;
  const edge = getStrictGraphInputBindingEdge(
    graph,
    targetNodeId,
    targetPortId,
  );
  if (!edge || !graph) return null;
  const source = graph.nodes[edge.from.nodeId];
  if (!source) return null;
  return `input.${getStrictGraphInputAlias(graph, source, edge.from.portId)}`;
}

export function bindStrictGraphInputParameter(
  graph: AnimationGraph,
  targetNodeId: string,
  targetPortId: GraphPortId,
  expression: string,
): AnimationGraph {
  if (!isGraphInputExpression(expression)) return graph;
  const aliases = getGraphMathExpressionAliases(expression);
  const options = getStrictGraphInputBindingOptionsInternal(
    graph,
    targetNodeId,
    targetPortId,
    { connectedOnly: false },
  ).filter((item) => aliases.includes(item.alias));
  if (aliases.length && options.length !== aliases.length) return graph;
  const baseGraph = unbindStrictGraphInputParameter(
    graph,
    targetNodeId,
    targetPortId,
  );
  const targetPort = getNodePort(
    baseGraph.nodes[targetNodeId],
    targetPortId,
    "input",
  );
  const dependencyPortId = getExpressionDependencyPortId(
    baseGraph.nodes[targetNodeId],
    targetPortId,
    targetPort?.cardinality === "single" && aliases.length !== 1,
  );
  const edges = options.map((option) => ({
    id:
      dependencyPortId === targetPortId
        ? `${option.nodeId}:${option.portId}->${targetNodeId}:${targetPortId}`
        : `${option.nodeId}:${option.portId}->${targetNodeId}:${dependencyPortId}:expr:${targetPortId}`,
    from: { nodeId: option.nodeId, portId: option.portId },
    to: { nodeId: targetNodeId, portId: dependencyPortId },
  }));
  return {
    ...baseGraph,
    nodes: updateNodeConfigValue(
      baseGraph.nodes,
      targetNodeId,
      targetPortId,
      expression.trim(),
    ),
    edges: [...baseGraph.edges, ...edges],
  };
}

export function evaluateGraphInputExpression(
  expression: string,
  streams: readonly ValueStream[],
): ValueStream | null {
  const stream = streams[0];
  if (!isGraphInputExpression(expression)) return null;
  const directAlias = expression
    .trim()
    .match(/^input\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!stream && directAlias) return null;
  if (directAlias) return stream;
  const variables = Object.fromEntries(
    streams
      .map(
        (item) => [readAliasFromStreamId(item.id), Number(item.value)] as const,
      )
      .filter((item): item is readonly [string, number] =>
        Boolean(item[0] && Number.isFinite(item[1])),
      ),
  );
  const value = evaluateGraphMathExpression(expression, variables);
  if (value === null) return null;
  return {
    ...(stream ?? { id: "expression", valueType: "number" as const }),
    id: `${stream?.id ?? "expression"}:expr`,
    valueType: "number",
    value,
  };
}

export function unbindStrictGraphInputParameter(
  graph: AnimationGraph,
  targetNodeId: string,
  targetPortId: GraphPortId,
): AnimationGraph {
  return {
    ...graph,
    edges: graph.edges.filter(
      (edge) =>
        !(
          edge.to.nodeId === targetNodeId &&
          (edge.to.portId === targetPortId ||
            edge.id.endsWith(`:expr:${targetPortId}`))
        ),
    ),
  };
}

function getStrictGraphInputBindingEdge(
  graph: AnimationGraph | undefined,
  targetNodeId: string,
  targetPortId: GraphPortId,
) {
  return (
    graph?.edges.find(
      (edge) =>
        edge.to.nodeId === targetNodeId && edge.to.portId === targetPortId,
    ) ?? null
  );
}

function readNodeConfigValue(
  node: AnimationGraphNode | undefined,
  key: string,
) {
  const config = node?.config;
  if (!config || typeof config !== "object") return undefined;
  if (
    "params" in config &&
    config.params &&
    typeof config.params === "object" &&
    key in config.params
  )
    return (config.params as Record<string, unknown>)[key];
  return key in config ? (config as Record<string, unknown>)[key] : undefined;
}

function updateNodeConfigValue(
  nodes: AnimationGraph["nodes"],
  nodeId: string,
  key: string,
  value: string,
) {
  const node = nodes[nodeId];
  if (!node) return nodes;
  const config =
    node.config && typeof node.config === "object" ? node.config : {};
  const nextConfig =
    "params" in config && config.params && typeof config.params === "object"
      ? {
          ...config,
          params: { ...config.params, [key]: value },
        }
      : { ...config, [key]: value };
  return {
    ...nodes,
    [nodeId]: { ...node, config: nextConfig },
  };
}

function getExpressionDependencyPortId(
  node: AnimationGraphNode | undefined,
  targetPortId: GraphPortId,
  preferMulti: boolean,
) {
  if (!preferMulti) return targetPortId;
  const ports =
    getAnimationGraphNodeDefinition(node?.kind ?? "")
      ?.getPorts(node as AnimationGraphNode)
      .filter((port) => port.direction === "input") ?? [];
  return (
    ports.find(
      (port) =>
        port.cardinality === "multi" &&
        port.type.kind === "value" &&
        port.type.valueType === "number",
    )?.id ?? targetPortId
  );
}

function readAliasFromStreamId(id: string) {
  return id.match(/^input\.([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "";
}

function getNodeOutputPorts(node: AnimationGraphNode) {
  return (
    getAnimationGraphNodeDefinition(node.kind)
      ?.getPorts(node)
      .filter((port) => port.direction === "output") ?? []
  );
}

function getNodePort(
  node: AnimationGraphNode | undefined,
  portId: GraphPortId,
  direction: GraphPortDefinition["direction"],
) {
  if (!node) return undefined;
  return getAnimationGraphNodeDefinition(node.kind)
    ?.getPorts(node)
    .find((port) => port.id === portId && port.direction === direction);
}

export function getStrictGraphInputAlias(
  graph: AnimationGraph,
  node: AnimationGraphNode,
  portId: GraphPortId,
) {
  const base = toCamelIdentifier(getGraphNodeTypeName(node));
  const suffix =
    getTrailingIndex(node.id) ?? String(getSameKindNodeIndex(graph, node));
  return `${base}${suffix}${portId === "value" ? "" : toPascalIdentifier(portId)}`;
}

function getGraphNodeLabel(node: AnimationGraphNode) {
  const definition = getAnimationGraphNodeDefinition(node.kind);
  return definition?.label ?? node.kind;
}

function toCamelIdentifier(value: string) {
  const words = value
    .replace(/^value[:/-]/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const [first = "input", ...rest] = words;
  const name = [
    first.toLowerCase(),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  ].join("");
  return /^[A-Za-z]/.test(name) ? name : `input${name}`;
}

function toPascalIdentifier(value: string) {
  const camel = toCamelIdentifier(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function getGraphNodeTypeName(node: AnimationGraphNode) {
  return node.kind.split(":").pop() ?? node.kind;
}

function getTrailingIndex(value: string) {
  return value.match(/(\d+)$/)?.[1] ?? null;
}

function getSameKindNodeIndex(graph: AnimationGraph, node: AnimationGraphNode) {
  const ids = Object.values(graph.nodes)
    .filter((candidate) => candidate.kind === node.kind)
    .map((candidate) => candidate.id)
    .sort((a, b) => a.localeCompare(b));
  return Math.max(1, ids.indexOf(node.id) + 1);
}
