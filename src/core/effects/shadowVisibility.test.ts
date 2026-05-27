import { describe, expect, it } from "vitest";
import { hasVisibleShadow } from "./shadowVisibility";

describe("hasVisibleShadow", () => {
  it("does not treat an empty evaluated shadow record as visible", () => {
    expect(hasVisibleShadow({})).toBe(false);
  });

  it("requires an enabled shadow with visible geometry and alpha", () => {
    expect(hasVisibleShadow({ enabled: true, y: 4, blur: 4, alpha: 25 })).toBe(
      true,
    );
    expect(hasVisibleShadow({ enabled: false, y: 4, blur: 4, alpha: 25 })).toBe(
      false,
    );
    expect(hasVisibleShadow({ enabled: true, y: 4, blur: 4, alpha: 0 })).toBe(
      false,
    );
    expect(hasVisibleShadow({ enabled: true, x: 0, y: 0, blur: 0 })).toBe(
      false,
    );
  });
});
