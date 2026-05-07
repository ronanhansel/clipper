import { describe, expect, it } from "vitest";
import { buildGraphNodes, getGraphAnimationSources, getGraphContentSize } from "./ComposeAnimationGraphPanel";

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
        { id: "opacity", keyframes: { opacity: [0, 1] }, options: { duration: 1, type: "tween" } },
        { id: "z-only", keyframes: { z: [0, 100] }, options: { duration: 1, type: "tween" } },
        { id: "path-only", keyframes: { pathOffset: [0, 1] }, options: { duration: 1, type: "tween" } },
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
        { id: "scale", keyframes: { scale: [0.8, 1] }, options: { duration: 1, type: "tween" } },
        { id: "rotate", keyframes: { rotate: [-12, 0] }, options: { duration: 1, type: "tween" } },
      ],
    });

    expect(sources.map((source) => source.details.property)).toEqual(["scale", "rotate"]);
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
        { id: "move", keyframes: { x: [10, 20], y: [30, 40], z: [0, 100] }, options: { duration: 1, type: "tween" } },
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

describe("buildGraphNodes", () => {
  it("does not recreate a deleted materialized code-defined node from layer animations", () => {
    const nodes = buildGraphNodes(
      [{
        id: "text",
        name: "Text",
        type: "text",
        selector: ".text",
        bounds: { x: 0, y: 0, width: 100, height: 40 },
        style: {},
        animations: [
          { id: "opacity", keyframes: { opacity: [0, 1] }, options: { duration: 1, type: "tween" } },
        ],
      }],
      {
        nodes: {},
        edges: [],
        deletedNodeIds: ["animation:text:anim:opacity:opacity"],
      },
    );

    expect(nodes.map((node) => node.id)).toEqual([
      "time:text:0",
      "layer:text",
    ]);
  });
});
