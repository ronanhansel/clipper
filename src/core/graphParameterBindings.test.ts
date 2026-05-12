import { describe, expect, it } from "vitest";
import {
  bindStrictGraphInputParameter,
  getStrictGraphInputBindingExpression,
  getStrictGraphInputBindingOptions,
  unbindStrictGraphInputParameter,
} from "./graphParameterBindings";
import type { AnimationGraph } from "./animationGraph/types";

describe("graph parameter bindings", () => {
  it("lists compatible value nodes as stable input aliases", () => {
    const graph = createGraph();

    const options = getStrictGraphInputBindingOptions(graph, "add", "a");

    expect(options).toEqual([
      expect.objectContaining({
        expression: "input.noise1",
        nodeId: "noise:1",
        portId: "value",
      }),
    ]);
  });

  it("binds input aliases to strict parameter edges and reads them back", () => {
    const graph = createGraph();

    const next = bindStrictGraphInputParameter(
      graph,
      "add",
      "a",
      "input.noise1",
    );

    expect(next.edges).toContainEqual({
      id: "noise:1:value->add:a",
      from: { nodeId: "noise:1", portId: "value" },
      to: { nodeId: "add", portId: "a" },
    });
    expect(getStrictGraphInputBindingExpression(next, "add", "a")).toBe(
      "input.noise1",
    );
  });

  it("unbinds parameter edges when a field returns to a scalar value", () => {
    const graph = bindStrictGraphInputParameter(
      createGraph(),
      "add",
      "a",
      "input.noise1",
    );

    const next = unbindStrictGraphInputParameter(graph, "add", "a");

    expect(next.edges).not.toContainEqual(
      expect.objectContaining({ to: { nodeId: "add", portId: "a" } }),
    );
    expect(next.edges).toContainEqual({
      id: "noise:1:value->add:b",
      from: { nodeId: "noise:1", portId: "value" },
      to: { nodeId: "add", portId: "b" },
    });
  });

  it("hides disconnected value nodes from inspector input options", () => {
    const graph = createGraph();
    graph.nodes["noise:2"] = {
      id: "noise:2",
      kind: "value:noise",
      position: { x: 120, y: 0 },
      config: { seed: 2, min: 0, max: 1 },
    };

    const options = getStrictGraphInputBindingOptions(graph, "add", "a");

    expect(options.map((option) => option.expression)).toEqual([
      "input.noise1",
    ]);
  });

  it("lists multiple connected same-type inputs with short numbered names", () => {
    const graph = createGraph();
    graph.nodes["noise:2"] = {
      id: "noise:2",
      kind: "value:noise",
      position: { x: 120, y: 0 },
      config: { seed: 2, min: 0, max: 1 },
    };
    graph.edges.push({
      id: "noise:2:value->add:b",
      from: { nodeId: "noise:2", portId: "value" },
      to: { nodeId: "add", portId: "b" },
    });

    const options = getStrictGraphInputBindingOptions(graph, "add", "a");

    expect(options.map((option) => option.expression)).toEqual([
      "input.noise1",
      "input.noise2",
    ]);
  });

  it("lists values connected through a strict type input bus", () => {
    const graph = createGraph();
    graph.nodes.frame = {
      id: "frame",
      kind: "value:time:frame",
      position: { x: 40, y: 80 },
      config: {},
    };
    graph.edges.push({
      id: "frame:value->noise:1:input:number",
      from: { nodeId: "frame", portId: "value" },
      to: { nodeId: "noise:1", portId: "input:number" },
    });

    const options = getStrictGraphInputBindingOptions(
      graph,
      "noise:1",
      "sample",
    );

    expect(options.map((option) => option.expression)).toContain(
      "input.frame1",
    );
  });
});

function createGraph(): AnimationGraph {
  return {
    id: "graph:text",
    sourceObjectId: "text",
    nodes: {
      source: {
        id: "source",
        kind: "source",
        position: { x: 0, y: 0 },
        config: { objectId: "text" },
      },
      "noise:1": {
        id: "noise:1",
        kind: "value:noise",
        position: { x: 100, y: 0 },
        config: { seed: 1, min: 0, max: 1, frequency: 1 },
      },
      add: {
        id: "add",
        kind: "value:math:add",
        position: { x: 200, y: 0 },
        config: { a: 0, b: 0 },
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
}
