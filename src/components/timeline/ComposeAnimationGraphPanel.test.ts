import { describe, expect, it } from "vitest";
import {
  buildGraphNodes,
  getGraphAnimationSources,
  getGraphContentSize,
  getSelectedComposition2dLayerGraph,
  setSelectedComposition2dLayerGraph,
} from "./ComposeAnimationGraphPanel";
import type {
  AnimationGraphState,
  TypedAnimationGraphState,
} from "../../core/types";
import { createTypedAnimationGraphNode } from "../../core/animationGraph/nodeRegistry";

describe("getGraphContentSize", () => {
  it("keeps the base graph size when nodes fit inside it", () => {
    expect(
      getGraphContentSize([{ x: 10, y: 10, width: 4, height: 2 }], 5200, 900),
    ).toEqual({ width: 5200, height: 900 });
  });

  it("expands the graph world to include saved off-frame nodes", () => {
    expect(
      getGraphContentSize([{ x: 310, y: 55, width: 6, height: 2 }], 5200, 900),
    ).toEqual({ width: 5832, height: 1170 });
  });
});

describe("buildGraphNodes", () => {
  it("uses persisted layer node positions when graph owns layout", () => {
    const nodes = buildGraphNodes(
      [
        {
          id: "background",
          name: "Background",
          type: "rect",
          selector: "[data-layer-id='background']",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          style: {},
          animations: [],
        },
      ],
      {
        nodes: { "layer:background": { x: 12, y: 34 } },
        edges: [],
      },
    );

    expect(nodes.find((node) => node.id === "layer:background")).toMatchObject({
      x: 12,
      y: 34,
    });
  });

  it("keeps connected layer-owned typed draft nodes visible", () => {
    const nodes = buildGraphNodes(
      [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: ".text",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
          animations: [],
        },
      ],
      {
        nodes: {
          effect: {
            id: "effect",
            kind: "effect",
            label: "Opacity",
            position: { x: 10, y: 10 },
            x: 10,
            y: 10,
            inputs: [],
            outputs: [],
            config: { effects: [{ property: "opacity", values: {} }] },
          },
          mix: {
            id: "mix",
            kind: "effect",
            label: "Effect Mix",
            position: { x: 20, y: 10 },
            x: 20,
            y: 10,
            inputs: [],
            outputs: [],
            config: { effects: [] },
          },
        },
        edges: [
          {
            id: "effect:bottom->mix:top",
            fromNodeId: "effect",
            fromPort: "bottom",
            toNodeId: "mix",
            toPort: "top",
          },
        ],
        layers: [{ id: "text", nodes: {}, edges: [] }],
      } as AnimationGraphState,
    );

    expect(nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["effect", "mix"]),
    );
  });
});

describe("composition2d layer graph selection", () => {
  it("updates one layer entry without changing other layer entries", () => {
    const sourceShape = createTypedAnimationGraphNode(
      "source:shape",
      "source",
      { x: 1, y: 2 },
      { objectId: "shape" },
      "Source",
    );
    const sourceText = createTypedAnimationGraphNode(
      "source:text",
      "source",
      { x: 10, y: 20 },
      { objectId: "text" },
      "Source",
    );
    const otherLayer = {
      id: "shape",
      nodes: { "source:shape": sourceShape },
      edges: [],
      parameters: { "source:shape": { opacity: "0.5" } },
    };
    const graph = {
      nodes: {},
      edges: [],
      layers: [
        {
          id: "text",
          nodes: {},
          edges: [],
          parameters: { old: { value: "keep" } },
        },
        otherLayer,
      ],
    } satisfies TypedAnimationGraphState;

    const nextLayerGraph = {
      nodes: { "source:text": sourceText },
      edges: [],
      parameters: { "source:text": { opacity: "1" } },
    } satisfies TypedAnimationGraphState;

    const nextGraph = setSelectedComposition2dLayerGraph(
      graph,
      nextLayerGraph,
      "text",
      "composition2d",
    ) as TypedAnimationGraphState;

    expect(nextGraph.layers?.[1]).toBe(otherLayer);
    expect(nextGraph.layers?.[1]).toEqual(otherLayer);
    expect(nextGraph.layers?.[0]).toMatchObject({
      id: "text",
      nodes: nextLayerGraph.nodes,
      edges: nextLayerGraph.edges,
      parameters: nextLayerGraph.parameters,
    });
    expect(nextGraph.nodes).toEqual({});
    expect(nextGraph.edges).toEqual([]);
  });

  it("reads layer-local parameters for selected composition2d layer", () => {
    const graph = {
      nodes: {},
      edges: [],
      layers: [
        { id: "text", nodes: {}, edges: [], parameters: { text: { x: "1" } } },
        {
          id: "shape",
          nodes: {},
          edges: [],
          parameters: { shape: { x: "2" } },
        },
      ],
    } satisfies TypedAnimationGraphState;

    expect(
      getSelectedComposition2dLayerGraph(graph, "shape", "composition2d")
        ?.parameters,
    ).toEqual({ shape: { x: "2" } });
  });
});

describe("getGraphAnimationSources", () => {
  it("detects only registered animation definitions from layer keyframes", () => {
    const sources = getGraphAnimationSources({
      id: "text",
      name: "Text",
      type: "text",
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [
        {
          id: "opacity",
          keyframes: { opacity: [0, 1] },
          options: { duration: 1, type: "tween" },
        },
        {
          id: "z-only",
          keyframes: { z: [0, 100] },
          options: { duration: 1, type: "tween" },
        },
        {
          id: "path-only",
          keyframes: { pathOffset: [0, 1] },
          options: { duration: 1, type: "tween" },
        },
      ],
    });

    expect(sources.map((source) => source.id)).toEqual([
      "animation:text:anim:opacity:opacity",
    ]);
  });

  it("detects scale and rotate through the animation registry", () => {
    const sources = getGraphAnimationSources({
      id: "text",
      name: "Text",
      type: "text",
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [
        {
          id: "scale",
          keyframes: { scale: [0.8, 1] },
          options: { duration: 1, type: "tween" },
        },
        {
          id: "rotate",
          keyframes: { rotate: [-12, 0] },
          options: { duration: 1, type: "tween" },
        },
      ],
    });

    expect(sources.map((source) => source.details.property)).toEqual([
      "scale",
      "rotate",
    ]);
  });

  it("detects position only when x or y keyframes are present", () => {
    const sources = getGraphAnimationSources({
      id: "text",
      name: "Text",
      type: "text",
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [
        {
          id: "move",
          keyframes: { x: [10, 20], y: [30, 40], z: [0, 100] },
          options: { duration: 1, type: "tween" },
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].details).toMatchObject({
      property: "position",
      "x from": "10",
      "x to": "20",
      "y from": "30",
      "y to": "40",
    });
  });
});
