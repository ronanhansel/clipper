import { describe, expect, it } from "vitest";
import {
  getTimelineEffectForLane,
  isTimelineEffectCompatibleWithLane,
  normalizeAdjustmentTimelineMarker,
  normalizeMotionTimelineMarker,
  normalizeTransitionTimelineMarker,
  timelineEffectMarkerRange,
} from "./timelineEffectMarkers";
import type {
  AdjustmentLayer,
  MotionMarker,
  TimelinePart,
  TransitionLayer,
} from "./types";

describe("timeline effect marker adapter", () => {
  it("uses registry lane metadata for effect lane compatibility", () => {
    expect(
      isTimelineEffectCompatibleWithLane("clipper.adjustment.lens", "adjust"),
    ).toBe(true);
    expect(
      isTimelineEffectCompatibleWithLane("clipper.adjustment.lens", "motion"),
    ).toBe(false);
    expect(
      getTimelineEffectForLane("clipper.motion.pan", "motion")?.category,
    ).toBe("motion");
  });

  it("normalizes adjustment, motion, and transition markers to shared timing shape", () => {
    const adjustment: AdjustmentLayer = {
      id: "adjust-1",
      name: "Lens",
      start: 1,
      duration: 3,
      layerId: "adjust-row",
      effect: { effectId: "clipper.adjustment.lens" },
    };
    const part = { id: "part-1", start: 5 } as TimelinePart;
    const motion: MotionMarker = {
      id: "motion-1",
      kind: "pan",
      effectId: "clipper.motion.pan",
      layerId: "motion-row",
      start: 2,
      duration: 4,
    };
    const transition: TransitionLayer = {
      id: "transition-1",
      name: "Crossfade",
      start: 8,
      duration: 2,
      midPoint: 9,
      layerId: "transition-row",
      effect: { effectId: "clipper.transition.fade" },
    };

    expect(normalizeAdjustmentTimelineMarker(adjustment)).toMatchObject({
      kind: "adjustment",
      id: "adjust-1",
      laneCategory: "adjust",
      rowKey: "adjust-row",
      start: 1,
      duration: 3,
    });
    expect(normalizeMotionTimelineMarker(part, motion)).toMatchObject({
      kind: "motion",
      id: "part-1:motion-1",
      laneCategory: "motion",
      rowKey: "motion-row",
      start: 7,
      duration: 4,
      partId: "part-1",
      markerId: "motion-1",
    });
    expect(normalizeTransitionTimelineMarker(transition)).toMatchObject({
      kind: "transition",
      id: "transition-1",
      laneCategory: "transition",
      rowKey: "transition-row",
      start: 8,
      duration: 2,
      midPoint: 9,
    });
    expect(
      timelineEffectMarkerRange(normalizeTransitionTimelineMarker(transition)),
    ).toEqual({
      start: 8,
      end: 10,
    });
  });
});
