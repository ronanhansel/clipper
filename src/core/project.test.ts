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
    scenes: [],
    timelines: [{
      id: "tl_main",
      name: "Main",
      filePath: "timelines/tl_main.timeline.json",
      clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionBlocks: composition.motionBlocks, zoomMarkers: [], translationMarkers: [] }],
      adjustmentLayers: [],
      settings: {},
    }],
    compositions: [{ ...composition, source: "export const composition = { id: 'cmp_intro' };" }],
    compositionLibrary: [composition],
    compositionSources: {
      [composition.filePath]: "export const composition = { id: 'cmp_intro' };",
    },
  };
}

describe("project normalization", () => {
  it("normalizes timeline clips and composition documents", () => {
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
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionBlocks: composition.motionBlocks, zoomMarkers: [], translationMarkers: [] }],
        adjustmentLayers: [],
        settings: { frameRate: 30 },
      }],
    });

    expect(normalized.timelines?.[0].filePath).toBe("compositions/folder/tl_main.timeline.json");
    expect(normalized.timelines?.[0].settings).toEqual({ frameRate: 30 });
    expect(normalized.timelines?.[0].clips[0].motionBlocks?.[0]).toMatchObject({ id: "zoom_1", effectId: "clipper.motion.zoom" });
  });

  it("preserves an intentionally empty timeline instead of restoring old clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        name: "Main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        settings: {},
      }],
    });

    expect(normalized.timelines?.[0].clips).toEqual([]);
    expect(normalized.scenes[0].compositions).toEqual([]);
  });

  it("serializes motion block contents", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.timelines?.[0].clips[0].motionBlocks?.[0]).toMatchObject({ id: "zoom_1", effectId: "clipper.motion.zoom" });
  });

  it("serializes timeline-level motion markers independently of compositions", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        name: "Main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        zoomMarkers: [{ id: "scene_zoom", layerId: "motion", start: 2, duration: 1, focus: { x: 0.5, y: 0.5 }, scale: 1.5 }],
        translationMarkers: [],
        settings: {},
      }],
    });

    expect(serialized.timelines?.[0].zoomMarkers?.[0]).toMatchObject({ id: "scene_zoom", layerId: "motion" });
    expect(serialized.scenes[0].zoomMarkers?.[0]).toMatchObject({ id: "scene_zoom", layerId: "motion" });
  });

  it("drops stale adjustment blocks that no longer belong to a timeline row on save", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: {
          compositionLayers: [{ id: "comp", name: "Composition" }],
          adjustmentLayers: [{ id: "adjust", name: "Adjust" }],
          motionLayers: [{ id: "motion", kind: "empty", name: "Motion" }],
        },
      },
      timelines: [{
        id: "tl_main",
        name: "Main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionBlocks: composition.motionBlocks, zoomMarkers: [], translationMarkers: [] }],
        adjustmentLayers: [
          { id: "live", name: "Live", layerId: "adjust", start: 0, duration: 1, effect: { effectId: "clipper.adjustment.colourGrade", params: {} } },
          { id: "stale", name: "Stale", layerId: "removed_row", start: 0, duration: 10, effect: { effectId: "clipper.adjustment.colourGrade", params: {} } },
        ],
        settings: {},
      }],
    });

    expect(serialized.timelines?.[0]?.adjustmentLayers?.map((layer) => layer.id)).toEqual(["live"]);
    expect(normalizeProject(serialized).scenes[0].adjustmentLayers!.map((layer) => layer.id)).toEqual(["live"]);
  });

  it("deletes a composition and removes all timeline clips that reference it", () => {
    const normalized = normalizeProject(projectWithComposition());
    const deleted = deleteCompositionFromProject(normalized, "cmp_intro");

    expect(deleted.compositions).toEqual([]);
    expect(deleted.compositionLibrary).toEqual([]);
    expect(deleted.timelines?.[0].clips).toEqual([]);
    expect(deleted.scenes[0].compositions).toEqual([]);
  });

  it("creates one blank default row for each timeline category", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.editorState?.timelineLayers?.compositionLayers).toEqual([{ id: "comp", name: "Composition", hidden: undefined }]);
    expect(normalized.editorState?.timelineLayers?.adjustmentLayers).toEqual([{ id: "adjust", name: "Adjust", hidden: undefined }]);
    expect(normalized.editorState?.timelineLayers?.motionLayers).toEqual([{ id: "motion", kind: "empty", name: "Motion", hidden: undefined }]);
  });
});
