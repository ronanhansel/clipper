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

  it("tweens between inspector-created keyframe diamonds as one property track", () => {
    const animations: LayerAnimation[] = [
      {
        id: "keyframe:opacity:start",
        keyframes: { opacity: [1, 1] },
        options: { duration: 0.1, ease: "linear" },
      },
      {
        id: "keyframe:opacity:end",
        keyframes: { opacity: [0, 0] },
        options: { delay: 1, duration: 0.1, ease: "linear" },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBeCloseTo(0.5);
  });

  it("uses the segment start keyframe ease when tweening timeline tracks", () => {
    const animations: LayerAnimation[] = [
      {
        id: "keyframe:opacity:start",
        keyframes: { opacity: [0, 0] },
        options: { duration: 0.1, ease: [0.42, 0, 1, 1] },
      },
      {
        id: "keyframe:opacity:end",
        keyframes: { opacity: [1, 1] },
        options: { delay: 1, duration: 0.1, ease: "linear" },
      },
    ];

    const opacity = evaluateLayerAnimations(animations, 0.5).opacity;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.5);
  });
});
