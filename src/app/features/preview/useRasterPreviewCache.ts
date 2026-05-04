import { useEffect, useMemo, useRef, useState } from "react";
import { videoExportFrameRate } from "../../config";
import { clipperHost } from "../../clipperHost";
import type { ProjectManifest, Scene } from "../../../core/types";

export type RasterPreviewFrame = {
  width: number;
  height: number;
  sceneTime: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
};

export type RasterPreviewCoverage = {
  cachedTimes: number[];
  queuedTimes: number[];
};

const maxCachedFrames = 24;
const rasterTimeoutMs = 12000;
const frameWindow = 1;

export function useRasterPreviewCache({ enabled, hasActiveComposition, isPlaying, project, scene, sceneDuration, sceneTime }: { enabled: boolean; hasActiveComposition: boolean; isPlaying: boolean; project: ProjectManifest; scene: Scene; sceneDuration: number; sceneTime: number }) {
  const cacheRef = useRef(new Map<number, RasterPreviewFrame>());
  const queuedRef = useRef<number[]>([]);
  const processingRef = useRef(false);
  const generationRef = useRef(0);
  const latestRequestRef = useRef({ project, scene, sceneTime, sceneDuration, enabled, hasActiveComposition, isPlaying });
  const [state, setState] = useState({ version: 0, error: "" });
  const cacheKey = getRasterCacheKey(project, scene);

  latestRequestRef.current = { project, scene, sceneTime, sceneDuration, enabled, hasActiveComposition, isPlaying };

  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current.clear();
    queuedRef.current = [];
    setState((current) => ({ version: current.version + 1, error: "" }));
  }, [enabled, hasActiveComposition, cacheKey]);

  useEffect(() => {
    if (!enabled || !hasActiveComposition || sceneDuration <= 0) return;
    const generation = generationRef.current;
    const times = getRasterScheduleTimes(sceneTime, sceneDuration, videoExportFrameRate, isPlaying);
    const nextQueue = queuedRef.current.filter((time) => shouldKeepQueuedTime(time, sceneTime, sceneDuration, videoExportFrameRate));
    for (const time of times) {
      if (!cacheRef.current.has(time) && !nextQueue.includes(time)) nextQueue.push(time);
    }
    queuedRef.current = nextQueue;
    evictCachedFrames(cacheRef.current, sceneTime);
    setState((current) => ({ ...current, version: current.version + 1 }));
    void processRasterQueue(generation);
  }, [enabled, hasActiveComposition, isPlaying, sceneDuration, sceneTime]);

  async function processRasterQueue(generation: number) {
    if (processingRef.current) return;
    processingRef.current = true;

    while (generation === generationRef.current) {
      const nextTime = queuedRef.current.shift();
      if (nextTime === undefined) break;
      if (cacheRef.current.has(nextTime)) continue;

      setState((current) => ({ ...current, version: current.version + 1 }));
      const request = latestRequestRef.current;
      try {
        const frame = await withRasterTimeout(clipperHost.rasterizePreviewFrame(request.project, request.scene, nextTime, videoExportFrameRate), nextTime);
        if (generation !== generationRef.current) break;
        const bgra = base64ToUint8Array(frame.data);
        if (isVisuallyBlankBgraFrame(bgra)) throw new Error("Rasterized frame was blank.");
        cacheRef.current.set(nextTime, {
          width: frame.width,
          height: frame.height,
          sceneTime: frame.sceneTime,
          rgba: bgraToRgba(bgra),
        });
        evictCachedFrames(cacheRef.current, request.sceneTime);
        setState((current) => ({ version: current.version + 1, error: "" }));
      } catch (error) {
        if (generation !== generationRef.current) break;
        setState((current) => ({ version: current.version + 1, error: error instanceof Error ? error.message : String(error) }));
      }
    }

    processingRef.current = false;
    setState((current) => ({ ...current, version: current.version + 1 }));

    if (queuedRef.current.length > 0) void processRasterQueue(generationRef.current);
  }

  const frameTime = quantizeFrameTime(sceneTime, videoExportFrameRate, sceneDuration);
  const fallbackFrame = findNearestCachedFrame(cacheRef.current, frameTime, videoExportFrameRate);
  const coverage = useMemo<RasterPreviewCoverage>(() => ({
    cachedTimes: [...cacheRef.current.keys()].sort((left, right) => left - right),
    queuedTimes: [...queuedRef.current].sort((left, right) => left - right),
  }), [state.version]);

  return {
    frame: cacheRef.current.get(frameTime) ?? fallbackFrame,
    coverage,
    error: state.error,
  };
}

function getRasterScheduleTimes(sceneTime: number, sceneDuration: number, frameRate: number, isPlaying: boolean) {
  const offsets = isPlaying ? [0, 1] : [0, -1, 1];
  const currentFrame = Math.round(sceneTime * frameRate);
  return offsets
    .map((offset) => quantizeFrameTime((currentFrame + offset) / frameRate, frameRate, sceneDuration))
    .filter((time, index, times) => time >= 0 && time <= sceneDuration && times.indexOf(time) === index)
    .slice(0, frameWindow * 2 + 1);
}

function shouldKeepQueuedTime(time: number, sceneTime: number, sceneDuration: number, frameRate: number) {
  const maxDistance = frameWindow / frameRate;
  return time >= 0 && time <= sceneDuration && Math.abs(time - sceneTime) <= maxDistance;
}

function quantizeFrameTime(time: number, frameRate: number, sceneDuration: number) {
  return Math.min(Math.max(Math.round(time * frameRate) / frameRate, 0), sceneDuration);
}

function evictCachedFrames(cache: Map<number, RasterPreviewFrame>, sceneTime: number) {
  if (cache.size <= maxCachedFrames) return;
  const keep = [...cache.entries()]
    .sort(([leftTime], [rightTime]) => Math.abs(leftTime - sceneTime) - Math.abs(rightTime - sceneTime))
    .slice(0, maxCachedFrames);
  cache.clear();
  for (const [time, frame] of keep) cache.set(time, frame);
}

function getRasterCacheKey(project: ProjectManifest, scene: Scene) {
  return JSON.stringify({
    projectId: project.id,
    sceneId: scene.id,
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

function findNearestCachedFrame(cache: Map<number, RasterPreviewFrame>, time: number, frameRate: number) {
  const maxDistance = 1 / frameRate + 0.0001;
  let nearest: RasterPreviewFrame | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [cachedTime, frame] of cache) {
    const distance = Math.abs(cachedTime - time);
    if (distance < nearestDistance && distance <= maxDistance) {
      nearest = frame;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bgraToRgba(bgra: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(bgra.length);
  for (let index = 0; index < bgra.length; index += 4) {
    rgba[index] = bgra[index + 2];
    rgba[index + 1] = bgra[index + 1];
    rgba[index + 2] = bgra[index];
    rgba[index + 3] = bgra[index + 3];
  }
  return rgba;
}

function isVisuallyBlankBgraFrame(bytes: Uint8Array) {
  if (bytes.length === 0) return true;
  const stride = Math.max(4, Math.floor(bytes.length / 4096 / 4) * 4);
  let visibleSamples = 0;
  let nonBlackSamples = 0;
  for (let index = 0; index < bytes.length; index += stride) {
    const blue = bytes[index];
    const green = bytes[index + 1];
    const red = bytes[index + 2];
    const alpha = bytes[index + 3];
    if (alpha > 8) visibleSamples += 1;
    if (alpha > 8 && (red > 8 || green > 8 || blue > 8)) nonBlackSamples += 1;
  }
  return visibleSamples === 0 || nonBlackSamples < 4;
}

function withRasterTimeout<T>(promise: Promise<T>, sceneTime: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(`Raster IPC timed out after ${rasterTimeoutMs}ms at ${sceneTime.toFixed(3)}s. Check Electron main logs for [clipper raster-preview] stage.`)), rasterTimeoutMs);
    promise.then((value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}
