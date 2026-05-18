import { useEditorStore } from "../../state/editorStore";
import {
  readDisplayTime,
  readRawSceneTime,
  useDisplayTime,
  useRawSceneTime,
} from "./playbackTimeStore";

// 30 Hz bucket for live-time consumers — same cadence used by the inspector
// scrub-live hook in 092. High enough for diamonds and evaluated readouts to
// look continuous, low enough to keep React reconciliation off the rAF hot path.
export const playheadLiveBucketSec = 1 / 30;

export function bucketizePlayheadTime(time: number) {
  return Math.round(time / playheadLiveBucketSec);
}

export type PlayheadClockSource = "playback" | "scrub" | "idle" | (string & {});

/**
 * Pure resolution rule shared by the hook and tests. Returns the time the
 * inspector should display given the current clock source, the live displayed
 * time, and the structural editor-store time.
 */
export function resolvePlayheadTime(
  source: PlayheadClockSource,
  liveDisplayTime: number,
  idleSceneTime: number,
  enabled: boolean,
) {
  if (!enabled) return idleSceneTime;
  if (source === "playback" || source === "scrub") return liveDisplayTime;
  return idleSceneTime;
}

/**
 * Subscribe a leaf component to the live timeline clock on the DISPLAY axis
 * (the playback-bar / inspector readout axis). Fires on both `playback` and
 * `scrub` sources; returns the structural editor-store value when the clock
 * is idle.
 *
 * `enabled = false` short-circuits the subscription entirely so callers can
 * gate per-row (e.g. only animated rows pay the rerender cost).
 *
 * For the raw scene axis (frame preview, code-object components), use
 * `usePlayheadSceneTime` instead — its return value is the untouched
 * playhead with no playback-display warp applied.
 */
export function usePlayheadTime(enabled: boolean = true) {
  const idleSceneTime = useEditorStore((s) => s.currentSceneTime);
  return useDisplayTime(enabled, idleSceneTime, playheadLiveBucketSec);
}

/**
 * Subscribe a leaf component to the live timeline clock on the RAW SCENE
 * axis (no adjustment-layer warp, no playback-display warp). Use for
 * frame-preview consumers and user-authored code components that need the
 * exact same axis as the rendered frame.
 */
export function usePlayheadSceneTime(enabled: boolean = true) {
  const idleSceneTime = useEditorStore((s) => s.currentSceneTime);
  return useRawSceneTime(enabled, idleSceneTime);
}

/**
 * Imperative read on the display axis. Use inside event handlers / callbacks
 * where you want the freshest live time at invocation, not a stale closure.
 */
export function readPlayheadTime(idleSceneTime: number) {
  return readDisplayTime(idleSceneTime);
}

/**
 * Imperative read on the raw scene axis. Mirrors `readPlayheadTime` but
 * returns the untouched master playhead.
 */
export function readPlayheadSceneTime(idleSceneTime: number) {
  return readRawSceneTime(idleSceneTime);
}
