import { describe, expect, it, vi } from "vitest";
import { getRenderClockAttributes, getRenderClockStyle, syncDomAnimationListToRenderClock, waitForRenderClockAnimationsReady } from "./renderClock";

describe("render clock", () => {
  it("exposes deterministic DOM attributes and CSS variables", () => {
    expect(getRenderClockAttributes({ playing: false, time: 1.25, mode: "export" })).toEqual({
      "data-clipper-render-playing": "false",
      "data-clipper-render-mode": "export",
      "data-clipper-render-time": "1.250000",
    });
    expect(getRenderClockStyle({ playing: true, time: 1.25 })).toEqual({
      "--clipper-render-time": 1.25,
      "--clipper-render-time-ms": "1250ms",
      "--clipper-render-animation-play-state": "paused",
      "--clipper-render-play-state": "playing",
    });
  });

  it("pins nested DOM animations to render time and play state", () => {
    const play = vi.fn();
    const pause = vi.fn();
    const animation = { currentTime: 0, play, pause };

    syncDomAnimationListToRenderClock([animation], { playing: false, time: 2 });

    expect(animation.currentTime).toBe(2000);
    expect(pause).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();

    syncDomAnimationListToRenderClock([animation], { playing: true, time: 2.5 });

    expect(animation.currentTime).toBe(2500);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(play).not.toHaveBeenCalled();
  });

  it("preserves each CSS animation phase offset while pinning to render time", () => {
    const earlyAnimation = { currentTime: 125, play: vi.fn(), pause: vi.fn() };
    const lateAnimation = { currentTime: 875, play: vi.fn(), pause: vi.fn() };

    syncDomAnimationListToRenderClock([earlyAnimation, lateAnimation], { playing: false, time: 2 });

    expect(earlyAnimation.currentTime).toBe(2125);
    expect(lateAnimation.currentTime).toBe(2875);

    syncDomAnimationListToRenderClock([earlyAnimation, lateAnimation], { playing: false, time: 3 });

    expect(earlyAnimation.currentTime).toBe(3125);
    expect(lateAnimation.currentTime).toBe(3875);
  });

  it("keeps browser animations paused even while preview playback advances", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };

    syncDomAnimationListToRenderClock([animation], { playing: true, time: 0.25 });
    syncDomAnimationListToRenderClock([animation], { playing: true, time: 0.5 });

    expect(animation.currentTime).toBe(500);
    expect(animation.pause).toHaveBeenCalledTimes(2);
    expect(animation.play).not.toHaveBeenCalled();
  });

  it("clamps negative render time before pinning DOM animations", () => {
    const animation = { currentTime: 100, play: vi.fn(), pause: vi.fn() };

    syncDomAnimationListToRenderClock([animation], { playing: false, time: -3 });

    expect(animation.currentTime).toBe(0);
    expect(animation.pause).toHaveBeenCalledOnce();
  });

  it("still pins animation time when pause throws", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn(() => { throw new Error("pause failed"); }) };

    syncDomAnimationListToRenderClock([animation], { playing: false, time: 1.5 });

    expect(animation.currentTime).toBe(1500);
    expect(animation.pause).toHaveBeenCalledOnce();
    expect(animation.play).not.toHaveBeenCalled();
  });

  it("waits for render-clock layer animations to be ready and repins them", async () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number);
    globalThis.cancelAnimationFrame = ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame;
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn(), ready: Promise.resolve() };
    const layer = {
      getAnimations: vi.fn(() => [animation as unknown as Animation]),
      getAttribute: vi.fn((name: string) => ({
        "data-clipper-render-playing": "false",
        "data-clipper-render-mode": "export",
        "data-clipper-render-time": "1.25",
      })[name] ?? null),
    } as unknown as Element;
    const root = { querySelectorAll: vi.fn(() => [layer]) } as unknown as ParentNode;

    try {
      const result = await waitForRenderClockAnimationsReady(root);

      expect(result.layerCount).toBe(1);
      expect(result.animationCount).toBe(1);
      expect(result.pinnedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(animation.currentTime).toBe(1250);
      expect(animation.pause).toHaveBeenCalled();
      expect(animation.play).not.toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancelRaf;
    }
  });
});
