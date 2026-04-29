import { compositionToSource } from "../../core/compositionSource";
import type { ProjectManifest } from "../../core/types";

export function getProjectCompositionSources(project: ProjectManifest) {
  const compositions = Array.from(new Map([...(project.compositionLibrary ?? []), ...(project.compositions ?? [])].map((part) => [part.filePath, part])).values()).filter((part) => !part.sourceMissing);
  const embeddedSources = project.compositionSources ?? {};
  return Object.fromEntries(compositions.map((part) => {
    const source = embeddedSources[part.filePath] ?? part.source;
    if (source === undefined) throw new Error(`Composition ${part.filePath} is missing source.`);
    return [part.filePath, source];
  }));
}

export function getSyncedCompositionSources(nextProject: ProjectManifest, previousProject: ProjectManifest | undefined, currentSources: Record<string, string>) {
  let changed = false;
  const nextSources = { ...currentSources };
  const nextParts = Array.from(new Map([...nextProject.scenes.flatMap((item) => item.compositions), ...(nextProject.compositionLibrary ?? []), ...(nextProject.compositions ?? [])].map((item) => [item.filePath, item])).values());
  const previousPartsByPath = new Map([...(previousProject?.scenes.flatMap((item) => item.compositions) ?? []), ...(previousProject?.compositionLibrary ?? []), ...(previousProject?.compositions ?? [])].map((item) => [item.filePath, item]));

  for (const nextPart of nextParts) {
    if (nextPart.sourceMissing) continue;
    const previousPart = previousPartsByPath.get(nextPart.filePath);
    if (previousPart && JSON.stringify(previousPart) === JSON.stringify(nextPart)) continue;
    nextSources[nextPart.filePath] = compositionToSource(nextPart);
    changed = true;
  }

  const livePaths = new Set(nextParts.filter((part) => !part.sourceMissing).map((part) => part.filePath));
  for (const filePath of Object.keys(nextSources)) {
    if (livePaths.has(filePath)) continue;
    delete nextSources[filePath];
    changed = true;
  }

  return changed ? nextSources : currentSources;
}
