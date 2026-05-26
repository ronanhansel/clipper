import { describe, expect, it } from "vitest";
import type { TransitionLayer } from "../../../core/types";
import { getActiveTransitionLayer } from "../FramePreview";
import {
  shouldUseDomTransitionComposite,
  shouldUseDirectGpuTransitionComposite,
  shouldUseRenderedLayerTransitionComposite,
} from "./SceneCompositor";

describe("SceneCompositor", () => {
  it("uses the DOM transition composite for flattened Direct transitions", () => {
    expect(
      shouldUseDomTransitionComposite({
        flattenComposition: true,
        hasTransitionPreviewParts: true,
        transitionProgress: 0.5,
      }),
    ).toBe(true);
  });

  it("keeps non-flattened Compose transitions on the DOM transition composite", () => {
    expect(
      shouldUseDomTransitionComposite({
        flattenComposition: false,
        hasTransitionPreviewParts: true,
        transitionProgress: 0.5,
      }),
    ).toBe(true);
  });

  it("keeps flattened transitions off the Direct GPU transition host", () => {
    expect(
      shouldUseDirectGpuTransitionComposite({
        flattenComposition: true,
        hasTransitionPreviewParts: true,
        hasGpuTransitionComposite: true,
        hasTransitionPostProcessPasses: false,
        transitionProgress: 0.5,
        fromPartCount: 1,
        toPartCount: 1,
      }),
    ).toBe(false);
  });

  it("keeps multi-part flattened transitions off the single Direct GPU transition host", () => {
    expect(
      shouldUseDirectGpuTransitionComposite({
        flattenComposition: true,
        hasTransitionPreviewParts: true,
        hasGpuTransitionComposite: true,
        hasTransitionPostProcessPasses: false,
        transitionProgress: 0.5,
        fromPartCount: 2,
        toPartCount: 1,
      }),
    ).toBe(false);
  });

  it("leaves flattened post-process Direct transitions on the single GPU host path", () => {
    expect(
      shouldUseRenderedLayerTransitionComposite({
        flattenComposition: true,
        hasTransitionPreviewParts: true,
        hasGpuTransitionComposite: true,
        hasTransitionPostProcessPasses: true,
        transitionProgress: 0.5,
      }),
    ).toBe(false);
  });

  it("keeps unsupported flattened Direct transitions off the rendered-layer composite", () => {
    expect(
      shouldUseRenderedLayerTransitionComposite({
        flattenComposition: true,
        hasTransitionPreviewParts: true,
        hasGpuTransitionComposite: false,
        hasTransitionPostProcessPasses: false,
        transitionProgress: 0.5,
      }),
    ).toBe(false);
  });

  it("keeps transition ownership through the endpoint frame", () => {
    const layer: TransitionLayer = {
      id: "film-burn",
      name: "Film Burn",
      start: 10,
      duration: 1,
      midPoint: 0.5,
      effect: { effectId: "clipper.transition.film-burn" },
    };

    expect(getActiveTransitionLayer(11, [layer])?.id).toBe("film-burn");
  });
});
