import { useEffect, useState } from "react";
import { clipperHost } from "../clipperHost";
import { projectPersistenceService } from "../services/projectPersistenceService";
import { normalizeProject } from "../../core/project";
import type { ProjectManifest } from "../../core/types";
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
import { compositionApiSource } from "../../core/compositionApiSource";
import { chartSource } from "../../core/chartSource";

export type BootProject = {
  manifestPath: string;
  project: ProjectManifest;
  sourceStatus: string;
  compositionSources: Record<string, string>;
};

async function loadBootProject(): Promise<BootProject> {
  const manifestPath = await readStoredActiveProjectManifestPath();
  if (!manifestPath) throw new Error("NO_STORED_PROJECT");

  const { project } = await projectPersistenceService.loadProject({ manifestPath });
  const normalizedProject = normalizeProject(project);

  try {
    await writeStoredActiveProjectManifestPath(manifestPath);
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

function projectNameFromPath(manifestPath: string) {
  if (manifestPath.endsWith("/project.json")) {
    const segments = manifestPath.split("/");
    return segments[segments.length - 2] ?? "Untitled";
  }
  const segments = manifestPath.split("/");
  const filename = segments[segments.length - 1];
  return filename.replace(/\.json$/i, "");
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

async function writeProjectTsconfig(projectDir: string) {
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      paths: {
        "@clipper/composition-api": ["./composition-api.ts"],
      },
      strict: true,
      noEmit: true,
    },
    include: ["file-manager/compositions/**/*.ts"],
  };
  await clipperHost.writeTextFile(`${projectDir}/tsconfig.json`, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

async function createMinimalProject(manifestPath: string, projectName: string): Promise<BootProject> {
  const directoryPath = manifestPath.endsWith("/project.json") ? manifestPath.slice(0, -"/project.json".length) : manifestPath.replace(/\.json$/i, "");
  const manifestOutPath = `${directoryPath}/project.json`;
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

  await clipperHost.createDirectory(directoryPath);
  await clipperHost.createDirectory(`${directoryPath}/file-manager`);
  await clipperHost.createDirectory(`${directoryPath}/file-manager/compositions`);
  await clipperHost.createDirectory(`${directoryPath}/file-manager/timelines`);
  await clipperHost.createDirectory(`${directoryPath}/file-manager/assets`);

  const metadataProject = {
    id: normalized.id,
    name: normalized.name,
    resolution: normalized.resolution,
    assetsPath: normalized.assetsPath,
    assets: normalized.assets,
    compositionFolders: normalized.compositionFolders ?? [],
    timelineOrder: normalized.timelines?.map((t) => t.id) ?? [],
    compositionOrder: normalized.compositions?.map((c) => c.id) ?? [],
    editorState: normalized.editorState,
    scenes: [],
  };
  await clipperHost.writeTextFile(manifestOutPath, `${JSON.stringify(metadataProject, null, 2)}\n`);

  for (const timeline of normalized.timelines ?? []) {
    await clipperHost.writeTextFile(`${directoryPath}/file-manager/timelines/${timeline.id}.timeline.json`, `${JSON.stringify(timeline, null, 2)}\n`);
  }

  await clipperHost.writeTextFile(`${directoryPath}/composition-api.ts`, compositionApiSource);
  await clipperHost.writeTextFile(`${directoryPath}/chart.ts`, chartSource);
  await writeProjectTsconfig(directoryPath);

  return {
    manifestPath: manifestOutPath,
    project: normalized,
    sourceStatus: `New project created at ${manifestOutPath}.`,
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
      const recents = await readRecentProjects();
      if (cancelled) return;
      setRecentProjects(recents);

      try {
        const loadedProject = await loadBootProject();
        if (cancelled) return;
        setBootProject(loadedProject);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to open the active project.";
        if (message === "NO_STORED_PROJECT") {
          setIsWelcome(true);
        } else {
          await clearStoredActiveProjectManifestPath();
          setBootError(message);
        }
      }
    }
    boot();
    return () => { cancelled = true; };
  }, []);

  async function openProjectFromBoot() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;

      const { project } = await projectPersistenceService.loadProject({ manifestPath });
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
      setBootError(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  async function createNewProject(projectName: string) {
    setBootError(null);
    try {
      const manifestPath = await clipperHost.createProject(projectName);
      if (!manifestPath) return false;
      const booted = await createMinimalProject(manifestPath, projectName);
      await writeStoredActiveProjectManifestPath(booted.manifestPath);
      await addRecentProject(booted.manifestPath, projectNameFromPath(booted.manifestPath));
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject(booted);
      setBootError(null);
      setIsWelcome(false);
      return true;
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to create project.");
      return false;
    }
  }

  async function deleteRecentProject(project: RecentProject) {
    try {
      let pathToRemove = project.path;
      if (pathToRemove.endsWith("/project.json")) {
        pathToRemove = pathToRemove.slice(0, -"/project.json".length);
      }
      try {
        await clipperHost.trashFile(pathToRemove);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
        // If file is missing, we still want to remove it from recents
      }
      await removeRecentProject(project.path);
      const recents = await readRecentProjects();
      setRecentProjects(recents);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to delete project.");
    }
  }

  async function openRecentProject(project: RecentProject) {
    try {
      const manifestPath = project.path;

      const { project: loadedProject } = await projectPersistenceService.loadProject({ manifestPath });
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
      setBootError(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  async function closeProject() {
    await clearStoredActiveProjectManifestPath();
    setBootProject(null);
    setBootError(null);
    setIsWelcome(true);
  }

  return { bootError, bootProject, isWelcome, recentProjects, openProjectFromBoot, createNewProject, openRecentProject, deleteRecentProject, closeProject };
}
