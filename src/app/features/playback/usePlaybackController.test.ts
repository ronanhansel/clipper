import { describe, expect, it, vi } from "vitest";
import { syncRenderClockLayersToSceneTime } from "./usePlaybackController";

describe("syncRenderClockLayersToSceneTime", () => {
  it("drives mounted render-clock layers from the master scene time", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const layer = {
      dataset: { clipperRenderClockOffset: "-2.5" },
      setAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    const count = syncRenderClockLayersToSceneTime(root, 8, true);

    expect(count).toBe(1);
    expect(layer.setAttribute).toHaveBeenCalledWith(
      "data-clipper-render-time",
      "5.500000",
    );
    expect(layer.style.setProperty).toHaveBeenCalledWith(
      "--clipper-render-time-ms",
      "5500ms",
    );
    expect(animation.currentTime).toBe(5500);
    expect(animation.pause).not.toHaveBeenCalled();
    expect(animation.play).toHaveBeenCalledOnce();
  });

  it("does not rescan DOM animations on every smooth playback frame", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const layer = {
      dataset: { clipperRenderClockOffset: "0" },
      setAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    syncRenderClockLayersToSceneTime(root, 1, true);
    syncRenderClockLayersToSceneTime(root, 1.001, true);

    expect(layer.getAnimations).toHaveBeenCalledOnce();
    expect(animation.play).toHaveBeenCalledOnce();
  });
});
