import { describe, expect, it } from "vitest";
import { conditionNodeDefinition } from "./condition/definition";
import { outNodeDefinition } from "./out/definition";
import { sourceNodeDefinition } from "./source/definition";
import { splitNodeDefinition } from "./split/definition";
import { timeNodeDefinition } from "./time/definition";
import { valueNodeDefinitions } from "./value/definition";
import { getAnimationGraphNodeDefinitions } from "../registry";
import type {
  AnimationGraph,
  AnimationGraphNode,
  AnimationStream,
  CompileContext,
  GraphStream,
} from "../types";

describe("built-in animation graph node execution", () => {
  it("Source emits one root stream from source object type", () => {
    const result = sourceNodeDefinition.execute(
      { node: node("source", "source", {}), inputs: new Map() },
      context({
        sourceObject: { id: "object-1", type: "text", content: "hello" },
      }),
    );

    expect(result.outputs.get("out")?.[0]).toMatchObject({
      structure: { kind: "text", objectId: "object-1" },
      controller: { delay: 0, duration: 1, ease: "linear" },
      effects: [],
    });
  });

  it("Time merges controller fields for whole-object and token streams", () => {
    const whole = stream("whole", { kind: "text", objectId: "object-1" });
    const tokens = stream("tokens", {
      kind: "richText",
      objectId: "object-1",
      domain: "textToken",
      tokenIndexes: [0, 1],
    });
    const result = timeNodeDefinition.execute(
      {
        node: node("time", "time", { delay: 2, duration: 3, ease: "easeOut" }),
        inputs: new Map([["in", [whole, tokens]]]),
      },
      context(),
    );

    expect(
      result.outputs
        .get("out")
        ?.filter(isAnimationStream)
        .map((output) => output.controller),
    ).toEqual([
      {
        start: 0,
        delay: 2,
        duration: 3,
        ease: "easeOut",
        schedule: "relative",
        timeDriven: true,
      },
      {
        start: 0,
        delay: 2,
        duration: 3,
        ease: "easeOut",
        schedule: "relative",
        timeDriven: true,
      },
    ]);
  });

  it("Time ignores value streams", () => {
    const whole = stream("whole", { kind: "text", objectId: "object-1" });
    const valueStream: GraphStream = {
      id: "value",
      valueType: "number",
      value: 10,
    };
    const result = timeNodeDefinition.execute(
      {
        node: node("time", "time", { delay: 4 }),
        inputs: new Map([["in", [whole, valueStream]]]),
      },
      context(),
    );

    expect(result.outputs.get("out")).toHaveLength(1);
    expect(result.outputs.get("out")?.[0]).toMatchObject({
      id: "time:out:0",
      controller: { delay: 4 },
    });
  });

  it("Split emits only tokenized rich text streams", () => {
    const result = splitNodeDefinition.execute(
      {
        node: node("split", "split", { mode: "word" }),
        inputs: new Map([
          ["in", [stream("text", { kind: "text", objectId: "object-1" })]],
        ]),
      },
      context({
        sourceObject: {
          id: "object-1",
          type: "text",
          content: "one two three",
        },
      }),
    );

    expect(result.outputs.get("tokens")).toHaveLength(1);
    const output = result.outputs.get("tokens")?.[0];
    expect(
      output && "structure" in output ? output.structure : undefined,
    ).toEqual({
      kind: "richText",
      objectId: "object-1",
      domain: "textToken",
      tokenIndexes: [0, 1, 2],
      selection: { domain: "textToken", mask: [true, true, true] },
    });
    expect(result.outputs.has("out")).toBe(false);
  });

  it("Condition partitions rich text with first-win send and connected output drops", () => {
    const input = stream("tokens", {
      kind: "richText",
      objectId: "object-1",
      domain: "textToken",
      tokenIndexes: [0, 1, 2],
    });
    const result = conditionNodeDefinition.execute(
      {
        node: node("condition", "condition", {
          outputs: [
            { id: "even", label: "Even" },
            { id: "two", label: "Two" },
            { id: "copy", label: "Copy" },
          ],
          rules: [
            {
              target: "value",
              operator: "equals",
              value: 0,
              action: "sendToOutput",
              output: "even",
            },
            {
              target: "value",
              operator: "equals",
              value: 0,
              action: "sendToOutput",
              output: "two",
            },
            {
              target: "value",
              operator: "equals",
              value: 1,
              action: "duplicateToOutput",
              output: "copy",
            },
            {
              target: "value",
              operator: "equals",
              value: 2,
              action: "sendToOutput",
              output: "two",
            },
          ],
        }),
        inputs: new Map([["in", [input]]]),
      },
      context({ connectedOutputPorts: new Set(["default", "even", "copy"]) }),
    );

    expect(tokens(result, "even")).toEqual([0]);
    expect(result.outputs.has("two")).toBe(false);
    expect(tokens(result, "copy")).toEqual([1]);
    expect(tokens(result, "default")).toEqual([1]);
  });

  it("Condition routes whole value streams to default only when connected", () => {
    const valueStream: GraphStream = {
      id: "value",
      valueType: "number",
      value: 10,
    };
    const result = conditionNodeDefinition.execute(
      {
        node: node("condition", "condition", { outputs: [], rules: [] }),
        inputs: new Map([["in", [valueStream]]]),
      },
      context({ connectedOutputPorts: new Set() }),
    );

    expect(result.outputs.size).toBe(0);
  });

  it("Value nodes emit typed value streams", () => {
    const numberDefinition = valueNodeDefinitions.find(
      (definition) => definition.kind === "value:number",
    );
    const result = numberDefinition?.execute(
      { node: node("value", "value:number", { value: 42 }), inputs: new Map() },
      context(),
    );

    expect(result?.outputs.get("value")?.[0]).toEqual({
      id: "value:value",
      valueType: "number",
      value: 42,
    });
  });

  it("Out aggregates connected animation streams", () => {
    const a = stream("a", { kind: "text", objectId: "object-1" });
    const b = stream("b", { kind: "shape", objectId: "object-2" });
    const result = outNodeDefinition.execute(
      { node: node("out", "out", {}), inputs: new Map([["in", [a, b]]]) },
      context(),
    );

    expect(result.outputs.get("out")).toEqual([a, b]);
  });

  it("Out ignores value streams", () => {
    const a = stream("a", { kind: "text", objectId: "object-1" });
    const valueStream: GraphStream = {
      id: "value",
      valueType: "number",
      value: 10,
    };
    const result = outNodeDefinition.execute(
      {
        node: node("out", "out", {}),
        inputs: new Map([["in", [a, valueStream]]]),
      },
      context(),
    );

    expect(result.outputs.get("out")).toEqual([a]);
  });

  it("package-backed effect nodes discover opacity, position, scale, rotate, and blur", () => {
    const labels = getAnimationGraphNodeDefinitions()
      .filter((definition) => definition.category === "effect")
      .map((definition) => definition.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "Opacity",
        "Position",
        "Scale",
        "Rotate",
        "Blur",
      ]),
    );
  });

  it("effect node appends instruction with target and controller snapshot", () => {
    const definition = getAnimationGraphNodeDefinitions().find(
      (candidate) =>
        candidate.category === "effect" && candidate.label === "Opacity",
    );
    const input = stream("timed", { kind: "text", objectId: "object-1" });
    input.controller = {
      ...input.controller,
      delay: 2,
      duration: 4,
      repeat: { count: 2, delay: 0.5, mode: "loop" },
      stagger: { amount: 0.2, order: "forward", scope: "item" },
    };
    const result = definition?.execute(
      {
        node: node(
          "opacity",
          definition.kind,
          definition.createDefaultConfig({ graphId: "graph-1" }),
        ),
        inputs: new Map([
          ["in", [input]],
          ["to", [{ id: "value", valueType: "number", value: 0.25 }]],
        ]),
      },
      context(),
    );
    input.controller.delay = 9;
    if (input.controller.repeat) input.controller.repeat.delay = 9;
    if (input.controller.stagger) input.controller.stagger.amount = 9;

    const output = result?.outputs.get("out")?.[0];
    expect(
      output && "effects" in output ? output.effects[0] : undefined,
    ).toMatchObject({
      effectId: "clipper.adjustment.opacity",
      params: { from: 1, to: 0.25 },
      target: { kind: "text", objectId: "object-1" },
      controller: {
        delay: 2,
        duration: 4,
        repeat: { delay: 0.5 },
        stagger: { amount: 0.2 },
      },
    });
  });
});

function node(id: string, kind: string, config: unknown): AnimationGraphNode {
  return { id, kind, position: { x: 0, y: 0 }, config };
}

function stream(
  id: string,
  structure: AnimationStream["structure"],
): AnimationStream {
  return {
    id,
    structure,
    controller: {
      start: 0,
      delay: 0,
      duration: 1,
      ease: "linear",
      schedule: "relative",
    },
    effects: [],
  };
}

function context(overrides: Partial<CompileContext> = {}): CompileContext {
  return { graph: graph(), ...overrides };
}

function graph(): AnimationGraph {
  return { id: "graph-1", sourceObjectId: "object-1", nodes: {}, edges: [] };
}

function tokens(
  result: { outputs: ReadonlyMap<string, readonly GraphStream[]> },
  portId: string,
) {
  const output = result.outputs.get(portId)?.[0];
  return output && "structure" in output && output.structure.kind === "richText"
    ? output.structure.tokenIndexes
    : [];
}

function isAnimationStream(stream: GraphStream): stream is AnimationStream {
  return "structure" in stream;
}
