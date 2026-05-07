import { describe, expect, it } from "vitest";
import { animationDefinitions, getAnimationDefinition } from "./registry";

describe("animation definition registry", () => {
  it("registers position and opacity as independent definitions", () => {
    expect(animationDefinitions.map((definition) => definition.property)).toEqual([
      "position",
      "opacity",
    ]);
  });

  it("preserves graph parameter keys while materializing keyframes", () => {
    const position = getAnimationDefinition("position")!;
    const opacity = getAnimationDefinition("opacity")!;

    expect(position.fieldGroups.flatMap((group) => group.fields.map((field) => field.key))).toEqual([
      "x from",
      "x to",
      "y from",
      "y to",
    ]);
    expect(opacity.fieldGroups[0].fields.map((field) => field.key)).toEqual([
      "from",
      "to",
    ]);
    expect(position.materializeKeyframes({ readNumber: (key) => ({ "x from": 10, "x to": 20, "y from": 30, "y to": 40 })[key] ?? 0 })).toEqual({ x: [10, 20], y: [30, 40] });
    expect(opacity.materializeKeyframes({ readNumber: (key) => ({ from: 0.25, to: 1 })[key] ?? 0 })).toEqual({ opacity: [0.25, 1] });
  });
});
