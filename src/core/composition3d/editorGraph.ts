import { getComposition3dNodeKindFromPackageId } from "../graphSockets";
import type { Composition3dGraphState } from "../types";
import type {
  Composition3dGraph,
  Composition3dNode,
  Composition3dValue,
} from "./types";

export function editorGraphToComposition3dGraph(
  graph: Composition3dGraphState | undefined,
): Composition3dGraph | null {
  if (!graph) return null;

  const nodes = Object.entries(graph.customNodes ?? {}).flatMap(
    ([id, node]): Composition3dNode[] => {
      const kind = getComposition3dNodeKindFromPackageId(
        node.details?.packageId,
      );
      if (!kind) return [];
      return [
        {
          id,
          kind,
          params: toComposition3dParams(
            graph.parameters?.[id] as Record<string, unknown> | undefined,
          ),
        },
      ];
    },
  );

  const outNodeId = "composition3d:out";
  nodes.push({ id: outNodeId, kind: "out" });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges ?? []) {
    const target = nodeById.get(edge.toNodeId);
    if (!target || !nodeById.has(edge.fromNodeId)) continue;
    if (!edge.toSocket) continue;
    target.inputs = {
      ...(target.inputs ?? {}),
      [edge.toSocket]: { nodeId: edge.fromNodeId, output: edge.fromSocket },
    };
  }

  return { version: 1, outNodeId, nodes };
}

function toComposition3dParams(
  values: Record<string, unknown> | undefined,
): Record<string, Composition3dValue> | undefined {
  if (!values) return undefined;
  const entries = Object.entries(values).flatMap(
    ([key, value]): Array<[string, Composition3dValue]> => {
      const parsed = parseComposition3dValue(value);
      return parsed === undefined ? [] : [[key, parsed]];
    },
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function parseComposition3dValue(
  value: unknown,
): Composition3dValue | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") {
    return Array.isArray(value) &&
      value.every((item) => typeof item === "number")
      ? value
      : undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "number")
      )
        return parsed;
    } catch {
      return undefined;
    }
  }
  const number = Number(trimmed);
  return Number.isFinite(number) && trimmed !== "" ? number : trimmed;
}
