import { describe, expect, it } from "vitest";
import { compileAnimationGraph } from "./compiler";
import { registerEffectAnimationGraphNodeDefinition } from "./registry";
import { registerEffectPackage } from "../effects/registry";
import type { AdjustmentEffectPackage } from "../effects/types";
import type { AnimationGraph } from "./types";
import type { FrameObject } from "../types";

const textObject: FrameObject = {
  id: "text",
  name: "Text",
  type: "text",
  selector: ".text",
  content: "a b a",
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  style: {},
};

function graph(
  nodes: AnimationGraph["nodes"],
  edges: AnimationGraph["edges"],
): AnimationGraph {
  return { id: "graph", sourceObjectId: "text", nodes, edges };
}

function node(id: string, kind: string, config: unknown = {}) {
  return { id, kind, position: { x: 0, y: 0 }, config };
}

function edge(from: string, fromPort: string, to: string, toPort = "in") {
  return {
    id: `${from}:${fromPort}->${to}:${toPort}`,
    from: { nodeId: from, portId: fromPort },
    to: { nodeId: to, portId: toPort },
  };
}

describe("compileAnimationGraph", () => {
  it("animates default/rest unmatched tokens", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [{ id: "matched", label: "Matched" }],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "matched",
              },
            ],
          }),
          position: node("position", "effect:clipper.motion.pan", {
            params: { x: 100, y: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "default", "position"),
          edge("position", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(
      result.diagnostics.filter((item) => item.severity === "error"),
    ).toEqual([]);
    expect(result.animations).toHaveLength(1);
    expect(result.animations[0].options.split?.tokenIndexes).toEqual([1]);
  });

  it("applies downstream time to matched condition branch", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [{ id: "matched", label: "Matched" }],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "matched",
              },
            ],
          }),
          time: node("time", "time", { delay: 0.4, duration: 2 }),
          opacity: node("opacity", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "matched", "time"),
          edge("time", "out", "opacity"),
          edge("opacity", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations[0].options.delay).toBe(0.4);
    expect(result.animations[0].options.duration).toBe(2);
    expect(result.animations[0].options.split?.tokenIndexes).toEqual([0, 2]);
  });

  it("keeps split sibling edges additive", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          x: node("x", "effect:clipper.motion.pan", {
            params: { x: 20, y: 0 },
          }),
          y: node("y", "effect:clipper.motion.pan", {
            params: { x: 0, y: 30 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "x"),
          edge("split", "tokens", "y"),
          edge("x", "out", "out"),
          edge("y", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations).toHaveLength(2);
    expect(
      result.animations.map(
        (animation) => animation.options.split?.tokenIndexes,
      ),
    ).toEqual([
      [0, 1, 2],
      [0, 1, 2],
    ]);
  });

  it("drops matched condition output when output port is disconnected", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [{ id: "matched", label: "Matched" }],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "matched",
              },
            ],
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "default", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.streams[0]?.structure).toMatchObject({
      kind: "richText",
      tokenIndexes: [1],
    });
  });

  it("keeps duplicate output additive while unmatched tokens continue through default/rest", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [{ id: "dup", label: "Dup" }],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "duplicateToOutput",
                output: "dup",
              },
            ],
          }),
          dup: node("dup", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0.5 },
          }),
          rest: node("rest", "effect:clipper.motion.pan", {
            params: { x: 5, y: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "dup", "dup"),
          edge("condition", "default", "rest"),
          edge("dup", "out", "out"),
          edge("rest", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(
      result.animations.map(
        (animation) => animation.options.split?.tokenIndexes,
      ),
    ).toEqual([
      [0, 2],
      [0, 1, 2],
    ]);
  });

  it("supports duplicate outputs and first-win send", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [
              { id: "dup", label: "Dup" },
              { id: "sent", label: "Sent" },
              { id: "late", label: "Late" },
            ],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "duplicateToOutput",
                output: "dup",
              },
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "sent",
              },
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "late",
              },
            ],
          }),
          dup: node("dup", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0.5 },
          }),
          sent: node("sent", "effect:clipper.motion.pan", {
            params: { x: 10, y: 0 },
          }),
          late: node("late", "effect:clipper.motion.pan", {
            params: { x: 99, y: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "dup", "dup"),
          edge("condition", "sent", "sent"),
          edge("condition", "late", "late"),
          edge("dup", "out", "out"),
          edge("sent", "out", "out"),
          edge("late", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations).toHaveLength(2);
    expect(
      result.animations.map(
        (animation) => animation.options.split?.tokenIndexes,
      ),
    ).toEqual([
      [0, 2],
      [0, 2],
    ]);
    expect(
      result.animations.some((animation) => animation.keyframes.x?.[1] === 99),
    ).toBe(false);
  });

  it("chains effects and snapshots controller", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          time: node("time", "time", { delay: 0.2, duration: 3 }),
          position: node("position", "effect:clipper.motion.pan", {
            params: { x: 10, y: 5 },
          }),
          opacity: node("opacity", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "time"),
          edge("time", "out", "position"),
          edge("position", "out", "opacity"),
          edge("opacity", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.streams[0].effects).toHaveLength(2);
    result.streams[0].controller.delay = 9;
    expect(result.streams[0].effects[0].controller.delay).toBe(0.2);
    expect(result.animations).toHaveLength(2);
  });

  it("uses effect target snapshot for LayerAnimation split options", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          position: node("position", "effect:clipper.motion.pan", {
            params: { x: 10, y: 5 },
          }),
          opacity: node("opacity", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "position"),
          edge("position", "out", "opacity"),
          edge("opacity", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    result.streams[0].structure = { kind: "object", objectId: "text" };
    expect(result.animations[0].options.split?.tokenIndexes).toEqual([0, 1, 2]);
    expect(result.animations[1].options.split?.tokenIndexes).toEqual([0, 1, 2]);
  });

  it("uses package graph runtime adapters for LayerAnimation compatibility", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          opacity: node("opacity", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 0.25 },
          }),
          position: node("position", "effect:clipper.motion.pan", {
            params: { x: 10, y: 5 },
          }),
          scale: node("scale", "effect:clipper.motion.zoom", {
            params: { scale: 1.5 },
          }),
          rotate: node("rotate", "effect:clipper.motion.rotate", {
            params: { rotation: 30 },
          }),
          blur: node("blur", "effect:clipper.adjustment.blur", {
            params: { radius: 8 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "opacity"),
          edge("opacity", "out", "position"),
          edge("position", "out", "scale"),
          edge("scale", "out", "rotate"),
          edge("rotate", "out", "blur"),
          edge("blur", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.animations.map((animation) => animation.keyframes)).toEqual([
      { opacity: [1, 0.25] },
      { x: [0, 10], y: [0, 5] },
      { scale: [1, 1.5] },
      { rotate: [0, 30] },
      { blur: [0, 8] },
    ]);
  });

  it("warns and skips graph effects without runtime adapter", () => {
    const unsupportedEffect: AdjustmentEffectPackage = {
      id: "test.adjustment.noRuntime" as AdjustmentEffectPackage["id"],
      category: "adjustment",
      name: "No Runtime",
      label: "No Runtime",
      group: "Test",
      groups: ["Test"],
      defaultDuration: 1,
      defaultParams: {},
      graph: {
        acceptedStructureKinds: ["text", "richText", "shape", "object"],
      },
      createDefaultLayer: ({ id, layerId, start, duration }) => ({
        id,
        layerId,
        name: "No Runtime",
        start,
        duration,
        effect: { effectId: "test.adjustment.noRuntime" as never, params: {} },
      }),
    };
    registerEffectPackage(unsupportedEffect);
    registerEffectAnimationGraphNodeDefinition(unsupportedEffect);

    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          effect: node("effect", "effect:test.adjustment.noRuntime"),
          out: node("out", "out"),
        },
        [edge("source", "out", "effect"), edge("effect", "out", "out")],
      ),
      { sourceObject: textObject },
    );

    expect(result.streams[0]?.effects).toHaveLength(1);
    expect(result.animations).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      severity: "warning",
      message:
        'Effect package "test.adjustment.noRuntime" does not provide a graph runtime adapter for LayerAnimation compatibility.',
    });
  });

  it("omits execution trace unless requested", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          out: node("out", "out"),
        },
        [edge("source", "out", "out")],
      ),
      { sourceObject: textObject },
    );

    expect(result.trace).toBeUndefined();
    expect(result.streams).toHaveLength(1);
    expect(result.animations).toHaveLength(0);
  });

  it("records opt-in execution trace without changing compile semantics", () => {
    const inputGraph = graph(
      {
        source: node("source", "source", { objectId: "text" }),
        split: node("split", "split", { mode: "word" }),
        time: node("time", "time", { delay: 0.25, duration: 1.5 }),
        position: node("position", "effect:clipper.motion.pan", {
          params: { x: 10, y: 0 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "split"),
        edge("split", "tokens", "time"),
        edge("time", "out", "position"),
        edge("position", "out", "out"),
      ],
    );

    const traced = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
      trace: true,
    });
    const untraced = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
    });

    expect(traced.streams).toEqual(untraced.streams);
    expect(traced.animations).toEqual(untraced.animations);
    expect(traced.diagnostics).toEqual(untraced.diagnostics);
    expect(traced.trace?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "node",
          nodeId: "split",
          outputs: expect.objectContaining({
            tokens: [
              expect.objectContaining({
                kind: "animation",
                structureKind: "richText",
                tokenCount: 3,
                effectCount: 0,
              }),
            ],
          }),
        }),
        expect.objectContaining({
          type: "edge",
          edgeId: "time:out->position:in",
          streams: [
            expect.objectContaining({
              controller: expect.objectContaining({
                delay: 0.25,
                duration: 1.5,
              }),
            }),
          ],
        }),
        expect.objectContaining({
          type: "node",
          nodeId: "out",
          inputs: expect.objectContaining({
            in: [
              expect.objectContaining({
                structureKind: "richText",
                tokenCount: 3,
                effectCount: 1,
              }),
            ],
          }),
        }),
      ]),
    );
  });

  it("emits diagnostics for duplicate source", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          source2: node("source2", "source"),
          out: node("out", "out"),
        },
        [edge("source", "out", "out")],
      ),
    );

    expect(
      result.diagnostics.some((item) =>
        item.message.includes("exactly one Source"),
      ),
    ).toBe(true);
  });

  it("emits diagnostics for incompatible ports", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          value: node("value", "value:number", { value: 1 }),
          out: node("out", "out"),
        },
        [edge("value", "value", "out")],
      ),
    );

    expect(
      result.diagnostics.some((item) =>
        item.message.includes("Cannot connect"),
      ),
    ).toBe(true);
  });

  it("emits diagnostics for cycles", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          time: node("time", "time"),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "time"),
          edge("time", "out", "time"),
          edge("time", "out", "out"),
        ],
      ),
    );

    expect(
      result.diagnostics.some((item) => item.message.includes("cycles")),
    ).toBe(true);
  });

  it("emits diagnostics for unreachable Out", () => {
    const result = compileAnimationGraph(
      graph({ source: node("source", "source"), out: node("out", "out") }, []),
    );

    expect(
      result.diagnostics.some((item) =>
        item.message.includes("Source must reach Out"),
      ),
    ).toBe(true);
  });

  it("emits diagnostics for unknown edge endpoints", () => {
    const result = compileAnimationGraph(
      graph({ source: node("source", "source"), out: node("out", "out") }, [
        edge("source", "out", "missing"),
      ]),
    );

    expect(
      result.diagnostics.some((item) =>
        item.message.includes("Unknown to node"),
      ),
    ).toBe(true);
  });

  it("emits diagnostics for unknown graph node kind", () => {
    const result = compileAnimationGraph(
      graph({ source: node("source", "source"), bad: node("bad", "missing") }, [
        edge("source", "out", "bad"),
      ]),
    );

    expect(
      result.diagnostics.some((item) =>
        item.message.includes("Unknown graph node kind"),
      ),
    ).toBe(true);
    expect(
      result.diagnostics.some((item) => item.message.includes("Out")),
    ).toBe(true);
  });
});
