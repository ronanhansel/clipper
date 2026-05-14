import { describe, expect, it, vi } from "vitest";
import {
  cancelLatestRaf,
  cancelThrottledCommit,
  createLatestRafState,
  createThrottledCommitState,
  flushLatestRaf,
  flushThrottledCommit,
  requestNumberScrubPointerLock,
  scheduleLatestRaf,
  scheduleThrottledCommit,
  createNumberScrubVirtualCursor,
} from "./scrubInteractionService";

describe("scrub interaction service", () => {
  it("coalesces latest preview value into one animation frame", () => {
    let callback: FrameRequestCallback = () => {};
    const scheduler = {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn((next: FrameRequestCallback) => {
        callback = next;
        return 7;
      }),
    };
    const state = createLatestRafState<number>();
    const flush = vi.fn();

    scheduleLatestRaf(state, 1, flush, scheduler);
    scheduleLatestRaf(state, 2, flush, scheduler);

    expect(scheduler.requestAnimationFrame).toHaveBeenCalledOnce();
    callback?.(0);

    expect(flush).toHaveBeenCalledWith(2);
    expect(state.frame).toBe(0);
    expect(state.value).toBeNull();
  });

  it("flushes pending preview synchronously when requested", () => {
    const scheduler = {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 9),
    };
    const state = createLatestRafState<number>();
    const flush = vi.fn();

    scheduleLatestRaf(state, 3, flush, scheduler);
    flushLatestRaf(state, flush, scheduler);

    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledWith(9);
    expect(flush).toHaveBeenCalledWith(3);
    expect(state.frame).toBe(0);
  });

  it("supports cancelling pending preview without flushing", () => {
    const scheduler = {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 11),
    };
    const state = createLatestRafState<number>();
    const flush = vi.fn();

    scheduleLatestRaf(state, 4, flush, scheduler);
    cancelLatestRaf(state, scheduler);

    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledWith(11);
    expect(flush).not.toHaveBeenCalled();
    expect(state.value).toBeNull();
  });

  it("throttles commits and keeps newest trailing value", () => {
    let timeoutCallback = () => {};
    const scheduler = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((next: () => void) => {
        timeoutCallback = next;
        return 13;
      }),
    };
    const state = createThrottledCommitState<number>();
    const commit = vi.fn();

    scheduleThrottledCommit(state, 1, 16, commit, scheduler, 20);
    scheduleThrottledCommit(state, 2, 16, commit, scheduler, 24);
    scheduleThrottledCommit(state, 3, 16, commit, scheduler, 25);
    timeoutCallback?.();

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenNthCalledWith(1, 1);
    expect(commit).toHaveBeenNthCalledWith(2, 3);
    expect(state.value).toBeNull();
  });

  it("flushes or cancels pending throttled commits", () => {
    const scheduler = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 17),
    };
    const state = createThrottledCommitState<number>();
    const commit = vi.fn();

    scheduleThrottledCommit(state, 1, 16, commit, scheduler, 20);
    scheduleThrottledCommit(state, 2, 16, commit, scheduler, 21);
    flushThrottledCommit(state, commit, scheduler, 22);

    expect(scheduler.clearTimeout).toHaveBeenCalledWith(17);
    expect(commit).toHaveBeenLastCalledWith(2);

    scheduleThrottledCommit(state, 3, 16, commit, scheduler, 23);
    cancelThrottledCommit(state, scheduler);

    expect(state.timeout).toBe(0);
    expect(state.value).toBeNull();
  });

  it("reuses an existing pointer lock without requesting again", () => {
    const requestPointerLock = vi.fn();
    const doc = {
      addEventListener: vi.fn(),
      body: { requestPointerLock },
      exitPointerLock: vi.fn(),
      pointerLockElement: {} as Element,
      removeEventListener: vi.fn(),
    } as unknown as Document;

    const pointerLock = requestNumberScrubPointerLock(doc);

    expect(pointerLock?.locked()).toBe(true);
    expect(requestPointerLock).not.toHaveBeenCalled();
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });

  it("moves the virtual cursor using rounded movement and returns horizontal delta", () => {
    const cursorNode = {
      className: "",
      innerHTML: "",
      remove: vi.fn(),
      style: {},
    };
    const body = {
      appendChild: vi.fn(),
      pointerEvents: "",
      style: { pointerEvents: "" },
    };
    const documentElement = {
      style: { cursor: "", userSelect: "" },
    };
    const doc = {
      body,
      createElement: vi.fn(() => cursorNode),
      defaultView: { devicePixelRatio: 2, innerWidth: 100 },
      documentElement,
    } as unknown as Document;

    const cursor = createNumberScrubVirtualCursor(
      { clientX: 10, clientY: 20 },
      doc,
    );

    expect(cursor.move({ movementX: 5.4, movementY: 2.4 })).toBe(5.5);

    cursor.cleanup();
    expect(body.appendChild).toHaveBeenCalledWith(cursorNode);
    expect(cursorNode.remove).toHaveBeenCalledOnce();
  });
});
