import { getAnimationGraphNodeDefinition } from "./registry";
import { validateAnimationGraph } from "./validation";
import type {
  AnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge,
  AnimationGraphMacro,
  AnimationGraphNode,
  GraphPortDefinition,
  GraphEdgeId,
  GraphNodeId,
  GraphPortId,
} from "./types";

export type AnimationGraphIdFactory = (prefix: string) => string;

export type CreateAnimationGraphOptions = {
  id?: string;
  sourceNodeId?: string;
  outNodeId?: string;
  idFactory?: AnimationGraphIdFactory;
  includeOut?: boolean;
};

export type AddGraphNodeOptions = {
  id?: GraphNodeId;
  position?: AnimationGraphNode["position"];
  config?: unknown;
};

export type ConnectGraphPortsOptions = {
  id?: GraphEdgeId;
};

export type CreateMacroFromSelectedNodesOptions = {
  macroId: string;
  label: string;
  selectedNodeIds: readonly GraphNodeId[];
  macroNodeId?: GraphNodeId;
  position?: AnimationGraphNode["position"];
};

export type GraphBuilderResult<T> = {
  graph: AnimationGraph;
  value: T;
  diagnostics: AnimationGraphDiagnostic[];
};

export function createDeterministicGraphIdFactory(seed = "graph") {
  let next = 1;
  return (prefix: string) => `${seed}:${prefix}:${next++}`;
}

export function createAnimationGraph(
  sourceObjectId: string,
  options: CreateAnimationGraphOptions = {},
): AnimationGraph {
  const idFactory = options.idFactory ?? createDeterministicGraphIdFactory();
  const graph: AnimationGraph = {
    id: options.id ?? idFactory("graph"),
    sourceObjectId,
    nodes: {},
    edges: [],
  };

  addGraphNode(graph, "source", {
    id: options.sourceNodeId ?? "source",
    position: { x: 0, y: 0 },
    config: { objectId: sourceObjectId },
  });

  if (options.includeOut ?? true) {
    addGraphNode(graph, "out", {
      id: options.outNodeId ?? "out",
      position: { x: 720, y: 0 },
    });
  }

  return graph;
}

export function addGraphNode(
  graph: AnimationGraph,
  kind: string,
  options: AddGraphNodeOptions = {},
): GraphBuilderResult<AnimationGraphNode> {
  const definition = getAnimationGraphNodeDefinition(kind);
  const id =
    options.id ??
    createUniqueId(graph.nodes, kind.replace(/[^a-z0-9]+/gi, "-"));
  const baseConfig =
    options.config ??
    definition?.createDefaultConfig({
      graphId: graph.id,
      sourceObjectId: graph.sourceObjectId,
    });
  const node: AnimationGraphNode = {
    id,
    kind,
    position: options.position ?? { x: 0, y: 0 },
    config: definition?.normalizeConfig(baseConfig) ?? baseConfig ?? {},
  };

  graph.nodes[id] = node;
  return { graph, value: node, diagnostics: validateAnimationGraph(graph) };
}

export function addGraphEffectNode(
  graph: AnimationGraph,
  effectPackageId: string,
  options: AddGraphNodeOptions = {},
) {
  return addGraphNode(graph, `effect:${effectPackageId}`, options);
}

export function addGraphValueNode(
  graph: AnimationGraph,
  valueKind: string,
  options: AddGraphNodeOptions = {},
) {
  return addGraphNode(
    graph,
    valueKind.startsWith("value:") ? valueKind : `value:${valueKind}`,
    options,
  );
}

export function addGraphMacro(
  graph: AnimationGraph,
  macro: AnimationGraphMacro,
) {
  graph.macros = { ...(graph.macros ?? {}), [macro.id]: macro };
  return { graph, value: macro, diagnostics: validateAnimationGraph(graph) };
}

export function addGraphMacroNode(
  graph: AnimationGraph,
  macroId: string,
  options: AddGraphNodeOptions = {},
) {
  const macro = graph.macros?.[macroId];
  return addGraphNode(graph, "macro", {
    ...options,
    config: {
      macroId,
      ports: macro?.ports ?? [],
      defaults: macro?.defaults,
      ...(typeof options.config === "object" && options.config !== null
        ? options.config
        : {}),
    },
  });
}

export function createMacroFromSelectedNodes(
  graph: AnimationGraph,
  options: CreateMacroFromSelectedNodesOptions,
): GraphBuilderResult<AnimationGraphNode | null> {
  const selected = new Set(options.selectedNodeIds);
  const diagnostics: AnimationGraphDiagnostic[] = [];
  if (!selected.size)
    diagnostics.push({
      severity: "error",
      message: "Macro selection is empty.",
    });
  for (const nodeId of selected) {
    const node = graph.nodes[nodeId];
    if (!node) {
      diagnostics.push({
        severity: "error",
        message: `Unknown selected node "${nodeId}".`,
        nodeId,
      });
      continue;
    }
    if (node.kind === "source" || node.kind === "out" || node.kind === "macro")
      diagnostics.push({
        severity: "error",
        message: `Node "${nodeId}" cannot become a macro boundary.`,
        nodeId,
      });
  }

  const innerEdges = graph.edges.filter(
    (edge) => selected.has(edge.from.nodeId) && selected.has(edge.to.nodeId),
  );
  const incomingEdges = graph.edges.filter(
    (edge) => !selected.has(edge.from.nodeId) && selected.has(edge.to.nodeId),
  );
  const outgoingEdges = graph.edges.filter(
    (edge) => selected.has(edge.from.nodeId) && !selected.has(edge.to.nodeId),
  );
  const ports: GraphPortDefinition[] = [];
  const inputBoundaryByTarget = new Map<string, GraphPortId>();
  const outputBoundaryBySource = new Map<string, GraphPortId>();

  for (const edge of incomingEdges) {
    const fromPort = getNodePort(
      graph.nodes[edge.from.nodeId],
      edge.from.portId,
      "output",
    );
    const toPort = getNodePort(
      graph.nodes[edge.to.nodeId],
      edge.to.portId,
      "input",
    );
    if (!fromPort) {
      diagnostics.push({
        severity: "error",
        message: `Selected macro input boundary cannot represent missing port "${edge.from.portId}".`,
        edgeId: edge.id,
        nodeId: edge.from.nodeId,
        portId: edge.from.portId,
      });
      continue;
    }
    if (!toPort) {
      diagnostics.push({
        severity: "error",
        message: `Selected macro input boundary cannot represent missing port "${edge.to.portId}".`,
        edgeId: edge.id,
        nodeId: edge.to.nodeId,
        portId: edge.to.portId,
      });
      continue;
    }
    const key = `${edge.to.nodeId}:${edge.to.portId}`;
    const portId = inputBoundaryByTarget.get(key) ?? `in:${ports.length}`;
    if (!inputBoundaryByTarget.has(key)) {
      inputBoundaryByTarget.set(key, portId);
      ports.push({ ...toPort, id: portId, role: "macro-input" });
    }
  }

  for (const edge of outgoingEdges) {
    const fromPort = getNodePort(
      graph.nodes[edge.from.nodeId],
      edge.from.portId,
      "output",
    );
    const toPort = getNodePort(
      graph.nodes[edge.to.nodeId],
      edge.to.portId,
      "input",
    );
    if (!fromPort) {
      diagnostics.push({
        severity: "error",
        message: `Selected macro output boundary cannot represent missing port "${edge.from.portId}".`,
        edgeId: edge.id,
        nodeId: edge.from.nodeId,
        portId: edge.from.portId,
      });
      continue;
    }
    if (!toPort) {
      diagnostics.push({
        severity: "error",
        message: `Selected macro output boundary cannot represent missing port "${edge.to.portId}".`,
        edgeId: edge.id,
        nodeId: edge.to.nodeId,
        portId: edge.to.portId,
      });
      continue;
    }
    const key = `${edge.from.nodeId}:${edge.from.portId}`;
    const portId = outputBoundaryBySource.get(key) ?? `out:${ports.length}`;
    if (!outputBoundaryBySource.has(key)) {
      outputBoundaryBySource.set(key, portId);
      ports.push({ ...fromPort, id: portId, role: "macro-output" });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return { graph, value: null, diagnostics };

  const macroNodeId =
    options.macroNodeId ?? createUniqueId(graph.nodes, "macro");
  const macroNodes: AnimationGraph["nodes"] = {};
  for (const nodeId of selected) macroNodes[nodeId] = graph.nodes[nodeId];
  const macroEdges: AnimationGraphEdge[] = [...innerEdges];

  for (const [targetKey, portId] of inputBoundaryByTarget) {
    const boundaryId = `macroInput:${portId}`;
    const [nodeId, targetPortId] = targetKey.split(":");
    macroNodes[boundaryId] = {
      id: boundaryId,
      kind: "macroInput",
      position: { x: 0, y: 0 },
      config: { portId },
    };
    macroEdges.push({
      id: `${boundaryId}:in->${nodeId}:${targetPortId}`,
      from: { nodeId: boundaryId, portId: "in" },
      to: { nodeId, portId: targetPortId },
    });
  }
  for (const [sourceKey, portId] of outputBoundaryBySource) {
    const boundaryId = `macroOutput:${portId}`;
    const [nodeId, sourcePortId] = sourceKey.split(":");
    macroNodes[boundaryId] = {
      id: boundaryId,
      kind: "macroOutput",
      position: { x: 720, y: 0 },
      config: { portId },
    };
    macroEdges.push({
      id: `${nodeId}:${sourcePortId}->${boundaryId}:in`,
      from: { nodeId, portId: sourcePortId },
      to: { nodeId: boundaryId, portId: "in" },
    });
  }

  for (const nodeId of selected) delete graph.nodes[nodeId];
  graph.nodes[macroNodeId] = {
    id: macroNodeId,
    kind: "macro",
    position: options.position ?? { x: 0, y: 0 },
    config: { macroId: options.macroId, ports },
  };
  graph.macros = {
    ...(graph.macros ?? {}),
    [options.macroId]: {
      id: options.macroId,
      label: options.label,
      ports,
      nodes: macroNodes,
      edges: macroEdges,
    },
  };
  graph.edges = graph.edges
    .filter(
      (edge) =>
        !selected.has(edge.from.nodeId) && !selected.has(edge.to.nodeId),
    )
    .concat(
      incomingEdges.map((edge) => ({
        ...edge,
        to: {
          nodeId: macroNodeId,
          portId: inputBoundaryByTarget.get(
            `${edge.to.nodeId}:${edge.to.portId}`,
          )!,
        },
      })),
      outgoingEdges.map((edge) => ({
        ...edge,
        from: {
          nodeId: macroNodeId,
          portId: outputBoundaryBySource.get(
            `${edge.from.nodeId}:${edge.from.portId}`,
          )!,
        },
      })),
    );

  return {
    graph,
    value: graph.nodes[macroNodeId],
    diagnostics: validateAnimationGraph(graph),
  };
}

export function connectGraphPorts(
  graph: AnimationGraph,
  from: { nodeId: GraphNodeId; portId: GraphPortId },
  to: { nodeId: GraphNodeId; portId: GraphPortId },
  options: ConnectGraphPortsOptions = {},
): GraphBuilderResult<AnimationGraphEdge | null> {
  const edge: AnimationGraphEdge = {
    id:
      options.id ?? `${from.nodeId}:${from.portId}->${to.nodeId}:${to.portId}`,
    from,
    to,
  };
  const nextEdges = [...graph.edges, edge];
  const diagnostics = validateAnimationGraph({ ...graph, edges: nextEdges });
  const edgeErrors = diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === "error" && diagnostic.edgeId === edge.id,
  );
  if (edgeErrors.length) return { graph, value: null, diagnostics };
  graph.edges = nextEdges;
  return { graph, value: edge, diagnostics };
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

export function setGraphNodeConfig(
  graph: AnimationGraph,
  nodeId: GraphNodeId,
  config: unknown,
): GraphBuilderResult<AnimationGraphNode | null> {
  const node = graph.nodes[nodeId];
  if (!node) {
    return {
      graph,
      value: null,
      diagnostics: [
        { severity: "error", message: `Unknown node "${nodeId}".`, nodeId },
      ],
    };
  }
  const definition = getAnimationGraphNodeDefinition(node.kind);
  node.config = definition?.normalizeConfig(config) ?? config;
  const diagnostics = validateAnimationGraph(graph);
  return { graph, value: node, diagnostics };
}

export function removeGraphNode(
  graph: AnimationGraph,
  nodeId: GraphNodeId,
): GraphBuilderResult<AnimationGraphNode | null> {
  const node = graph.nodes[nodeId];
  if (!node) {
    return {
      graph,
      value: null,
      diagnostics: [
        { severity: "error", message: `Unknown node "${nodeId}".`, nodeId },
      ],
    };
  }
  delete graph.nodes[nodeId];
  graph.edges = graph.edges.filter(
    (edge) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId,
  );
  return { graph, value: node, diagnostics: validateAnimationGraph(graph) };
}

export function removeGraphEdge(
  graph: AnimationGraph,
  edgeId: GraphEdgeId,
): GraphBuilderResult<AnimationGraphEdge | null> {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId) ?? null;
  if (!edge) {
    return {
      graph,
      value: null,
      diagnostics: [
        { severity: "error", message: `Unknown edge "${edgeId}".`, edgeId },
      ],
    };
  }
  graph.edges = graph.edges.filter((candidate) => candidate.id !== edgeId);
  return { graph, value: edge, diagnostics: validateAnimationGraph(graph) };
}

function createUniqueId(existing: Record<string, unknown>, prefix: string) {
  let index = 1;
  let id = prefix || "node";
  while (Object.prototype.hasOwnProperty.call(existing, id))
    id = `${prefix}-${index++}`;
  return id;
}
