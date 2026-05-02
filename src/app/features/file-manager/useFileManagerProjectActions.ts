import { nanoid } from "nanoid";
import type { MutableRefObject } from "react";
import toast from "react-hot-toast";
import type { FileManagerTreeSnapshot } from "../../../components/FileManager";
import { getAssetPath } from "../../../core/assetTree";
import type { AssetItem, CompositionClip, EditorState, Part, ProjectManifest } from "../../../core/types";
import type { ProjectUpdater } from "../../types";
import { clipperHost } from "../../clipperHost";
import type { BuildFileManagerWorkspacePropsInput } from "./FileManagerWorkspace";
import { compositionFilePathWithName, getDirectoryPath, nextNumberedName } from "./fileManagerPaths";
import { createAssetFolderInProject, deleteAssetFromProject, duplicateAssetInProject, importDroppedAssetsIntoProject, renameAssetInProject, sortAssetsInProject } from "./assetProjectMutations";
import { createCompositionFolderInProject, createCompositionInLibrary, deleteCompositionFileFromProject, duplicateCompositionInProject, getProjectFolderSiblingNames, moveCompositionInProject, renameCompositionInProject } from "./compositionLibraryMutations";
import { applyFileManagerTreeSnapshotToProject, deleteCompositionFolderFromProject, renameCompositionFolderInProject } from "./compositionFolderMutations";
import { createTimelineInProject, deleteTimelineFromProject, moveTimelineInProject, renameTimelineInProject } from "./timelineLibraryMutations";

type FileManagerProjectActions = Omit<BuildFileManagerWorkspacePropsInput["actions"], "reloadProject">;

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
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean }) => void;
  updateProject: (updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  watchedProjectDirectory: string;
  clearNodeSelection: () => void;
  addCompositionFromLibrary: (compositionId: string) => void;
};

function createCompositionId() {
  return nanoid(8);
}

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
  updateEditorState,
  updateProject,
  watchedProjectDirectory,
}: UseFileManagerProjectActionsInput): FileManagerProjectActions {
  function syncCompositionResult(result: { project: ProjectManifest; compositionSources: Record<string, string> }) {
    compositionSourcesRef.current = result.compositionSources;
    setCompositionSources(result.compositionSources);
    updateProject(result.project, { syncSources: false });
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
      await navigator.clipboard.writeText(assetPath);
      toast.success("Asset path copied");
    } catch {
      toast.error("Unable to copy asset path");
    }
  }

  async function copyCompositionPath(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;

    try {
      await navigator.clipboard.writeText(composition.filePath);
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

  async function createComposition(folderPath = watchedProjectDirectory) {
    const result = createCompositionInLibrary(projectRef.current, compositionSourcesRef.current, part, folderPath, createCompositionId());
    const newComposition = result.project.compositionLibrary![result.project.compositionLibrary!.length - 1];
    await clipperHost.writeTextFile(newComposition.filePath, newComposition.source!).catch(() => toast.error("Unable to create composition file"));
    syncCompositionResult(result);
  }

  async function createCompositionFolder(parentFolderPath = watchedProjectDirectory) {
    const { folderPath, project: nextProject } = createCompositionFolderInProject(projectRef.current, parentFolderPath, watchedProjectDirectory);
    await clipperHost.createDirectory(folderPath).catch(() => toast.error("Unable to create folder"));
    updateProject(nextProject);
  }

  function createTimeline() {
    const timelineId = `tl_${nanoid(8)}`;
    updateProject((current) => createTimelineInProject(current, timelineId, watchedProjectDirectory));
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
  }

  function selectTimeline(timelineId: string) {
    setSelectedSceneId(timelineId);
    updateEditorState((state) => ({ ...state, selectedSceneId: timelineId, selectedTimelineId: timelineId, currentSceneTime: 0 }));
    clearNodeSelection();
    setSelectedPartId("");
    setCurrentSceneTime(0);
  }

  function renameTimeline(timelineId: string, name: string) {
    updateProject((current) => renameTimelineInProject(current, timelineId, name));
  }

  function moveTimeline(timelineId: string, folderPath: string) {
    updateProject((current) => moveTimelineInProject(current, timelineId, folderPath));
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

    const nextFilePath = compositionFilePathWithName(composition.filePath, composition.id, name);
    await clipperHost.renameFile(composition.filePath, nextFilePath).catch(() => toast.error("Unable to rename file"));

    const result = renameCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, name, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  function moveComposition(compositionId: string, folderPath: string) {
    const result = moveCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, folderPath, compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  async function renameCompositionFolder(folderPath: string, name: string) {
    const parentDirectory = getDirectoryPath(folderPath);
    const nextFolderPath = `${parentDirectory}/${name}`;
    await clipperHost.renameFile(folderPath, nextFolderPath).catch(() => toast.error("Unable to rename folder"));

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
    const result = duplicateCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, createCompositionId(), compositionLibrary);
    if (result) syncCompositionResult(result);
  }

  async function deleteCompositionFile(compositionId: string) {
    const composition = compositionLibrary.find((item) => item.id === compositionId);
    if (!composition) return;

    await clipperHost.trashFile(composition.filePath).catch(() => toast.error("Unable to delete file"));

    const result = deleteCompositionFileFromProject(projectRef.current, compositionSourcesRef.current, compositionId, compositionLibrary);
    if (result) syncCompositionResult(result);
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
    moveComposition,
    moveTimeline,
    renameAsset,
    renameComposition,
    renameCompositionFolder,
    renameTimeline,
    revealAssetRoot,
    revealComposition,
    revealCompositionFolder,
    selectTimeline,
    sortAssets,
  };
}
