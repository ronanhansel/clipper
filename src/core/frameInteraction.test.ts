import { describe, expect, it } from "vitest";
import { constrainDragDeltaToDominantAxis } from "./frameInteraction";

describe("frame interaction", () => {
  it("leaves unconstrained drag deltas unchanged", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 24, y: -12 }, false)).toEqual({ x: 24, y: -12 });
  });

  it("locks constrained drag deltas to the dominant horizontal axis", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 24, y: -12 }, true)).toEqual({ x: 24, y: 0 });
  });

  it("locks constrained drag deltas to the dominant vertical axis", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 8, y: -20 }, true)).toEqual({ x: 0, y: -20 });
  });
});
