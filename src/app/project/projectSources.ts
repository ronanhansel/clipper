import { compositionToSource } from "../../core/compositionSource";
import type { CompositionClip, ProjectManifest } from "../../core/types";

export function getProjectCompositionSources(project: ProjectManifest) {
  const compositions = Array.from(
    new Map(
      [
        ...project.scenes.flatMap((scene) => scene.compositions),
        ...(project.compositions ?? []),
        ...(project.compositionLibrary ?? []),
      ].map((part) => [part.filePath, part]),
    ).values(),
  ).filter((part) => !part.sourceMissing);
  const embeddedSources = project.compositionSources ?? {};
  return Object.fromEntries(
    compositions.map((part) => {
      const source = embeddedSources[part.filePath];
      if (source === undefined)
        throw new Error(`Composition ${part.filePath} is missing source.`);
      return [part.filePath, source];
    }),
  );
}

export function getSyncedCompositionSources(
  nextProject: ProjectManifest,
  previousProject: ProjectManifest | undefined,
  currentSources: Record<string, string>,
) {
  let changed = false;
  const nextSources = { ...currentSources };
  const nextParts = Array.from(
    new Map(
      [
        ...nextProject.scenes.flatMap((scene) => scene.compositions),
        ...(nextProject.compositions ?? []),
        ...(nextProject.compositionLibrary ?? []),
      ].map((item) => [item.filePath, item]),
    ).values(),
  );
  const previousPartsByPath = new Map(
    [
      ...(previousProject?.scenes.flatMap((scene) => scene.compositions) ?? []),
      ...(previousProject?.compositions ?? []),
      ...(previousProject?.compositionLibrary ?? []),
    ].map((item) => [item.filePath, item]),
  );

  for (const nextPart of nextParts) {
    if (nextPart.sourceMissing) continue;
    const previousPart = previousPartsByPath.get(nextPart.filePath);
    if (nextPart.threeBackgrounds && nextSources[nextPart.filePath]) continue;
    const nextSource = compositionToSource(nextPart);
    if (
      previousPart &&
      compositionSourceFieldsEqual(previousPart, nextPart) &&
      nextSources[nextPart.filePath] === nextSource
    )
      continue;
    nextSources[nextPart.filePath] = nextSource;
    changed = true;
  }

  const livePaths = new Set(
    nextParts
      .filter((part) => !part.sourceMissing)
      .map((part) => part.filePath),
  );
  for (const filePath of Object.keys(nextSources)) {
    if (livePaths.has(filePath)) continue;
    delete nextSources[filePath];
    changed = true;
  }

  return changed ? nextSources : currentSources;
}

function compositionSourceFieldsEqual(
  previousPart: CompositionClip,
  nextPart: CompositionClip,
) {
  return JSON.stringify(previousPart) === JSON.stringify(nextPart);
}
