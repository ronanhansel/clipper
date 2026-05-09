import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultPrerenderBlockDurationMs,
  maxPrerenderBlockDurationMs,
  minPrerenderBlockDurationMs,
  videoExportFrameRate,
} from "../../config";
import { clipperHost } from "../../clipperHost";
import { getAdjustmentEffectPackage } from "../../../core/effects/registry";
import { getTopTimelinePartAtTime } from "../../../core/timeline";
import type {
  AdjustmentLayer,
  CompositionClip,
  ProjectManifest,
  Scene,
  TimelineLayerState,
  TransitionLayer,
} from "../../../core/types";

type DecodedPrerenderFrame = {
  sceneTime: number;
  bytes: Uint8ClampedArray<ArrayBuffer>;
};
type PrerenderFrameDecodeRequest = {
  id: number;
  frames: Array<{ sceneTime: number; data: ArrayBuffer }>;
};
type PrerenderFrameDecodeResponse = {
  id: number;
  frames: Array<{ sceneTime: number; data: ArrayBuffer }>;
};
type PrerenderQueueItem = {
  start: number;
  durationMs: number;
  frameRange?: { startFrame: number; endFrame: number };
  manualJobId?: number;
};
type ManualPrerenderJob = {
  errors: string[];
  pending: number;
  queuedRanges: number;
  visibleRanges: number;
  resolve: (result: PrerenderCompositionResult) => void;
};

export type PrerenderCacheBlock = {
  width: number;
  height: number;
  startTime: number;
  duration: number;
  frameRate: number;
  frames: PrerenderCacheFrame[];
};

export type PrerenderCacheFrame = {
  sceneTime: number;
  bitmap: ImageBitmap;
};

export type PrerenderCacheCoverage = {
  blocks: Array<{
    start: number;
    duration: number;
    state: "enqueued" | "queued" | "cached";
  }>;
};

export type PrerenderCacheInterestReason = "scrub" | "playback" | "idle";
export type PrerenderCompositionResult = {
  queuedBlocks: number;
  visibleRanges: number;
  completed: boolean;
  error?: string;
};
export type PrerenderManualCompositionRange = {
  compositionId: string;
  start: number;
  end: number;
};

const maxMemoryBlocks = 64;
const prerenderTimeoutMs = 30000;
const idleScheduleDelayMs = 120;
const manualPrerenderAutoPauseMs = 1500;
const activeRadiusBlocks = 1;
const idleRadiusBlocks = 24;

export function usePrerenderCache({
  blockDurationMs,
  cacheResetToken,
  enabled,
  hasActiveComposition,
  isPlaying,
  manifestPath,
  project,
  scene,
  sceneDuration,
  sceneTime,
  tileHeight,
  timelineLayers,
  scheduleRanges = [],
}: {
  blockDurationMs: number;
  cacheResetToken: number;
  enabled: boolean;
  hasActiveComposition: boolean;
  isPlaying: boolean;
  manifestPath: string;
  project: ProjectManifest;
  scene: Scene;
  sceneDuration: number;
  sceneTime: number;
  tileHeight: number;
  timelineLayers?: TimelineLayerState;
  scheduleRanges?: PrerenderManualCompositionRange[];
}) {
  const cacheRef = useRef(new Map<number, PrerenderCacheBlock>());
  const queuedRef = useRef<PrerenderQueueItem[]>([]);
  const renderingBlockStartsRef = useRef(new Set<number>());
  const cachedBlockStartsRef = useRef(new Set<number>());
  const processingRef = useRef(false);
  const generationRef = useRef(0);
  const cacheSignatureRef = useRef<PrerenderCacheSignature | null>(null);
  const fullCacheKeyRef = useRef("");
  const idleTimerRef = useRef<number | null>(null);
  const autoPrerenderPausedUntilRef = useRef(0);
  const decoderRef = useRef<PrerenderFrameDecoder | null>(null);
  const nextManualJobIdRef = useRef(1);
  const manualJobsRef = useRef(new Map<number, ManualPrerenderJob>());
  const blockDurationSeconds = clampBlockDurationMs(blockDurationMs) / 1000;
  const latestRequestRef = useRef({
    project,
    manifestPath,
    scene,
    sceneTime,
    sceneDuration,
    enabled,
    hasActiveComposition,
    isPlaying,
    tileHeight,
    blockDurationMs,
    timelineLayers,
    scheduleRanges,
  });
  const [state, setState] = useState({ version: 0, error: "" });
  const cacheSignature = useMemo(
    () => getPrerenderCacheSignature(project, scene),
    [project, scene],
  );
  const globalCacheKey = JSON.stringify({
    blockDurationMs,
    decodedFrameFormat: prerenderDecodedFrameFormat,
    ...cacheSignature.global,
  });
  const fullCacheKey = JSON.stringify({
    globalCacheKey,
    tileHeight,
    cacheResetToken,
  });

  latestRequestRef.current = {
    project,
    manifestPath,
    scene,
    sceneTime,
    sceneDuration,
    enabled,
    hasActiveComposition,
    isPlaying,
    tileHeight,
    blockDurationMs,
    timelineLayers,
    scheduleRanges,
  };

  useEffect(() => {
    const previousSignature = cacheSignatureRef.current;
    const fullReset = fullCacheKeyRef.current !== fullCacheKey;
    const signatureChanged =
      !previousSignature ||
      JSON.stringify(previousSignature) !== JSON.stringify(cacheSignature);
    if (!fullReset && !signatureChanged) return;
    resolveManualJobs(
      manualJobsRef.current,
      "Prerender was interrupted by a project or cache change.",
    );
    cacheSignatureRef.current = cacheSignature;
    fullCacheKeyRef.current = fullCacheKey;
    generationRef.current += 1;
    if (!previousSignature || fullReset) {
      closePrerenderCacheBlocks(cacheRef.current);
      queuedRef.current = [];
      renderingBlockStartsRef.current.clear();
      cachedBlockStartsRef.current.clear();
    } else {
      const invalidRanges = getPrerenderInvalidationRanges(
        previousSignature,
        cacheSignature,
        sceneDuration,
        blockDurationSeconds,
      );
      evictChangedRanges(
        cacheRef.current,
        cachedBlockStartsRef.current,
        invalidRanges,
      );
      queuedRef.current = queuedRef.current.filter(
        (item) =>
          !rangesOverlap(
            item.start,
            item.start + item.durationMs / 1000,
            invalidRanges,
          ),
      );
      for (const blockStart of [...renderingBlockStartsRef.current]) {
        if (
          rangesOverlap(
            blockStart,
            blockStart + blockDurationSeconds,
            invalidRanges,
          )
        )
          renderingBlockStartsRef.current.delete(blockStart);
      }
    }
    if (idleTimerRef.current !== null)
      window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    setState((current) => ({ version: current.version + 1, error: "" }));
  }, [fullCacheKey, cacheSignature, blockDurationSeconds, sceneDuration]);

  const requestCacheAtTime = useCallback(
    (time: number, reason: PrerenderCacheInterestReason = "idle") => {
      const request = latestRequestRef.current;
      if (Date.now() < autoPrerenderPausedUntilRef.current) return;
      if (
        !request.enabled ||
        !request.hasActiveComposition ||
        request.sceneDuration <= 0
      )
        return;
      const generation = generationRef.current;
      const radiusBlocks =
        reason === "playback" ? activeRadiusBlocks : reason === "scrub" ? 1 : 2;
      const blockStarts = getPrerenderScheduleBlockStarts(
        time,
        request.sceneDuration,
        videoExportFrameRate,
        blockDurationSeconds,
        radiusBlocks,
        reason,
      ).filter(
        (blockStart) =>
          request.scheduleRanges.length === 0 ||
          blockIntersectsRanges(
            blockStart,
            blockStart + blockDurationSeconds,
            request.scheduleRanges,
          ),
      );
      const nextQueue = queuedRef.current.filter((item) =>
        shouldKeepQueuedBlock(
          item.start,
          time,
          request.sceneDuration,
          blockDurationSeconds,
        ),
      );
      let queueChanged = nextQueue.length !== queuedRef.current.length;
      for (let index = blockStarts.length - 1; index >= 0; index -= 1) {
        const blockStart = blockStarts[index];
        if (
          !cachedBlockStartsRef.current.has(blockStart) &&
          !renderingBlockStartsRef.current.has(blockStart) &&
          !queueIncludesStart(nextQueue, blockStart)
        ) {
          nextQueue.unshift({
            start: blockStart,
            durationMs: request.blockDurationMs,
          });
          queueChanged = true;
        }
      }
      queuedRef.current = nextQueue;
      evictMemoryBlocks(cacheRef.current, time);
      if (queueChanged)
        setState((current) => ({ ...current, version: current.version + 1 }));
      void processPrerenderQueue(generation);
      if (reason !== "playback") scheduleIdleExpansion(generation);
    },
    [blockDurationSeconds],
  );

  const prerenderComposition = useCallback(
    (compositionId: string): Promise<PrerenderCompositionResult> => {
      const request = latestRequestRef.current;
      if (!request.hasActiveComposition || request.sceneDuration <= 0)
        return Promise.resolve({
          queuedBlocks: 0,
          visibleRanges: 0,
          completed: false,
        });
      autoPrerenderPausedUntilRef.current =
        Date.now() + manualPrerenderAutoPauseMs;
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      const ranges = getVisibleCompositionRanges(
        request.scene.compositions,
        compositionId,
        request.timelineLayers,
        request.sceneDuration,
      );
      if (ranges.length === 0)
        return Promise.resolve({
          queuedBlocks: 0,
          visibleRanges: 0,
          completed: false,
        });
      const generation = generationRef.current;
      let queuedRanges = 0;
      const manualJobId = nextManualJobIdRef.current++;
      const nextQueue = [...queuedRef.current];
      for (const range of ranges) {
        const frameRange = getFrameRangeForTimeRange(
          range.start,
          range.end,
          request.sceneDuration,
          videoExportFrameRate,
        );
        const rangeStart = frameRange.startFrame / videoExportFrameRate;
        if (
          isExactFrameRangeCached(cacheRef.current, frameRange) ||
          renderingBlockStartsRef.current.has(rangeStart) ||
          queueIncludesFrameRange(nextQueue, frameRange)
        )
          continue;
        nextQueue.push({
          start: rangeStart,
          durationMs:
            ((frameRange.endFrame - frameRange.startFrame) /
              videoExportFrameRate) *
            1000,
          frameRange,
          manualJobId,
        });
        queuedRanges += 1;
      }
      if (queuedRanges === 0)
        return Promise.resolve({
          queuedBlocks: 0,
          visibleRanges: ranges.length,
          completed: true,
        });
      queuedRef.current = nextQueue;
      setState((current) => ({ ...current, version: current.version + 1 }));
      void processPrerenderQueue(generation);
      return new Promise((resolve) => {
        manualJobsRef.current.set(manualJobId, {
          errors: [],
          pending: queuedRanges,
          queuedRanges,
          visibleRanges: ranges.length,
          resolve,
        });
      });
    },
    [blockDurationSeconds],
  );

  useEffect(() => {
    if (!enabled || !hasActiveComposition || sceneDuration <= 0) return;
    requestCacheAtTime(sceneTime, isPlaying ? "playback" : "idle");
  }, [
    blockDurationSeconds,
    enabled,
    hasActiveComposition,
    isPlaying,
    sceneDuration,
    sceneTime,
  ]);

  useEffect(
    () => () => {
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
      resolveManualJobs(manualJobsRef.current, "Prerender was interrupted.");
      closePrerenderCacheBlocks(cacheRef.current);
      decoderRef.current?.destroy();
      decoderRef.current = null;
    },
    [],
  );

  async function processPrerenderQueue(generation: number) {
    if (processingRef.current) return;
    processingRef.current = true;

    while (generation === generationRef.current) {
      const nextItem = queuedRef.current.shift();
      if (!nextItem) break;
      const nextBlockStart = nextItem.start;
      if (
        !nextItem.frameRange &&
        cachedBlockStartsRef.current.has(nextBlockStart)
      )
        continue;
      renderingBlockStartsRef.current.add(nextBlockStart);

      setState((current) => ({ ...current, version: current.version + 1 }));
      const request = latestRequestRef.current;
      try {
        const frames = await withPrerenderTimeout(
          clipperHost.prerenderFrame(
            request.project,
            request.manifestPath,
            request.scene,
            nextBlockStart,
            request.sceneDuration,
            videoExportFrameRate,
            request.tileHeight,
            nextItem.durationMs,
            nextItem.frameRange,
          ),
          nextBlockStart,
        );
        if (generation !== generationRef.current) break;
        if (frames.length === 0)
          throw new Error("Prerendered frame block was empty.");
        const firstFrame = frames[0];
        const frameRate = firstFrame.frameRate;
        const decodedFrames =
          await getPrerenderFrameDecoder(decoderRef).decode(frames);
        if (generation !== generationRef.current) break;
        const bitmapFrames = await createPrerenderFrameBitmaps(
          decodedFrames,
          firstFrame.width,
          firstFrame.height,
        );
        if (generation !== generationRef.current) {
          closePrerenderFrames(bitmapFrames);
          break;
        }
        if (bitmapFrames.length === 0)
          throw new Error(
            "Prerendered frame block decoded to no drawable frames.",
          );
        cacheRef.current.set(nextBlockStart, {
          width: firstFrame.width,
          height: firstFrame.height,
          startTime: nextBlockStart,
          duration: frames.length / frameRate,
          frameRate,
          frames: bitmapFrames,
        });
        cachedBlockStartsRef.current.add(nextBlockStart);
        evictMemoryBlocks(cacheRef.current, request.sceneTime);
        finishManualQueueItem(nextItem);
        setState((current) => ({ version: current.version + 1, error: "" }));
      } catch (error) {
        if (generation !== generationRef.current) break;
        finishManualQueueItem(
          nextItem,
          error instanceof Error ? error.message : String(error),
        );
        setState((current) => ({
          version: current.version + 1,
          error: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        renderingBlockStartsRef.current.delete(nextBlockStart);
      }
    }

    processingRef.current = false;
    setState((current) => ({ ...current, version: current.version + 1 }));

    if (queuedRef.current.length > 0)
      void processPrerenderQueue(generationRef.current);
  }

  function finishManualQueueItem(item: PrerenderQueueItem, error?: string) {
    if (!item.manualJobId) return;
    const job = manualJobsRef.current.get(item.manualJobId);
    if (!job) return;
    if (error) job.errors.push(error);
    job.pending -= 1;
    if (job.pending > 0) return;
    manualJobsRef.current.delete(item.manualJobId);
    job.resolve({
      queuedBlocks: job.queuedRanges,
      visibleRanges: job.visibleRanges,
      completed: job.errors.length === 0,
      error: job.errors[0],
    });
  }

  function scheduleIdleExpansion(generation: number) {
    if (idleTimerRef.current !== null)
      window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (generation !== generationRef.current) return;
      const request = latestRequestRef.current;
      if (Date.now() < autoPrerenderPausedUntilRef.current) return;
      if (
        !request.enabled ||
        !request.hasActiveComposition ||
        request.isPlaying ||
        request.sceneDuration <= 0
      )
        return;
      const nextBlocks = getPrerenderScheduleBlockStarts(
        request.sceneTime,
        request.sceneDuration,
        videoExportFrameRate,
        blockDurationSeconds,
        idleRadiusBlocks,
        "idle",
      ).filter(
        (blockStart) =>
          request.scheduleRanges.length === 0 ||
          blockIntersectsRanges(
            blockStart,
            blockStart + blockDurationSeconds,
            request.scheduleRanges,
          ),
      );
      let changed = false;
      for (const blockStart of nextBlocks) {
        if (
          cachedBlockStartsRef.current.has(blockStart) ||
          renderingBlockStartsRef.current.has(blockStart) ||
          queueIncludesStart(queuedRef.current, blockStart)
        )
          continue;
        queuedRef.current.push({
          start: blockStart,
          durationMs: request.blockDurationMs,
        });
        changed = true;
        break;
      }
      if (!changed) return;
      setState((current) => ({ ...current, version: current.version + 1 }));
      void processPrerenderQueue(generation);
      scheduleIdleExpansion(generation);
    }, idleScheduleDelayMs);
  }

  const coverage = useMemo<PrerenderCacheCoverage>(
    () => ({
      blocks: getCoverageBlocks(
        cachedBlockStartsRef.current,
        renderingBlockStartsRef.current,
        queuedRef.current,
        blockDurationSeconds,
        sceneDuration,
      ),
    }),
    [blockDurationSeconds, sceneDuration, state.version],
  );

  return {
    getBlockAtTime: (time: number) => {
      return getCachedBlockAtTime(
        cacheRef.current,
        time,
        sceneDuration,
        videoExportFrameRate,
        blockDurationSeconds,
      );
    },
    hasFrameAtTime: (time: number) => {
      return Boolean(
        getCachedBlockAtTime(
          cacheRef.current,
          time,
          sceneDuration,
          videoExportFrameRate,
          blockDurationSeconds,
        ),
      );
    },
    requestCacheAtTime,
    prerenderComposition,
    coverage,
    error: state.error,
  };
}

function getVisibleCompositionRanges(
  compositions: CompositionClip[],
  compositionId: string,
  timelineLayers: TimelineLayerState | undefined,
  sceneDuration: number,
) {
  const boundaries = new Set<number>([0, sceneDuration]);
  for (const composition of compositions) {
    const start = Math.max(composition.start ?? 0, 0);
    const end = Math.min(start + composition.duration, sceneDuration);
    if (end <= start) continue;
    boundaries.add(start);
    boundaries.add(end);
  }
  const sorted = [...boundaries].sort((left, right) => left - right);
  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const top = getTopTimelinePartAtTime(
      getCompositionTimelineRanges(compositions),
      start + (end - start) / 2,
      timelineLayers,
    );
    if (!top || !compositionMatchesId(top, compositionId)) continue;
    const last = ranges[ranges.length - 1];
    if (last && Math.abs(last.end - start) < 1e-6) last.end = end;
    else ranges.push({ start, end });
  }
  return ranges;
}

function getCompositionTimelineRanges(compositions: CompositionClip[]) {
  return compositions.map((composition) => {
    const start = composition.start ?? 0;
    return { ...composition, start, end: start + composition.duration };
  });
}

function compositionMatchesId(
  composition: CompositionClip,
  compositionId: string,
) {
  return (
    composition.id === compositionId ||
    composition.compositionId === compositionId ||
    composition.filePath === compositionId ||
    composition.filePath.endsWith(`/${compositionId}`)
  );
}

function getPrerenderScheduleBlockStarts(
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
  blockDurationSeconds: number,
  radiusBlocks: number,
  reason: PrerenderCacheInterestReason,
) {
  const currentBlockStart = getBlockStartTime(
    sceneTime,
    sceneDuration,
    frameRate,
    blockDurationSeconds,
  );
  const offsets = [0];
  for (let offset = 1; offset <= radiusBlocks; offset += 1) {
    if (reason === "playback") offsets.push(offset);
    else offsets.push(offset, -offset);
  }
  return offsets
    .map((offset) =>
      quantizeFrameTime(
        currentBlockStart + offset * blockDurationSeconds,
        frameRate,
        sceneDuration,
      ),
    )
    .map((time) =>
      getBlockStartTime(time, sceneDuration, frameRate, blockDurationSeconds),
    )
    .filter(
      (time, index, times) =>
        time >= 0 && time < sceneDuration && times.indexOf(time) === index,
    );
}

function shouldKeepQueuedBlock(
  blockStart: number,
  sceneTime: number,
  sceneDuration: number,
  blockDurationSeconds: number,
) {
  const maxDistance = blockDurationSeconds * (idleRadiusBlocks + 1);
  return (
    blockStart >= 0 &&
    blockStart < sceneDuration &&
    Math.abs(blockStart - sceneTime) <= maxDistance
  );
}

function blockIntersectsRanges(
  start: number,
  end: number,
  ranges: PrerenderManualCompositionRange[],
) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function getBlockStartTime(
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
  blockDurationSeconds: number,
) {
  const frameIndex = getFrameIndexAtTime(sceneTime, sceneDuration, frameRate);
  const framesPerBlock = Math.max(
    1,
    Math.round(blockDurationSeconds * frameRate),
  );
  return (Math.floor(frameIndex / framesPerBlock) * framesPerBlock) / frameRate;
}

function getCachedBlockAtTime(
  cache: Map<number, PrerenderCacheBlock>,
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
  blockDurationSeconds: number,
) {
  const frameIndex = getFrameIndexAtTime(sceneTime, sceneDuration, frameRate);
  const framesPerBlock = Math.max(
    1,
    Math.round(blockDurationSeconds * frameRate),
  );
  const primaryStart =
    (Math.floor(frameIndex / framesPerBlock) * framesPerBlock) / frameRate;
  const candidateStarts = [
    primaryStart,
    primaryStart - framesPerBlock / frameRate,
    primaryStart + framesPerBlock / frameRate,
  ];
  for (const start of candidateStarts) {
    const block = cache.get(quantizeFrameTime(start, frameRate, sceneDuration));
    if (block && getBlockFrameIndex(block, frameIndex) !== null) return block;
  }
  return null;
}

function getBlockFrameIndex(
  block: PrerenderCacheBlock,
  sceneFrameIndex: number,
) {
  const blockStartFrameIndex = Math.round(block.startTime * block.frameRate);
  const localFrameIndex = sceneFrameIndex - blockStartFrameIndex;
  return localFrameIndex >= 0 && localFrameIndex < block.frames.length
    ? localFrameIndex
    : null;
}

function getFrameIndexAtTime(
  sceneTime: number,
  sceneDuration: number,
  frameRate: number,
) {
  return Math.min(
    Math.max(Math.round(sceneTime * frameRate), 0),
    Math.max(Math.ceil(sceneDuration * frameRate) - 1, 0),
  );
}

function getCoverageBlocks(
  cachedBlocks: Set<number>,
  renderingBlocks: Set<number>,
  queuedBlocks: PrerenderQueueItem[],
  blockDurationSeconds: number,
  sceneDuration: number,
): PrerenderCacheCoverage["blocks"] {
  const queuedByStart = new Map(queuedBlocks.map((item) => [item.start, item]));
  const starts = [
    ...new Set([...cachedBlocks, ...renderingBlocks, ...queuedByStart.keys()]),
  ].sort((left, right) => left - right);
  return starts
    .map((start) => {
      const queuedItem = queuedByStart.get(start);
      return {
        start,
        duration: Math.min(
          queuedItem ? queuedItem.durationMs / 1000 : blockDurationSeconds,
          Math.max(sceneDuration - start, 0),
        ),
        state: cachedBlocks.has(start)
          ? ("cached" as const)
          : renderingBlocks.has(start)
            ? ("queued" as const)
            : ("enqueued" as const),
      };
    })
    .filter((block) => block.duration > 0);
}

function getFrameRangeForTimeRange(
  start: number,
  end: number,
  sceneDuration: number,
  frameRate: number,
) {
  const totalFrames = Math.max(1, Math.ceil(sceneDuration * frameRate));
  const startFrame = Math.min(
    Math.max(Math.ceil(start * frameRate), 0),
    totalFrames - 1,
  );
  const endFrame = Math.min(
    Math.max(Math.ceil(end * frameRate), startFrame + 1),
    totalFrames,
  );
  return { startFrame, endFrame };
}

function isExactFrameRangeCached(
  cache: Map<number, PrerenderCacheBlock>,
  frameRange: { startFrame: number; endFrame: number },
) {
  for (
    let frameIndex = frameRange.startFrame;
    frameIndex < frameRange.endFrame;
    frameIndex += 1
  ) {
    let hasFrame = false;
    for (const block of cache.values()) {
      if (getBlockFrameIndex(block, frameIndex) !== null) {
        hasFrame = true;
        break;
      }
    }
    if (!hasFrame) return false;
  }
  return true;
}

function queueIncludesStart(queue: PrerenderQueueItem[], start: number) {
  return queue.some((item) => item.start === start);
}

function queueIncludesFrameRange(
  queue: PrerenderQueueItem[],
  frameRange: { startFrame: number; endFrame: number },
) {
  return queue.some(
    (item) =>
      item.frameRange?.startFrame === frameRange.startFrame &&
      item.frameRange.endFrame === frameRange.endFrame,
  );
}

function resolveManualJobs(
  jobs: Map<number, ManualPrerenderJob>,
  error: string,
) {
  for (const job of jobs.values()) {
    job.resolve({
      queuedBlocks: job.queuedRanges,
      visibleRanges: job.visibleRanges,
      completed: false,
      error,
    });
  }
  jobs.clear();
}

type PrerenderCacheSignature = ReturnType<typeof getPrerenderCacheSignature>;
type PrerenderInvalidationRange = { start: number; end: number };
const prerenderDecodedFrameFormat =
  "rgba-straight-worker-binary-fullframe-image-bitmap-srgb-v7";

function getPrerenderCacheSignature(project: ProjectManifest, scene: Scene) {
  return {
    global: {
      projectId: project.id,
      sceneId: scene.id,
      compositions: scene.compositions.map((part) => ({
        id: part.id,
        filePath: part.filePath,
        compositionError: part.compositionError,
        sourceMissing: part.sourceMissing,
        start: part.start,
        layerId: part.layerId,
        duration: part.duration,
        frame: part.frame,
        background: part.background,
        objects: part.objects,
        snapshot: part.snapshot,
        motionMarkers: part.motionMarkers,
      })),
      motionMarkers: scene.motionMarkers ?? [],
    },
    ranged: {
      adjustmentLayers: scene.adjustmentLayers ?? [],
      transitionLayers: scene.transitionLayers ?? [],
    },
  };
}

export function getPrerenderInvalidationRanges(
  previous: PrerenderCacheSignature,
  next: PrerenderCacheSignature,
  sceneDuration: number,
  blockDurationSeconds: number,
): PrerenderInvalidationRange[] {
  if (JSON.stringify(previous.global) !== JSON.stringify(next.global))
    return [{ start: 0, end: sceneDuration }];
  const ranges = [
    ...getChangedLayerRanges(
      previous.ranged.adjustmentLayers,
      next.ranged.adjustmentLayers,
      sceneDuration,
      (layer) =>
        getAdjustmentEffectPackage(layer.effect.effectId)?.timeSensitive ===
        true,
    ),
    ...getChangedLayerRanges(
      previous.ranged.transitionLayers,
      next.ranged.transitionLayers,
      sceneDuration,
      () => false,
    ),
  ];
  return mergeInvalidationRanges(
    ranges.map((range) => ({
      start: getBlockStartTime(
        range.start,
        sceneDuration,
        videoExportFrameRate,
        blockDurationSeconds,
      ),
      end: Math.min(
        Math.ceil(range.end / blockDurationSeconds) * blockDurationSeconds,
        sceneDuration,
      ),
    })),
    sceneDuration,
  );
}

function getChangedLayerRanges<T extends AdjustmentLayer | TransitionLayer>(
  previousLayers: T[],
  nextLayers: T[],
  sceneDuration: number,
  invalidatesForward: (layer: T) => boolean,
) {
  const previousById = new Map(
    previousLayers.map((layer) => [layer.id, layer]),
  );
  const nextById = new Map(nextLayers.map((layer) => [layer.id, layer]));
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);
  const ranges: PrerenderInvalidationRange[] = [];
  for (const id of ids) {
    const previous = previousById.get(id);
    const next = nextById.get(id);
    if (JSON.stringify(previous ?? null) === JSON.stringify(next ?? null))
      continue;
    const candidates = [previous, next].filter((layer): layer is T =>
      Boolean(layer),
    );
    const start = Math.min(
      ...candidates.map((layer) => Math.max(0, layer.start)),
    );
    const end = candidates.some(invalidatesForward)
      ? sceneDuration
      : Math.max(
          ...candidates.map((layer) =>
            Math.min(sceneDuration, layer.start + layer.duration),
          ),
        );
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

function mergeInvalidationRanges(
  ranges: PrerenderInvalidationRange[],
  sceneDuration: number,
) {
  const sorted = ranges
    .map((range) => ({
      start: Math.max(0, range.start),
      end: Math.min(sceneDuration, range.end),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);
  const merged: PrerenderInvalidationRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

function evictChangedRanges(
  cache: Map<number, PrerenderCacheBlock>,
  cachedBlocks: Set<number>,
  invalidRanges: PrerenderInvalidationRange[],
) {
  if (invalidRanges.length === 0) return;
  for (const [start, block] of cache) {
    if (
      !rangesOverlap(
        block.startTime,
        block.startTime + block.duration,
        invalidRanges,
      )
    )
      continue;
    closePrerenderBlock(block);
    cache.delete(start);
    cachedBlocks.delete(start);
  }
}

function rangesOverlap(
  start: number,
  end: number,
  ranges: PrerenderInvalidationRange[],
) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function clampBlockDurationMs(value: number) {
  if (!Number.isFinite(value)) return defaultPrerenderBlockDurationMs;
  return Math.min(
    Math.max(Math.round(value), minPrerenderBlockDurationMs),
    maxPrerenderBlockDurationMs,
  );
}

function quantizeFrameTime(
  time: number,
  frameRate: number,
  sceneDuration: number,
) {
  return Math.min(
    Math.max(Math.round(time * frameRate) / frameRate, 0),
    sceneDuration,
  );
}

function evictMemoryBlocks(
  cache: Map<number, PrerenderCacheBlock>,
  sceneTime: number,
) {
  if (cache.size <= maxMemoryBlocks) return;
  const keepTimes = new Set(
    [...cache.entries()]
      .sort(
        ([leftTime], [rightTime]) =>
          Math.abs(leftTime - sceneTime) - Math.abs(rightTime - sceneTime),
      )
      .slice(0, maxMemoryBlocks)
      .map(([time]) => time),
  );
  for (const [time, block] of cache) {
    if (!keepTimes.has(time)) closePrerenderBlock(block);
  }
  const keep = [...cache.entries()]
    .sort(
      ([leftTime], [rightTime]) =>
        Math.abs(leftTime - sceneTime) - Math.abs(rightTime - sceneTime),
    )
    .slice(0, maxMemoryBlocks);
  cache.clear();
  for (const [time, block] of keep) cache.set(time, block);
}

async function createPrerenderFrameBitmaps(
  frames: DecodedPrerenderFrame[],
  width: number,
  height: number,
): Promise<PrerenderCacheFrame[]> {
  return Promise.all(
    frames.map(async (frame) => {
      const imageData = new ImageData(frame.bytes, width, height, {
        colorSpace: "srgb",
      });
      const bitmap = await createImageBitmap(imageData);
      return { sceneTime: frame.sceneTime, bitmap };
    }),
  );
}

function closePrerenderCacheBlocks(cache: Map<number, PrerenderCacheBlock>) {
  for (const block of cache.values()) closePrerenderBlock(block);
  cache.clear();
}

function closePrerenderBlock(block: PrerenderCacheBlock) {
  closePrerenderFrames(block.frames);
}

function closePrerenderFrames(frames: PrerenderCacheFrame[]) {
  for (const frame of frames) frame.bitmap.close();
}

function withPrerenderTimeout<T>(promise: Promise<T>, sceneTime: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () =>
        reject(
          new Error(
            `Prerender IPC timed out after ${prerenderTimeoutMs}ms at ${sceneTime.toFixed(3)}s.`,
          ),
        ),
      prerenderTimeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

class PrerenderFrameDecoder {
  private nextRequestId = 1;
  private worker = new Worker(
    new URL("./prerenderFrameDecoder.worker.ts", import.meta.url),
    { type: "module" },
  );
  private pending = new Map<
    number,
    {
      resolve: (frames: DecodedPrerenderFrame[]) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<PrerenderFrameDecodeResponse>,
    ) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      pending.resolve(
        event.data.frames.map((frame) => ({
          sceneTime: frame.sceneTime,
          bytes: new Uint8ClampedArray(frame.data),
        })),
      );
    };
    this.worker.onerror = (event) => {
      const error = new Error(
        event.message || "Prerender frame decoder worker failed.",
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  decode(frames: Array<{ sceneTime: number; data: Uint8Array }>) {
    const id = this.nextRequestId++;
    const payloadFrames = frames.map((frame) => ({
      sceneTime: frame.sceneTime,
      data: toTransferableArrayBuffer(frame.data),
    }));
    const transfer = payloadFrames.map((frame) => frame.data);
    return new Promise<DecodedPrerenderFrame[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(
        { id, frames: payloadFrames } satisfies PrerenderFrameDecodeRequest,
        transfer,
      );
    });
  }

  destroy() {
    this.worker.terminate();
    for (const pending of this.pending.values())
      pending.reject(
        new Error("Prerender frame decoder worker was destroyed."),
      );
    this.pending.clear();
  }
}

function getPrerenderFrameDecoder(ref: {
  current: PrerenderFrameDecoder | null;
}) {
  ref.current ??= new PrerenderFrameDecoder();
  return ref.current;
}

function toTransferableArrayBuffer(bytes: Uint8Array) {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength)
    return bytes.buffer as ArrayBuffer;
  return bytes.slice().buffer as ArrayBuffer;
}
