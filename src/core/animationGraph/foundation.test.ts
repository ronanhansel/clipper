import { describe, expect, it } from "vitest";
import type {
  AnimationGraph,
  AnimationGraphNode,
  GraphPortDefinition,
} from "./types";
import {
  areGraphPortsCompatible,
  validateAnimationGraphEdgePorts,
} from "./portCompatibility";
import {
  createEffectAnimationGraphNodeDefinition,
  getAnimationGraphNodeDefinition,
} from "./registry";
import type { EffectPackage } from "../effects/types";
import { validateAnimationGraph } from "./validation";

describe("strict animation graph foundation", () => {
  it("validates port compatibility independently from React UI", () => {
    expect(areGraphPortsCompatible(animationOut(), animationIn())).toBe(true);
    expect(areGraphPortsCompatible(valueOut("number"), valueIn("number"))).toBe(
      true,
    );
    expect(areGraphPortsCompatible(valueOut("string"), valueIn("number"))).toBe(
      false,
    );
    expect(areGraphPortsCompatible(valueOut("string"), anyValueIn())).toBe(
      true,
    );
    expect(
      validateAnimationGraphEdgePorts({
        edge: {
          id: "edge-1",
          from: { nodeId: "a", portId: "value" },
          to: { nodeId: "b", portId: "value" },
        },
        fromPort: valueOut("string"),
        toPort: valueIn("number"),
      }),
    ).toHaveLength(1);
  });

  it("creates dynamic condition output ports from condition config", () => {
    const definition = getAnimationGraphNodeDefinition("condition");
    const node: AnimationGraphNode = {
      id: "condition-1",
      kind: "condition",
      position: { x: 0, y: 0 },
      config: {
        outputs: [
          { id: "match-a", label: "Match A" },
          { id: "match-b", label: "Match B" },
        ],
        rules: [],
      },
    };

    expect(definition?.getPorts(node).map((port) => port.id)).toEqual([
      "in",
      "default",
      "match-a",
      "match-b",
    ]);
  });

  it("registers built-in source, time, split, condition, value, effect, and out definitions", () => {
    const effectDefinition =
      createEffectAnimationGraphNodeDefinition(fakeEffectPackage);

    expect(getAnimationGraphNodeDefinition("source")?.category).toBe("control");
    expect(getAnimationGraphNodeDefinition("time")?.category).toBe("control");
    expect(getAnimationGraphNodeDefinition("split")?.category).toBe("control");
    expect(getAnimationGraphNodeDefinition("condition")?.category).toBe(
      "control",
    );
    expect(getAnimationGraphNodeDefinition("value:number")?.category).toBe(
      "value",
    );
    expect(effectDefinition.kind).toBe("effect:clipper.test.effect");
    expect(effectDefinition.category).toBe("effect");
    expect(
      getAnimationGraphNodeDefinition("out")?.getPorts(outNode)[0],
    ).toMatchObject({ id: "in", cardinality: "multi" });
  });

  it("validates whole graph structure, ports, compatibility, and cardinality", () => {
    expect(validateAnimationGraph(validGraph())).toEqual([]);

    const graph = validGraph();
    graph.nodes.extraSource = node("extraSource", "source");
    graph.nodes.unknown = node("unknown", "missing-kind");
    graph.edges.push(
      {
        id: "missing-node",
        from: { nodeId: "missing", portId: "out" },
        to: { nodeId: "time", portId: "in" },
      },
      {
        id: "missing-port",
        from: { nodeId: "source", portId: "missing" },
        to: { nodeId: "time", portId: "in" },
      },
      {
        id: "bad-type",
        from: { nodeId: "value", portId: "value" },
        to: { nodeId: "time", portId: "in" },
      },
      {
        id: "duplicate-input",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "time", portId: "in" },
      },
    );

    expect(
      validateAnimationGraph(graph).map((diagnostic) => diagnostic.message),
    ).toEqual(
      expect.arrayContaining([
        "Graph must contain exactly one Source node.",
        'Unknown graph node kind "missing-kind".',
        'Unknown from node "missing".',
        "Missing output port.",
        "Cannot connect Value.number to Animation.",
        'Input port "in" accepts one connection.',
      ]),
    );
  });

  it("rejects duplicate edge identities and exact endpoint pairs", () => {
    const graph = validGraph();
    graph.edges.push(
      {
        id: "time-out",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "out", portId: "in" },
      },
      {
        id: "source-time-copy",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "time", portId: "in" },
      },
    );

    expect(
      validateAnimationGraph(graph).map((diagnostic) => diagnostic.message),
    ).toEqual(
      expect.arrayContaining([
        'Edge id "time-out" must be unique.',
        "Graph already contains this exact connection.",
      ]),
    );
  });

  it("declares effect parameter conflict metadata as port cardinality", () => {
    const definition = createEffectAnimationGraphNodeDefinition({
      ...fakeEffectPackage,
      graph: {
        acceptedStructureKinds: ["text"],
        paramControls: [
          { key: "single", label: "Single", type: "number", defaultValue: 0 },
          { key: "multi", label: "Multi", type: "number", defaultValue: 0 },
          { key: "strict", label: "Strict", type: "number", defaultValue: 0 },
        ],
        paramPorts: {
          multi: { conflict: "multi" },
          strict: { conflict: "error" },
        },
      },
    });

    const ports = definition.getPorts(node("effect", definition.kind));
    expect(ports.find((port) => port.id === "in")).toMatchObject({
      cardinality: "multi",
    });
    expect(ports.find((port) => port.id === "single")).toMatchObject({
      cardinality: "single",
    });
    expect(ports.find((port) => port.id === "multi")).toMatchObject({
      cardinality: "multi",
    });
    expect(ports.find((port) => port.id === "strict")).toMatchObject({
      cardinality: "single",
    });
  });
});

function validGraph(): AnimationGraph {
  return {
    id: "graph-1",
    sourceObjectId: "object-1",
    nodes: {
      source: node("source", "source"),
      time: node("time", "time"),
      out: node("out", "out"),
      value: node("value", "value:number"),
    },
    edges: [
      {
        id: "source-time",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "time", portId: "in" },
      },
      {
        id: "time-out",
        from: { nodeId: "time", portId: "out" },
        to: { nodeId: "out", portId: "in" },
      },
    ],
  };
}

function node(id: string, kind: string): AnimationGraphNode {
  return { id, kind, position: { x: 0, y: 0 }, config: {} };
}

const outNode: AnimationGraphNode = {
  id: "out-1",
  kind: "out",
  position: { x: 0, y: 0 },
  config: {},
};

const fakeEffectPackage = {
  id: "clipper.test.effect",
  category: "adjustment",
  name: "testEffect",
  label: "Test Effect",
  group: "Test",
  defaultDuration: 1,
  defaultParams: {},
  createDefaultLayer: ({ id, layerId, start, duration }) => ({
    id,
    layerId,
    name: "Test Effect",
    start,
    duration,
    effect: { effectId: "clipper.test.effect", params: {} },
  }),
} satisfies EffectPackage;

function animationOut(): GraphPortDefinition {
  return {
    id: "out",
    label: "Out",
    direction: "output",
    cardinality: "single",
    type: { kind: "animation" },
  };
}

function animationIn(): GraphPortDefinition {
  return {
    id: "in",
    label: "In",
    direction: "input",
    cardinality: "single",
    type: { kind: "animation" },
  };
}

function valueOut(valueType: "string" | "number"): GraphPortDefinition {
  return {
    id: "value",
    label: "Value",
    direction: "output",
    cardinality: "single",
    type: { kind: "value", valueType },
  };
}

function valueIn(valueType: "string" | "number"): GraphPortDefinition {
  return {
    id: "value",
    label: "Value",
    direction: "input",
    cardinality: "single",
    type: { kind: "value", valueType },
  };
}

function anyValueIn(): GraphPortDefinition {
  return {
    id: "value",
    label: "Value",
    direction: "input",
    cardinality: "single",
    type: { kind: "anyValue" },
  };
}
