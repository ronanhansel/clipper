import { describe, expect, it } from "vitest";
import { createDefaultTimelineLayerState, defaultTimelineLayerState, deleteCompositionFromProject, normalizeProject, replacePartInProject, serializeProjectForSave, withRequiredTimelineLayerTypes } from "./project";
import { motionBlocksToMotionMarkers } from "./motionEffects";
import type { CompositionClip, ProjectManifest } from "./types";

const motionMarkers = motionBlocksToMotionMarkers([{ id: "zoom_1", effectId: "clipper.motion.zoom", layerId: "clipper.motion.zoom", start: 0, duration: 1, focus: { x: 960, y: 540 }, scale: 1.2, params: { focus: { x: 960, y: 540 }, scale: 1.2 } }]);

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers,
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
        filePath: "timelines/tl_main.timeline.json",

      clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
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
    expect(normalized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", layerId: "clipper.motion.zoom", scale: 1.2 });
    expect(normalized.compositions).toHaveLength(1);
    expect(normalized.compositions?.[0].source).toBe("export const composition = { id: 'cmp_intro' };");
  });

  it("preserves existing timeline file paths while syncing runtime scene clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "compositions/folder/tl_main.timeline.json",
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
        adjustmentLayers: [],
        settings: { frameRate: 30 },
      }],
    });

    expect(normalized.timelines?.[0].filePath).toBe("compositions/folder/tl_main.timeline.json");
    expect(normalized.timelines?.[0].settings).toEqual({ frameRate: 30 });
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", effectId: "clipper.motion.zoom" });
  });

  it("preserves an intentionally empty timeline instead of restoring old clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        settings: {},
      }],
    });

    expect(normalized.timelines?.[0].clips).toEqual([]);
    expect(normalized.scenes[0].compositions).toEqual([]);
  });

  it("serializes clip motion markers as timeline-level motion markers", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", effectId: "clipper.motion.zoom" });
  });

  it("migrates the old edit timeline mode to compose", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "edit",
      } as ProjectManifest["editorState"] & { timelineMode: "edit" },
    });

    expect(normalized.editorState?.timelineMode).toBe("compose");
  });

  it("serializes timeline-level motion markers independently of compositions", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        motionMarkers: [{ id: "scene_zoom", kind: "zoom", effectId: "clipper.motion.zoom", layerId: "motion", start: 2, duration: 1, focus: { x: 0.5, y: 0.5 }, scale: 1.5 }],
        settings: {},
      }],
    });

    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "scene_zoom", kind: "zoom", layerId: "motion" });
    expect(serialized.scenes[0].motionMarkers?.[0]).toMatchObject({ id: "scene_zoom", kind: "zoom", layerId: "motion" });
  });

  it("drops stale adjustment blocks that no longer belong to a timeline row on save", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
      },
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
        timelineLayers: {
          compositionLayers: [{ id: "comp" }],
          adjustmentLayers: [{ id: "adjust" }],
          motionLayers: [{ id: "motion", kind: "empty" }],
        },
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

  it("deletes a composition and preserves timeline clips as missing media", () => {
    const normalized = normalizeProject(projectWithComposition());
    const deleted = deleteCompositionFromProject(normalized, "cmp_intro");

    expect(deleted.compositions).toEqual([]);
    expect(deleted.compositionLibrary?.[0]).toMatchObject({ id: "cmp_intro", sourceMissing: true });
    expect(deleted.timelines?.[0].clips[0]).toMatchObject({ compositionId: "cmp_intro" });
    expect(deleted.scenes[0].compositions[0]).toMatchObject({ compositionId: "cmp_intro", sourceMissing: true });
  });

  it("remaps timeline clip composition references when composition path IDs change", () => {
    const renamedPath = "compositions/renamed_intro.composition.ts";
    const renamed = replacePartInProject(projectWithComposition(), composition.id, (part) => ({ ...part, id: renamedPath, filePath: renamedPath }));

    expect(renamed.compositions?.[0].id).toBe(renamedPath);
    expect(renamed.compositionLibrary?.[0].id).toBe(renamedPath);
    expect(renamed.timelines?.[0].clips[0].compositionId).toBe(renamedPath);
  });

  it("creates one blank default row for each timeline category on the timeline document", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers).toEqual([{ id: "comp", name: "Composition", hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.adjustmentLayers).toEqual([{ id: "adjust", name: undefined, hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.motionLayers).toEqual([{ id: "motion", kind: "empty", name: undefined, hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([{ id: "transition", name: undefined, hidden: undefined, locked: undefined }]);
  });

  it("adds any missing timeline layer categories without replacing existing categories", () => {
    const layers = withRequiredTimelineLayerTypes({ compositionLayers: [{ id: "legacy", name: "Legacy" }] });

    expect(layers.compositionLayers).toEqual([{ id: "legacy", name: "Legacy" }]);
    expect(layers.adjustmentLayers).toEqual(defaultTimelineLayerState.adjustmentLayers);
    expect(layers.motionLayers).toEqual(defaultTimelineLayerState.motionLayers);
    expect(layers.transitionLayers).toEqual(defaultTimelineLayerState.transitionLayers);
  });

  it("creates independent default timeline layer objects for new timelines", () => {
    const first = createDefaultTimelineLayerState();
    const second = createDefaultTimelineLayerState();

    first.compositionLayers![0].name = "Edited";

    expect(second.compositionLayers![0].name).toBe("Composition");
    expect(defaultTimelineLayerState.compositionLayers![0].name).toBe("Composition");
  });

  it("migrates legacy editor timeline layers into existing timelines without keeping global layout state", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: { compositionLayers: [{ id: "legacy", name: "Legacy" }] },
      },
    });

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers?.[0]).toMatchObject({ id: "legacy", name: "Legacy" });
  });
});
