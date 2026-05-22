import { getDisplayNameFromPath } from "../../../core/fileNames";
import {
  getEditorLanguageFromName,
  normalizeEditorLanguage,
} from "../../editor/monacoLanguageService";
import type {
  AssetItem,
  CompositionClip,
  ProjectBinItem,
  ProjectManifest,
  TimelineDocument,
} from "../../../core/types";
import { nextNumberedName } from "./binPaths";

export type BinDropIntent = {
  targetId: string;
  action: "before" | "after" | "inside";
};

export type BinProxyImportFile = {
  name: string;
  path?: string;
};

export function normalizeProjectBin(
  project: ProjectManifest,
): ProjectBinItem[] {
  const explicit = project.bin;
  const base = explicit
    ? normalizeBinItems(explicit)
    : legacyBinFromProject(project);
  return addMissingRuntimeBinItems(base, project);
}

export function createBinFolderInProject(
  project: ProjectManifest,
  parentFolderId?: string,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  const folder: ProjectBinItem = {
    id: `bin_folder_${Date.now().toString(36)}`,
    kind: "folder",
    name: nextNumberedName(
      "New Folder",
      getBinSiblingNames(bin, parentFolderId),
    ),
    children: [],
  };
  return {
    ...project,
    bin: parentFolderId
      ? appendBinItemsToFolder(bin, parentFolderId, [folder])
      : [...bin, folder],
  };
}

export function createInternalFileInProject(
  project: ProjectManifest,
  parentFolderId?: string,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  const name = nextNumberedName(
    "untitled.ts",
    getBinSiblingNames(bin, parentFolderId),
  );
  const item: ProjectBinItem = {
    id: `bin_file_${Date.now().toString(36)}`,
    kind: "internal-file",
    name,
    language: getEditorLanguageFromName(name),
    source: "",
  };
  return {
    ...project,
    bin: parentFolderId
      ? appendBinItemsToFolder(bin, parentFolderId, [item])
      : [...bin, item],
  };
}

export function addCompositionBinItemInProject(
  project: ProjectManifest,
  composition: CompositionClip,
  parentFolderId?: string,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  const existingId = `bin_comp_${composition.id}`;
  if (findBinItem(bin, existingId)) return { ...project, bin };
  const item: ProjectBinItem = {
    id: existingId,
    kind: "composition",
    name: getDisplayNameFromPath(composition.filePath).replace(
      /\.composition\.json$/i,
      "",
    ),
    compositionId: composition.id,
  };
  return {
    ...project,
    bin: parentFolderId
      ? appendBinItemsToFolder(bin, parentFolderId, [item])
      : [...bin, item],
  };
}

export function addTimelineBinItemInProject(
  project: ProjectManifest,
  timeline: TimelineDocument,
  parentFolderId?: string,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  const existingId = `bin_timeline_${timeline.id}`;
  if (findBinItem(bin, existingId)) return { ...project, bin };
  const item: ProjectBinItem = {
    id: existingId,
    kind: "timeline",
    name: getDisplayNameFromPath(timeline.filePath || timeline.id).replace(
      /\.timeline\.json$/i,
      "",
    ),
    timelineId: timeline.id,
  };
  return {
    ...project,
    bin: parentFolderId
      ? appendBinItemsToFolder(bin, parentFolderId, [item])
      : [...bin, item],
  };
}

export function importDroppedFilesToBin(
  project: ProjectManifest,
  files: Iterable<BinProxyImportFile>,
  parentFolderId?: string,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  const items = Array.from(files)
    .filter((file) => file.name.trim().length > 0)
    .map((file) => ({
      id: `bin_proxy_${Date.now().toString(36)}_${file.name}`,
      kind: "external-proxy" as const,
      name: file.name,
      path: file.path || file.name,
    }));
  if (!items.length) return { ...project, bin };
  return {
    ...project,
    bin: parentFolderId
      ? appendBinItemsToFolder(bin, parentFolderId, items)
      : [...bin, ...items],
  };
}

export function renameBinItemInProject(
  project: ProjectManifest,
  itemId: string,
  name: string,
): ProjectManifest {
  const nextName = name.trim();
  if (!nextName) return project;
  return {
    ...project,
    bin: updateBinTree(normalizeProjectBin(project), itemId, (item) => ({
      ...item,
      name: nextName,
    })),
  };
}

export function updateInternalFileInProject(
  project: ProjectManifest,
  itemId: string,
  source: string,
): ProjectManifest {
  return {
    ...project,
    bin: updateBinTree(normalizeProjectBin(project), itemId, (item) =>
      item.kind === "internal-file" ? { ...item, source } : item,
    ),
  };
}

export function deleteBinItemsInProject(
  project: ProjectManifest,
  itemIds: string[],
): ProjectManifest {
  if (itemIds.length === 0) return project;

  let bin = normalizeProjectBin(project);
  const removedItems: ProjectBinItem[] = [];

  for (const itemId of itemIds) {
    const removed = removeBinItem(bin, itemId);
    bin = removed.items;
    if (removed.item) removedItems.push(removed.item);
  }

  const allRemovedItems = collectBinItems(removedItems);
  const removedCompositionIds = new Set(
    allRemovedItems.flatMap((item) =>
      item.kind === "composition" ? [item.compositionId] : [],
    ),
  );
  const removedTimelineIds = new Set(
    allRemovedItems.flatMap((item) =>
      item.kind === "timeline" ? [item.timelineId] : [],
    ),
  );

  const nextCompositionLibrary = removedCompositionIds.size
    ? (project.compositionLibrary ?? []).filter(
        (composition) => !removedCompositionIds.has(composition.id),
      )
    : project.compositionLibrary;

  const nextTimelines = (project.timelines ?? [])
    .filter((timeline) => !removedTimelineIds.has(timeline.id))
    .map((timeline) => {
      if (removedCompositionIds.size === 0) return timeline;
      return {
        ...timeline,
        clips: timeline.clips.filter(
          (clip) => !removedCompositionIds.has(clip.compositionId),
        ),
      };
    });

  return {
    ...project,
    bin,
    compositionLibrary: nextCompositionLibrary,
    timelines: nextTimelines,
  };
}

export function deleteBinItemInProject(
  project: ProjectManifest,
  itemId: string,
): ProjectManifest {
  return deleteBinItemsInProject(project, [itemId]);
}

export function duplicateBinItemsInProject(
  project: ProjectManifest,
  itemIds: string[],
): ProjectManifest {
  if (itemIds.length === 0) return project;

  let bin = normalizeProjectBin(project);
  let nextCompositionLibrary = project.compositionLibrary ?? [];
  let nextTimelines = project.timelines ?? [];
  const suffix = Date.now().toString(36);

  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i];
    const item = findBinItem(bin, itemId);
    if (!item) continue;

    const itemSuffix = `${suffix}_${i}`;

    if (item.kind === "composition") {
      const composition = nextCompositionLibrary.find(
        (c) => c.id === item.compositionId,
      );
      if (!composition) continue;
      const newCompositionId = `${composition.id}_dup_${itemSuffix}`;
      const newComposition: CompositionClip = {
        ...composition,
        id: newCompositionId,
        filePath: composition.filePath.replace(
          /\.composition\.json$/i,
          `_dup_${itemSuffix}.composition.json`,
        ),
      };
      const newBinItem: ProjectBinItem = {
        id: `bin_comp_${newCompositionId}`,
        kind: "composition",
        name: `${item.name} copy`,
        compositionId: newCompositionId,
      };
      const existingIndex = bin.findIndex((i) => i.id === itemId);
      bin = [
        ...bin.slice(0, existingIndex + 1),
        newBinItem,
        ...bin.slice(existingIndex + 1),
      ];
      nextCompositionLibrary = [...nextCompositionLibrary, newComposition];
    } else if (item.kind === "internal-file") {
      const newBinItem: ProjectBinItem = {
        id: `bin_file_${itemSuffix}`,
        kind: "internal-file",
        name: `${item.name} copy`,
        language: item.language,
        source: item.source,
      };
      const existingIndex = bin.findIndex((i) => i.id === itemId);
      bin = [
        ...bin.slice(0, existingIndex + 1),
        newBinItem,
        ...bin.slice(existingIndex + 1),
      ];
    } else if (item.kind === "timeline") {
      const timeline = nextTimelines.find((t) => t.id === item.timelineId);
      if (!timeline) continue;
      const newTimelineId = `${timeline.id.replace(/\.timeline\.json$/i, "")}_dup_${itemSuffix}.timeline.json`;
      const newTimeline: TimelineDocument = {
        ...timeline,
        id: newTimelineId,
        filePath: newTimelineId,
      };
      const newBinItem: ProjectBinItem = {
        id: `bin_timeline_${newTimelineId}`,
        kind: "timeline",
        name: `${item.name} copy`,
        timelineId: newTimelineId,
      };
      const existingIndex = bin.findIndex((i) => i.id === itemId);
      bin = [
        ...bin.slice(0, existingIndex + 1),
        newBinItem,
        ...bin.slice(existingIndex + 1),
      ];
      nextTimelines = [...nextTimelines, newTimeline];
    } else if (item.kind === "external-proxy") {
      const newBinItem: ProjectBinItem = {
        id: `bin_proxy_${itemSuffix}`,
        kind: "external-proxy",
        name: `${item.name} copy`,
        path: item.path,
      };
      const existingIndex = bin.findIndex((i) => i.id === itemId);
      bin = [
        ...bin.slice(0, existingIndex + 1),
        newBinItem,
        ...bin.slice(existingIndex + 1),
      ];
    }
  }

  return {
    ...project,
    bin,
    compositionLibrary: nextCompositionLibrary,
    timelines: nextTimelines,
  };
}

export function duplicateBinItemInProject(
  project: ProjectManifest,
  itemId: string,
): ProjectManifest {
  return duplicateBinItemsInProject(project, [itemId]);
}

export function moveBinItemInProject(
  project: ProjectManifest,
  sourceId: string,
  intent: BinDropIntent,
): ProjectManifest {
  const bin = normalizeProjectBin(project);
  if (
    sourceId === intent.targetId ||
    binContainsId(bin, sourceId, intent.targetId)
  )
    return { ...project, bin };
  const removed = removeBinItem(bin, sourceId);
  if (!removed.item) return { ...project, bin };
  if (intent.action === "inside") {
    return {
      ...project,
      bin: appendBinItemsToFolder(removed.items, intent.targetId, [
        removed.item,
      ]),
    };
  }
  return {
    ...project,
    bin: insertBinItemNear(
      removed.items,
      intent.targetId,
      removed.item,
      intent.action,
    ),
  };
}

export function findBinItem(
  items: ProjectBinItem[],
  itemId: string,
): ProjectBinItem | null {
  for (const item of items) {
    if (item.id === itemId) return item;
    if (item.kind === "folder") {
      const found = findBinItem(item.children ?? [], itemId);
      if (found) return found;
    }
  }
  return null;
}

export function findBinItemByName(
  items: ProjectBinItem[],
  name: string,
): ProjectBinItem | null {
  for (const item of items) {
    if (item.name === name) return item;
    if (item.kind === "folder") {
      const found = findBinItemByName(item.children ?? [], name);
      if (found) return found;
    }
  }
  return null;
}

function normalizeBinItems(items: ProjectBinItem[]): ProjectBinItem[] {
  return items.flatMap((item): ProjectBinItem[] => {
    if (item.kind === "folder")
      return [{ ...item, children: normalizeBinItems(item.children ?? []) }];
    if (item.kind === "internal-file")
      return [
        {
          ...item,
          language:
            normalizeEditorLanguage(item.language) ||
            getEditorLanguageFromName(item.name),
          source: item.source ?? "",
        },
      ];
    if (item.kind === "external-proxy" && item.path) return [item];
    if (item.kind === "composition" && item.compositionId) return [item];
    if (item.kind === "timeline" && item.timelineId) return [item];
    return [];
  });
}

function legacyBinFromProject(project: ProjectManifest): ProjectBinItem[] {
  return (project.assets ?? []).map(assetToBinItem);
}

function assetToBinItem(asset: AssetItem): ProjectBinItem {
  if (asset.kind === "folder") {
    return {
      id: asset.id.replace(/^ast_/, "bin_"),
      kind: "folder",
      name: asset.name,
      children: (asset.children ?? []).map(assetToBinItem),
    };
  }
  return {
    id: asset.id.replace(/^ast_/, "bin_proxy_"),
    kind: "external-proxy",
    name: asset.name,
    path: asset.path ?? asset.name,
  };
}

function addMissingRuntimeBinItems(
  bin: ProjectBinItem[],
  project: ProjectManifest,
): ProjectBinItem[] {
  let next = bin;
  const existingCompositionIds = new Set(
    collectBinItems(next).flatMap((item) =>
      item.kind === "composition" ? [item.compositionId] : [],
    ),
  );
  for (const composition of project.compositionLibrary ?? []) {
    if (existingCompositionIds.has(composition.id)) continue;
    next = [
      ...next,
      {
        id: `bin_comp_${composition.id}`,
        kind: "composition",
        name: getDisplayNameFromPath(composition.filePath).replace(
          /\.composition\.json$/i,
          "",
        ),
        compositionId: composition.id,
      },
    ];
  }
  const existingTimelineIds = new Set(
    collectBinItems(next).flatMap((item) =>
      item.kind === "timeline" ? [item.timelineId] : [],
    ),
  );
  for (const timeline of project.timelines ?? []) {
    if (existingTimelineIds.has(timeline.id)) continue;
    next = [
      ...next,
      {
        id: `bin_timeline_${timeline.id}`,
        kind: "timeline",
        name: getDisplayNameFromPath(timeline.filePath || timeline.id).replace(
          /\.timeline\.json$/i,
          "",
        ),
        timelineId: timeline.id,
      },
    ];
  }
  return next;
}

function collectBinItems(items: ProjectBinItem[]): ProjectBinItem[] {
  return items.flatMap((item) =>
    item.kind === "folder"
      ? [item, ...collectBinItems(item.children ?? [])]
      : [item],
  );
}

function getBinSiblingNames(items: ProjectBinItem[], parentFolderId?: string) {
  const siblings = parentFolderId
    ? ((
        findBinItem(items, parentFolderId) as Extract<
          ProjectBinItem,
          { kind: "folder" }
        > | null
      )?.children ?? [])
    : items;
  return siblings.map((item) => item.name);
}

function appendBinItemsToFolder(
  items: ProjectBinItem[],
  folderId: string,
  children: ProjectBinItem[],
): ProjectBinItem[] {
  return items.map((item) => {
    if (item.kind === "folder" && item.id === folderId) {
      const existingIds = new Set((item.children ?? []).map((c) => c.id));
      const uniqueChildren = children.filter((c) => !existingIds.has(c.id));
      return {
        ...item,
        children: [...(item.children ?? []), ...uniqueChildren],
      };
    }
    if (item.kind !== "folder") return item;
    return {
      ...item,
      children: appendBinItemsToFolder(item.children ?? [], folderId, children),
    };
  });
}

function updateBinTree(
  items: ProjectBinItem[],
  itemId: string,
  updater: (item: ProjectBinItem) => ProjectBinItem,
): ProjectBinItem[] {
  return items.map((item) => {
    if (item.id === itemId) return updater(item);
    if (item.kind !== "folder") return item;
    return {
      ...item,
      children: updateBinTree(item.children ?? [], itemId, updater),
    };
  });
}

function removeBinItem(
  items: ProjectBinItem[],
  itemId: string,
): { items: ProjectBinItem[]; item: ProjectBinItem | null } {
  let removed: ProjectBinItem | null = null;
  const next = items.flatMap((item): ProjectBinItem[] => {
    if (item.id === itemId) {
      removed = item;
      return [];
    }
    if (item.kind !== "folder") return [item];
    const child = removeBinItem(item.children ?? [], itemId);
    if (child.item) removed = child.item;
    return [{ ...item, children: child.items }];
  });
  return { items: next, item: removed };
}

function binContainsId(
  items: ProjectBinItem[],
  sourceId: string,
  targetId: string,
): boolean {
  const source = findBinItem(items, sourceId);
  return source?.kind === "folder"
    ? Boolean(findBinItem(source.children ?? [], targetId))
    : false;
}

function insertBinItemNear(
  items: ProjectBinItem[],
  targetId: string,
  source: ProjectBinItem,
  action: "before" | "after",
): ProjectBinItem[] {
  const result: ProjectBinItem[] = [];
  let inserted = false;
  for (const item of items) {
    if (item.id === targetId && action === "before") {
      result.push(source);
      inserted = true;
    }
    if (item.kind === "folder")
      result.push({
        ...item,
        children: insertBinItemNear(
          item.children ?? [],
          targetId,
          source,
          action,
        ),
      });
    else result.push(item);
    if (item.id === targetId && action === "after") {
      result.push(source);
      inserted = true;
    }
  }
  return inserted ? result : [...result, source];
}
