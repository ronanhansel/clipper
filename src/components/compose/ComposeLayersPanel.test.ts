import { describe, expect, it } from "vitest";
import {
  buildComposeLayerTree,
  syncComposeSelectedLayerIds,
  type ComposeLayerNode,
} from "./ComposeLayersPanel";
import type { FrameObject } from "../../core/types";

describe("syncComposeSelectedLayerIds", () => {
  it("keeps object row selection when object selection syncs", () => {
    const tree = [
      {
        id: "text",
        name: "Text",
        kind: "object",
        object: frameObject("text"),
      },
    ] satisfies ComposeLayerNode[];

    expect(syncComposeSelectedLayerIds(["text"], ["text"], [], tree)).toEqual([
      "text",
    ]);
  });

  it("keeps background selection on the background row", () => {
    const tree = [
      {
        id: "background",
        name: "Background",
        kind: "background",
      },
    ] satisfies ComposeLayerNode[];

    expect(syncComposeSelectedLayerIds([], ["background"], [], tree)).toEqual([
      "background",
    ]);
  });
});

describe("buildComposeLayerTree", () => {
  it("builds object, background, and frame rows without graph output rows", () => {
    const tree = buildComposeLayerTree({
      id: "part",
      filePath: "part",
      duration: 5,
      frame: { width: 1920, height: 1080, style: {} },
      background: {
        id: "background",
        name: "Background",
        style: {},
        elements: [frameObject("bg-element")],
      },
      objects: [frameObject("text")],
      snapshot: [],
      motionMarkers: [],
    });

    expect(flattenTreeIds(tree)).toEqual([
      "objects",
      "text",
      "background",
      "bg-element",
      "frame",
    ]);
  });
});

function frameObject(id: string): FrameObject {
  return {
    id,
    type: "text",
    name: "Text",
    selector: `#${id}`,
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    style: {},
  };
}

function flattenTreeIds(nodes: ComposeLayerNode[]): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...flattenTreeIds(node.children ?? []),
  ]);
}
