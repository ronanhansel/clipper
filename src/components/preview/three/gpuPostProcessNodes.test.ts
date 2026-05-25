import { filmBurnTransitionPostProcessKind } from "../../../core/effects/postprocess/filmBurnTransition";
import type { FilmBurnTransitionPostProcessPass } from "../../../core/effects/postprocess/filmBurnTransition";
import { lightLeakBandsTransitionPostProcessKind } from "../../../core/effects/postprocess/lightLeakBandsTransition";
import type { LightLeakBandsTransitionPostProcessPass } from "../../../core/effects/postprocess/lightLeakBandsTransition";
import { describe, expect, it } from "vitest";
import { vhsTrackingPostProcessKind } from "../../../core/effects/postprocess/vhsTracking";
import type { VhsTrackingPostProcessPass } from "../../../core/effects/postprocess/vhsTracking";
import {
  applyGpuPostProcessUniforms,
  getGpuPostProcessPassSignature,
} from "./gpuPostProcessNodes";

function makeVhsPass(time: number): VhsTrackingPostProcessPass {
  return {
    id: "vhs-1",
    sourceLayerId: "vhs-layer",
    kind: vhsTrackingPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: {
      time,
      intensity: 0.8,
      speed: 1,
      horizontalTear: 0.7,
      verticalRoll: 0.2,
      jitter: 0.4,
      bandSize: 0.18,
      chromaShiftPixels: 2.4,
      scanlines: 0.28,
      noise: 0.16,
      dropout: 0.16,
      tapeStretch: 0.2,
      seed: 23,
    },
  };
}

describe("gpuPostProcessNodes", () => {
  it("keeps VHS pipeline signature stable as time changes", () => {
    expect(getGpuPostProcessPassSignature([makeVhsPass(1)])).toBe(
      getGpuPostProcessPassSignature([makeVhsPass(2)]),
    );
  });

  it("updates VHS time through GPU uniform nodes", () => {
    const targetPass = makeVhsPass(1) as VhsTrackingPostProcessPass & {
      gpuUniformNodes: { time: { value: number } };
    };
    targetPass.gpuUniformNodes = { time: { value: 1 } };
    const sourcePass = makeVhsPass(2.5);

    applyGpuPostProcessUniforms([targetPass], [sourcePass]);

    expect(targetPass.gpuUniformNodes.time.value).toBe(2.5);
  });

  it("keeps Film Burn pipeline signature stable as progress changes", () => {
    const makePass = (progress: number): FilmBurnTransitionPostProcessPass => ({
      id: "fb-1",
      sourceLayerId: "fb-layer",
      kind: filmBurnTransitionPostProcessKind,
      target: "final",
      requiresLiveDomSource: true,
      uniforms: {
        progress,
        intensity: 0.9,
        softness: 0.4,
        grain: 0.2,
        seed: 10,
      },
    });
    expect(getGpuPostProcessPassSignature([makePass(0.1)])).toBe(
      getGpuPostProcessPassSignature([makePass(0.8)]),
    );
  });

  it("updates Film Burn progress through GPU uniform nodes", () => {
    const targetPass = {
      id: "fb-1",
      kind: filmBurnTransitionPostProcessKind,
      gpuUniformNodes: { progress: { value: 0.1 } },
    } as any;
    const sourcePass = {
      id: "fb-1",
      kind: filmBurnTransitionPostProcessKind,
      uniforms: { progress: 0.95 },
    } as any;
    applyGpuPostProcessUniforms([targetPass], [sourcePass]);
    expect(targetPass.gpuUniformNodes.progress.value).toBe(0.95);
  });

  it("keeps Light Leak pipeline signature stable as progress changes", () => {
    const makePass = (
      progress: number,
    ): LightLeakBandsTransitionPostProcessPass => ({
      id: "ll-1",
      sourceLayerId: "ll-layer",
      kind: lightLeakBandsTransitionPostProcessKind,
      target: "final",
      requiresLiveDomSource: true,
      uniforms: {
        progress,
        intensity: 0.8,
        softness: 0.3,
        bandCount: 4,
        drift: 0.5,
        warmth: 0.2,
        flicker: 0.1,
        seed: 23,
      },
    });
    expect(getGpuPostProcessPassSignature([makePass(0.2)])).toBe(
      getGpuPostProcessPassSignature([makePass(0.7)]),
    );
  });

  it("updates Light Leak progress through GPU uniform nodes", () => {
    const targetPass = {
      id: "ll-1",
      kind: lightLeakBandsTransitionPostProcessKind,
      gpuUniformNodes: { progress: { value: 0.2 } },
    } as any;
    const sourcePass = {
      id: "ll-1",
      kind: lightLeakBandsTransitionPostProcessKind,
      uniforms: { progress: 0.88 },
    } as any;
    applyGpuPostProcessUniforms([targetPass], [sourcePass]);
    expect(targetPass.gpuUniformNodes.progress.value).toBe(0.88);
  });
});
