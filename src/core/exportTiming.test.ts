import { describe, expect, it } from "vitest";
import { getExportRenderAheadFrameLimit, getFastExportMaxInFlightNativeWrites, getRenderedVideoFrameCount, getRenderedVideoFrameTime, getWebCodecsEncodeQueueLimit, getWebCodecsKeyFrameInterval } from "./exportTiming";

describe("exportTiming", () => {
  it("ceil-counts rendered frames with a one-frame minimum", () => {
    expect(getRenderedVideoFrameCount(1.41, 30)).toBe(43);
    expect(getRenderedVideoFrameCount(0, 30)).toBe(1);
  });

  it("samples frame time on exact frame boundaries clamped to the scene tail", () => {
    expect(getRenderedVideoFrameTime(0, 30, 1.41)).toBe(0);
    expect(getRenderedVideoFrameTime(6, 30, 1.41)).toBeCloseTo(0.2);
    expect(getRenderedVideoFrameTime(999, 30, 1.41)).toBeCloseTo(1.409);
  });

  it("bounds render-ahead to two frames per worker", () => {
    expect(getExportRenderAheadFrameLimit(1)).toBe(2);
    expect(getExportRenderAheadFrameLimit(10)).toBe(20);
  });

  it("derives Recordly-style WebCodecs backpressure limits", () => {
    expect(getWebCodecsEncodeQueueLimit(30, "balanced")).toBe(72);
    expect(getWebCodecsEncodeQueueLimit(60, "balanced")).toBe(120);
    expect(getWebCodecsKeyFrameInterval(30, "balanced")).toBe(90);
    expect(getFastExportMaxInFlightNativeWrites(4)).toBe(1);
    expect(getFastExportMaxInFlightNativeWrites(8)).toBe(2);
  });
});
