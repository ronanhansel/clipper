import { describe, expect, it } from "vitest";
import {
  addGraphEffectNode,
  addGraphMacro,
  addGraphMacroNode,
  addGraphNode,
  addGraphValueNode,
  connectGraphPorts,
  createAnimationGraph,
  createDeterministicGraphIdFactory,
  createMacroFromSelectedNodes,
  removeGraphEdge,
  removeGraphNode,
  setGraphNodeConfig,
} from "./builder";
import { compileAnimationGraph } from "./compiler";
import type { FrameObject } from "../types";

const textObject: FrameObject = {
  id: "title",
  name: "Title",
  type: "text",
  selector: ".title",
  content: "Hi",
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  style: {},
};

describe("animation graph builder", () => {
  it("creates deterministic common graph without React UI", () => {
    const graph = createAnimationGraph("title", {
      id: "graph-title",
      idFactory: createDeterministicGraphIdFactory("case"),
    });
    const time = addGraphNode(graph, "time", {
      id: "time-in",
      position: { x: 240, y: 0 },
      config: { delay: 0.2, duration: 0.8, ease: "easeOut" },
    }).value;
    const opacity = addGraphEffectNode(graph, "clipper.adjustment.opacity", {
      id: "fade",
      position: { x: 480, y: 0 },
      config: { params: { from: 0, to: 1 } },
    }).value;

    expect(
      connectGraphPorts(
        graph,
        { nodeId: "source", portId: "out" },
        { nodeId: time.id, portId: "in" },
      ).value?.id,
    ).toBe("source:out->time-in:in");
    expect(
      connectGraphPorts(
        graph,
        { nodeId: time.id, portId: "out" },
        { nodeId: opacity.id, portId: "in" },
      ).diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
    expect(
      connectGraphPorts(
        graph,
        { nodeId: opacity.id, portId: "out" },
        { nodeId: "out", portId: "in" },
      ).value,
    ).toMatchObject({ id: "fade:out->out:in" });

    const result = compileAnimationGraph(graph, {
      sourceObject: textObject,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.animations).toHaveLength(1);
    expect(result.animations[0].keyframes).toMatchObject({ opacity: [0, 1] });
  });

  it("routes builder connections through strict validation rules", () => {
    const graph = createAnimationGraph("title", { id: "graph-title" });
    addGraphNode(graph, "time", { id: "time" });
    addGraphValueNode(graph, "number", { id: "value" });

    const invalid = connectGraphPorts(
      graph,
      { nodeId: "value", portId: "value" },
      { nodeId: "time", portId: "in" },
    );
    expect(invalid.value).toBeNull();
    expect(
      invalid.diagnostics.map((diagnostic) => diagnostic.message),
    ).toContain("Cannot connect Value.number to Animation.");
    expect(graph.edges).toEqual([]);

    expect(
      connectGraphPorts(
        graph,
        { nodeId: "source", portId: "out" },
        { nodeId: "time", portId: "in" },
      ).value,
    ).not.toBeNull();
    const duplicate = connectGraphPorts(
      graph,
      { nodeId: "source", portId: "out" },
      { nodeId: "time", portId: "in" },
      { id: "duplicate" },
    );
    expect(duplicate.value).toBeNull();
    expect(
      duplicate.diagnostics.map((diagnostic) => diagnostic.message),
    ).toContain('Input port "in" accepts one connection.');
    expect(graph.edges).toHaveLength(1);
  });

  it("normalizes configs and removes nodes or edges safely", () => {
    const graph = createAnimationGraph("title", { id: "graph-title" });
    addGraphNode(graph, "time", { id: "time" });
    connectGraphPorts(
      graph,
      { nodeId: "source", portId: "out" },
      { nodeId: "time", portId: "in" },
    );

    expect(
      setGraphNodeConfig(graph, "time", { duration: 2, ease: "easeIn" }).value
        ?.config,
    ).toMatchObject({
      delay: 0,
      duration: 2,
      ease: "easeIn",
      schedule: "relative",
    });
    expect(removeGraphEdge(graph, "source:out->time:in").value).toMatchObject({
      id: "source:out->time:in",
    });
    expect(graph.edges).toEqual([]);
    expect(removeGraphNode(graph, "time").value).toMatchObject({ id: "time" });
    expect(graph.nodes.time).toBeUndefined();
  });

  it("adds strict macro definitions and macro nodes without legacy groups", () => {
    const graph = createAnimationGraph("title", { id: "graph-title" });
    const macro = addGraphMacro(graph, {
      id: "pass",
      label: "Pass",
      ports: [
        {
          id: "in",
          label: "In",
          direction: "input",
          cardinality: "single",
          type: { kind: "animation" },
          role: "macro-input",
        },
        {
          id: "out",
          label: "Out",
          direction: "output",
          cardinality: "single",
          type: { kind: "animation" },
          role: "macro-output",
        },
      ],
      nodes: {
        input: {
          id: "input",
          kind: "macroInput",
          position: { x: 0, y: 0 },
          config: { portId: "in" },
        },
        output: {
          id: "output",
          kind: "macroOutput",
          position: { x: 240, y: 0 },
          config: { portId: "out" },
        },
      },
      edges: [
        {
          id: "input:in->output:in",
          from: { nodeId: "input", portId: "in" },
          to: { nodeId: "output", portId: "in" },
        },
      ],
    }).value;
    const macroNode = addGraphMacroNode(graph, macro.id, { id: "macro" }).value;

    expect(graph.macros?.pass).toBe(macro);
    expect(macroNode.config).toMatchObject({ macroId: "pass" });
    expect("groups" in graph).toBe(false);
  });

  it("creates a macro from selected nodes only with typed boundaries", () => {
    const graph = createAnimationGraph("title", { id: "graph-title" });
    addGraphNode(graph, "time", {
      id: "time",
      config: { delay: 0.2, duration: 0.8 },
    });
    addGraphEffectNode(graph, "clipper.adjustment.opacity", {
      id: "fade",
      config: { params: { from: 0, to: 1 } },
    });
    connectGraphPorts(
      graph,
      { nodeId: "source", portId: "out" },
      { nodeId: "time", portId: "in" },
    );
    connectGraphPorts(
      graph,
      { nodeId: "time", portId: "out" },
      { nodeId: "fade", portId: "in" },
    );
    connectGraphPorts(
      graph,
      { nodeId: "fade", portId: "out" },
      { nodeId: "out", portId: "in" },
    );

    const before = compileAnimationGraph(graph, { sourceObject: textObject });
    const result = createMacroFromSelectedNodes(graph, {
      macroId: "fadeMacro",
      label: "Fade Macro",
      selectedNodeIds: ["time", "fade"],
      macroNodeId: "macro",
    });
    const after = compileAnimationGraph(graph, { sourceObject: textObject });

    expect(result.diagnostics).toEqual([]);
    expect(graph.nodes.time).toBeUndefined();
    expect(graph.nodes.fade).toBeUndefined();
    expect(graph.nodes.macro.config).toMatchObject({ macroId: "fadeMacro" });
    expect(graph.macros?.fadeMacro.ports).toMatchObject([
      { direction: "input", type: { kind: "animation" }, role: "macro-input" },
      {
        direction: "output",
        type: { kind: "animation" },
        role: "macro-output",
      },
    ]);
    expect(after.diagnostics).toEqual([]);
    expect(after.animations[0].keyframes).toEqual(
      before.animations[0].keyframes,
    );
    expect(after.animations[0].options).toEqual(before.animations[0].options);
    expect("groups" in graph).toBe(false);
  });

  it("rejects selected macro boundaries that cannot become typed ports", () => {
    const graph = createAnimationGraph("title", { id: "graph-title" });
    addGraphNode(graph, "time", { id: "time" });
    graph.edges.push({
      id: "bad-boundary",
      from: { nodeId: "source", portId: "missing" },
      to: { nodeId: "time", portId: "in" },
    });

    const result = createMacroFromSelectedNodes(graph, {
      macroId: "badMacro",
      label: "Bad Macro",
      selectedNodeIds: ["time"],
      macroNodeId: "macro",
    });

    expect(result.value).toBeNull();
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.message),
    ).toContain(
      'Selected macro input boundary cannot represent missing port "missing".',
    );
    expect(graph.nodes.time).toBeDefined();
    expect(graph.nodes.macro).toBeUndefined();
  });
});
