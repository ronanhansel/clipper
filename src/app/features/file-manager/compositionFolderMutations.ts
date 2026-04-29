import type { FileManagerTreeSnapshot } from "../../../components/FileManager";
import type { EditorState, Part, ProjectManifest } from "../../../core/types";
import { getDirectoryPath, reorderByIntent } from "./fileManagerPaths";

export type CompositionSourceMutationResult = {
  compositionSources: Record<string, string>;
  project: ProjectManifest;
};

function remapFolderPath(path: string, folderPath: string, nextFolderPath: string) {
  return path === folderPath || path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path;
}

function remapSourcesForFolder(sources: Record<string, string>, folderPath: string, nextFolderPath: string) {
  return Object.fromEntries(Object.entries(sources).map(([path, source]) => [path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path, source]));
}

export function reorderCompositionInProject(project: ProjectManifest, compositionLibrary: Part[], sourceCompositionId: string, targetCompositionId: string, action: "before" | "after") {
  if (sourceCompositionId === targetCompositionId) return project;
  const library = project.compositionLibrary ?? compositionLibrary;
  const sourceIndex = library.findIndex((composition) => composition.id === sourceCompositionId);
  const targetIndex = library.findIndex((composition) => composition.id === targetCompositionId);
  if (sourceIndex < 0 || targetIndex < 0) return project;
  return { ...project, compositionLibrary: reorderByIntent(library, sourceIndex, targetIndex, action) };
}

export function reorderCompositionFolderInProject(project: ProjectManifest, sourceFolderPath: string, targetFolderPath: string, action: "before" | "after") {
  if (sourceFolderPath === targetFolderPath) return project;
  const folders = project.compositionFolders ?? [];
  const sourceIndex = folders.indexOf(sourceFolderPath);
  const targetIndex = folders.indexOf(targetFolderPath);
  if (sourceIndex < 0 || targetIndex < 0) return project;
  return { ...project, compositionFolders: reorderByIntent(folders, sourceIndex, targetIndex, action) };
}

export function renameCompositionFolderInProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, name: string, compositionLibrary: Part[]): CompositionSourceMutationResult | null {
  const nextName = name.trim().replace(/[/\\]/g, "-");
  if (!nextName) return null;
  const parentPath = getDirectoryPath(folderPath);
  const nextFolderPath = parentPath ? `${parentPath}/${nextName}` : nextName;
  const nextSources = remapSourcesForFolder(compositionSources, folderPath, nextFolderPath);
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionFolders: (project.compositionFolders ?? []).map((path) => remapFolderPath(path, folderPath, nextFolderPath)),
      compositionLibrary: (project.compositionLibrary ?? compositionLibrary).map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item),
    },
  };
}

export function moveCompositionFolderInProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, parentFolderPath: string, compositionLibrary: Part[]): CompositionSourceMutationResult | null {
  if (parentFolderPath === folderPath || parentFolderPath.startsWith(`${folderPath}/`)) return null;
  const folderName = folderPath.slice(folderPath.lastIndexOf("/") + 1);
  const nextFolderPath = parentFolderPath ? `${parentFolderPath}/${folderName}` : folderName;
  if (nextFolderPath === folderPath) return null;
  const nextSources = remapSourcesForFolder(compositionSources, folderPath, nextFolderPath);
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionFolders: Array.from(new Set((project.compositionFolders ?? []).map((path) => remapFolderPath(path, folderPath, nextFolderPath)))),
      compositionLibrary: (project.compositionLibrary ?? compositionLibrary).map((item) => item.filePath.startsWith(`${folderPath}/`) ? { ...item, filePath: `${nextFolderPath}${item.filePath.slice(folderPath.length)}` } : item),
    },
  };
}

export function deleteCompositionFolderFromProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, compositionLibrary: Part[]): CompositionSourceMutationResult {
  const affectedCompositions = compositionLibrary.filter((item) => item.filePath.startsWith(`${folderPath}/`));
  const affectedIds = new Set(affectedCompositions.map((item) => item.id));
  const nextSources = Object.fromEntries(Object.entries(compositionSources).filter(([path]) => !path.startsWith(`${folderPath}/`)));
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionFolders: (project.compositionFolders ?? []).filter((path) => path !== folderPath && !path.startsWith(`${folderPath}/`)),
      compositionLibrary: (project.compositionLibrary ?? compositionLibrary).filter((item) => !affectedIds.has(item.id)),
      timelines: (project.timelines ?? []).map((timeline) => ({ ...timeline, clips: timeline.clips.filter((clip) => !affectedIds.has(clip.compositionId)) })),
    },
  };
}

export function applyFileManagerTreeSnapshotToProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionLibrary: Part[], snapshot: FileManagerTreeSnapshot, defaultEditorState: EditorState): CompositionSourceMutationResult {
  const library = project.compositionLibrary ?? compositionLibrary;
  const timelines = project.timelines ?? [];
  let nextSources = compositionSources;

  for (const composition of library) {
    const nextFilePath = snapshot.compositionFilePaths[composition.id];
    if (!nextFilePath || nextFilePath === composition.filePath) continue;
    const source = nextSources[composition.filePath];
    const { [composition.filePath]: _removed, ...rest } = nextSources;
    nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
  }

  const nextCompositionById = new Map(library.map((composition) => [composition.id, { ...composition, filePath: snapshot.compositionFilePaths[composition.id] ?? composition.filePath }]));
  const orderedCompositionIds = new Set(snapshot.compositionOrder);
  const nextTimelineById = new Map(timelines.map((timeline) => [timeline.id, { ...timeline, filePath: snapshot.timelineFilePaths[timeline.id] ?? timeline.filePath }]));
  const orderedTimelineIds = new Set(snapshot.timelineOrder);

  return {
    compositionSources: nextSources,
    project: {
      ...project,
      assets: snapshot.assets,
      compositionSources: nextSources,
      compositionFolders: snapshot.compositionFolders,
      editorState: { ...(project.editorState ?? defaultEditorState), fileManagerState: snapshot.fileManagerState },
      compositionLibrary: [...snapshot.compositionOrder.flatMap((id) => nextCompositionById.get(id) ?? []), ...library.filter((composition) => !orderedCompositionIds.has(composition.id)).map((composition) => nextCompositionById.get(composition.id) ?? composition)],
      timelines: [...snapshot.timelineOrder.flatMap((id) => nextTimelineById.get(id) ?? []), ...timelines.filter((timeline) => !orderedTimelineIds.has(timeline.id)).map((timeline) => nextTimelineById.get(timeline.id) ?? timeline)],
    },
  };
}
