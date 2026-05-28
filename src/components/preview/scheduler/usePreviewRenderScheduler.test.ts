import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewRenderScheduler } from "./usePreviewRenderScheduler";

type FrameCallback = (now: number) => void;

class FakeRaf {
  private nextId = 1;
  private pending = new Map<number, FrameCallback>();
  now = 0;

  request = (callback: FrameCallback) => {
    const id = this.nextId++;
    this.pending.set(id, callback);
    return id;
  };

  cancel = (id: number) => {
    this.pending.delete(id);
  };

  advance(deltaMs: number) {
    this.now += deltaMs;
    const ready = [...this.pending];
    this.pending.clear();
    for (const [, callback] of ready) callback(this.now);
  }

  pendingCount() {
    return this.pending.size;
  }
}

let fakeRaf: FakeRaf;
let originalRaf: typeof globalThis.requestAnimationFrame;
let originalCancel: typeof globalThis.cancelAnimationFrame;
let originalSetTimeout: typeof globalThis.setTimeout;
let originalClearTimeout: typeof globalThis.clearTimeout;

beforeEach(() => {
  fakeRaf = new FakeRaf();
  originalRaf = globalThis.requestAnimationFrame;
  originalCancel = globalThis.cancelAnimationFrame;
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  globalThis.requestAnimationFrame =
    fakeRaf.request as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame =
    fakeRaf.cancel as unknown as typeof cancelAnimationFrame;
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

function useFakeTimeouts() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  globalThis.setTimeout = ((callback: TimerHandler) => {
    const id = nextId++;
    pending.set(id, () => {
      if (typeof callback === "function") callback();
    });
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    if (typeof id === "number") pending.delete(id);
  }) as typeof clearTimeout;
  return {
    flush() {
      const ready = [...pending];
      pending.clear();
      for (const [, callback] of ready) callback();
    },
  };
}

describe("PreviewRenderScheduler", () => {
  it("idle: does not fire without requestRender", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    expect(fakeRaf.pendingCount()).toBe(0);
    fakeRaf.advance(16.67);
    expect(handler).not.toHaveBeenCalled();
  });

  it("idle: requestRender fires exactly once on the next frame", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestRender("scrub");
    expect(handler).not.toHaveBeenCalled();
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe("scrub");
  });

  it("idle scrub: caps repeated requests to project fps", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    for (let i = 0; i < 6; i += 1) {
      scheduler.requestRender("scrub");
      fakeRaf.advance(16.67);
    }

    expect(handler).toHaveBeenCalledTimes(3);
    for (const call of handler.mock.calls) expect(call[0]).toBe("scrub");
  });

  it("idle scrub: coalesces requests while waiting for the next allowed frame", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestRender("scrub");
    fakeRaf.advance(16.67);
    scheduler.requestRender("scrub");
    scheduler.requestRender("scrub");
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("idle edit: still fires on the next frame", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestRender("edit");
    fakeRaf.advance(16.67);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe("edit");
  });

  it("idle post-paint scrub: records the pending render before paint", () => {
    const timers = useFakeTimeouts();
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestPostPaintRender("scrub");
    fakeRaf.advance(16.67);
    expect(handler).not.toHaveBeenCalled();
    timers.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe("scrub");
  });

  it("idle post-paint scrub: remains capped to project fps", () => {
    const timers = useFakeTimeouts();
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestPostPaintRender("scrub");
    fakeRaf.advance(16.67);
    timers.flush();
    scheduler.requestPostPaintRender("scrub");
    fakeRaf.advance(16.67);
    timers.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("idle: two requestRenders in the same tick coalesce into one fire", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestRender("edit");
    scheduler.requestRender("edit");
    scheduler.requestRender("scrub");
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("playing@60: fires every vsync on a 60Hz display", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: true,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    for (let i = 0; i < 6; i += 1) fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(6);
    for (const call of handler.mock.calls) expect(call[0]).toBe("play-tick");
  });

  it("playing@30: fires every other vsync on a 60Hz display", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: true,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    for (let i = 0; i < 12; i += 1) fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(6);
  });

  it("playing@24: fires roughly every 41.67ms (±1 frame slack)", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 24,
      isPlaying: true,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    const totalFrames = 60;
    for (let i = 0; i < totalFrames; i += 1) fakeRaf.advance(16.67);
    const expected = Math.round((totalFrames * 16.67) / (1000 / 24));
    const actual = handler.mock.calls.length;
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  });

  it("unsubscribe stops fires", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: true,
    });
    const handler = vi.fn();
    const unsubscribe = scheduler.subscribe(handler);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
    fakeRaf.advance(16.67);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("toggling isPlaying false → true starts the loop", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(0);

    scheduler.setOptions({ fps: 60, isPlaying: true });
    fakeRaf.advance(16.67);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("toggling isPlaying false → true cancels a pending idle scrub", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestRender("scrub");
    scheduler.setOptions({ fps: 30, isPlaying: true });
    fakeRaf.advance(16.67);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe("play-tick");
  });

  it("toggling isPlaying false → true cancels a pending post-paint scrub", () => {
    const timers = useFakeTimeouts();
    const scheduler = createPreviewRenderScheduler({
      fps: 30,
      isPlaying: false,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    scheduler.requestPostPaintRender("scrub");
    fakeRaf.advance(16.67);
    scheduler.setOptions({ fps: 30, isPlaying: true });
    timers.flush();
    fakeRaf.advance(16.67);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toBe("play-tick");
  });

  it("toggling isPlaying true → false stops the loop without duplicated frames", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: true,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);

    fakeRaf.advance(16.67);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(2);

    scheduler.setOptions({ fps: 60, isPlaying: false });
    fakeRaf.advance(16.67);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("multiple subscribers all receive each fire", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: false,
    });
    const a = vi.fn();
    const b = vi.fn();
    scheduler.subscribe(a);
    scheduler.subscribe(b);

    scheduler.requestRender("edit");
    fakeRaf.advance(16.67);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("destroy cancels pending frames and clears subscribers", () => {
    const scheduler = createPreviewRenderScheduler({
      fps: 60,
      isPlaying: true,
    });
    const handler = vi.fn();
    scheduler.subscribe(handler);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
    scheduler.destroy();
    fakeRaf.advance(16.67);
    fakeRaf.advance(16.67);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fakeRaf.pendingCount()).toBe(0);
  });
});
