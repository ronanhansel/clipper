import { useEffect, useRef, useState } from "react";
import type { PlaybackClock } from "../../app/types";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type Composition3dGraphState,
} from "../../core/types";
import { WebGlCore } from "./WebGlCore";

export function WebGlPipeline({
  graph,
  frameScale,
  isPlaying,
  partDuration,
  partStart,
  previewTime,
  trimStart,
  playbackClock,
}: {
  graph?: Composition3dGraphState;
  frameScale: number;
  isPlaying: boolean;
  partDuration: number;
  partStart: number;
  previewTime: number;
  trimStart?: number;
  playbackClock: PlaybackClock;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<WebGlCore | null>(null);
  const [renderError, setRenderError] = useState<unknown>(null);
  const graphRef = useRef(graph);
  const isPlayingRef = useRef(isPlaying);
  const playbackClockRef = useRef(playbackClock);
  const partDurationRef = useRef(partDuration);
  const partStartRef = useRef(partStart);
  const previewTimeRef = useRef(previewTime);
  const trimStartRef = useRef(trimStart ?? 0);

  graphRef.current = graph;
  isPlayingRef.current = isPlaying;
  playbackClockRef.current = playbackClock;
  partDurationRef.current = partDuration;
  partStartRef.current = partStart;
  previewTimeRef.current = previewTime;
  trimStartRef.current = trimStart ?? 0;

  if (renderError) throw renderError;

  function getCurrentRenderTime() {
    if (!isPlayingRef.current) return previewTimeRef.current;
    return (
      getPlaybackPreviewTime(
        playbackClockRef.current,
        performance.now(),
        partStartRef.current,
        trimStartRef.current,
        partDurationRef.current,
      ) ?? previewTimeRef.current
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const core = new WebGlCore(canvas);
    coreRef.current = core;
    let frameId = 0;
    let disposed = false;
    const renderLoop = () => {
      if (disposed) return;
      try {
        core.render(graphRef.current, getCurrentRenderTime());
      } catch (error) {
        disposed = true;
        setRenderError(error);
        return;
      }
      frameId = requestAnimationFrame(renderLoop);
    };
    void core
      .init()
      .then(() => {
        if (!disposed) renderLoop();
      })
      .catch((error) => console.warn("WebGL renderer init failed", error));
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      core.dispose();
      if (coreRef.current === core) coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const width = Math.round(FRAME_WIDTH * frameScale);
    const height = Math.round(FRAME_HEIGHT * frameScale);
    coreRef.current?.resize(width, height);
  }, [frameScale]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      width={Math.round(FRAME_WIDTH * frameScale)}
      height={Math.round(FRAME_HEIGHT * frameScale)}
      data-clipper-webgl-preview
    />
  );
}

function getPlaybackPreviewTime(
  clock: PlaybackClock,
  now: number,
  partStart: number,
  trimStart: number,
  duration: number,
) {
  if (!clock) return null;
  const sceneTime = clock.startedFrom + (now - clock.startedAt) / 1000;
  return Math.min(
    Math.max(sceneTime - partStart + trimStart, 0),
    duration + trimStart,
  );
}
