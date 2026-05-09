import { describe, expect, it } from "vitest";

import { getDefaultPostProcessPackages } from "./registry";
import {
  createFilmBurnTransitionPostProcessPass,
  filmBurnTransitionPostProcessKind,
  getFilmBurnTransitionUniforms,
} from "./filmBurnTransition";
import { createDefaultExportPostProcessRenderers } from "./registry";
import { filmBurnTransitionEffect } from "../builtins/transitions";
import { renderTransitionSequence } from "../../transitions";
import type { TransitionLayer } from "../../types";

describe("film burn transition post-process", () => {
  it("registers built-in post-process and transition packages", () => {
    expect(filmBurnTransitionEffect.id).toBe("clipper.transition.filmBurn");
    expect(
      getDefaultPostProcessPackages().map((definition) => definition.kind),
    ).toContain(filmBurnTransitionPostProcessKind);
    expect(
      createDefaultExportPostProcessRenderers(new Map()).some(
        (renderer) => renderer.kind === filmBurnTransitionPostProcessKind,
      ),
    ).toBe(true);
  });

  it("clamps uniforms into renderer-safe ranges", () => {
    const uniforms = getFilmBurnTransitionUniforms(
      {
        effect: {
          effectId: "clipper.transition.filmBurn",
          params: {
            intensity: 99,
            softness: -5,
            grain: -1,
            seed: 2001,
          },
        },
      } as Pick<TransitionLayer, "effect">,
      2,
    );

    expect(uniforms).toEqual({
      progress: 1,
      intensity: 1,
      softness: 0.02,
      grain: 0,
      seed: 1000,
    });
  });

  it("emits shared transition post-process passes through renderSequence", () => {
    const layer = filmBurnTransitionEffect.createDefaultLayer({
      id: "transition-film-burn",
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
      id: "transition-film-burn:film-burn-transition-postprocess",
      kind: filmBurnTransitionPostProcessKind,
      requiresLiveDomSource: true,
      sourceLayerId: "transition-film-burn",
    });
    expect(sequence.aStyle?.opacity).toBe(1);
    expect(sequence.bStyle?.opacity).toBeCloseTo(0.5434782608);
  });

  it("creates pass objects with stable ids", () => {
    expect(
      createFilmBurnTransitionPostProcessPass({
        layer: {
          id: "film-burn",
          name: "Film Burn",
          start: 0,
          duration: 1,
          midPoint: 0.5,
          effect: { effectId: "clipper.transition.filmBurn", params: {} },
        },
        progress: 0.5,
      }),
    ).toMatchObject({
      id: "film-burn:film-burn-transition-postprocess",
      kind: filmBurnTransitionPostProcessKind,
    });
  });
});
