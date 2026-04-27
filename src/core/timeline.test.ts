import { describe, expect, it } from "vitest";
import { createSelectionPayload } from "./geometry";
import { buildLinearTimeline, validateScene } from "./timeline";
import type { Scene } from "./types";

const frame = { width: 1920, height: 1080, style: { background: "#000000" } } as const;
const background = { id: "background", name: "Background", style: { background: "#000000" }, elements: [] };

const scene: Scene = {
  id: "scene_test",
  name: "Test Scene",
  parts: [
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
    expect(validateScene({ ...scene, parts: [{ ...scene.parts[0], duration: 61 }] })).toContain(
      "Composition A is 61s and exceeds the 1 minute limit.",
    );
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
