/**
 * `useFrameSnapshot` reserves the API surface for caching a rasterised
 * composition frame keyed by `(partId, version, time)`.
 *
 * v0.2.19 returns `null` for every call; the `RasterBackend` falls back to
 * its sealed live-DOM render path when no snapshot is available. A future
 * implementation will:
 *   - capture the composition's host element via `drawElementImage` once
 *     the frame is laid out,
 *   - keep the canvas in `CompositionCache` keyed by `(compositionId,
 *     version)` plus a per-time bucket,
 *   - invalidate via `useCompositionCache().bumpVersion(compositionId)` when
 *     the composition source changes.
 *
 * Consumers MUST treat `null` as "no snapshot — render live tree". They MUST
 * NOT branch on the implementation; the seam exists so the rasterisation
 * path can land without changing call sites.
 */

import { useRef } from "react";

export type FrameSnapshot = {
  canvas: HTMLCanvasElement;
  capturedTime: number;
  capturedVersion: number;
};

export type FrameSnapshotKey = {
  compositionId: string;
  version: number;
  /** Local composition time. Bucketed to the composition frame rate. */
  time: number;
};

export function useFrameSnapshot(_key: FrameSnapshotKey): FrameSnapshot | null {
  const ref = useRef<FrameSnapshot | null>(null);
  return ref.current;
}
