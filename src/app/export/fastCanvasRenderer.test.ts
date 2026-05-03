import { describe, expect, it } from "vitest";
import { getActiveFastCanvasPart } from "./fastCanvasRenderer";
import type { Scene } from "../../core/types";

describe("fastCanvasRenderer", () => {
  it("selects active timeline parts using linear scene timing", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", duration: 1, frame: { width: 1920, height: 1080, style: {} }, background: { id: "bg", name: "bg", style: {}, elements: [] }, objects: [], snapshot: [], motionMarkers: [], filePath: "" },
        { id: "b", duration: 1, frame: { width: 1920, height: 1080, style: {} }, background: { id: "bg", name: "bg", style: {}, elements: [] }, objects: [], snapshot: [], motionMarkers: [], filePath: "" },
      ],
    };

    expect(getActiveFastCanvasPart(scene, 0.5)?.id).toBe("a");
    expect(getActiveFastCanvasPart(scene, 1.2)?.id).toBe("b");
  });
});
