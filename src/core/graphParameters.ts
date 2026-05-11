import { createTypedAnimationGraphNode } from "./animationGraph/nodeRegistry";
import type { AnimationGraphState, TypedAnimationGraphNode } from "./types";

export function updateAnimationGraphNodeParameter(
  graph: AnimationGraphState | undefined,
  nodeId: string,
  key: string,
  value: string,
): AnimationGraphState {
  if (key === "__deleteCondition")
    return deleteAnimationGraphCondition(
      graph,
      nodeId,
      Number.parseInt(value, 10),
    );
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

function deleteAnimationGraphCondition(
  graph: AnimationGraphState | undefined,
  nodeId: string,
  index: number,
): AnimationGraphState {
  const currentParameters = graph?.parameters?.[nodeId] ?? {};
  const currentNode = graph?.nodes?.[nodeId];
  const nodeConfig =
    currentNode && typeof currentNode === "object" && "config" in currentNode
      ? ((currentNode as TypedAnimationGraphNode).config as Record<
          string,
          string
        >)
      : {};
  const merged = { ...nodeConfig, ...currentParameters };
  const count = Math.min(
    4,
    Math.max(1, Number.parseInt(merged.conditionCount ?? "1", 10) || 1),
  );
  if (index <= 1 || index > count) return graph ?? { nodes: {}, edges: [] };
  const nextParameters = shiftConditionParameters(merged, index, count);
  return {
    nodes: updateAnimationGraphTypedNodeParameter(
      graph?.nodes,
      nodeId,
      "conditionCount",
      nextParameters.conditionCount,
      nextParameters,
    ),
    edges: graph?.edges ?? [],
    customNodes: updateAnimationGraphCustomNodeConditionParameters(
      graph?.customNodes,
      nodeId,
      nextParameters,
    ),
    groups: graph?.groups,
    parameters: {
      ...(graph?.parameters ?? {}),
      [nodeId]: nextParameters,
    },
    viewport: graph?.viewport,
    viewports: graph?.viewports,
  };
}

function shiftConditionParameters(
  values: Record<string, string>,
  removeIndex: number,
  count: number,
) {
  const keys = ["matchType", "value", "action", "outputPort", "delay"];
  const next: Record<string, string> = {
    ...values,
    conditionCount: String(count - 1),
  };
  for (let index = removeIndex; index < count; index += 1) {
    const fromSuffix = conditionSuffix(index + 1);
    const toSuffix = conditionSuffix(index);
    for (const key of keys) {
      const fromKey = `${key}${fromSuffix}`;
      const toKey = `${key}${toSuffix}`;
      if (values[fromKey] !== undefined) next[toKey] = values[fromKey];
      else delete next[toKey];
    }
  }
  const lastSuffix = conditionSuffix(count);
  for (const key of keys) delete next[`${key}${lastSuffix}`];
  return next;
}

function conditionSuffix(index: number) {
  return index === 1 ? "" : String(index);
}

function updateAnimationGraphTypedNodeParameter(
  nodes: AnimationGraphState["nodes"] | undefined,
  nodeId: string,
  key: string,
  value: string,
  replacementConfig?: Record<string, string>,
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
      replacementConfig ?? { ...(node.config as object), [key]: value },
      key === "label" ? value : node.label,
    ),
  };
}

function updateAnimationGraphCustomNodeConditionParameters(
  customNodes: AnimationGraphState["customNodes"] | undefined,
  nodeId: string,
  parameters: Record<string, string>,
) {
  const current = customNodes?.[nodeId];
  if (!current) return customNodes;
  return {
    ...(customNodes ?? {}),
    [nodeId]: { ...current, details: parameters },
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
