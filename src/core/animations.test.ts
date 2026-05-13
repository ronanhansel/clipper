import { describe, expect, it } from "vitest";
import { evaluateLayerAnimations } from "./animations";
import type { LayerAnimation } from "./types";

describe("evaluateLayerAnimations", () => {
  it("does not let a future animation override an active earlier property", () => {
    const animations: LayerAnimation[] = [
      {
        id: "in",
        keyframes: { opacity: [0, 1] },
        options: { delay: 0, duration: 1 },
      },
      {
        id: "out",
        keyframes: { opacity: [1, 0] },
        options: { delay: 1.4, duration: 0.5 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBeCloseTo(0.5);
  });

  it("allows a future animation to provide an initial property if nothing earlier claimed it", () => {
    const animations: LayerAnimation[] = [
      {
        id: "out",
        keyframes: { opacity: [1, 0] },
        options: { delay: 1.4, duration: 0.5 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBe(1);
  });

  it("evaluates keyframed size properties for inspector diamonds", () => {
    const animations: LayerAnimation[] = [
      {
        id: "resize",
        keyframes: { width: [100, 220], height: [40, 80] },
        options: { duration: 2 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 1)).toMatchObject({
      width: 160,
      height: 60,
    });
  });
});
