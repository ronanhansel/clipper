import { compositionToSource } from "../../../core/compositionSource";
import { deleteCompositionFromProject, replacePartInProject } from "../../../core/project";
import type { Part, ProjectManifest } from "../../../core/types";
import { compositionFilePathWithName, getDirectoryPath, nextNumberedName } from "./fileManagerPaths";
import { getDisplayNameFromPath, reconstructFileName } from "../../../core/fileNames";

export type CompositionLibraryMutationResult = {
  project: ProjectManifest;
  compositionSources: Record<string, string>;
};

function createStableCompositionId() {
  return `composition-${crypto.randomUUID()}`;
}

function hashCompositionSource(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getProjectFolderSiblingNames(project: ProjectManifest, parentFolderPath: string, fallbackTimelineDirectory: string) {
  const names = new Set<string>();
  const addChildFolderName = (path: string) => {
    if (path === parentFolderPath || !path.startsWith(`${parentFolderPath}/`)) return;
    const name = path.slice(parentFolderPath.length + 1).split("/")[0]?.trim();
    if (name) names.add(name);
  };
  for (const folder of project.compositionFolders ?? []) addChildFolderName(folder);
  for (const composition of project.compositionLibrary ?? []) addChildFolderName(getDirectoryPath(composition.filePath));
  for (const timeline of project.timelines ?? []) addChildFolderName(getDirectoryPath(timeline.filePath ?? `${fallbackTimelineDirectory}/${timeline.id}.timeline.json`));
  return names;
}

export function createCompositionInLibrary(project: ProjectManifest, compositionSources: Record<string, string>, _basePart: Part, filePath: string): CompositionLibraryMutationResult {
  const composition: Part = {
    id: createStableCompositionId(),
    filePath,
    duration: 3,
    frame: { width: 1920, height: 1080, style: { background: "#050505" } },
    background: { id: "background", name: "Background", style: { background: "transparent" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
  const source = compositionToSource(composition);
  composition.sourceHash = hashCompositionSource(source);
  const nextSources = { ...compositionSources, [composition.filePath]: source };
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionLibrary: [...(project.compositionLibrary ?? []), { ...composition, source }],
      compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), getDirectoryPath(filePath)])),
    },
  };
}

export function createCompositionFolderInProject(project: ProjectManifest, parentFolderPath: string, fallbackTimelineDirectory: string) {
  const folderName = nextNumberedName("New folder", getProjectFolderSiblingNames(project, parentFolderPath, fallbackTimelineDirectory));
  const folderPath = parentFolderPath ? `${parentFolderPath}/${folderName}` : folderName;
  return {
    folderPath,
    project: { ...project, compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])) }
  };
}

export function renameCompositionInProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, name: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  const nextName = name.trim();
  if (!composition || !nextName) return null;
  const nextFilePath = compositionFilePathWithName(composition.filePath, composition.id, nextName);
  const source = compositionSources[composition.filePath];
  const { [composition.filePath]: _removed, ...rest } = compositionSources;
  const nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
  return {
    compositionSources: nextSources,
    project: relinkEditorStatePaths(replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, filePath: nextFilePath })), composition.filePath, nextFilePath),
  };
}

export function moveCompositionInProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, folderPath: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition || getDirectoryPath(composition.filePath) === folderPath) return null;
  const fileName = composition.filePath.slice(composition.filePath.lastIndexOf("/") + 1);
  const nextFilePath = `${folderPath}/${fileName}`;
  const source = compositionSources[composition.filePath];
  const { [composition.filePath]: _removed, ...rest } = compositionSources;
  const nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
  return {
    compositionSources: nextSources,
    project: relinkEditorStatePaths({
      ...replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, filePath: nextFilePath })),
      compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])),
    }, composition.filePath, nextFilePath),
  };
}

export function updateCompositionFilePathsInProject(project: ProjectManifest, compositionSources: Record<string, string>, pathMoves: Array<{ oldPath: string; newPath: string }>, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const library = project.compositionLibrary ?? fallbackLibrary;
  if (pathMoves.length === 0 || library.length === 0) return null;

  let changed = false;
  let nextSources = compositionSources;
  const remapComposition = <T extends Part>(composition: T): T => {
    const nextFilePath = remapMovedFilePath(composition.filePath, pathMoves);
    if (nextFilePath === composition.filePath) return composition;
    changed = true;
    const source = nextSources[composition.filePath];
    const { [composition.filePath]: _removed, ...rest } = nextSources;
    nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
    return { ...composition, filePath: nextFilePath } as T;
  };
  const nextLibrary = library.map(remapComposition);
  const nextCompositions = project.compositions?.map(remapComposition);

  if (!changed) return null;
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositions: nextCompositions,
      compositionLibrary: nextLibrary,
    },
  };
}

function remapMovedFilePath(filePath: string, pathMoves: Array<{ oldPath: string; newPath: string }>) {
  let nextPath = filePath;
  for (const move of pathMoves) {
    if (nextPath === move.oldPath) nextPath = move.newPath;
    else if (nextPath.startsWith(`${move.oldPath}/`)) nextPath = `${move.newPath}${nextPath.slice(move.oldPath.length)}`;
  }
  return nextPath;
}

function relinkEditorStatePaths(project: ProjectManifest, oldPath: string, nextPath: string): ProjectManifest {
  const editorState = project.editorState;
  if (!editorState) return project;
  return {
    ...project,
    editorState: {
      ...editorState,
      selectedSceneId: editorState.selectedSceneId === oldPath ? nextPath : editorState.selectedSceneId,
      selectedTimelineId: editorState.selectedTimelineId === oldPath ? nextPath : editorState.selectedTimelineId,
      selectedPartId: editorState.selectedPartId === oldPath ? nextPath : editorState.selectedPartId,
      editorSession: editorState.editorSession ? {
        ...editorState.editorSession,
        activeTabId: editorState.editorSession.activeTabId === oldPath ? nextPath : editorState.editorSession.activeTabId,
        tabs: editorState.editorSession.tabs.map((tab) => tab.id === oldPath || tab.filePath === oldPath ? { ...tab, id: nextPath, filePath: nextPath } : tab),
      } : editorState.editorSession,
      editor: relinkKeyedState(editorState.editor, oldPath, nextPath),
      code: relinkKeyedState(editorState.code, oldPath, nextPath),
    },
  };
}

function relinkKeyedState<T>(state: Record<string, T> | undefined, oldPath: string, nextPath: string): Record<string, T> | undefined {
  if (!state || !(oldPath in state) || nextPath in state) return state;
  const { [oldPath]: value, ...rest } = state;
  return { ...rest, [nextPath]: value };
}

export function duplicateCompositionInProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition) return null;
  const directoryPath = getDirectoryPath(composition.filePath);
  const siblingNames = (project.compositionLibrary ?? fallbackLibrary)
    .filter((item) => getDirectoryPath(item.filePath) === directoryPath)
    .map((item) => item.filePath.split("/").pop() || item.filePath);
  const sourceFileName = composition.filePath.split("/").pop() || "untitled.composition.ts";
  const duplicateName = nextNumberedName(`${getDisplayNameFromPath(composition.filePath)} copy`, siblingNames.map((name) => name.replace(/\.composition\.ts$/, "")));
  const fileName = reconstructFileName(duplicateName, sourceFileName);
  const filePath = directoryPath ? `${directoryPath}/${fileName}` : fileName;
  const duplicateSource = compositionToSource({ ...composition, filePath });
  const duplicate: Part = { ...composition, id: createStableCompositionId(), filePath, sourceHash: hashCompositionSource(duplicateSource), motionMarkers: [], snapshot: [] };
  const nextSources = { ...compositionSources, [duplicate.filePath]: duplicateSource };
  return { compositionSources: nextSources, project: { ...project, compositionSources: nextSources, compositionLibrary: [...(project.compositionLibrary ?? fallbackLibrary), duplicate] } };
}


export function deleteCompositionFileFromProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition) return null;
  const { [composition.filePath]: _removed, ...nextSources } = compositionSources;
  return { compositionSources: nextSources, project: deleteCompositionFromProject({ ...project, compositionSources: nextSources }, compositionId) };
}

export function relinkCompositionInProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, nextFilePath: string, source: string, fallbackLibrary: Part[], parsedComposition?: Part): CompositionLibraryMutationResult | null {
  const library = project.compositionLibrary ?? fallbackLibrary;
  const libraryComposition = library.find((item) => item.id === compositionId);
  const composition = libraryComposition ?? null;
  if (!composition || !nextFilePath.trim()) return null;
  const rest = Object.fromEntries(Object.entries(compositionSources).filter(([path]) => path !== composition.filePath));
  const nextSources = { ...rest, [nextFilePath]: source };
  const restoredComposition = parsedComposition ? { ...parsedComposition, id: composition.id, sourceHash: hashCompositionSource(source), source } : { ...composition, sourceHash: hashCompositionSource(source), source };
  const nextLibrary = library.map((item) => item.id === compositionId ? {
    ...restoredComposition,
    id: composition.id,
    filePath: nextFilePath,
    sourceMissing: undefined,
  } : item);
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionLibrary: nextLibrary,
    },
  };
}
