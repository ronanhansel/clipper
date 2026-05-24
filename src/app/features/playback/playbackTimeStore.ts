import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

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
 * `snap.adjustedSceneTime + liveOffset` while the clock is live, otherwise
 * returns the caller's idle fallback (typically the editor-store time). The
 * optional `liveOffset` lets a caller convert the master scene-axis time into
 * its local axis (e.g. part-local) only on the live branch; the idle fallback
 * is assumed to already be in the caller's axis.
 */
export function readAdjustedSceneTime(
  fallback: number,
  liveOffset: number = 0,
) {
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap)
    ? snap.adjustedSceneTime + liveOffset
    : fallback;
}

/**
 * Hook variant of `readAdjustedSceneTime`. Subscribes only when `enabled`,
 * de-duplicates non-live emissions so idle commits don't churn React. This is
 * the single subscription primitive every comp-internal "live time" consumer
 * should use; bespoke `subscribeMasterTimelineClock` wrappers should not be
 * recreated. The optional `liveOffset` is added to the live value only — the
 * idle fallback is returned unchanged.
 */
const adjustedSceneTimeBucketSec = 1 / 30;

export function useAdjustedSceneTime(
  enabled: boolean,
  fallback: number,
  liveOffset: number = 0,
) {
  const lastBucketRef = useRef(
    Math.round(fallback / adjustedSceneTimeBucketSec),
  );
  const liveRef = useRef(fallback);
  useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (!isMasterClockLive(snap)) {
          const idleBucket = Math.round(fallback / adjustedSceneTimeBucketSec);
          if (lastBucketRef.current === idleBucket) return;
          lastBucketRef.current = idleBucket;
          liveRef.current = fallback;
          onChange();
          return;
        }
        const next = snap.adjustedSceneTime + liveOffset;
        const nextBucket = Math.round(next / adjustedSceneTimeBucketSec);
        if (nextBucket === lastBucketRef.current) return;
        lastBucketRef.current = nextBucket;
        liveRef.current = next;
        onChange();
      });
    },
    () => lastBucketRef.current,
    () => Math.round(fallback / adjustedSceneTimeBucketSec),
  );
  if (!enabled) return fallback;
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? liveRef.current : fallback;
}

/**
 * Imperative read for raw scene time. Returns `snap.sceneTime + liveOffset`
 * while the clock is live, otherwise the caller's idle fallback. This is the
 * untouched master playhead — use it for caller cache identity, code-object
 * components, and any consumer that needs the rendered frame's exact scene
 * axis (no adjustment-layer warp, no playback-display warp).
 */
export function readRawSceneTime(fallback: number, liveOffset: number = 0) {
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? snap.sceneTime + liveOffset : fallback;
}

/**
 * Hook variant of `readRawSceneTime`. Mirrors `useAdjustedSceneTime` exactly
 * but reads the raw scene channel. Subscribes only when `enabled`,
 * de-duplicates sub-frame drift so idle commits don't churn React.
 */
export function useRawSceneTime(
  enabled: boolean,
  fallback: number,
  liveOffset: number = 0,
  bucketSec: number = 1 / 30,
) {
  const lastBucketRef = useRef(Math.round(fallback / bucketSec));
  const liveRef = useRef(fallback);
  useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (!isMasterClockLive(snap)) {
          const idleBucket = Math.round(fallback / bucketSec);
          if (lastBucketRef.current === idleBucket) return;
          lastBucketRef.current = idleBucket;
          liveRef.current = fallback;
          onChange();
          return;
        }
        const next = snap.sceneTime + liveOffset;
        const nextBucket = Math.round(next / bucketSec);
        if (nextBucket === lastBucketRef.current) return;
        lastBucketRef.current = nextBucket;
        liveRef.current = next;
        onChange();
      });
    },
    () => lastBucketRef.current,
    () => Math.round(fallback / bucketSec),
  );
  if (!enabled) return fallback;
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? liveRef.current : fallback;
}

/**
 * Imperative read for playback display time (the axis used by the playback
 * bar / presentation labels). Returns `snap.displayTime` while the clock is
 * live, otherwise the caller's idle fallback. The fallback is assumed to
 * already be on the display axis at the call site (or the caller is OK with
 * the editor-store axis collapsing into display while idle).
 */
export function readDisplayTime(fallback: number) {
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? snap.displayTime : fallback;
}

/**
 * Hook variant of `readDisplayTime`. Bucketed dedup at `bucketSec` cadence
 * (default 30 Hz) keeps inspector hot paths off the rAF cadence: high enough
 * for diamonds and evaluated readouts to look continuous, low enough to keep
 * React reconciliation cheap.
 *
 * Does NOT depend on the editor store — the caller passes `fallback`.
 */
export function useDisplayTime(
  enabled: boolean,
  fallback: number,
  bucketSec: number = 1 / 30,
) {
  const lastBucketRef = useRef<number>(Math.round(fallback / bucketSec));
  const liveTimeRef = useRef<number>(fallback);

  useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (!isMasterClockLive(snap)) {
          // Idle source — only emit when we cross out of a previously-live
          // bucket so we don't churn between live and idle reads.
          const idleBucket = Math.round(fallback / bucketSec);
          if (lastBucketRef.current !== idleBucket) {
            lastBucketRef.current = idleBucket;
            liveTimeRef.current = fallback;
            onChange();
          }
          return;
        }
        const next = Math.round(snap.displayTime / bucketSec);
        if (next === lastBucketRef.current) return;
        lastBucketRef.current = next;
        liveTimeRef.current = snap.displayTime;
        onChange();
      });
    },
    () => lastBucketRef.current,
    () => Math.round(fallback / bucketSec),
  );

  if (!enabled) return fallback;
  const snap = getMasterTimelineClockSnapshot();
  return isMasterClockLive(snap) ? snap.displayTime : fallback;
}

/**
 * Imperative read of the master clock's monotonic sequence number. Used by
 * cache-identity / staleness checks that need to compare emissions without
 * subscribing or interpreting the clock state.
 */
export function readClockSequence() {
  return getMasterTimelineClockSnapshot().sequence;
}

/**
 * Hook that maintains a ref tracking the raw scene time. The ref is
 * initialised to `currentSceneTime`, refreshed whenever that prop changes,
 * and continuously updated to `snap.sceneTime` while the master clock is
 * live (playback or scrub). Use it to read the latest playhead inside event
 * handlers / rAF bodies without re-rendering on every tick.
 */
export function useRawSceneTimeRef(
  currentSceneTime: number,
): RefObject<number> {
  const currentSceneTimeRef = useRef(currentSceneTime);

  useEffect(() => {
    currentSceneTimeRef.current = currentSceneTime;
  }, [currentSceneTime]);

  useEffect(() => {
    return subscribeMasterTimelineClock(() => {
      const snap = getMasterTimelineClockSnapshot();
      if (!isMasterClockLive(snap)) return;
      currentSceneTimeRef.current = snap.sceneTime;
    });
  }, []);

  return currentSceneTimeRef;
}
