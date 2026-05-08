import { describe, expect, it } from "vitest";
import { createProjectStore, getProjectContentSnapshot } from "./projectStore";
import { serializeProjectForSave } from "../../core/project";
import type { ProjectManifest } from "../../core/types";

describe("projectStore", () => {
  it("seeds saved snapshots from persisted project shape", () => {
    const project: ProjectManifest = {
      id: "project",
      name: "Project",
      resolution: { width: 1920, height: 1080 },
      assetsPath: "assets",
      scenes: [],
      editorState: { timeline: { displacement: 0, zoom: 1 }, timelineMode: "compose", currentSceneTime: 0.1234 },
      compositions: [{
        id: "comp",
        filePath: "compositions/comp.composition.ts",
        duration: 5,
        frame: { width: 1920, height: 1080, style: {} },
        background: { id: "background", name: "Background", style: {}, elements: [] },
        objects: [],
        snapshot: [],
        motionMarkers: [],
        source: "runtime source must not affect saved snapshot",
      }],
      compositionLibrary: [],
      compositionSources: { "compositions/comp.composition.ts": "export const composition = {};" },
      timelines: [{ id: "timeline", filePath: "timelines/main.timeline.json", clips: [], settings: {} }],
    };

    const store = createProjectStore(project);
    const persistedProject = serializeProjectForSave(project);

    expect(store.getState().savedProjectSnapshot).toBe(getProjectContentSnapshot(persistedProject));
    expect(store.getState().savedCompositionSourcesSnapshot).toBe(JSON.stringify(persistedProject.compositionSources ?? {}));
  });
});
