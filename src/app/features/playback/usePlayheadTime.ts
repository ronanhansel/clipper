import { useRef, useSyncExternalStore } from "react";
import { useEditorStore } from "../../state/editorStore";
import {
  getMasterTimelineClockSnapshot,
  subscribeMasterTimelineClock,
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
 * Subscribe a leaf component to the live timeline clock. Fires on both
 * `playback` and `scrub` sources; returns the structural editor-store value
 * when the clock is idle.
 *
 * `enabled = false` short-circuits the subscription entirely so callers can
 * gate per-row (e.g. only animated rows pay the rerender cost).
 */
export function usePlayheadTime(enabled: boolean = true) {
  const idleSceneTime = useEditorStore((s) => s.currentSceneTime);
  const lastBucketRef = useRef<number>(bucketizePlayheadTime(idleSceneTime));
  const liveTimeRef = useRef<number>(idleSceneTime);

  const bucket = useSyncExternalStore(
    (onStoreChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (snap.source !== "playback" && snap.source !== "scrub") {
          // Idle source — let the editor-store selector drive value below.
          // Only emit when we cross out of a previously-live bucket so we
          // don't churn between live and idle reads.
          const idleBucket = bucketizePlayheadTime(idleSceneTime);
          if (lastBucketRef.current !== idleBucket) {
            lastBucketRef.current = idleBucket;
            liveTimeRef.current = idleSceneTime;
            onStoreChange();
          }
          return;
        }
        const next = bucketizePlayheadTime(snap.displayTime);
        if (next === lastBucketRef.current) return;
        lastBucketRef.current = next;
        liveTimeRef.current = snap.displayTime;
        onStoreChange();
      });
    },
    () => lastBucketRef.current,
  );
  void bucket;

  const snap = getMasterTimelineClockSnapshot();
  return resolvePlayheadTime(
    snap.source,
    liveTimeRef.current,
    idleSceneTime,
    enabled,
  );
}

/**
 * Imperative read. Use inside event handlers / callbacks where you want the
 * freshest live time at invocation, not a stale closure.
 */
export function readPlayheadTime(idleSceneTime: number) {
  const snap = getMasterTimelineClockSnapshot();
  if (snap.source === "playback" || snap.source === "scrub") {
    return snap.displayTime;
  }
  return idleSceneTime;
}
