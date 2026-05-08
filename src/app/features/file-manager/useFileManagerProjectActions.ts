import type { MutableRefObject } from "react";
import toast from "react-hot-toast";
import type { FileManagerTreeSnapshot } from "../../../components/FileManager";
import { compositionFromSource } from "../../../core/compositionSource";
import { getAssetPath } from "../../../core/assetTree";
import type { AssetItem, CompositionClip, EditorState, Part, ProjectManifest, TimelineMode } from "../../../core/types";
import type { ProjectUpdater } from "../../types";
import { clipperHost } from "../../clipperHost";
import type { BuildFileManagerWorkspacePropsInput } from "./FileManagerWorkspace";
import { getDirectoryPath, nextNumberedName } from "./fileManagerPaths";
import { createAssetFolderInProject, deleteAssetFromProject, duplicateAssetInProject, importDroppedAssetsIntoProject, renameAssetInProject, sortAssetsInProject } from "./assetProjectMutations";
import { createCompositionFolderInProject, createCompositionInLibrary, deleteCompositionFileFromProject, duplicateCompositionInProject, moveCompositionInProject, relinkCompositionInProject, renameCompositionInProject, updateCompositionFilePathsInProject } from "./compositionLibraryMutations";
import { applyFileManagerTreeSnapshotToProject, deleteCompositionFolderFromProject, renameCompositionFolderInProject } from "./compositionFolderMutations";
import { createTimelineInProject, deleteTimelineFromProject, moveTimelineInProject, renameTimelineInProject } from "./timelineLibraryMutations";
import { getDisplayNameFromPath, nextNumberedSemanticName } from "../../../core/fileNames";
import { CreateCommand } from "./operations/CreateCommand";
import { DeleteCommand } from "./operations/DeleteCommand";
import { RenameCommand } from "./operations/RenameCommand";
import type { Command } from "./operations/Command";

type FileManagerProjectActions = Omit<BuildFileManagerWorkspacePropsInput["actions"], "reloadProject"> & {
  updateCompositionFilePaths: (moves: Array<{ oldPath: string; newPath: string }>, options?: { save?: boolean }) => void;
};

type UseFileManagerProjectActionsInput = {
  assets: AssetItem[];
  compositionLibrary: CompositionClip[];
  compositionSourcesRef: MutableRefObject<Record<string, string>>;
  defaultEditorState: EditorState;
  part: Part;
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  selectedSceneId: string;
  setCompositionSources: (sources: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  setCurrentSceneTime: (time: number) => void;
  setSelectedPartId: (partId: string) => void;
  setSelectedSceneId: (sceneId: string) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean }) => void;
  updateProject: (updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  watchedProjectDirectory: string;
  executeFileManagerCommand: (command: Command) => Promise<void>;
  scheduleImplicitFileOperationSave: (projectOverride?: ProjectManifest, errorMessage?: string) => void;
  clearNodeSelection: () => void;
  addCompositionFromLibrary: (compositionId: string) => void;
};

export function useFileManagerProjectActions({
  addCompositionFromLibrary,
  assets,
  clearNodeSelection,
  compositionLibrary,
  compositionSourcesRef,
  defaultEditorState,
  part,
  project,
  projectRef,
  selectedSceneId,
  setCompositionSources,
  setCurrentSceneTime,
  setSelectedPartId,
  setSelectedSceneId,
  updateTimelineMode,
  updateEditorState,
  updateProject,
  watchedProjectDirectory,
  executeFileManagerCommand,
  scheduleImplicitFileOperationSave,
}: UseFileManagerProjectActionsInput): FileManagerProjectActions {
  function syncCompositionResult(result: { project: ProjectManifest; compositionSources: Record<string, string> }) {
    compositionSourcesRef.current = result.compositionSources;
    setCompositionSources(result.compositionSources);
    updateProject(result.project, { syncSources: false });
  }

  function updateCompositionFilePaths(moves: Array<{ oldPath: string; newPath: string }>, options: { save?: boolean } = {}) {
    if (moves.length === 0) {
      if (options.save !== false) scheduleImplicitFileOperationSave(projectRef.current);
      return;
    }
    const result = updateCompositionFilePathsInProject(projectRef.current, compositionSourcesRef.current, moves, compositionLibrary);
    if (!result) return;
    compositionSourcesRef.current = result.compositionSources;
    setCompositionSources(result.compositionSources);
    updateProject(result.project, { history: false, syncSources: false });
    if (options.save !== false) scheduleImplicitFileOperationSave(result.project);
  }

  function renameAsset(assetId: string, name: string) {
    updateProject((current) => renameAssetInProject(current, assetId, name));
  }

  function createAssetFolder(parentFolderId?: string) {
    updateProject((current) => createAssetFolderInProject(current, parentFolderId));
  }

  function importDroppedAssets(files: FileList, targetFolderId?: string) {
    updateProject((current) => importDroppedAssetsIntoProject(current, files, targetFolderId));
  }

  async function copyAssetPath(assetId: string) {
    const assetPath = getAssetPath(assets ?? [], assetId, project.assetsPath);
    if (!assetPath) return;

    try {
      await clipperHost.copyText(assetPath);
      toast.success("Asset path copied");
    } catch {
      toast.error("Unable to copy asset path");
    }
  }

  async function copyCompositionPath(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;

    try {
      await clipperHost.copyText(composition.filePath);
      toast.success("Composition path copied");
    } catch {
      toast.error("Unable to copy composition path");
    }
  }

  function revealComposition(compositionId?: string) {
    const composition = compositionId ? compositionLibrary.find((item) => item.id === compositionId) : null;
    void clipperHost.revealFile(composition?.filePath ?? watchedProjectDirectory).catch(() => toast.error("Unable to reveal in Finder."));
  }

  function revealAssetRoot() {
    void clipperHost.revealFile(project.assetsPath).catch(() => toast.error("Unable to reveal in Finder."));
  }

  async function createComposition(folderPath?: string) {
    const safeFolderPath = folderPath && folderPath !== watchedProjectDirectory ? folderPath : "";
    const siblingNames = (compositionLibrary ?? [])
      .filter((composition) => {
        const dir = getDirectoryPath(composition.filePath);
        return dir === safeFolderPath || (dir === "." && safeFolderPath === "");
      })
      .map((composition) => composition.filePath.split("/").pop() || composition.filePath);
    const fileName = nextNumberedSemanticName("untitled", ".composition.ts", siblingNames);
    const filePath = safeFolderPath ? `${safeFolderPath}/${fileName}` : fileName;
    const result = createCompositionInLibrary(projectRef.current, compositionSourcesRef.current, part, filePath);
    syncCompositionResult(result);
  }

  async function createCompositionFolder(parentFolderPath?: string) {
    const safeParent = parentFolderPath && parentFolderPath !== watchedProjectDirectory ? parentFolderPath : "";
    const { folderPath, project: nextProject } = createCompositionFolderInProject(projectRef.current, safeParent, "");
    updateProject(nextProject);
  }

  function createProjectFile(folderPath?: string) {
    const safeFolderPath = folderPath && folderPath !== watchedProjectDirectory ? folderPath : "";
    const fileName = nextNumberedName("untitled.txt", getProjectFileStateSiblingNames(projectRef.current.editorState?.fileManagerState?.tree, safeFolderPath));
    const filePath = safeFolderPath ? `${safeFolderPath}/${fileName}` : fileName;
    void executeFileManagerCommand(new CreateCommand(filePath, fileName, false, "")).catch((error) => {
      console.error(error);
      toast.error("Unable to create file.");
    });
    updateFileManagerState(insertProjectFileStateNode(projectRef.current.editorState?.fileManagerState, safeFolderPath, filePath));
    return filePath;
  }

  function renameProjectFile(filePath: string, name: string) {
    const nextName = name.trim();
    if (!nextName || nextName === filePath.split("/").pop()) return;
    const nextPath = getDirectoryPath(filePath) ? `${getDirectoryPath(filePath)}/${nextName}` : nextName;
    void executeFileManagerCommand(new RenameCommand(filePath, nextName)).catch((error) => {
      console.error(error);
      toast.error("Unable to rename file.");
    });
    updateFileManagerState(renameProjectFileStateNode(projectRef.current.editorState?.fileManagerState, filePath, nextPath));
  }

  function deleteProjectFile(filePath: string) {
    const fileName = filePath.split("/").pop() || filePath;
    void executeFileManagerCommand(new DeleteCommand([{ path: filePath, name: fileName, isDirectory: false }], watchedProjectDirectory)).catch((error) => {
      console.error(error);
      toast.error("Unable to delete file.");
    });
    updateFileManagerState(deleteProjectFileStateNode(projectRef.current.editorState?.fileManagerState, filePath));
  }

  function createTimeline(folderPath?: string) {
    const safeFolderPath = folderPath && folderPath !== watchedProjectDirectory ? folderPath : "";
    const existingNames = (project.timelines ?? []).map(t => getDisplayNameFromPath(t.filePath || t.id));
    const nextName = nextNumberedName("New Timeline", existingNames);
    const fileName = `${nextName}.timeline.json`;
    const filePath = safeFolderPath ? `${safeFolderPath}/${fileName}` : fileName;
    
    updateProject((current) => createTimelineInProject(current, filePath));
    updateTimelineMode("composition");
    setSelectedSceneId(filePath);
    updateEditorState((state) => ({ ...state, selectedSceneId: filePath, selectedTimelineId: filePath, currentSceneTime: 0 }));
    clearNodeSelection();
  }

  function selectTimeline(timelineId: string) {
    updateTimelineMode("composition");
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  function renameTimeline(timelineId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    const timeline = project.timelines?.find(t => t.id === timelineId);
    const directory = timeline?.filePath ? timeline.filePath.slice(0, timeline.filePath.lastIndexOf("/") + 1) : "";
    const nextId = `${directory}${nextName}.timeline.json`;

    updateProject((current) => renameTimelineInProject(current, timelineId, name));
    relinkOpenTimeline(timelineId, nextId);
  }

  function moveTimeline(timelineId: string, folderPath: string) {
    const timeline = project.timelines?.find(t => t.id === timelineId);
    const fileName = timeline?.filePath?.split("/").pop() || `${timelineId}.timeline.json`;
    const nextId = folderPath ? `${folderPath}/${fileName}` : fileName;

    updateProject((current) => moveTimelineInProject(current, timelineId, folderPath));
    relinkOpenTimeline(timelineId, nextId);
  }

  function relinkOpenTimeline(oldId: string, nextId: string) {
    if (oldId !== selectedSceneId) return;
    setSelectedSceneId(nextId);
    updateEditorState((state) => ({ ...state, selectedSceneId: nextId, selectedTimelineId: nextId }));
  }

  function deleteTimeline(timelineId: string) {
    if ((project.timelines?.length ?? 0) <= 1) {
      toast.error("A project needs at least one timeline.");
      return;
    }
    const remainingTimelines = (project.timelines ?? []).filter((timeline) => timeline.id !== timelineId);
    const nextTimelineId = remainingTimelines[0]?.id ?? selectedSceneId;
    updateProject((current) => deleteTimelineFromProject(current, timelineId));
    if (timelineId === selectedSceneId) selectTimeline(nextTimelineId);
  }

  async function renameComposition(compositionId: string, name: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;

    const result = renameCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, name, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  function moveComposition(compositionId: string, folderPath: string) {
    const result = moveCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, folderPath, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  async function renameCompositionFolder(folderPath: string, name: string) {
    const result = renameCompositionFolderInProject(projectRef.current, compositionSourcesRef.current, folderPath, name, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  function applyFileManagerTreeSnapshot(snapshot: FileManagerTreeSnapshot) {
    const result = applyFileManagerTreeSnapshotToProject(projectRef.current, compositionSourcesRef.current, compositionLibrary, snapshot, defaultEditorState);
    if (result.compositionSources !== compositionSourcesRef.current) {
      compositionSourcesRef.current = result.compositionSources;
      setCompositionSources(result.compositionSources);
    }
    updateProject(result.project, { syncSources: false });
  }

  function updateFileManagerState(fileManagerState: EditorState["fileManagerState"]) {
    updateEditorState((state) => ({ ...state, fileManagerState }));
  }

  function deleteCompositionFolder(folderPath: string) {
    syncCompositionResult(deleteCompositionFolderFromProject(projectRef.current, compositionSourcesRef.current, folderPath, compositionLibrary));
  }

  function revealCompositionFolder(folderPath: string) {
    void clipperHost.revealFile(folderPath).catch(() => toast.error("Unable to reveal in Finder."));
  }

  function duplicateComposition(compositionId: string) {
    const result = duplicateCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  async function deleteCompositionFile(compositionId: string) {
    const result = deleteCompositionFileFromProject(projectRef.current, compositionSourcesRef.current, compositionId, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  async function findCompositionMedia(compositionId: string, fileName: string) {
    const targetName = fileName.trim();
    if (!targetName) return;
    const searchRoots = Array.from(new Set([
      `${watchedProjectDirectory}/file-manager`,
      watchedProjectDirectory,
      `${watchedProjectDirectory}/compositions`,
    ]));
    let matchedPath: string | null = null;
    for (const root of searchRoots) {
      matchedPath = await clipperHost.findProjectFileByName(root, targetName).catch(() => null);
      if (matchedPath) break;
    }
    if (!matchedPath) {
      toast.error(`Could not find ${targetName}.`);
      return;
    }

    const source = await clipperHost.readTextFile(matchedPath);
    const libraryComposition = compositionLibrary.find((item) => item.id === compositionId);
    const parsedComposition = libraryComposition ? await compositionFromSource({ ...libraryComposition, filePath: matchedPath }, source) : undefined;
    const result = relinkCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, matchedPath, source, compositionLibrary, parsedComposition);
    if (!result) {
      toast.error(`Unable to relink ${targetName}.`);
      return;
    }

    syncCompositionResult(result);
    toast.success(`Relinked ${targetName}.`);
  }

  function duplicateAsset(assetId: string) {
    updateProject((current) => duplicateAssetInProject(current, assetId));
  }

  function deleteAsset(assetId: string) {
    updateProject((current) => deleteAssetFromProject(current, assetId));
  }

  function sortAssets(parentFolderId: string | null, mode: Parameters<FileManagerProjectActions["sortAssets"]>[1]) {
    updateProject((current) => sortAssetsInProject(current, parentFolderId, mode));
  }

  return {
    addComposition: addCompositionFromLibrary,
    applyTreeSnapshot: applyFileManagerTreeSnapshot,
    copyAsset: copyAssetPath,
    copyCompositionPath,
    createComposition,
    createCompositionFolder,
    createProjectFile,
    createFolder: createAssetFolder,
    createTimeline,
    deleteAsset,
    deleteComposition: deleteCompositionFile,
    deleteCompositionFolder,
    deleteProjectFile,
    deleteTimeline,
    dropFiles: importDroppedAssets,
    duplicateAsset,
    duplicateComposition,
    fileManagerStateChange: updateFileManagerState,
    findCompositionMedia,
    openCompositionFile: () => undefined,
    openProjectFile: () => undefined,
    moveComposition,
    moveTimeline,
    renameAsset,
    renameComposition,
    renameCompositionFolder,
    updateCompositionFilePaths,
    renameProjectFile,
    renameTimeline,
    revealAssetRoot,
    revealComposition,
    revealCompositionFolder,
    selectTimeline,
    sortAssets,
  };
}

function insertProjectFileStateNode(fileManagerState: EditorState["fileManagerState"], folderPath: string, filePath: string): EditorState["fileManagerState"] {
  const nextNode = { id: `project-file:${filePath}`, filePath };
  return { ...fileManagerState, tree: insertProjectFileStateNodeIntoTree(fileManagerState?.tree ?? [], folderPath, nextNode) };
}

function insertProjectFileStateNodeIntoTree(nodes: NonNullable<EditorState["fileManagerState"]>["tree"], folderPath: string, nextNode: { id: string; filePath: string }): NonNullable<EditorState["fileManagerState"]>["tree"] {
  if (!folderPath) return [...(nodes ?? []), nextNode];
  return (nodes ?? []).map((node) => {
    if (node.id === `project-folder:${folderPath}`) return { ...node, children: [...(node.children ?? []), nextNode] };
    return node.children ? { ...node, children: insertProjectFileStateNodeIntoTree(node.children, folderPath, nextNode) } : node;
  });
}

function renameProjectFileStateNode(fileManagerState: EditorState["fileManagerState"], oldPath: string, nextPath: string): EditorState["fileManagerState"] {
  return { ...fileManagerState, tree: renameProjectFileStateNodeInTree(fileManagerState?.tree ?? [], oldPath, nextPath) };
}

function deleteProjectFileStateNode(fileManagerState: EditorState["fileManagerState"], filePath: string): EditorState["fileManagerState"] {
  return { ...fileManagerState, tree: deleteProjectFileStateNodeFromTree(fileManagerState?.tree ?? [], filePath) };
}

function renameProjectFileStateNodeInTree(nodes: NonNullable<EditorState["fileManagerState"]>["tree"], oldPath: string, nextPath: string): NonNullable<EditorState["fileManagerState"]>["tree"] {
  return (nodes ?? []).map((node) => {
    if (node.filePath === oldPath) return { ...node, id: `project-file:${nextPath}`, filePath: nextPath };
    return node.children ? { ...node, children: renameProjectFileStateNodeInTree(node.children, oldPath, nextPath) } : node;
  });
}

function deleteProjectFileStateNodeFromTree(nodes: NonNullable<EditorState["fileManagerState"]>["tree"], filePath: string): NonNullable<EditorState["fileManagerState"]>["tree"] {
  return (nodes ?? []).flatMap((node) => {
    if (node.filePath === filePath) return [];
    return node.children ? [{ ...node, children: deleteProjectFileStateNodeFromTree(node.children, filePath) }] : [node];
  });
}

function getProjectFileStateSiblingNames(nodes: NonNullable<EditorState["fileManagerState"]>["tree"] | undefined, folderPath: string): string[] {
  const siblings = folderPath ? findProjectFileStateChildren(nodes ?? [], `project-folder:${folderPath}`) : (nodes ?? []);
  return siblings.flatMap((node) => node.filePath ? [node.filePath.split("/").pop() || node.filePath] : []);
}

function findProjectFileStateChildren(nodes: NonNullable<EditorState["fileManagerState"]>["tree"], folderId: string): FileManagerStateTreeNode[] {
  for (const node of nodes ?? []) {
    if (node.id === folderId) return node.children ?? [];
    const childMatch = node.children ? findProjectFileStateChildren(node.children, folderId) : [];
    if (childMatch.length) return childMatch;
  }
  return [];
}

type FileManagerStateTreeNode = NonNullable<NonNullable<EditorState["fileManagerState"]>["tree"]>[number];
