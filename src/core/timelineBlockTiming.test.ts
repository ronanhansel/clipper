import { describe, expect, it } from "vitest";
import { getTimelineBlockTiming, getTimelineDragDeltaSeconds, getTimelineGroupMoveTiming } from "./timelineBlockTiming";

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

  it("snaps moved block to nearest edge by default when both edges have candidates", () => {
    // Block: start=2, end=5. End edge (4.96) is closer than start edge (2.08).
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 3,
      deltaSeconds: 1,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [2.08, 4.96],
      snapThresholdSeconds: 0.1,
    })).toEqual({ start: 1.96, duration: 3, guideTime: 4.96 });
  });

  it("moveSnapEdge 'start' prefers start edge snap despite a closer end-edge candidate", () => {
    // Block initial: start=1, duration=3 → after delta: unsnapped start=2, end=5.
    // Start boundary 2.08 (dist 0.08), end boundary 4.96 (dist 0.04 — closer).
    // With "start" preference, snaps to start edge 2.08 even though end is closer.
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 3,
      deltaSeconds: 1,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [2.08, 4.96],
      snapThresholdSeconds: 0.1,
      moveSnapEdge: "start",
    })).toEqual({ start: 2.08, duration: 3, guideTime: 2.08 });
  });

  it("moveSnapEdge 'end' prefers end edge snap despite a closer start-edge candidate", () => {
    // Block initial: start=1, duration=3 → after delta: unsnapped start=1.96, end=4.96.
    // Start boundary 1.92 (dist 0.04 — closer), end boundary 5.04 (dist 0.08).
    // With "end" preference, snaps to end edge 5.04 even though start is closer.
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 3,
      deltaSeconds: 0.96,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [1.92, 5.04],
      snapThresholdSeconds: 0.1,
      moveSnapEdge: "end",
    })).toEqual({ start: 2.04, duration: 3, guideTime: 5.04 });
  });

  it("moveSnapEdge 'start' falls back to nearest when start edge has no candidate", () => {
    // Only end edge is within threshold; start preference yields nothing, so fallback to nearest (end).
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 2,
      initialDuration: 3,
      deltaSeconds: 0,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [5],
      snapThresholdSeconds: 0.1,
      moveSnapEdge: "start",
    })).toEqual({ start: 2, duration: 3, guideTime: 5 });
  });

  it("moveSnapEdge 'nearest' is equivalent to default behavior", () => {
    expect(getTimelineBlockTiming({
      action: "move",
      initialStart: 1,
      initialDuration: 3,
      deltaSeconds: 1,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [2.08, 4.96],
      snapThresholdSeconds: 0.1,
      moveSnapEdge: "nearest",
    })).toEqual({ start: 1.96, duration: 3, guideTime: 4.96 });
  });

  it("snaps grouped moves from any selected edge", () => {
    expect(getTimelineGroupMoveTiming({
      items: [
        { start: 1, duration: 1 },
        { start: 4, duration: 1 },
      ],
      anchorStart: 1,
      deltaSeconds: 0.96,
      timelineDuration: 10,
      snap: true,
      snapBoundaries: [5.96],
      snapThresholdSeconds: 0.1,
    })).toEqual({ deltaSeconds: 0.96, guideTime: 5.96 });
  });

  it("snaps grouped moves from an internal selected edge", () => {
    expect(getTimelineGroupMoveTiming({
      items: [
        { start: 1, duration: 1 },
        { start: 4, duration: 1 },
        { start: 8, duration: 1 },
      ],
      anchorStart: 1,
      deltaSeconds: 0.96,
      timelineDuration: 12,
      snap: true,
      snapBoundaries: [4.96],
      snapThresholdSeconds: 0.1,
    })).toEqual({ deltaSeconds: 0.96, guideTime: 4.96 });
  });
});
