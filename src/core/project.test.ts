import { describe, expect, it } from "vitest";
import {
  createDefaultTimelineLayerState,
  defaultTimelineLayerState,
  getSceneFromProject,
  normalizeProject,
  serializeProjectForSave,
  withRequiredTimelineLayerTypes,
} from "./project";
import type { CompositionClip, ProjectManifest, TimelineMode } from "./types";

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { backgroundColor: "#050505" } },
  background: {
    id: "background",
    name: "Background",
    style: { backgroundColor: "#050505" },
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function projectWithComposition(): ProjectManifest {
  return {
    id: "proj_test",
    name: "Test Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
    timelines: [
      {
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [
          {
            id: composition.id,
            compositionId: composition.id,
            duration: composition.duration,
            motionMarkers: [],
          },
        ],
        adjustmentLayers: [],
        transitionLayers: [],
        motionMarkers: [],
        settings: {},
      },
    ],
    compositions: [
      {
        ...composition,
        source: "export const composition = { id: 'cmp_intro' };",
      },
    ],
    compositionLibrary: [composition],
    compositionSources: {
      [composition.filePath]: "export const composition = { id: 'cmp_intro' };",
    },
  };
}

describe("project timeline normalization", () => {
  it("creates one blank default row for each timeline category on the timeline document", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers).toEqual(
      [
        {
          id: "comp",
          name: "Composition",
          hidden: undefined,
          locked: undefined,
        },
      ],
    );
    expect(normalized.timelines?.[0].timelineLayers?.adjustmentLayers).toEqual([
      { id: "adjust", name: undefined, hidden: undefined, locked: undefined },
    ]);
    expect(normalized.timelines?.[0].timelineLayers?.motionLayers).toEqual([
      {
        id: "motion",
        kind: "empty",
        name: undefined,
        hidden: undefined,
        locked: undefined,
      },
    ]);
    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([
      {
        id: "transition",
        name: undefined,
        hidden: undefined,
        locked: undefined,
      },
    ]);
  });

  it("adds missing timeline layer categories without replacing existing categories", () => {
    const layers = withRequiredTimelineLayerTypes({
      compositionLayers: [{ id: "legacy", name: "Legacy" }],
    });

    expect(layers.compositionLayers).toEqual([
      { id: "legacy", name: "Legacy" },
    ]);
    expect(layers.adjustmentLayers).toEqual(
      defaultTimelineLayerState.adjustmentLayers,
    );
    expect(layers.motionLayers).toEqual(defaultTimelineLayerState.motionLayers);
    expect(layers.transitionLayers).toEqual(
      defaultTimelineLayerState.transitionLayers,
    );
  });

  it("keeps only one top transition row and remaps transition markers to it", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [],
          timelineLayers: {
            compositionLayers: [{ id: "comp" }],
            adjustmentLayers: [{ id: "adjust" }],
            motionLayers: [{ id: "motion", kind: "empty" }],
            transitionLayers: [
              { id: "top-transition", name: "Top Transition", hidden: true },
              { id: "old-transition", name: "Old Transition" },
            ],
          },
          transitionLayers: [
            {
              id: "transition-a",
              name: "A",
              layerId: "old-transition",
              start: 0,
              duration: 2,
              midPoint: 1,
              effect: { effectId: "clipper.transition.swipe", params: {} },
            },
            {
              id: "transition-b",
              name: "B",
              layerId: "top-transition",
              start: 3,
              duration: 2,
              midPoint: 1,
              effect: { effectId: "clipper.transition.fade", params: {} },
            },
          ],
          adjustmentLayers: [],
          motionMarkers: [],
          settings: {},
        },
      ],
    });

    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([
      {
        id: "top-transition",
        name: "Top Transition",
        hidden: undefined,
        locked: undefined,
      },
    ]);
    expect(
      normalized.timelines?.[0].transitionLayers?.map((layer) => layer.layerId),
    ).toEqual(["top-transition", "top-transition"]);
    expect(
      normalized.scenes[0].transitionLayers?.map((layer) => layer.layerId),
    ).toEqual(["top-transition", "top-transition"]);
  });

  it("creates independent default timeline layer objects for new timelines", () => {
    const first = createDefaultTimelineLayerState();
    const second = createDefaultTimelineLayerState();

    first.compositionLayers![0].name = "Edited";

    expect(second.compositionLayers![0].name).toBe("Composition");
    expect(defaultTimelineLayerState.compositionLayers![0].name).toBe(
      "Composition",
    );
  });

  it("migrates legacy editor timeline layers into existing timelines without keeping global layout state", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition" as unknown as TimelineMode,
        timelineLayers: {
          compositionLayers: [{ id: "legacy", name: "Legacy" }],
        },
      },
    });

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(
      normalized.timelines?.[0].timelineLayers?.compositionLayers?.[0],
    ).toMatchObject({ id: "legacy", name: "Legacy" });
  });

  it("derives scenes from timeline documents and resolves them by id", () => {
    const normalized = normalizeProject(projectWithComposition());
    const scene = getSceneFromProject(normalized, "tl_main");

    if (!scene) throw new Error("Expected normalized timeline scene.");
    expect(scene.id).toBe("tl_main");
    expect(scene.compositions).toHaveLength(1);
    expect(scene.compositions[0]).toMatchObject({
      id: "cmp_intro",
      compositionId: "cmp_intro",
      duration: 5,
    });
  });

  it("serializes timeline documents without embedding runtime source strings", () => {
    const saved = serializeProjectForSave(
      normalizeProject(projectWithComposition()),
    );

    expect(saved.compositions?.[0].source).toBeUndefined();
    expect(saved.compositionLibrary?.[0].source).toBeUndefined();
    expect(saved.compositionSources?.[composition.filePath]).toContain(
      "cmp_intro",
    );
  });
});
