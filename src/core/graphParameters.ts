import { createTypedAnimationGraphNode } from "./animationGraph/nodeRegistry";
import type { AnimationGraphState, TypedAnimationGraphNode } from "./types";

export function updateAnimationGraphNodeParameter(
  graph: AnimationGraphState | undefined,
  nodeId: string,
  key: string,
  value: string,
): AnimationGraphState {
  return {
    nodes: updateAnimationGraphTypedNodeParameter(
      graph?.nodes,
      nodeId,
      key,
      value,
    ),
    edges: graph?.edges ?? [],
    customNodes: updateAnimationGraphCustomNodeParameter(
      graph?.customNodes,
      nodeId,
      key,
      value,
    ),
    groups: graph?.groups,
    parameters: {
      ...(graph?.parameters ?? {}),
      [nodeId]: { ...(graph?.parameters?.[nodeId] ?? {}), [key]: value },
    },
    viewport: graph?.viewport,
    viewports: graph?.viewports,
  };
}

function updateAnimationGraphTypedNodeParameter(
  nodes: AnimationGraphState["nodes"] | undefined,
  nodeId: string,
  key: string,
  value: string,
) {
  const current = nodes?.[nodeId];
  if (!current || typeof current !== "object" || !("kind" in current))
    return nodes ?? {};
  const node = current as TypedAnimationGraphNode;
  if (node.kind === "effect" && node.config.effects.length === 1) {
    const [effect = { property: "", values: {} }] = node.config.effects;
    const nextEffect =
      key === "property"
        ? { ...effect, property: value }
        : key === "from" || key === "to"
          ? { ...effect, [key]: value }
          : { ...effect, values: { ...effect.values, [key]: value } };
    return {
      ...(nodes ?? {}),
      [nodeId]: createTypedAnimationGraphNode(
        nodeId,
        "effect",
        node.position,
        { effects: [{ ...nextEffect, property: nextEffect.property || key }] },
        node.label,
      ),
    };
  }
  return {
    ...(nodes ?? {}),
    [nodeId]: createTypedAnimationGraphNode(
      nodeId,
      node.kind,
      node.position,
      { ...(node.config as object), [key]: value },
      key === "label" ? value : node.label,
    ),
  };
}

export function updateAnimationGraphCustomNodeParameter(
  customNodes: AnimationGraphState["customNodes"] | undefined,
  nodeId: string,
  key: string,
  value: string,
) {
  const current = customNodes?.[nodeId];
  if (!current) return customNodes;
  return {
    ...(customNodes ?? {}),
    [nodeId]: {
      ...current,
      label: key === "label" ? value : current.label,
      details:
        key === "label"
          ? current.details
          : { ...(current.details ?? {}), [key]: value },
    },
  };
}
