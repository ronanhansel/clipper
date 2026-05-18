import { describe, expect, it, vi } from "vitest";
import {
  getMasterTimelineClockSnapshot,
  isMasterClockLive,
  publishMasterTimelineClock,
  readAdjustedSceneTime,
  subscribeMasterTimelineClock,
} from "./playbackTimeStore";

describe("master timeline clock store", () => {
  it("publishes one central timeline clock snapshot to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMasterTimelineClock(listener);

    publishMasterTimelineClock({
      sceneTime: 1.25,
      adjustedSceneTime: 1.0,
      displayTime: 1,
      playing: true,
      source: "playback",
      updatedAt: 20,
    });

    expect(listener).toHaveBeenCalledOnce();
    const snapshot = getMasterTimelineClockSnapshot();
    expect(snapshot).toEqual({
      sceneTime: 1.25,
      adjustedSceneTime: 1.0,
      displayTime: 1,
      playing: true,
      source: "playback",
      updatedAt: 20,
      sequence: snapshot.sequence,
    });
    expect(snapshot.sequence).toBeGreaterThan(0);

    unsubscribe();
  });

  it("exposes adjustedSceneTime separately from raw sceneTime", () => {
    publishMasterTimelineClock({
      sceneTime: 2.0,
      adjustedSceneTime: 1.5,
      displayTime: 2.0,
      playing: true,
      source: "playback",
    });

    const snap = getMasterTimelineClockSnapshot();
    expect(snap.sceneTime).toBe(2.0);
    expect(snap.adjustedSceneTime).toBe(1.5);
    expect(isMasterClockLive(snap)).toBe(true);
    expect(readAdjustedSceneTime(99)).toBe(1.5);
  });

  it("readAdjustedSceneTime returns fallback while idle", () => {
    publishMasterTimelineClock({
      sceneTime: 5,
      adjustedSceneTime: 5,
      displayTime: 5,
      playing: false,
      source: "idle",
    });
    expect(isMasterClockLive(getMasterTimelineClockSnapshot())).toBe(false);
    expect(readAdjustedSceneTime(7)).toBe(7);
  });
});
