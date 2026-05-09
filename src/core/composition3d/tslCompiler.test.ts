import { describe, expect, it } from "vitest";
import { compileComposition3dGraphToTsl } from "./tslCompiler";
import type { Composition3dGraph, Composition3dTslRuntime } from "./types";

function runtime(): Composition3dTslRuntime {
  return {
    time: "time",
    uv: () => ({ x: "uv.x", y: "uv.y", toString: () => "uv" }),
    texture: (texture, uv) => `texture(${String(texture)},${String(uv)})`,
    color: (...channels) => `color(${channels.join(",")})`,
    mx_noise_vec3: (value) => `noise(${String(value)})`,
    vec2: (x, y) => `vec2(${String(x)},${String(y)})`,
    mul: (...values) => `mul(${values.join(",")})`,
    add: (...values) => `add(${values.join(",")})`,
    sub: (left, right) => `sub(${String(left)},${String(right)})`,
    div: (left, right) => `div(${String(left)},${String(right)})`,
    abs: (value) => `abs(${String(value)})`,
    max: (left, right) => `max(${String(left)},${String(right)})`,
    min: (left, right) => `min(${String(left)},${String(right)})`,
    pow: (value, exponent) => `pow(${String(value)},${String(exponent)})`,
    sin: (value) => `sin(${String(value)})`,
    fract: (value) => `fract(${String(value)})`,
    clamp: (value, min, max) =>
      `clamp(${String(value)},${String(min)},${String(max)})`,
    mix: (x, y, a) => `mix(${String(x)},${String(y)},${String(a)})`,
    smoothstep: (edge0, edge1, x) =>
      `smoothstep(${String(edge0)},${String(edge1)},${String(x)})`,
  };
}

describe("compileComposition3dGraphToTsl", () => {
  it("pipes out color input directly", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "red", kind: "color", params: { value: [1, 0, 0, 1] } },
        { id: "out", kind: "out", inputs: { color: { nodeId: "red" } } },
      ],
    };

    expect(
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => asset,
      }),
    ).toBe("color(1,0,0,1)");
  });

  it("maps supported TSL nodes", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "uv", kind: "uv" },
        {
          id: "tex",
          kind: "texture",
          params: { asset: "assets/noise.png" },
          inputs: { uv: { nodeId: "uv" } },
        },
        { id: "time", kind: "time" },
        {
          id: "noise",
          kind: "mx_noise_vec3",
          inputs: { value: { nodeId: "uv" } },
        },
        {
          id: "mul",
          kind: "mul",
          inputs: { in0: { nodeId: "tex" }, in1: { nodeId: "noise" } },
        },
        {
          id: "smooth",
          kind: "smoothstep",
          inputs: {
            edge0: { nodeId: "time" },
            edge1: { nodeId: "noise" },
            x: { nodeId: "mul" },
          },
        },
        { id: "white", kind: "color", params: { value: [1, 1, 1, 1] } },
        {
          id: "mix",
          kind: "mix",
          inputs: {
            x: { nodeId: "white" },
            y: { nodeId: "mul" },
            a: { nodeId: "smooth" },
          },
        },
        {
          id: "add",
          kind: "add",
          inputs: { in0: { nodeId: "mix" }, in1: { nodeId: "white" } },
        },
        { id: "out", kind: "out", inputs: { color: { nodeId: "add" } } },
      ],
    };

    expect(
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => `loaded:${asset}`,
      }),
    ).toContain("texture(loaded:assets/noise.png,uv)");
  });

  it("silently casts universal inputs to scalar sockets", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "black", kind: "color", params: { value: [0, 0, 0, 1] } },
        { id: "white", kind: "color", params: { value: [1, 1, 1, 1] } },
        { id: "mask", kind: "color", params: { value: [0.5, 0.5, 0.5, 1] } },
        {
          id: "mix",
          kind: "mix",
          inputs: {
            x: { nodeId: "black" },
            y: { nodeId: "white" },
            a: { nodeId: "mask" },
          },
        },
        { id: "out", kind: "out", inputs: { color: { nodeId: "mix" } } },
      ],
    };
    const tsl = {
      ...runtime(),
      color: (...channels: number[]) => ({
        r: `color(${channels.join(",")}).r`,
        toString: () => `color(${channels.join(",")})`,
      }),
    } satisfies Composition3dTslRuntime;

    expect(
      compileComposition3dGraphToTsl(graph, {
        tsl,
        loadTexture: (asset) => asset,
      }),
    ).toContain("color(0.5,0.5,0.5,1).r");
  });

  it("rejects non-out graph output", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "color",
      nodes: [{ id: "color", kind: "color", params: { value: [1, 1, 1, 1] } }],
    };

    expect(() =>
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => asset,
      }),
    ).toThrow("output must be an out node");
  });

  it("maps scalar math nodes", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "time", kind: "time" },
        { id: "one", kind: "color", params: { value: [1, 1, 1, 1] } },
        { id: "half", kind: "color", params: { value: [0.5, 0.5, 0.5, 1] } },
        { id: "sin", kind: "sin", inputs: { value: { nodeId: "time" } } },
        { id: "fract", kind: "fract", inputs: { value: { nodeId: "sin" } } },
        {
          id: "clamp",
          kind: "clamp",
          inputs: {
            value: { nodeId: "fract" },
            min: { nodeId: "half" },
            max: { nodeId: "one" },
          },
        },
        {
          id: "div",
          kind: "div",
          inputs: { in0: { nodeId: "one" }, in1: { nodeId: "half" } },
        },
        {
          id: "sub",
          kind: "sub",
          inputs: { in0: { nodeId: "div" }, in1: { nodeId: "one" } },
        },
        {
          id: "mix",
          kind: "mix",
          inputs: {
            x: { nodeId: "half" },
            y: { nodeId: "sub" },
            a: { nodeId: "clamp" },
          },
        },
        { id: "out", kind: "out", inputs: { color: { nodeId: "mix" } } },
      ],
    };

    expect(
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => asset,
      }),
    ).toContain("clamp(fract(sin(time))");
  });

  it("maps coordinate and shaping nodes", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "uv", kind: "uv" },
        { id: "time", kind: "time" },
        { id: "x", kind: "split_x", inputs: { value: { nodeId: "uv" } } },
        { id: "y", kind: "split_y", inputs: { value: { nodeId: "uv" } } },
        { id: "wave", kind: "sin", inputs: { value: { nodeId: "x" } } },
        {
          id: "delta",
          kind: "sub",
          inputs: { in0: { nodeId: "wave" }, in1: { nodeId: "y" } },
        },
        { id: "abs", kind: "abs", inputs: { value: { nodeId: "delta" } } },
        {
          id: "max",
          kind: "max",
          inputs: { in0: { nodeId: "abs" }, in1: { nodeId: "time" } },
        },
        {
          id: "min",
          kind: "min",
          inputs: { in0: { nodeId: "max" }, in1: { nodeId: "time" } },
        },
        {
          id: "pow",
          kind: "pow",
          inputs: { value: { nodeId: "min" }, exponent: { nodeId: "time" } },
        },
        {
          id: "vec2",
          kind: "vec2",
          inputs: { x: { nodeId: "pow" }, y: { nodeId: "y" } },
        },
        {
          id: "noise",
          kind: "mx_noise_vec3",
          inputs: { value: { nodeId: "vec2" } },
        },
        { id: "out", kind: "out", inputs: { color: { nodeId: "noise" } } },
      ],
    };

    expect(
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => asset,
      }),
    ).toBe(
      "noise(vec2(pow(min(max(abs(sub(sin(uv.x),uv.y)),time),time),time),uv.y))",
    );
  });

  it("rejects unregistered inputs", () => {
    const graph: Composition3dGraph = {
      version: 1,
      outNodeId: "out",
      nodes: [
        { id: "time", kind: "time" },
        { id: "sin", kind: "sin", inputs: { in0: { nodeId: "time" } } },
        { id: "out", kind: "out", inputs: { color: { nodeId: "sin" } } },
      ],
    };

    expect(() =>
      compileComposition3dGraphToTsl(graph, {
        tsl: runtime(),
        loadTexture: (asset) => asset,
      }),
    ).toThrow("Composition3d node 'sin' does not support 'in0' input.");
  });
});
