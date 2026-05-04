import { useEffect, useMemo, useRef, useState } from "react";
import { defaultPrerenderBlockDurationMs, maxPrerenderBlockDurationMs, minPrerenderBlockDurationMs, videoExportFrameRate } from "../../config";
import { clipperHost } from "../../clipperHost";
import type { ProjectManifest, Scene } from "../../../core/types";

export type PrerenderCacheBlock = {
  width: number;
  height: number;
  mimeType: string;
  startTime: number;
  duration: number;
  frameRate: number;
  bytes: Uint8Array;
  url: string;
};

export type PrerenderCacheCoverage = {
  blocks: Array<{ start: number; duration: number; state: "enqueued" | "queued" | "cached" }>;
};

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
    revokeCachedBlocks(cacheRef.current);
    cacheRef.current.clear();
    queuedRef.current = [];
    renderingBlockStartsRef.current.clear();
    cachedBlockStartsRef.current.clear();
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    setState((current) => ({ version: current.version + 1, error: "" }));
  }, [enabled, hasActiveComposition, cacheKey, tileHeight, blockDurationMs, cacheResetToken]);

  useEffect(() => () => {
    revokeCachedBlocks(cacheRef.current);
  }, []);

  useEffect(() => {
    if (!enabled || !hasActiveComposition || sceneDuration <= 0) return;
    const generation = generationRef.current;
    if (isPlaying) return;
    const blockStarts = getPrerenderScheduleBlockStarts(sceneTime, sceneDuration, videoExportFrameRate, blockDurationSeconds, isPlaying ? activeRadiusBlocks : 2);
    const nextQueue = queuedRef.current.filter((blockStart) => shouldKeepQueuedBlock(blockStart, sceneTime, sceneDuration, blockDurationSeconds));
    let queueChanged = nextQueue.length !== queuedRef.current.length;
    for (const blockStart of blockStarts) {
      if (!cachedBlockStartsRef.current.has(blockStart) && !renderingBlockStartsRef.current.has(blockStart) && !nextQueue.includes(blockStart)) {
        nextQueue.push(blockStart);
        queueChanged = true;
      }
    }
    queuedRef.current = nextQueue;
    evictMemoryBlocks(cacheRef.current, sceneTime);
    if (queueChanged) setState((current) => ({ ...current, version: current.version + 1 }));
    void processPrerenderQueue(generation);
    if (!isPlaying) scheduleIdleExpansion(generation);
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
      if (request.isPlaying) {
        renderingBlockStartsRef.current.delete(nextBlockStart);
        continue;
      }
      try {
        const videoBlock = await withPrerenderTimeout(clipperHost.prerenderVideoBlock(request.project, request.manifestPath, request.scene, nextBlockStart, request.sceneDuration, videoExportFrameRate, request.tileHeight, request.blockDurationMs), nextBlockStart);
        if (generation !== generationRef.current) break;
        if (latestRequestRef.current.isPlaying) continue;
        if (videoBlock.duration <= 0 || !videoBlock.data) throw new Error("Prerendered video block was empty.");
        cachedBlockStartsRef.current.add(nextBlockStart);
        const previousBlock = cacheRef.current.get(videoBlock.startTime);
        if (previousBlock) URL.revokeObjectURL(previousBlock.url);
        const bytes = base64ToUint8Array(videoBlock.data);
        cacheRef.current.set(videoBlock.startTime, {
          width: videoBlock.width,
          height: videoBlock.height,
          mimeType: videoBlock.mimeType,
          startTime: videoBlock.startTime,
          duration: videoBlock.duration,
          frameRate: videoBlock.frameRate,
          bytes,
          url: URL.createObjectURL(new Blob([bytes], { type: videoBlock.mimeType })),
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
      const nextBlocks = getPrerenderScheduleBlockStarts(request.sceneTime, request.sceneDuration, videoExportFrameRate, blockDurationSeconds, idleRadiusBlocks);
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
      const nextBlockStart = getBlockStartTime(time, sceneDuration, videoExportFrameRate, blockDurationSeconds);
      const block = cacheRef.current.get(nextBlockStart);
      return block && time >= block.startTime && time < block.startTime + block.duration + 1 / videoExportFrameRate ? block : null;
    },
    hasFrameAtTime: (time: number) => {
      const nextBlockStart = getBlockStartTime(time, sceneDuration, videoExportFrameRate, blockDurationSeconds);
      const block = cacheRef.current.get(nextBlockStart);
      return Boolean(block && time >= block.startTime && time < block.startTime + block.duration + 1 / videoExportFrameRate);
    },
    coverage,
    error: state.error,
  };
}

function getPrerenderScheduleBlockStarts(sceneTime: number, sceneDuration: number, frameRate: number, blockDurationSeconds: number, radiusBlocks: number) {
  const currentBlockStart = getBlockStartTime(sceneTime, sceneDuration, frameRate, blockDurationSeconds);
  const offsets = [0];
  for (let offset = 1; offset <= radiusBlocks; offset += 1) offsets.push(offset, -offset);
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
  const frameIndex = Math.min(Math.max(Math.round(sceneTime * frameRate), 0), Math.max(Math.ceil(sceneDuration * frameRate) - 1, 0));
  const framesPerBlock = Math.max(1, Math.round(blockDurationSeconds * frameRate));
  return Math.floor(frameIndex / framesPerBlock) * framesPerBlock / frameRate;
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
  const keepTimes = new Set(keep.map(([time]) => time));
  for (const [time, block] of cache) {
    if (!keepTimes.has(time)) URL.revokeObjectURL(block.url);
  }
  cache.clear();
  for (const [time, block] of keep) cache.set(time, block);
}

function revokeCachedBlocks(cache: Map<number, PrerenderCacheBlock>) {
  for (const block of cache.values()) URL.revokeObjectURL(block.url);
}

function getPrerenderCacheKey(project: ProjectManifest, scene: Scene, blockDurationMs: number) {
  return JSON.stringify({
    projectId: project.id,
    sceneId: scene.id,
    blockDurationMs,
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

function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
