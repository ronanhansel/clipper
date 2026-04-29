import { appendAssetsToFolder, duplicateAssetTree, findAsset, moveAssetTree, removeAsset, sortAssetsInParent, updateAssetTree, type AssetDropIntent, type AssetSortMode } from "../../../core/assetTree";
import { defaultAssets } from "../../../core/project";
import type { AssetItem, ProjectManifest } from "../../../core/types";
import { nextNumberedName } from "./fileManagerPaths";

function getAssetSiblingNames(items: AssetItem[], parentFolderId?: string) {
  const siblings = parentFolderId ? findAsset(items, parentFolderId)?.children ?? [] : items;
  return siblings.map((item) => item.name);
}

export function renameAssetInProject(project: ProjectManifest, assetId: string, name: string): ProjectManifest {
  return { ...project, assets: updateAssetTree(project.assets ?? defaultAssets, assetId, (item) => ({ ...item, name: name.trim() || item.name })) };
}

export function createAssetFolderInProject(project: ProjectManifest, parentFolderId?: string): ProjectManifest {
  const currentAssets = project.assets ?? defaultAssets;
  const folder = { id: `ast_folder_${Date.now().toString(36)}`, name: nextNumberedName("New folder", getAssetSiblingNames(currentAssets, parentFolderId)), kind: "folder" as const, children: [] };
  return { ...project, assets: parentFolderId ? appendAssetsToFolder(currentAssets, parentFolderId, [folder]) : [...currentAssets, folder] };
}

export function importDroppedAssetsIntoProject(project: ProjectManifest, files: FileList, targetFolderId?: string): ProjectManifest {
  const nextFiles = Array.from(files).map((file) => ({ id: `ast_${Date.now().toString(36)}_${file.name}`, name: file.name, kind: "file" as const, path: (file as File & { path?: string }).path || file.name }));
  if (nextFiles.length === 0) return project;
  const currentAssets = project.assets ?? defaultAssets;
  return { ...project, assets: targetFolderId ? appendAssetsToFolder(currentAssets, targetFolderId, nextFiles) : [...currentAssets, ...nextFiles] };
}

export function duplicateAssetInProject(project: ProjectManifest, assetId: string): ProjectManifest {
  return { ...project, assets: duplicateAssetTree(project.assets ?? defaultAssets, assetId) };
}

export function deleteAssetFromProject(project: ProjectManifest, assetId: string): ProjectManifest {
  return { ...project, assets: removeAsset(project.assets ?? defaultAssets, assetId).items };
}

export function moveAssetInProject(project: ProjectManifest, sourceId: string, intent: AssetDropIntent): ProjectManifest {
  if (sourceId === intent.targetId) return project;
  return { ...project, assets: moveAssetTree(project.assets ?? defaultAssets, sourceId, intent) };
}

export function sortAssetsInProject(project: ProjectManifest, parentFolderId: string | null, mode: AssetSortMode): ProjectManifest {
  return { ...project, assets: sortAssetsInParent(project.assets ?? defaultAssets, parentFolderId, mode) };
}
