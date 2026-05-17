export type MasterTimelineClockSnapshot = {
  sequence: number;
  sceneTime: number;
  displayTime: number;
  playing: boolean;
  source: "idle" | "playback" | "scrub";
  updatedAt: number;
};

type Listener = () => void;

let snapshot: MasterTimelineClockSnapshot = {
  sequence: 0,
  sceneTime: 0,
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
