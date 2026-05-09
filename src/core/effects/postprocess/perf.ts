export type PerfSample = {
  key: string;
  durationMs: number;
};

const sampleBuffer = new Map<
  string,
  { count: number; total: number; max: number; windowStart: number }
>();
const flushIntervalMs = 1000;

export function measurePreviewPerf<T>(key: string, fn: () => T): T {
  if (!isPreviewPerfEnabled()) return fn();
  const start = performance.now();
  const result = fn();
  recordSample({ key, durationMs: performance.now() - start });
  return result;
}

function isPreviewPerfEnabled() {
  if (typeof window === "undefined") return false;
  const previewWindow = window as unknown as {
    clipper?: { debugPreviewPerf?: boolean };
    __clipperDebugPreviewPerf?: boolean;
  };
  if (previewWindow.__clipperDebugPreviewPerf) return true;
  if (previewWindow.clipper?.debugPreviewPerf) return true;
  try {
    return window.localStorage.getItem("clipper:debug-preview-perf") === "1";
  } catch {
    return false;
  }
}

function recordSample(sample: PerfSample) {
  const now = performance.now();
  const bucket = sampleBuffer.get(sample.key) ?? {
    count: 0,
    total: 0,
    max: 0,
    windowStart: now,
  };
  bucket.count += 1;
  bucket.total += sample.durationMs;
  bucket.max = Math.max(bucket.max, sample.durationMs);
  sampleBuffer.set(sample.key, bucket);
  if (now - bucket.windowStart < flushIntervalMs) return;
  const avg = bucket.total / Math.max(1, bucket.count);
  console.info(
    `[preview-perf] ${sample.key} avg=${avg.toFixed(2)}ms max=${bucket.max.toFixed(2)}ms n=${bucket.count}`,
  );
  bucket.count = 0;
  bucket.total = 0;
  bucket.max = 0;
  bucket.windowStart = now;
}
