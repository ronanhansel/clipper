import { describe, expect, it } from "vitest";
import { getTimelineBlockTiming, getTimelineDragDeltaSeconds } from "./timelineBlockTiming";

describe("timeline block timing", () => {
  it("calculates scroll-adjusted drag delta seconds", () => {
    expect(getTimelineDragDeltaSeconds({
      initialClientX: 100,
      clientX: 140,
      initialScrollLeft: 20,
      scrollLeft: 80,
      pixelsPerSecond: 50,
    })).toBe(2);
  });

  it("moves blocks with duration-aware containment by default", () => {
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 3,
      initialDuration: 4,
      deltaSeconds: 10,
      timelineDuration: 10,
    })).toEqual({ start: 6, duration: 4, guideTime: null });

    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 3,
      initialDuration: 4,
      deltaSeconds: -10,
      timelineDuration: 10,
    })).toEqual({ start: 0, duration: 4, guideTime: null });
  });

  it("supports scene-level move bounds that clamp block starts instead of ends", () => {
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 6,
      initialDuration: 4,
      deltaSeconds: 5,
      timelineDuration: 10,
      moveMaxStartMode: "start",
    })).toEqual({ start: 10, duration: 4, guideTime: null });
  });

  it("resizes starts and ends with minimum duration and default timeline clamps", () => {
    expect(getTimelineBlockTiming({
      action: "start",
      initialStart: 2,
      initialDuration: 3,
      deltaSeconds: 4,
      timelineDuration: 10,
      minDuration: 0.5,
    })).toEqual({ start: 4.5, duration: 0.5, guideTime: null });

    expect(getTimelineBlockTiming({
      action: "end",
      initialStart: 2,
      initialDuration: 3,
      deltaSeconds: -4,
      timelineDuration: 10,
      minDuration: 0.5,
    })).toEqual({ start: 2, duration: 0.5, guideTime: null });

    expect(getTimelineBlockTiming({
      action: "end",
      initialStart: 2,
      initialDuration: 3,
      deltaSeconds: 10,
      timelineDuration: 8,
      minDuration: 0.5,
    })).toEqual({ start: 2, duration: 6, guideTime: null });
  });

  it("supports scene-level end resize beyond the display timeline", () => {
    expect(getTimelineBlockTiming({
      action: "end",
      initialStart: 2,
      initialDuration: 3,
      deltaSeconds: 10,
      timelineDuration: 8,
      endMaxMode: "none",
    })).toEqual({ start: 2, duration: 13, guideTime: null });
  });

  it("snaps moved blocks by start or end boundary and returns guide time", () => {
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 2,
      deltaSeconds: 0.95,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [2, 5],
      snapThresholdSeconds: 0.1,
    })).toEqual({ start: 2, duration: 2, guideTime: 2 });

    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 2,
      deltaSeconds: 1.95,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [5],
      snapThresholdSeconds: 0.1,
    })).toEqual({ start: 3, duration: 2, guideTime: 5 });
  });

  it("snaps resize edges and returns guide time", () => {
    expect(getTimelineBlockTiming({
      action: "start",
      initialStart: 2,
      initialDuration: 4,
      deltaSeconds: 0.95,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [3],
      snapThresholdSeconds: 0.1,
    })).toEqual({ start: 3, duration: 3, guideTime: 3 });

    expect(getTimelineBlockTiming({
      action: "end",
      initialStart: 2,
      initialDuration: 4,
      deltaSeconds: 0.95,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [7],
      snapThresholdSeconds: 0.1,
    })).toEqual({ start: 2, duration: 5, guideTime: 7 });
  });
});
