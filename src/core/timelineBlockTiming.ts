import { clamp, roundToPrecision } from "./math";

export type TimelineBlockTimingAction = "move" | "start" | "end";

export type TimelineBlockSnapEdgePreference = "nearest" | "start" | "end";

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
  moveSnapEdge?: TimelineBlockSnapEdgePreference;
  precision?: number;
};

export type TimelineBlockTimingResult = {
  start: number;
  duration: number;
  guideTime: number | null;
};

export type TimelineBlockMoveItem = {
  start: number;
  duration: number;
};

export function getTimelineSnapGuideTime(
  time: number,
  boundaries: number[],
  snapThresholdSeconds: number,
) {
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

export function getTimelineBlockSnap(
  start: number,
  duration: number,
  boundaries: number[],
  snapThresholdSeconds: number,
  edgePreference: TimelineBlockSnapEdgePreference = "nearest",
): TimelineBlockSnapResult {
  let nearestStartDistance = snapThresholdSeconds;
  let nearestStartBoundary: number | null = null;

  let nearestEndDistance = snapThresholdSeconds;
  let nearestEndBoundary: number | null = null;

  for (const boundary of boundaries) {
    const startDistance = Math.abs(start - boundary);
    if (startDistance <= nearestStartDistance) {
      nearestStartDistance = startDistance;
      nearestStartBoundary = boundary;
    }

    const endDistance = Math.abs(start + duration - boundary);
    if (endDistance <= nearestEndDistance) {
      nearestEndDistance = endDistance;
      nearestEndBoundary = boundary;
    }
  }

  if (edgePreference === "start" && nearestStartBoundary !== null) {
    return { start: nearestStartBoundary, guideTime: nearestStartBoundary };
  }

  if (edgePreference === "end" && nearestEndBoundary !== null) {
    return {
      start: nearestEndBoundary - duration,
      guideTime: nearestEndBoundary,
    };
  }

  // "nearest" fallback: pick whichever edge candidate is closest
  const startDist =
    nearestStartBoundary !== null
      ? nearestStartDistance
      : Number.POSITIVE_INFINITY;
  const endDist =
    nearestEndBoundary !== null ? nearestEndDistance : Number.POSITIVE_INFINITY;

  if (startDist <= endDist && nearestStartBoundary !== null) {
    return { start: nearestStartBoundary, guideTime: nearestStartBoundary };
  }

  if (nearestEndBoundary !== null) {
    return {
      start: nearestEndBoundary - duration,
      guideTime: nearestEndBoundary,
    };
  }

  return { start, guideTime: null };
}

export function getTimelineDragDeltaSeconds(input: {
  initialClientX: number;
  clientX: number;
  initialScrollLeft: number;
  scrollLeft: number;
  pixelsPerSecond: number;
}) {
  const scrollDeltaPixels = input.scrollLeft - input.initialScrollLeft;
  return (
    (input.clientX + scrollDeltaPixels - input.initialClientX) /
    Math.max(input.pixelsPerSecond, 0.0001)
  );
}

export function getTimelineBlockTiming(
  input: TimelineBlockTimingInput,
): TimelineBlockTimingResult {
  const minDuration = input.minDuration ?? 0.1;
  const moveMinStart = input.moveMinStart ?? 0;
  const moveMaxStartMode = input.moveMaxStartMode ?? "contain";
  const endMaxMode = input.endMaxMode ?? "timeline";
  const snapBoundaries = input.snapBoundaries ?? [];
  const snapThresholdSeconds = input.snapThresholdSeconds ?? 0;
  const initialEnd = input.initialStart + input.initialDuration;
  const precision = input.precision ?? 2;
  const r = (v: number) => roundToPrecision(v, precision);

  if (input.action === "move") {
    const maxStart =
      moveMaxStartMode === "contain"
        ? Math.max(input.timelineDuration - input.initialDuration, moveMinStart)
        : moveMaxStartMode === "start"
          ? Math.max(input.timelineDuration, moveMinStart)
          : Number.POSITIVE_INFINITY;
    let start = clamp(
      input.initialStart + input.deltaSeconds,
      moveMinStart,
      maxStart,
    );
    let guideTime: number | null = null;
    if (input.snap) {
      const snapped = getTimelineBlockSnap(
        start,
        input.initialDuration,
        snapBoundaries,
        snapThresholdSeconds,
        input.moveSnapEdge,
      );
      start = clamp(snapped.start, moveMinStart, maxStart);
      guideTime = snapped.guideTime;
    }
    return { start, duration: r(input.initialDuration), guideTime };
  }

  if (input.action === "start") {
    const maxStart = Math.max(initialEnd - minDuration, 0);
    let start = clamp(input.initialStart + input.deltaSeconds, 0, maxStart);
    let guideTime: number | null = null;
    if (input.snap) {
      guideTime = getTimelineSnapGuideTime(
        start,
        snapBoundaries,
        snapThresholdSeconds,
      );
      start = clamp(guideTime ?? start, 0, maxStart);
    }
    return {
      start: r(start),
      duration: r(Math.max(initialEnd - start, minDuration)),
      guideTime,
    };
  }

  const maxEnd =
    endMaxMode === "timeline"
      ? input.timelineDuration
      : Number.POSITIVE_INFINITY;
  let end = clamp(
    initialEnd + input.deltaSeconds,
    input.initialStart + minDuration,
    maxEnd,
  );
  let guideTime: number | null = null;
  if (input.snap) {
    guideTime = getTimelineSnapGuideTime(
      end,
      snapBoundaries,
      snapThresholdSeconds,
    );
    end = clamp(guideTime ?? end, input.initialStart + minDuration, maxEnd);
  }
  return {
    start: r(input.initialStart),
    duration: r(Math.max(end - input.initialStart, minDuration)),
    guideTime,
  };
}

export function getTimelineGroupMoveTiming(input: {
  items: TimelineBlockMoveItem[];
  anchorStart: number;
  deltaSeconds: number;
  timelineDuration: number;
  moveMinStart?: number;
  moveMaxStartMode?: "contain" | "start" | "none";
  snap?: boolean;
  snapBoundaries?: number[];
  snapThresholdSeconds?: number;
  precision?: number;
}): { deltaSeconds: number; guideTime: number | null } {
  if (input.items.length === 0) return { deltaSeconds: 0, guideTime: null };
  const minStart = Math.min(...input.items.map((item) => item.start));
  const maxEnd = Math.max(
    ...input.items.map((item) => item.start + item.duration),
  );
  const moveMinStart = input.moveMinStart ?? 0;
  const moveMaxStartMode = input.moveMaxStartMode ?? "contain";
  const maxStart =
    moveMaxStartMode === "contain"
      ? Math.max(input.timelineDuration - (maxEnd - minStart), moveMinStart)
      : moveMaxStartMode === "start"
        ? Math.max(input.timelineDuration, moveMinStart)
        : Number.POSITIVE_INFINITY;
  const precision = input.precision ?? 2;
  const r = (v: number) => roundToPrecision(v, precision);
  const clampDelta = (delta: number) =>
    clamp(minStart + delta, moveMinStart, maxStart) - minStart;

  const unsnappedDelta = clampDelta(input.deltaSeconds);
  let deltaSeconds = unsnappedDelta;
  let guideTime: number | null = null;
  if (input.snap) {
    const threshold = input.snapThresholdSeconds ?? 0;
    let nearestDistance = threshold;
    for (const boundary of input.snapBoundaries ?? []) {
      for (const item of input.items) {
        const startDistance = Math.abs(item.start + unsnappedDelta - boundary);
        if (startDistance <= nearestDistance) {
          nearestDistance = startDistance;
          deltaSeconds = clampDelta(boundary - item.start);
          guideTime = boundary;
        }

        const end = item.start + item.duration;
        const endDistance = Math.abs(end + unsnappedDelta - boundary);
        if (endDistance <= nearestDistance) {
          nearestDistance = endDistance;
          deltaSeconds = clampDelta(boundary - end);
          guideTime = boundary;
        }
      }
    }
  }

  return { deltaSeconds: r(deltaSeconds), guideTime };
}
