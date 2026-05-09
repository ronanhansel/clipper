import type { AnimationGraphEdge } from "./types";

export type AnimationGraphTemporalKind = "time" | "split";

export type AnimationGraphTemporalNode = {
  id: string;
  kind: string;
  details?: Record<string, string>;
};

export type AnimationGraphTemporalContext<
  TNode extends AnimationGraphTemporalNode,
> = {
  edges: AnimationGraphEdge[];
  nodes: TNode[];
  getMode: (node: TNode) => "stack" | "overlay";
  getScheduleMode?: (node: TNode) => "relative" | "absolute";
  getDelay: (node: TNode) => number;
  getDuration: (node: TNode) => number;
  getSplitTokenCount: (node: TNode) => number;
};

export function isAnimationGraphTemporalKind(
  kind: string | undefined,
): kind is AnimationGraphTemporalKind {
  return kind === "time" || kind === "split";
}

export function getAnimationGraphTemporalStart<
  TNode extends AnimationGraphTemporalNode,
>(
  node: TNode,
  context: AnimationGraphTemporalContext<TNode>,
  visiting = new Set<string>(),
): number {
  if (visiting.has(node.id)) return 0;
  visiting.add(node.id);
  const delay = context.getMode(node) === "stack" ? context.getDelay(node) : 0;
  if (node.kind === "time" && context.getScheduleMode?.(node) === "absolute")
    return delay;
  const upstream = getAnimationGraphTemporalUpstreamNodes(node.id, context);
  if (!upstream.length) return delay;
  const anchor =
    context.getMode(node) === "overlay"
      ? Math.max(
          ...upstream.map((upstreamNode) =>
            getAnimationGraphTemporalStart(
              upstreamNode,
              context,
              new Set(visiting),
            ),
          ),
        )
      : Math.max(
          ...upstream.map((upstreamNode) =>
            getAnimationGraphTemporalEnd(
              upstreamNode,
              context,
              new Set(visiting),
            ),
          ),
        );
  return anchor + delay;
}

export function getAnimationGraphTemporalDuration<
  TNode extends AnimationGraphTemporalNode,
>(node: TNode, context: AnimationGraphTemporalContext<TNode>): number {
  if (node.kind === "time") return context.getDuration(node);
  if (node.kind === "split")
    return getAnimationGraphSplitTemporalDuration(node, context);
  return 0;
}

export function getAnimationGraphTemporalEnd<
  TNode extends AnimationGraphTemporalNode,
>(
  node: TNode,
  context: AnimationGraphTemporalContext<TNode>,
  visiting = new Set<string>(),
) {
  return (
    getAnimationGraphTemporalStart(node, context, visiting) +
    getAnimationGraphTemporalDuration(node, context)
  );
}

function getAnimationGraphTemporalUpstreamNodes<
  TNode extends AnimationGraphTemporalNode,
>(nodeId: string, context: AnimationGraphTemporalContext<TNode>) {
  return context.edges
    .filter((edge) => edge.toNodeId === nodeId)
    .map((edge) => context.nodes.find((node) => node.id === edge.fromNodeId))
    .filter((node): node is TNode =>
      Boolean(node && isAnimationGraphTemporalKind(node.kind)),
    );
}

function getAnimationGraphSplitTemporalDuration<
  TNode extends AnimationGraphTemporalNode,
>(node: TNode, context: AnimationGraphTemporalContext<TNode>) {
  const upstreamTimeDurations = context.edges
    .filter((edge) => edge.toNodeId === node.id)
    .map((edge) =>
      context.nodes.find((candidate) => candidate.id === edge.fromNodeId),
    )
    .filter((candidate): candidate is TNode =>
      Boolean(candidate && candidate.kind === "time"),
    )
    .map((timeNode) => context.getDuration(timeNode));
  const baseDuration = Math.max(0, ...upstreamTimeDurations);
  if ((node.details?.repeatScope ?? "sequence") !== "sequence")
    return baseDuration;
  return (
    baseDuration +
    getAnimationGraphSplitMaxTokenOffset(
      context.getSplitTokenCount(node),
      parseSeconds(node.details?.stagger),
      node.details?.order,
    )
  );
}

function getAnimationGraphSplitMaxTokenOffset(
  count: number,
  stagger: number,
  order: string | undefined,
) {
  const safeCount = Math.max(1, count);
  const safeStagger = Math.max(0, stagger);
  if (order === "center") return ((safeCount - 1) / 2) * safeStagger;
  return Math.max(0, safeCount - 1) * safeStagger;
}

function parseSeconds(value: string | undefined) {
  const numeric = Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? numeric : 0;
}
