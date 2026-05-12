import { describe, expect, it } from "vitest";
import {
  buildComposeLayerTree,
  getGraphFrameOutputNodes,
  isGraphFrameObject,
  syncComposeSelectedLayerIds,
  type ComposeLayerNode,
} from "./ComposeLayersPanel";
import type { AnimationGraph } from "../../core/animationGraph/types";
import type { FrameObject } from "../../core/types";

describe("isGraphFrameObject", () => {
  it("promotes a source layer to frame presentation when graph-owned primitives reach Out", () => {
    expect(
      isGraphFrameObject(
        { id: "text" },
        graph([edge("rect", "out"), edge("source", "out")]),
      ),
    ).toBe(true);
  });

  it("keeps source-only effect graphs as normal layer presentation", () => {
    expect(
      isGraphFrameObject(
        { id: "text" },
        graph([edge("source", "effect"), edge("effect", "out")]),
      ),
    ).toBe(false);
  });

  it("does not expose graph-owned utility outputs as layer rows", () => {
    const outputs = getGraphFrameOutputNodes(
      frameObject("text"),
      graph([
        edge("source", "out"),
        edge("highlight", "out"),
        edge("rect", "out"),
      ]),
    );

    expect(outputs.map((child) => child.name)).toEqual(["Text", "Rectangle"]);
  });

  it("requires the graph to belong to the layer", () => {
    expect(
      isGraphFrameObject(
        { id: "other" },
        graph([edge("rect", "out"), edge("source", "out")]),
      ),
    ).toBe(false);
  });
});

describe("syncComposeSelectedLayerIds", () => {
  it("keeps a selected graph source child selected when object selection syncs", () => {
    const tree = [
      {
        id: "text",
        name: "Text frame",
        kind: "object",
        graphFrame: true,
        object: frameObject("text"),
        children: [
          {
            id: "graph-output:text:source->out",
            name: "Text",
            kind: "graph-output",
            graphOutputEdgeId: "source->out",
            object: frameObject("text"),
          },
          {
            id: "graph-output:text:rect->out",
            name: "Rectangle",
            kind: "graph-output",
            graphOutputEdgeId: "rect->out",
          },
        ],
      },
    ] satisfies ComposeLayerNode[];

    expect(
      syncComposeSelectedLayerIds(
        ["graph-output:text:source->out"],
        ["text"],
        [],
        tree,
      ),
    ).toEqual(["graph-output:text:source->out"]);
  });

  it("keeps background selection on the background row when a legacy background graph exists", () => {
    const tree = [
      {
        id: "background",
        name: "Background",
        kind: "background",
        graphFrame: false,
      },
    ] satisfies ComposeLayerNode[];

    expect(syncComposeSelectedLayerIds([], ["background"], [], tree)).toEqual([
      "background",
    ]);
  });

  it("keeps plain background selection on the background row", () => {
    const tree = [
      {
        id: "background",
        name: "Background",
        kind: "background",
        graphFrame: false,
      },
    ] satisfies ComposeLayerNode[];

    expect(syncComposeSelectedLayerIds([], ["background"], [], tree)).toEqual([
      "background",
    ]);
  });
});

describe("buildComposeLayerTree", () => {
  it("does not expose background as a graph frame", () => {
    const tree = buildComposeLayerTree({
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
      objects: [],
      snapshot: [],
      motionMarkers: [],
      animationGraph: graph([edge("source", "out")], "background"),
    });

    expect(tree.find((node) => node.id === "background")).toMatchObject({
      graphFrame: false,
      children: undefined,
    });
  });

  it("keeps generated graph objects out of composition-owned rows", () => {
    const tree = buildComposeLayerTree({
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

function graph(
  edges: AnimationGraph["edges"],
  sourceObjectId = "text",
): AnimationGraph {
  return {
    id: `graph:${sourceObjectId}`,
    sourceObjectId,
    nodes: {
      source: {
        id: "source",
        kind: "source",
        position: { x: 0, y: 0 },
        config: { objectId: sourceObjectId },
      },
      rect: {
        id: "rect",
        kind: "geometry:rectangle",
        position: { x: 0, y: 0 },
        config: {},
      },
      highlight: {
        id: "highlight",
        kind: "geometry:highlightBox",
        position: { x: 0, y: 0 },
        config: {},
      },
      effect: {
        id: "effect",
        kind: "effect:clipper.motion.zoom",
        position: { x: 0, y: 0 },
        config: {},
      },
      out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
    },
    edges,
  };
}

function edge(from: string, to: string): AnimationGraph["edges"][number] {
  return {
    id: `${from}->${to}`,
    from: { nodeId: from, portId: "out" },
    to: { nodeId: to, portId: "in" },
  };
}
