export type MasterTimelineClockSnapshot = {
  sceneTime: number;
  displayTime: number;
  playing: boolean;
  source: "idle" | "playback" | "scrub";
  updatedAt: number;
};

type Listener = () => void;

let snapshot: MasterTimelineClockSnapshot = {
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
  next: Omit<MasterTimelineClockSnapshot, "updatedAt"> & {
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
  snapshot = nextSnapshot;
  for (const listener of listeners) listener();
}

export const getPlaybackTimeSnapshot = getMasterTimelineClockSnapshot;
export const subscribePlaybackTime = subscribeMasterTimelineClock;
export const publishPlaybackTime = publishMasterTimelineClock;

function readClockNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
