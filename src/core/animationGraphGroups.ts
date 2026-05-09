import type { AnimationGraphCustomNode, AnimationGraphEdge, AnimationGraphState } from "./types";

export type ExpandedAnimationGraphGroups = {
  customNodes: NonNullable<AnimationGraphState["customNodes"]>;
  edges: AnimationGraphEdge[];
  parameters: NonNullable<AnimationGraphState["parameters"]>;
  animationIdPrefixByNodeId: Map<string, string>;
  groupNodeIds: Set<string>;
};

export function expandAnimationGraphGroups({
  graph,
  baseCustomNodes = {},
  baseParameters = {},
  parentEdges = graph.edges ?? [],
  includeGroupNode = () => true,
}: {
  graph: AnimationGraphState;
  baseCustomNodes?: NonNullable<AnimationGraphState["customNodes"]>;
  baseParameters?: NonNullable<AnimationGraphState["parameters"]>;
  parentEdges?: AnimationGraphEdge[];
  includeGroupNode?: (nodeId: string, node: AnimationGraphCustomNode) => boolean;
}): ExpandedAnimationGraphGroups {
  const customNodes: NonNullable<AnimationGraphState["customNodes"]> = { ...baseCustomNodes };
  const parameters: NonNullable<AnimationGraphState["parameters"]> = { ...baseParameters };
  const animationIdPrefixByNodeId = new Map<string, string>();
  const groupNodeIds = new Set<string>();
  const expandedEdges: AnimationGraphEdge[] = [];

  for (const [groupNodeId, groupNode] of Object.entries(graph.customNodes ?? {})) {
    if (groupNode.kind !== "group" || !includeGroupNode(groupNodeId, groupNode)) continue;
    const groupId = groupNode.details?.groupId;
    const group = groupId ? graph.groups?.[groupId] : undefined;
    if (!group) continue;

    groupNodeIds.add(groupNodeId);
    Object.assign(customNodes, group.customNodes ?? {});
    Object.assign(parameters, group.parameters ?? {});
    for (const nodeId of Object.keys(group.customNodes ?? {})) animationIdPrefixByNodeId.set(nodeId, `${groupNodeId}:`);

    const outputEdges = (group.edges ?? []).filter((edge) => edge.toNodeId === group.outNodeId);
    const inputEdges = (group.edges ?? []).filter((edge) => edge.fromNodeId === groupNodeId);
    const parentSources = parentEdges.filter((edge) => edge.toNodeId === groupNodeId);
    const parentTargets = parentEdges.filter((edge) => edge.fromNodeId === groupNodeId);

    expandedEdges.push(...(group.edges ?? []).filter((edge) => edge.toNodeId !== group.outNodeId && edge.fromNodeId !== groupNodeId));
    for (const inputEdge of inputEdges) {
      for (const sourceEdge of parentSources) {
        expandedEdges.push(createAnimationGraphEdge(sourceEdge.fromNodeId, sourceEdge.fromPort, inputEdge.toNodeId, inputEdge.toPort));
      }
    }
    for (const outputEdge of outputEdges) {
      for (const targetEdge of parentTargets) {
        expandedEdges.push(createAnimationGraphEdge(outputEdge.fromNodeId, outputEdge.fromPort, targetEdge.toNodeId, targetEdge.toPort));
      }
    }
  }

  expandedEdges.push(...parentEdges.filter((edge) => !groupNodeIds.has(edge.fromNodeId) && !groupNodeIds.has(edge.toNodeId)));
  return { customNodes, edges: expandedEdges, parameters, animationIdPrefixByNodeId, groupNodeIds };
}

function createAnimationGraphEdge(
  fromNodeId: string,
  fromPort: AnimationGraphEdge["fromPort"],
  toNodeId: string,
  toPort: AnimationGraphEdge["toPort"],
): AnimationGraphEdge {
  return { id: `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`, fromNodeId, fromPort, toNodeId, toPort };
}
