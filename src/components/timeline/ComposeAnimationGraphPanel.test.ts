import { describe, expect, it } from "vitest";
import {
  buildGraphNodes,
  getGraphAnimationSources,
  getGraphContentSize,
  getRenderableEdges,
  getSelectedComposition2dLayerGraph,
  getStrictComposition2dConnectionError,
  getStrictComposition2dPorts,
  setSelectedComposition2dLayerGraph,
  updateStrictConditionNodeParameter,
} from "./ComposeAnimationGraphPanel";
import type {
  AnimationGraphState,
  TypedAnimationGraphState,
} from "../../core/types";
import { createTypedAnimationGraphNode } from "../../core/animationGraph/nodeRegistry";
import type { AnimationGraphEdge as StrictAnimationGraphEdge } from "../../core/animationGraph/types";
import { addAnimationGraphPresetGroupToGraph } from "../../core/animationGraph/presets";

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
  it("renders only the strict source and out for a new composition2d graph", () => {
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
          "source:text": {
            id: "source:text",
            kind: "source",
            label: "Source",
            position: { x: 60, y: 12 },
            x: 60,
            y: 12,
            inputs: [],
            outputs: [],
            config: { objectId: "text" },
          },
          "composition2d:out": {
            id: "composition2d:out",
            kind: "out",
            label: "Out",
            position: { x: 74, y: 12 },
            x: 74,
            y: 12,
            inputs: [],
            outputs: [],
            config: {},
          },
        },
        edges: [],
      } as AnimationGraphState,
    );

    expect(nodes.map((node) => node.id).sort()).toEqual([
      "composition2d:out",
      "source:text",
    ]);
    expect(nodes.find((node) => node.id === "source:text")).toMatchObject({
      x: 60,
      y: 12,
    });
    expect(nodes.find((node) => node.id === "composition2d:out")).toMatchObject(
      { x: 74, y: 12 },
    );
  });

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
  it("adds presets as strict composition2d nodes and edges only", () => {
    const graph = addAnimationGraphPresetGroupToGraph(
      undefined,
      "fade-in",
      "text",
      { x: 10, y: 20 },
      "test",
    );

    expect(graph.sourceObjectId).toBe("text");
    expect(Object.values(graph.nodes).map((node) => node.kind)).toEqual([
      "source",
      "time",
      "out",
      "effect:clipper.adjustment.opacity",
    ]);
    expect(graph.edges).toEqual([
      {
        id: "preset:fade-in:test:source:out->preset:fade-in:test:time:in",
        from: { nodeId: "preset:fade-in:test:source", portId: "out" },
        to: { nodeId: "preset:fade-in:test:time", portId: "in" },
      },
      {
        id: "preset:fade-in:test:time:out->preset:fade-in:test:effect:0:opacity:in",
        from: { nodeId: "preset:fade-in:test:time", portId: "out" },
        to: { nodeId: "preset:fade-in:test:effect:0:opacity", portId: "in" },
      },
      {
        id: "preset:fade-in:test:effect:0:opacity:out->preset:fade-in:test:out:in",
        from: { nodeId: "preset:fade-in:test:effect:0:opacity", portId: "out" },
        to: { nodeId: "preset:fade-in:test:out", portId: "in" },
      },
    ]);
    expect("customNodes" in graph).toBe(false);
    expect("groups" in graph).toBe(false);
    expect("parameters" in graph).toBe(false);
    expect("layers" in graph).toBe(false);
  });

  it("writes strict composition2d graph without legacy layer fields", () => {
    const sourceText = createTypedAnimationGraphNode(
      "source:text",
      "source",
      { x: 10, y: 20 },
      { objectId: "text" },
      "Source",
    );
    const nextLayerGraph = {
      nodes: {
        "source:text": sourceText,
        "composition2d:out": createTypedAnimationGraphNode(
          "composition2d:out",
          "out",
          { x: 20, y: 20 },
          {},
          "Out",
        ),
      },
      edges: [
        {
          id: "source:text:out->composition2d:out:in",
          fromNodeId: "source:text",
          fromPort: "right" as const,
          toNodeId: "composition2d:out",
          toPort: "left" as const,
          fromSocket: "out",
          toSocket: "in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
      customNodes: {
        stale: { kind: "effect", label: "Stale", scopeKey: "text" },
      },
      parameters: { "source:text": { opacity: "1" } },
    } as unknown as AnimationGraphState;

    const nextGraph = setSelectedComposition2dLayerGraph(
      undefined,
      nextLayerGraph,
      "text",
      "composition2d",
    );

    expect(nextGraph).toMatchObject({
      id: "graph:text",
      sourceObjectId: "text",
      nodes: { "source:text": { kind: "source" } },
      edges: [
        {
          id: "source:text:out->composition2d:out:in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
    });
    expect("layers" in nextGraph).toBe(false);
    expect("customNodes" in nextGraph).toBe(false);
    expect("parameters" in nextGraph).toBe(false);
  });

  it("writes new composition2d effect nodes as package-backed strict nodes", () => {
    const opacityNode = createTypedAnimationGraphNode(
      "custom:opacity:test",
      "effect",
      { x: 12, y: 8 },
      { property: "opacity", from: "0", to: "1" },
      "Opacity",
    );
    const nextGraph = setSelectedComposition2dLayerGraph(
      undefined,
      {
        nodes: { "custom:opacity:test": opacityNode },
        edges: [],
      } as AnimationGraphState,
      "text",
      "composition2d",
    );

    expect(nextGraph.nodes["custom:opacity:test"]).toMatchObject({
      kind: "effect:clipper.adjustment.opacity",
      config: { params: { from: 0, to: 1 } },
    });
  });

  it("adapts strict graph to editor graph without exposing parameters", () => {
    const graph = {
      id: "graph:shape",
      sourceObjectId: "shape",
      nodes: {
        source: {
          id: "source",
          kind: "source",
          position: { x: 1, y: 2 },
          config: { objectId: "shape" },
        },
      },
      edges: [],
    };

    const selected = getSelectedComposition2dLayerGraph(
      graph,
      "shape",
      "composition2d",
    );
    expect(selected?.nodes.source).toMatchObject({
      kind: "source",
      position: { x: 1, y: 2 },
    });
    expect(selected?.parameters).toBeUndefined();
  });

  it("ignores old composition2d typed layer graph shape", () => {
    const legacyGraph = {
      nodes: {},
      edges: [],
      layers: [
        {
          id: "text",
          nodes: {
            legacy: createTypedAnimationGraphNode(
              "legacy",
              "time",
              { x: 1, y: 2 },
              {},
              "Legacy Time",
            ),
          },
          edges: [],
          customNodes: {
            stale: { kind: "effect", label: "Stale", scopeKey: "text" },
          },
          groups: {
            stale: {
              id: "stale",
              name: "Stale",
              nodes: {},
              edges: [],
              outNodeId: "out",
            },
          },
          parameters: { legacy: { delay: "1s" } },
        },
      ],
    } as TypedAnimationGraphState;

    expect(
      getSelectedComposition2dLayerGraph(legacyGraph, "text", "composition2d"),
    ).toBeUndefined();
  });

  it("drops legacy edge-only shape when writing strict composition2d graph", () => {
    const sourceText = createTypedAnimationGraphNode(
      "source:text",
      "source",
      { x: 10, y: 20 },
      { objectId: "text" },
      "Source",
    );
    const out = createTypedAnimationGraphNode(
      "composition2d:out",
      "out",
      { x: 20, y: 20 },
      {},
      "Out",
    );
    const nextGraph = setSelectedComposition2dLayerGraph(
      undefined,
      {
        nodes: { "source:text": sourceText, "composition2d:out": out },
        edges: [
          {
            id: "source:text:right->composition2d:out:left",
            fromNodeId: "source:text",
            fromPort: "right",
            toNodeId: "composition2d:out",
            toPort: "left",
            fromSocket: "out",
            toSocket: "in",
          },
        ],
      } as AnimationGraphState,
      "text",
      "composition2d",
    );

    expect(nextGraph.edges).toEqual([]);
  });

  it("drops incompatible strict edges instead of invalidating the graph", () => {
    const source = createTypedAnimationGraphNode(
      "source:text",
      "source",
      { x: 10, y: 10 },
      { objectId: "text" },
      "Source",
    );
    const value = {
      id: "value:number",
      kind: "value:number",
      label: "Number",
      position: { x: 18, y: 10 },
      x: 18,
      y: 10,
      inputs: [],
      outputs: [],
      config: { value: 1 },
    } as unknown as AnimationGraphState["nodes"][string];
    const out = createTypedAnimationGraphNode(
      "composition2d:out",
      "out",
      { x: 26, y: 10 },
      {},
      "Out",
    );

    const nextGraph = setSelectedComposition2dLayerGraph(
      undefined,
      {
        nodes: {
          "source:text": source,
          "value:number": value,
          "composition2d:out": out,
        },
        edges: [
          {
            id: "value:number:value->composition2d:out:in",
            fromNodeId: "value:number",
            fromPort: "right",
            toNodeId: "composition2d:out",
            toPort: "left",
            from: { nodeId: "value:number", portId: "value" },
            to: { nodeId: "composition2d:out", portId: "in" },
          } as AnimationGraphState["edges"][number],
        ],
      } as AnimationGraphState,
      "text",
      "composition2d",
    );

    expect(Object.keys(nextGraph.nodes).sort()).toEqual([
      "composition2d:out",
      "source:text",
      "value:number",
    ]);
    expect(nextGraph.edges).toEqual([]);
  });
});

describe("composition2d strict Phase 5 editor behavior", () => {
  const textObject = {
    id: "text",
    name: "Text",
    type: "text" as const,
    selector: ".text",
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    style: {},
    animations: [],
  };

  it("does not invent condition fallback sockets for composition2d renderable edges", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 8, y: 2 },
      { outputs: [], rules: [] },
      "Condition",
    );
    const graph = {
      nodes: { condition },
      edges: [
        {
          id: "condition:right->composition2d:out:left",
          fromNodeId: "condition",
          fromPort: "right",
          toNodeId: "composition2d:out",
          toPort: "left",
        },
      ],
    } as AnimationGraphState;
    const nodes = buildGraphNodes([textObject], graph);

    expect(getRenderableEdges(graph, nodes, [textObject])).toEqual([]);
  });

  it("preserves strict endpoints on composition2d edges", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 8, y: 2 },
      { outputs: [{ id: "output:1", label: "Output 1" }], rules: [] },
      "Condition",
    );
    const edge = {
      id: "condition:output:1->composition2d:out:in",
      fromNodeId: "condition",
      fromPort: "right",
      toNodeId: "composition2d:out",
      toPort: "left",
      fromSocket: "output:1",
      toSocket: "in",
      from: { nodeId: "condition", portId: "output:1" },
      to: { nodeId: "composition2d:out", portId: "in" },
    } satisfies AnimationGraphState["edges"][number] & StrictAnimationGraphEdge;
    const graph = {
      nodes: { condition },
      edges: [edge],
    } as AnimationGraphState;
    const nodes = buildGraphNodes([textObject], graph);

    expect(getRenderableEdges(graph, nodes, [textObject])[0]).toMatchObject({
      from: { nodeId: "condition", portId: "output:1" },
      to: { nodeId: "composition2d:out", portId: "in" },
      fromSocket: "output:1",
      toSocket: "in",
    });
  });

  it("persists condition outputs and rules in strict node config", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 1, y: 2 },
      { outputs: [], rules: [] },
      "Condition",
    );
    const base = {
      nodes: { condition },
      edges: [],
    } as AnimationGraphState;

    const withAction = updateStrictConditionNodeParameter(
      base,
      "condition",
      "action",
      "sendToOutput",
    );
    const withOutput = updateStrictConditionNodeParameter(
      withAction,
      "condition",
      "outputPort",
      "output:stable",
    );
    const next = withOutput.nodes.condition;

    expect(next).toMatchObject({
      config: {
        outputs: [{ id: "output:stable", label: "Output stable" }],
        rules: [{ action: "sendToOutput", output: "output:stable" }],
      },
    });
    expect(withOutput.parameters).toBeUndefined();
  });

  it("returns strict composition2d incompatibility error used by toast path", () => {
    const valueNode = {
      id: "value",
      label: "Number",
      kind: "time" as const,
      x: 0,
      y: 0,
      width: 6,
      height: 2,
      typedNode: {
        id: "value",
        kind: "value:number",
        position: { x: 0, y: 0 },
        config: { value: 1 },
      } as any,
    };
    const outNode = {
      id: "out",
      label: "Out",
      kind: "out" as const,
      x: 8,
      y: 0,
      width: 6,
      height: 2,
      typedNode: createTypedAnimationGraphNode(
        "out",
        "out",
        { x: 8, y: 0 },
        {},
        "Out",
      ),
    };

    expect(
      getStrictComposition2dConnectionError(valueNode, outNode, "value", "in"),
    ).toContain("Cannot connect");
  });

  it("exposes strict condition ports for canvas rendering without legacy fallback", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 1, y: 2 },
      { outputs: [{ id: "output:1", label: "Output 1" }], rules: [] },
      "Condition",
    );
    const node = {
      id: "condition",
      label: "Condition",
      kind: "condition" as const,
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      typedNode: condition,
    };

    expect(getStrictComposition2dPorts(node).map((port) => port.id)).toEqual([
      "in",
      "output:1",
      "output:next",
    ]);
    expect(
      getStrictComposition2dPorts(node, [
        {
          id: "condition:default->out:in",
          fromNodeId: "condition",
          fromPort: "right",
          toNodeId: "out",
          toPort: "left",
          fromSocket: "default",
          toSocket: "in",
          from: { nodeId: "condition", portId: "default" },
          to: { nodeId: "out", portId: "in" },
        } as AnimationGraphState["edges"][number] & StrictAnimationGraphEdge,
      ]).map((port) => port.id),
    ).toEqual(["in", "default", "output:1", "output:next"]);
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
