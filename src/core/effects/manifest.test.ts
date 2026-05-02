import { describe, expect, it } from "vitest";

import { createAdjustmentEffectPackage } from "./manifest";

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
});
