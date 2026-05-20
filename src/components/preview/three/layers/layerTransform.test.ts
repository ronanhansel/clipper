import { describe, expect, it } from "vitest";
import { resolveLayerTransform } from "./layerTransform";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../../core/types";
import type { EvaluatedObjectState } from "../../../../core/propertyRegistry";

function makeState(
  bounds: { x: number; y: number; width: number; height: number },
  transform: Record<string, number> = {},
): EvaluatedObjectState {
  return {
    id: "x",
    name: "x",
    type: "rect",
    selector: "[data-x]",
    bounds,
    style: {},
    transform,
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
  } as unknown as EvaluatedObjectState;
}

describe("resolveLayerTransform", () => {
  it("centres bounds in frame coords with y-down → y-up flip", () => {
    const t = resolveLayerTransform(
      makeState({ x: 0, y: 0, width: 200, height: 100 }),
    );
    // Top-left of the frame in DOM is (0, 0); centre of the layer is at
    // (100, 50). After centring on the frame midpoint and y-flip, the
    // mesh sits at (-FRAME_W/2 + 100, -(-FRAME_H/2 + 50)) =
    // (100 - 960, 540 - 50) = (-860, 490).
    expect(t.positionX).toBe(100 - FRAME_WIDTH / 2);
    expect(t.positionY).toBe(-(50 - FRAME_HEIGHT / 2));
    expect(t.positionZ).toBe(0);
  });

  it("propagates translateZ as positionZ", () => {
    const t = resolveLayerTransform(
      makeState({ x: 0, y: 0, width: 100, height: 100 }, { translateZ: 250 }),
    );
    expect(t.positionZ).toBe(250);
  });

  it("converts rotateX/Y/Z degrees to radians and flips x+z", () => {
    const t = resolveLayerTransform(
      makeState(
        { x: 0, y: 0, width: 10, height: 10 },
        { rotateX: 90, rotateY: 45, rotateZ: 30 },
      ),
    );
    expect(t.rotationX).toBeCloseTo(-Math.PI / 2);
    expect(t.rotationY).toBeCloseTo(Math.PI / 4);
    expect(t.rotationZ).toBeCloseTo(-Math.PI / 6);
  });

  it("falls back to scale when scaleX/Y missing", () => {
    const t = resolveLayerTransform(
      makeState({ x: 0, y: 0, width: 10, height: 10 }, { scale: 1.5 }),
    );
    expect(t.scaleX).toBe(1.5);
    expect(t.scaleY).toBe(1.5);
  });

  it("clamps width/height to integers ≥ 1", () => {
    const t = resolveLayerTransform(
      makeState({ x: 0, y: 0, width: 0.4, height: 99.9 }),
    );
    expect(t.width).toBe(1);
    expect(t.height).toBe(99);
  });
});
