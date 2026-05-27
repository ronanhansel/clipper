import { normalizeProject, serializeProjectForSave } from "../../core/project";
import type { ProjectManifest } from "../../core/types";

export type SaveWorkerRequest = {
  id: number;
  project: ProjectManifest;
  compositionSources: Record<string, string>;
};

export type SaveWorkerSuccess = {
  id: number;
  ok: true;
  json: string;
  projectSnapshot: string;
  compositionSourcesSnapshot: string;
};

export type SaveWorkerFailure = {
  id: number;
  ok: false;
  error: {
    message: string;
    stack?: string;
  };
};

export type SaveWorkerResponse = SaveWorkerSuccess | SaveWorkerFailure;

type WorkerScope = {
  onmessage: ((event: MessageEvent<SaveWorkerRequest>) => void) | null;
  postMessage: (message: SaveWorkerResponse) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event: MessageEvent<SaveWorkerRequest>) => {
  const { id, project, compositionSources } = event.data;

  try {
    const embeddedProject = normalizeProject({
      ...project,
      compositionSources,
    });

    const persistedProject = serializeProjectForSave(embeddedProject);

    const projectSnapshot = JSON.stringify(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(
      persistedProject.compositionSources ?? {},
    );
    const json = JSON.stringify(persistedProject, null, 2) + "\n";

    workerScope.postMessage({
      id,
      ok: true,
      json,
      projectSnapshot,
      compositionSourcesSnapshot,
    } satisfies SaveWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      error: normalizeWorkerError(error),
    } satisfies SaveWorkerResponse);
  }
};

function normalizeWorkerError(error: unknown) {
  if (error instanceof Error)
    return { message: error.message, stack: error.stack };
  return { message: String(error) };
}
