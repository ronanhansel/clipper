import type { FrameObject, Part } from "../../core/types";
import { frameObjectFromBackgroundLayer } from "../../core/frameInteraction";
import type { NativeTreeApi, NativeTreeDropTarget } from "../tree/NativeTree";

export type ComposeLayerKind =
  | "root"
  | "frame"
  | "background"
  | "background-object"
  | "object";

export type ComposeLayerNode = {
  id: string;
  name: string;
  kind: ComposeLayerKind;
  animated?: boolean;
  object?: FrameObject;
  part?: Part;
  children?: ComposeLayerNode[];
};

export function buildComposeLayerTree(part: Part): ComposeLayerNode[] {
  const objectChildren = [...part.objects]
    .reverse()
    .map((object) => objectToNode(object, "object", part));

  return [
    {
      id: "objects",
      name: "Objects",
      kind: "root",
      children: objectChildren.length > 0 ? objectChildren : undefined,
    },
    backgroundToNode(part),
    {
      id: "frame",
      name: `${part.frame.width} x ${part.frame.height} Frame`,
      kind: "frame",
    },
  ];
}

export function getComposeLayerNodeObjects(
  node: ComposeLayerNode,
): FrameObject[] {
  if (node.object) return [node.object];
  if (node.kind === "background" && node.part)
    return [frameObjectFromBackgroundLayer(node.part.background)];
  return node.children?.flatMap(getComposeLayerNodeObjects) ?? [];
}

export function syncComposeSelectedLayerIds(
  current: string[],
  selectedObjectIds: string[],
  previousSelectedObjectIds: string[],
  treeData: ComposeLayerNode[],
) {
  const preservedAggregateIds = current.filter((id) => {
    const node = findComposeLayerNode(treeData, id);
    if (!node || node.object) return false;
    return haveSameIds(
      getComposeLayerNodeObjects(node).map((object) => object.id),
      selectedObjectIds,
    );
  });
  if (preservedAggregateIds.length > 0) return preservedAggregateIds;
  const preservedObjectPresentationIds = current.filter((id) => {
    const node = findComposeLayerNode(treeData, id);
    return node?.object && haveSameIds([node.object.id], selectedObjectIds);
  });
  if (preservedObjectPresentationIds.length > 0)
    return preservedObjectPresentationIds;
  if (selectedObjectIds.length > 0)
    return selectedObjectIds.flatMap((id) => {
      const node = findPreferredObjectLayerNode(treeData, id);
      return node ? [node.id] : [];
    });
  const preserved = current.filter((id) => findComposeLayerNode(treeData, id));
  if (
    preserved.some((id) => {
      const node = findComposeLayerNode(treeData, id);
      return node?.kind === "frame" || node?.kind === "background";
    })
  )
    return preserved;
  if (previousSelectedObjectIds.length > 0) return [];
  return preserved.length > 0 ? preserved : [];
}

export function countComposeLayerNodes(nodes: ComposeLayerNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + 1 + (node.children ? countComposeLayerNodes(node.children) : 0),
    0,
  );
}

export function getComposeLayerDropTarget(
  api: NativeTreeApi<ComposeLayerNode>,
  dragIds: string[],
  localY: number,
  rowHeight: number,
): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (!visibleNodes.length) return null;
  if (localY < 0) return { dragIds, parentId: "objects", index: 0 };
  const maxY = visibleNodes.length * rowHeight;
  if (localY > maxY)
    return { dragIds, parentId: "objects", index: visibleNodes.length };
  const rowIndex = Math.max(
    0,
    Math.min(visibleNodes.length - 1, Math.floor(localY / rowHeight)),
  );
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * rowHeight;
  if (node.isInternal && yInRow > rowHeight * 0.25 && yInRow < rowHeight * 0.75)
    return { dragIds, parentId: node.id, index: 0 };
  return {
    dragIds,
    parentId: node.parent?.id ?? null,
    index: node.childIndex + (yInRow >= rowHeight / 2 ? 1 : 0),
  };
}

export function getComposeLayerReorderTargetIndex(
  objectCount: number,
  dragCount: number,
  dropIndex: number,
) {
  const remainingObjectCount = objectCount - dragCount;
  return Math.max(
    0,
    Math.min(remainingObjectCount - dropIndex, remainingObjectCount),
  );
}

function objectToNode(
  object: FrameObject,
  kind: Extract<ComposeLayerKind, "background-object" | "object">,
  part?: Part,
): ComposeLayerNode {
  return {
    id: object.id,
    name: object.name || object.id,
    kind,
    animated: Boolean(object.animations?.length),
    object,
  };
}

function backgroundToNode(part: Part): ComposeLayerNode {
  const backgroundChildren = [...part.background.elements]
    .reverse()
    .map((object) => objectToNode(object, "background-object", part));
  return {
    id: part.background.id,
    name: part.background.name || "Background",
    kind: "background",
    animated: Boolean(part.background.animations?.length),
    part,
    children: backgroundChildren.length > 0 ? backgroundChildren : undefined,
  };
}

function findComposeLayerNode(
  nodes: ComposeLayerNode[],
  id: string,
): ComposeLayerNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children
      ? findComposeLayerNode(node.children, id)
      : null;
    if (child) return child;
  }
  return null;
}

function findPreferredObjectLayerNode(
  nodes: ComposeLayerNode[],
  objectId: string,
): ComposeLayerNode | null {
  const exact = findComposeLayerNode(nodes, objectId);
  const objectMatches = findComposeObjectLayerNodes(nodes, objectId);
  return (
    objectMatches.find((node) => node.kind === "object") ??
    exact ??
    objectMatches[0] ??
    null
  );
}

function findComposeObjectLayerNodes(
  nodes: ComposeLayerNode[],
  objectId: string,
): ComposeLayerNode[] {
  return nodes.flatMap((node) => [
    ...(node.object?.id === objectId ? [node] : []),
    ...(node.children
      ? findComposeObjectLayerNodes(node.children, objectId)
      : []),
  ]);
}

function haveSameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}
