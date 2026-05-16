import { describe, expect, it } from "vitest";
import {
  bucketizePlayheadTime,
  playheadLiveBucketSec,
  resolvePlayheadTime,
} from "./usePlayheadTime";

describe("playhead-time resolver", () => {
  it("returns the idle scene-time when the clock source is idle", () => {
    expect(resolvePlayheadTime("idle", 1.234, 2.5, true)).toBe(2.5);
  });

  it("returns the live display-time during playback", () => {
    expect(resolvePlayheadTime("playback", 1.234, 2.5, true)).toBe(1.234);
  });

  it("returns the live display-time during scrub", () => {
    expect(resolvePlayheadTime("scrub", 1.234, 2.5, true)).toBe(1.234);
  });

  it("falls back to the idle scene-time when disabled, even during playback", () => {
    expect(resolvePlayheadTime("playback", 1.234, 2.5, false)).toBe(2.5);
  });
});

describe("playhead-time bucketing", () => {
  it("buckets at 30 Hz", () => {
    expect(playheadLiveBucketSec).toBeCloseTo(1 / 30, 6);
    const t0 = 1.0;
    const t1 = t0 + playheadLiveBucketSec * 0.4;
    const t2 = t0 + playheadLiveBucketSec * 1.5;
    expect(bucketizePlayheadTime(t0)).toBe(bucketizePlayheadTime(t1));
    expect(bucketizePlayheadTime(t0)).not.toBe(bucketizePlayheadTime(t2));
  });
});
