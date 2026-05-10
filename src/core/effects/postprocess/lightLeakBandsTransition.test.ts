import { describe, expect, it } from "vitest";

import { renderTransitionSequence } from "../../transitions";
import type { TransitionLayer } from "../../types";
import { lightLeakBandsTransitionEffect } from "../builtins/transitions";
import {
  createLightLeakBandsTransitionPostProcessPass,
  getNormalizedLightLeakSeed,
  getLightLeakBandsTransitionUniforms,
  lightLeakBandsTransitionPostProcessKind,
} from "./lightLeakBandsTransition";
import {
  createDefaultExportPostProcessRenderers,
  getDefaultPostProcessPackages,
} from "./registry";

describe("light leak bands transition post-process", () => {
  it("registers built-in post-process and transition packages", () => {
    expect(lightLeakBandsTransitionEffect.id).toBe(
      "clipper.transition.lightLeakBands",
    );
    expect(
      lightLeakBandsTransitionEffect.paramControls?.map(
        (control) => control.key,
      ),
    ).toEqual([
      "intensity",
      "softness",
      "bandCount",
      "drift",
      "warmth",
      "flicker",
      "seed",
    ]);
    expect(
      getDefaultPostProcessPackages().map((definition) => definition.kind),
    ).toContain(lightLeakBandsTransitionPostProcessKind);
    expect(
      createDefaultExportPostProcessRenderers(new Map()).some(
        (renderer) => renderer.kind === lightLeakBandsTransitionPostProcessKind,
      ),
    ).toBe(true);
  });

  it("clamps uniforms into renderer-safe ranges", () => {
    const uniforms = getLightLeakBandsTransitionUniforms(
      {
        effect: {
          effectId: "clipper.transition.lightLeakBands",
          params: {
            intensity: 4,
            softness: -2,
            bandCount: 99,
            drift: -9,
            warmth: -7,
            flicker: -1,
            seed: 2001,
          },
        },
      } as Pick<TransitionLayer, "effect">,
      -3,
    );

    expect(uniforms).toEqual({
      progress: 0,
      intensity: 1,
      softness: 0.02,
      bandCount: 12,
      drift: -2,
      warmth: -1,
      flicker: 0,
      seed: 1000,
    });
  });

  it("normalizes legacy fractional seed values", () => {
    const layer = {
      effect: {
        effectId: "clipper.transition.lightLeakBands",
        params: { seed: 0.53 },
      },
    } as Pick<TransitionLayer, "effect">;

    expect(getNormalizedLightLeakSeed(layer)).toBe(53);
    expect(getLightLeakBandsTransitionUniforms(layer, 0.5).seed).toBe(53);
  });

  it("emits shared transition post-process passes through renderSequence", () => {
    const layer = lightLeakBandsTransitionEffect.createDefaultLayer({
      id: "transition-light-leak-bands",
      start: 2,
      duration: 4,
      midPoint: 2,
    });
    const sequence = renderTransitionSequence(3, layer, 30, {
      width: 1920,
      height: 1080,
    });

    expect(sequence.postProcessPasses).toHaveLength(1);
    expect(sequence.postProcessPasses?.[0]).toMatchObject({
      id: "transition-light-leak-bands:light-leak-bands-transition-postprocess",
      kind: lightLeakBandsTransitionPostProcessKind,
      requiresLiveDomSource: true,
      sourceLayerId: "transition-light-leak-bands",
    });
    expect(sequence.aStyle?.opacity).toBe(1);
    expect(sequence.bStyle?.opacity).toBeCloseTo(0.6578947368);
  });

  it("creates pass objects with stable ids", () => {
    expect(
      createLightLeakBandsTransitionPostProcessPass({
        layer: {
          id: "light-leak-bands",
          name: "Light Leak Bands",
          start: 0,
          duration: 1,
          midPoint: 0.5,
          effect: {
            effectId: "clipper.transition.lightLeakBands",
            params: {},
          },
        },
        progress: 0.5,
      }),
    ).toMatchObject({
      id: "light-leak-bands:light-leak-bands-transition-postprocess",
      kind: lightLeakBandsTransitionPostProcessKind,
    });
  });
});
