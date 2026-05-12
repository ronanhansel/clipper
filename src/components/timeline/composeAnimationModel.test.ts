import { describe, expect, it } from "vitest";
import { buildComposeAnimationTimelineLayers } from "./composeAnimationModel";
import type { FrameObject, Part } from "../../core/types";

describe("buildComposeAnimationTimelineLayers", () => {
  it("keeps generated graph objects out of composition-owned timeline rows", () => {
    const layers = buildComposeAnimationTimelineLayers({
      id: "part",
      filePath: "part",
      duration: 5,
      frame: { width: 1920, height: 1080, style: {} },
      background: {
        id: "background",
        name: "Background",
        style: {},
        elements: [
          { ...frameObject("generated-bg"), generatedByGraph: true },
          frameObject("bg-element"),
        ],
      },
      objects: [
        frameObject("text"),
        { ...frameObject("generated"), generatedByGraph: true },
      ],
      snapshot: [],
      motionMarkers: [],
    } satisfies Part);

    expect(layers.map((layer) => layer.id)).toEqual([
      "text",
      "bg-element",
      "background",
    ]);
  });
});

function frameObject(id: string): FrameObject {
  return {
    id,
    type: "text",
    name: id,
    selector: `#${id}`,
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    style: {},
  };
}
