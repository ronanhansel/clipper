import { clamp, roundTwo } from "./math";

export type TimelineBlockTimingAction = "move" | "start" | "end";

export type TimelineBlockSnapResult = {
  start: number;
  guideTime: number | null;
};

export type TimelineBlockTimingInput = {
  action: TimelineBlockTimingAction;
  initialStart: number;
  initialDuration: number;
  deltaSeconds: number;
  timelineDuration: number;
  minDuration?: number;
  moveMinStart?: number;
  moveMaxStartMode?: "contain" | "start" | "none";
  endMaxMode?: "timeline" | "none";
  snap?: boolean;
  snapBoundaries?: number[];
  snapThresholdSeconds?: number;
};

export type TimelineBlockTimingResult = {
  start: number;
  duration: number;
  guideTime: number | null;
};

export function getTimelineSnapGuideTime(time: number, boundaries: number[], snapThresholdSeconds: number) {
  let guideTime: number | null = null;
  let nearestDistance = snapThresholdSeconds;
  for (const boundary of boundaries) {
    const distance = Math.abs(time - boundary);
    if (distance <= nearestDistance) {
      guideTime = boundary;
      nearestDistance = distance;
    }
  }
  return guideTime;
}

export function getTimelineBlockSnap(start: number, duration: number, boundaries: number[], snapThresholdSeconds: number): TimelineBlockSnapResult {
  let nextStart = start;
  let guideTime: number | null = null;
  let nearestDistance = snapThresholdSeconds;

  for (const boundary of boundaries) {
    const startDistance = Math.abs(start - boundary);
    if (startDistance <= nearestDistance) {
      nextStart = boundary;
      guideTime = boundary;
      nearestDistance = startDistance;
    }

    const endDistance = Math.abs(start + duration - boundary);
    if (endDistance <= nearestDistance) {
      nextStart = boundary - duration;
      guideTime = boundary;
      nearestDistance = endDistance;
    }
  }

  return { start: nextStart, guideTime };
}

export function getTimelineDragDeltaSeconds(input: { initialClientX: number; clientX: number; initialScrollLeft: number; scrollLeft: number; pixelsPerSecond: number }) {
  const scrollDeltaPixels = input.scrollLeft - input.initialScrollLeft;
  return (input.clientX + scrollDeltaPixels - input.initialClientX) / Math.max(input.pixelsPerSecond, 0.0001);
}

export function getTimelineBlockTiming(input: TimelineBlockTimingInput): TimelineBlockTimingResult {
  const minDuration = input.minDuration ?? 0.1;
  const moveMinStart = input.moveMinStart ?? 0;
  const moveMaxStartMode = input.moveMaxStartMode ?? "contain";
  const endMaxMode = input.endMaxMode ?? "timeline";
  const snapBoundaries = input.snapBoundaries ?? [];
  const snapThresholdSeconds = input.snapThresholdSeconds ?? 0;
  const initialEnd = input.initialStart + input.initialDuration;

  if (input.action === "move") {
    const maxStart = moveMaxStartMode === "contain"
      ? Math.max(input.timelineDuration - input.initialDuration, moveMinStart)
      : moveMaxStartMode === "start"
        ? Math.max(input.timelineDuration, moveMinStart)
        : Number.POSITIVE_INFINITY;
    let start = clamp(input.initialStart + input.deltaSeconds, moveMinStart, maxStart);
    let guideTime: number | null = null;
    if (input.snap) {
      const snapped = getTimelineBlockSnap(start, input.initialDuration, snapBoundaries, snapThresholdSeconds);
      start = clamp(snapped.start, moveMinStart, maxStart);
      guideTime = snapped.guideTime;
    }
    return { start: roundTwo(start), duration: roundTwo(input.initialDuration), guideTime };
  }

  if (input.action === "start") {
    const maxStart = Math.max(initialEnd - minDuration, 0);
    let start = clamp(input.initialStart + input.deltaSeconds, 0, maxStart);
    let guideTime: number | null = null;
    if (input.snap) {
      guideTime = getTimelineSnapGuideTime(start, snapBoundaries, snapThresholdSeconds);
      start = clamp(guideTime ?? start, 0, maxStart);
    }
    return { start: roundTwo(start), duration: roundTwo(Math.max(initialEnd - start, minDuration)), guideTime };
  }

  const maxEnd = endMaxMode === "timeline" ? input.timelineDuration : Number.POSITIVE_INFINITY;
  let end = clamp(initialEnd + input.deltaSeconds, input.initialStart + minDuration, maxEnd);
  let guideTime: number | null = null;
  if (input.snap) {
    guideTime = getTimelineSnapGuideTime(end, snapBoundaries, snapThresholdSeconds);
    end = clamp(guideTime ?? end, input.initialStart + minDuration, maxEnd);
  }
  return { start: roundTwo(input.initialStart), duration: roundTwo(Math.max(end - input.initialStart, minDuration)), guideTime };
}
