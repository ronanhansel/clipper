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
import { createCompositionFolderInProject, createCompositionInLibrary, deleteCompositionFileFromProject, duplicateCompositionInProject, moveCompositionInProject, relinkCompositionInProject, renameCompositionInProject } from "./compositionLibraryMutations";
import { applyFileManagerTreeSnapshotToProject, deleteCompositionFolderFromProject, renameCompositionFolderInProject } from "./compositionFolderMutations";
import { createTimelineInProject, deleteTimelineFromProject, moveTimelineInProject, renameTimelineInProject } from "./timelineLibraryMutations";
import { getDisplayNameFromPath, nextNumberedSemanticName } from "../../../core/fileNames";

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
  updateTimelineMode: (mode: TimelineMode) => void;
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean }) => void;
  updateProject: (updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  watchedProjectDirectory: string;
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
    if (timelineId === selectedSceneId) {
      setSelectedSceneId(nextId);
      updateEditorState((state) => ({ ...state, selectedSceneId: nextId, selectedTimelineId: nextId }));
    }
  }

  function moveTimeline(timelineId: string, folderPath: string) {
    const timeline = project.timelines?.find(t => t.id === timelineId);
    const fileName = timeline?.filePath?.split("/").pop() || `${timelineId}.timeline.json`;
    const nextId = folderPath ? `${folderPath}/${fileName}` : fileName;

    updateProject((current) => moveTimelineInProject(current, timelineId, folderPath));
    if (timelineId === selectedSceneId) {
      setSelectedSceneId(nextId);
      updateEditorState((state) => ({ ...state, selectedSceneId: nextId, selectedTimelineId: nextId }));
    }
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
    const referencedByTimeline = projectRef.current.timelines?.some((timeline) => timeline.clips.some((clip) => clip.compositionId === compositionId));
    const baseComposition = libraryComposition ?? (referencedByTimeline ? createRelinkBaseComposition(matchedPath) : null);
    const parsedComposition = baseComposition ? await compositionFromSource({ ...baseComposition, id: matchedPath, filePath: matchedPath }, source) : undefined;
    const result = relinkCompositionInProject(projectRef.current, compositionSourcesRef.current, compositionId, matchedPath, source, compositionLibrary, parsedComposition);
    if (!result) {
      toast.error(`Unable to relink ${targetName}.`);
      return;
    }

    syncCompositionResult(result);
    toast.success(`Relinked ${targetName}.`);
  }

  function createRelinkBaseComposition(filePath: string): Part {
    return { id: filePath, filePath, duration: 5, frame: { width: 1920, height: 1080, style: {} }, background: { id: "background", name: "Background", style: {}, elements: [] }, objects: [], snapshot: [], motionMarkers: [] };
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
    findCompositionMedia,
    openCompositionFile: () => undefined,
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
