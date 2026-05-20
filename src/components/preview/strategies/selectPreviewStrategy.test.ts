import { describe, expect, it } from "vitest";
import {
  computeHasActiveLivePasses,
  computeHasLivePassCapableLayers,
  deriveAuthoringActive,
  selectPreviewStrategy,
  type AuthoringSignalInput,
  type StrategyFramePreviewProps,
} from "./selectPreviewStrategy";
import {
  type AdjustmentLayer,
  type TransitionLayer,
} from "../../../core/types";

function emptyAuthoring(): AuthoringSignalInput {
  return {
    canSelectObjects: false,
    focusPicking: false,
    trackerPicking: false,
    pickingTranslationPosition: false,
    pickingZoomFocus: false,
    framePickPoint: null,
    dragBox: null,
    marqueeDragging: false,
    selectedObjects: [],
    editingTextObjectId: null,
    shapeDrawPreview: null,
    isPlaying: false,
  };
}

function makeProps(
  overrides: Partial<StrategyFramePreviewProps> = {},
): StrategyFramePreviewProps {
  const base = {
    ...emptyAuthoring(),
    timelineMode: "direct",
    sceneWrap: {
      cameraEnabled: true,
      adjustmentsEnabled: true,
      transitionsEnabled: true,
      motionEnabled: true,
      hideNullObjects: true,
      flattenComposition: true,
    },
    adjustmentLayers: [],
    transitionLayers: [],
    transitionPreviewParts: null,
  };
  return { ...base, ...overrides } as unknown as StrategyFramePreviewProps;
}

describe("deriveAuthoringActive", () => {
  it("returns false when nothing is selected and not picking", () => {
    expect(deriveAuthoringActive(emptyAuthoring())).toBe(false);
  });

  it("returns true when canSelectObjects is set", () => {
    expect(
      deriveAuthoringActive({ ...emptyAuthoring(), canSelectObjects: true }),
    ).toBe(true);
  });

  it("returns true when editing text", () => {
    expect(
      deriveAuthoringActive({
        ...emptyAuthoring(),
        editingTextObjectId: "obj-1",
      }),
    ).toBe(true);
  });

  it("returns true when marquee or drag box active", () => {
    expect(
      deriveAuthoringActive({ ...emptyAuthoring(), marqueeDragging: true }),
    ).toBe(true);
    expect(
      deriveAuthoringActive({
        ...emptyAuthoring(),
        dragBox: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toBe(true);
  });

  it("returns true when picking is active", () => {
    expect(
      deriveAuthoringActive({ ...emptyAuthoring(), focusPicking: true }),
    ).toBe(true);
    expect(
      deriveAuthoringActive({ ...emptyAuthoring(), trackerPicking: true }),
    ).toBe(true);
  });

  it("returns true when shape draw preview is set", () => {
    expect(
      deriveAuthoringActive({
        ...emptyAuthoring(),
        shapeDrawPreview: {} as never,
      }),
    ).toBe(true);
  });

  it("returns false during playback even with selection signals", () => {
    expect(
      deriveAuthoringActive({
        ...emptyAuthoring(),
        canSelectObjects: true,
        isPlaying: true,
      }),
    ).toBe(false);
  });
});

describe("selectPreviewStrategy", () => {
  it("compose mode forces live-dom even when live passes and authoring are active", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({
        timelineMode: "compose",
        sceneWrap: {
          cameraEnabled: false,
          adjustmentsEnabled: false,
          transitionsEnabled: false,
          motionEnabled: false,
          hideNullObjects: false,
          flattenComposition: false,
          interactionsLockedDuringPlayback: true,
        },
      }),
      hasActiveLivePasses: true,
      hasLivePassCapableLayers: true,
      authoringActive: true,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "compose-mode" });
  });

  it("live passes win over authoring so effects render under the authoring overlay", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps(),
      hasActiveLivePasses: true,
      hasLivePassCapableLayers: true,
      authoringActive: true,
    });
    expect(result).toEqual({
      kind: "live-webgl",
      reason: "active-live-passes",
    });
  });

  it("returns live-webgl when active live passes and not authoring", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps(),
      hasActiveLivePasses: true,
      hasLivePassCapableLayers: true,
      authoringActive: false,
    });
    expect(result).toEqual({
      kind: "live-webgl",
      reason: "active-live-passes",
    });
  });

  it("returns live-webgl when capable transition layers are in scope but no live pass is yet active", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps(),
      hasActiveLivePasses: false,
      hasLivePassCapableLayers: true,
      authoringActive: false,
    });
    expect(result).toEqual({
      kind: "live-webgl",
      reason: "live-pass-capable-layers",
    });
  });

  it("structural live-webgl wins even during authoring", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps(),
      hasActiveLivePasses: false,
      hasLivePassCapableLayers: true,
      authoringActive: true,
    });
    expect(result).toEqual({
      kind: "live-webgl",
      reason: "live-pass-capable-layers",
    });
  });

  it("returns live-dom for compose mode without live passes", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({
        timelineMode: "compose",
        sceneWrap: {
          cameraEnabled: false,
          adjustmentsEnabled: false,
          transitionsEnabled: false,
          motionEnabled: false,
          hideNullObjects: false,
          flattenComposition: false,
          interactionsLockedDuringPlayback: true,
        },
      }),
      hasActiveLivePasses: false,
      hasLivePassCapableLayers: false,
      authoringActive: false,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "compose-mode" });
  });

  it("returns live-dom dom-overlay-required when authoring without live passes", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "direct" }),
      hasActiveLivePasses: false,
      hasLivePassCapableLayers: false,
      authoringActive: true,
    });
    expect(result).toEqual({
      kind: "live-dom",
      reason: "dom-overlay-required",
    });
  });

  it("falls back to live-dom when no other signals match", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "direct" }),
      hasActiveLivePasses: false,
      hasLivePassCapableLayers: false,
      authoringActive: false,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "no-live-passes" });
  });
});

describe("computeHasActiveLivePasses", () => {
  it("returns false when no adjustment layers", () => {
    expect(computeHasActiveLivePasses(makeProps(), 0)).toBe(false);
  });

  it("returns true when a lens adjustment is active at sceneTime", () => {
    const layer: AdjustmentLayer = {
      id: "lens",
      name: "lens",
      start: 0,
      duration: 10,
      effect: {
        effectId: "clipper.adjustment.lens",
        params: { target: "frame", focusX: 50, focusY: 50 },
      },
    };
    const props = makeProps({ adjustmentLayers: [layer] });
    expect(computeHasActiveLivePasses(props, 1)).toBe(true);
  });

  it("does not flip live-preview when only camera lens distortion is enabled", () => {
    // Camera lens passes are routed through CompositionRenderer's composer
    // (Phase 2a of v0.2.20), not through computeHasActiveLivePasses. They must
    // not force the live-DOM postprocess strategy.
    expect(computeHasActiveLivePasses(makeProps(), 0)).toBe(false);
  });

  it("does not flip live-preview when only camera DoF is enabled", () => {
    // Camera DoF is intentionally OFF in live preview between phases 2a and
    // 2b of v0.2.20. Either way it must not flip the live-DOM strategy.
    expect(computeHasActiveLivePasses(makeProps(), 0)).toBe(false);
  });
});

describe("computeHasLivePassCapableLayers", () => {
  it("returns false with no layers", () => {
    expect(computeHasLivePassCapableLayers(makeProps())).toBe(false);
  });

  it("returns true when a lens adjustment is in scope, regardless of sceneTime", () => {
    const layer: AdjustmentLayer = {
      id: "lens",
      name: "lens",
      start: 0,
      duration: 10,
      effect: {
        effectId: "clipper.adjustment.lens",
        params: { target: "frame", focusX: 50, focusY: 50 },
      },
    };
    expect(
      computeHasLivePassCapableLayers(makeProps({ adjustmentLayers: [layer] })),
    ).toBe(true);
  });

  it("returns true when a film-burn transition layer is in scope before its window starts", () => {
    const layer: TransitionLayer = {
      id: "transition-1",
      name: "Film burn",
      start: 5,
      duration: 1,
      midPoint: 5.5,
      effect: { effectId: "clipper.transition.filmBurn" },
    };
    expect(
      computeHasLivePassCapableLayers(makeProps({ transitionLayers: [layer] })),
    ).toBe(true);
  });

  it("returns false for a non-GL transition layer", () => {
    const layer: TransitionLayer = {
      id: "transition-2",
      name: "Scale fade",
      start: 0,
      duration: 1,
      midPoint: 0.5,
      effect: { effectId: "clipper.transition.scaleFade" },
    };
    expect(
      computeHasLivePassCapableLayers(makeProps({ transitionLayers: [layer] })),
    ).toBe(false);
  });
});
