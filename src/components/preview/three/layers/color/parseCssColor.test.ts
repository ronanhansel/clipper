import { describe, expect, it } from "vitest";
import { parseCssColorToLinearRgba } from "./parseCssColor";

describe("parseCssColorToLinearRgba", () => {
  it("returns null for empty / unrecognised input", () => {
    expect(parseCssColorToLinearRgba("")).toBeNull();
    expect(parseCssColorToLinearRgba("not-a-color")).toBeNull();
    expect(parseCssColorToLinearRgba("linear-gradient(red, blue)")).toBeNull();
  });

  it("treats `transparent` as zero alpha", () => {
    expect(parseCssColorToLinearRgba("transparent")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it("parses #rgb and #rrggbb", () => {
    const a = parseCssColorToLinearRgba("#000")!;
    expect(a.r).toBeCloseTo(0);
    expect(a.a).toBe(1);
    const b = parseCssColorToLinearRgba("#ffffff")!;
    expect(b.r).toBeCloseTo(1);
    expect(b.a).toBe(1);
  });

  it("parses #rrggbbaa with alpha", () => {
    const c = parseCssColorToLinearRgba("#00000080")!;
    expect(c.a).toBeCloseTo(128 / 255, 2);
  });

  it("parses rgb() and rgba() forms", () => {
    const c = parseCssColorToLinearRgba("rgb(255, 0, 0)")!;
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0);
    expect(c.a).toBe(1);
    const d = parseCssColorToLinearRgba("rgba(0, 255, 0, 0.5)")!;
    expect(d.g).toBeCloseTo(1);
    expect(d.a).toBeCloseTo(0.5);
  });

  it("parses hsl()", () => {
    const c = parseCssColorToLinearRgba("hsl(0, 100%, 50%)")!;
    // Pure red in sRGB → linear ~1.0 for R, ~0 for G/B.
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0);
    expect(c.b).toBeCloseTo(0);
  });

  it("converts sRGB → linear (mid-grey is below 0.5)", () => {
    const c = parseCssColorToLinearRgba("#808080")!;
    // sRGB 128 ≈ 0.502 sRGB → ~0.215 linear
    expect(c.r).toBeGreaterThan(0.18);
    expect(c.r).toBeLessThan(0.25);
  });

  it("parses CSS named colours through the hex path", () => {
    const purple = parseCssColorToLinearRgba("purple")!;
    // #800080 → mid-purple. R and B equal, G zero.
    expect(purple.r).toBeCloseTo(purple.b, 4);
    expect(purple.g).toBeCloseTo(0, 4);
    expect(purple.r).toBeGreaterThan(0);
    expect(purple.a).toBe(1);

    expect(parseCssColorToLinearRgba("RED")!.r).toBeCloseTo(1);
    expect(parseCssColorToLinearRgba("rebeccapurple")!.a).toBe(1);
  });
});
