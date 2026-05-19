import { describe, it, expect } from "vitest";
import { __testing } from "./RectImageAdapter";

describe("RectImageAdapter helpers", () => {
  describe("parseBackgroundImageUrl", () => {
    it("extracts double-quoted url", () => {
      expect(__testing.parseBackgroundImageUrl(`url("a.png")`)).toBe("a.png");
    });
    it("extracts single-quoted url", () => {
      expect(__testing.parseBackgroundImageUrl(`url('b.jpg')`)).toBe("b.jpg");
    });
    it("extracts unquoted url", () => {
      expect(__testing.parseBackgroundImageUrl(`url(c.webp)`)).toBe("c.webp");
    });
    it("returns null for non-string", () => {
      expect(__testing.parseBackgroundImageUrl(undefined)).toBeNull();
      expect(__testing.parseBackgroundImageUrl(42)).toBeNull();
    });
    it("returns null when no url() present", () => {
      expect(__testing.parseBackgroundImageUrl("none")).toBeNull();
    });
  });

  describe("parseColor", () => {
    it("parses #rrggbb", () => {
      expect(__testing.parseColor("#ff8000")).toEqual({
        color: 0xff8000,
        alpha: 1,
      });
    });
    it("parses #rgb shorthand", () => {
      expect(__testing.parseColor("#f80")).toEqual({
        color: 0xff8800,
        alpha: 1,
      });
    });
    it("parses #rrggbbaa", () => {
      expect(__testing.parseColor("#ff800080")).toEqual({
        color: 0xff8000,
        alpha: 128 / 255,
      });
    });
    it("parses rgb()", () => {
      expect(__testing.parseColor("rgb(255, 128, 0)")).toEqual({
        color: 0xff8000,
        alpha: 1,
      });
    });
    it("parses rgba()", () => {
      const c = __testing.parseColor("rgba(255, 128, 0, 0.5)");
      expect(c.color).toBe(0xff8000);
      expect(c.alpha).toBeCloseTo(0.5);
    });
    it("treats 'transparent' as alpha=0", () => {
      expect(__testing.parseColor("transparent")).toEqual({
        color: 0,
        alpha: 0,
      });
    });
    it("falls back to white opaque on garbage", () => {
      expect(__testing.parseColor(undefined)).toEqual({
        color: 0xffffff,
        alpha: 1,
      });
      expect(__testing.parseColor("not-a-color")).toEqual({
        color: 0xffffff,
        alpha: 1,
      });
    });
  });
});
