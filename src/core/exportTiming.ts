export function getRenderedVideoFrameCount(durationSeconds: number, frameRate: number) {
  return Math.max(1, Math.ceil(durationSeconds * frameRate));
}

export function getRenderedVideoFrameTime(frameIndex: number, frameRate: number, durationSeconds: number) {
  return Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
}

export function getExportRenderAheadFrameLimit(workerCount: number) {
  return Math.max(1, workerCount * 2);
}

export type ExportEncodingMode = "fast" | "balanced" | "quality";

const targetQueueSeconds: Record<ExportEncodingMode, number> = {
  fast: 1.25,
  balanced: 2,
  quality: 2.4,
};

const minQueueLimit: Record<ExportEncodingMode, number> = {
  fast: 36,
  balanced: 72,
  quality: 96,
};

const maxQueueLimit: Record<ExportEncodingMode, number> = {
  fast: 96,
  balanced: 120,
  quality: 180,
};

const keyFrameIntervalSeconds: Record<ExportEncodingMode, number> = {
  fast: 4,
  balanced: 3,
  quality: 2.5,
};

export function getWebCodecsEncodeQueueLimit(frameRate: number, encodingMode: ExportEncodingMode = "balanced") {
  const targetLimit = Math.round(frameRate * targetQueueSeconds[encodingMode]);
  return clamp(targetLimit, minQueueLimit[encodingMode], maxQueueLimit[encodingMode]);
}

export function getWebCodecsKeyFrameInterval(frameRate: number, encodingMode: ExportEncodingMode = "balanced") {
  return Math.max(1, Math.round(frameRate * keyFrameIntervalSeconds[encodingMode]));
}

export function getFastExportMaxInFlightNativeWrites(hardwareConcurrency = 8) {
  return hardwareConcurrency <= 4 ? 1 : 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
