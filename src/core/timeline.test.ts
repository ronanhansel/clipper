import { describe, expect, it } from "vitest";
import { createSelectionPayload } from "./geometry";
import {
  getMotionMarkerViews,
  motionBlocksToMotionMarkers,
} from "./motionEffects";
import { effectBlocksMending } from "./effects/registry";
import {
  buildLinearTimeline,
  canMendTimelineMarkers,
  expandExplicitTimelineMarkerMendIds,
  getActiveTimelinePartsAtTime,
  getAdjustmentPlacement,
  getExecutableAdjustmentLayers,
  getExecutableTransitionLayers,
  getMendedMarkerDragItems,
  getMotionMarkerMendKey,
  getMotionMiddleSnap,
  getRenderableScene,
  getSelectedActiveMiddleMend,
  getSelectedMotionMiddleSnap,
  getTimelineMarkerDragSnapBoundaries,
  getTimelineMarkerMoves,
  getTimelinePartAtTime,
  getTimelinePreviewState,
  getTopTimelineItemAtTime,
  getTopTimelinePartAtTime,
  isExplicitTimelineMarkerMend,
  rebaseCompositionTimelineMarkers,
  removeTimelineMotionLayerMarkers,
  resizeTimelineMarkersWithPush,
  sceneDuration,
  snapTimelineBlockStartToBoundary,
  timelineDisplayDuration,
  validateScene,
} from "./timeline";
import {
  computeBulkLayerTargets,
  getLayerMoveDragPreview,
  getTimelineLayerRowAtClientY,
  getTimelineLayerRowAtClientYClamped,
  moveTimelineStateLayer,
  resolveTimelineLayerMoveTargets,
  resolveTimelineMoveSourceLayer,
  toggleTimelineStateLayerHidden,
  type TimelineLayerLayout,
} from "./timelineLayers";
import type { Scene, TimelinePart } from "./types";

const frame = {
  width: 1920,
  height: 1080,
  style: { backgroundColor: "#000000" },
} as const;
const background = {
  id: "background",
  name: "Background",
  style: { backgroundColor: "#000000" },
  elements: [],
};

const scene: Scene = {
  id: "scene_test",
  compositions: [
    {
      id: "a",
      filePath: "A.composition.ts",
      duration: 4,
      frame,
      background,
      objects: [],
      snapshot: [],
      motionMarkers: [],
    },
    {
      id: "b",
      filePath: "B.composition.ts",
      duration: 6,
      frame,
      background,
      objects: [],
      snapshot: [],
      motionMarkers: [],
    },
  ],
};

describe("timeline model", () => {
  it("uses shared layer operations without changing hidden state", () => {
    const state = {
      compositionLayers: [{ id: "comp_a", hidden: true }, { id: "comp_b" }],
      adjustmentLayers: [{ id: "adjust_a" }, { id: "adjust_b", hidden: true }],
      motionLayers: [
        { id: "motion_a", kind: "motion" as const },
        { id: "motion_b", kind: "motion" as const, hidden: true },
      ],
    };

    expect(
      moveTimelineStateLayer(state, "comp", "comp_a", "down", state)
        .compositionLayers,
    ).toEqual([{ id: "comp_b" }, { id: "comp_a", hidden: true }]);
    expect(
      moveTimelineStateLayer(state, "adjust", "adjust_b", "up", state)
        .adjustmentLayers?.[0].hidden,
    ).toBe(true);
    expect(
      toggleTimelineStateLayerHidden(state, "motion", "motion_b", state)
        .motionLayers?.[1].hidden,
    ).toBeUndefined();
  });

  it("queues compositions linearly without overlap", () => {
    expect(
      buildLinearTimeline(scene).map((part) => [part.id, part.start, part.end]),
    ).toEqual([
      ["a", 0, 4],
      ["b", 4, 10],
    ]);
  });

  it("keeps explicit composition marker placement and overlap", () => {
    expect(
      buildLinearTimeline({
        ...scene,
        compositions: [
          {
            ...scene.compositions[0],
            start: 1,
            duration: 4,
            layerId: "comp_a",
          },
          {
            ...scene.compositions[1],
            start: 2,
            duration: 3,
            layerId: "comp_b",
          },
        ],
      }).map((part) => [part.id, part.layerId, part.start, part.end]),
    ).toEqual([
      ["a", "comp_a", 1, 5],
      ["b", "comp_b", 2, 5],
    ]);
  });

  it("selects overlapping compositions by visible top-down layer order", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 0, duration: 5, layerId: "lower" },
        { ...scene.compositions[1], start: 0, duration: 5, layerId: "upper" },
      ],
    });

    expect(
      getTopTimelinePartAtTime(timeline, 2, {
        compositionLayers: [{ id: "upper" }, { id: "lower" }],
      })?.id,
    ).toBe("b");
    expect(
      getTopTimelinePartAtTime(timeline, 2, {
        compositionLayers: [{ id: "lower" }, { id: "upper" }],
      })?.id,
    ).toBe("a");
  });

  it("returns the top active composition in render order", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 0, duration: 5, layerId: "lower" },
        { ...scene.compositions[1], start: 0, duration: 3, layerId: "upper" },
      ],
    });

    expect(
      getActiveTimelinePartsAtTime(
        timeline,
        2,
        { compositionLayers: [{ id: "upper" }, { id: "lower" }] },
        "bottom-to-top",
      ).map((part) => part.id),
    ).toEqual(["b"]);
    expect(
      getActiveTimelinePartsAtTime(
        timeline,
        4,
        { compositionLayers: [{ id: "upper" }, { id: "lower" }] },
        "bottom-to-top",
      ).map((part) => part.id),
    ).toEqual(["a"]);
  });

  it("derives preview stack, active part, and transition inputs from one scene time", () => {
    const layeredScene: Scene = {
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 0, duration: 5, layerId: "lower" },
        { ...scene.compositions[1], start: 2, duration: 4, layerId: "upper" },
      ],
      transitionLayers: [
        {
          id: "transition",
          name: "Swipe",
          layerId: "transition",
          start: 2,
          duration: 1,
          midPoint: 0.5,
          effect: { effectId: "clipper.transition.swipe" },
        },
      ],
    };
    const timeline = buildLinearTimeline(layeredScene);
    const previewState = getTimelinePreviewState({
      compositions: layeredScene.compositions,
      sceneDurationSeconds: sceneDuration(layeredScene),
      sceneTime: 2.5,
      timeline,
      timelineLayers: { compositionLayers: [{ id: "upper" }, { id: "lower" }] },
      timelineMode: "composition",
      transitionLayers: layeredScene.transitionLayers,
    });

    expect(previewState.activeTimelinePart?.id).toBe("b");
    expect(previewState.previewTime).toBe(0.5);
    expect(
      previewState.previewParts.map((item) => [item.part.id, item.previewTime]),
    ).toEqual([["b", 0.5]]);
    expect(
      previewState.transitionPreviewParts?.from.map((item) => item.part.id),
    ).toEqual(["b"]);
    expect(
      previewState.transitionPreviewParts?.to.map((item) => [
        item.part.id,
        item.previewTime,
      ]),
    ).toEqual([["b", 0.75]]);
  });

  it("applies global timing adjustments to transition timing", () => {
    const adjustedScene: Scene = {
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 0, duration: 8 },
        { ...scene.compositions[1], start: 4, duration: 4 },
      ],
      adjustmentLayers: [
        {
          id: "slow",
          name: "Slow",
          start: 0,
          duration: 8,
          effect: {
            effectId: "clipper.adjustment.speedChange",
            params: { speed: 0.5 },
          },
        },
      ],
      transitionLayers: [
        {
          id: "transition",
          name: "Swipe",
          layerId: "transition",
          start: 2,
          duration: 2,
          midPoint: 1,
          effect: { effectId: "clipper.transition.swipe" },
        },
      ],
    };

    const previewState = getTimelinePreviewState({
      adjustmentLayers: adjustedScene.adjustmentLayers,
      compositions: adjustedScene.compositions,
      sceneDurationSeconds: sceneDuration(adjustedScene),
      sceneTime: 5,
      timeline: buildLinearTimeline(adjustedScene),
      timelineMode: "composition",
      transitionLayers: adjustedScene.transitionLayers,
    });

    expect(previewState.transitionPreviewParts).toBeTruthy();
    expect(previewState.transitionPreviewParts?.fromSceneTime).toBeCloseTo(
      2.0625,
    );
    expect(
      previewState.transitionPreviewParts?.from.map((item) => item.previewTime),
    ).toEqual([1.03125]);
  });

  it("offsets composition preview time by the clip trim start", () => {
    const trimmedScene: Scene = {
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 2, trimStart: 1.25, duration: 4 },
      ],
    };
    const previewState = getTimelinePreviewState({
      compositions: trimmedScene.compositions,
      sceneDurationSeconds: sceneDuration(trimmedScene),
      sceneTime: 2.5,
      timeline: buildLinearTimeline(trimmedScene),
      timelineMode: "composition",
    });

    expect(previewState.previewTime).toBe(1.75);
    expect(
      previewState.previewParts.map((item) => [item.part.id, item.previewTime]),
    ).toEqual([["a", 1.75]]);
  });

  it("does not clamp trimmed preview time to the visible clip duration", () => {
    const trimmedScene: Scene = {
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 4, trimStart: 4, duration: 1 },
      ],
    };
    const previewState = getTimelinePreviewState({
      compositions: trimmedScene.compositions,
      sceneDurationSeconds: sceneDuration(trimmedScene),
      sceneTime: 4.5,
      timeline: buildLinearTimeline(trimmedScene),
      timelineMode: "composition",
    });

    expect(previewState.previewTime).toBe(4.5);
    expect(
      previewState.previewParts.map((item) => [item.part.id, item.previewTime]),
    ).toEqual([["a", 4.5]]);
  });

  it("removes hidden composition, adjustment, motion, and transition rows from renderable scenes", () => {
    const renderable = getRenderableScene(
      {
        ...scene,
        compositions: [
          {
            ...scene.compositions[0],
            layerId: "visible",
            motionMarkers: motionBlocksToMotionMarkers([
              {
                id: "kept",
                effectId: "clipper.motion.zoom",
                layerId: "motion_visible",
                start: 0,
                duration: 1,
                focus: { x: 0.5, y: 0.5 },
                scale: 1.5,
              },
              {
                id: "hidden",
                effectId: "clipper.motion.pan",
                layerId: "motion_hidden",
                start: 0,
                duration: 1,
                position: { x: 10, y: 0 },
              },
            ]),
          },
          { ...scene.compositions[1], layerId: "hidden_comp" },
        ],
        adjustmentLayers: [
          {
            id: "adj",
            name: "Hidden adjust",
            layerId: "hidden_adjust",
            start: 0,
            duration: 1,
            effect: { effectId: "clipper.adjustment.brightness" },
          },
        ],
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "scene-motion",
            effectId: "clipper.motion.zoom",
            layerId: "motion_hidden",
            start: 0,
            duration: 1,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
        ]),
        transitionLayers: [
          {
            id: "transition",
            name: "Hidden transition",
            layerId: "hidden_transition",
            start: 0,
            duration: 1,
            midPoint: 0.5,
            effect: { effectId: "clipper.transition.swipe" },
          },
        ],
      },
      {
        compositionLayers: [
          { id: "visible" },
          { id: "hidden_comp", hidden: true },
        ],
        adjustmentLayers: [{ id: "hidden_adjust", hidden: true }],
        motionLayers: [
          { id: "motion_visible", kind: "motion" },
          { id: "motion_hidden", kind: "motion", hidden: true },
        ],
        transitionLayers: [{ id: "hidden_transition", hidden: true }],
      },
    );

    expect(
      renderable.compositions.map((composition) => composition.id),
    ).toEqual(["a"]);
    expect(
      renderable.compositions[0].motionMarkers.map((marker) => marker.id),
    ).toEqual(["kept"]);
    expect(renderable.adjustmentLayers).toEqual([]);
    expect(renderable.motionMarkers).toEqual([]);
    expect(renderable.transitionLayers).toEqual([]);
  });

  it("orders executable adjustment layers bottom-to-top by timeline row", () => {
    const layers = [
      {
        id: "vhs",
        name: "VHS Tracking",
        layerId: "clipper.adjustment.vhsTracking",
        start: 0,
        duration: 3,
        effect: { effectId: "clipper.adjustment.vhsTracking" as const },
      },
      {
        id: "lens",
        name: "Lens",
        layerId: "clipper.adjustment.lens",
        start: 0,
        duration: 3,
        effect: { effectId: "clipper.adjustment.lens" as const },
      },
    ];

    expect(
      getExecutableAdjustmentLayers(layers, {
        adjustmentLayers: [
          { id: "clipper.adjustment.vhsTracking" },
          { id: "clipper.adjustment.lens" },
        ],
      }).map((layer) => layer.id),
    ).toEqual(["lens", "vhs"]);
  });

  it("filters transition layers by visible row state", () => {
    const transitions = [
      {
        id: "visible",
        name: "Visible",
        layerId: "transition_visible",
        start: 0,
        duration: 1,
        midPoint: 0.5,
        effect: { effectId: "clipper.transition.swipe" as const },
      },
      {
        id: "hidden",
        name: "Hidden",
        layerId: "transition_hidden",
        start: 0,
        duration: 1,
        midPoint: 0.5,
        effect: { effectId: "clipper.transition.swipe" as const },
      },
    ];

    expect(
      getExecutableTransitionLayers(transitions, {
        transitionLayers: [
          { id: "transition_visible" },
          { id: "transition_hidden", hidden: true },
        ],
      }).map((layer) => layer.id),
    ).toEqual(["visible"]);
  });

  it("returns no active composition inside explicit timeline gaps", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 0, duration: 4 },
        { ...scene.compositions[1], start: 8, duration: 2 },
      ],
    });

    expect(getTimelinePartAtTime(timeline, 6)).toBeNull();
  });

  it("derives duration from max composition end for overlapped or reordered timelines", () => {
    const overlappedScene = {
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 12, duration: 5 },
        { ...scene.compositions[1], start: 3, duration: 2 },
      ],
    };

    expect(sceneDuration(overlappedScene)).toBe(17);
    expect(timelineDisplayDuration(sceneDuration(overlappedScene))).toBe(25.5);
    expect(timelineDisplayDuration(sceneDuration(overlappedScene), 0.25)).toBe(
      21.3,
    );
    expect(timelineDisplayDuration(1, 0)).toBe(10);
  });

  it("rebases composition markers to keep absolute timeline positions stable", () => {
    const composition = {
      ...scene.compositions[0],
      start: 2,
      motionMarkers: motionBlocksToMotionMarkers([
        {
          id: "zoom",
          effectId: "clipper.motion.zoom",
          start: 3,
          duration: 1,
          scale: 1.5,
          focus: { x: 0.5, y: 0.5 },
        },
        {
          id: "pan",
          effectId: "clipper.motion.pan",
          start: 4,
          duration: 1,
          position: { x: 0, y: 0 },
        },
      ]),
    };

    const rebased = rebaseCompositionTimelineMarkers(
      { ...composition, start: 7 },
      2,
      7,
    );

    expect(getMotionMarkerViews(rebased).motionMarkers[0].start).toBe(-2);
    expect(getMotionMarkerViews(rebased).motionMarkers[1].start).toBe(-1);
    expect(rebased.motionMarkers[0].start).toBe(-2);
  });

  it("flags compositions longer than one minute", () => {
    expect(
      validateScene({
        ...scene,
        compositions: [{ ...scene.compositions[0], duration: 61 }],
      }),
    ).toContain("Composition A is 61s and exceeds the 1 minute limit.");
  });

  it("derives duration from adjustment layers and motion marker ends", () => {
    expect(
      sceneDuration({
        ...scene,
        adjustmentLayers: [
          {
            id: "adj",
            name: "Skip",
            start: 12,
            duration: 2,
            effect: {
              effectId: "clipper.adjustment.frameSkip",
              params: { every: 2 },
            },
          },
        ],
      }),
    ).toBe(14);
    expect(
      sceneDuration({
        ...scene,
        compositions: [
          {
            ...scene.compositions[0],
            start: 0,
            duration: 4,
            motionMarkers: motionBlocksToMotionMarkers([
              {
                id: "zoom",
                effectId: "clipper.motion.zoom",
                start: 8,
                duration: 3,
                focus: { x: 0.5, y: 0.5 },
                scale: 1.5,
              },
            ]),
          },
        ],
      }),
    ).toBe(11);
  });

  it("validates package-owned adjustment params", () => {
    expect(
      validateScene({
        ...scene,
        adjustmentLayers: [
          {
            id: "adj",
            name: "Speed",
            start: 1,
            duration: 2,
            effect: {
              effectId: "clipper.adjustment.speedChange",
              params: { speed: 0 },
            },
          },
        ],
      }),
    ).toContain("Adjustment Speed must use a speed greater than 0.");
    expect(
      validateScene({
        ...scene,
        adjustmentLayers: [
          {
            id: "adj",
            name: "Loop",
            start: 1,
            duration: 2,
            effect: {
              effectId: "clipper.adjustment.loopStutter",
              params: { window: 0 },
            },
          },
        ],
      }),
    ).toContain("Adjustment Loop must use a loop window greater than 0.");
  });

  it("places adjustment layers at the requested timeline time", () => {
    expect(getAdjustmentPlacement([], 10, 9)).toEqual({
      start: 9,
      duration: 3,
    });
  });

  it("uses other timeline node edges as marker drag snap boundaries", () => {
    const timeline: TimelinePart[] = [
      {
        ...scene.compositions[0],
        start: 0,
        end: 10,
        duration: 10,
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "moving",
            effectId: "clipper.motion.zoom",
            start: 1,
            duration: 2,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "target",
            effectId: "clipper.motion.zoom",
            start: 6,
            duration: 1,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "pan",
            effectId: "clipper.motion.pan",
            start: 4,
            duration: 1,
            position: { x: 0.5, y: 0.5 },
          },
        ]),
      },
    ];

    expect(
      getTimelineMarkerDragSnapBoundaries(
        timeline,
        "zoom",
        new Set(["a:moving"]),
      ),
    ).toEqual([0, 6, 7, 10]);
  });

  it("selects the active zoom block instead of a marker ending at the scrubber", () => {
    const timeline: TimelinePart[] = [
      {
        ...scene.compositions[0],
        start: 0,
        end: 10,
        duration: 10,
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "zoom",
            effectId: "clipper.motion.zoom",
            start: 5,
            duration: 3,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "pan",
            effectId: "clipper.motion.pan",
            start: 3,
            duration: 2,
            position: { x: 0, y: 0 },
          },
        ]),
      },
    ];

    const item = getTopTimelineItemAtTime(timeline, 5);

    expect(item?.kind).toBe("motion");
    if (item?.kind === "motion") {
      expect(item.marker.kind).toBe("zoom");
      expect(item.marker.id).toBe("zoom");
    }
  });

  it("does not recover hidden motion rows from marker layers missing from editor state", () => {
    const timeline: TimelinePart[] = [
      {
        ...scene.compositions[0],
        start: 0,
        end: 10,
        duration: 10,
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "zoom",
            effectId: "clipper.motion.zoom",
            layerId: "zoom_recovered",
            start: 5,
            duration: 3,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "pan",
            effectId: "clipper.motion.pan",
            layerId: "pan_recovered",
            start: 3,
            duration: 2,
            position: { x: 0, y: 0 },
          },
        ]),
      },
    ];

    expect([]).toEqual([]);
  });

  it("selects overlapping motion markers by visible layer order", () => {
    const timeline: TimelinePart[] = [
      {
        ...scene.compositions[0],
        start: 0,
        end: 10,
        duration: 10,
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "zoom",
            effectId: "clipper.motion.zoom",
            layerId: "zoom",
            start: 4,
            duration: 4,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "lower-pan",
            effectId: "clipper.motion.pan",
            layerId: "lower_pan",
            start: 4,
            duration: 4,
            position: { x: 0, y: 0 },
          },
        ]),
      },
    ];

    const item = getTopTimelineItemAtTime(
      timeline,
      6,
      [],
      [
        { id: "zoom", kind: "motion" },
        { id: "lower_pan", kind: "motion" },
      ],
    );

    expect(item?.kind).toBe("motion");
    if (item?.kind === "motion") {
      expect(item.marker.kind).toBe("zoom");
      expect(item.marker.id).toBe("zoom");
    }
  });

  it("removes all timeline markers on a deleted motion layer", () => {
    const timeline: TimelinePart[] = [
      {
        ...scene.compositions[0],
        start: 0,
        end: 10,
        duration: 10,
        motionMarkers: motionBlocksToMotionMarkers([
          {
            id: "deleted-zoom",
            effectId: "clipper.motion.zoom",
            layerId: "deleted",
            start: 1,
            duration: 2,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "kept-zoom",
            effectId: "clipper.motion.zoom",
            layerId: "kept",
            start: 4,
            duration: 2,
            focus: { x: 0.5, y: 0.5 },
            scale: 1.5,
          },
          {
            id: "deleted-pan",
            effectId: "clipper.motion.pan",
            layerId: "deleted",
            start: 1,
            duration: 2,
            position: { x: 0, y: 0 },
          },
          {
            id: "kept-pan",
            effectId: "clipper.motion.pan",
            layerId: "kept",
            start: 4,
            duration: 2,
            position: { x: 0, y: 0 },
          },
        ]),
      },
    ];

    const nextTimeline = removeTimelineMotionLayerMarkers(timeline, "deleted");

    expect(
      getMotionMarkerViews(nextTimeline[0])
        .motionMarkers.filter((m) => m.kind === "zoom")
        .map((marker) => marker.id),
    ).toEqual(["kept-zoom"]);
    expect(
      getMotionMarkerViews(nextTimeline[0])
        .motionMarkers.filter((m) => m.kind !== "zoom")
        .map((marker) => marker.id),
    ).toEqual(["kept-pan"]);
  });

  it("only detects selected mend candidates when neighboring markers are adjacent", () => {
    const markers = [
      {
        id: "first",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 0,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
      {
        id: "other-layer",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "zoom_2",
        start: 1,
        duration: 4,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
      {
        id: "second",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 2,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
    ];

    expect(
      getSelectedMotionMiddleSnap(
        markers,
        ["first", "second"],
        getMotionMarkerMendKey,
      ),
    ).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 2 }],
    });
  });

  it("does not detect selected mend candidates across gaps", () => {
    const markers = [
      {
        id: "first",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 0,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
      {
        id: "second",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 4,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
    ];

    expect(
      getSelectedMotionMiddleSnap(
        markers,
        ["first", "second"],
        getMotionMarkerMendKey,
      ),
    ).toBeNull();
  });

  it("does not detect a selected mend candidate from a single selected block", () => {
    const markers = [
      {
        id: "first",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 0,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
      {
        id: "second",
        effectId: "clipper.motion.zoom" as const,
        kind: "zoom" as const,
        layerId: "clipper.motion.zoom",
        start: 4,
        duration: 2,
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
      },
    ];

    expect(
      getSelectedMotionMiddleSnap(markers, ["second"], getMotionMarkerMendKey),
    ).toBeNull();
  });

  it("keeps mended drag groups together across compositions", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        {
          ...scene.compositions[0],
          duration: 4,
          motionMarkers: motionBlocksToMotionMarkers([
            {
              id: "first",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 2,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
              mendOutId: "b:second",
            },
          ]),
        },
        {
          ...scene.compositions[1],
          duration: 4,
          motionMarkers: motionBlocksToMotionMarkers([
            {
              id: "second",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 0,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
              mendInId: "a:first",
            },
          ]),
        },
      ],
    });

    expect(
      getMendedMarkerDragItems(timeline, timeline[0], "first", "zoom"),
    ).toEqual([
      {
        partId: "a",
        markerId: "first",
        absoluteStart: 2,
        duration: 2,
        groupId: "a:first:b:second",
      },
      {
        partId: "b",
        markerId: "second",
        absoluteStart: 4,
        duration: 2,
        groupId: "a:first:b:second",
      },
    ]);
  });

  it("keeps moved mended marker offsets contiguous", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        {
          ...scene.compositions[0],
          duration: 8,
          motionMarkers: motionBlocksToMotionMarkers([
            {
              id: "first",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 1,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
              mendOutId: "second",
            },
            {
              id: "second",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 3,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
              mendInId: "first",
            },
          ]),
        },
      ],
    });
    const items = getMendedMarkerDragItems(
      timeline,
      timeline[0],
      "first",
      "zoom",
    );
    const moves = getTimelineMarkerMoves(
      timeline,
      items,
      1.37,
      "zoom",
      new Map(
        items.map((item) => [`${item.partId}:${item.markerId}`, item.partId]),
      ),
      0.1,
    );
    const movedMarkers = moves
      .map((move) => {
        const marker = getMotionMarkerViews(timeline[0]).motionMarkers.find(
          (item) => item.id === move.markerId,
        )!;
        return { ...marker, start: move.start };
      })
      .sort((left, right) => left.start - right.start);

    expect(isExplicitTimelineMarkerMend(movedMarkers[0], movedMarkers[1])).toBe(
      true,
    );
  });

  it("detects active mend links from a single selected marker", () => {
    const markers = [
      {
        id: "first",
        kind: "zoom" as const,
        start: 0,
        duration: 2,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendOutId: "second",
      },
      {
        id: "second",
        kind: "zoom" as const,
        start: 2,
        duration: 2,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendInId: "first",
        mendOutId: "third",
      },
      {
        id: "third",
        kind: "zoom" as const,
        start: 4,
        duration: 2,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendInId: "second",
      },
    ];

    expect(
      getSelectedActiveMiddleMend(markers, ["second"], getMotionMarkerMendKey),
    ).toEqual({
      pairs: [
        { previousId: "first", nextId: "second", time: 2 },
        { previousId: "second", nextId: "third", time: 4 },
      ],
    });
  });

  it("detects active mend links from a single selected marker with timeline part id", () => {
    const markers = [
      {
        id: "__timeline_motion__:first",
        rawMarkerId: "first",
        partId: "__timeline_motion__",
        start: 0,
        duration: 2,
        kind: "zoom" as const,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendOutId: "second",
      },
      {
        id: "__timeline_motion__:second",
        rawMarkerId: "second",
        partId: "__timeline_motion__",
        start: 2,
        duration: 2,
        kind: "zoom" as const,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendInId: "first",
        mendOutId: "third",
      },
      {
        id: "__timeline_motion__:third",
        rawMarkerId: "third",
        partId: "__timeline_motion__",
        start: 4,
        duration: 2,
        kind: "zoom" as const,
        effectId: "clipper.motion.zoom" as const,
        layerId: "camera",
        focus: { x: 0.5, y: 0.5 },
        scale: 1.5,
        mendInId: "second",
      },
    ];

    expect(
      getSelectedActiveMiddleMend(
        markers,
        ["__timeline_motion__:second"],
        getMotionMarkerMendKey,
      ),
    ).toEqual({
      pairs: [
        {
          previousId: "__timeline_motion__:first",
          nextId: "__timeline_motion__:second",
          time: 2,
        },
        {
          previousId: "__timeline_motion__:second",
          nextId: "__timeline_motion__:third",
          time: 4,
        },
      ],
    });
  });

  it("does not treat drifted explicit references as active mends", () => {
    const previous = {
      id: "first",
      start: 0,
      duration: 2.04,
      snapOut: true,
      mendOutId: "second",
    };
    const next = {
      id: "second",
      start: 2.26,
      duration: 2,
      snapIn: true,
      mendInId: "first",
    };

    expect(isExplicitTimelineMarkerMend(previous, next)).toBe(false);
  });

  it("keeps explicit mends active without snap flags", () => {
    const previous = {
      id: "first",
      start: 0,
      duration: 2,
      mendOutId: "second",
    };
    const next = { id: "second", start: 2, duration: 2, mendInId: "first" };

    expect(isExplicitTimelineMarkerMend(previous, next)).toBe(true);
  });

  it("keeps explicit mends active when snap flags are toggled off", () => {
    const previous = {
      id: "first",
      start: 0,
      duration: 2,
      snapOut: undefined,
      mendOutId: "second",
    };
    const next = {
      id: "second",
      start: 2,
      duration: 2,
      snapIn: undefined,
      mendInId: "first",
    };

    expect(isExplicitTimelineMarkerMend(previous, next)).toBe(true);
  });

  it("treats snap flags as mutually exclusive with explicit mends", () => {
    expect(
      isExplicitTimelineMarkerMend(
        {
          id: "first",
          start: 0,
          duration: 2,
          snapOut: true,
          mendOutId: "second",
        },
        { id: "second", start: 2, duration: 2, mendInId: "first" },
      ),
    ).toBe(false);
    expect(
      isExplicitTimelineMarkerMend(
        { id: "first", start: 0, duration: 2, mendOutId: "second" },
        {
          id: "second",
          start: 2,
          duration: 2,
          snapIn: true,
          mendInId: "first",
        },
      ),
    ).toBe(false);
  });

  it("matches raw marker ids against timeline-qualified mend references", () => {
    expect(
      isExplicitTimelineMarkerMend(
        {
          id: "first",
          partId: "__timeline_motion__",
          start: 0,
          duration: 2,
          mendOutId: "__timeline_motion__:second",
        },
        {
          id: "second",
          partId: "__timeline_motion__",
          start: 2,
          duration: 2,
          mendInId: "__timeline_motion__:first",
        },
      ),
    ).toBe(true);
  });

  it("snaps moved timeline blocks by either front or back edge", () => {
    expect(snapTimelineBlockStartToBoundary(1.95, 1, [3], 0.1)).toBe(2);
    expect(snapTimelineBlockStartToBoundary(2.95, 1, [3], 0.1)).toBe(3);
    expect(snapTimelineBlockStartToBoundary(1.8, 1, [3], 0.1)).toBe(1.8);
  });

  it("resizes internal mended seams from the previous marker end", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 2,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 2, mendInId: "second" },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "first", "end", 1, 10),
    ).toEqual([
      { id: "first", start: 0, duration: 3, mendOutId: "second" },
      {
        id: "second",
        start: 3,
        duration: 1,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 2, mendInId: "second" },
    ]);
    expect(
      resizeTimelineMarkersWithPush(markers, "first", "end", -1, 10),
    ).toEqual([
      { id: "first", start: 0, duration: 1, mendOutId: "second" },
      {
        id: "second",
        start: 1,
        duration: 3,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 2, mendInId: "second" },
    ]);
  });

  it("does not resize drifted explicit references as a mended seam", () => {
    const markers = [
      {
        id: "first",
        start: 0,
        duration: 2.04,
        snapOut: true,
        mendOutId: "second",
      },
      {
        id: "second",
        start: 2.26,
        duration: 2,
        snapIn: true,
        mendInId: "first",
      },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "first", "end", 0.5, 10),
    ).toEqual([
      {
        id: "first",
        start: 0,
        duration: 2.54,
        snapOut: true,
        mendOutId: "second",
      },
      {
        id: "second",
        start: 2.26,
        duration: 2,
        snapIn: true,
        mendInId: "first",
      },
    ]);
    expect(
      resizeTimelineMarkersWithPush(markers, "second", "start", -0.5, 10),
    ).toEqual([
      {
        id: "first",
        start: 0,
        duration: 2.04,
        snapOut: true,
        mendOutId: "second",
      },
      {
        id: "second",
        start: 1.76,
        duration: 2.5,
        snapIn: true,
        mendInId: "first",
      },
    ]);
  });

  it("does not auto-mend adjacent snap in and out markers", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, snapOut: true },
      { id: "second", start: 2, duration: 2, snapIn: true },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "first", "end", -1, 10),
    ).toEqual([
      { id: "first", start: 0, duration: 1, snapOut: true },
      { id: "second", start: 2, duration: 2, snapIn: true },
    ]);
  });

  it("resizes internal mended seams from the following marker start", () => {
    const markers = [
      { id: "first", start: 1, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 3,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 5, duration: 2, mendInId: "second" },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "third", "start", 1, 10),
    ).toEqual([
      { id: "first", start: 1, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 3,
        duration: 3,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 6, duration: 1, mendInId: "second" },
    ]);
    expect(
      resizeTimelineMarkersWithPush(markers, "third", "start", -1, 10),
    ).toEqual([
      { id: "first", start: 1, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 3,
        duration: 1,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 3, mendInId: "second" },
    ]);
  });

  it("resizes only mended block outer edges", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 4,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 6, duration: 2, mendInId: "second" },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "first", "start", -1, 20),
    ).toEqual([
      { id: "first", start: 1, duration: 3, mendOutId: "second" },
      {
        id: "second",
        start: 4,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 6, duration: 2, mendInId: "second" },
    ]);

    expect(
      resizeTimelineMarkersWithPush(markers, "third", "end", 1, 20),
    ).toEqual([
      { id: "first", start: 2, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 4,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 6, duration: 3, mendInId: "second" },
    ]);
  });

  it("keeps the internal seam fixed when resizing the left edge of a mended chain", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, mendInId: "first" },
    ];
    const originalSeam = markers[0].start + markers[0].duration;
    const resized = resizeTimelineMarkersWithPush(
      markers,
      "first",
      "start",
      0.015,
      20,
    );

    expect(resized[0].start + resized[0].duration).toBe(originalSeam);
    expect(resized[1].start).toBe(originalSeam);
  });

  it("does not let leftmost mended resize cross the internal seam", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, mendInId: "first" },
    ];

    expect(
      resizeTimelineMarkersWithPush(markers, "first", "start", 10, 20),
    ).toEqual([
      { id: "first", start: 3, duration: 1, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, mendInId: "first" },
    ]);
  });

  it("protects all explicit mended marker ids during overwrite", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 8,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 2, mendInId: "second" },
      { id: "other", start: 6, duration: 2 },
    ];

    expect(
      expandExplicitTimelineMarkerMendIds(markers, new Set(["first"])),
    ).toEqual(new Set(["first", "second", "third"]));
  });

  it("keeps mended seams stable across repeated outer edge resizes", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 2,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 2, mendInId: "second" },
    ];

    const resizedOnce = resizeTimelineMarkersWithPush(
      markers,
      "third",
      "end",
      1,
      20,
    );
    const resizedTwice = resizeTimelineMarkersWithPush(
      resizedOnce,
      "third",
      "end",
      1,
      20,
    );
    const resizedThreeTimes = resizeTimelineMarkersWithPush(
      resizedTwice,
      "third",
      "end",
      1,
      20,
    );

    expect(resizedThreeTimes).toEqual([
      { id: "first", start: 0, duration: 2, mendOutId: "second" },
      {
        id: "second",
        start: 2,
        duration: 2,
        mendInId: "first",
        mendOutId: "third",
      },
      { id: "third", start: 4, duration: 5, mendInId: "second" },
    ]);
  });

  it("does not detect middle mend candidates across motion effect kinds in the same layer", () => {
    const markers = [
      {
        id: "pan",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "shared",
        start: 0,
        duration: 2,
        position: { x: 0, y: 0 },
      },
      {
        id: "rotate",
        effectId: "clipper.motion.rotate" as const,
        kind: "rotate" as const,
        layerId: "shared",
        start: 2,
        duration: 2,
        position: { x: 0, y: 0 },
        rotation: 12,
      },
    ];

    expect(
      getSelectedMotionMiddleSnap(
        markers,
        ["pan", "rotate"],
        getMotionMarkerMendKey,
      ),
    ).toBeNull();
    expect(getMotionMiddleSnap(markers, 2, getMotionMarkerMendKey)).toBeNull();
  });

  it("does not detect a single-selected mend across motion effect kinds in the same layer", () => {
    const markers = [
      {
        id: "pan",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "shared",
        start: 0,
        duration: 2,
        position: { x: 0, y: 0 },
      },
      {
        id: "rotate",
        effectId: "clipper.motion.rotate" as const,
        kind: "rotate" as const,
        layerId: "shared",
        start: 4,
        duration: 2,
        position: { x: 0, y: 0 },
        rotation: 12,
      },
    ];

    expect(
      getSelectedMotionMiddleSnap(markers, ["rotate"], getMotionMarkerMendKey),
    ).toBeNull();
  });

  it("blocks mending when an effect manifest blocks mending", () => {
    expect(effectBlocksMending("clipper.adjustment.speedChange")).toBe(true);
    expect(
      canMendTimelineMarkers(
        { effectId: "clipper.adjustment.speedChange", layerId: "adjust" },
        { effectId: "clipper.adjustment.speedChange", layerId: "adjust" },
      ),
    ).toBe(false);
    expect(
      canMendTimelineMarkers(
        {
          effect: { effectId: "clipper.adjustment.speedChange" },
          layerId: "adjust",
        },
        {
          effect: { effectId: "clipper.adjustment.speedChange" },
          layerId: "adjust",
        },
      ),
    ).toBe(false);
    expect(
      getMotionMiddleSnap(
        [
          {
            id: "first",
            effectId: "clipper.adjustment.speedChange",
            layerId: "adjust",
            start: 0,
            duration: 2,
          },
          {
            id: "second",
            effectId: "clipper.adjustment.speedChange",
            layerId: "adjust",
            start: 4,
            duration: 2,
          },
        ],
        3,
      ),
    ).toBeNull();
  });

  it("returns objects intersecting a screenshot selection", () => {
    const payload = createSelectionPayload(
      { x: 0, y: 0, width: 200, height: 200 },
      [
        {
          id: "hero",
          name: "Hero",
          selector: "[data-object-id='hero']",
          type: "rect",
          bounds: { x: 50, y: 50, width: 40, height: 40 },
          style: {},
        },
        {
          id: "out",
          name: "Outside",
          selector: "[data-object-id='out']",
          type: "rect",
          bounds: { x: 500, y: 50, width: 40, height: 40 },
          style: {},
        },
      ],
    );

    expect(payload.objects.map((object) => object.id)).toEqual(["hero"]);
    expect(payload.coordinates).toHaveLength(4);
  });
});

describe("timeline layer move targets", () => {
  function layerLayout(
    rows: Array<{ key: string; category: string }>,
  ): TimelineLayerLayout {
    const heights = rows.map(() => 40);
    const starts = heights.reduce<number[]>(
      (arr, _, i) => [...arr, i === 0 ? 0 : arr[i - 1] + heights[i - 1]],
      [],
    );
    return {
      rows: rows.map((r) => ({
        key: r.key,
        category: r.category as any,
        accent: "#000",
      })),
      starts,
      heights,
    };
  }

  const layout = layerLayout([
    { key: "motion_a", category: "motion" },
    { key: "motion_b", category: "motion" },
    { key: "motion_c", category: "motion" },
  ]);

  describe("computeBulkLayerTargets", () => {
    it("shifts all move targets by cursor delta within same-category rows", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "motion_a",
        "motion_c",
        [
          { id: "k1", layerId: "motion_a" },
          { id: "k2", layerId: "motion_b" },
        ],
        "motion_a",
      );

      // motion_a → motion_c (delta +2), motion_b clamped to motion_c
      expect(targets.get("k1")).toBe("motion_c");
      expect(targets.get("k2")).toBe("motion_c");
    });

    it("preserves cursor target when sourceLayerId is empty", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "",
        "motion_b",
        [{ id: "k1", layerId: "" }],
        "",
      );

      expect(targets.get("k1")).toBe("motion_b");
    });

    it("preserves source layer when cursorLayerId is undefined", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "motion_a",
        undefined,
        [{ id: "k1", layerId: "motion_a" }],
        "motion_a",
      );

      // When cursorLayerId undefined, cursorIdx = sourceIdx, delta = 0
      expect(targets.get("k1")).toBe("motion_a");
    });

    it("falls back to cursorLayerId when source not found in rows", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "nonexistent",
        "motion_b",
        [{ id: "k1", layerId: "nonexistent" }],
        "motion_a",
      );

      // sourceIdx < 0 → fallback to cursorLayerId
      expect(targets.get("k1")).toBe("motion_b");
    });

    it("falls back to the first non-empty value when both source and cursor are empty", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "",
        undefined,
        [{ id: "k1", layerId: "" }],
        "",
      );

      // sourceIdx < 0, cursorLayerId undefined → fallback = "" (empty string returns empty)
      expect(targets.get("k1")).toBe("");
    });

    it("never moves a target past the last category row", () => {
      const targets = computeBulkLayerTargets(
        layout,
        "motion",
        "motion_a",
        "motion_c",
        [{ id: "k1", layerId: "motion_c" }],
        "motion_a",
      );

      // motion_c is already last row, cannot shift further
      expect(targets.get("k1")).toBe("motion_c");
    });
  });

  describe("resolveTimelineMoveSourceLayer", () => {
    it("returns the layerId when it is a non-empty string", () => {
      expect(resolveTimelineMoveSourceLayer(layout, "motion", "motion_b")).toBe(
        "motion_b",
      );
    });

    it("resolves empty string to the first motion row", () => {
      expect(resolveTimelineMoveSourceLayer(layout, "motion", "")).toBe(
        "motion_a",
      );
    });

    it("resolves undefined to the first motion row", () => {
      expect(resolveTimelineMoveSourceLayer(layout, "motion", undefined)).toBe(
        "motion_a",
      );
    });

    it("resolves null to the first motion row", () => {
      expect(resolveTimelineMoveSourceLayer(layout, "motion", null)).toBe(
        "motion_a",
      );
    });

    it("returns empty string when layout has no rows for the category", () => {
      const emptyLayout = layerLayout([]);
      expect(resolveTimelineMoveSourceLayer(emptyLayout, "motion", "")).toBe(
        "",
      );
    });
  });

  describe("resolveTimelineLayerMoveTargets", () => {
    const isLocked = (_cat: any, id: string) => id === "motion_c";

    it("computes layer targets from cursor position", () => {
      const { layerTargets, cursorLayerId } = resolveTimelineLayerMoveTargets(
        layout,
        "motion",
        "motion_a",
        [{ id: "k1", layerId: "motion_a" }],
        { top: 0 },
        60,
        isLocked,
        "motion_a",
      );

      expect(cursorLayerId).toBe("motion_b");
      expect(layerTargets.get("k1")).toBe("motion_b");
    });

    it("returns undefined cursorLayerId for locked rows", () => {
      const { layerTargets, cursorLayerId } = resolveTimelineLayerMoveTargets(
        layout,
        "motion",
        "motion_a",
        [{ id: "k1", layerId: "motion_a" }],
        { top: 0 },
        100,
        isLocked,
        "motion_a",
      );

      expect(cursorLayerId).toBeUndefined();
      expect(layerTargets.get("k1")).toBe("motion_a");
    });
  });

  describe("getTimelineLayerRowAtClientY", () => {
    it("resolves the row directly under the cursor", () => {
      expect(
        getTimelineLayerRowAtClientY(layout, { top: 0 }, 39, "motion")?.row.key,
      ).toBe("motion_a");
      expect(
        getTimelineLayerRowAtClientY(layout, { top: 0 }, 40, "motion")?.row.key,
      ).toBe("motion_a");
      expect(
        getTimelineLayerRowAtClientY(layout, { top: 0 }, 41, "motion")?.row.key,
      ).toBe("motion_b");
    });

    it("resolves upward movement to the row under the cursor", () => {
      expect(
        getTimelineLayerRowAtClientY(layout, { top: 0 }, 80, "motion")?.row.key,
      ).toBe("motion_b");
      expect(
        getTimelineLayerRowAtClientY(layout, { top: 0 }, 81, "motion")?.row.key,
      ).toBe("motion_c");
    });
  });

  describe("getTimelineLayerRowAtClientYClamped", () => {
    const mixedLayout = layerLayout([
      { key: "adjust", category: "adjust" },
      { key: "motion_a", category: "motion" },
      { key: "motion_b", category: "motion" },
    ]);

    it("keeps a motion drag above motion rows on the nearest motion row", () => {
      expect(
        getTimelineLayerRowAtClientYClamped(
          mixedLayout,
          { top: 0 },
          20,
          "motion",
        )?.row.key,
      ).toBe("motion_a");
    });

    it("keeps a motion drag below motion rows on the nearest motion row", () => {
      expect(
        getTimelineLayerRowAtClientYClamped(
          mixedLayout,
          { top: 0 },
          140,
          "motion",
        )?.row.key,
      ).toBe("motion_b");
    });
  });

  describe("getLayerMoveDragPreview", () => {
    const isLocked = (_cat: any, id: string) => id === "motion_c";

    it("returns delta=0 when computedLayerId is locked", () => {
      const preview = getLayerMoveDragPreview(
        layout,
        "motion_a",
        "motion_c",
        isLocked,
        "motion",
      );
      expect(preview.deltaY).toBe(0);
    });

    it("returns deltaY when computedLayerId is unlocked and in layout", () => {
      const preview = getLayerMoveDragPreview(
        layout,
        "motion_a",
        "motion_b",
        isLocked,
        "motion",
      );
      expect(preview.deltaY).toBe(40);
      expect(preview.targetLayerId).toBe("motion_b");
    });
  });
});
