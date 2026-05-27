import { normalizeProject, serializeProjectForSave } from "../../core/project";
import type { EditorState, ProjectManifest } from "../../core/types";
import { clipperHost } from "../clipperHost";
import type { SaveWorkerResponse, SaveWorkerSuccess } from "./save.worker";

type LoadProjectInput = {
  projectPath: string;
};

type SaveProjectInput = {
  projectPath: string;
  project: ProjectManifest;
  json?: string;
};

/**
 * Single-file .clpr project persistence.
 * All composition sources are embedded in the serialized project document.
 * No directory scanning, no file-manager, no sidecar files at persistence time.
 */
export class ProjectPersistenceService {
  private saveWorker: Worker | null = null;
  private nextRequestId = 1;
  private pendingSaves = new Map<
    number,
    {
      resolve: (res: SaveWorkerSuccess) => void;
      reject: (error: Error) => void;
    }
  >();

  private getSaveWorker() {
    if (!this.saveWorker) {
      this.saveWorker = new Worker(
        new URL("./save.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.saveWorker.onmessage = (event: MessageEvent<SaveWorkerResponse>) => {
        const { id } = event.data;
        const pending = this.pendingSaves.get(id);
        if (pending) {
          this.pendingSaves.delete(id);
          if (event.data.ok) pending.resolve(event.data);
          else pending.reject(errorFromWorkerResponse(event.data.error));
        }
      };
      this.saveWorker.onerror = (event) => {
        this.rejectPendingSaves(
          new Error(event.message || "Project save worker failed."),
        );
        this.resetSaveWorker();
      };
      this.saveWorker.onmessageerror = () => {
        this.rejectPendingSaves(
          new Error("Project save worker returned an unreadable response."),
        );
        this.resetSaveWorker();
      };
    }
    return this.saveWorker;
  }

  private rejectPendingSaves(error: Error) {
    const pendingSaves = [...this.pendingSaves.values()];
    this.pendingSaves.clear();
    for (const pending of pendingSaves) pending.reject(error);
  }

  private resetSaveWorker() {
    this.saveWorker?.terminate();
    this.saveWorker = null;
  }

  async serializeProjectInWorker(
    project: ProjectManifest,
    compositionSources: Record<string, string>,
  ) {
    const id = this.nextRequestId++;
    const worker = this.getSaveWorker();
    return new Promise<SaveWorkerSuccess>((resolve, reject) => {
      this.pendingSaves.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, project, compositionSources });
      } catch (error) {
        this.pendingSaves.delete(id);
        reject(
          errorFromUnknown(error, "Unable to send project to save worker."),
        );
      }
    });
  }

  async loadProject({ projectPath }: LoadProjectInput) {
    const content = await clipperHost.readTextFile(projectPath);
    const raw = JSON.parse(content) as ProjectManifest;
    return {
      project: normalizeProject(raw),
      sourceStatus: `Project loaded from ${projectPath}.`,
    };
  }

  async saveProject({ projectPath, project, json }: SaveProjectInput) {
    const outputJson =
      json ?? JSON.stringify(serializeProjectForSave(project), null, 2) + "\n";
    await clipperHost.writeTextFile(projectPath, outputJson);
    const savedJson = await clipperHost.readTextFile(projectPath);
    if (savedJson !== outputJson)
      throw new Error("Project save verification failed.");
    return {
      projectSnapshot: undefined as string | undefined,
      sourceStatus: "Project autosaved.",
    };
  }

  async saveEditorState(projectPath: string, editorState: EditorState) {
    const content = await clipperHost.readTextFile(projectPath);
    const project = JSON.parse(content) as ProjectManifest;
    const updated = { ...project, editorState };
    const outputJson = JSON.stringify(updated, null, 2) + "\n";
    await clipperHost.writeTextFile(projectPath, outputJson);
    const savedJson = await clipperHost.readTextFile(projectPath);
    if (savedJson !== outputJson)
      throw new Error("Project editor state save verification failed.");
  }
}

export const projectPersistenceService = new ProjectPersistenceService();

function errorFromWorkerResponse(error: { message: string; stack?: string }) {
  const workerError = new Error(error.message);
  workerError.stack = error.stack;
  return workerError;
}

function errorFromUnknown(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  return new Error(error === undefined ? fallback : String(error));
}
