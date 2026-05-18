import { compositionMatchesIdentity } from "../file-manager/compositionIdentity";
import { getTopTimelinePartAtTime } from "../../../core/timeline";
import type { CompositionClip, TimelineLayerState } from "../../../core/types";
import type { PrerenderManualCompositionRange } from "./usePrerenderCache";

function getCompositionTimelineRanges(compositions: CompositionClip[]) {
  return compositions.map((composition) => {
    const start = composition.start ?? 0;
    return { ...composition, start, end: start + composition.duration };
  });
}

function compositionMatchesManualPrerenderId(
  composition: CompositionClip,
  compositionId: string,
) {
  return compositionMatchesIdentity(composition, compositionId);
}

function getManualPrerenderRangesForComposition(
  compositions: CompositionClip[],
  compositionId: string,
  sceneDuration: number,
  timelineLayers: TimelineLayerState | undefined,
): PrerenderManualCompositionRange[] {
  const boundaries = new Set<number>([0, sceneDuration]);
  for (const composition of compositions) {
    const start = Math.max(composition.start ?? 0, 0);
    const end = Math.min(start + composition.duration, sceneDuration);
    if (end <= start) continue;
    boundaries.add(start);
    boundaries.add(end);
  }
  const sorted = [...boundaries].sort((left, right) => left - right);
  const ranges: PrerenderManualCompositionRange[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const top = getTopTimelinePartAtTime(
      getCompositionTimelineRanges(compositions),
      start + (end - start) / 2,
      timelineLayers,
    );
    if (!top || !compositionMatchesManualPrerenderId(top, compositionId))
      continue;
    const key = top.id;
    const last = ranges[ranges.length - 1];
    if (last && last.compositionId === key && Math.abs(last.end - start) < 1e-6)
      last.end = end;
    else ranges.push({ compositionId: key, start, end });
  }
  return ranges;
}

function mergeManualPrerenderRanges(ranges: PrerenderManualCompositionRange[]) {
  const sorted = ranges
    .slice()
    .sort(
      (left, right) =>
        left.compositionId.localeCompare(right.compositionId) ||
        left.start - right.start,
    );
  const merged: PrerenderManualCompositionRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (
      !last ||
      last.compositionId !== range.compositionId ||
      range.start > last.end
    ) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged;
}

export function getManualPrerenderRangesForMarkedCompositions(
  compositions: CompositionClip[],
  sceneDuration: number,
  timelineLayers: TimelineLayerState | undefined,
) {
  const markedIds = new Set(
    compositions
      .filter((composition) => composition.prerender)
      .map((composition) => composition.id),
  );
  return mergeManualPrerenderRanges(
    [...markedIds].flatMap((compositionId) =>
      getManualPrerenderRangesForComposition(
        compositions,
        compositionId,
        sceneDuration,
        timelineLayers,
      ),
    ),
  );
}

export function filterPrerenderCoverageToRanges(
  coverage: {
    blocks: Array<{
      start: number;
      duration: number;
      state: "enqueued" | "queued" | "cached";
    }>;
  },
  ranges: PrerenderManualCompositionRange[],
) {
  const clippedBlocks = coverage.blocks.flatMap((block) => {
    const blockEnd = block.start + block.duration;
    return ranges.flatMap((range) => {
      const start = Math.max(block.start, range.start);
      const end = Math.min(blockEnd, range.end);
      return end > start ? [{ ...block, start, duration: end - start }] : [];
    });
  });
  const covered = clippedBlocks.some((block) => block.state !== "enqueued");
  return {
    blocks: covered
      ? clippedBlocks
      : ranges.map((range) => ({
          start: range.start,
          duration: range.end - range.start,
          state: "enqueued" as const,
        })),
  };
}
