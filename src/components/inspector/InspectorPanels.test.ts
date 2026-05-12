import { describe, expect, it } from "vitest";
import { isGraphSourceObjectInspectorNode } from "./InspectorPanels";

describe("isGraphSourceObjectInspectorNode", () => {
  it("treats strict source nodes as source object inspectors", () => {
    expect(
      isGraphSourceObjectInspectorNode({
        kind: "layer",
        typedNode: {
          id: "source:text",
          kind: "source",
          position: { x: 0, y: 0 },
          config: { objectId: "text" },
        },
      }),
    ).toBe(true);
  });

  it("keeps non-source graph nodes in graph parameter inspector", () => {
    expect(
      isGraphSourceObjectInspectorNode({
        kind: "geometry:rectangle",
        typedNode: {
          id: "rect",
          kind: "geometry:rectangle",
          position: { x: 0, y: 0 },
          config: {},
        },
      }),
    ).toBe(false);
  });
});
