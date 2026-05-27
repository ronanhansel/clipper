import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPersistenceService } from "./projectPersistenceService";
import type { SaveWorkerRequest, SaveWorkerResponse } from "./save.worker";
import type { ProjectManifest } from "../../core/types";

const hostMocks = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
}));

vi.mock("../clipperHost", () => ({
  clipperHost: {
    readTextFile: hostMocks.readTextFile,
    writeTextFile: hostMocks.writeTextFile,
  },
}));

class FakeWorker {
  static instances: FakeWorker[] = [];
  static postMessageError: Error | null = null;

  messages: SaveWorkerRequest[] = [];
  onmessage: ((event: MessageEvent<SaveWorkerResponse>) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: SaveWorkerRequest) {
    if (FakeWorker.postMessageError) throw FakeWorker.postMessageError;
    this.messages.push(message);
  }
}

const project = {
  id: "project",
  name: "Project",
  resolution: { width: 1920, height: 1080 },
  assetsPath: "assets",
  scenes: [],
  timelines: [],
  compositions: [],
  compositionLibrary: [],
} as ProjectManifest;

describe("ProjectPersistenceService", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeWorker.postMessageError = null;
    vi.stubGlobal("Worker", FakeWorker);
    hostMocks.readTextFile.mockReset();
    hostMocks.writeTextFile.mockReset();
  });

  it("resolves save worker success responses", async () => {
    const service = new ProjectPersistenceService();
    const promise = service.serializeProjectInWorker(project, {
      "source/main.tsx": "export {};",
    });
    const worker = FakeWorker.instances[0];
    const request = worker.messages[0];

    worker.onmessage?.({
      data: {
        id: request.id,
        ok: true,
        json: "{}\n",
        projectSnapshot: "{}",
        compositionSourcesSnapshot: "{}",
      },
    } as MessageEvent<SaveWorkerResponse>);

    await expect(promise).resolves.toMatchObject({
      json: "{}\n",
      projectSnapshot: "{}",
      compositionSourcesSnapshot: "{}",
    });
  });

  it("rejects save worker failure responses", async () => {
    const service = new ProjectPersistenceService();
    const promise = service.serializeProjectInWorker(project, {});
    const worker = FakeWorker.instances[0];
    const request = worker.messages[0];

    worker.onmessage?.({
      data: {
        id: request.id,
        ok: false,
        error: { message: "serialize failed" },
      },
    } as MessageEvent<SaveWorkerResponse>);

    await expect(promise).rejects.toThrow("serialize failed");
  });

  it("rejects pending saves and recreates worker after worker errors", async () => {
    const service = new ProjectPersistenceService();
    const promise = service.serializeProjectInWorker(project, {});
    const worker = FakeWorker.instances[0];

    worker.onerror?.({ message: "worker crashed" } as ErrorEvent);

    await expect(promise).rejects.toThrow("worker crashed");
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    void service.serializeProjectInWorker(project, {});

    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("rejects when project cannot be sent to worker", async () => {
    const service = new ProjectPersistenceService();
    FakeWorker.postMessageError = new Error("clone failed");

    await expect(service.serializeProjectInWorker(project, {})).rejects.toThrow(
      "clone failed",
    );
  });

  it("verifies saved project content after writing", async () => {
    const service = new ProjectPersistenceService();
    hostMocks.writeTextFile.mockResolvedValue(undefined);
    hostMocks.readTextFile.mockResolvedValue('{"saved":true}\n');

    await expect(
      service.saveProject({
        projectPath: "projects/project.clpr",
        project,
        json: '{"saved":true}\n',
      }),
    ).resolves.toMatchObject({ sourceStatus: "Project autosaved." });
    expect(hostMocks.writeTextFile).toHaveBeenCalledWith(
      "projects/project.clpr",
      '{"saved":true}\n',
    );
    expect(hostMocks.readTextFile).toHaveBeenCalledWith(
      "projects/project.clpr",
    );
  });

  it("rejects when saved content does not match written content", async () => {
    const service = new ProjectPersistenceService();
    hostMocks.writeTextFile.mockResolvedValue(undefined);
    hostMocks.readTextFile.mockResolvedValue('{"saved":false}\n');

    await expect(
      service.saveProject({
        projectPath: "projects/project.clpr",
        project,
        json: '{"saved":true}\n',
      }),
    ).rejects.toThrow("Project save verification failed.");
  });

  it("verifies saved editor state content after writing", async () => {
    const service = new ProjectPersistenceService();
    const existingJson = JSON.stringify(project, null, 2) + "\n";
    const savedJson =
      JSON.stringify(
        {
          ...project,
          editorState: {
            timeline: { displacement: 0, zoom: 1 },
            timelineMode: "direct",
          },
        },
        null,
        2,
      ) + "\n";
    hostMocks.readTextFile
      .mockResolvedValueOnce(existingJson)
      .mockResolvedValueOnce(savedJson);
    hostMocks.writeTextFile.mockResolvedValue(undefined);

    await expect(
      service.saveEditorState("projects/project.clpr", {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "direct",
      }),
    ).resolves.toBeUndefined();
    expect(hostMocks.writeTextFile).toHaveBeenCalledWith(
      "projects/project.clpr",
      savedJson,
    );
  });
});
