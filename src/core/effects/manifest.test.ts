import { describe, expect, it } from "vitest";

import {
  createAdjustmentEffectPackage,
  createTransitionEffectPackage,
} from "./manifest";
import { builtInAdjustmentEffects } from "./builtins/adjustments";
import {
  builtInEffectCategoryDeclarations,
  getDefaultEffectPackageId,
  getEffectCategoryDeclaration,
  getEffectCategoryAccent,
  getEffectCategoryIcon,
  getEffectCategoryLabel,
  getEffectLibrarySections,
  getEffectPackage,
  getEffectPackageTimelineDefaultDuration,
  getEffectPackageTimelineLaneCategory,
  getFallbackEffectPackageId,
  getEffectTimelineAdornments,
  getEffectTimelineDropMode,
  getEffectTimelineGradient,
  registerEffectCategoryMetadata,
  registerEffectPackage,
} from "./registry";

describe("effect manifest parsing", () => {
  it("parses explicit groups and derives the slash group path", () => {
    const effect = createAdjustmentEffectPackage(`
id: test.grouped
category: adjustment
name: Grouped
label: Grouped
groups:
  - Stylize
  - Glitch
defaultDuration: 2
defaultParams: {}
`);

    expect(effect.groups).toEqual(["Stylize", "Glitch"]);
    expect(effect.group).toBe("Stylize/Glitch");
  });

  it("falls back from nested group paths to groups", () => {
    const effect = createAdjustmentEffectPackage(`
id: test.group-fallback
category: adjustment
name: Group Fallback
label: Group Fallback
group: Motion / Camera / Zoom
defaultDuration: 2
defaultParams: {}
`);

    expect(effect.groups).toEqual(["Motion", "Camera", "Zoom"]);
    expect(effect.group).toBe("Motion / Camera / Zoom");
  });

  it("defaults transition package layers to ease in-out", () => {
    const effect = createTransitionEffectPackage(`
id: test.transition-ease
category: transition
name: Transition Ease
label: Transition Ease
group: Transitions
defaultDuration: 2
defaultParams: {}
`);

    expect(
      effect.createDefaultLayer({
        id: "transition-1",
        start: 0,
        duration: 2,
        midPoint: 1,
      }).effect.params?.ease,
    ).toBe("easeInOut");
  });

  it("groups practical prebuilt effects together", () => {
    const groupsById = new Map(
      builtInAdjustmentEffects.map((effect) => [effect.id, effect.group]),
    );

    expect(groupsById.get("clipper.adjustment.lens")).toBe("Practical");
    expect(groupsById.get("clipper.adjustment.filmEmulation")).toBe(
      "Practical",
    );
    expect(groupsById.get("clipper.adjustment.vhsTracking")).toBe("Practical");
  });

  it("registers effect packages into lookup and library sections", () => {
    const effect = createAdjustmentEffectPackage(`
id: test.adjustment.external
category: adjustment
name: External Adjustment
label: External Adjustment
groups:
  - External
  - Analog
defaultDuration: 2
defaultParams: {}
`);

    registerEffectPackage(effect);

    expect(getEffectPackage("test.adjustment.external")).toBe(effect);
    expect(
      getEffectLibrarySections()
        .find((section) => section.category === "adjustment")
        ?.packages.map((definition) => definition.id),
    ).toContain("test.adjustment.external");
  });

  it("exposes registry metadata for effect library categories", () => {
    registerEffectCategoryMetadata({
      category: "motion",
      label: "Move",
      accent: "#123456",
      icon: "motion",
      libraryOrder: 2,
      timeline: {
        laneCategory: "motion",
        previewCategory: "motion",
        gradient: { from: "#123456", to: "#012345", text: "#ffffff" },
        dropMode: "point",
      },
    });

    expect(getEffectCategoryLabel("motion")).toBe("Move");
    expect(getEffectCategoryAccent("motion")).toBe("#123456");
    expect(getEffectCategoryIcon("motion")).toBe("motion");
    expect(getEffectTimelineGradient("motion")).toEqual({
      from: "#123456",
      to: "#012345",
      text: "#ffffff",
    });
    expect(getEffectTimelineDropMode("motion")).toBe("point");
    expect(
      getEffectLibrarySections().find(
        (section) => section.category === "motion",
      )?.metadata,
    ).toMatchObject({ label: "Move", accent: "#123456", icon: "motion" });
  });

  it("resolves timeline metadata through effect package categories", () => {
    const transition = createTransitionEffectPackage(`
id: test.transition.timeline
category: transition
name: Timeline Transition
label: Timeline Transition
group: Transitions
defaultDuration: 1.25
defaultParams: {}
`);

    registerEffectPackage(transition);

    expect(getEffectPackageTimelineLaneCategory(transition.id)).toBe(
      "transition",
    );
    expect(getEffectPackageTimelineDefaultDuration(transition.id)).toBe(1.25);
    expect(getEffectTimelineAdornments("transition")).toBe("center-divider");
  });

  it("exposes built-in category declarations with defaults", () => {
    expect(
      builtInEffectCategoryDeclarations.map((item) => item.category),
    ).toEqual(["transition", "adjustment", "motion"]);
    expect(getEffectCategoryDeclaration("adjustment")?.timeline).toMatchObject({
      label: "Adjustment",
      defaultLayerName: "Adjustments",
      laneCategory: "adjust",
      dropMode: "placement",
    });
    expect(getDefaultEffectPackageId("adjustment")).toBe(
      builtInAdjustmentEffects[0].id,
    );
    expect(getFallbackEffectPackageId("adjustment")).toBe(
      builtInAdjustmentEffects[0].id,
    );
  });

  it("parses timeline marker tags", () => {
    const effect = createAdjustmentEffectPackage(`
id: test.timeline-tags
category: adjustment
name: Timeline Tags
label: Timeline Tags
group: Practical
timelineTags: [{ "kind": "text", "label": "GL", "title": "WebGL post-process" }, { "kind": "icon", "icon": "webgl", "label": "GPU" }]
defaultDuration: 2
defaultParams: {}
`);

    expect(effect.timelineTags).toEqual([
      { kind: "text", label: "GL", title: "WebGL post-process" },
      { kind: "icon", icon: "webgl", label: "GPU" },
    ]);
  });
});
