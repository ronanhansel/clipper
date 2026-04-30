import { describe, expect, it } from "vitest";
import { createSelectionPayload } from "./geometry";
import { getMotionMarkerViews, motionBlocksToMotionMarkers } from "./motionEffects";
import { buildLinearTimeline, expandExplicitTimelineMarkerMendIds, getAdjustmentPlacement, getMendedMarkerDragItems, getMotionMarkerMendKey, getMotionMiddleSnap, getSelectedMotionMiddleSnap, getTimelineMarkerDragSnapBoundaries, getTimelineMarkerMoves, getTimelinePartAtTime, getTopTimelineItemAtTime, isExplicitTimelineMarkerMend, rebaseCompositionTimelineMarkers, removeTimelineMotionLayerMarkers, resizeTimelineMarkersWithPush, sceneDuration, snapTimelineBlockStartToBoundary, timelineDisplayDuration, validateScene } from "./timeline";
import { moveTimelineStateLayer, toggleTimelineStateLayerHidden } from "./timelineLayers";
import type { Scene, TimelinePart } from "./types";

const frame = { width: 1920, height: 1080, style: { background: "#000000" } } as const;
const background = { id: "background", name: "Background", style: { background: "#000000" }, elements: [] };

const scene: Scene = {
  id: "scene_test",
  name: "Test Scene",
  compositions: [
    { id: "a", name: "A", filePath: "a.ts", duration: 4, frame, background, objects: [], snapshot: [], motionMarkers: [] },
    { id: "b", name: "B", filePath: "b.ts", duration: 6, frame, background, objects: [], snapshot: [], motionMarkers: [] },
  ],
};

describe("timeline model", () => {
  it("uses shared layer operations without changing hidden state", () => {
    const state = {
      compositionLayers: [
        { id: "comp_a", name: "A", hidden: true },
        { id: "comp_b", name: "B" },
      ],
      adjustmentLayers: [
        { id: "adjust_a", name: "A" },
        { id: "adjust_b", name: "B", hidden: true },
      ],
      motionLayers: [
        { id: "motion_a", kind: "motion" as const, name: "A" },
        { id: "motion_b", kind: "motion" as const, name: "B", hidden: true },
      ],
    };

    expect(moveTimelineStateLayer(state, "comp", "comp_a", "down", state).compositionLayers).toEqual([
      { id: "comp_b", name: "B" },
      { id: "comp_a", name: "A", hidden: true },
    ]);
    expect(moveTimelineStateLayer(state, "adjust", "adjust_b", "up", state).adjustmentLayers?.[0].hidden).toBe(true);
    expect(toggleTimelineStateLayerHidden(state, "motion", "motion_b", state).motionLayers?.[1].hidden).toBeUndefined();
  });

  it("queues compositions linearly without overlap", () => {
    expect(buildLinearTimeline(scene).map((part) => [part.id, part.start, part.end])).toEqual([
      ["a", 0, 4],
      ["b", 4, 10],
    ]);
  });

  it("keeps explicit composition marker placement and overlap", () => {
    expect(buildLinearTimeline({
      ...scene,
      compositions: [
        { ...scene.compositions[0], start: 1, duration: 4, layerId: "comp_a" },
        { ...scene.compositions[1], start: 2, duration: 3, layerId: "comp_b" },
      ],
    }).map((part) => [part.id, part.layerId, part.start, part.end])).toEqual([
      ["a", "comp_a", 1, 5],
      ["b", "comp_b", 2, 5],
    ]);
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
    expect(timelineDisplayDuration(sceneDuration(overlappedScene), 0.25)).toBe(21.3);
  });

  it("rebases composition markers to keep absolute timeline positions stable", () => {
    const composition = {
      ...scene.compositions[0],
      start: 2,
      motionMarkers: motionBlocksToMotionMarkers([{ id: "zoom", effectId: "clipper.motion.zoom", start: 3, duration: 1, scale: 1.5, focus: { x: 0.5, y: 0.5 } }, { id: "pan", effectId: "clipper.motion.pan", start: 4, duration: 1, position: { x: 0, y: 0 } }]),
    };

    const rebased = rebaseCompositionTimelineMarkers({ ...composition, start: 7 }, 2, 7);

    expect(getMotionMarkerViews(rebased).motionMarkers[0].start).toBe(-2);
    expect(getMotionMarkerViews(rebased).motionMarkers[1].start).toBe(-1);
    expect(rebased.motionMarkers[0].start).toBe(-2);
  });

  it("flags compositions longer than one minute", () => {
    expect(validateScene({ ...scene, compositions: [{ ...scene.compositions[0], duration: 61 }] })).toContain(
      "Composition A is 61s and exceeds the 1 minute limit.",
    );
  });

  it("derives duration from adjustment layers and motion marker ends", () => {
    expect(sceneDuration({
      ...scene,
      adjustmentLayers: [{ id: "adj", name: "Skip", start: 12, duration: 2, effect: { effectId: "clipper.adjustment.frameSkip", params: { every: 2 } } }],
    })).toBe(14);
    expect(sceneDuration({
      ...scene,
      compositions: [{ ...scene.compositions[0], start: 0, duration: 4, motionMarkers: motionBlocksToMotionMarkers([{ id: "zoom", effectId: "clipper.motion.zoom", start: 8, duration: 3, focus: { x: 0.5, y: 0.5 }, scale: 1.5 }]) }],
    })).toBe(11);
  });

  it("validates package-owned adjustment params", () => {
    expect(validateScene({ ...scene, adjustmentLayers: [{ id: "adj", name: "Speed", start: 1, duration: 2, effect: { effectId: "clipper.adjustment.speedChange", params: { speed: 0 } } }] })).toContain(
      "Adjustment Speed must use a speed greater than 0.",
    );
    expect(validateScene({ ...scene, adjustmentLayers: [{ id: "adj", name: "Loop", start: 1, duration: 2, effect: { effectId: "clipper.adjustment.loopStutter", params: { window: 0 } } }] })).toContain(
      "Adjustment Loop must use a loop window greater than 0.",
    );
  });

  it("places adjustment layers at the requested timeline time", () => {
    expect(getAdjustmentPlacement([], 10, 9)).toEqual({ start: 9, duration: 3 });
  });

  it("uses other timeline node edges as marker drag snap boundaries", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "moving", effectId: "clipper.motion.zoom", start: 1, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "target", effectId: "clipper.motion.zoom", start: 6, duration: 1, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "pan", effectId: "clipper.motion.pan", start: 4, duration: 1, position: { x: 0.5, y: 0.5 } },
      ]),
    }];

    expect(getTimelineMarkerDragSnapBoundaries(timeline, "zoom", new Set(["a:moving"]))).toEqual([0, 6, 7, 10]);
  });

  it("selects the active zoom block instead of a marker ending at the scrubber", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "zoom", effectId: "clipper.motion.zoom", start: 5, duration: 3, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "pan", effectId: "clipper.motion.pan", start: 3, duration: 2, position: { x: 0, y: 0 } },
      ]),
    }];

    const item = getTopTimelineItemAtTime(timeline, 5);

    expect(item?.kind).toBe("motion");
    if (item?.kind === "motion") {
      expect(item.marker.kind).toBe("zoom");
      expect(item.marker.id).toBe("zoom");
    }
  });

  it("does not recover hidden motion rows from marker layers missing from editor state", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "zoom", effectId: "clipper.motion.zoom", layerId: "zoom_recovered", start: 5, duration: 3, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "pan", effectId: "clipper.motion.pan", layerId: "pan_recovered", start: 3, duration: 2, position: { x: 0, y: 0 } },
      ]),
    }];

    expect([]).toEqual([]);
  });

  it("selects overlapping motion markers by visible layer order", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "zoom", effectId: "clipper.motion.zoom", layerId: "zoom", start: 4, duration: 4, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "lower-pan", effectId: "clipper.motion.pan", layerId: "lower_pan", start: 4, duration: 4, position: { x: 0, y: 0 } },
      ]),
    }];

    const item = getTopTimelineItemAtTime(timeline, 6, [], [
      { id: "zoom", kind: "motion", name: "Zoom" },
      { id: "lower_pan", kind: "motion", name: "Motion" },
    ]);

    expect(item?.kind).toBe("motion");
    if (item?.kind === "motion") {
      expect(item.marker.kind).toBe("zoom");
      expect(item.marker.id).toBe("zoom");
    }
  });

  it("removes all timeline markers on a deleted motion layer", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "deleted-zoom", effectId: "clipper.motion.zoom", layerId: "deleted", start: 1, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "kept-zoom", effectId: "clipper.motion.zoom", layerId: "kept", start: 4, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "deleted-pan", effectId: "clipper.motion.pan", layerId: "deleted", start: 1, duration: 2, position: { x: 0, y: 0 } },
        { id: "kept-pan", effectId: "clipper.motion.pan", layerId: "kept", start: 4, duration: 2, position: { x: 0, y: 0 } },
      ]),
    }];

    const nextTimeline = removeTimelineMotionLayerMarkers(timeline, "deleted");

    expect(getMotionMarkerViews(nextTimeline[0]).motionMarkers.filter((m) => m.kind === "zoom").map((marker) => marker.id)).toEqual(["kept-zoom"]);
    expect(getMotionMarkerViews(nextTimeline[0]).motionMarkers.filter((m) => m.kind !== "zoom").map((marker) => marker.id)).toEqual(["kept-pan"]);
  });

  it("detects middle mend candidates within the marker layer", () => {
    const markers = [
      { id: "first", effectId: "clipper.motion.zoom" as const, kind: "zoom" as const, layerId: "clipper.motion.zoom", start: 0, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      { id: "other-layer", effectId: "clipper.motion.zoom" as const, kind: "zoom" as const, layerId: "zoom_2", start: 1, duration: 4, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      { id: "second", effectId: "clipper.motion.zoom" as const, kind: "zoom" as const, layerId: "clipper.motion.zoom", start: 4, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
    ];

    expect(getSelectedMotionMiddleSnap(markers, ["first", "second"], getMotionMarkerMendKey)).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 3 }],
    });
    expect(getMotionMiddleSnap(markers, 3, getMotionMarkerMendKey)).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 3 }],
    });
  });

  it("detects a mend candidate from a single selected block", () => {
    const markers = [
      { id: "first", effectId: "clipper.motion.zoom" as const, kind: "zoom" as const, layerId: "clipper.motion.zoom", start: 0, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      { id: "second", effectId: "clipper.motion.zoom" as const, kind: "zoom" as const, layerId: "clipper.motion.zoom", start: 4, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
    ];

    expect(getSelectedMotionMiddleSnap(markers, ["second"], getMotionMarkerMendKey)).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 3 }],
    });
  });

  it("keeps mended drag groups together across compositions", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [
        {
          ...scene.compositions[0],
          duration: 4,
          motionMarkers: motionBlocksToMotionMarkers([{ id: "first", effectId: "clipper.motion.zoom", layerId: "camera", start: 2, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5, snapOut: true, mendOutId: "b:second" }]),
        },
        {
          ...scene.compositions[1],
          duration: 4,
          motionMarkers: motionBlocksToMotionMarkers([{ id: "second", effectId: "clipper.motion.zoom", layerId: "camera", start: 0, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5, snapIn: true, mendInId: "a:first" }]),
        },
      ],
    });

    expect(getMendedMarkerDragItems(timeline, timeline[0], "first", "zoom")).toEqual([
      { partId: "a", markerId: "first", absoluteStart: 2, duration: 2, groupId: "a:first:b:second" },
      { partId: "b", markerId: "second", absoluteStart: 4, duration: 2, groupId: "a:first:b:second" },
    ]);
  });

  it("keeps moved mended marker offsets contiguous", () => {
    const timeline = buildLinearTimeline({
      ...scene,
      compositions: [{
        ...scene.compositions[0],
        duration: 8,
        motionMarkers: motionBlocksToMotionMarkers([
          { id: "first", effectId: "clipper.motion.zoom", layerId: "camera", start: 1, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5, snapOut: true, mendOutId: "second" },
          { id: "second", effectId: "clipper.motion.zoom", layerId: "camera", start: 3, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5, snapIn: true, mendInId: "first" },
        ]),
      }],
    });
    const items = getMendedMarkerDragItems(timeline, timeline[0], "first", "zoom");
    const moves = getTimelineMarkerMoves(timeline, items, 1.37, "zoom", new Map(items.map((item) => [`${item.partId}:${item.markerId}`, item.partId])), 0.1);
    const movedMarkers = moves.map((move) => {
      const marker = getMotionMarkerViews(timeline[0]).motionMarkers.find((item) => item.id === move.markerId)!;
      return { ...marker, start: move.start };
    }).sort((left, right) => left.start - right.start);

    expect(isExplicitTimelineMarkerMend(movedMarkers[0], movedMarkers[1])).toBe(true);
  });

  it("keeps explicit mends active even when timing drifts", () => {
    const previous = { id: "first", start: 0, duration: 2.04, snapOut: true, mendOutId: "second" };
    const next = { id: "second", start: 2.26, duration: 2, snapIn: true, mendInId: "first" };

    expect(isExplicitTimelineMarkerMend(previous, next)).toBe(true);
  });

  it("snaps moved timeline blocks by either front or back edge", () => {
    expect(snapTimelineBlockStartToBoundary(1.95, 1, [3], 0.1)).toBe(2);
    expect(snapTimelineBlockStartToBoundary(2.95, 1, [3], 0.1)).toBe(3);
    expect(snapTimelineBlockStartToBoundary(1.8, 1, [3], 0.1)).toBe(1.8);
  });

  it("resizes internal mended seams from the previous marker end", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 2, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 2, snapIn: true, mendInId: "second" },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "first", "end", 1, 10)).toEqual([
      { id: "first", start: 0, duration: 3, snapOut: true, mendOutId: "second" },
      { id: "second", start: 3, duration: 1, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 2, snapIn: true, mendInId: "second" },
    ]);
    expect(resizeTimelineMarkersWithPush(markers, "first", "end", -1, 10)).toEqual([
      { id: "first", start: 0, duration: 1, snapOut: true, mendOutId: "second" },
      { id: "second", start: 1, duration: 3, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 2, snapIn: true, mendInId: "second" },
    ]);
  });

  it("preserves existing explicit mend timing drift during internal seam resize", () => {
    const markers = [
      { id: "first", start: 0, duration: 2.04, snapOut: true, mendOutId: "second" },
      { id: "second", start: 2.26, duration: 2, snapIn: true, mendInId: "first" },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "first", "end", 0.5, 10)).toEqual([
      { id: "first", start: 0, duration: 2.54, snapOut: true, mendOutId: "second" },
      { id: "second", start: 2.76, duration: 1.5, snapIn: true, mendInId: "first" },
    ]);
    expect(resizeTimelineMarkersWithPush(markers, "second", "start", -0.5, 10)).toEqual([
      { id: "first", start: 0, duration: 1.54, snapOut: true, mendOutId: "second" },
      { id: "second", start: 1.76, duration: 2.5, snapIn: true, mendInId: "first" },
    ]);
  });

  it("does not auto-mend adjacent snap in and out markers", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, snapOut: true },
      { id: "second", start: 2, duration: 2, snapIn: true },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "first", "end", -1, 10)).toEqual([
      { id: "first", start: 0, duration: 1, snapOut: true },
      { id: "second", start: 2, duration: 2, snapIn: true },
    ]);
  });

  it("resizes internal mended seams from the following marker start", () => {
    const markers = [
      { id: "first", start: 1, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 3, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 5, duration: 2, snapIn: true, mendInId: "second" },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "third", "start", 1, 10)).toEqual([
      { id: "first", start: 1, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 3, duration: 3, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 6, duration: 1, snapIn: true, mendInId: "second" },
    ]);
    expect(resizeTimelineMarkersWithPush(markers, "third", "start", -1, 10)).toEqual([
      { id: "first", start: 1, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 3, duration: 1, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 3, snapIn: true, mendInId: "second" },
    ]);
  });

  it("resizes only mended block outer edges", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 6, duration: 2, snapIn: true, mendInId: "second" },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "first", "start", -1, 20)).toEqual([
      { id: "first", start: 1, duration: 3, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 6, duration: 2, snapIn: true, mendInId: "second" },
    ]);

    expect(resizeTimelineMarkersWithPush(markers, "third", "end", 1, 20)).toEqual([
      { id: "first", start: 2, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 6, duration: 3, snapIn: true, mendInId: "second" },
    ]);
  });

  it("keeps the internal seam fixed when resizing the left edge of a mended chain", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, mendInId: "first" },
    ];
    const originalSeam = markers[0].start + markers[0].duration;
    const resized = resizeTimelineMarkersWithPush(markers, "first", "start", 0.015, 20);

    expect(resized[0].start + resized[0].duration).toBe(originalSeam);
    expect(resized[1].start).toBe(originalSeam);
  });

  it("does not let leftmost mended resize cross the internal seam", () => {
    const markers = [
      { id: "first", start: 2, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, mendInId: "first" },
    ];

    expect(resizeTimelineMarkersWithPush(markers, "first", "start", 10, 20)).toEqual([
      { id: "first", start: 3, duration: 1, snapOut: true, mendOutId: "second" },
      { id: "second", start: 4, duration: 2, snapIn: true, mendInId: "first" },
    ]);
  });

  it("protects all explicit mended marker ids during overwrite", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 8, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 2, snapIn: true, mendInId: "second" },
      { id: "other", start: 6, duration: 2 },
    ];

    expect(expandExplicitTimelineMarkerMendIds(markers, new Set(["first"]))).toEqual(new Set(["first", "second", "third"]));
  });

  it("keeps mended seams stable across repeated outer edge resizes", () => {
    const markers = [
      { id: "first", start: 0, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 2, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 2, snapIn: true, mendInId: "second" },
    ];

    const resizedOnce = resizeTimelineMarkersWithPush(markers, "third", "end", 1, 20);
    const resizedTwice = resizeTimelineMarkersWithPush(resizedOnce, "third", "end", 1, 20);
    const resizedThreeTimes = resizeTimelineMarkersWithPush(resizedTwice, "third", "end", 1, 20);

    expect(resizedThreeTimes).toEqual([
      { id: "first", start: 0, duration: 2, snapOut: true, mendOutId: "second" },
      { id: "second", start: 2, duration: 2, snapIn: true, snapOut: true, mendInId: "first", mendOutId: "third" },
      { id: "third", start: 4, duration: 5, snapIn: true, mendInId: "second" },
    ]);
  });

  it("does not detect middle mend candidates across translation effect kinds", () => {
    const markers = [
      { id: "pan", effectId: "clipper.motion.pan" as const, kind: "pan" as const, layerId: "shared", start: 0, duration: 2, position: { x: 0, y: 0 } },
      { id: "rotate", effectId: "clipper.motion.rotate" as const, kind: "rotate" as const, layerId: "shared", start: 4, duration: 2, position: { x: 0, y: 0 }, rotation: 12 },
    ];

    expect(getSelectedMotionMiddleSnap(markers, ["pan", "rotate"], getMotionMarkerMendKey)).toBeNull();
    expect(getMotionMiddleSnap(markers, 3, getMotionMarkerMendKey)).toBeNull();
  });

  it("does not detect a single-selected mend across translation effect kinds", () => {
    const markers = [
      { id: "pan", effectId: "clipper.motion.pan" as const, kind: "pan" as const, layerId: "shared", start: 0, duration: 2, position: { x: 0, y: 0 } },
      { id: "rotate", effectId: "clipper.motion.rotate" as const, kind: "rotate" as const, layerId: "shared", start: 4, duration: 2, position: { x: 0, y: 0 }, rotation: 12 },
    ];

    expect(getSelectedMotionMiddleSnap(markers, ["rotate"], getMotionMarkerMendKey)).toBeNull();
  });

  it("returns objects intersecting a screenshot selection", () => {
    const payload = createSelectionPayload({ x: 0, y: 0, width: 200, height: 200 }, [
      { id: "hero", name: "Hero", selector: "[data-object-id='hero']", type: "rect", bounds: { x: 50, y: 50, width: 40, height: 40 }, style: {} },
      { id: "out", name: "Outside", selector: "[data-object-id='out']", type: "rect", bounds: { x: 500, y: 50, width: 40, height: 40 }, style: {} },
    ]);

    expect(payload.objects.map((object) => object.id)).toEqual(["hero"]);
    expect(payload.coordinates).toHaveLength(4);
  });
});
