import { useEffect, useState } from "react";
import { clipperHost } from "../clipperHost";
import { projectPersistenceService } from "../services/projectPersistenceService";
import { normalizeProject } from "../../core/project";
import type { ProjectManifest } from "../../core/types";
import { clipperContainerPath, readStoredActiveProjectManifestPath, writeStoredActiveProjectManifestPath } from "./activeProjectManifest";
import { getProjectCompositionSources } from "./projectSources";

export type BootProject = {
  manifestPath: string;
  project: ProjectManifest;
  sourceStatus: string;
  compositionSources: Record<string, string>;
};

async function loadBootProject(): Promise<BootProject> {
  const manifestPath = await readStoredActiveProjectManifestPath();
  const { project } = await projectPersistenceService.loadProject({ manifestPath });
  const normalizedProject = normalizeProject(project);
  const activeManifestPath = clipperContainerPath(manifestPath);

  try {
    await writeStoredActiveProjectManifestPath(activeManifestPath);
  } catch {
    // Browser/dev can still rely on localStorage when host state is unavailable.
  }

  return {
    manifestPath: activeManifestPath,
    project: normalizedProject,
    sourceStatus: `Project loaded from ${activeManifestPath}.`,
    compositionSources: getProjectCompositionSources(normalizedProject),
  };
}

export function useActiveProjectBoot() {
  const [bootProject, setBootProject] = useState<BootProject | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBootProject().then((loadedProject) => {
      if (!cancelled) setBootProject(loadedProject);
    }).catch((error) => {
      if (!cancelled) setBootError(error instanceof Error ? error.message : "Unable to open the active project.");
    });
    return () => { cancelled = true; };
  }, []);

  async function openProjectFromBoot() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;
      const { project } = await projectPersistenceService.loadProject({ manifestPath });
      const normalizedProject = normalizeProject(project);
      const activeManifestPath = clipperContainerPath(manifestPath);
      await writeStoredActiveProjectManifestPath(activeManifestPath);
      setBootProject({
        manifestPath: activeManifestPath,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${activeManifestPath}.`,
        compositionSources: getProjectCompositionSources(normalizedProject),
      });
      setBootError(null);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  return { bootError, bootProject, openProjectFromBoot };
}
