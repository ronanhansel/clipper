import { describe, expect, it } from "vitest";
import { getActiveTranslation, getLayeredCameraPreviewTransform } from "./camera";
import type { Part, TimelineMotionLayerState } from "./types";

const basePart: Part = {
  id: "part",
  name: "Part",
  filePath: "part.ts",
  duration: 4,
  frame: { width: 1920, height: 1080, style: {} },
  background: { id: "background", name: "Background", style: {}, elements: [] },
  objects: [],
  snapshot: [],
  zoomMarkers: [],
  translationMarkers: [],
};

describe("camera", () => {
  it("ignores tracked pan markers from removed motion layers", () => {
    const part: Part = {
      ...basePart,
      objects: [{ id: "tracker", name: "Tracker", type: "rect", selector: "[data-object-id='tracker']", bounds: { x: 100, y: 100, width: 100, height: 100 }, style: {}, motion: { duration: 4, x: [0, 400] } }],
      translationMarkers: [{ id: "pan", layerId: "removed_pan", start: 0, duration: 4, position: { x: 0, y: 0 }, followId: "tracker" }],
    };
    const layers: TimelineMotionLayerState[] = [{ id: "motion_pan", kind: "pan", name: "MOTION" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({ x: 0, y: 0 });
  });

  it("uses manual pan position after a tracker id is cleared", () => {
    const part: Part = {
      ...basePart,
      objects: [{ id: "tracker", name: "Tracker", type: "rect", selector: "[data-object-id='tracker']", bounds: { x: 100, y: 100, width: 100, height: 100 }, style: {}, motion: { duration: 4, x: [0, 400] } }],
    };

    const tracked = getActiveTranslation([{ id: "pan", start: 0, duration: 4, position: { x: 12, y: 34 }, followId: "tracker" }], 2, part);
    const manual = getActiveTranslation([{ id: "pan", start: 0, duration: 4, position: { x: 12, y: 34 } }], 2, part);

    expect(tracked?.position.x).not.toBe(12);
    expect(manual?.position).toEqual({ x: 12, y: 34 });
  });

  it("suppresses rotation while picking a pan target", () => {
    const part: Part = {
      ...basePart,
      translationMarkers: [{ id: "rotate", layerId: "motion_rotate", kind: "rotate", start: 0, duration: 4, position: { x: 0, y: 0 }, rotation: 15 }],
    };
    const layers: TimelineMotionLayerState[] = [{ id: "motion_rotate", kind: "rotate", name: "ROTATE" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2).rotation).toBeGreaterThan(0);
    expect(getLayeredCameraPreviewTransform(part, layers, 2, { pickingTranslationPosition: true }).rotation).toBe(0);
  });
});
