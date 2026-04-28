import { describe, expect, it } from "vitest";
import { createSelectionPayload } from "./geometry";
import { buildLinearTimeline, getAdjustmentPlacement, getTimelineMarkerDragSnapBoundaries, validateScene } from "./timeline";
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
    expect(validateScene({ ...scene, adjustmentLayers: [{ id: "adj", name: "Skip", start: 9, duration: 2, effect: { kind: "frameSkip", every: 2 } }] })).toContain(
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

  it("returns objects intersecting a screenshot selection", () => {
    const payload = createSelectionPayload({ x: 0, y: 0, width: 200, height: 200 }, [
      { id: "hero", name: "Hero", selector: "[data-object-id='hero']", type: "rect", bounds: { x: 50, y: 50, width: 40, height: 40 }, style: {} },
      { id: "out", name: "Outside", selector: "[data-object-id='out']", type: "rect", bounds: { x: 500, y: 50, width: 40, height: 40 }, style: {} },
    ]);

    expect(payload.objects.map((object) => object.id)).toEqual(["hero"]);
    expect(payload.coordinates).toHaveLength(4);
  });
});
