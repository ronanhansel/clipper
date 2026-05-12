import { describe, expect, it } from "vitest";
import {
  getGraphSelectionObject,
  getGraphSelectionObjectIds,
} from "./graphSelection";
import type { FrameObject, Part } from "./types";

describe("graph selection ownership", () => {
  it("maps generated graph objects back to their source object", () => {
    const part = partWithGraph("text", [
      frameObject("text"),
      { ...frameObject("graph:graph:text:rect"), generatedByGraph: true },
    ]);

    expect(getGraphSelectionObjectIds(part, ["graph:graph:text:rect"])).toEqual(
      ["text"],
    );
    expect(getGraphSelectionObject(part, "graph:graph:text:rect")?.id).toBe(
      "text",
    );
  });

  it("does not map generated background graph objects back to background", () => {
    const part = partWithGraph("background", [
      { ...frameObject("graph:graph:background:rect"), generatedByGraph: true },
    ]);

    expect(
      getGraphSelectionObjectIds(part, ["graph:graph:background:rect"]),
    ).toEqual([]);
    expect(
      getGraphSelectionObject(part, "graph:graph:background:rect")?.id,
    ).toBeUndefined();
  });

  it("keeps direct background row selection mapped to background", () => {
    const part = partWithGraph("text", [frameObject("text")]);

    expect(getGraphSelectionObjectIds(part, ["background"])).toEqual([
      "background",
    ]);
    expect(getGraphSelectionObject(part, "background")?.id).toBe("background");
  });
});

function partWithGraph(sourceObjectId: string, objects: FrameObject[]): Part {
  return {
    id: "part",
    filePath: "part",
    duration: 5,
    frame: { width: 1920, height: 1080, style: {} },
    background: {
      id: "background",
      name: "Background",
      style: {},
      elements: [],
    },
    objects,
    snapshot: [],
    motionMarkers: [],
    animationGraph: {
      id: `graph:${sourceObjectId}`,
      sourceObjectId,
      nodes: {},
      edges: [],
    },
  };
}

function frameObject(id: string): FrameObject {
  return {
    id,
    type: "rect",
    name: id,
    selector: `#${id}`,
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    style: {},
  };
}
