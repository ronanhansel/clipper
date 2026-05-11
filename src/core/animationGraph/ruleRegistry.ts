import type { AnimationGraphEdge, TypedAnimationGraphNode } from "../types";

export type AnimationGraphRuleNode = {
  id: string;
  kind: string;
  typedNode?: TypedAnimationGraphNode;
  details?: Record<string, string>;
};

export type AnimationGraphConnectionRuleInput = {
  edge: AnimationGraphEdge;
  from: AnimationGraphRuleNode;
  to: AnimationGraphRuleNode;
  nodes: readonly AnimationGraphRuleNode[];
  existingEdges: readonly AnimationGraphEdge[];
};

export type AnimationGraphConnectionRule = (
  input: AnimationGraphConnectionRuleInput,
) => boolean;

const connectionRules = new Map<string, AnimationGraphConnectionRule>();

export function registerAnimationGraphConnectionRule(
  id: string,
  rule: AnimationGraphConnectionRule,
) {
  connectionRules.set(id, rule);
}

export function getAnimationGraphConnectionRule(id: string) {
  return connectionRules.get(id);
}
