import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultPrerenderBlockDurationMs, maxPrerenderBlockDurationMs, minPrerenderBlockDurationMs, videoExportFrameRate } from "../../config";
import { clipperHost } from "../../clipperHost";
import type { ProjectManifest, Scene } from "../../../core/types";

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
  bytes: Uint8ClampedArray;
};

export type PrerenderCacheCoverage = {
  blocks: Array<{ start: number; duration: number; state: "enqueued" | "queued" | "cached" }>;
};

export type PrerenderCacheInterestReason = "scrub" | "playback" | "idle";

const maxMemoryBlocks = 64;
const prerenderTimeoutMs = 30000;
const idleScheduleDelayMs = 120;
const activeRadiusBlocks = 1;
const idleRadiusBlocks = 24;

export function usePrerenderCache({ blockDurationMs, cacheResetToken, enabled, hasActiveComposition, isPlaying, manifestPath, project, scene, sceneDuration, sceneTime, tileHeight }: { blockDurationMs: number; cacheResetToken: number; enabled: boolean; hasActiveComposition: boolean; isPlaying: boolean; manifestPath: string; project: ProjectManifest; scene: Scene; sceneDuration: number; sceneTime: number; tileHeight: number }) {
  const cacheRef = useRef(new Map<number, PrerenderCacheBlock>());
  const queuedRef = useRef<number[]>([]);
  const renderingBlockStartsRef = useRef(new Set<number>());
  const cachedBlockStartsRef = useRef(new Set<number>());
  const processingRef = useRef(false);
  const generationRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const blockDurationSeconds = clampBlockDurationMs(blockDurationMs) / 1000;
  const latestRequestRef = useRef({ project, manifestPath, scene, sceneTime, sceneDuration, enabled, hasActiveComposition, isPlaying, tileHeight, blockDurationMs });
  const [state, setState] = useState({ version: 0, error: "" });
  const cacheKey = getPrerenderCacheKey(project, scene, blockDurationMs);

  latestRequestRef.current = { project, manifestPath, scene, sceneTime, sceneDuration, enabled, hasActiveComposition, isPlaying, tileHeight, blockDurationMs };

  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current.clear();
    queuedRef.current = [];
    renderingBlockStartsRef.current.clear();
    cachedBlockStartsRef.current.clear();
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    setState((current) => ({ version: current.version + 1, error: "" }));
  }, [enabled, hasActiveComposition, cacheKey, tileHeight, blockDurationMs, cacheResetToken]);

  const requestCacheAtTime = useCallback((time: number, reason: PrerenderCacheInterestReason = "idle") => {
    const request = latestRequestRef.current;
    if (!request.enabled || !request.hasActiveComposition || request.sceneDuration <= 0) return;
    const generation = generationRef.current;
    const radiusBlocks = reason === "playback" ? activeRadiusBlocks : reason === "scrub" ? 1 : 2;
    const blockStarts = getPrerenderScheduleBlockStarts(time, request.sceneDuration, videoExportFrameRate, blockDurationSeconds, radiusBlocks, reason);
    const nextQueue = queuedRef.current.filter((blockStart) => shouldKeepQueuedBlock(blockStart, time, request.sceneDuration, blockDurationSeconds));
    let queueChanged = nextQueue.length !== queuedRef.current.length;
    for (let index = blockStarts.length - 1; index >= 0; index -= 1) {
      const blockStart = blockStarts[index];
      if (!cachedBlockStartsRef.current.has(blockStart) && !renderingBlockStartsRef.current.has(blockStart) && !nextQueue.includes(blockStart)) {
        nextQueue.unshift(blockStart);
        queueChanged = true;
      }
    }
    queuedRef.current = nextQueue;
    evictMemoryBlocks(cacheRef.current, time);
    if (queueChanged) setState((current) => ({ ...current, version: current.version + 1 }));
    void processPrerenderQueue(generation);
    if (reason !== "playback") scheduleIdleExpansion(generation);
  }, [blockDurationSeconds]);

  useEffect(() => {
    if (!enabled || !hasActiveComposition || sceneDuration <= 0) return;
    requestCacheAtTime(sceneTime, isPlaying ? "playback" : "idle");
  }, [blockDurationSeconds, enabled, hasActiveComposition, isPlaying, sceneDuration, sceneTime]);

  useEffect(() => () => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
  }, []);

  async function processPrerenderQueue(generation: number) {
    if (processingRef.current) return;
    processingRef.current = true;

    while (generation === generationRef.current) {
      const nextBlockStart = queuedRef.current.shift();
      if (nextBlockStart === undefined) break;
      if (cachedBlockStartsRef.current.has(nextBlockStart)) continue;
      renderingBlockStartsRef.current.add(nextBlockStart);

      setState((current) => ({ ...current, version: current.version + 1 }));
      const request = latestRequestRef.current;
      try {
        const frames = await withPrerenderTimeout(clipperHost.prerenderFrame(request.project, request.manifestPath, request.scene, nextBlockStart, request.sceneDuration, videoExportFrameRate, request.tileHeight, request.blockDurationMs), nextBlockStart);
        if (generation !== generationRef.current) break;
        if (frames.length === 0) throw new Error("Prerendered frame block was empty.");
        cachedBlockStartsRef.current.add(nextBlockStart);
        const firstFrame = frames[0];
        const frameRate = firstFrame.frameRate;
        cacheRef.current.set(nextBlockStart, {
          width: firstFrame.width,
          height: firstFrame.height,
          startTime: nextBlockStart,
          duration: frames.length / frameRate,
          frameRate,
          frames: frames.map((frame) => ({ sceneTime: frame.sceneTime, bytes: bgraBase64ToRgbaClamped(frame.data) })),
        });
        evictMemoryBlocks(cacheRef.current, request.sceneTime);
        setState((current) => ({ version: current.version + 1, error: "" }));
      } catch (error) {
        if (generation !== generationRef.current) break;
        setState((current) => ({ version: current.version + 1, error: error instanceof Error ? error.message : String(error) }));
      } finally {
        renderingBlockStartsRef.current.delete(nextBlockStart);
      }
    }

    processingRef.current = false;
    setState((current) => ({ ...current, version: current.version + 1 }));

    if (queuedRef.current.length > 0) void processPrerenderQueue(generationRef.current);
  }

  function scheduleIdleExpansion(generation: number) {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (generation !== generationRef.current) return;
      const request = latestRequestRef.current;
      if (!request.enabled || !request.hasActiveComposition || request.isPlaying || request.sceneDuration <= 0) return;
      const nextBlocks = getPrerenderScheduleBlockStarts(request.sceneTime, request.sceneDuration, videoExportFrameRate, blockDurationSeconds, idleRadiusBlocks, "idle");
      let changed = false;
      for (const blockStart of nextBlocks) {
        if (cachedBlockStartsRef.current.has(blockStart) || renderingBlockStartsRef.current.has(blockStart) || queuedRef.current.includes(blockStart)) continue;
        queuedRef.current.push(blockStart);
        changed = true;
        break;
      }
      if (!changed) return;
      setState((current) => ({ ...current, version: current.version + 1 }));
      void processPrerenderQueue(generation);
      scheduleIdleExpansion(generation);
    }, idleScheduleDelayMs);
  }

  const blockStart = getBlockStartTime(sceneTime, sceneDuration, videoExportFrameRate, blockDurationSeconds);
  const coverage = useMemo<PrerenderCacheCoverage>(() => ({
    blocks: getCoverageBlocks(cachedBlockStartsRef.current, renderingBlockStartsRef.current, queuedRef.current, blockDurationSeconds, sceneDuration),
  }), [blockDurationSeconds, sceneDuration, state.version]);

  return {
    block: cacheRef.current.get(blockStart) ?? null,
    getBlockAtTime: (time: number) => {
      return getCachedBlockAtTime(cacheRef.current, time, sceneDuration, videoExportFrameRate, blockDurationSeconds);
    },
    hasFrameAtTime: (time: number) => {
      return Boolean(getCachedBlockAtTime(cacheRef.current, time, sceneDuration, videoExportFrameRate, blockDurationSeconds));
    },
    requestCacheAtTime,
    coverage,
    error: state.error,
  };
}

function getPrerenderScheduleBlockStarts(sceneTime: number, sceneDuration: number, frameRate: number, blockDurationSeconds: number, radiusBlocks: number, reason: PrerenderCacheInterestReason) {
  const currentBlockStart = getBlockStartTime(sceneTime, sceneDuration, frameRate, blockDurationSeconds);
  const offsets = [0];
  for (let offset = 1; offset <= radiusBlocks; offset += 1) {
    if (reason === "playback") offsets.push(offset);
    else offsets.push(offset, -offset);
  }
  return offsets
    .map((offset) => quantizeFrameTime(currentBlockStart + offset * blockDurationSeconds, frameRate, sceneDuration))
    .map((time) => getBlockStartTime(time, sceneDuration, frameRate, blockDurationSeconds))
    .filter((time, index, times) => time >= 0 && time < sceneDuration && times.indexOf(time) === index);
}

function shouldKeepQueuedBlock(blockStart: number, sceneTime: number, sceneDuration: number, blockDurationSeconds: number) {
  const maxDistance = blockDurationSeconds * (idleRadiusBlocks + 1);
  return blockStart >= 0 && blockStart < sceneDuration && Math.abs(blockStart - sceneTime) <= maxDistance;
}

function getBlockStartTime(sceneTime: number, sceneDuration: number, frameRate: number, blockDurationSeconds: number) {
  const frameIndex = getFrameIndexAtTime(sceneTime, sceneDuration, frameRate);
  const framesPerBlock = Math.max(1, Math.round(blockDurationSeconds * frameRate));
  return Math.floor(frameIndex / framesPerBlock) * framesPerBlock / frameRate;
}

function getCachedBlockAtTime(cache: Map<number, PrerenderCacheBlock>, sceneTime: number, sceneDuration: number, frameRate: number, blockDurationSeconds: number) {
  const frameIndex = getFrameIndexAtTime(sceneTime, sceneDuration, frameRate);
  const framesPerBlock = Math.max(1, Math.round(blockDurationSeconds * frameRate));
  const primaryStart = Math.floor(frameIndex / framesPerBlock) * framesPerBlock / frameRate;
  const candidateStarts = [primaryStart, primaryStart - framesPerBlock / frameRate, primaryStart + framesPerBlock / frameRate];
  for (const start of candidateStarts) {
    const block = cache.get(quantizeFrameTime(start, frameRate, sceneDuration));
    if (block && getBlockFrameIndex(block, frameIndex) !== null) return block;
  }
  return null;
}

function getBlockFrameIndex(block: PrerenderCacheBlock, sceneFrameIndex: number) {
  const blockStartFrameIndex = Math.round(block.startTime * block.frameRate);
  const localFrameIndex = sceneFrameIndex - blockStartFrameIndex;
  return localFrameIndex >= 0 && localFrameIndex < block.frames.length ? localFrameIndex : null;
}

function getFrameIndexAtTime(sceneTime: number, sceneDuration: number, frameRate: number) {
  return Math.min(Math.max(Math.round(sceneTime * frameRate), 0), Math.max(Math.ceil(sceneDuration * frameRate) - 1, 0));
}

function getCoverageBlocks(cachedBlocks: Set<number>, renderingBlocks: Set<number>, queuedBlocks: number[], blockDurationSeconds: number, sceneDuration: number): PrerenderCacheCoverage["blocks"] {
  const queuedSet = new Set(queuedBlocks);
  const starts = [...new Set([...cachedBlocks, ...renderingBlocks, ...queuedSet])].sort((left, right) => left - right);
  return starts.map((start) => ({
    start,
    duration: Math.min(blockDurationSeconds, Math.max(sceneDuration - start, 0)),
    state: cachedBlocks.has(start) ? "cached" as const : renderingBlocks.has(start) ? "queued" as const : "enqueued" as const,
  })).filter((block) => block.duration > 0);
}

function clampBlockDurationMs(value: number) {
  if (!Number.isFinite(value)) return defaultPrerenderBlockDurationMs;
  return Math.min(Math.max(Math.round(value), minPrerenderBlockDurationMs), maxPrerenderBlockDurationMs);
}

function quantizeFrameTime(time: number, frameRate: number, sceneDuration: number) {
  return Math.min(Math.max(Math.round(time * frameRate) / frameRate, 0), sceneDuration);
}

function evictMemoryBlocks(cache: Map<number, PrerenderCacheBlock>, sceneTime: number) {
  if (cache.size <= maxMemoryBlocks) return;
  const keep = [...cache.entries()]
    .sort(([leftTime], [rightTime]) => Math.abs(leftTime - sceneTime) - Math.abs(rightTime - sceneTime))
    .slice(0, maxMemoryBlocks);
  cache.clear();
  for (const [time, block] of keep) cache.set(time, block);
}

function getPrerenderCacheKey(project: ProjectManifest, scene: Scene, blockDurationMs: number) {
  return JSON.stringify({
    projectId: project.id,
    sceneId: scene.id,
    blockDurationMs,
    decodedFrameFormat: "rgba-straight-opaque-aware-v3",
    compositions: scene.compositions.map((part) => ({
      id: part.id,
      filePath: part.filePath,
      source: part.source,
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
    adjustmentLayers: scene.adjustmentLayers ?? [],
    motionMarkers: scene.motionMarkers ?? [],
    transitionLayers: scene.transitionLayers ?? [],
  });
}

function bgraBase64ToRgbaClamped(value: string) {
  const binary = atob(value);
  const bytes = new Uint8ClampedArray(binary.length);
  let hasTransparency = false;
  for (let index = 3; index < binary.length; index += 4) {
    if (binary.charCodeAt(index) !== 255) {
      hasTransparency = true;
      break;
    }
  }
  for (let index = 0; index < binary.length; index += 4) {
    const alpha = binary.charCodeAt(index + 3);
    bytes[index] = hasTransparency ? unpremultiplyColorChannel(binary.charCodeAt(index + 2), alpha) : binary.charCodeAt(index + 2);
    bytes[index + 1] = hasTransparency ? unpremultiplyColorChannel(binary.charCodeAt(index + 1), alpha) : binary.charCodeAt(index + 1);
    bytes[index + 2] = hasTransparency ? unpremultiplyColorChannel(binary.charCodeAt(index), alpha) : binary.charCodeAt(index);
    bytes[index + 3] = alpha;
  }
  return bytes;
}

function unpremultiplyColorChannel(value: number, alpha: number) {
  if (alpha === 0 || alpha === 255) return value;
  return Math.min(Math.round(value * 255 / alpha), 255);
}

function withPrerenderTimeout<T>(promise: Promise<T>, sceneTime: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(`Prerender IPC timed out after ${prerenderTimeoutMs}ms at ${sceneTime.toFixed(3)}s.`)), prerenderTimeoutMs);
    promise.then((value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}
