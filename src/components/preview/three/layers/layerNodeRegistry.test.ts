import { describe, expect, it, beforeEach } from "vitest";
import {
  clearLayerNodeRegistry,
  describeLayerNodeRegistry,
  getLayerNodeFactory,
  registerLayerNodeFactory,
  type LayerNode,
  type LayerNodeContext,
  type LayerNodeFactory,
} from "./layerNodeRegistry";
import type { FrameObject } from "../../../../core/types";

function makeFactory(kind: LayerNodeFactory["kind"]): LayerNodeFactory {
  return {
    kind,
    create(_object: FrameObject, _context: LayerNodeContext): LayerNode {
      return {
        object3D: { name: `mock:${kind}` },
        update() {},
        dispose() {},
      };
    },
  };
}

describe("layerNodeRegistry", () => {
  beforeEach(() => {
    clearLayerNodeRegistry();
  });

  it("returns undefined when type is not registered and no default exists", () => {
    expect(getLayerNodeFactory("rect")).toBeUndefined();
  });

  it("registers + retrieves a factory by kind", () => {
    const factory = makeFactory("rect");
    registerLayerNodeFactory(factory);
    expect(getLayerNodeFactory("rect")).toBe(factory);
  });

  it("falls back to the `default` factory when the requested kind isn't registered", () => {
    const fallback = makeFactory("default");
    registerLayerNodeFactory(fallback);
    expect(getLayerNodeFactory("rect")).toBe(fallback);
    expect(getLayerNodeFactory("text")).toBe(fallback);
  });

  it("describeLayerNodeRegistry lists registered kinds sorted", () => {
    registerLayerNodeFactory(makeFactory("text"));
    registerLayerNodeFactory(makeFactory("rect"));
    registerLayerNodeFactory(makeFactory("default"));
    expect(describeLayerNodeRegistry()).toEqual(["default", "rect", "text"]);
  });
});
