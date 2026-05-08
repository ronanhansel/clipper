type PlaybackTimeSnapshot = {
  sceneTime: number;
  displayTime: number;
  playing: boolean;
};

type Listener = () => void;

let snapshot: PlaybackTimeSnapshot = { sceneTime: 0, displayTime: 0, playing: false };
const listeners = new Set<Listener>();

export function getPlaybackTimeSnapshot() {
  return snapshot;
}

export function subscribePlaybackTime(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishPlaybackTime(next: PlaybackTimeSnapshot) {
  if (snapshot.sceneTime === next.sceneTime && snapshot.displayTime === next.displayTime && snapshot.playing === next.playing) return;
  snapshot = next;
  for (const listener of listeners) listener();
}
