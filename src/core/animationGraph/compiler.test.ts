import { describe, expect, it } from "vitest";
import { compileAnimationGraph, planAnimationGraphProgram } from "./compiler";
import {
  attributeField,
  compareField,
  constantField,
  evaluateBooleanMask,
  evaluateField,
} from "./fields";
import {
  getAnimationGraphNodeDefinition,
  registerEffectAnimationGraphNodeDefinition,
} from "./registry";
import { validateAnimationGraph } from "./validation";
import { registerEffectPackage } from "../effects/registry";
import type { AdjustmentEffectPackage } from "../effects/types";
import type { AnimationGraph, GraphStream, ValueStream } from "./types";
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

const emptyCompileContext = { graph: graph({}, []) };

function valueStream(stream: GraphStream | undefined): ValueStream | undefined {
  return stream && "value" in stream ? stream : undefined;
}

describe("compileAnimationGraph", () => {
  it("evaluates fields on text token attribute contexts", () => {
    const result = evaluateField(attributeField("value"), {
      domain: "textToken",
      items: [
        { objectId: "text", index: 0, value: "a", type: "textToken" },
        { objectId: "text", index: 1, value: "b", type: "textToken" },
      ],
    });

    expect(result.values).toEqual(["a", "b"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("compiles deterministic procedural geometry output with debug trace", () => {
    const inputGraph = graph(
      {
        source: node("source", "source"),
        rect: node("rect", "geometry:rectangle", {
          width: 100,
          height: 40,
          color: "#ff0000",
        }),
        wave: node("wave", "geometry:deformPoints", {
          y: attributeField("index"),
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "rect"),
        edge("rect", "out", "wave"),
        edge("wave", "out", "out"),
      ],
    );

    const before = compileAnimationGraph(inputGraph, { trace: true });
    const after = compileAnimationGraph(
      JSON.parse(JSON.stringify(inputGraph)),
      {
        trace: true,
      },
    );

    expect(after.generatedGeometry).toEqual(before.generatedGeometry);
    expect(before.animations).toEqual([]);
    expect(before.streams[0].structure).toMatchObject({
      kind: "geometry",
      structureType: "shape",
      domain: "shape",
      pointCount: 4,
      segmentCount: 4,
      bounds: { x: -50, y: -20, width: 100, height: 43 },
    });
    expect(before.trace?.events.at(-1)).toMatchObject({
      type: "node",
      nodeKind: "out",
      inputs: {
        in: [
          {
            structureKind: "geometry",
            generatedStructureType: "shape",
            pointCount: 4,
            segmentCount: 4,
          },
        ],
      },
    });
  });

  it("compiles representative path trim and points-on-path instancing", () => {
    const inputGraph = graph(
      {
        source: node("source", "source"),
        star: node("star", "geometry:star", {
          points: 5,
          outerRadius: 50,
          innerRadius: 20,
        }),
        path: node("path", "geometry:line", { x1: 0, y1: 0, x2: 90, y2: 0 }),
        trim: node("trim", "geometry:trimPath", { end: 0.5 }),
        points: node("points", "geometry:pointsOnPath", { count: 4 }),
        inst: node("inst", "geometry:instanceOnPoints", { scale: 0.5 }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "star"),
        edge("source", "out", "path"),
        edge("star", "out", "inst", "shape"),
        edge("path", "out", "trim"),
        edge("trim", "out", "points"),
        edge("points", "out", "inst", "points"),
        edge("inst", "out", "out"),
      ],
    );

    const result = compileAnimationGraph(inputGraph);

    expect(result.diagnostics).toEqual([]);
    expect(result.generatedGeometry[0]).toMatchObject({
      type: "shapeGroup",
      instances: [
        { position: { x: 0, y: 0 }, scale: 0.5 },
        { scale: 0.5 },
        { scale: 0.5 },
        { scale: 0.5 },
      ],
    });
  });

  it("compiles representative scatter/randomize and title-card geometry layout", () => {
    const inputGraph = graph(
      {
        source: node("source", "source"),
        bg: node("bg", "geometry:rectangle", {
          width: 420,
          height: 96,
          color: "#111827",
        }),
        line: node("line", "geometry:line", {
          x1: -180,
          y1: 0,
          x2: 180,
          y2: 0,
        }),
        points: node("points", "geometry:pointsOnPath", { count: 6 }),
        dot: node("dot", "geometry:circle", { radius: 8, color: "#f59e0b" }),
        scatter: node("scatter", "geometry:randomize", {
          seed: "lower-third",
          amount: 12,
        }),
        inst: node("inst", "geometry:instanceOnPoints", { scale: 1 }),
        merge: node("merge", "geometry:merge"),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "bg"),
        edge("source", "out", "line"),
        edge("source", "out", "dot"),
        edge("line", "out", "points"),
        edge("points", "out", "scatter"),
        edge("dot", "out", "inst", "shape"),
        edge("scatter", "out", "inst", "points"),
        edge("bg", "out", "merge"),
        edge("inst", "out", "merge"),
        edge("merge", "out", "out"),
      ],
    );

    const result = compileAnimationGraph(inputGraph);

    expect(result.diagnostics).toEqual([]);
    expect(result.generatedGeometry[0]).toMatchObject({
      type: "shapeGroup",
      shapes: [expect.objectContaining({ type: "shape" })],
    });
    expect(result.streams[0].structure).toMatchObject({
      kind: "geometry",
      structureType: "shapeGroup",
      domain: "shape",
    });
  });

  it("compiles rootless geometry as graph-owned virtual object", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          rect: node("rect", "geometry:rectangle", { width: 100 }),
          out: node("out", "out"),
        },
        [edge("rect", "out", "out")],
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.generatedGeometry).toEqual([]);
    expect(result.generatedObjects).toEqual([
      expect.objectContaining({
        id: "graph:graph:rect",
        generatedByGraph: true,
        generatedGeometry: [expect.objectContaining({ type: "shape" })],
      }),
    ]);
  });

  it("compiles graph-owned text node into virtual render object", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          text: node("text", "virtual:text", {
            content: "Hello",
            x: 24,
            y: 32,
            width: 240,
            height: 80,
          }),
          out: node("out", "out"),
        },
        [edge("text", "out", "out")],
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.generatedObjects).toEqual([
      expect.objectContaining({
        id: "graph:graph:text",
        type: "text",
        content: "Hello",
        bounds: { x: 24, y: 32, width: 240, height: 80 },
      }),
    ]);
  });

  it("uses Out renderOrder config for generated object z-order", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          back: node("back", "geometry:rectangle", { width: 100 }),
          front: node("front", "virtual:text", { content: "Top" }),
          out: node("out", "out", { renderOrder: ["front-edge", "back-edge"] }),
        },
        [
          {
            ...edge("back", "out", "out"),
            id: "back-edge",
          },
          {
            ...edge("front", "out", "out"),
            id: "front-edge",
          },
        ],
      ),
    );

    expect(result.generatedObjects.map((object) => object.id)).toEqual([
      "graph:graph:front",
      "graph:graph:back",
    ]);
  });

  it("evaluates geometry fields with compile time and frame context", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source"),
          rect: node("rect", "geometry:rectangle", { width: 10, height: 10 }),
          move: node("move", "geometry:translate", {
            x: attributeField("time"),
            y: attributeField("frame"),
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "rect"),
          edge("rect", "out", "move"),
          edge("move", "out", "out"),
        ],
      ),
      { time: 2, frame: 48 },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.streams[0].structure).toMatchObject({
      kind: "geometry",
      bounds: {
        x: -3,
        y: 43,
        width: 10,
        height: 10,
      },
    });
  });

  it("evaluates condition fields as boolean masks over active domain", () => {
    const result = evaluateBooleanMask(
      compareField(attributeField("value"), "equals", constantField("a")),
      {
        domain: "textToken",
        items: [
          { objectId: "text", index: 0, value: "a", type: "textToken" },
          { objectId: "text", index: 1, value: "b", type: "textToken" },
          { objectId: "text", index: 2, value: "a", type: "textToken" },
        ],
      },
    );

    expect(result.mask).toEqual([true, false, true]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports unsupported field attributes for active domain", () => {
    const result = evaluateField(attributeField("bounds"), {
      domain: "textToken",
      items: [{ objectId: "text", index: 0, value: "a", type: "textToken" }],
    });

    expect(result.values).toEqual([undefined]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: 'Unsupported attribute "bounds" on "textToken" domain.',
      }),
    ]);
  });

  it("materializes token index parity from text token masks", () => {
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
          edge("condition", "matched", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.streams[0].structure).toMatchObject({
      kind: "richText",
      domain: "textToken",
      tokenIndexes: [0, 2],
      selection: { domain: "textToken", mask: [true, false, true] },
    });
  });

  it("preserves strict graph storage and semantics through JSON roundtrip", () => {
    const macroPorts = [
      {
        id: "macro:in",
        label: "Macro In",
        direction: "input" as const,
        cardinality: "single" as const,
        type: { kind: "animation" as const },
        role: "macro-input" as const,
      },
      {
        id: "macro:out",
        label: "Macro Out",
        direction: "output" as const,
        cardinality: "single" as const,
        type: { kind: "animation" as const },
        role: "macro-output" as const,
      },
    ];
    const original = graph(
      {
        "node/source:stable": node("node/source:stable", "source", {
          objectId: "text",
        }),
        "node/split:stable": node("node/split:stable", "split", {
          mode: "word",
        }),
        "node/condition:stable": node("node/condition:stable", "condition", {
          outputs: [{ id: "condition-output:match-a", label: "Match A" }],
          rules: [
            {
              target: "value",
              operator: "equals",
              value: "a",
              action: "sendToOutput",
              output: "condition-output:match-a",
            },
          ],
        }),
        "node/time:stable": node("node/time:stable", "time", {
          delay: 0.25,
          duration: 1.5,
        }),
        "node/effect:stable": node(
          "node/effect:stable",
          "effect:clipper.adjustment.opacity",
          { params: { from: 1, to: 0.2 } },
        ),
        "node/out:stable": node("node/out:stable", "out"),
      },
      [
        edge("node/source:stable", "out", "node/split:stable"),
        edge("node/split:stable", "tokens", "node/condition:stable"),
        edge(
          "node/condition:stable",
          "condition-output:match-a",
          "node/time:stable",
        ),
        edge("node/time:stable", "out", "node/effect:stable"),
        edge("node/effect:stable", "out", "node/out:stable"),
      ],
    );
    original.viewport = { scrollLeft: 123, scrollTop: -45, zoom: 0.75 };
    original.macros = {
      "macro/fade:stable": {
        id: "macro/fade:stable",
        label: "Stable Fade Macro",
        ports: macroPorts,
        defaults: { "macro:in": null },
        nodes: {
          "macro/input:stable": node("macro/input:stable", "macroInput", {
            portId: "macro:in",
          }),
          "macro/output:stable": node("macro/output:stable", "macroOutput", {
            portId: "macro:out",
          }),
        },
        edges: [edge("macro/input:stable", "in", "macro/output:stable")],
      },
    };

    const roundtripped = JSON.parse(JSON.stringify(original)) as AnimationGraph;

    expect(roundtripped).toEqual(original);
    expect(roundtripped.id).toBe(original.id);
    expect(roundtripped.sourceObjectId).toBe(original.sourceObjectId);
    expect(roundtripped.viewport).toEqual(original.viewport);
    expect(Object.keys(roundtripped.nodes)).toEqual(
      Object.keys(original.nodes),
    );
    expect(
      Object.values(roundtripped.nodes).map((item) => ({
        id: item.id,
        kind: item.kind,
        position: item.position,
        config: item.config,
      })),
    ).toEqual(
      Object.values(original.nodes).map((item) => ({
        id: item.id,
        kind: item.kind,
        position: item.position,
        config: item.config,
      })),
    );
    expect(roundtripped.nodes["node/condition:stable"].config).toMatchObject({
      outputs: [{ id: "condition-output:match-a", label: "Match A" }],
      rules: [{ output: "condition-output:match-a" }],
    });
    expect(roundtripped.macros?.["macro/fade:stable"].ports).toEqual(
      macroPorts,
    );
    expect(roundtripped.macros?.["macro/fade:stable"].defaults).toEqual({
      "macro:in": null,
    });
    expect(
      roundtripped.macros?.["macro/fade:stable"].edges.map((item) => ({
        id: item.id,
        from: item.from,
        to: item.to,
      })),
    ).toEqual(
      original.macros?.["macro/fade:stable"].edges.map((item) => ({
        id: item.id,
        from: item.from,
        to: item.to,
      })),
    );
    expect(roundtripped.edges.map((item) => item.from)).toEqual(
      original.edges.map((item) => item.from),
    );
    expect(roundtripped.edges.map((item) => item.to)).toEqual(
      original.edges.map((item) => item.to),
    );

    const before = compileAnimationGraph(original, {
      sourceObject: textObject,
    });
    const after = compileAnimationGraph(roundtripped, {
      sourceObject: textObject,
    });
    expect(after.program).toEqual(before.program);
    expect(after.diagnostics).toEqual(before.diagnostics);
    expect(after.streams).toEqual(before.streams);
    expect(after.animations).toEqual(before.animations);
    expect(after.animations[0]).toMatchObject({
      id: "graph:node/effect:stable:effect:0",
      keyframes: { opacity: [1, 0.2] },
      options: { delay: 0.25, duration: 1.5, split: { tokenIndexes: [0, 2] } },
    });
  });

  it("compiles strict macros through explicit typed external ports", () => {
    const macroPorts = [
      {
        id: "in",
        label: "In",
        direction: "input" as const,
        cardinality: "single" as const,
        type: { kind: "animation" as const },
        role: "macro-input" as const,
      },
      {
        id: "out",
        label: "Out",
        direction: "output" as const,
        cardinality: "single" as const,
        type: { kind: "animation" as const },
        role: "macro-output" as const,
      },
    ];
    const macroGraph: AnimationGraph = {
      ...graph(
        {
          source: node("source", "source", { objectId: "text" }),
          macro: node("macro", "macro", {
            macroId: "fadeMacro",
            ports: macroPorts,
          }),
          out: node("out", "out"),
        },
        [edge("source", "out", "macro"), edge("macro", "out", "out")],
      ),
      macros: {
        fadeMacro: {
          id: "fadeMacro",
          label: "Fade Macro",
          ports: macroPorts,
          nodes: {
            input: node("input", "macroInput", { portId: "in" }),
            time: node("time", "time", { delay: 0.4, duration: 1.2 }),
            fade: node("fade", "effect:clipper.adjustment.opacity", {
              params: { from: 1, to: 0 },
            }),
            output: node("output", "macroOutput", { portId: "out" }),
          },
          edges: [
            edge("input", "in", "time"),
            edge("time", "out", "fade"),
            edge("fade", "out", "output"),
          ],
        },
      },
    };
    const ungrouped = graph(
      {
        source: node("source", "source", { objectId: "text" }),
        time: node("time", "time", { delay: 0.4, duration: 1.2 }),
        fade: node("fade", "effect:clipper.adjustment.opacity", {
          params: { from: 1, to: 0 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "time"),
        edge("time", "out", "fade"),
        edge("fade", "out", "out"),
      ],
    );

    const macroResult = compileAnimationGraph(macroGraph, {
      sourceObject: textObject,
    });
    const ungroupedResult = compileAnimationGraph(ungrouped, {
      sourceObject: textObject,
    });

    expect(macroResult.diagnostics).toEqual([]);
    expect(macroResult.animations).toHaveLength(1);
    expect(macroResult.animations[0].keyframes).toEqual(
      ungroupedResult.animations[0].keyframes,
    );
    expect(macroResult.animations[0].options).toEqual(
      ungroupedResult.animations[0].options,
    );
  });

  it("preserves strict macro definitions through JSON roundtrip", () => {
    const macroPorts = [
      {
        id: "amount",
        label: "Amount",
        direction: "input" as const,
        cardinality: "single" as const,
        type: { kind: "value" as const, valueType: "number" as const },
        role: "macro-input" as const,
      },
      {
        id: "out",
        label: "Out",
        direction: "output" as const,
        cardinality: "single" as const,
        type: { kind: "value" as const, valueType: "number" as const },
        role: "macro-output" as const,
      },
    ];
    const original: AnimationGraph = {
      ...graph(
        { source: node("source", "source"), out: node("out", "out") },
        [],
      ),
      macros: {
        passthrough: {
          id: "passthrough",
          label: "Passthrough",
          ports: macroPorts,
          defaults: { amount: 5 },
          nodes: {
            input: node("input", "macroInput", { portId: "amount" }),
            output: node("output", "macroOutput", { portId: "out" }),
          },
          edges: [edge("input", "in", "output")],
        },
      },
    };

    expect(JSON.parse(JSON.stringify(original))).toEqual(original);
  });

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

  it("uses value and math nodes to drive static opacity, position, and blur parameters without time", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          x: node("x", "value:number", { value: 40 }),
          y: node("y", "value:math:add", { a: 10, b: 5 }),
          opacityTo: node("opacityTo", "value:number", { value: 0.35 }),
          blurRadius: node("blurRadius", "value:math:clamp", {
            value: 40,
            min: 0,
            max: 12,
          }),
          position: node("position", "effect:clipper.motion.pan", {
            params: { x: 0, y: 0 },
          }),
          opacity: node("opacity", "effect:clipper.adjustment.opacity", {
            params: { from: 1, to: 1 },
          }),
          blur: node("blur", "effect:clipper.adjustment.blur", {
            params: { radius: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "position"),
          edge("x", "value", "position", "x"),
          edge("y", "value", "position", "y"),
          edge("position", "out", "opacity"),
          edge("opacityTo", "value", "opacity", "to"),
          edge("opacity", "out", "blur"),
          edge("blurRadius", "value", "blur", "radius"),
          edge("blur", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(
      result.diagnostics.filter((item) => item.severity === "error"),
    ).toEqual([]);
    expect(result.animations.map((animation) => animation.keyframes)).toEqual([
      { x: [40, 40], y: [15, 15] },
      { opacity: [0.35, 0.35] },
      { blur: [12, 12] },
    ]);
  });

  it("uses explicit time nodes to animate graph effect parameters", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          time: node("time", "time", { duration: 2 }),
          blur: node("blur", "effect:clipper.adjustment.blur", {
            params: { radius: 20 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "time"),
          edge("time", "out", "blur"),
          edge("blur", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations[0]).toMatchObject({
      keyframes: { blur: [0, 20] },
      options: { duration: 2 },
    });
  });

  it("applies downstream time nodes to effects already on the stream", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          blur: node("blur", "effect:clipper.adjustment.blur", {
            params: { radius: 20 },
          }),
          time: node("time", "time", { duration: 2 }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "blur"),
          edge("blur", "out", "time"),
          edge("time", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations[0]).toMatchObject({
      keyframes: { blur: [0, 20] },
      options: { duration: 2 },
    });
  });

  it("uses condition comparison to drive effect parameters", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          split: node("split", "split", { mode: "word" }),
          condition: node("condition", "condition", {
            outputs: [{ id: "above", label: "Above" }],
            rules: [
              {
                target: "value",
                operator: "equals",
                value: "a",
                action: "sendToOutput",
                output: "above",
              },
            ],
          }),
          radius: node("radius", "value:number", { value: 8 }),
          blur: node("blur", "effect:clipper.adjustment.blur", {
            params: { radius: 0 },
          }),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "above", "blur"),
          edge("radius", "value", "blur", "radius"),
          edge("blur", "out", "out"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.animations[0]).toMatchObject({
      keyframes: { blur: [8, 8] },
      options: { split: { tokenIndexes: [0, 2] } },
    });
  });

  it("emits boolean compare values from value nodes", () => {
    const definition = getAnimationGraphNodeDefinition("value:compare:gt");
    const result = definition?.execute(
      {
        node: node("compare", "value:compare:gt", { left: 7, right: 5 }),
        inputs: new Map(),
      },
      emptyCompileContext,
    );

    expect(result?.outputs.get("value")?.[0]).toMatchObject({
      valueType: "boolean",
      value: true,
    });
  });

  it("combines and splits vector/color/array value nodes", () => {
    const combineVector = getAnimationGraphNodeDefinition(
      "value:combine:vector",
    )?.execute(
      {
        node: node("vector", "value:combine:vector", { x: 12, y: 34 }),
        inputs: new Map(),
      },
      emptyCompileContext,
    );
    const splitVector = getAnimationGraphNodeDefinition(
      "value:split:vector",
    )?.execute(
      {
        node: node("splitVector", "value:split:vector"),
        inputs: new Map([["value", combineVector?.outputs.get("value") ?? []]]),
      },
      emptyCompileContext,
    );
    const combineColor = getAnimationGraphNodeDefinition(
      "value:combine:color",
    )?.execute(
      {
        node: node("color", "value:combine:color", {
          r: 255,
          g: 128,
          b: 0,
          a: 0.5,
        }),
        inputs: new Map(),
      },
      emptyCompileContext,
    );
    const splitColor = getAnimationGraphNodeDefinition(
      "value:split:color",
    )?.execute(
      {
        node: node("splitColor", "value:split:color"),
        inputs: new Map([["value", combineColor?.outputs.get("value") ?? []]]),
      },
      emptyCompileContext,
    );
    const array = getAnimationGraphNodeDefinition(
      "value:combine:numberArray",
    )?.execute(
      {
        node: node("array", "value:combine:numberArray", { values: [4] }),
        inputs: new Map([
          [
            "items",
            [
              { id: "a", valueType: "number", value: 2 },
              { id: "b", valueType: "number", value: 3 },
            ],
          ],
        ]),
      },
      emptyCompileContext,
    );

    expect(splitVector?.outputs.get("x")?.[0]).toMatchObject({
      valueType: "number",
      value: 12,
    });
    expect(splitVector?.outputs.get("y")?.[0]).toMatchObject({
      valueType: "number",
      value: 34,
    });
    expect(splitColor?.outputs.get("r")?.[0]).toMatchObject({
      valueType: "number",
      value: 255,
    });
    expect(splitColor?.outputs.get("g")?.[0]).toMatchObject({
      valueType: "number",
      value: 128,
    });
    expect(splitColor?.outputs.get("b")?.[0]).toMatchObject({
      valueType: "number",
      value: 0,
    });
    expect(valueStream(splitColor?.outputs.get("a")?.[0])?.value).toBeCloseTo(
      0.501,
      2,
    );
    expect(array?.outputs.get("value")?.[0]).toMatchObject({
      valueType: "numberArray",
      value: [2, 3, 4],
    });
  });

  it("keeps random and noise value nodes deterministic by seed and node id", () => {
    const execute = (kind: string, id: string) =>
      valueStream(
        getAnimationGraphNodeDefinition(kind)
          ?.execute(
            {
              node: node(id, kind, { min: 10, max: 20, seed: "same" }),
              inputs: new Map(),
            },
            emptyCompileContext,
          )
          .outputs.get("value")?.[0],
      );

    expect(execute("value:random", "randomA")?.value).toEqual(
      execute("value:random", "randomB")?.value,
    );
    expect(execute("value:noise", "noiseA")?.value).toEqual(
      execute("value:noise", "noiseA")?.value,
    );
    expect(execute("value:noise", "noiseA")?.value).not.toEqual(
      execute("value:noise", "noiseB")?.value,
    );
  });

  it("reports invalid random seed config and evaluates with default seed", () => {
    const definition = getAnimationGraphNodeDefinition("value:noise")!;
    const graph: AnimationGraph = {
      id: "invalid-seed",
      sourceObjectId: "text",
      nodes: {
        source: node("source", "source", { objectId: "text" }),
        noise: node("noise", "value:noise", {
          min: 0,
          max: 1,
          sample: 0,
          seed: "3dsa",
        }),
        out: node("out", "out"),
      },
      edges: [],
    };
    const result = definition.execute(
      {
        node: node("noise", "value:noise", {
          min: 0,
          max: 1,
          sample: 0,
          seed: "3dsa",
        }),
        inputs: new Map(),
      },
      emptyCompileContext,
    );
    const fallbackResult = definition.execute(
      {
        node: node("noise", "value:noise", {
          min: 0,
          max: 1,
          sample: 0,
          seed: 0,
        }),
        inputs: new Map(),
      },
      emptyCompileContext,
    );

    expect(validateAnimationGraph(graph)).toContainEqual({
      severity: "error",
      message: 'Invalid number for "seed". Using default 0.',
      nodeId: "noise",
      portId: "seed",
    });
    expect(valueStream(result.outputs.get("value")?.[0])?.value).toBe(
      valueStream(fallbackResult.outputs.get("value")?.[0])?.value,
    );
  });

  it("lets procedural value nodes read explicit typed number inputs", () => {
    const numberInput = (id: string, value: number): ValueStream => ({
      id,
      valueType: "number",
      value,
    });
    const executeNoise = (sample: number) =>
      valueStream(
        getAnimationGraphNodeDefinition("value:noise")
          ?.execute(
            {
              node: node("noise", "value:noise", {
                min: 0,
                max: 1,
                sample: 0,
                seed: "same",
              }),
              inputs: new Map([
                ["min", [numberInput("min", 10)]],
                ["max", [numberInput("max", 20)]],
                ["sample", [numberInput("sample", sample)]],
              ]),
            },
            emptyCompileContext,
          )
          .outputs.get("value")?.[0],
      )?.value;

    expect(
      getAnimationGraphNodeDefinition("value:noise")
        ?.getPorts(node("noise", "value:noise"))
        .map((port) => port.id),
    ).toEqual(["input:number", "min", "max", "sample", "value"]);
    expect(executeNoise(12)).toEqual(executeNoise(12));
    expect(executeNoise(12)).not.toEqual(executeNoise(13));
    expect(Number(executeNoise(12))).toBeGreaterThanOrEqual(10);
    expect(Number(executeNoise(12))).toBeLessThanOrEqual(20);
  });

  it("emits deterministic time value nodes from compile context", () => {
    const seconds = valueStream(
      getAnimationGraphNodeDefinition("value:time:seconds")
        ?.execute(
          { node: node("seconds", "value:time:seconds"), inputs: new Map() },
          { graph: graph({}, []), time: 2.5, frame: 75 },
        )
        .outputs.get("value")?.[0],
    );
    const frame = valueStream(
      getAnimationGraphNodeDefinition("value:time:frame")
        ?.execute(
          { node: node("frame", "value:time:frame"), inputs: new Map() },
          { graph: graph({}, []), time: 2.5, frame: 75 },
        )
        .outputs.get("value")?.[0],
    );
    const oscillator = valueStream(
      getAnimationGraphNodeDefinition("value:time:oscillator")
        ?.execute(
          {
            node: node("osc", "value:time:oscillator", {
              frequency: 0.25,
              amplitude: 10,
              offset: 20,
              phase: 0,
            }),
            inputs: new Map(),
          },
          { graph: graph({}, []), time: 1, frame: 30 },
        )
        .outputs.get("value")?.[0],
    );

    expect(seconds?.value).toBe(2.5);
    expect(frame?.value).toBe(75);
    expect(oscillator?.value).toBeCloseTo(30);
  });

  it("recomputes time value effect parameters from compile time", () => {
    const inputGraph = graph(
      {
        source: node("source", "source", { objectId: "text" }),
        seconds: node("seconds", "value:time:seconds"),
        blur: node("blur", "effect:clipper.adjustment.blur", {
          params: { radius: 0 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "blur"),
        edge("seconds", "value", "blur", "radius"),
        edge("blur", "out", "out"),
      ],
    );

    const atOne = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
      time: 1,
      frame: 30,
    });
    const atTwo = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
      time: 2,
      frame: 60,
    });

    expect(atOne.animations[0].keyframes).toEqual({ blur: [1, 1] });
    expect(atTwo.animations[0].keyframes).toEqual({ blur: [2, 2] });
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
      { opacity: [0.25, 0.25] },
      { x: [10, 10], y: [5, 5] },
      { scale: [1.5, 1.5] },
      { rotate: [30, 30] },
      { blur: [8, 8] },
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
      outputId: "effect:effect:0",
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

  it("summarizes trace domain, masks, controller, effects, and values", () => {
    const inputGraph = graph(
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
        value: node("value", "value:number", { value: 0.5 }),
        opacity: node("opacity", "effect:clipper.adjustment.opacity"),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "split"),
        edge("split", "tokens", "condition"),
        edge("condition", "matched", "opacity"),
        edge("value", "value", "opacity", "to"),
        edge("opacity", "out", "out"),
      ],
    );

    const result = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
      trace: true,
    });

    expect(result.trace?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "node",
          nodeId: "condition",
          outputs: expect.objectContaining({
            matched: [
              expect.objectContaining({
                domain: "textToken",
                structureKind: "richText",
                tokenCount: 2,
                maskCount: 2,
                controllerSummary: expect.stringContaining("duration"),
              }),
            ],
          }),
        }),
        expect.objectContaining({
          type: "node",
          nodeId: "value",
          outputs: expect.objectContaining({
            value: [
              expect.objectContaining({ kind: "value", valueType: "number" }),
            ],
          }),
        }),
      ]),
    );
  });

  it("maps dead branches and dropped condition outputs to owned diagnostics", () => {
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
          dead: node("dead", "time"),
          opacity: node("opacity", "effect:clipper.adjustment.opacity"),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "split"),
          edge("split", "tokens", "condition"),
          edge("condition", "default", "opacity"),
          edge("opacity", "out", "out"),
          edge("source", "out", "dead"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          edgeId: "source:out->dead:in",
          nodeId: "source",
          portId: "out",
          outputId: "out",
        }),
        expect.objectContaining({
          severity: "warning",
          nodeId: "condition",
          portId: "matched",
          outputId: "matched",
          message: expect.stringContaining("dropped"),
        }),
      ]),
    );
  });

  it("plans only dependencies needed by Out", () => {
    const inputGraph = graph(
      {
        source: node("source", "source", { objectId: "text" }),
        time: node("time", "time", { delay: 0.2 }),
        opacity: node("opacity", "effect:clipper.adjustment.opacity", {
          params: { from: 1, to: 0.4 },
        }),
        deadTime: node("deadTime", "time", { delay: 9 }),
        deadOpacity: node("deadOpacity", "effect:clipper.adjustment.opacity", {
          params: { from: 1, to: 0 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "time"),
        edge("time", "out", "opacity"),
        edge("opacity", "out", "out"),
        edge("source", "out", "deadTime"),
        edge("deadTime", "out", "deadOpacity"),
      ],
    );

    const program = planAnimationGraphProgram(inputGraph);

    expect(program.nodeIds).toEqual(["source", "time", "opacity", "out"]);
    expect(program.edgeIds).toEqual([
      "source:out->time:in",
      "time:out->opacity:in",
      "opacity:out->out:in",
    ]);
    expect(program.operations.map((operation) => operation.kind)).toEqual([
      "nodeExecution",
      "streamTransformation",
      "effectAppend",
      "outputCollection",
    ]);
  });

  it("coalesces unreachable branch warnings by source output", () => {
    const result = compileAnimationGraph(
      graph(
        {
          source: node("source", "source", { objectId: "text" }),
          live: node("live", "time"),
          deadA: node("deadA", "time"),
          deadB: node("deadB", "time"),
          out: node("out", "out"),
        },
        [
          edge("source", "out", "live"),
          edge("live", "out", "out"),
          edge("source", "out", "deadA"),
          edge("source", "out", "deadB"),
        ],
      ),
      { sourceObject: textObject },
    );

    expect(
      result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.message ===
          'Branch from "source:out" does not reach Out and will not affect output.',
      ),
    ).toHaveLength(1);
  });

  it("records operation kinds for planned value, branch, stream, effect, and output work", () => {
    const inputGraph = graph(
      {
        source: node("source", "source", { objectId: "text" }),
        split: node("split", "split", { mode: "word" }),
        threshold: node("threshold", "value:number", { value: 1 }),
        condition: node("condition", "condition", { outputs: [], rules: [] }),
        opacity: node("opacity", "effect:clipper.adjustment.opacity", {
          params: { from: 1, to: 0.5 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "split"),
        edge("split", "tokens", "condition"),
        edge("condition", "default", "opacity"),
        edge("threshold", "value", "opacity", "to"),
        edge("opacity", "out", "out"),
      ],
    );

    const program = planAnimationGraphProgram(inputGraph);

    expect(program.operations.map((operation) => operation.kind)).toEqual([
      "nodeExecution",
      "streamTransformation",
      "branchRouting",
      "valueEvaluation",
      "effectAppend",
      "outputCollection",
    ]);
  });

  it("preserves current animation semantics through planned program evaluation", () => {
    const inputGraph = graph(
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
        matchedOpacity: node(
          "matchedOpacity",
          "effect:clipper.adjustment.opacity",
          {
            params: { from: 1, to: 0 },
          },
        ),
        deadMatched: node("deadMatched", "effect:clipper.motion.pan", {
          params: { x: 500, y: 0 },
        }),
        out: node("out", "out"),
      },
      [
        edge("source", "out", "split"),
        edge("split", "tokens", "condition"),
        edge("condition", "matched", "matchedOpacity"),
        edge("matchedOpacity", "out", "out"),
        edge("condition", "default", "deadMatched"),
      ],
    );

    const result = compileAnimationGraph(inputGraph, {
      sourceObject: textObject,
    });

    expect(result.program?.nodeIds).toEqual([
      "source",
      "split",
      "condition",
      "matchedOpacity",
      "out",
    ]);
    expect(result.animations).toHaveLength(1);
    expect(result.animations[0]).toMatchObject({
      keyframes: { opacity: [0, 0] },
      options: { split: { tokenIndexes: [0, 2] } },
    });
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
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeId: "value:value->out:in",
          nodeId: "out",
          portId: "in",
          outputId: "value",
        }),
      ]),
    );
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
    expect(result.program?.operations).toEqual([]);
    expect(result.streams).toEqual([]);
    expect(result.animations).toEqual([]);
  });

  it("allows disconnected Out as empty graph output", () => {
    const result = compileAnimationGraph(
      graph({ source: node("source", "source"), out: node("out", "out") }, []),
    );

    expect(
      result.diagnostics.filter((item) => item.severity === "error"),
    ).toEqual([]);
    expect(result.streams).toEqual([]);
    expect(result.animations).toEqual([]);
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
