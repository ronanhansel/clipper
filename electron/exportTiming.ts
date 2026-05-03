export function getRenderedVideoFrameCount(durationSeconds: number, frameRate: number) {
  return Math.max(1, Math.ceil(durationSeconds * frameRate));
}

export function getRenderedVideoFrameTime(frameIndex: number, frameRate: number, durationSeconds: number) {
  return Math.min(frameIndex / frameRate, Math.max(durationSeconds - 0.001, 0));
}

export function getExportRenderAheadFrameLimit(workerCount: number) {
  return Math.max(1, workerCount * 2);
}
