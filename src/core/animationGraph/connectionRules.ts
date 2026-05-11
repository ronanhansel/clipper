import { animationGraphNodeRegistry } from "./registry";
import { canConnectTypedAnimationGraphNodes } from "./compatibility";
import {
  getAnimationGraphConnectionRule,
  registerAnimationGraphConnectionRule,
  type AnimationGraphRuleNode,
} from "./ruleRegistry";
import type { AnimationGraphEdge, TypedAnimationGraphNode } from "../types";
export type { AnimationGraphRuleNode } from "./ruleRegistry";

export function isPermittedComposition2dAnimationGraphEdge(
  edge: AnimationGraphEdge,
  nodes: readonly AnimationGraphRuleNode[],
  existingEdges: readonly AnimationGraphEdge[] = [],
) {
  const from = nodes.find((node) => node.id === edge.fromNodeId);
  const to = nodes.find((node) => node.id === edge.toNodeId);
  if (!from || !to || from.kind === "out") return false;
  return getConnectionRuleIds(from, to).every((ruleId) =>
    getAnimationGraphConnectionRule(ruleId)?.({
      edge,
      from,
      to,
      nodes,
      existingEdges,
    }),
  );
}

export function getActiveConditionOutputCount(node: AnimationGraphRuleNode) {
  const packageDefinition = animationGraphNodeRegistry.get(node.kind);
  return packageDefinition?.getOutputPortCount?.(node) ?? 1;
}

function getConnectionRuleIds(
  from: AnimationGraphRuleNode,
  to: AnimationGraphRuleNode,
) {
  return Array.from(
    new Set([
      ...(animationGraphNodeRegistry.get(from.kind)?.connectionRules ?? []),
      ...(animationGraphNodeRegistry.get(to.kind)?.connectionRules ?? []),
    ]),
  );
}

registerAnimationGraphConnectionRule("typedSockets", ({ from, to, edge }) =>
  Boolean(
    from.typedNode &&
    to.typedNode &&
    canConnectTypedAnimationGraphNodes(
      from.typedNode,
      to.typedNode,
      edge.fromSocket,
      edge.toSocket,
    ),
  ),
);

registerAnimationGraphConnectionRule(
  "acyclic",
  ({ edge, existingEdges }) =>
    !pathExists(edge.toNodeId, edge.fromNodeId, existingEdges),
);

function pathExists(
  fromNodeId: string,
  toNodeId: string,
  edges: readonly AnimationGraphEdge[],
) {
  const visited = new Set<string>();
  const stack = [fromNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === toNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges)
      if (edge.fromNodeId === current) stack.push(edge.toNodeId);
  }
  return false;
}
