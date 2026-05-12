import { getAnimationGraphNodeDefinition } from "./registry";
import { validateAnimationGraph } from "./validation";
import { getGraphEffectRuntimeAdapter } from "../effects/registry";
import {
  evaluateGraphInputExpression,
  getStrictGraphInputAlias,
  isGraphInputExpression,
} from "../graphParameterBindings";
import { isValueStream } from "./builtins/helpers";
import type {
  AnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge as StrictAnimationGraphEdge,
  AnimationGraphExecutionTrace,
  AnimationGraphProgram,
  AnimationGraphStreamTrace,
  AnimationGraphNode,
  AnimationGraphMacroNodeConfig,
  AnimationStream,
  EffectInstruction,
  GraphOperationKind,
  GraphPortId,
  GraphStream,
  GeneratedGeometry,
  ValueStream,
} from "./types";
import type { FrameObject, LayerAnimation } from "../types";

type CompileResult = {
  streams: AnimationStream[];
  animations: LayerAnimation[];
  generatedGeometry: GeneratedGeometry[];
  generatedObjects: FrameObject[];
  diagnostics: AnimationGraphDiagnostic[];
  program?: AnimationGraphProgram;
  trace?: AnimationGraphExecutionTrace;
};

export type AnimationGraphObjectCompileResult = CompileResult;

export type AnimationGraphCompileOptions = {
  sourceObject?: FrameObject;
  trace?: boolean;
  time?: number;
  frame?: number;
};

export type AnimationGraphRuntimePlan = {
  graph: AnimationGraph;
  sourceObject?: FrameObject;
  program: AnimationGraphProgram;
  diagnostics: AnimationGraphDiagnostic[];
};

export type AnimationGraphRuntimeEvaluationInput = {
  time: number;
  frame: number;
};

type PortKey = `${string}:${string}`;

export function compileAnimationGraph(
  graph: AnimationGraph,
  options: AnimationGraphCompileOptions = {},
): CompileResult {
  const program = planAnimationGraphProgram(graph);
  return executeAnimationGraphProgram(graph, program, options);
}

export function createAnimationGraphRuntimePlan(
  graph: AnimationGraph,
  sourceObject?: FrameObject,
): AnimationGraphRuntimePlan {
  const program = planAnimationGraphProgram(graph);
  return {
    graph,
    sourceObject,
    program,
    diagnostics: program.diagnostics,
  };
}

export function evaluateAnimationGraphRuntime(
  plan: AnimationGraphRuntimePlan,
  input: AnimationGraphRuntimeEvaluationInput,
): CompileResult {
  return executeAnimationGraphProgram(plan.graph, plan.program, {
    sourceObject: plan.sourceObject,
    time: input.time,
    frame: input.frame,
  });
}

function executeAnimationGraphProgram(
  graph: AnimationGraph,
  program: AnimationGraphProgram,
  options: AnimationGraphCompileOptions = {},
): CompileResult {
  const diagnostics = [...program.diagnostics];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      streams: [],
      animations: [],
      generatedGeometry: [],
      generatedObjects: [],
      diagnostics,
      program,
    };
  }

  const incoming = new Map<PortKey, GraphStream[]>();
  const plannedEdges = graph.edges.filter((edge) =>
    program.edgeIds.includes(edge.id),
  );
  const outgoing = groupEdgesByOutput(plannedEdges);
  const incomingEdgeStreams = new Map<string, GraphStream[]>();
  const traceEvents: AnimationGraphExecutionTrace["events"] = [];
  const source = Object.values(graph.nodes).find(
    (node) => node.kind === "source",
  );
  const outStreams: AnimationStream[] = [];
  if (!source)
    return {
      streams: [],
      animations: [],
      generatedGeometry: [],
      generatedObjects: [],
      diagnostics,
      program,
    };
  diagnostics.push(...diagnoseUnplannedBranches(graph, program.edgeIds));

  const executeNode = (node: AnimationGraphNode) => {
    if (node.kind === "macro") {
      const definition = getAnimationGraphNodeDefinition(node.kind);
      if (!definition) return;
      const inputs = new Map<GraphPortId, readonly GraphStream[]>();
      for (const port of definition.getPorts(node)) {
        if (port.direction === "input")
          inputs.set(port.id, incoming.get(portKey(node.id, port.id)) ?? []);
      }
      const result = executeMacroNode(
        graph,
        node,
        inputs,
        options,
        diagnostics,
      );
      if (options.trace)
        traceEvents.push({
          type: "node",
          nodeId: node.id,
          nodeKind: node.kind,
          inputs: summarizePortStreams(inputs),
          outputs: summarizePortStreams(result),
        });
      for (const edge of outgoing.get(node.id) ?? []) {
        const streams = result.get(edge.from.portId) ?? [];
        if (!streams.length) continue;
        const key = portKey(edge.to.nodeId, edge.to.portId);
        incomingEdgeStreams.set(edge.id, [...streams]);
        incoming.set(key, [...(incoming.get(key) ?? []), ...streams]);
      }
      return;
    }

    const definition = getAnimationGraphNodeDefinition(node.kind);
    if (!definition) return;
    const inputs = new Map<GraphPortId, readonly GraphStream[]>();
    for (const port of definition.getPorts(node)) {
      if (port.direction === "input")
        inputs.set(port.id, incoming.get(portKey(node.id, port.id)) ?? []);
    }
    if (node.kind === "out")
      inputs.set(
        "in",
        getOrderedOutStreams(node, plannedEdges, incomingEdgeStreams, incoming),
      );
    const resolvedInputs = resolveGraphInputExpressions(
      graph,
      node,
      inputs,
      plannedEdges,
      incomingEdgeStreams,
    );
    const connectedOutputPorts = new Set(
      (outgoing.get(node.id) ?? []).map((edge) => edge.from.portId),
    );
    const result = definition.execute(
      { node, inputs: resolvedInputs },
      {
        graph,
        sourceObject: options.sourceObject,
        connectedOutputPorts,
        time: options.time,
        frame: options.frame,
      },
    );
    diagnostics.push(...(result.diagnostics ?? []));
    diagnostics.push(
      ...diagnoseDroppedOutputs(node, result.outputs, connectedOutputPorts),
    );
    if (options.trace)
      traceEvents.push({
        type: "node",
        nodeId: node.id,
        nodeKind: node.kind,
        inputs: summarizePortStreams(inputs),
        outputs: summarizePortStreams(result.outputs),
      });

    if (node.kind === "out") {
      outStreams.push(
        ...(result.outputs.get("out") ?? []).filter(isAnimationStream),
      );
      return;
    }

    for (const edge of outgoing.get(node.id) ?? []) {
      const streams = result.outputs.get(edge.from.portId) ?? [];
      if (!streams.length) continue;
      const key = portKey(edge.to.nodeId, edge.to.portId);
      incomingEdgeStreams.set(edge.id, [...streams]);
      incoming.set(key, [...(incoming.get(key) ?? []), ...streams]);
      if (options.trace)
        traceEvents.push({
          type: "edge",
          edgeId: edge.id,
          from: edge.from,
          to: edge.to,
          streams: streams.map(summarizeStream),
        });
    }
  };

  for (const nodeId of program.nodeIds) {
    const node = graph.nodes[nodeId];
    if (node) executeNode(node);
  }

  return {
    streams: outStreams,
    animations: compileStreamsToLayerAnimations(
      outStreams.filter((stream) => !stream.renderObject),
      diagnostics,
    ),
    generatedGeometry: compileStreamsToGeneratedGeometry(
      outStreams.filter((stream) => !stream.renderObject),
    ),
    generatedObjects: compileStreamsToGeneratedObjects(outStreams, diagnostics),
    diagnostics,
    program,
    ...(options.trace ? { trace: { events: traceEvents } } : {}),
  };
}

function executeMacroNode(
  parentGraph: AnimationGraph,
  node: AnimationGraphNode,
  inputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>,
  options: AnimationGraphCompileOptions,
  diagnostics: AnimationGraphDiagnostic[],
) {
  const config = node.config as AnimationGraphMacroNodeConfig;
  const macro = parentGraph.macros?.[config.macroId];
  const outputs = new Map<GraphPortId, GraphStream[]>();
  if (!macro) {
    diagnostics.push({
      severity: "error",
      message: `Unknown graph macro "${config.macroId}".`,
      nodeId: node.id,
      macroId: config.macroId,
    });
    return outputs;
  }

  const macroInputNodes = Object.values(macro.nodes).filter(
    (candidate) => candidate.kind === "macroInput",
  );
  const macroOutputNodes = Object.values(macro.nodes).filter(
    (candidate) => candidate.kind === "macroOutput",
  );
  const incoming = new Map<PortKey, GraphStream[]>();
  const outgoing = groupEdgesByOutput(macro.edges);

  for (const inputNode of macroInputNodes) {
    const externalPortId = readExternalPortId(inputNode.config);
    const provided = inputs.get(externalPortId) ?? [];
    const defaults = createDefaultValueStream(
      node.id,
      externalPortId,
      config.defaults?.[externalPortId] ?? macro.defaults?.[externalPortId],
      config.ports.find((port) => port.id === externalPortId),
    );
    incoming.set(portKey(inputNode.id, "in"), [...provided, ...defaults]);
  }

  const subGraph: AnimationGraph = {
    id: `${parentGraph.id}:${node.id}:${macro.id}`,
    sourceObjectId: parentGraph.sourceObjectId,
    nodes: macro.nodes,
    edges: macro.edges,
    macros: parentGraph.macros,
  };
  const macroDiagnostics = validateMacroGraph(macro, node.id);
  diagnostics.push(...macroDiagnostics);
  if (macroDiagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return outputs;
  const allNodeIds = new Set(Object.keys(macro.nodes));
  const allEdgeIds = new Set(macro.edges.map((edge) => edge.id));
  const orderedNodes = topoPlannedNodes(subGraph, allNodeIds, allEdgeIds);

  for (const innerNode of orderedNodes) {
    if (innerNode.kind === "macroInput") {
      const externalPortId = readExternalPortId(innerNode.config);
      const streams = incoming.get(portKey(innerNode.id, "in")) ?? [];
      for (const edge of outgoing.get(innerNode.id) ?? []) {
        incoming.set(portKey(edge.to.nodeId, edge.to.portId), [
          ...(incoming.get(portKey(edge.to.nodeId, edge.to.portId)) ?? []),
          ...streams,
        ]);
      }
      continue;
    }
    if (innerNode.kind === "macroOutput") {
      const externalPortId = readExternalPortId(innerNode.config);
      outputs.set(externalPortId, [
        ...(outputs.get(externalPortId) ?? []),
        ...(incoming.get(portKey(innerNode.id, "in")) ?? []),
      ]);
      continue;
    }
    const definition = getAnimationGraphNodeDefinition(innerNode.kind);
    if (!definition) continue;
    const nodeInputs = new Map<GraphPortId, readonly GraphStream[]>();
    for (const port of definition.getPorts(innerNode)) {
      if (port.direction === "input")
        nodeInputs.set(
          port.id,
          incoming.get(portKey(innerNode.id, port.id)) ?? [],
        );
    }
    const result = definition.execute(
      { node: innerNode, inputs: nodeInputs },
      {
        graph: subGraph,
        sourceObject: options.sourceObject,
        time: options.time,
        frame: options.frame,
      },
    );
    diagnostics.push(...(result.diagnostics ?? []));
    for (const edge of outgoing.get(innerNode.id) ?? []) {
      const streams = result.outputs.get(edge.from.portId) ?? [];
      incoming.set(portKey(edge.to.nodeId, edge.to.portId), [
        ...(incoming.get(portKey(edge.to.nodeId, edge.to.portId)) ?? []),
        ...streams,
      ]);
    }
  }

  return outputs;
}

function resolveGraphInputExpressions(
  graph: AnimationGraph,
  node: AnimationGraphNode,
  inputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>,
  edges: readonly StrictAnimationGraphEdge[],
  incomingEdgeStreams: ReadonlyMap<string, readonly GraphStream[]>,
) {
  const resolved = new Map<GraphPortId, readonly GraphStream[]>(inputs);
  for (const [portId, streams] of inputs) {
    const expression = readNodeConfigValue(node, portId);
    if (typeof expression !== "string" || !isGraphInputExpression(expression))
      continue;
    const valueStreams = [
      ...streams.filter(isValueStream),
      ...getAliasedInputValueStreams(
        graph,
        node.id,
        edges,
        incomingEdgeStreams,
      ),
    ];
    const evaluated = evaluateGraphInputExpression(expression, valueStreams);
    if (evaluated) resolved.set(portId, [evaluated]);
  }
  return resolved;
}

function getAliasedInputValueStreams(
  graph: AnimationGraph,
  nodeId: string,
  edges: readonly StrictAnimationGraphEdge[],
  incomingEdgeStreams: ReadonlyMap<string, readonly GraphStream[]>,
) {
  return edges
    .filter((edge) => edge.to.nodeId === nodeId)
    .flatMap((edge) => {
      const source = graph.nodes[edge.from.nodeId];
      if (!source) return [];
      const alias = getStrictGraphInputAlias(graph, source, edge.from.portId);
      return (incomingEdgeStreams.get(edge.id) ?? [])
        .filter(isValueStream)
        .map((stream) => ({ ...stream, id: `input.${alias}:${stream.id}` }));
    });
}

function readNodeConfigValue(node: AnimationGraphNode, key: string) {
  const config = node.config;
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

function validateMacroGraph(
  macro: NonNullable<AnimationGraph["macros"]>[string],
  macroNodeId: string,
) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const cycleNodeId = findCycleNodeId({
    id: macro.id,
    sourceObjectId: "",
    nodes: macro.nodes,
    edges: macro.edges,
  });
  if (cycleNodeId)
    diagnostics.push({
      severity: "error",
      message: "Graph macro must not contain cycles.",
      nodeId: `${macroNodeId}/${cycleNodeId}`,
      macroId: macro.id,
    });
  for (const edge of macro.edges) {
    if (!macro.nodes[edge.from.nodeId])
      diagnostics.push({
        severity: "error",
        message: `Unknown macro from node "${edge.from.nodeId}".`,
        nodeId: macroNodeId,
        edgeId: `${macroNodeId}/${edge.id}`,
        macroId: macro.id,
      });
    if (!macro.nodes[edge.to.nodeId])
      diagnostics.push({
        severity: "error",
        message: `Unknown macro to node "${edge.to.nodeId}".`,
        nodeId: macroNodeId,
        edgeId: `${macroNodeId}/${edge.id}`,
        macroId: macro.id,
      });
  }
  for (const innerNode of Object.values(macro.nodes)) {
    if (innerNode.kind === "macroInput" || innerNode.kind === "macroOutput")
      continue;
    if (!getAnimationGraphNodeDefinition(innerNode.kind))
      diagnostics.push({
        severity: "error",
        message: `Unknown graph node kind "${innerNode.kind}" in macro "${macro.id}".`,
        nodeId: `${macroNodeId}/${innerNode.id}`,
        macroId: macro.id,
      });
  }
  return diagnostics;
}

function readExternalPortId(config: unknown) {
  return typeof config === "object" &&
    config !== null &&
    typeof (config as { portId?: unknown }).portId === "string"
    ? (config as { portId: string }).portId
    : "in";
}

function createDefaultValueStream(
  nodeId: string,
  portId: string,
  value: unknown,
  port: { type: { kind: string; valueType?: string } } | undefined,
): GraphStream[] {
  if (
    value === undefined ||
    port?.type.kind !== "value" ||
    !port.type.valueType
  )
    return [];
  return [
    {
      id: `${nodeId}:${portId}:default`,
      valueType: port.type.valueType as never,
      value,
    },
  ];
}

export function planAnimationGraphProgram(
  graph: AnimationGraph,
): AnimationGraphProgram {
  const diagnostics = [...validateAnimationGraph(graph)];
  const outNodes = Object.values(graph.nodes).filter(
    (node) => node.kind === "out",
  );
  const requiredEdgeIds = new Set<string>();
  const requiredNodeIds = new Set(outNodes.map((node) => node.id));
  const incomingByInput = groupEdgesByInput(graph.edges);
  const stack = outNodes.flatMap(
    (node) => incomingByInput.get(portKey(node.id, "in")) ?? [],
  );

  while (stack.length) {
    const edge = stack.pop()!;
    if (requiredEdgeIds.has(edge.id)) continue;
    requiredEdgeIds.add(edge.id);
    requiredNodeIds.add(edge.from.nodeId);
    requiredNodeIds.add(edge.to.nodeId);
    const producer = graph.nodes[edge.from.nodeId];
    const definition = producer
      ? getAnimationGraphNodeDefinition(producer.kind)
      : undefined;
    if (!producer || !definition) continue;
    for (const port of definition.getPorts(producer)) {
      if (port.direction !== "input") continue;
      const dependencies =
        incomingByInput.get(portKey(producer.id, port.id)) ?? [];
      if (!dependencies.length && isRequiredInputPort(port.id, producer.kind))
        diagnostics.push({
          severity: "error",
          message: `Required input port "${port.id}" is disconnected.`,
          nodeId: producer.id,
          portId: port.id,
        });
      stack.push(...dependencies);
    }
  }

  const cycleDiagnostics = validateReachabilityAndCycles(
    graph,
    requiredEdgeIds,
  );
  diagnostics.push(...cycleDiagnostics);
  if (cycleDiagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return {
      operations: [],
      nodeIds: [],
      edgeIds: [],
      outNodeIds: outNodes.map((node) => node.id),
      diagnostics,
    };

  const orderedNodes = topoPlannedNodes(
    graph,
    requiredNodeIds,
    requiredEdgeIds,
  );
  const requiredEdges = graph.edges.filter((edge) =>
    requiredEdgeIds.has(edge.id),
  );
  return {
    operations: orderedNodes.map((node) => ({
      id: `op:${node.id}`,
      kind: operationKindForNode(node.kind),
      nodeId: node.id,
      nodeKind: node.kind,
      inputEdges: requiredEdges
        .filter((edge) => edge.to.nodeId === node.id)
        .map((edge) => edge.id),
      outputEdges: requiredEdges
        .filter((edge) => edge.from.nodeId === node.id)
        .map((edge) => edge.id),
    })),
    nodeIds: orderedNodes.map((node) => node.id),
    edgeIds: requiredEdges.map((edge) => edge.id),
    outNodeIds: outNodes.map((node) => node.id),
    diagnostics,
  };
}

export function compileAnimationGraphForObject(
  object: FrameObject,
  graph: AnimationGraph,
  options: Omit<AnimationGraphCompileOptions, "sourceObject"> = {},
): AnimationGraphObjectCompileResult {
  if (graph.sourceObjectId !== object.id)
    return {
      streams: [],
      animations: [],
      generatedGeometry: [],
      generatedObjects: [],
      diagnostics: [],
    };
  return compileAnimationGraph(graph, { ...options, sourceObject: object });
}

export function isAnimationGraphObjectConnectedToOut(
  objectId: string,
  graph: AnimationGraph,
) {
  const sourceNodeId = Object.values(graph.nodes).find(
    (node) => node.kind === "source",
  )?.id;
  const outNodeId = Object.values(graph.nodes).find(
    (node) => node.kind === "out",
  )?.id;
  if (graph.sourceObjectId !== objectId || !sourceNodeId || !outNodeId)
    return true;
  return strictReaches(sourceNodeId, outNodeId, graph.edges);
}

function compileStreamsToLayerAnimations(
  streams: AnimationStream[],
  diagnostics: AnimationGraphDiagnostic[],
) {
  const animations: LayerAnimation[] = [];
  const seen = new Set<string>();
  for (const stream of streams) {
    for (const effect of stream.effects) {
      const runtime = effectInstructionToRuntime(effect, diagnostics);
      if (!runtime) continue;
      const signature = JSON.stringify({ effect, target: effect.target });
      if (seen.has(signature)) continue;
      seen.add(signature);
      animations.push({
        id: `graph:${effect.id}`,
        name: effect.effectId,
        keyframes: runtime.keyframes,
        options: controllerToOptions(effect.controller, effect.target),
      });
    }
  }
  return animations;
}

function compileStreamsToGeneratedGeometry(streams: AnimationStream[]) {
  return streams.flatMap((stream) =>
    stream.structure.kind === "geometry" ? [stream.structure.geometry] : [],
  );
}

function compileStreamsToGeneratedObjects(
  streams: AnimationStream[],
  diagnostics: AnimationGraphDiagnostic[],
) {
  const seen = new Set<string>();
  return streams.flatMap((stream) => {
    if (!stream.renderObject || seen.has(stream.renderObject.id)) return [];
    seen.add(stream.renderObject.id);
    const geometry =
      stream.structure.kind === "geometry" ? stream.structure.geometry : null;
    const bounds =
      stream.structure.kind === "geometry"
        ? stream.structure.bounds
        : stream.renderObject.bounds;
    return [
      {
        ...stream.renderObject,
        bounds,
        animations: [
          ...(stream.renderObject.animations ?? []).filter(
            (animation) => !animation.id.startsWith("graph:"),
          ),
          ...compileStreamsToLayerAnimations([stream], diagnostics),
        ],
        generatedGeometry: geometry
          ? [geometry]
          : stream.renderObject.generatedGeometry,
        generatedByGraph: true,
      },
    ];
  });
}

function getOrderedOutStreams(
  node: AnimationGraphNode,
  edges: StrictAnimationGraphEdge[],
  incomingEdgeStreams: ReadonlyMap<string, readonly GraphStream[]>,
  incoming: ReadonlyMap<PortKey, readonly GraphStream[]>,
) {
  const inputEdges = edges.filter(
    (edge) => edge.to.nodeId === node.id && edge.to.portId === "in",
  );
  const configured = readOutRenderOrder(node.config);
  const byId = new Map(inputEdges.map((edge) => [edge.id, edge]));
  const orderedEdges = [
    ...configured.flatMap((edgeId) => {
      const edge = byId.get(edgeId);
      if (!edge) return [];
      byId.delete(edgeId);
      return [edge];
    }),
    ...inputEdges.filter((edge) => byId.has(edge.id)),
  ];
  const streams = orderedEdges.flatMap((edge) => [
    ...(incomingEdgeStreams.get(edge.id) ?? []),
  ]);
  return streams.length
    ? streams
    : (incoming.get(portKey(node.id, "in")) ?? []);
}

function readOutRenderOrder(config: unknown) {
  if (typeof config !== "object" || config === null) return [];
  const order = (config as { renderOrder?: unknown }).renderOrder;
  return Array.isArray(order)
    ? order.filter((item): item is string => typeof item === "string")
    : [];
}

function effectInstructionToRuntime(
  effect: EffectInstruction,
  diagnostics: AnimationGraphDiagnostic[],
): Pick<LayerAnimation, "keyframes"> | null {
  const runtimeAdapter = getGraphEffectRuntimeAdapter(effect.effectId);
  const runtime = runtimeAdapter?.({
    effect,
    controller: effect.controller,
    target: effect.target,
  });
  if (runtime)
    return effect.controller.timeDriven
      ? runtime
      : collapseRuntimeToStaticKeyframes(runtime);
  diagnostics.push({
    severity: "warning",
    message: `Effect package "${effect.effectId}" does not provide a graph runtime adapter for LayerAnimation compatibility.`,
    outputId: effect.id,
  });
  return null;
}

function collapseRuntimeToStaticKeyframes(
  runtime: Pick<LayerAnimation, "keyframes">,
): Pick<LayerAnimation, "keyframes"> {
  const keyframes = Object.fromEntries(
    Object.entries(runtime.keyframes).map(([key, values]) => {
      if (!Array.isArray(values) || values.length === 0) return [key, values];
      const last = values[values.length - 1];
      return [key, [last, last]];
    }),
  );
  return { keyframes: keyframes as LayerAnimation["keyframes"] };
}

function controllerToOptions(
  controller: AnimationStream["controller"],
  structure: AnimationStream["structure"],
): LayerAnimation["options"] {
  return {
    delay:
      controller.schedule === "absolute"
        ? controller.delay
        : controller.start + controller.delay,
    duration: controller.duration,
    ease: controller.ease,
    type: "tween",
    repeat:
      typeof controller.repeat?.count === "number"
        ? controller.repeat.count
        : undefined,
    repeatType: controller.repeat?.mode,
    split:
      structure.kind === "richText"
        ? {
            mode: "word",
            stagger: controller.stagger?.amount ?? 0,
            tokenIndexes: structure.tokenIndexes,
          }
        : undefined,
  };
}

function validateReachabilityAndCycles(
  graph: AnimationGraph,
  edgeIds?: ReadonlySet<string>,
) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const cycleNodeId = findCycleNodeId(
    edgeIds
      ? {
          ...graph,
          edges: graph.edges.filter((edge) => edgeIds.has(edge.id)),
        }
      : graph,
  );
  if (cycleNodeId)
    diagnostics.push({
      severity: "error",
      message: "Graph must not contain cycles.",
      nodeId: cycleNodeId,
    });
  return diagnostics;
}

function diagnoseUnplannedBranches(
  graph: AnimationGraph,
  plannedEdgeIds: readonly string[],
) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const planned = new Set(plannedEdgeIds);
  const reportedBranches = new Set<string>();
  for (const edge of graph.edges) {
    if (planned.has(edge.id)) continue;
    const branchKey = portKey(edge.from.nodeId, edge.from.portId);
    if (reportedBranches.has(branchKey)) continue;
    reportedBranches.add(branchKey);
    diagnostics.push({
      severity: "warning",
      message: `Branch from "${edge.from.nodeId}:${edge.from.portId}" does not reach Out and will not affect output.`,
      nodeId: edge.from.nodeId,
      portId: edge.from.portId,
      edgeId: edge.id,
      outputId: edge.from.portId,
    });
  }
  return diagnostics;
}

function diagnoseDroppedOutputs(
  node: AnimationGraphNode,
  outputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>,
  connectedOutputPorts: ReadonlySet<GraphPortId>,
) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  if (node.kind === "out") return diagnostics;
  for (const [portId, streams] of outputs) {
    if (!streams.length || connectedOutputPorts.has(portId)) continue;
    const isConditionDrop = node.kind === "condition";
    diagnostics.push({
      severity: "warning",
      message: isConditionDrop
        ? `Condition output "${portId}" produced streams but is disconnected; matching tokens are dropped.`
        : `Output port "${portId}" produced streams but is disconnected.`,
      nodeId: node.id,
      portId,
      outputId: portId,
    });
  }
  return diagnostics;
}

function findCycleNodeId(graph: AnimationGraph) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): string | null => {
    if (visiting.has(nodeId)) return nodeId;
    if (visited.has(nodeId)) return null;
    visiting.add(nodeId);
    for (const edge of graph.edges.filter(
      (candidate) => candidate.from.nodeId === nodeId,
    )) {
      const cycle = visit(edge.to.nodeId);
      if (cycle) return cycle;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };
  for (const nodeId of Object.keys(graph.nodes)) {
    const cycle = visit(nodeId);
    if (cycle) return cycle;
  }
  return null;
}

function groupEdgesByOutput(edges: StrictAnimationGraphEdge[]) {
  const groups = new Map<string, StrictAnimationGraphEdge[]>();
  for (const edge of edges)
    groups.set(edge.from.nodeId, [
      ...(groups.get(edge.from.nodeId) ?? []),
      edge,
    ]);
  return groups;
}

function groupEdgesByInput(edges: StrictAnimationGraphEdge[]) {
  const groups = new Map<PortKey, StrictAnimationGraphEdge[]>();
  for (const edge of edges) {
    const key = portKey(edge.to.nodeId, edge.to.portId);
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  return groups;
}

function topoPlannedNodes(
  graph: AnimationGraph,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>,
) {
  const indegree = new Map<string, number>();
  for (const nodeId of nodeIds) indegree.set(nodeId, 0);
  for (const edge of graph.edges) {
    if (!edgeIds.has(edge.id)) continue;
    indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
  }
  const queue = Object.keys(graph.nodes)
    .filter(
      (nodeId) => nodeIds.has(nodeId) && (indegree.get(nodeId) ?? 0) === 0,
    )
    .sort();
  const ordered: AnimationGraphNode[] = [];
  while (queue.length) {
    const nodeId = queue.shift()!;
    const node = graph.nodes[nodeId];
    if (node) ordered.push(node);
    for (const edge of graph.edges) {
      if (!edgeIds.has(edge.id) || edge.from.nodeId !== nodeId) continue;
      indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 1) - 1);
      if (indegree.get(edge.to.nodeId) === 0) queue.push(edge.to.nodeId);
    }
    queue.sort();
  }
  return ordered;
}

function operationKindForNode(nodeKind: string): GraphOperationKind {
  if (nodeKind === "out") return "outputCollection";
  if (nodeKind === "condition") return "branchRouting";
  if (nodeKind.startsWith("value:")) return "valueEvaluation";
  if (nodeKind.startsWith("effect:")) return "effectAppend";
  if (nodeKind === "split" || nodeKind === "time")
    return "streamTransformation";
  return "nodeExecution";
}

function isRequiredInputPort(portId: string, nodeKind: string) {
  if (nodeKind === "out") return false;
  if (portId === "in" && isRootableGeometryNode(nodeKind)) return false;
  return portId === "in";
}

function isRootableGeometryNode(nodeKind: string) {
  return (
    nodeKind === "geometry:rectangle" ||
    nodeKind === "geometry:circle" ||
    nodeKind === "geometry:ellipse" ||
    nodeKind === "geometry:polygon" ||
    nodeKind === "geometry:line" ||
    nodeKind === "geometry:path" ||
    nodeKind === "geometry:star" ||
    nodeKind === "geometry:grid" ||
    nodeKind === "geometry:dotGrid"
  );
}

function reachableStrictNodes(
  sourceId: string,
  edges: StrictAnimationGraphEdge[],
) {
  const seen = new Set<string>();
  const stack = [sourceId];
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    for (const edge of edges.filter(
      (candidate) => candidate.from.nodeId === nodeId,
    ))
      stack.push(edge.to.nodeId);
  }
  return seen;
}

function strictReaches(
  from: string,
  to: string,
  edges: StrictAnimationGraphEdge[],
) {
  return reachableStrictNodes(from, edges).has(to);
}

function portKey(nodeId: string, portId: string): PortKey {
  return `${nodeId}:${portId}`;
}

function isAnimationStream(stream: GraphStream): stream is AnimationStream {
  return "structure" in stream;
}

function summarizePortStreams(
  ports: ReadonlyMap<GraphPortId, readonly GraphStream[]>,
) {
  const summary: Record<GraphPortId, AnimationGraphStreamTrace[]> = {};
  for (const [portId, streams] of ports) {
    summary[portId] = streams.map(summarizeStream);
  }
  return summary;
}

function summarizeStream(stream: GraphStream): AnimationGraphStreamTrace {
  if (isAnimationStream(stream))
    return {
      streamId: stream.id,
      kind: "animation",
      domain:
        stream.structure.kind === "richText"
          ? stream.structure.domain
          : stream.structure.kind === "geometry"
            ? stream.structure.domain
            : "object",
      structureKind: stream.structure.kind,
      tokenCount:
        stream.structure.kind === "richText"
          ? stream.structure.tokenIndexes.length
          : undefined,
      maskCount:
        stream.structure.kind === "richText"
          ? stream.structure.selection?.mask.filter(Boolean).length
          : undefined,
      pointCount:
        stream.structure.kind === "geometry"
          ? stream.structure.pointCount
          : undefined,
      segmentCount:
        stream.structure.kind === "geometry"
          ? stream.structure.segmentCount
          : undefined,
      bounds:
        stream.structure.kind === "geometry"
          ? stream.structure.bounds
          : undefined,
      generatedStructureType:
        stream.structure.kind === "geometry"
          ? stream.structure.structureType
          : undefined,
      effectCount: stream.effects.length,
      controllerSummary: `start ${stream.controller.start}, delay ${stream.controller.delay}, duration ${stream.controller.duration}, ease ${stream.controller.ease}`,
      controller: {
        start: stream.controller.start,
        delay: stream.controller.delay,
        duration: stream.controller.duration,
        ease: stream.controller.ease,
      },
    };
  return {
    streamId: stream.id,
    kind: "value",
    valueType: stream.valueType,
  };
}
