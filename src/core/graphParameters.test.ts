import { describe, expect, it } from "vitest";
import { createTypedAnimationGraphNode } from "./animationGraph/nodeRegistry";
import { updateAnimationGraphNodeParameter } from "./graphParameters";

describe("updateAnimationGraphNodeParameter", () => {
  it("updates split config and parameter cache together", () => {
    const split = createTypedAnimationGraphNode(
      "split",
      "split",
      { x: 2, y: 3 },
      { mode: "word" },
      "Split",
    );

    const next = updateAnimationGraphNodeParameter(
      { nodes: { split }, edges: [], parameters: {} },
      "split",
      "mode",
      "character",
    );

    expect(next.nodes.split).toMatchObject({
      kind: "split",
      config: { mode: "character" },
    });
    expect(next.parameters?.split).toEqual({ mode: "character" });
  });
});
