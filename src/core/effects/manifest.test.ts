import { describe, expect, it } from "vitest";

import {
  createAdjustmentEffectPackage,
  createTransitionEffectPackage,
} from "./manifest";
import { builtInAdjustmentEffects } from "./builtins/adjustments";
import {
  getEffectCategoryAccent,
  getEffectCategoryIcon,
  getEffectCategoryLabel,
  getEffectLibrarySections,
  getEffectPackage,
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
    });

    expect(getEffectCategoryLabel("motion")).toBe("Move");
    expect(getEffectCategoryAccent("motion")).toBe("#123456");
    expect(getEffectCategoryIcon("motion")).toBe("motion");
    expect(
      getEffectLibrarySections().find((section) => section.category === "motion")
        ?.metadata,
    ).toMatchObject({ label: "Move", accent: "#123456", icon: "motion" });
  });
});
