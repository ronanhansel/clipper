import { compositionToSource } from "../../../core/compositionSource";
import { deleteCompositionFromProject, replacePartInProject } from "../../../core/project";
import type { Part, ProjectManifest } from "../../../core/types";
import { compositionFilePathWithName, getDirectoryPath, nextNumberedName } from "./fileManagerPaths";

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

export function createCompositionInLibrary(project: ProjectManifest, compositionSources: Record<string, string>, basePart: Part, folderPath: string, compositionId: string): CompositionLibraryMutationResult {
  const composition: Part = {
    ...basePart,
    id: compositionId,
    name: "New Composition",
    filePath: `${folderPath}/${compositionId}.ts`,
    duration: 3,
    objects: [],
    snapshot: [],
    zoomMarkers: [],
    translationMarkers: [],
  };
  const nextSources = { ...compositionSources, [composition.filePath]: compositionToSource(composition) };
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionLibrary: [...(project.compositionLibrary ?? []), composition],
      compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])),
    },
  };
}

export function createCompositionFolderInProject(project: ProjectManifest, parentFolderPath: string, fallbackTimelineDirectory: string) {
  const folderName = nextNumberedName("New folder", getProjectFolderSiblingNames(project, parentFolderPath, fallbackTimelineDirectory));
  const folderPath = `${parentFolderPath}/${folderName}`;
  return { ...project, compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])) };
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
    project: replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, name: nextName, filePath: nextFilePath })),
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
      ...replacePartInProject({ ...project, compositionSources: nextSources, compositionLibrary: project.compositionLibrary ?? fallbackLibrary }, compositionId, (item) => ({ ...item, filePath: nextFilePath })),
      compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])),
    },
  };
}

export function duplicateCompositionInProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, duplicateId: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition) return null;
  const duplicate: Part = { ...composition, id: duplicateId, name: `${composition.name} copy`, filePath: `${getDirectoryPath(composition.filePath)}/${duplicateId}.ts`, zoomMarkers: [], translationMarkers: [], snapshot: [] };
  const nextSources = { ...compositionSources, [duplicate.filePath]: compositionToSource(duplicate) };
  return { compositionSources: nextSources, project: { ...project, compositionSources: nextSources, compositionLibrary: [...(project.compositionLibrary ?? fallbackLibrary), duplicate] } };
}

export function deleteCompositionFileFromProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionId: string, fallbackLibrary: Part[]): CompositionLibraryMutationResult | null {
  const composition = fallbackLibrary.find((item) => item.id === compositionId);
  if (!composition) return null;
  const { [composition.filePath]: _removed, ...nextSources } = compositionSources;
  return { compositionSources: nextSources, project: deleteCompositionFromProject({ ...project, compositionSources: nextSources }, compositionId) };
}
