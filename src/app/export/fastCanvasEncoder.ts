import { getFastExportMaxInFlightNativeWrites, getRenderedVideoFrameTime, getWebCodecsEncodeQueueLimit, getWebCodecsKeyFrameInterval } from "../../core/exportTiming";
import { FRAME_HEIGHT, FRAME_WIDTH, type Scene } from "../../core/types";
import { renderSceneToFastCanvas } from "./fastCanvasRenderer";

type EncodedVideoChunkOutputCallback = (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;

type NativeWriter = {
  writeChunk: (chunk: Uint8Array) => Promise<void>;
};

export type FastCanvasExportMetrics = {
  framesRendered: number;
  chunksWritten: number;
  bytesWritten: number;
  renderCanvasMs: number;
  encodeFlushMs: number;
  nativeWriteWaitMs: number;
  maxEncodeQueueSize: number;
  maxInFlightNativeWrites: number;
};

export async function encodeSceneWithFastCanvas(options: {
  scene: Scene;
  frameRate: number;
  durationSeconds: number;
  canvas: HTMLCanvasElement;
  writer: NativeWriter;
  isCancelled?: () => boolean;
  onFrame?: (frame: number) => void;
}) {
  if (!("VideoEncoder" in window) || !("VideoFrame" in window)) throw new Error("WebCodecs VideoEncoder is not available in this Electron renderer.");
  const totalFrames = Math.max(1, Math.ceil(options.durationSeconds * options.frameRate));
  const encodeQueueLimit = getWebCodecsEncodeQueueLimit(options.frameRate);
  const keyFrameInterval = getWebCodecsKeyFrameInterval(options.frameRate);
  const maxNativeWrites = getFastExportMaxInFlightNativeWrites(navigator.hardwareConcurrency);
  const metrics: FastCanvasExportMetrics = {
    framesRendered: 0,
    chunksWritten: 0,
    bytesWritten: 0,
    renderCanvasMs: 0,
    encodeFlushMs: 0,
    nativeWriteWaitMs: 0,
    maxEncodeQueueSize: 0,
    maxInFlightNativeWrites: 0,
  };
  const pendingWrites = new Set<Promise<void>>();
  let encoderError: Error | null = null;
  const output: EncodedVideoChunkOutputCallback = (chunk) => {
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    const startedAt = performance.now();
    const writePromise = options.writer.writeChunk(bytes).then(() => {
      metrics.nativeWriteWaitMs += performance.now() - startedAt;
      metrics.chunksWritten += 1;
      metrics.bytesWritten += bytes.byteLength;
    }).finally(() => pendingWrites.delete(writePromise));
    pendingWrites.add(writePromise);
    metrics.maxInFlightNativeWrites = Math.max(metrics.maxInFlightNativeWrites, pendingWrites.size);
  };
  const encoder = new VideoEncoder({
    output,
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    },
  });

  encoder.configure({
    codec: "avc1.42E01F",
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    framerate: options.frameRate,
    bitrate: 12_000_000,
    avc: { format: "annexb" },
    latencyMode: "quality",
  });

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    if (options.isCancelled?.()) throw new Error("Video export cancelled.");
    if (encoderError) throw encoderError;
    while (encoder.encodeQueueSize >= encodeQueueLimit) {
      if (options.isCancelled?.()) throw new Error("Video export cancelled.");
      await waitForEncoderDequeue(encoder);
    }
    while (pendingWrites.size >= maxNativeWrites) {
      if (options.isCancelled?.()) throw new Error("Video export cancelled.");
      await Promise.race(pendingWrites);
    }

    const sceneTime = getRenderedVideoFrameTime(frameIndex, options.frameRate, options.durationSeconds);
    const renderStartedAt = performance.now();
    renderSceneToFastCanvas({ canvas: options.canvas, scene: options.scene, sceneTime });
    metrics.renderCanvasMs += performance.now() - renderStartedAt;
    const frame = new VideoFrame(options.canvas, { timestamp: Math.round((frameIndex / options.frameRate) * 1_000_000) });
    encoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
    frame.close();
    metrics.framesRendered += 1;
    metrics.maxEncodeQueueSize = Math.max(metrics.maxEncodeQueueSize, encoder.encodeQueueSize);
    options.onFrame?.(frameIndex + 1);
  }

  const flushStartedAt = performance.now();
  await encoder.flush();
  metrics.encodeFlushMs += performance.now() - flushStartedAt;
  await Promise.all(pendingWrites);
  encoder.close();
  if (encoderError) throw encoderError;
  return metrics;
}

function waitForEncoderDequeue(encoder: VideoEncoder) {
  return new Promise<void>((resolve) => {
    encoder.addEventListener("dequeue", () => resolve(), { once: true });
  });
}
