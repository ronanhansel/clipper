import { useRef, useSyncExternalStore } from "react";

export type MasterTimelineClockSource = "idle" | "playback" | "scrub";

export type MasterTimelineClockSnapshot = {
  sequence: number;
  sceneTime: number;
  adjustedSceneTime: number;
  displayTime: number;
  playing: boolean;
  source: MasterTimelineClockSource;
  updatedAt: number;
};

type Listener = () => void;

let snapshot: MasterTimelineClockSnapshot = {
  sequence: 0,
  sceneTime: 0,
  adjustedSceneTime: 0,
  displayTime: 0,
  playing: false,
  source: "idle",
  updatedAt: 0,
};
const listeners = new Set<Listener>();

export function getMasterTimelineClockSnapshot() {
  return snapshot;
}

export function subscribeMasterTimelineClock(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The master clock has two scene-time channels:
 *   - `sceneTime`         — raw playhead, identical to what the rAF tick emits.
 *   - `adjustedSceneTime` — playhead AFTER scene-level adjustment layers
 *                            (frameSkip, speedChange, freezeFrame, reverse,
 *                             boomerang, loopStutter) have been applied.
 *
 * Compose-internal subscribers (text animators, stroke overlays, live
 * post-process) MUST read the adjusted channel — that's the single contract
 * that lets Direct-mode adjustments treat the composition as a flat,
 * pre-determined block. The raw channel is only for callers that need the
 * untouched master playhead (cache identity, label readouts).
 */
export function publishMasterTimelineClock(
  next: Omit<MasterTimelineClockSnapshot, "sequence" | "updatedAt"> & {
    sequence?: number;
    updatedAt?: number;
  },
) {
  const nextSnapshot = {
    ...next,
    updatedAt: next.updatedAt ?? readClockNow(),
  };
  if (
    snapshot.sceneTime === nextSnapshot.sceneTime &&
    snapshot.adjustedSceneTime === nextSnapshot.adjustedSceneTime &&
    snapshot.displayTime === nextSnapshot.displayTime &&
    snapshot.playing === nextSnapshot.playing &&
    snapshot.source === nextSnapshot.source
  )
    return;
  snapshot = {
    ...nextSnapshot,
    sequence: next.sequence ?? snapshot.sequence + 1,
  };
  for (const listener of listeners) listener();
}

function readClockNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function isMasterClockLive(snap: MasterTimelineClockSnapshot) {
  return snap.source === "playback" || snap.source === "scrub";
}

/**
 * Imperative read for adjustment-aware scene time. Returns
 * `snap.adjustedSceneTime` while the clock is live, otherwise returns the
 * caller's idle fallback (typically the editor-store time).
 */
export function readAdjustedSceneTime(fallback: number) {
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? snap.adjustedSceneTime : fallback;
}

/**
 * Hook variant of `readAdjustedSceneTime`. Subscribes only when `enabled`,
 * de-duplicates non-live emissions so idle commits don't churn React. This is
 * the single subscription primitive every comp-internal "live time" consumer
 * should use; bespoke `subscribeMasterTimelineClock` wrappers should not be
 * recreated.
 */
export function useAdjustedSceneTime(enabled: boolean, fallback: number) {
  const liveRef = useRef(fallback);
  useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (!isMasterClockLive(snap)) return;
        const next = snap.adjustedSceneTime;
        if (Math.abs(next - liveRef.current) < 0.0001) return;
        liveRef.current = next;
        onChange();
      });
    },
    () => liveRef.current,
    () => fallback,
  );
  if (!enabled) return fallback;
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? snap.adjustedSceneTime : fallback;
}
