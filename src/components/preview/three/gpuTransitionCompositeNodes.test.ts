import { describe, expect, it } from "vitest";
import type { TransitionEffectId, TransitionLayer } from "../../../core/types";
import { canUseGpuTransitionComposite } from "./gpuTransitionCompositeNodes";

function transitionLayer(effectId: TransitionEffectId): TransitionLayer {
  return {
    id: "transition-1",
    name: "Transition",
    start: 0,
    duration: 1,
    midPoint: 0.5,
    effect: { effectId, params: {} },
  };
}

describe("gpuTransitionCompositeNodes", () => {
  it.each([
    "clipper.transition.fade",
    "clipper.transition.swipe",
    "clipper.transition.scaleFade",
    "clipper.transition.zoomIn",
  ] as const)("supports CSS-only transition %s", (effectId) => {
    expect(canUseGpuTransitionComposite(transitionLayer(effectId))).toBe(true);
  });

  it.each([
    "clipper.transition.filmBurn",
    "clipper.transition.lightLeakBands",
  ] as const)(
    "leaves post-process transition %s on post-process path",
    (effectId) => {
      expect(canUseGpuTransitionComposite(transitionLayer(effectId))).toBe(
        false,
      );
    },
  );
});
