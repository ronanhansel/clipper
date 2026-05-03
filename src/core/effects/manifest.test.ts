import { describe, expect, it } from "vitest";

import { createAdjustmentEffectPackage, createTransitionEffectPackage } from "./manifest";

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

    expect(effect.createDefaultLayer({ id: "transition-1", start: 0, duration: 2, midPoint: 1 }).effect.params?.ease).toBe("easeInOut");
  });
});
