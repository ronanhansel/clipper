import type { MutableRefObject } from "react";
import toast from "react-hot-toast";
import { compositionFromSource } from "../../../core/compositionSource";
import { getAssetPath, type AssetSortMode } from "../../../core/assetTree";
import type {
  AssetItem,
  CompositionClip,
  EditorState,
  Part,
  ProjectManifest,
  TimelineMode,
} from "../../../core/types";
import type { ProjectUpdater } from "../../types";
import { clipperHost } from "../../clipperHost";
import { getDirectoryPath, nextNumberedName } from "./binPaths";
import {
  createAssetFolderInProject,
  deleteAssetFromProject,
  duplicateAssetInProject,
  importDroppedAssetsIntoProject,
  findAssetByNameInProject,
  renameAssetInProject,
  moveAssetInProject,
  sortAssetsInProject,
} from "./assetProjectMutations";
import {
  addCompositionBinItemInProject,
  addTimelineBinItemInProject,
  type BinProxyImportFile,
  createBinFolderInProject,
  createInternalFileInProject,
  deleteBinItemInProject,
  deleteBinItemsInProject,
  duplicateBinItemInProject,
  duplicateBinItemsInProject,
  findBinItem,
  findBinItemByName,
  importDroppedFilesToBin,
  moveBinItemInProject,
  normalizeProjectBin,
  renameBinItemInProject,
  updateInternalFileInProject,
} from "./projectBinMutations";
import {
  createCompositionFolderInProject,
  createCompositionInLibrary,
  deleteCompositionFileFromProject,
  duplicateCompositionInProject,
  moveCompositionInProject,
  relinkCompositionInProject,
  renameCompositionInProject,
  updateCompositionFilePathsInProject,
} from "./compositionLibraryMutations";
import {
  deleteCompositionFolderFromProject,
  renameCompositionFolderInProject,
} from "./compositionFolderMutations";
import {
  createTimelineInProject,
  deleteTimelineFromProject,
  moveTimelineInProject,
  renameTimelineInProject,
} from "./timelineLibraryMutations";
import {
  getDisplayNameFromPath,
  nextNumberedSemanticName,
} from "../../../core/fileNames";

type UseFileManagerProjectActionsInput = {
  assets: AssetItem[];
  compositionLibrary: CompositionClip[];
  compositionSourcesRef: MutableRefObject<Record<string, string>>;
  defaultEditorState: EditorState;
  part: Part;
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  selectedSceneId: string;
  setCompositionSources: (
    sources:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  setCurrentSceneTime: (time: number) => void;
  setSelectedPartId: (partId: string) => void;
  setSelectedSceneId: (sceneId: string) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
  updateEditorState: (
    updater: (state: EditorState) => EditorState,
    options?: { history?: boolean; coalesceHistory?: boolean },
  ) => void;
  updateProject: (
    updater: ProjectUpdater,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
    },
  ) => void;
  projectDirectory: string;
  scheduleImplicitFileOperationSave: (
    projectOverride?: ProjectManifest,
    errorMessage?: string,
  ) => void;
  clearNodeSelection: () => void;
  addCompositionFromLibrary: (compositionId: string) => void;
};

export function useBinProjectActions({
  addCompositionFromLibrary,
  assets,
  projectDirectory,
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
  scheduleImplicitFileOperationSave,
}: UseFileManagerProjectActionsInput) {
  function syncCompositionResult(result: {
    project: ProjectManifest;
    compositionSources: Record<string, string>;
  }) {
    compositionSourcesRef.current = result.compositionSources;
    setCompositionSources(result.compositionSources);
    updateProject(result.project, { syncSources: false });
  }

  function updateCompositionFilePaths(
    moves: Array<{ oldPath: string; newPath: string }>,
    options: { save?: boolean } = {},
  ) {
    if (moves.length === 0) {
      if (options.save !== false)
        scheduleImplicitFileOperationSave(projectRef.current);
      return;
    }
    const result = updateCompositionFilePathsInProject(
      projectRef.current,
      compositionSourcesRef.current,
      moves,
      compositionLibrary,
    );
    if (!result) return;
    compositionSourcesRef.current = result.compositionSources;
    setCompositionSources(result.compositionSources);
    updateProject(result.project, { history: false, syncSources: false });
    if (options.save !== false)
      scheduleImplicitFileOperationSave(result.project);
  }

  function renameAsset(assetId: string, name: string) {
    updateProject((current) => renameAssetInProject(current, assetId, name));
  }

  function createAssetFolder(parentFolderId?: string) {
    updateProject((current) =>
      createAssetFolderInProject(current, parentFolderId),
    );
  }

  function importDroppedAssets(files: FileList, targetFolderId?: string) {
    updateProject((current) =>
      importDroppedAssetsIntoProject(current, files, targetFolderId),
    );
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
    const composition = compositionLibrary.find(
      (item) => item.id === compositionId,
    );
    if (!composition) return;

    try {
      await clipperHost.copyText(composition.filePath);
      toast.success("Composition path copied");
    } catch {
      toast.error("Unable to copy composition path");
    }
  }

  function revealComposition(compositionId?: string) {
    const composition = compositionId
      ? compositionLibrary.find((item) => item.id === compositionId)
      : null;
    void clipperHost
      .revealFile(composition?.filePath ?? projectDirectory)
      .catch(() => toast.error("Unable to reveal in Finder."));
  }

  function revealAssetRoot() {
    void clipperHost
      .revealFile(project.assetsPath)
      .catch(() => toast.error("Unable to reveal in Finder."));
  }

  async function createComposition(folderPath?: string) {
    const safeFolderPath =
      folderPath && folderPath !== projectDirectory ? folderPath : "";
    const siblingNames = (compositionLibrary ?? [])
      .filter((composition) => {
        const dir = getDirectoryPath(composition.filePath);
        return dir === safeFolderPath || (dir === "." && safeFolderPath === "");
      })
      .map(
        (composition) =>
          composition.filePath.split("/").pop() || composition.filePath,
      );
    const fileName = nextNumberedSemanticName(
      "untitled",
      ".composition.json",
      siblingNames,
    );
    const filePath = safeFolderPath
      ? `${safeFolderPath}/${fileName}`
      : fileName;
    const result = createCompositionInLibrary(
      projectRef.current,
      compositionSourcesRef.current,
      part,
      filePath,
    );
    syncCompositionResult(result);
  }

  async function createCompositionFolder(parentFolderPath?: string) {
    const safeParent =
      parentFolderPath && parentFolderPath !== projectDirectory
        ? parentFolderPath
        : "";
    const { folderPath, project: nextProject } =
      createCompositionFolderInProject(projectRef.current, safeParent, "");
    updateProject(nextProject);
  }

  function createTimeline(folderPath?: string) {
    const safeFolderPath =
      folderPath && folderPath !== projectDirectory ? folderPath : "";
    const existingNames = (project.timelines ?? []).map((t) =>
      getDisplayNameFromPath(t.filePath || t.id),
    );
    const nextName = nextNumberedName("New Timeline", existingNames);
    const fileName = `${nextName}.timeline.json`;
    const filePath = safeFolderPath
      ? `${safeFolderPath}/${fileName}`
      : fileName;

    const beforeIds = new Set((project.timelines ?? []).map((t) => t.id));
    updateProject((current) => createTimelineInProject(current, filePath));

    // Find the new timeline to get its stable ID
    const created = (projectRef.current.timelines ?? []).find(
      (t) => !beforeIds.has(t.id),
    );
    const timelineId = created?.id ?? filePath;

    updateTimelineMode("direct");
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({
      ...state,
      selectedSceneId: timelineId,
      selectedTimelineId: timelineId,
      currentSceneTime: 0,
    }));
    clearNodeSelection();
  }

  function selectTimeline(timelineId: string) {
    updateTimelineMode("direct");
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({
      ...state,
      selectedSceneId: timelineId,
      selectedTimelineId: timelineId,
      currentSceneTime: 0,
    }));
    clearNodeSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  function renameTimeline(timelineId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    updateProject((current) =>
      renameTimelineInProject(current, timelineId, name),
    );
  }

  function moveTimeline(timelineId: string, folderPath: string) {
    updateProject((current) =>
      moveTimelineInProject(current, timelineId, folderPath),
    );
  }

  function relinkOpenTimeline(_oldId: string, _nextId: string) {
    // Timeline IDs are now stable; renames/moves only change filePath.
  }

  function deleteTimeline(timelineId: string) {
    if ((project.timelines?.length ?? 0) <= 1) {
      toast.error("A project needs at least one timeline.");
      return;
    }
    const remainingTimelines = (project.timelines ?? []).filter(
      (timeline) => timeline.id !== timelineId,
    );
    const nextTimelineId = remainingTimelines[0]?.id ?? selectedSceneId;
    updateProject((current) => deleteTimelineFromProject(current, timelineId));
    if (timelineId === selectedSceneId) selectTimeline(nextTimelineId);
  }

  async function renameComposition(compositionId: string, name: string) {
    const composition = compositionLibrary.find(
      (item) => item.id === compositionId,
    );
    if (!composition) return;

    const result = renameCompositionInProject(
      projectRef.current,
      compositionSourcesRef.current,
      compositionId,
      name,
      compositionLibrary,
    );
    if (result) syncCompositionResult(result);
  }

  function moveComposition(compositionId: string, folderPath: string) {
    const result = moveCompositionInProject(
      projectRef.current,
      compositionSourcesRef.current,
      compositionId,
      folderPath,
      compositionLibrary,
    );
    if (result) syncCompositionResult(result);
  }

  async function renameCompositionFolder(folderPath: string, name: string) {
    const result = renameCompositionFolderInProject(
      projectRef.current,
      compositionSourcesRef.current,
      folderPath,
      name,
      compositionLibrary,
    );
    if (result) syncCompositionResult(result);
  }

  function updateFileManagerState(
    fileManagerState: EditorState["fileManagerState"],
  ) {
    updateEditorState((state) => ({ ...state, fileManagerState }));
  }

  function deleteCompositionFolder(folderPath: string) {
    syncCompositionResult(
      deleteCompositionFolderFromProject(
        projectRef.current,
        compositionSourcesRef.current,
        folderPath,
        compositionLibrary,
      ),
    );
  }

  function revealCompositionFolder(folderPath: string) {
    void clipperHost
      .revealFile(folderPath)
      .catch(() => toast.error("Unable to reveal in Finder."));
  }

  function duplicateComposition(compositionId: string) {
    const result = duplicateCompositionInProject(
      projectRef.current,
      compositionSourcesRef.current,
      compositionId,
      compositionLibrary,
    );
    if (result) syncCompositionResult(result);
  }

  async function deleteCompositionFile(compositionId: string) {
    const result = deleteCompositionFileFromProject(
      projectRef.current,
      compositionSourcesRef.current,
      compositionId,
      compositionLibrary,
    );
    if (result) syncCompositionResult(result);
  }

  async function findCompositionMedia(compositionId: string, fileName: string) {
    const targetName = fileName.trim();
    if (!targetName) return;

    // First try to find in project assets registry (proxies)
    const asset = findAssetByNameInProject(projectRef.current, targetName);
    let matchedPath: string | null = asset?.path ?? null;

    if (!matchedPath) {
      // Fallback to disk scan in project directory
      matchedPath = await clipperHost
        .findProjectFileByName(projectDirectory, targetName)
        .catch(() => null);
    }

    if (!matchedPath) {
      toast.error(`Could not find ${targetName}.`);
      return;
    }

    const source = await clipperHost.readTextFile(matchedPath);
    const libraryComposition = compositionLibrary.find(
      (item) => item.id === compositionId,
    );
    const parsedComposition = libraryComposition
      ? await compositionFromSource(
          { ...libraryComposition, filePath: matchedPath },
          source,
        )
      : undefined;
    const result = relinkCompositionInProject(
      projectRef.current,
      compositionSourcesRef.current,
      compositionId,
      matchedPath,
      source,
      compositionLibrary,
      parsedComposition,
    );
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

  function moveAsset(
    sourceId: string,
    targetId: string,
    action: "before" | "after" | "inside",
  ) {
    updateProject((current) =>
      moveAssetInProject(current, sourceId, { targetId, action }),
    );
  }

  function sortAssets(parentFolderId: string | null, mode: AssetSortMode) {
    updateProject((current) =>
      sortAssetsInProject(current, parentFolderId, mode),
    );
  }

  function createBinFolder(parentFolderId?: string) {
    updateProject((current) =>
      createBinFolderInProject(current, parentFolderId),
    );
  }

  function createBinFile(parentFolderId?: string) {
    updateProject((current) =>
      createInternalFileInProject(current, parentFolderId),
    );
  }

  async function createBinComposition(parentFolderId?: string) {
    const beforeIds = new Set(
      (projectRef.current.compositionLibrary ?? []).map((item) => item.id),
    );
    await createComposition();
    const created = (projectRef.current.compositionLibrary ?? []).find(
      (item) => !beforeIds.has(item.id),
    );
    if (created)
      updateProject((current) =>
        addCompositionBinItemInProject(current, created, parentFolderId),
      );
  }

  function createBinTimeline(parentFolderId?: string) {
    const beforeIds = new Set(
      (projectRef.current.timelines ?? []).map((item) => item.id),
    );
    createTimeline();
    const created = (projectRef.current.timelines ?? []).find(
      (item) => !beforeIds.has(item.id),
    );
    if (created)
      updateProject((current) =>
        addTimelineBinItemInProject(current, created, parentFolderId),
      );
  }

  function dropBinFiles(
    files: Iterable<BinProxyImportFile>,
    parentFolderId?: string,
  ) {
    updateProject((current) =>
      importDroppedFilesToBin(current, files, parentFolderId),
    );
  }

  function renameBinItem(itemId: string, name: string) {
    updateProject((current) => renameBinItemInProject(current, itemId, name));
  }

  function moveBinItem(
    sourceId: string,
    targetId: string,
    action: "before" | "after" | "inside",
  ) {
    updateProject((current) =>
      moveBinItemInProject(current, sourceId, { targetId, action }),
    );
  }

  function deleteBinItem(itemId: string) {
    updateProject((current) => deleteBinItemInProject(current, itemId));
  }

  function deleteBinItems(itemIds: string[]) {
    updateProject((current) => deleteBinItemsInProject(current, itemIds));
  }

  function duplicateBinItem(itemId: string) {
    updateProject((current) => duplicateBinItemInProject(current, itemId));
  }

  function duplicateBinItems(itemIds: string[]) {
    updateProject((current) => duplicateBinItemsInProject(current, itemIds));
  }

  function revealBinItem(itemId: string) {
    const item = findBinItem(normalizeProjectBin(projectRef.current), itemId);
    if (item?.kind === "external-proxy")
      void clipperHost.revealAbsolutePath(item.path);
    else toast.error("Only external proxies can be revealed in Finder.");
  }

  function updateInternalFileSource(itemId: string, source: string) {
    updateProject(
      (current) => updateInternalFileInProject(current, itemId, source),
      { history: false },
    );
  }

  return {
    addComposition: addCompositionFromLibrary,
    createBinComposition,
    createBinFile,
    createBinFolder,
    createBinTimeline,
    deleteBinItem,
    deleteBinItems,
    dropBinFiles,
    duplicateBinItem,
    duplicateBinItems,
    findBinItemByName: (name: string) =>
      findBinItemByName(normalizeProjectBin(projectRef.current), name),
    moveBinItem,
    renameBinItem,
    revealBinItem,
    updateInternalFileSource,
    copyAsset: copyAssetPath,
    copyCompositionPath,
    createComposition,
    createCompositionFolder,
    createFolder: createAssetFolder,
    createTimeline,
    deleteAsset,
    deleteComposition: deleteCompositionFile,
    deleteCompositionFolder,
    deleteTimeline,
    dropFiles: importDroppedAssets,
    duplicateAsset,
    duplicateComposition,
    fileManagerStateChange: updateFileManagerState,
    findCompositionMedia,
    openCompositionFile: () => undefined,
    openProjectFile: () => undefined,
    moveAsset,
    moveComposition,
    moveTimeline,
    renameAsset,
    renameComposition,
    renameCompositionFolder,
    updateCompositionFilePaths,
    renameTimeline,
    revealAssetRoot,
    revealComposition,
    revealCompositionFolder,
    selectTimeline,
    sortAssets,
  };
}

function insertProjectFileStateNode(
  fileManagerState: EditorState["fileManagerState"],
  folderPath: string,
  filePath: string,
): EditorState["fileManagerState"] {
  const nextNode = { id: `project-file:${filePath}`, filePath };
  return {
    ...fileManagerState,
    tree: insertProjectFileStateNodeIntoTree(
      fileManagerState?.tree ?? [],
      folderPath,
      nextNode,
    ),
  };
}

function insertProjectFileStateNodeIntoTree(
  nodes: NonNullable<EditorState["fileManagerState"]>["tree"],
  folderPath: string,
  nextNode: { id: string; filePath: string },
): NonNullable<EditorState["fileManagerState"]>["tree"] {
  if (!folderPath) return [...(nodes ?? []), nextNode];
  return (nodes ?? []).map((node) => {
    if (node.id === `project-folder:${folderPath}`)
      return { ...node, children: [...(node.children ?? []), nextNode] };
    return node.children
      ? {
          ...node,
          children: insertProjectFileStateNodeIntoTree(
            node.children,
            folderPath,
            nextNode,
          ),
        }
      : node;
  });
}

function renameProjectFileStateNode(
  fileManagerState: EditorState["fileManagerState"],
  oldPath: string,
  nextPath: string,
): EditorState["fileManagerState"] {
  return {
    ...fileManagerState,
    tree: renameProjectFileStateNodeInTree(
      fileManagerState?.tree ?? [],
      oldPath,
      nextPath,
    ),
  };
}

function deleteProjectFileStateNode(
  fileManagerState: EditorState["fileManagerState"],
  filePath: string,
): EditorState["fileManagerState"] {
  return {
    ...fileManagerState,
    tree: deleteProjectFileStateNodeFromTree(
      fileManagerState?.tree ?? [],
      filePath,
    ),
  };
}

function renameProjectFileStateNodeInTree(
  nodes: NonNullable<EditorState["fileManagerState"]>["tree"],
  oldPath: string,
  nextPath: string,
): NonNullable<EditorState["fileManagerState"]>["tree"] {
  return (nodes ?? []).map((node) => {
    if (node.filePath === oldPath)
      return { ...node, id: `project-file:${nextPath}`, filePath: nextPath };
    return node.children
      ? {
          ...node,
          children: renameProjectFileStateNodeInTree(
            node.children,
            oldPath,
            nextPath,
          ),
        }
      : node;
  });
}

function deleteProjectFileStateNodeFromTree(
  nodes: NonNullable<EditorState["fileManagerState"]>["tree"],
  filePath: string,
): NonNullable<EditorState["fileManagerState"]>["tree"] {
  return (nodes ?? []).flatMap((node) => {
    if (node.filePath === filePath) return [];
    return node.children
      ? [
          {
            ...node,
            children: deleteProjectFileStateNodeFromTree(
              node.children,
              filePath,
            ),
          },
        ]
      : [node];
  });
}

function getProjectFileStateSiblingNames(
  nodes: NonNullable<EditorState["fileManagerState"]>["tree"] | undefined,
  folderPath: string,
): string[] {
  const siblings = folderPath
    ? findProjectFileStateChildren(nodes ?? [], `project-folder:${folderPath}`)
    : (nodes ?? []);
  return siblings.flatMap((node) =>
    node.filePath ? [node.filePath.split("/").pop() || node.filePath] : [],
  );
}

function findProjectFileStateChildren(
  nodes: NonNullable<EditorState["fileManagerState"]>["tree"],
  folderId: string,
): FileManagerStateTreeNode[] {
  for (const node of nodes ?? []) {
    if (node.id === folderId) return node.children ?? [];
    const childMatch = node.children
      ? findProjectFileStateChildren(node.children, folderId)
      : [];
    if (childMatch.length) return childMatch;
  }
  return [];
}

type FileManagerStateTreeNode = NonNullable<
  NonNullable<EditorState["fileManagerState"]>["tree"]
>[number];
