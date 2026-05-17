import { describe, expect, it } from "vitest";
import {
  computeHasActiveLivePasses,
  deriveAuthoringActive,
  selectPreviewStrategy,
  type AuthoringSignalInput,
  type StrategyFramePreviewProps,
} from "./selectPreviewStrategy";
import type { AdjustmentLayer } from "../../../core/types";

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
    timelineMode: "composition",
    adjustmentLayers: [],
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
  it("live passes win over authoring so effects render under the authoring overlay", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps(),
      hasActiveLivePasses: true,
      prerenderEnabled: true,
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
      prerenderEnabled: false,
      authoringActive: false,
    });
    expect(result).toEqual({
      kind: "live-webgl",
      reason: "active-live-passes",
    });
  });

  it("returns live-dom for compose mode without live passes", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "compose" }),
      hasActiveLivePasses: false,
      prerenderEnabled: false,
      authoringActive: false,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "compose-mode" });
  });

  it("returns prerender when prerender enabled in direct mode", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "composition" }),
      hasActiveLivePasses: false,
      prerenderEnabled: true,
      authoringActive: false,
    });
    expect(result).toEqual({
      kind: "prerender",
      reason: "prerender-frames-available",
    });
  });

  it("falls back to live-dom when no other signals match", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "composition" }),
      hasActiveLivePasses: false,
      prerenderEnabled: false,
      authoringActive: false,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "no-live-passes" });
  });

  it("authoring suppresses prerender", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "composition" }),
      hasActiveLivePasses: false,
      prerenderEnabled: true,
      authoringActive: true,
    });
    expect(result).toEqual({
      kind: "live-dom",
      reason: "dom-overlay-required",
    });
  });

  it("compose mode strategy is not blocked by prerender", () => {
    const result = selectPreviewStrategy({
      framePreviewProps: makeProps({ timelineMode: "compose" }),
      hasActiveLivePasses: false,
      prerenderEnabled: true,
      authoringActive: false,
    });
    expect(result).toEqual({ kind: "live-dom", reason: "compose-mode" });
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
});
