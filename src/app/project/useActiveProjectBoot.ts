import { useEffect, useState } from "react";
import JSZip from "jszip";
import { clipperHost } from "../clipperHost";
import { projectPersistenceService } from "../services/projectPersistenceService";
import { normalizeProject } from "../../core/project";
import type { ProjectManifest } from "../../core/types";
import {
  addRecentProject,
  clipperContainerPath,
  clearStoredActiveProjectManifestPath,
  readRecentProjects,
  readStoredActiveProjectManifestPath,
  writeStoredActiveProjectManifestPath,
  type RecentProject,
} from "./activeProjectManifest";
import { getProjectCompositionSources } from "./projectSources";

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

function projectNameFromPath(manifestPath: string) {
  const segments = manifestPath.split("/");
  const filename = segments[segments.length - 1];
  return filename.replace(/\.clipper$/i, "");
}

async function createMinimalProject(manifestPath: string): Promise<BootProject> {
  const timelineId = crypto.randomUUID();
  const minimalProject: ProjectManifest = {
    id: crypto.randomUUID(),
    name: projectNameFromPath(manifestPath),
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    timelines: [{
      id: timelineId,
      name: "Timeline 1",
      clips: [],
      adjustmentLayers: [],
      motionMarkers: [],
      settings: {},
    }],
    compositions: [],
    compositionSources: {},
    scenes: [],
    assets: [],
    editorState: {} as ProjectManifest["editorState"],
  };

  const normalized = normalizeProject(minimalProject);

  const zip = new JSZip();
  zip.file("project.json", JSON.stringify({
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
  }, null, 2));

  for (const timeline of normalized.timelines ?? []) {
    zip.file(`timelines/${timeline.id}.timeline.json`, JSON.stringify(timeline, null, 2));
  }

  await clipperHost.writeBinaryFile(manifestPath, await zip.generateAsync({ type: "base64", compression: "DEFLATE" }));

  return {
    manifestPath: clipperContainerPath(manifestPath),
    project: normalized,
    sourceStatus: `New project created at ${manifestPath}.`,
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
      const activeManifestPath = clipperContainerPath(manifestPath);
      await writeStoredActiveProjectManifestPath(activeManifestPath);
      await addRecentProject(activeManifestPath, projectNameFromPath(activeManifestPath));
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject({
        manifestPath: activeManifestPath,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${activeManifestPath}.`,
        compositionSources: getProjectCompositionSources(normalizedProject),
      });
      setBootError(null);
      setIsWelcome(false);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to open project.");
    }
  }

  async function createNewProject() {
    try {
      const manifestPath = await clipperHost.createProjectDialog();
      if (!manifestPath) return;
      const booted = await createMinimalProject(manifestPath);
      await writeStoredActiveProjectManifestPath(booted.manifestPath);
      await addRecentProject(booted.manifestPath, projectNameFromPath(booted.manifestPath));
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject(booted);
      setBootError(null);
      setIsWelcome(false);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  async function openRecentProject(project: RecentProject) {
    try {
      const { project: loadedProject } = await projectPersistenceService.loadProject({ manifestPath: project.path });
      const normalizedProject = normalizeProject(loadedProject);
      await writeStoredActiveProjectManifestPath(project.path);
      await addRecentProject(project.path, project.name);
      const recents = await readRecentProjects();
      setRecentProjects(recents);
      setBootProject({
        manifestPath: project.path,
        project: normalizedProject,
        sourceStatus: `Project loaded from ${project.path}.`,
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

  return { bootError, bootProject, isWelcome, recentProjects, openProjectFromBoot, createNewProject, openRecentProject, closeProject };
}
