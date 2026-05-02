import { compositionToSource } from "../../../core/compositionSource";
import { deleteCompositionFromProject, replacePartInProject } from "../../../core/project";
import type { Part, ProjectManifest } from "../../../core/types";
import { compositionFilePathWithName, getDirectoryPath, nextNumberedName } from "./fileManagerPaths";
import { getDisplayNameFromPath, reconstructFileName } from "../../../core/fileNames";

export type CompositionLibraryMutationResult = {
  project: ProjectManifest;
  compositionSources: Record<string, string>;
};

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
    id: filePath,
    filePath,
    duration: 3,
    frame: { width: 1920, height: 1080, style: { background: "#050505" } },
    background: { id: "background", name: "Background", style: { background: "transparent" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
  const source = compositionToSource(composition);
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
    project: replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, id: nextFilePath, filePath: nextFilePath })),
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
    project: {
      ...replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, id: nextFilePath, filePath: nextFilePath })),
      compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])),
    },
  };
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
  const duplicate: Part = { ...composition, id: filePath, filePath, motionMarkers: [], snapshot: [] };
  const nextSources = { ...compositionSources, [duplicate.filePath]: compositionToSource(duplicate) };
  return { compositionSources: nextSources, project: { ...project, compositionSources: nextSources, compositionLibrary: [...(project.compositionLibrary ?? fallbackLibrary), duplicate] } };
}


export function deleteCompositionFileFromProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition) return null;
  const { [composition.filePath]: _removed, ...nextSources } = compositionSources;
  return { compositionSources: nextSources, project: deleteCompositionFromProject({ ...project, compositionSources: nextSources }, compositionId) };
}
