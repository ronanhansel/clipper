import { describe, expect, it } from "vitest";
import strictComposition2dGraphPanelSource from "./StrictComposition2dGraphPanel.tsx?raw";
import {
  buildGraphNodes,
  getGraphAnimationSources,
  getGraphEdgesAfterEdgeDrop,
  getGraphEdgeDropEdge,
  getGraphNodeParameterEditorSchema,
  getGraphPointerDownConnector,
  getGraphContentSize,
  getRenderableEdges,
  getSelectedComposition2dDisplayGraph,
  getSelectedComposition2dLayerGraph,
  getStrictGraphNodeMenuGroups,
  getVisibleStrictComposition2dPorts,
  setSelectedComposition2dLayerGraph,
} from "./ComposeAnimationGraphPanel";
import {
  getStrictComposition2dCanvasDiagnostics,
  getStrictComposition2dConnectionError,
  getStrictComposition2dParameterEditorSchema,
  getStrictComposition2dPorts,
  saveStrictComposition2dGraph,
  updateStrictComposition2dNodeParameter,
} from "./StrictComposition2dGraphPanel";
import type {
  AnimationGraphState,
  TypedAnimationGraphState,
} from "../../core/types";
import { createTypedAnimationGraphNode } from "../../core/animationGraph/nodeRegistry";
import type {
  AnimationGraph as StrictAnimationGraph,
  AnimationGraphEdge as StrictAnimationGraphEdge,
} from "../../core/animationGraph/types";
import { addAnimationGraphPresetGroupToGraph } from "../../core/animationGraph/presets";
import {
  getAnimationGraphNodeDefinition,
  getAnimationGraphNodeDefinitions,
} from "../../core/animationGraph/registry";
import { bindStrictGraphInputParameter } from "../../core/graphParameterBindings";

type GraphMenuTestGroup = {
  entries: readonly { value: { kind: string } }[];
  children?: readonly GraphMenuTestGroup[];
};

function flattenGraphMenuKinds(
  groups: readonly GraphMenuTestGroup[],
): string[] {
  return groups.flatMap((group) => [
    ...group.entries.map((entry) => entry.value.kind),
    ...flattenGraphMenuKinds(group.children ?? []),
  ]);
}

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

describe("getStrictComposition2dCanvasDiagnostics", () => {
  it("maps node diagnostics and trace summaries for inspector use", () => {
    const result = getStrictComposition2dCanvasDiagnostics({
      diagnostics: [
        {
          severity: "warning",
          message: "Dropped output.",
          nodeId: "condition",
          portId: "matched",
          outputId: "matched",
        },
      ],
      trace: {
        events: [
          {
            type: "node",
            nodeId: "condition",
            nodeKind: "condition",
            inputs: {},
            outputs: {
              matched: [
                {
                  streamId: "s1",
                  kind: "animation",
                  domain: "textToken",
                  structureKind: "richText",
                  tokenCount: 2,
                  maskCount: 2,
                  effectCount: 1,
                  controllerSummary:
                    "start 0, delay 0, duration 1, ease easeOut",
                },
              ],
            },
          },
          {
            type: "edge",
            edgeId: "condition:matched->out:in",
            from: { nodeId: "condition", portId: "matched" },
            to: { nodeId: "out", portId: "in" },
            streams: [
              {
                streamId: "s1",
                kind: "animation",
                domain: "textToken",
                structureKind: "richText",
                tokenCount: 2,
                maskCount: 2,
                effectCount: 1,
              },
            ],
          },
        ],
      },
    });

    expect(result.nodes.get("condition")?.messages).toEqual([
      "Dropped output.",
    ]);
    expect(result.nodes.get("condition")?.traces).toEqual([
      "matched: animation textToken richText 2t 2m 1fx start 0, delay 0, duration 1, ease easeOut",
    ]);
    expect(result.edges.get("condition:matched->out:in")?.label).toBe(
      "animation textToken richText 2t 2m 1fx",
    );
  });
});

describe("buildGraphNodes", () => {
  it("starts connector drags only from explicit connector area", () => {
    const node = {
      id: "source:text",
      label: "Text",
      kind: "layer",
      x: 4,
      y: 4,
      width: 6,
      height: 2,
    };
    const insideRightEdge = {
      x: (node.x + node.width) * 18 - 1,
      y: (node.y + node.height / 2) * 18,
    };
    const outsideConnector = {
      x: (node.x + node.width) * 18 + 14,
      y: (node.y + node.height / 2) * 18,
    };

    expect(getGraphPointerDownConnector(insideRightEdge, [node])).toBeNull();
    expect(
      getGraphPointerDownConnector(outsideConnector, [node]),
    ).toMatchObject({
      nodeId: "source:text",
    });
  });

  it("does not start connector drags from an edge center control", () => {
    const source = {
      id: "source",
      label: "Source",
      kind: "layer",
      x: 4,
      y: 4,
      width: 6,
      height: 2,
    };
    const out = {
      id: "out",
      label: "Out",
      kind: "out",
      x: 11,
      y: 4,
      width: 3,
      height: 2,
    };
    const edge = {
      id: "source:out->out:in",
      from: { nodeId: "source", portId: "out" },
      to: { nodeId: "out", portId: "in" },
    } satisfies StrictAnimationGraphEdge;
    const edgeCenter = {
      x: ((source.x + source.width) * 18 + out.x * 18) / 2,
      y: (source.y + source.height / 2) * 18,
    };

    expect(
      getGraphPointerDownConnector(edgeCenter, [source, out]),
    ).toMatchObject({
      nodeId: "source",
    });
    expect(
      getGraphPointerDownConnector(edgeCenter, [source, out], 1, null, [
        edge,
      ] as any),
    ).toBeNull();
  });

  it("lists addable strict registry nodes in the graph menu", () => {
    const menuKinds = new Set(
      getStrictGraphNodeMenuGroups().flatMap((group) => [
        ...group.entries.map((entry) => entry.value.kind),
        ...flattenGraphMenuKinds(group.children),
      ]),
    );
    const expectedKinds = getAnimationGraphNodeDefinitions()
      .map((definition) => definition.kind)
      .filter(
        (kind) =>
          kind === "time" ||
          kind === "split" ||
          kind === "condition" ||
          kind.startsWith("value:") ||
          kind.startsWith("effect:") ||
          kind.startsWith("geometry:") ||
          kind.startsWith("virtual:"),
      )
      .filter((kind) => !["source", "out", "macro"].includes(kind));

    expect([...menuKinds].sort()).toEqual([...expectedKinds].sort());
    expect(menuKinds).toContain("effect:clipper.motion.zoom");
    expect(menuKinds).toContain("virtual:text");
    expect(menuKinds).toContain("geometry:dotGrid");
    expect(menuKinds).not.toContain("source");
    expect(menuKinds).not.toContain("out");
  });

  it("nests value and geometry graph menu nodes into subgroups", () => {
    const groups = getStrictGraphNodeMenuGroups();
    const value = groups.find((group) => group.label === "Value");
    const geometry = groups.find((group) => group.label === "Geometry");

    expect(value?.children.map((group) => group.label)).toEqual(
      expect.arrayContaining(["Constants", "Math", "Compare", "Combine"]),
    );
    expect(
      value?.children
        .find((group) => group.label === "Math")
        ?.entries.map((entry) => entry.value.kind),
    ).toContain("value:math:add");
    expect(geometry?.children.map((group) => group.label)).toEqual(
      expect.arrayContaining(["Primitives", "Transform", "Path", "Points"]),
    );
    expect(
      geometry?.children
        .find((group) => group.label === "Primitives")
        ?.entries.map((entry) => entry.value.kind),
    ).toContain("geometry:rectangle");
  });

  it("sanitizes non-finite strict node positions before canvas layout", () => {
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
        id: "graph",
        sourceObjectId: "text",
        nodes: {
          "source:text": {
            id: "source:text",
            kind: "source",
            position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
            config: { objectId: "text" },
          },
          "composition2d:out": {
            id: "composition2d:out",
            kind: "out",
            position: { x: Number.NEGATIVE_INFINITY, y: Number.NaN },
            config: {},
          },
        },
        edges: [],
      } as unknown as AnimationGraphState,
    );

    expect(
      nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)),
    ).toBe(true);
    expect(nodes.find((node) => node.id === "source:text")).toMatchObject({
      x: 0,
      y: 0,
    });
    const out = nodes.find((node) => node.id === "composition2d:out");
    expect(Number.isFinite(out?.x)).toBe(true);
    expect(Number.isFinite(out?.y)).toBe(true);
  });

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

  it("does not show another object's strict graph for selected text", () => {
    const graph = {
      id: "graph:background",
      sourceObjectId: "background",
      nodes: {
        source: {
          id: "source",
          kind: "source",
          position: { x: 60, y: 12 },
          config: { objectId: "background" },
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 74, y: 12 },
          config: {},
        },
      },
      edges: [
        {
          id: "noise:1:value->opacity:to",
          from: { nodeId: "noise:1", portId: "value" },
          to: { nodeId: "opacity", portId: "to" },
        },
      ],
    } satisfies StrictAnimationGraph;

    expect(
      getSelectedComposition2dLayerGraph(graph, "text", "composition2d"),
    ).toBeUndefined();
  });

  it("builds clean default Source to Out display graph for objects without matching graph", () => {
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [],
    };
    const graph = getSelectedComposition2dDisplayGraph(
      undefined,
      object,
      "composition2d",
    );
    const nodes = buildGraphNodes(
      [object],
      graph,
      5200,
      900,
      "text",
      "composition2d",
    );
    const edges = getRenderableEdges(graph, nodes, [object]);

    expect(nodes.map((node) => node.id).sort()).toEqual([
      "composition2d:out",
      "source:text",
    ]);
    expect(nodes.find((node) => node.id === "source:text")).toMatchObject({
      label: "Text",
    });
    expect(edges).toEqual([
      {
        id: "source:text:out->composition2d:out:in",
        from: { nodeId: "source:text", portId: "out" },
        to: { nodeId: "composition2d:out", portId: "in" },
      },
    ]);
  });

  it("creates a strict Source to Out edge when dropped on Out", () => {
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [],
    };
    const graph: StrictAnimationGraph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 60, y: 12 },
          config: { objectId: "text" },
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 68, y: 12 },
          config: {},
        },
      },
      edges: [],
    } satisfies StrictAnimationGraph;
    const nodes = buildGraphNodes([object], graph as any);
    const out = nodes.find((node) => node.id === "composition2d:out")!;
    const source = nodes.find((node) => node.id === "source:text")!;

    const edge = getGraphEdgeDropEdge(
      {
        x: (out.x + out.width / 2) * 18,
        y: (out.y + out.height / 2) * 18,
      },
      {
        kind: "edge",
        fromNodeId: source.id,
        fromPort: "right",
        fromSocket: "out",
        portId: "out",
        fromNode: source,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graph,
      [object],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;

    expect(edge).toMatchObject({
      from: { nodeId: "source:text", portId: "out" },
      to: { nodeId: "composition2d:out", portId: "in" },
    });
  });

  it("uses persisted layer node positions when graph owns layout", () => {
    const nodes = buildGraphNodes(
      [
        {
          id: "text",
          name: "Text",
          type: "rect",
          selector: ".text",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          style: {},
          animations: [],
        },
      ],
      {
        nodes: { "layer:text": { x: 12, y: 34 } },
        edges: [],
      },
    );

    expect(nodes.find((node) => node.id === "layer:text")).toMatchObject({
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

  it("keeps disconnected strict typed chains visible while editing", () => {
    const scaleDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.motion.zoom",
    )!;
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 2, y: 2 },
          config: { objectId: "text" },
        },
        time: {
          id: "time",
          kind: "time",
          position: { x: 8, y: 2 },
          config: { delay: 0, duration: 1, ease: "linear" },
        },
        scale: {
          id: "scale",
          kind: "effect:clipper.motion.zoom",
          position: { x: 14, y: 2 },
          config: scaleDefinition.createDefaultConfig({ graphId: "test" }),
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 20, y: 2 },
          config: {},
        },
      },
      edges: [
        {
          id: "time:out->scale:in",
          from: { nodeId: "time", portId: "out" },
          to: { nodeId: "scale", portId: "in" },
        },
      ],
    } satisfies StrictAnimationGraph;

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
      graph,
      5200,
      900,
      "text",
      "composition2d",
    );

    expect(nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["time", "scale"]),
    );
    expect(getRenderableEdges(graph, nodes, [])).toEqual(graph.edges);
  });

  it("keeps prior strict edge when adding another edge from current graph", () => {
    const scaleDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.motion.zoom",
    )!;
    const blurDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.adjustment.blur",
    )!;
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 2, y: 2 },
          config: { objectId: "text" },
        },
        time: {
          id: "time",
          kind: "time",
          position: { x: 8, y: 2 },
          config: { delay: 0, duration: 1, ease: "linear" },
        },
        scale: {
          id: "scale",
          kind: "effect:clipper.motion.zoom",
          position: { x: 14, y: 2 },
          config: scaleDefinition.createDefaultConfig({ graphId: "test" }),
        },
        blur: {
          id: "blur",
          kind: "effect:clipper.adjustment.blur",
          position: { x: 20, y: 2 },
          config: blurDefinition.createDefaultConfig({ graphId: "test" }),
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 26, y: 2 },
          config: {},
        },
      },
      edges: [
        {
          id: "time:out->scale:in",
          from: { nodeId: "time", portId: "out" },
          to: { nodeId: "scale", portId: "in" },
        },
      ],
    } satisfies StrictAnimationGraph;
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [],
    };
    const nodes = buildGraphNodes(
      [object],
      graph,
      5200,
      900,
      "text",
      "composition2d",
    );
    const scale = nodes.find((node) => node.id === "scale")!;
    const blur = nodes.find((node) => node.id === "blur")!;
    const currentEdges = getRenderableEdges(graph, nodes, [object]);
    const nextEdge = getGraphEdgeDropEdge(
      {
        x: (blur.x + blur.width / 2) * 18,
        y: (blur.y + blur.height / 2) * 18,
      },
      {
        kind: "edge",
        fromNodeId: scale.id,
        fromPort: "right",
        portId: "out",
        fromNode: scale,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graph,
      [object],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;

    expect(nextEdge).toMatchObject({
      from: { nodeId: "scale", portId: "out" },
      to: { nodeId: "blur", portId: "in" },
    });
    expect(
      getGraphEdgesAfterEdgeDrop(
        nextEdge!,
        graph,
        nodes,
        [object],
        "composition2d",
      ),
    ).toEqual([...currentEdges, nextEdge]);
  });
});

describe("composition2d layer graph selection", () => {
  it("keeps source to scale to out as a strict graph chain", () => {
    const scaleDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.motion.zoom",
    )!;
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 2, y: 2 },
          config: { objectId: "text" },
        },
        scale: {
          id: "scale",
          kind: "effect:clipper.motion.zoom",
          position: { x: 10, y: 2 },
          config: scaleDefinition.createDefaultConfig({ graphId: "test" }),
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 18, y: 2 },
          config: {},
        },
      },
      edges: [],
    } satisfies StrictAnimationGraph;
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: ".text",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [],
    };
    const nodes = buildGraphNodes(
      [object],
      graph,
      5200,
      900,
      "text",
      "composition2d",
    );
    const source = nodes.find((node) => node.id === "source:text")!;
    const scale = nodes.find((node) => node.id === "scale")!;
    const out = nodes.find((node) => node.id === "composition2d:out")!;
    const scaleCenter = {
      x: (scale.x + scale.width / 2) * 18,
      y: (scale.y + scale.height / 2) * 18,
    };
    const outCenter = {
      x: (out.x + out.width / 2) * 18,
      y: (out.y + out.height / 2) * 18,
    };

    const sourceToScale = getGraphEdgeDropEdge(
      scaleCenter,
      {
        kind: "edge",
        fromNodeId: source.id,
        fromPort: "right",
        portId: "out",
        fromNode: source,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graph,
      [object],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;
    expect(sourceToScale).toMatchObject({
      from: { nodeId: "source:text", portId: "out" },
      to: { nodeId: "scale", portId: "in" },
    });

    const graphWithFirstEdge = {
      ...graph,
      edges: [sourceToScale!],
    };
    const scaleToOut = getGraphEdgeDropEdge(
      outCenter,
      {
        kind: "edge",
        fromNodeId: scale.id,
        fromPort: "right",
        portId: "out",
        fromNode: scale,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graphWithFirstEdge,
      [object],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;
    expect(scaleToOut).toMatchObject({
      from: { nodeId: "scale", portId: "out" },
      to: { nodeId: "composition2d:out", portId: "in" },
    });

    const saved = saveStrictComposition2dGraph(
      {
        nodes: graph.nodes,
        edges: [sourceToScale!, scaleToOut!],
      },
      graph,
      "text",
    );

    expect(saved.edges).toEqual([sourceToScale, scaleToOut]);
    expect(JSON.stringify(saved)).not.toMatch(
      /fromNodeId|toNodeId|customNodes/,
    );
  });

  it("strict module save drops legacy-shaped edges and never emits legacy fields", () => {
    const graph = saveStrictComposition2dGraph(
      {
        nodes: {
          source: createTypedAnimationGraphNode(
            "source",
            "source",
            { x: 1, y: 2 },
            { objectId: "text" },
            "Source",
          ),
          out: createTypedAnimationGraphNode(
            "out",
            "out",
            { x: 3, y: 2 },
            {},
            "Out",
          ),
        },
        edges: [
          {
            id: "legacy",
            fromNodeId: "source",
            fromPort: "right",
            toNodeId: "out",
            toPort: "left",
          },
          {
            id: "strict",
            from: { nodeId: "source", portId: "out" },
            to: { nodeId: "out", portId: "in" },
          },
        ],
      },
      undefined,
      "text",
    );

    expect(graph.edges).toEqual([
      {
        id: "strict",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "out", portId: "in" },
      },
    ]);
    expect(JSON.stringify(graph)).not.toMatch(
      /fromNodeId|fromPort|toNodeId|toPort|customNodes|parameters|groups|layers/,
    );
  });

  it("strict module update preserves strict graph shape", () => {
    const graph = saveStrictComposition2dGraph(
      {
        nodes: {
          opacity: createTypedAnimationGraphNode(
            "opacity",
            "effect",
            { x: 1, y: 2 },
            { effects: [{ property: "opacity", values: { from: 0, to: 1 } }] },
            "Opacity",
          ),
        },
        edges: [],
      },
      undefined,
      "text",
    );
    const updated = updateStrictComposition2dNodeParameter(
      graph,
      "opacity",
      "from",
      "0.5",
    );

    expect(updated.nodes.opacity.config).toMatchObject({
      params: { from: 0.5, to: 1 },
    });
    expect(JSON.stringify(updated)).not.toMatch(
      /fromNodeId|fromPort|toNodeId|toPort|customNodes|parameters|groups|layers/,
    );
  });

  it("strict module save binds graph identity to selected source object", () => {
    const graph = saveStrictComposition2dGraph(
      {
        nodes: {
          source: createTypedAnimationGraphNode(
            "source",
            "source",
            { x: 0, y: 0 },
            { objectId: "new-source" },
            "Source",
          ),
          out: createTypedAnimationGraphNode(
            "out",
            "out",
            { x: 200, y: 0 },
            {},
            "Out",
          ),
        },
        edges: [
          {
            id: "source:out->out:in",
            from: { nodeId: "source", portId: "out" },
            to: { nodeId: "out", portId: "in" },
          },
        ],
      },
      {
        id: "graph:old-source",
        sourceObjectId: "old-source",
        nodes: {},
        edges: [],
      },
      "new-source",
    );

    expect(graph).toMatchObject({
      id: "graph:new-source",
      sourceObjectId: "new-source",
    });
    expect(graph.edges).toHaveLength(1);
  });

  it("strict module contains no legacy boundary symbols", () => {
    const source = strictComposition2dGraphPanelSource;

    expect(source).not.toMatch(
      /AnimationGraphState|TypedAnimationGraphState|customNodes|parameters|groups|fromSocket|toSocket|output:next|animationGraph\/compatibility/,
    );
  });

  it("keeps selected composition2d graph on strict edge endpoints", () => {
    const graph: StrictAnimationGraph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 1, y: 2 },
          config: { objectId: "text" },
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 5, y: 2 },
          config: {},
        },
      },
      edges: [
        {
          id: "source:text:out->composition2d:out:in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
    };

    const selected = getSelectedComposition2dLayerGraph(
      graph,
      "text",
      "composition2d",
    );
    const renderable = getRenderableEdges(
      selected,
      buildGraphNodes([], selected, 5200, 900, "text", "composition2d"),
      [],
    );

    expect(selected).toBe(graph);
    expect(renderable).toEqual(graph.edges);
    expect(JSON.stringify({ selected, renderable })).not.toMatch(
      /fromSocket|toSocket|fromNodeId|toNodeId/,
    );
  });

  it("does not expose removed strict-to-legacy bridge helpers", async () => {
    const panel = await import("./ComposeAnimationGraphPanel");

    expect("strictGraphToEditorGraph" in panel).toBe(false);
    expect("strictEdgeToEditorEdge" in panel).toBe(false);
  });

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
    expect(JSON.stringify(nextGraph)).not.toMatch(/fromSocket|toSocket/);
  });

  it("rejects editor edges whose legacy sockets disagree with strict endpoints", () => {
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
            id: "source:text:out->composition2d:out:in",
            fromNodeId: "source:text",
            fromPort: "right",
            toNodeId: "composition2d:out",
            toPort: "left",
            fromSocket: "output:next",
            toSocket: "in",
            from: { nodeId: "source:text", portId: "out" },
            to: { nodeId: "composition2d:out", portId: "in" },
          } as AnimationGraphState["edges"][number] & StrictAnimationGraphEdge,
        ],
      } as AnimationGraphState,
      "text",
      "composition2d",
    );

    expect(nextGraph.edges).toEqual([]);
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
    } as unknown as AnimationGraphState;
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

  it("creates concrete strict condition output ports from new output drag", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 8, y: 2 },
      { outputs: [], rules: [] },
      "Condition",
    );
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        condition,
        "composition2d:out": createTypedAnimationGraphNode(
          "composition2d:out",
          "out",
          { x: 16, y: 2 },
          {},
          "Out",
        ),
      },
      edges: [],
    } satisfies StrictAnimationGraph;
    const nodes = buildGraphNodes([textObject], graph);
    const conditionNode = nodes.find((node) => node.id === "condition")!;
    const out = nodes.find((node) => node.id === "composition2d:out")!;
    const edge = getGraphEdgeDropEdge(
      {
        x: (out.x + out.width / 2) * 18,
        y: (out.y + out.height / 2) * 18,
      },
      {
        kind: "edge",
        fromNodeId: conditionNode.id,
        fromPort: "right",
        portId: "new-output",
        fromNode: conditionNode,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graph,
      [textObject],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;

    expect(edge).toMatchObject({
      from: { nodeId: "condition", portId: "output:1" },
      to: { nodeId: "composition2d:out", portId: "in" },
    });
  });

  it("persists new condition output config when saving condition to time edge", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 8, y: 2 },
      { outputs: [], rules: [] },
      "Condition",
    );
    const time = createTypedAnimationGraphNode(
      "time",
      "time",
      { x: 16, y: 2 },
      { delay: 0, duration: 1, ease: "linear" },
      "Time",
    );
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        condition,
        time,
        "composition2d:out": createTypedAnimationGraphNode(
          "composition2d:out",
          "out",
          { x: 24, y: 2 },
          {},
          "Out",
        ),
      },
      edges: [],
    } satisfies StrictAnimationGraph;
    const nodes = buildGraphNodes([textObject], graph);
    const conditionNode = nodes.find((node) => node.id === "condition")!;
    const timeNode = nodes.find((node) => node.id === "time")!;
    const edge = getGraphEdgeDropEdge(
      {
        x: (timeNode.x + timeNode.width / 2) * 18,
        y: (timeNode.y + timeNode.height / 2) * 18,
      },
      {
        kind: "edge",
        fromNodeId: conditionNode.id,
        fromPort: "right",
        portId: "new-output",
        fromNode: conditionNode,
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
      },
      nodes,
      1,
      graph,
      [textObject],
      "composition2d",
    ) as StrictAnimationGraphEdge | null;
    const saved = saveStrictComposition2dGraph(
      {
        nodes: {
          ...graph.nodes,
          condition: {
            ...graph.nodes.condition,
            config: {
              ...graph.nodes.condition.config,
              outputs: [{ id: "output:1", label: "Output 1" }],
            },
          },
        },
        edges: [edge!],
      },
      graph,
      "text",
    );

    expect(saved.edges).toEqual([edge]);
    expect((saved.nodes.condition.config as any).outputs).toEqual([
      { id: "output:1", label: "Output 1" },
    ]);
  });

  it("renders strict source to out edges from saved graph data", () => {
    const graph = {
      id: "graph:text-mp13s444",
      sourceObjectId: "text-mp13s444",
      nodes: {
        "source:text-mp13s444": {
          id: "source:text-mp13s444",
          kind: "source",
          position: { x: 60, y: 12 },
          config: { objectId: "text-mp13s444" },
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 74, y: 12 },
          config: {},
        },
      },
      edges: [
        {
          id: "source:text-mp13s444:out->composition2d:out:in",
          from: { nodeId: "source:text-mp13s444", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
    } satisfies StrictAnimationGraph;
    const object = {
      ...textObject,
      id: "text-mp13s444",
    };
    const nodes = buildGraphNodes([object], graph);

    expect(getRenderableEdges(graph, nodes, [object])).toEqual(graph.edges);
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
      id: "graph:text",
      sourceObjectId: "text",
      nodes: { condition },
      edges: [],
    } as StrictAnimationGraph;

    const withValue = updateStrictComposition2dNodeParameter(
      base,
      "condition",
      "value",
      "headline",
    );
    const withAction = updateStrictComposition2dNodeParameter(
      withValue,
      "condition",
      "action",
      "sendToOutput",
    );
    const withOutput = updateStrictComposition2dNodeParameter(
      withAction,
      "condition",
      "outputPort",
      "output:stable",
    );
    const next = withOutput.nodes.condition;

    expect(next).toMatchObject({
      config: {
        outputs: [{ id: "output:stable", label: "Output stable" }],
        rules: [
          {
            action: "sendToOutput",
            output: "output:stable",
            value: "headline",
          },
        ],
      },
    });
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

  it("keeps one visible strict condition animation output square", () => {
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

    const edges = [
      {
        id: "condition:default->out:in",
        from: { nodeId: "condition", portId: "default" },
        to: { nodeId: "out", portId: "in" },
      } as StrictAnimationGraphEdge,
    ];

    expect(getStrictComposition2dPorts(node, edges).map((port) => port.id))
      .toEqual(["in", "default", "output:1", "new-output"]);
    expect(
      getVisibleStrictComposition2dPorts(node, edges as any).map(
        (port) => port.id,
      ),
    ).toEqual(["in", "new-output"]);
  });

  it("keeps strict condition inspector output values aligned with port ids", () => {
    const condition = createTypedAnimationGraphNode(
      "condition",
      "condition",
      { x: 1, y: 2 },
      {
        outputs: [{ id: "output:1", label: "Output 1" }],
        rules: [{ action: "sendToOutput", output: "output:1" }],
      },
      "Condition",
    );
    const schema = getStrictComposition2dParameterEditorSchema(
      {
        id: "condition",
        label: "Condition",
        kind: "condition",
        x: 1,
        y: 2,
        width: 8,
        height: 2,
        typedNode: condition,
      },
      [
        {
          id: "condition:output:1->out:in",
          from: { nodeId: "condition", portId: "output:1" },
          to: { nodeId: "out", portId: "in" },
        } satisfies StrictAnimationGraphEdge,
      ],
    );
    const outputField = schema?.groups[0].fields.find(
      (field) => field.key === "outputPort",
    );

    expect(outputField).toMatchObject({ value: "output:1" });
    expect(outputField?.options?.map((option) => option.value)).toContain(
      "output:1",
    );
    expect(outputField?.options?.map((option) => option.value)).not.toContain(
      "1",
    );
  });

  it("renders strict node inspector fields from definition controls", () => {
    const time = createTypedAnimationGraphNode(
      "time",
      "time",
      { x: 1, y: 2 },
      { delay: 0.25, duration: 2, ease: "easeOut", schedule: "absolute" },
      "Time",
    );
    const schema = getStrictComposition2dParameterEditorSchema({
      id: "time",
      label: "Time",
      kind: "time",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      typedNode: time,
    });

    expect(schema?.groups[0].fields.map((field) => field.key)).toEqual([
      "delay",
      "duration",
      "ease",
      "schedule",
    ]);
    expect(schema?.groups[0].fields[0]).toMatchObject({
      key: "delay",
      value: "0.25",
      unit: "s",
    });
  });

  it("renders and updates package-backed effect params from metadata controls", () => {
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        opacity: {
          id: "opacity",
          kind: "effect:clipper.adjustment.opacity",
          position: { x: 1, y: 2 },
          config: {
            effectId: "clipper.adjustment.opacity",
            params: { from: 0, to: 1 },
          },
        },
      },
      edges: [],
    } satisfies StrictAnimationGraph;
    const schema = getStrictComposition2dParameterEditorSchema({
      id: "opacity",
      label: "Opacity",
      kind: "effect",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      typedNode: graph.nodes.opacity as any,
    });

    const next = updateStrictComposition2dNodeParameter(
      graph,
      "opacity",
      "from",
      "0.5",
    );

    expect(schema?.groups[0].fields.map((field) => field.key)).toEqual([
      "from",
      "to",
    ]);
    expect((next.nodes.opacity as any).config.params.from).toBe(0.5);
  });

  it("renders package-backed effect params through the graph inspector schema", () => {
    const scaleDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.motion.zoom",
    )!;
    const blurDefinition = getAnimationGraphNodeDefinition(
      "effect:clipper.adjustment.blur",
    )!;
    const scaleSchema = getGraphNodeParameterEditorSchema({
      id: "scale",
      label: "Scale",
      kind: "effect",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      details: {},
      typedNode: {
        id: "scale",
        kind: "effect:clipper.motion.zoom",
        position: { x: 1, y: 2 },
        config: scaleDefinition.createDefaultConfig({ graphId: "test" }),
      } as any,
    });
    const blurSchema = getGraphNodeParameterEditorSchema({
      id: "blur",
      label: "Blur",
      kind: "effect",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      details: {},
      typedNode: {
        id: "blur",
        kind: "effect:clipper.adjustment.blur",
        position: { x: 1, y: 2 },
        config: blurDefinition.createDefaultConfig({ graphId: "test" }),
      } as any,
    });

    expect(scaleSchema?.groups[0].fields).toMatchObject([
      { key: "scale", value: "1.8" },
    ]);
    expect(blurSchema?.groups[0].fields).toMatchObject([
      { key: "radius", value: "6" },
    ]);
  });

  it("shows compatible graph inputs beside strict parameter fields", () => {
    const addDefinition = getAnimationGraphNodeDefinition("value:math:add")!;
    const graph: StrictAnimationGraph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "noise:1": {
          id: "noise:1",
          kind: "value:noise",
          position: { x: 1, y: 2 },
          config: { seed: 1, min: 0, max: 1, frequency: 1 },
        },
        add: {
          id: "add",
          kind: "value:math:add",
          position: { x: 3, y: 4 },
          config: addDefinition.createDefaultConfig({ graphId: "test" }),
        },
      },
      edges: [
        {
          id: "noise:1:value->add:b",
          from: { nodeId: "noise:1", portId: "value" },
          to: { nodeId: "add", portId: "b" },
        },
      ],
    };
    const schema = getGraphNodeParameterEditorSchema(
      {
        id: "add",
        label: "Add",
        kind: "value:math:add",
        x: 1,
        y: 2,
        width: 8,
        height: 2,
        details: {},
        typedNode: graph.nodes.add,
      },
      undefined,
      [],
      graph,
    );

    expect(
      schema?.groups[0].fields
        .find((field) => field.key === "a")
        ?.bindingOptions?.map((option) => option.expression),
    ).toEqual(["input.noise1"]);
  });

  it("shows active input expression when strict parameter field is connected", () => {
    const addDefinition = getAnimationGraphNodeDefinition("value:math:add")!;
    const graph = bindStrictGraphInputParameter(
      {
        id: "graph:text",
        sourceObjectId: "text",
        nodes: {
          "noise:1": {
            id: "noise:1",
            kind: "value:noise",
            position: { x: 1, y: 2 },
            config: { seed: 1, min: 0, max: 1, frequency: 1 },
          },
          add: {
            id: "add",
            kind: "value:math:add",
            position: { x: 3, y: 4 },
            config: addDefinition.createDefaultConfig({ graphId: "test" }),
          },
        },
        edges: [],
      },
      "add",
      "a",
      "input.noise1",
    );
    const schema = getGraphNodeParameterEditorSchema(
      {
        id: "add",
        label: "Add",
        kind: "value:math:add",
        x: 1,
        y: 2,
        width: 8,
        height: 2,
        details: {},
        typedNode: graph.nodes.add,
      },
      undefined,
      undefined,
      graph,
    );

    expect(
      schema?.groups[0].fields.find((field) => field.key === "a")?.value,
    ).toBe("input.noise1");
  });

  it("shows typed procedural inputs on value noise nodes", () => {
    const noiseDefinition = getAnimationGraphNodeDefinition("value:noise")!;
    const noiseNode = {
      id: "noise:1",
      kind: "value:noise",
      position: { x: 0, y: 0 },
      config: {},
    };

    expect(
      noiseDefinition
        .getPorts(noiseNode)
        .map((port) => `${port.direction}:${port.id}`),
    ).toEqual([
      "input:input:number",
      "input:min",
      "input:max",
      "input:sample",
      "output:value",
    ]);
    expect(
      getVisibleStrictComposition2dPorts({
        id: "noise:1",
        label: "Noise",
        kind: "value:noise",
        x: 0,
        y: 0,
        width: 8,
        height: 2,
        typedNode: noiseNode,
      }).map((port) => `${port.direction}:${port.id}`),
    ).toEqual(["input:input:number", "output:value"]);
  });

  it("renders graph-owned graphic controls from shared primitive settings", () => {
    const textDefinition = getAnimationGraphNodeDefinition("virtual:text")!;
    const rectangleDefinition =
      getAnimationGraphNodeDefinition("geometry:rectangle")!;
    const circleDefinition =
      getAnimationGraphNodeDefinition("geometry:circle")!;

    const textSchema = getGraphNodeParameterEditorSchema({
      id: "text",
      label: "Text",
      kind: "virtual:text",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      details: {},
      typedNode: {
        id: "text",
        kind: "virtual:text",
        position: { x: 1, y: 2 },
        config: textDefinition.createDefaultConfig({ graphId: "test" }),
      } as any,
    });
    const rectangleSchema = getGraphNodeParameterEditorSchema({
      id: "rectangle",
      label: "Rectangle",
      kind: "geometry:rectangle",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      details: {},
      typedNode: {
        id: "rectangle",
        kind: "geometry:rectangle",
        position: { x: 1, y: 2 },
        config: rectangleDefinition.createDefaultConfig({ graphId: "test" }),
      } as any,
    });
    const circleSchema = getGraphNodeParameterEditorSchema({
      id: "circle",
      label: "Circle",
      kind: "geometry:circle",
      x: 1,
      y: 2,
      width: 8,
      height: 2,
      details: {},
      typedNode: {
        id: "circle",
        kind: "geometry:circle",
        position: { x: 1, y: 2 },
        config: circleDefinition.createDefaultConfig({ graphId: "test" }),
      } as any,
    });

    expect(textSchema?.groups.flatMap((group) => group.fields)).toMatchObject([
      { key: "content", value: "Text" },
      { key: "x", value: "0" },
      { key: "y", value: "0" },
      { key: "width", value: "320" },
      { key: "height", value: "96" },
      { key: "color", value: "#ffffff" },
      { key: "fontSize", value: "48" },
      expect.objectContaining({ key: "fontFamily" }),
      { key: "fontWeight", value: "700" },
      { key: "lineHeight", value: "1.1" },
      { key: "letterSpacing", value: "0" },
    ]);
    expect(
      rectangleSchema?.groups.flatMap((group) => group.fields),
    ).toMatchObject([
      { key: "x", value: "0" },
      { key: "y", value: "0" },
      { key: "width", value: "100" },
      { key: "height", value: "100" },
      { key: "color", value: "#ffffff" },
      { key: "opacity", value: "1" },
      { key: "cornerRadius", value: "0" },
    ]);
    expect(circleSchema?.groups.flatMap((group) => group.fields)).toMatchObject(
      [
        { key: "x", value: "0" },
        { key: "y", value: "0" },
        { key: "radius", value: "50" },
        { key: "color", value: "#ffffff" },
        { key: "opacity", value: "1" },
      ],
    );
    expect(
      circleSchema?.groups.flatMap((group) =>
        group.fields.map((field) => field.key),
      ),
    ).not.toContain("width");
  });

  it("does not expose Out input ordering in the graph inspector", () => {
    const schema = getGraphNodeParameterEditorSchema(
      {
        id: "out",
        label: "Out",
        kind: "out",
        x: 1,
        y: 2,
        width: 4,
        height: 2,
        typedNode: {
          id: "out",
          kind: "out",
          position: { x: 1, y: 2 },
          config: { renderOrder: ["text->out", "rect->out"] },
        } as any,
      },
      undefined,
      [
        {
          id: "rect->out",
          from: { nodeId: "rect", portId: "out" },
          to: { nodeId: "out", portId: "in" },
        },
        {
          id: "text->out",
          from: { nodeId: "text", portId: "out" },
          to: { nodeId: "out", portId: "in" },
        },
      ] as any,
    );

    expect(schema).toBeNull();
  });

  it("ignores strict node parameter updates outside definition controls", () => {
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        opacity: {
          id: "opacity",
          kind: "effect:clipper.adjustment.opacity",
          position: { x: 1, y: 2 },
          config: {
            effectId: "clipper.adjustment.opacity",
            params: { from: 0, to: 1 },
          },
        },
      },
      edges: [],
    } satisfies StrictAnimationGraph;

    const next = updateStrictComposition2dNodeParameter(
      graph,
      "opacity",
      "notDeclared",
      "0.5",
    );

    expect(next).toBe(graph);
    expect(
      (next.nodes.opacity as any).config.params.notDeclared,
    ).toBeUndefined();
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

describe("getStrictComposition2dCanvasDiagnostics", () => {
  it("maps strict compile diagnostics to node badges and edge warnings", () => {
    const result = getStrictComposition2dCanvasDiagnostics({
      diagnostics: [
        {
          severity: "error",
          message: "Missing source",
          nodeId: "source:text",
        },
        {
          severity: "warning",
          message: "Port mismatch",
          edgeId: "source:text:out->composition2d:out:in",
        },
      ],
    });

    expect(result.status).toBe("error");
    expect(result.nodes.get("source:text")).toMatchObject({
      count: 1,
      errorCount: 1,
      warningCount: 0,
      messages: ["Missing source"],
    });
    expect(
      result.edges.get("source:text:out->composition2d:out:in")?.diagnostic,
    ).toMatchObject({ message: "Port mismatch" });
  });

  it("maps compiler trace edge routes to stream debug summaries", () => {
    const result = getStrictComposition2dCanvasDiagnostics({
      diagnostics: [],
      trace: {
        events: [
          {
            type: "edge",
            edgeId: "split:out->blur:in",
            from: { nodeId: "split", portId: "out" },
            to: { nodeId: "blur", portId: "in" },
            streams: [
              {
                streamId: "s1",
                kind: "animation",
                structureKind: "richText",
                tokenCount: 3,
                effectCount: 2,
                controller: {
                  start: 0,
                  delay: 0.2,
                  duration: 1.5,
                  ease: "easeInOut",
                },
              },
            ],
          },
        ],
      },
    });

    expect(result.status).toBe("ok");
    expect(result.edges.get("split:out->blur:in")).toMatchObject({
      streams: ["animation richText 3t 2fx 0/0.2/1.5"],
      label: "animation richText 3t 2fx 0/0.2/1.5",
    });
  });
});
