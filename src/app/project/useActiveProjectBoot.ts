import { useEffect, useState } from "react";
import { normalizeProject } from "../../core/project";
import type { ProjectManifest } from "../../core/types";
import { clipperHost } from "../clipperHost";
import { projectPersistenceService } from "../services/projectPersistenceService";
import {
  addRecentProject,
  clearStoredActiveProjectManifestPath,
  readRecentProjects,
  readStoredActiveProjectManifestPath,
  removeRecentProject,
  writeStoredActiveProjectManifestPath,
  type RecentProject,
} from "./activeProjectManifest";
import { getProjectCompositionSources } from "./projectSources";

const bootStateReadTimeoutMs = 3000;

export type BootProject = {
  manifestPath: string;
  project: ProjectManifest;
  sourceStatus: string;
  compositionSources: Record<string, string>;
};

async function loadBootProject(): Promise<BootProject> {
  const manifestPath = await withBootStateTimeout(
    readStoredActiveProjectManifestPath(),
    null,
  );
  if (!manifestPath) throw new Error("NO_STORED_PROJECT");

  const { project } = await projectPersistenceService.loadProject({
    projectPath: manifestPath,
  });
  const normalizedProject = normalizeProject(project);

  try {
    await writeStoredActiveProjectManifestPath(manifestPath);
    await addRecentProject(manifestPath, projectNameFromPath(manifestPath));
  } catch {
    // Browser/dev can still rely on localStorage when host state is unavailable.
  }

  return {
    manifestPath,
    project: normalizedProject,
    sourceStatus: `Project loaded from ${manifestPath}.`,
    compositionSources: getProjectCompositionSources(normalizedProject),
  };
}

async function withBootStateTimeout<T>(
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  let timeout = 0;
  if (typeof window === "undefined") return promise;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = window.setTimeout(
          () => resolve(fallback),
          bootStateReadTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

async function clearStoredActiveProjectManifestPathBestEffort() {
  try {
    await clearStoredActiveProjectManifestPath();
  } catch {
    // Boot fallback must not fail just because persisted state cannot be updated.
  }
}

function projectNameFromPath(projectPath: string) {
  const segments = projectPath.split("/");
  const filename = segments[segments.length - 1] ?? "Untitled.clpr";
  return filename.replace(/\.clpr$/i, "");
}

function isMissingFileError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("enoent") ||
    message.includes("no such file or directory") ||
    message.includes("does not exist") ||
    message.includes("not found")
  );
}

async function createMinimalProject(
  projectPath: string,
  projectName: string,
): Promise<BootProject> {
  const minimalProject: ProjectManifest = {
    id: crypto.randomUUID(),
    name: projectName,
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    timelines: [],
    compositions: [],
    compositionSources: {},
    scenes: [],
    assets: [],
    editorState: {} as ProjectManifest["editorState"],
  };
  const normalized = normalizeProject(minimalProject);

  await projectPersistenceService.saveProject({
    projectPath,
    project: normalized,
  });

  return {
    manifestPath: projectPath,
    project: normalized,
    sourceStatus: `New project created at ${projectPath}.`,
    compositionSources: {},
  };
}

export function useActiveProjectBoot() {
  const [bootProject, setBootProject] = useState<BootProject | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isWelcome, setIsWelcome] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const recents = await withBootStateTimeout(readRecentProjects(), []);
      if (cancelled) return;
      setRecentProjects(recents);

      try {
        const loadedProject = await loadBootProject();
        if (cancelled) return;
        setBootProject(loadedProject);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to open the active project.";
        if (message === "NO_STORED_PROJECT") {
          setIsWelcome(true);
        } else {
          await clearStoredActiveProjectManifestPathBestEffort();
          if (cancelled) return;
          setBootError(message);
          setIsWelcome(true);
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openProjectFromBoot() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;

      const { project } = await projectPersistenceService.loadProject({
        projectPath: manifestPath,
      });
      const normalizedProject = normalizeProject(project);
      await writeStoredActiveProjectManifestPath(manifestPath);
      await addRecentProject(manifestPath, projectNameFromPath(manifestPath));
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject({
        manifestPath,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${manifestPath}.`,
        compositionSources: getProjectCompositionSources(normalizedProject),
      });
      setBootError(null);
      setIsWelcome(false);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "Unable to open project.",
      );
    }
  }

  async function createNewProject(projectName: string) {
    setBootError(null);
    try {
      const manifestPath = await clipperHost.createProject(projectName);
      if (!manifestPath) return false;
      const booted = await createMinimalProject(manifestPath, projectName);
      await writeStoredActiveProjectManifestPath(booted.manifestPath);
      await addRecentProject(
        booted.manifestPath,
        projectNameFromPath(booted.manifestPath),
      );
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject(booted);
      setBootError(null);
      setIsWelcome(false);
      return true;
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "Unable to create project.",
      );
      return false;
    }
  }

  async function deleteRecentProject(project: RecentProject) {
    try {
      try {
        await clipperHost.trashFile(project.path);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
      await removeRecentProject(project.path);
      const recents = await readRecentProjects();
      setRecentProjects(recents);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "Unable to delete project.",
      );
    }
  }

  async function openRecentProject(project: RecentProject) {
    try {
      const manifestPath = project.path;

      const { project: loadedProject } =
        await projectPersistenceService.loadProject({
          projectPath: manifestPath,
        });
      const normalizedProject = normalizeProject(loadedProject);
      await writeStoredActiveProjectManifestPath(manifestPath);
      await addRecentProject(manifestPath, project.name);
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject({
        manifestPath,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${manifestPath}.`,
        compositionSources: getProjectCompositionSources(normalizedProject),
      });
      setBootError(null);
      setIsWelcome(false);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "Unable to open project.",
      );
    }
  }

  async function closeProject() {
    await clearStoredActiveProjectManifestPath();
    setBootProject(null);
    setBootError(null);
    setIsWelcome(true);
  }

  return {
    bootError,
    bootProject,
    isWelcome,
    recentProjects,
    openProjectFromBoot,
    createNewProject,
    openRecentProject,
    deleteRecentProject,
    closeProject,
  };
}
