import { useEffect, useRef } from "react";
import type { PreviewFps } from "../../../core/previewFps";

export type RenderCause = "edit" | "scrub" | "play-tick" | "mount" | "resize";

export type PreviewRenderHandler = (cause: RenderCause, now: number) => void;

export interface PreviewRenderScheduler {
  requestRender(cause: RenderCause): void;
  subscribe(handler: PreviewRenderHandler): () => void;
  setOptions(options: PreviewRenderSchedulerOptions): void;
  destroy(): void;
}

export interface PreviewRenderSchedulerOptions {
  fps: PreviewFps;
  isPlaying: boolean;
}

const tickEpsilonMs = 1;

export function createPreviewRenderScheduler(
  initial: PreviewRenderSchedulerOptions,
): PreviewRenderScheduler {
  const handlers = new Set<PreviewRenderHandler>();
  let fps: PreviewFps = initial.fps;
  let isPlaying = initial.isPlaying;
  let playLoopFrameId = 0;
  let idleFrameId = 0;
  let pendingIdleCause: RenderCause | null = null;
  let lastTickTime = -Infinity;
  let destroyed = false;

  function fire(cause: RenderCause, now: number) {
    for (const handler of [...handlers]) handler(cause, now);
  }

  function playLoop(now: number) {
    if (destroyed || !isPlaying) {
      playLoopFrameId = 0;
      return;
    }
    const intervalMs = 1000 / fps;
    if (now - lastTickTime >= intervalMs - tickEpsilonMs) {
      lastTickTime =
        lastTickTime === -Infinity
          ? now
          : Math.min(lastTickTime + intervalMs, now);
      fire("play-tick", now);
    }
    playLoopFrameId = requestAnimationFrame(playLoop);
  }

  function startPlayLoop() {
    if (playLoopFrameId !== 0) return;
    lastTickTime = -Infinity;
    playLoopFrameId = requestAnimationFrame(playLoop);
  }

  function stopPlayLoop() {
    if (playLoopFrameId === 0) return;
    cancelAnimationFrame(playLoopFrameId);
    playLoopFrameId = 0;
  }

  function flushIdle(now: number) {
    idleFrameId = 0;
    const cause = pendingIdleCause;
    pendingIdleCause = null;
    if (destroyed || cause === null) return;
    fire(cause, now);
  }

  if (isPlaying) startPlayLoop();

  return {
    requestRender(cause) {
      if (destroyed) return;
      if (isPlaying) return;
      pendingIdleCause = elevateCause(pendingIdleCause, cause);
      if (idleFrameId !== 0) return;
      idleFrameId = requestAnimationFrame(flushIdle);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    setOptions(next) {
      const wasPlaying = isPlaying;
      fps = next.fps;
      isPlaying = next.isPlaying;
      if (isPlaying && !wasPlaying) {
        if (idleFrameId !== 0) {
          cancelAnimationFrame(idleFrameId);
          idleFrameId = 0;
          pendingIdleCause = null;
        }
        startPlayLoop();
      } else if (!isPlaying && wasPlaying) {
        stopPlayLoop();
      }
    },
    destroy() {
      destroyed = true;
      stopPlayLoop();
      if (idleFrameId !== 0) {
        cancelAnimationFrame(idleFrameId);
        idleFrameId = 0;
      }
      pendingIdleCause = null;
      handlers.clear();
    },
  };
}

function elevateCause(
  current: RenderCause | null,
  next: RenderCause,
): RenderCause {
  if (current === null) return next;
  if (current === next) return current;
  return causePriority(next) > causePriority(current) ? next : current;
}

function causePriority(cause: RenderCause): number {
  switch (cause) {
    case "play-tick":
      return 4;
    case "scrub":
      return 3;
    case "edit":
      return 2;
    case "resize":
      return 1;
    case "mount":
      return 0;
  }
}

export function usePreviewRenderScheduler(
  options: PreviewRenderSchedulerOptions,
): PreviewRenderScheduler {
  const schedulerRef = useRef<PreviewRenderScheduler | null>(null);
  if (schedulerRef.current === null) {
    schedulerRef.current = createPreviewRenderScheduler(options);
  }
  const scheduler = schedulerRef.current;

  useEffect(() => {
    scheduler.setOptions(options);
  }, [scheduler, options.fps, options.isPlaying]);

  useEffect(
    () => () => {
      scheduler.destroy();
      schedulerRef.current = null;
    },
    [scheduler],
  );

  return scheduler;
}
