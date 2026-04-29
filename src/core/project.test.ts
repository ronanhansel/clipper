import { describe, expect, it } from "vitest";
import { deleteCompositionFromProject, normalizeProject, serializeProjectForSave } from "./project";
import type { CompositionClip, ProjectManifest } from "./types";

const composition: CompositionClip = {
  id: "cmp_intro",
  name: "Intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionBlocks: [{ id: "zoom_1", effectId: "clipper.motion.zoom", layerId: "clipper.motion.zoom", start: 0, duration: 1, focus: { x: 960, y: 540 }, scale: 1.2, params: { focus: { x: 960, y: 540 }, scale: 1.2 } }],
  zoomMarkers: [],
  translationMarkers: [],
};

function projectWithComposition(): ProjectManifest {
  return {
    id: "proj_test",
    name: "Test Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [{ id: "tl_main", name: "Main", compositions: [composition], adjustmentLayers: [] }],
    compositionSources: {
      [composition.filePath]: "export const composition = { id: 'cmp_intro' };",
    },
  };
}

describe("project normalization", () => {
  it("migrates legacy scenes into timelines and composition documents", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.timelines).toHaveLength(1);
    expect(normalized.timelines?.[0].clips[0].motionBlocks?.[0]).toMatchObject({ id: "zoom_1", effectId: "clipper.motion.zoom", layerId: "clipper.motion.zoom" });
    expect(normalized.timelines?.[0].clips[0].zoomMarkers[0]).toMatchObject({ id: "zoom_1", layerId: "clipper.motion.zoom", scale: 1.2 });
    expect(normalized.compositions).toHaveLength(1);
    expect(normalized.compositions?.[0].source).toBe("export const composition = { id: 'cmp_intro' };");
  });

  it("preserves existing timeline file paths while syncing runtime scene clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        name: "Main",
        filePath: "compositions/folder/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        settings: { frameRate: 30 },
      }],
    });

    expect(normalized.timelines?.[0].filePath).toBe("compositions/folder/tl_main.timeline.json");
    expect(normalized.timelines?.[0].settings).toEqual({ frameRate: 30 });
    expect(normalized.timelines?.[0].clips[0].motionBlocks?.[0]).toMatchObject({ id: "zoom_1", effectId: "clipper.motion.zoom" });
  });

  it("serializes motion blocks without legacy marker contents", () => {
    const serialized = serializeProjectForSave(projectWithComposition());
    const content = JSON.stringify(serialized);

    expect(serialized.timelines?.[0].clips[0].motionBlocks?.[0]).toMatchObject({ id: "zoom_1", effectId: "clipper.motion.zoom" });
    expect(content).not.toContain("zoomMarkers");
    expect(content).not.toContain("translationMarkers");
  });

  it("deletes a composition and removes all timeline clips that reference it", () => {
    const normalized = normalizeProject(projectWithComposition());
    const deleted = deleteCompositionFromProject(normalized, "cmp_intro");

    expect(deleted.compositions).toEqual([]);
    expect(deleted.compositionLibrary).toEqual([]);
    expect(deleted.timelines?.[0].clips).toEqual([]);
    expect(deleted.scenes[0].compositions).toEqual([]);
  });
});
