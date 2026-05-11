import { describe, expect, it } from "vitest";
import { createTypedAnimationGraphNode } from "./nodeRegistry";
import { compileTypedAnimationGraphForObject } from "./compiler";
import type {
  AnimationGraphEdge,
  FrameObject,
  TypedAnimationGraphNode,
  TypedAnimationGraphState,
} from "../types";

function node(
  id: string,
  kind: TypedAnimationGraphNode["kind"],
  config: TypedAnimationGraphNode["config"] = {},
  label?: string,
) {
  return createTypedAnimationGraphNode(id, kind, { x: 0, y: 0 }, config, label);
}

function edge(fromNodeId: string, toNodeId: string): AnimationGraphEdge {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    fromNodeId,
    fromPort: "bottom",
    toNodeId,
    toPort: "top",
  };
}

function graph(nodes: TypedAnimationGraphNode[], edges: AnimationGraphEdge[]) {
  return {
    nodes: Object.fromEntries(nodes.map((item) => [item.id, item])),
    edges,
  } satisfies TypedAnimationGraphState;
}

const object: FrameObject = {
  id: "text",
  name: "Text",
  type: "text",
  selector: ".text",
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  style: {},
};

describe("compileTypedAnimationGraphForObject", () => {
  it("applies upstream effects through an effect mix", () => {
    const animations = compileTypedAnimationGraphForObject(
      object,
      graph(
        [
          node("source", "source", { objectId: "text" }, "Source"),
          node("time", "time", { duration: "1" }, "Time"),
          node(
            "position",
            "effect",
            { property: "position", "x to": "120", "y to": "80" },
            "Position",
          ),
          node("mix", "effect", {}, "Effect Mix"),
          node("out", "out", {}, "Out"),
        ],
        [
          edge("source", "time"),
          edge("time", "mix"),
          edge("position", "mix"),
          edge("mix", "out"),
        ],
      ),
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes).toMatchObject({
      x: [0, 120],
      y: [0, 80],
    });
  });
});
