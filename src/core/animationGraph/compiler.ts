import { getAnimationGraphNodeDefinition } from "./registry";
import { validateAnimationGraph } from "./validation";
import { getGraphEffectRuntimeAdapter } from "../effects/registry";
import type {
  AnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge as StrictAnimationGraphEdge,
  AnimationGraphExecutionTrace,
  AnimationGraphStreamTrace,
  AnimationGraphNode,
  AnimationStream,
  EffectInstruction,
  GraphPortId,
  GraphStream,
} from "./types";
import type { FrameObject, LayerAnimation } from "../types";

type CompileResult = {
  streams: AnimationStream[];
  animations: LayerAnimation[];
  diagnostics: AnimationGraphDiagnostic[];
  trace?: AnimationGraphExecutionTrace;
};

export type AnimationGraphObjectCompileResult = CompileResult;

type StrictCompileOptions = {
  sourceObject?: FrameObject;
  trace?: boolean;
};

type PortKey = `${string}:${string}`;

export function compileAnimationGraph(
  graph: AnimationGraph,
  options: StrictCompileOptions = {},
): CompileResult {
  const diagnostics = [
    ...validateAnimationGraph(graph),
    ...validateReachabilityAndCycles(graph),
  ];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { streams: [], animations: [], diagnostics };
  }

  const incoming = new Map<PortKey, GraphStream[]>();
  const outgoing = groupEdgesByOutput(graph.edges);
  const traceEvents: AnimationGraphExecutionTrace["events"] = [];
  const source = Object.values(graph.nodes).find(
    (node) => node.kind === "source",
  );
  const outStreams: AnimationStream[] = [];
  if (!source) return { streams: [], animations: [], diagnostics };

  const executeNode = (node: AnimationGraphNode) => {
    const definition = getAnimationGraphNodeDefinition(node.kind);
    if (!definition) return;
    const inputs = new Map<GraphPortId, readonly GraphStream[]>();
    for (const port of definition.getPorts(node)) {
      if (port.direction === "input")
        inputs.set(port.id, incoming.get(portKey(node.id, port.id)) ?? []);
    }
    const connectedOutputPorts = new Set(
      (outgoing.get(node.id) ?? []).map((edge) => edge.from.portId),
    );
    const result = definition.execute(
      { node, inputs },
      { graph, sourceObject: options.sourceObject, connectedOutputPorts },
    );
    diagnostics.push(...(result.diagnostics ?? []));
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

  for (const node of topoFromSource(graph, source.id)) executeNode(node);

  return {
    streams: outStreams,
    animations: compileStreamsToLayerAnimations(outStreams, diagnostics),
    diagnostics,
    ...(options.trace ? { trace: { events: traceEvents } } : {}),
  };
}

export function compileAnimationGraphForObject(
  object: FrameObject,
  graph: AnimationGraph,
): AnimationGraphObjectCompileResult {
  if (graph.sourceObjectId !== object.id)
    return { streams: [], animations: [], diagnostics: [] };
  return compileAnimationGraph(graph, { sourceObject: object });
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
  if (runtime) return runtime;
  diagnostics.push({
    severity: "warning",
    message: `Effect package "${effect.effectId}" does not provide a graph runtime adapter for LayerAnimation compatibility.`,
  });
  return null;
}

function controllerToOptions(
  controller: AnimationStream["controller"],
  structure: AnimationStream["structure"],
): LayerAnimation["options"] {
  return {
    delay: controller.start + controller.delay,
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

function validateReachabilityAndCycles(graph: AnimationGraph) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const source = Object.values(graph.nodes).find(
    (node) => node.kind === "source",
  );
  const outs = Object.values(graph.nodes).filter((node) => node.kind === "out");
  if (
    source &&
    outs.length &&
    !outs.some((out) => strictReaches(source.id, out.id, graph.edges))
  ) {
    diagnostics.push({
      severity: "error",
      message: "Source must reach Out.",
      nodeId: source.id,
    });
  }
  const cycleNodeId = findCycleNodeId(graph);
  if (cycleNodeId)
    diagnostics.push({
      severity: "error",
      message: "Graph must not contain cycles.",
      nodeId: cycleNodeId,
    });
  return diagnostics;
}

function topoFromSource(graph: AnimationGraph, sourceId: string) {
  const reachable = reachableStrictNodes(sourceId, graph.edges);
  const indegree = new Map<string, number>();
  for (const nodeId of reachable) indegree.set(nodeId, 0);
  for (const edge of graph.edges) {
    if (reachable.has(edge.from.nodeId) && reachable.has(edge.to.nodeId))
      indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
  }
  const queue = [sourceId];
  const ordered: AnimationGraphNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const node = graph.nodes[id];
    if (node) ordered.push(node);
    for (const edge of graph.edges.filter(
      (candidate) => candidate.from.nodeId === id,
    )) {
      if (!reachable.has(edge.to.nodeId)) continue;
      indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 1) - 1);
      if (indegree.get(edge.to.nodeId) === 0) queue.push(edge.to.nodeId);
    }
  }
  return ordered;
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
      structureKind: stream.structure.kind,
      tokenCount:
        stream.structure.kind === "richText"
          ? stream.structure.tokenIndexes.length
          : undefined,
      effectCount: stream.effects.length,
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
