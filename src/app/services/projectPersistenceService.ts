import { loadPartsFromSource, partToSource } from "../../core/partSource";
import { normalizeProject } from "../../core/project";
import type { EditorState, Part, ProjectManifest } from "../../core/types";
import { clipperHost } from "../clipperHost";

type LoadProjectInput = {
  manifestPath: string;
  fallbackProject: ProjectManifest;
};

type SaveProjectInput = {
  manifestPath: string;
  project: ProjectManifest;
  partSources: Record<string, string>;
};

class ProjectPersistenceService {
  async loadProject({ manifestPath, fallbackProject }: LoadProjectInput) {
    try {
      const content = await clipperHost.readTextFile(manifestPath);
      const manifestProject = normalizeProject(JSON.parse(content) as ProjectManifest);
      const project = normalizeProject({
        ...manifestProject,
        scenes: await Promise.all(manifestProject.scenes.map(async (scene) => ({
          ...scene,
          parts: await loadPartsFromSource(scene.parts, (relativePath) => clipperHost.readTextFile(relativePath)),
        }))),
      });

      return {
        project,
        sourceStatus: `Project loaded from ${manifestPath}.`,
        usedFallback: false,
      };
    } catch (error) {
      const project = normalizeProject(fallbackProject);
      return {
        project,
        sourceStatus: error instanceof Error ? `Using bundled sample project. ${error.message}` : "Using bundled sample project.",
        usedFallback: true,
      };
    }
  }

  async saveProject({ manifestPath, project, partSources }: SaveProjectInput) {
    await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(project, null, 2)}\n`);
    await Promise.all(project.scenes.flatMap((scene) => scene.parts).map((part) => clipperHost.writeTextFile(part.filePath, partSources[part.filePath] ?? partToSource(part))));
    return {
      projectSnapshot: JSON.stringify(project),
      partSourcesSnapshot: JSON.stringify(partSources),
      sourceStatus: "Project and composition sources saved.",
    };
  }

  async saveEditorState(manifestPath: string, editorState: EditorState) {
    const content = await clipperHost.readTextFile(manifestPath);
    const manifestProject = JSON.parse(content) as ProjectManifest;
    await clipperHost.writeTextFile(manifestPath, `${JSON.stringify({ ...manifestProject, editorState }, null, 2)}\n`);
  }

  async loadPartSource(part: Part) {
    try {
      return { source: await clipperHost.readTextFile(part.filePath), error: null as string | null };
    } catch (error) {
      return {
        source: partToSource(part),
        error: error instanceof Error ? error.message : "Unable to load composition file.",
      };
    }
  }
}

export const projectPersistenceService = new ProjectPersistenceService();
