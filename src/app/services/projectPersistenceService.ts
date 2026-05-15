import { normalizeProject, serializeProjectForSave } from "../../core/project";
import type { EditorState, ProjectManifest } from "../../core/types";
import { clipperHost } from "../clipperHost";

type LoadProjectInput = {
  projectPath: string;
};

type SaveProjectInput = {
  projectPath: string;
  project: ProjectManifest;
};

/**
 * Single-file .clpr project persistence.
 * All composition sources are embedded in the serialized project document.
 * No directory scanning, no file-manager, no sidecar files at persistence time.
 */
class ProjectPersistenceService {
  async loadProject({ projectPath }: LoadProjectInput) {
    const content = await clipperHost.readTextFile(projectPath);
    const raw = JSON.parse(content) as ProjectManifest;
    return {
      project: normalizeProject(raw),
      sourceStatus: `Project loaded from ${projectPath}.`,
    };
  }

  async saveProject({ projectPath, project }: SaveProjectInput) {
    const serialized = serializeProjectForSave(project);
    const json = JSON.stringify(serialized, null, 2) + "\n";
    await clipperHost.writeTextFile(projectPath, json);
    return {
      projectSnapshot: json,
      sourceStatus: "Project autosaved.",
    };
  }

  async saveEditorState(projectPath: string, editorState: EditorState) {
    const content = await clipperHost.readTextFile(projectPath);
    const project = JSON.parse(content) as ProjectManifest;
    const updated = { ...project, editorState };
    await clipperHost.writeTextFile(
      projectPath,
      JSON.stringify(updated, null, 2) + "\n",
    );
  }
}

export const projectPersistenceService = new ProjectPersistenceService();
