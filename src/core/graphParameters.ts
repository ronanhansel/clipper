import type { AnimationGraphState } from "./types";

export function updateAnimationGraphNodeParameter(
  graph: AnimationGraphState | undefined,
  nodeId: string,
  key: string,
  value: string,
): AnimationGraphState {
  return {
    nodes: graph?.nodes ?? {},
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
