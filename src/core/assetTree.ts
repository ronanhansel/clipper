import type { AssetItem } from "./types";

export type AssetSortMode = "folders-first" | "name-asc" | "name-desc";
export type AssetDropIntent = { targetId: string; action: "before" | "after" | "inside" };

export function updateAssetTree(items: AssetItem[], assetId: string, updater: (item: AssetItem) => AssetItem): AssetItem[] {
  return items.map((item) => {
    if (item.id === assetId) return updater(item);
    if (!item.children) return item;
    return { ...item, children: updateAssetTree(item.children, assetId, updater) };
  });
}

export function getAssetPath(items: AssetItem[], assetId: string, basePath: string, parents: string[] = []): string | null {
  for (const item of items) {
    const path = [...parents, item.name];
    if (item.id === assetId) return item.path ?? [basePath, ...path].join("/");
    if (item.children) {
      const childPath = getAssetPath(item.children, assetId, basePath, path);
      if (childPath) return childPath;
    }
  }
  return null;
}

export function getParentAssetId(items: AssetItem[], assetId: string, parentId: string | null = null): string | null {
  for (const item of items) {
    if (item.id === assetId) return parentId;
    if (item.children) {
      const foundParentId = getParentAssetId(item.children, assetId, item.id);
      if (foundParentId !== null) return foundParentId;
    }
  }
  return null;
}

export function duplicateAssetTree(items: AssetItem[], assetId: string): AssetItem[] {
  return items.flatMap((item) => {
    const nextItem = item.children ? { ...item, children: duplicateAssetTree(item.children, assetId) } : item;
    if (item.id !== assetId) return [nextItem];
    return [nextItem, duplicateAssetItem(item)];
  });
}

function duplicateAssetItem(item: AssetItem): AssetItem {
  const suffix = Date.now().toString(36);
  return {
    ...item,
    id: `${item.id}_copy_${suffix}`,
    name: `${item.name} copy`,
    children: item.children?.map(duplicateAssetItem),
  };
}

export function appendAssetsToFolder(items: AssetItem[], folderId: string, assets: AssetItem[]): AssetItem[] {
  return items.map((item) => {
    if (item.id === folderId && item.kind === "folder") return { ...item, children: [...(item.children ?? []), ...assets] };
    if (!item.children) return item;
    return { ...item, children: appendAssetsToFolder(item.children, folderId, assets) };
  });
}

export function moveAssetTree(items: AssetItem[], sourceId: string, intent: AssetDropIntent): AssetItem[] {
  if (sourceId === intent.targetId || assetContainsId(items, sourceId, intent.targetId)) return items;

  const removed = removeAsset(items, sourceId);
  if (!removed.removed) return items;
  if (intent.action === "inside") return appendAssetsToFolder(removed.items, intent.targetId, [removed.removed]);

  const inserted = insertAssetNear(removed.items, intent.targetId, removed.removed, intent.action);
  return inserted.inserted ? inserted.items : [...inserted.items, removed.removed];
}

export function sortAssetsInParent(items: AssetItem[], parentFolderId: string | null, mode: AssetSortMode): AssetItem[] {
  if (!parentFolderId) return sortAssetItems(items, mode);
  return items.map((item) => {
    if (item.id === parentFolderId && item.kind === "folder") return { ...item, children: sortAssetItems(item.children ?? [], mode) };
    if (!item.children) return item;
    return { ...item, children: sortAssetsInParent(item.children, parentFolderId, mode) };
  });
}

function sortAssetItems(items: AssetItem[], mode: AssetSortMode): AssetItem[] {
  return [...items].sort((a, b) => {
    if (mode === "folders-first" && a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    const comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return mode === "name-desc" ? -comparison : comparison;
  });
}

function assetContainsId(items: AssetItem[], sourceId: string, targetId: string): boolean {
  const source = findAsset(items, sourceId);
  return source?.children ? Boolean(findAsset(source.children, targetId)) : false;
}

export function findAsset(items: AssetItem[], assetId: string): AssetItem | null {
  for (const item of items) {
    if (item.id === assetId) return item;
    if (item.children) {
      const found = findAsset(item.children, assetId);
      if (found) return found;
    }
  }
  return null;
}

export function removeAsset(items: AssetItem[], assetId: string): { items: AssetItem[]; removed: AssetItem | null } {
  let removed: AssetItem | null = null;
  const nextItems = items.flatMap((item) => {
    if (item.id === assetId) {
      removed = item;
      return [];
    }
    if (!item.children) return [item];
    const next = removeAsset(item.children, assetId);
    if (next.removed) removed = next.removed;
    return [{ ...item, children: next.items }];
  });
  return { items: nextItems, removed };
}

function insertAssetNear(items: AssetItem[], targetId: string, asset: AssetItem, action: "before" | "after"): { items: AssetItem[]; inserted: boolean } {
  const nextItems: AssetItem[] = [];
  let inserted = false;
  for (const item of items) {
    if (item.id === targetId && action === "before") {
      nextItems.push(asset);
      inserted = true;
    }
    if (item.children) {
      const next = insertAssetNear(item.children, targetId, asset, action);
      inserted = inserted || next.inserted;
      nextItems.push({ ...item, children: next.items });
    } else {
      nextItems.push(item);
    }
    if (item.id === targetId && action === "after") {
      nextItems.push(asset);
      inserted = true;
    }
  }
  return { items: nextItems, inserted };
}
