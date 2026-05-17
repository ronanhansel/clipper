import { describe, expect, it } from "vitest";
import { computePostProcessPlan } from "./usePostProcessPlan";
import type { AdjustmentLayer } from "../../../core/types";
import type { PostProcessPass } from "../../../core/effects/types";

const frameSize = { width: 1920, height: 1080 };

function lensLayer(
  id: string,
  params: Record<string, unknown> = {},
): AdjustmentLayer {
  return {
    id,
    name: id,
    start: 0,
    duration: 10,
    effect: {
      effectId: "clipper.adjustment.lens",
      params: { target: "frame", focusX: 50, focusY: 50, ...params },
    },
  };
}

function brightnessLayer(id: string): AdjustmentLayer {
  return {
    id,
    name: id,
    start: 0,
    duration: 10,
    effect: {
      effectId: "clipper.adjustment.brightness",
      params: { brightness: 1.2 },
    },
  };
}

describe("computePostProcessPlan", () => {
  it("returns empty plan for null layers", () => {
    const result = computePostProcessPlan(0, undefined, null, frameSize);
    expect(result.plan.activeLayers).toEqual([]);
    expect(result.passes).toEqual([]);
    expect(result.livePasses).toEqual([]);
    expect(result.hasLivePasses).toBe(false);
  });

  it("returns empty live passes when no live-dom passes are present", () => {
    const result = computePostProcessPlan(
      1,
      [brightnessLayer("a")],
      null,
      frameSize,
    );
    expect(result.hasLivePasses).toBe(false);
    expect(result.livePasses).toEqual([]);
  });

  it("isolates live-dom passes via selectLiveDomPostProcessPasses", () => {
    const result = computePostProcessPlan(
      1,
      [lensLayer("lens-a")],
      null,
      frameSize,
    );
    expect(result.hasLivePasses).toBe(true);
    expect(result.livePasses.length).toBeGreaterThan(0);
    expect(result.livePasses.every((p) => p.requiresLiveDomSource)).toBe(true);
  });

  it("merges transition postProcessPasses into the bundle", () => {
    const transitionPass: PostProcessPass = {
      id: "transition:test",
      kind: "transition",
      target: "final",
      requiresLiveDomSource: false,
    };
    const result = computePostProcessPlan(
      1,
      undefined,
      { postProcessPasses: [transitionPass] },
      frameSize,
    );
    expect(result.passes).toContain(transitionPass);
  });

  it("returns same output for same input (referential stability of pure compute)", () => {
    const layers: AdjustmentLayer[] = [lensLayer("lens-a")];
    const a = computePostProcessPlan(1, layers, null, frameSize);
    const b = computePostProcessPlan(1, layers, null, frameSize);
    expect(a.passes).toEqual(b.passes);
    expect(a.livePasses).toEqual(b.livePasses);
    expect(a.hasLivePasses).toBe(b.hasLivePasses);
    expect(a.visualStyle).toEqual(b.visualStyle);
    expect(a.visualStyleAfterLastLive).toEqual(b.visualStyleAfterLastLive);
    expect(a.visualStyleBeforeFirstLive).toEqual(b.visualStyleBeforeFirstLive);
  });

  it("planBeforeFirstLive is empty when no live passes exist", () => {
    const result = computePostProcessPlan(
      1,
      [brightnessLayer("a")],
      null,
      frameSize,
    );
    expect(result.planBeforeFirstLive.activeLayers).toEqual([]);
  });

  it("planBeforeFirstLive contains layers preceding the first live pass", () => {
    const result = computePostProcessPlan(
      1,
      [brightnessLayer("pre"), lensLayer("lens")],
      null,
      frameSize,
    );
    expect(result.planBeforeFirstLive.activeLayers.map((l) => l.id)).toEqual([
      "pre",
    ]);
  });

  it("planAfterLastLive is full plan when no live pass exists", () => {
    const result = computePostProcessPlan(
      1,
      [brightnessLayer("a")],
      null,
      frameSize,
    );
    expect(result.planAfterLastLive.activeLayers.map((l) => l.id)).toEqual([
      "a",
    ]);
  });
});
