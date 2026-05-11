import type {
  AnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge,
  AnimationGraphNodeDefinition,
  GraphPortDefinition,
} from "./types";
import { validateAnimationGraphEdgePorts } from "./portCompatibility";
import { getAnimationGraphNodeDefinition } from "./registry";

export function validateAnimationGraph(graph: AnimationGraph) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const definitions = new Map<string, AnimationGraphNodeDefinition>();

  for (const node of Object.values(graph.nodes)) {
    const definition = getAnimationGraphNodeDefinition(node.kind);
    if (!definition) {
      diagnostics.push({
        severity: "error",
        message: `Unknown graph node kind "${node.kind}".`,
        nodeId: node.id,
      });
      continue;
    }
    definitions.set(node.id, definition);
  }

  validateExactNodeKind(
    graph,
    "source",
    "Graph must contain exactly one Source node.",
    diagnostics,
  );
  if (!Object.values(graph.nodes).some((node) => node.kind === "out")) {
    diagnostics.push({
      severity: "error",
      message: "Graph must contain at least one Out node.",
    });
  }

  const edgeIds = new Map<string, AnimationGraphEdge>();
  const edgeEndpoints = new Map<string, AnimationGraphEdge>();
  const singleInputConnections = new Map<string, AnimationGraphEdge>();

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      diagnostics.push({
        severity: "error",
        message: `Edge id "${edge.id}" must be unique.`,
        edgeId: edge.id,
      });
    } else {
      edgeIds.set(edge.id, edge);
    }

    const endpointKey = `${edge.from.nodeId}:${edge.from.portId}->${edge.to.nodeId}:${edge.to.portId}`;
    if (edgeEndpoints.has(endpointKey)) {
      diagnostics.push({
        severity: "error",
        message: "Graph already contains this exact connection.",
        edgeId: edge.id,
        nodeId: edge.to.nodeId,
        portId: edge.to.portId,
        outputId: edge.from.portId,
      });
    } else {
      edgeEndpoints.set(endpointKey, edge);
    }

    const fromNode = graph.nodes[edge.from.nodeId];
    const toNode = graph.nodes[edge.to.nodeId];
    if (!fromNode) {
      diagnostics.push({
        severity: "error",
        message: `Unknown from node "${edge.from.nodeId}".`,
        edgeId: edge.id,
      });
      continue;
    }
    if (!toNode) {
      diagnostics.push({
        severity: "error",
        message: `Unknown to node "${edge.to.nodeId}".`,
        edgeId: edge.id,
      });
      continue;
    }

    const fromPort = findPort(
      definitions.get(fromNode.id),
      fromNode,
      edge.from.portId,
      "output",
    );
    const toPort = findPort(
      definitions.get(toNode.id),
      toNode,
      edge.to.portId,
      "input",
    );

    diagnostics.push(
      ...validateAnimationGraphEdgePorts({ edge, fromPort, toPort }),
    );

    if (toPort?.cardinality === "single") {
      const key = `${edge.to.nodeId}:${edge.to.portId}`;
      if (singleInputConnections.has(key)) {
        diagnostics.push({
          severity: "error",
          message: `Input port "${edge.to.portId}" accepts one connection.`,
          edgeId: edge.id,
          nodeId: edge.to.nodeId,
          portId: edge.to.portId,
        });
      } else {
        singleInputConnections.set(key, edge);
      }
    }
  }

  return diagnostics;
}

function validateExactNodeKind(
  graph: AnimationGraph,
  kind: string,
  message: string,
  diagnostics: AnimationGraphDiagnostic[],
) {
  const nodes = Object.values(graph.nodes).filter((node) => node.kind === kind);
  if (nodes.length === 1) return;
  diagnostics.push({ severity: "error", message, nodeId: nodes[0]?.id });
}

function findPort(
  definition: AnimationGraphNodeDefinition | undefined,
  node: Parameters<AnimationGraphNodeDefinition["getPorts"]>[0],
  portId: string,
  direction: GraphPortDefinition["direction"],
) {
  return definition
    ?.getPorts(node)
    .find((port) => port.id === portId && port.direction === direction);
}
