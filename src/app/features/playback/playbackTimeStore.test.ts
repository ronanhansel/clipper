import { describe, expect, it, vi } from "vitest";
import {
  getMasterTimelineClockSnapshot,
  publishMasterTimelineClock,
  subscribeMasterTimelineClock,
} from "./playbackTimeStore";

describe("master timeline clock store", () => {
  it("publishes one central timeline clock snapshot to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMasterTimelineClock(listener);

    publishMasterTimelineClock({
      sceneTime: 1.25,
      displayTime: 1,
      playing: true,
      source: "playback",
      updatedAt: 20,
    });

    expect(listener).toHaveBeenCalledOnce();
    const snapshot = getMasterTimelineClockSnapshot();
    expect(snapshot).toEqual({
      sceneTime: 1.25,
      displayTime: 1,
      playing: true,
      source: "playback",
      updatedAt: 20,
      sequence: snapshot.sequence,
    });
    expect(snapshot.sequence).toBeGreaterThan(0);

    unsubscribe();
  });
});
