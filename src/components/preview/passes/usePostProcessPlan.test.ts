import { describe, expect, it } from "vitest";
import { computePostProcessPlan } from "./usePostProcessPlan";
import type { AdjustmentLayer, TransitionLayer } from "../../../core/types";

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

  it("merges transition postProcessPasses derived from live transitionLayers", () => {
    const layer: TransitionLayer = {
      id: "transition-merge",
      name: "Film burn",
      start: 0,
      duration: 1,
      midPoint: 0.5,
      effect: { effectId: "clipper.transition.filmBurn" },
    };
    const result = computePostProcessPlan(
      0.5,
      undefined,
      { transitionLayers: [layer] },
      frameSize,
    );
    expect(
      result.passes.some(
        (pass) => pass.kind === "clipper.postprocess.transition.filmBurn",
      ),
    ).toBe(true);
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

  it("recomputes transition passes per call from transitionLayers using sceneTime", () => {
    const layer: TransitionLayer = {
      id: "transition-1",
      name: "Film burn",
      start: 1,
      duration: 1,
      midPoint: 1.5,
      effect: { effectId: "clipper.transition.filmBurn" },
    };
    const earlyResult = computePostProcessPlan(
      1.1,
      undefined,
      { transitionLayers: [layer] },
      frameSize,
    );
    const lateResult = computePostProcessPlan(
      1.9,
      undefined,
      { transitionLayers: [layer] },
      frameSize,
    );
    const earlyPass = earlyResult.livePasses.find(
      (pass) => pass.kind === "clipper.postprocess.transition.filmBurn",
    ) as { uniforms: { progress: number } } | undefined;
    const latePass = lateResult.livePasses.find(
      (pass) => pass.kind === "clipper.postprocess.transition.filmBurn",
    ) as { uniforms: { progress: number } } | undefined;
    expect(earlyPass).toBeDefined();
    expect(latePass).toBeDefined();
    expect(latePass!.uniforms.progress).toBeGreaterThan(
      earlyPass!.uniforms.progress,
    );
  });

  it("returns no transition passes outside the transition window", () => {
    const layer: TransitionLayer = {
      id: "transition-1",
      name: "Film burn",
      start: 5,
      duration: 1,
      midPoint: 5.5,
      effect: { effectId: "clipper.transition.filmBurn" },
    };
    const before = computePostProcessPlan(
      0,
      undefined,
      { transitionLayers: [layer] },
      frameSize,
    );
    const after = computePostProcessPlan(
      10,
      undefined,
      { transitionLayers: [layer] },
      frameSize,
    );
    expect(before.livePasses).toEqual([]);
    expect(after.livePasses).toEqual([]);
  });
});
