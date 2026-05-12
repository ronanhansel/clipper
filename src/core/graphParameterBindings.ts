import { areGraphPortsCompatible } from "./animationGraph/portCompatibility";
import { getAnimationGraphNodeDefinition } from "./animationGraph/registry";
import type {
  AnimationGraph,
  AnimationGraphEdge,
  AnimationGraphNode,
  GraphPortDefinition,
  GraphPortId,
} from "./animationGraph/types";

export type GraphInputBindingOption = {
  alias: string;
  expression: string;
  label: string;
  nodeId: string;
  portId: string;
};

export function isGraphInputExpression(value: string) {
  return /^input\.[A-Za-z][A-Za-z0-9_]*$/.test(value.trim());
}

export function isPotentialGraphInputExpression(value: string) {
  return "input.".startsWith(value) || /^input\.[A-Za-z0-9_]*$/.test(value);
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
        const alias = getStableGraphInputAlias(graph, node, port.id);
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
  const edge = getStrictGraphInputBindingEdge(
    graph,
    targetNodeId,
    targetPortId,
  );
  if (!edge || !graph) return null;
  const source = graph.nodes[edge.from.nodeId];
  if (!source) return null;
  return `input.${getStableGraphInputAlias(graph, source, edge.from.portId)}`;
}

export function bindStrictGraphInputParameter(
  graph: AnimationGraph,
  targetNodeId: string,
  targetPortId: GraphPortId,
  expression: string,
): AnimationGraph {
  const alias = readGraphInputAlias(expression);
  if (!alias) return graph;
  const option = getStrictGraphInputBindingOptionsInternal(
    graph,
    targetNodeId,
    targetPortId,
    { connectedOnly: false },
  ).find((item) => item.alias === alias);
  if (!option) return graph;
  const targetPort = getNodePort(
    graph.nodes[targetNodeId],
    targetPortId,
    "input",
  );
  const edge: AnimationGraphEdge = {
    id: `${option.nodeId}:${option.portId}->${targetNodeId}:${targetPortId}`,
    from: { nodeId: option.nodeId, portId: option.portId },
    to: { nodeId: targetNodeId, portId: targetPortId },
  };
  return {
    ...graph,
    edges: [
      ...graph.edges.filter(
        (item) =>
          item.id !== edge.id &&
          !(
            targetPort?.cardinality !== "multi" &&
            item.to.nodeId === targetNodeId &&
            item.to.portId === targetPortId
          ),
      ),
      edge,
    ],
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
        !(edge.to.nodeId === targetNodeId && edge.to.portId === targetPortId),
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

function readGraphInputAlias(value: string) {
  return isGraphInputExpression(value)
    ? value.trim().slice("input.".length)
    : null;
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

function getStableGraphInputAlias(
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
