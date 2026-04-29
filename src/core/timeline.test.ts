import { describe, expect, it } from "vitest";
import { createSelectionPayload } from "./geometry";
import { buildLinearTimeline, getAdjustmentPlacement, getSelectedZoomMiddleSnap, getTimelineMarkerDragSnapBoundaries, getTimelineMotionLayersWithMarkers, getTopTimelineItemAtTime, getTranslationMarkerMendKey, getZoomMarkerMendKey, getZoomMiddleSnap, removeTimelineMotionLayerMarkers, validateScene } from "./timeline";
import type { Scene, TimelinePart } from "./types";

const frame = { width: 1920, height: 1080, style: { background: "#000000" } } as const;
const background = { id: "background", name: "Background", style: { background: "#000000" }, elements: [] };

const scene: Scene = {
  id: "scene_test",
  name: "Test Scene",
  compositions: [
    { id: "a", name: "A", filePath: "a.ts", duration: 4, frame, background, objects: [], snapshot: [], zoomMarkers: [], translationMarkers: [] },
    { id: "b", name: "B", filePath: "b.ts", duration: 6, frame, background, objects: [], snapshot: [], zoomMarkers: [], translationMarkers: [] },
  ],
};

describe("timeline model", () => {
  it("queues compositions linearly without overlap", () => {
    expect(buildLinearTimeline(scene).map((part) => [part.id, part.start, part.end])).toEqual([
      ["a", 0, 4],
      ["b", 4, 10],
    ]);
  });

  it("flags compositions longer than one minute", () => {
    expect(validateScene({ ...scene, compositions: [{ ...scene.compositions[0], duration: 61 }] })).toContain(
      "Composition A is 61s and exceeds the 1 minute limit.",
    );
  });

  it("validates adjustment layers against scene bounds", () => {
    expect(validateScene({ ...scene, adjustmentLayers: [{ id: "adj", name: "Skip", start: 9, duration: 2, effect: { effectId: "clipper.adjustment.frameSkip", params: { every: 2 } } }] })).toContain(
      "Adjustment Skip extends past the scene end.",
    );
  });

  it("places adjustment layers inside scene duration", () => {
    expect(getAdjustmentPlacement([], 10, 9)).toEqual({ start: 7, duration: 3 });
  });

  it("uses other timeline node edges as marker drag snap boundaries", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      zoomMarkers: [
        { id: "moving", start: 1, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "target", start: 6, duration: 1, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      ],
      translationMarkers: [
        { id: "pan", start: 4, duration: 1, position: { x: 0.5, y: 0.5 } },
      ],
    }];

    expect(getTimelineMarkerDragSnapBoundaries(timeline, "zoom", new Set(["a:moving"]))).toEqual([0, 4, 5, 6, 7, 10]);
  });

  it("selects the active zoom block instead of a marker ending at the scrubber", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      zoomMarkers: [
        { id: "zoom", start: 5, duration: 3, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      ],
      translationMarkers: [
        { id: "pan", start: 3, duration: 2, position: { x: 0, y: 0 } },
      ],
    }];

    const item = getTopTimelineItemAtTime(timeline, 5);

    expect(item?.kind).toBe("zoom");
    if (item?.kind === "zoom") expect(item.marker.id).toBe("zoom");
  });

  it("recovers visible motion rows for marker layers missing from editor state", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      zoomMarkers: [
        { id: "zoom", layerId: "zoom_recovered", start: 5, duration: 3, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      ],
      translationMarkers: [
        { id: "pan", layerId: "pan_recovered", start: 3, duration: 2, position: { x: 0, y: 0 } },
      ],
    }];

    expect(getTimelineMotionLayersWithMarkers([], timeline)).toEqual([
      { id: "zoom_recovered", kind: "motion", name: "MOTION" },
      { id: "pan_recovered", kind: "motion", name: "MOTION" },
    ]);
  });

  it("selects overlapping motion markers by visible layer order", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      zoomMarkers: [
        { id: "zoom", layerId: "zoom", start: 4, duration: 4, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      ],
      translationMarkers: [
        { id: "lower-pan", layerId: "lower_pan", start: 4, duration: 4, position: { x: 0, y: 0 } },
      ],
    }];

    const item = getTopTimelineItemAtTime(timeline, 6, [], [
      { id: "zoom", kind: "motion", name: "Zoom" },
      { id: "lower_pan", kind: "motion", name: "MOTION" },
    ]);

    expect(item?.kind).toBe("zoom");
    if (item?.kind === "zoom") expect(item.marker.id).toBe("zoom");
  });

  it("removes all timeline markers on a deleted motion layer", () => {
    const timeline: TimelinePart[] = [{
      ...scene.compositions[0],
      start: 0,
      end: 10,
      duration: 10,
      zoomMarkers: [
        { id: "deleted-zoom", layerId: "deleted", start: 1, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
        { id: "kept-zoom", layerId: "kept", start: 4, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      ],
      translationMarkers: [
        { id: "deleted-pan", layerId: "deleted", start: 1, duration: 2, position: { x: 0, y: 0 } },
        { id: "kept-pan", layerId: "kept", start: 4, duration: 2, position: { x: 0, y: 0 } },
      ],
    }];

    const nextTimeline = removeTimelineMotionLayerMarkers(timeline, "deleted");

    expect(nextTimeline[0].zoomMarkers.map((marker) => marker.id)).toEqual(["kept-zoom"]);
    expect(nextTimeline[0].translationMarkers.map((marker) => marker.id)).toEqual(["kept-pan"]);
  });

  it("detects middle mend candidates within the marker layer", () => {
    const markers = [
      { id: "first", layerId: "clipper.motion.zoom", start: 0, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      { id: "other-layer", layerId: "zoom_2", start: 1, duration: 4, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
      { id: "second", layerId: "clipper.motion.zoom", start: 4, duration: 2, focus: { x: 0.5, y: 0.5 }, scale: 1.5 },
    ];

    expect(getSelectedZoomMiddleSnap(markers, ["first", "second"], getZoomMarkerMendKey)).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 3 }],
    });
    expect(getZoomMiddleSnap(markers, 3, getZoomMarkerMendKey)).toEqual({
      pairs: [{ previousId: "first", nextId: "second", time: 3 }],
    });
  });

  it("does not detect middle mend candidates across translation effect kinds", () => {
    const markers = [
      { id: "pan", effectId: "clipper.motion.pan" as const, layerId: "shared", start: 0, duration: 2, position: { x: 0, y: 0 } },
      { id: "rotate", effectId: "clipper.motion.rotate" as const, layerId: "shared", start: 4, duration: 2, position: { x: 0, y: 0 }, rotation: 12 },
    ];

    expect(getSelectedZoomMiddleSnap(markers, ["pan", "rotate"], getTranslationMarkerMendKey)).toBeNull();
    expect(getZoomMiddleSnap(markers, 3, getTranslationMarkerMendKey)).toBeNull();
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
