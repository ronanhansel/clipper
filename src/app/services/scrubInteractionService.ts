function roundToDpr(value: number, dpr: number) {
  const scale = Math.max(dpr || 1, 1);
  return Math.round(value * scale) / scale;
}

function wrapNumber(value: number, max: number) {
  if (!Number.isFinite(max) || max <= 0) return value;
  return ((value % max) + max) % max;
}

function toClientPoint(event: Pick<MouseEvent, "clientX" | "clientY">) {
  return { x: event.clientX, y: event.clientY };
}

export const pixelsPerNumberScrubStep = 6;
export const numberScrubActivationDistance = 3;
export const defaultNumberScrubCommitThrottleMs = 80;
export const livePreviewScrubCommitThrottleMs = 16;

type FrameScheduler = {
  cancelAnimationFrame: (handle: number) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
};

type TimeoutScheduler = {
  clearTimeout: (handle: number) => void;
  setTimeout: (callback: () => void, timeout: number) => number;
};

type PostPaintScheduler = FrameScheduler & TimeoutScheduler;

export type LatestRafState<T> = {
  frame: number;
  value: T | null;
};

export type LatestPostPaintState<T> = {
  frame: number;
  timeout: number;
  value: T | null;
};

export type ThrottledCommitState<T> = {
  lastCommitAt: number;
  timeout: number;
  value: T | null;
};

export type NumberScrubPointerLock = {
  locked: () => boolean;
  release: (onUnlocked?: () => void) => void;
};

export type NumberScrubVirtualCursor = {
  cleanup: () => void;
  move: (event: Pick<MouseEvent, "movementX" | "movementY">) => number;
};

export function createLatestRafState<T>(): LatestRafState<T> {
  return { frame: 0, value: null };
}

export function createLatestPostPaintState<T>(): LatestPostPaintState<T> {
  return { frame: 0, timeout: 0, value: null };
}

export function createThrottledCommitState<T>(): ThrottledCommitState<T> {
  return { lastCommitAt: 0, timeout: 0, value: null };
}

export function cancelLatestRaf<T>(
  state: LatestRafState<T>,
  scheduler: FrameScheduler = window,
) {
  if (state.frame) scheduler.cancelAnimationFrame(state.frame);
  state.frame = 0;
  state.value = null;
}

export function flushLatestRaf<T>(
  state: LatestRafState<T>,
  flush: (value: T) => void,
  scheduler: FrameScheduler = window,
) {
  if (state.frame) scheduler.cancelAnimationFrame(state.frame);
  state.frame = 0;
  const value = state.value;
  state.value = null;
  if (value !== null) flush(value);
}

export function scheduleLatestRaf<T>(
  state: LatestRafState<T>,
  value: T,
  flush: (value: T) => void,
  scheduler: FrameScheduler = window,
) {
  state.value = value;
  if (state.frame) return;
  state.frame = scheduler.requestAnimationFrame(() => {
    state.frame = 0;
    const nextValue = state.value;
    state.value = null;
    if (nextValue !== null) flush(nextValue);
  });
}

export function cancelLatestPostPaint<T>(
  state: LatestPostPaintState<T>,
  scheduler: PostPaintScheduler = window,
) {
  if (state.frame) scheduler.cancelAnimationFrame(state.frame);
  if (state.timeout) scheduler.clearTimeout(state.timeout);
  state.frame = 0;
  state.timeout = 0;
  state.value = null;
}

export function flushLatestPostPaint<T>(
  state: LatestPostPaintState<T>,
  flush: (value: T) => void,
  scheduler: PostPaintScheduler = window,
) {
  if (state.frame) scheduler.cancelAnimationFrame(state.frame);
  if (state.timeout) scheduler.clearTimeout(state.timeout);
  state.frame = 0;
  state.timeout = 0;
  const value = state.value;
  state.value = null;
  if (value !== null) flush(value);
}

export function scheduleLatestPostPaint<T>(
  state: LatestPostPaintState<T>,
  value: T,
  flush: (value: T) => void,
  scheduler: PostPaintScheduler = window,
) {
  state.value = value;
  if (state.frame || state.timeout) return;
  state.frame = scheduler.requestAnimationFrame(() => {
    state.frame = 0;
    state.timeout = scheduler.setTimeout(() => {
      state.timeout = 0;
      const nextValue = state.value;
      state.value = null;
      if (nextValue !== null) flush(nextValue);
    }, 0);
  });
}

export function cancelThrottledCommit<T>(
  state: ThrottledCommitState<T>,
  scheduler: TimeoutScheduler = window,
) {
  if (state.timeout) scheduler.clearTimeout(state.timeout);
  state.timeout = 0;
  state.value = null;
}

export function flushThrottledCommit<T>(
  state: ThrottledCommitState<T>,
  commit: (value: T) => void,
  scheduler: TimeoutScheduler = window,
  now = performance.now(),
) {
  if (state.timeout) scheduler.clearTimeout(state.timeout);
  state.timeout = 0;
  const value = state.value;
  state.value = null;
  if (value === null) return;
  state.lastCommitAt = now;
  commit(value);
}

export function scheduleThrottledCommit<T>(
  state: ThrottledCommitState<T>,
  value: T,
  throttleMs: number,
  commit: (value: T) => void,
  scheduler: TimeoutScheduler = window,
  now = performance.now(),
) {
  state.value = value;
  const delay = Math.max(0, throttleMs);
  const elapsed = now - state.lastCommitAt;
  if (elapsed >= delay) {
    flushThrottledCommit(state, commit, scheduler, now);
    return;
  }

  if (state.timeout) return;
  state.timeout = scheduler.setTimeout(
    () => flushThrottledCommit(state, commit, scheduler),
    delay - elapsed,
  );
}

type ActiveLockInstance = {
  onUnlocked: Set<() => void>;
  released: boolean;
};

let activeLockInstance: ActiveLockInstance | null = null;

function createActiveLockInstance(): ActiveLockInstance {
  return { onUnlocked: new Set(), released: false };
}

function notifyPointerLockUnlocked(instance: ActiveLockInstance) {
  const callbacks = [...instance.onUnlocked];
  instance.onUnlocked.clear();
  for (const callback of callbacks) callback();
}

export function requestNumberScrubPointerLock(
  doc: Document,
): NumberScrubPointerLock | null {
  const body = doc.body;
  const supported = "pointerLockElement" in doc;
  if (!body || !supported || !body.requestPointerLock) return null;

  // Already locked from a previous scrub — reuse, don't re-request.
  // Calling requestPointerLock() while locked triggers pointerlockerror,
  // which would schedule exit mid-scrub.
  if (doc.pointerLockElement) {
    const instance =
      activeLockInstance && !activeLockInstance.released
        ? activeLockInstance
        : createActiveLockInstance();
    activeLockInstance = instance;
    let releaseListenerAttached = false;

    function completeReleaseIfUnlocked() {
      if (doc.pointerLockElement) return;
      doc.removeEventListener(
        "pointerlockchange",
        completeReleaseIfUnlocked,
        false,
      );
      releaseListenerAttached = false;
      if (activeLockInstance === instance) activeLockInstance = null;
      notifyPointerLockUnlocked(instance);
    }

    return {
      locked: () => !instance.released && doc.pointerLockElement !== null,
      release: (onUnlocked) => {
        if (onUnlocked) instance.onUnlocked.add(onUnlocked);
        if (instance.released) return;
        instance.released = true;
        if (doc.pointerLockElement) {
          if (!releaseListenerAttached) {
            releaseListenerAttached = true;
            doc.addEventListener(
              "pointerlockchange",
              completeReleaseIfUnlocked,
              false,
            );
          }
          doc.exitPointerLock();
        } else {
          completeReleaseIfUnlocked();
        }
      },
    };
  }

  const lockState = createActiveLockInstance();
  activeLockInstance = lockState;

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    doc.removeEventListener("pointerlockchange", handleLockChange, false);
    doc.removeEventListener("pointerlockerror", onPointerError, false);
    if (activeLockInstance === lockState) {
      activeLockInstance = null;
    }
  }

  function completeRelease() {
    cleanup();
    notifyPointerLockUnlocked(lockState);
  }

  function handleLockChange() {
    if (lockState.released) {
      if (doc.pointerLockElement) {
        doc.exitPointerLock();
      } else {
        completeRelease();
      }
    } else {
      if (!doc.pointerLockElement) {
        cleanup();
      }
    }
  }

  function onPointerError(event: Event) {
    console.error("PointerLock error occurred:", event);
    if (lockState.released) {
      completeRelease();
    } else {
      cleanup();
    }
  }

  try {
    body.requestPointerLock();
  } catch {
    activeLockInstance = null;
    return null;
  }

  doc.addEventListener("pointerlockchange", handleLockChange, false);
  doc.addEventListener("pointerlockerror", onPointerError, false);

  return {
    locked: () => !lockState.released && doc.pointerLockElement !== null,
    release: (onUnlocked) => {
      if (onUnlocked) lockState.onUnlocked.add(onUnlocked);
      if (lockState.released) return;
      lockState.released = true;
      if (doc.pointerLockElement) {
        doc.exitPointerLock();
      } else if (cleanedUp) {
        completeRelease();
      }
    },
  };
}

export function createNumberScrubVirtualCursor(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  doc: Document,
): NumberScrubVirtualCursor {
  const win = doc.defaultView ?? window;
  const dpr = win.devicePixelRatio;
  const halfCursorWidth = roundToDpr(7.5, dpr);
  const point = toClientPoint(event);
  point.x -= halfCursorWidth;
  point.y -= halfCursorWidth;

  const cursor = doc.createElement("div");
  cursor.className = "clipper-number-scrub-cursor";
  Object.assign(cursor.style, {
    height: "15px",
    left: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
    width: "15px",
    willChange: "transform",
    zIndex: "2147483647",
  });
  cursor.innerHTML =
    '<svg aria-hidden="true" width="46" height="15" viewBox="0 0 46 15" style="left:-15.5px;position:absolute;top:0;filter:drop-shadow(rgba(0,0,0,.45) 0 1px 1px)"><path fill="#fff" stroke="#000" stroke-width="1.25" d="M17 3v3h12V3l5 4.5-5 4.5V9H17v3l-5-4.5L17 3Z"/></svg>';
  doc.body.appendChild(cursor);

  const html = doc.documentElement;
  const body = doc.body;
  const previousHtmlCursor = html.style.cursor;
  const previousHtmlUserSelect = html.style.userSelect;
  html.style.cursor = "ew-resize";
  html.style.userSelect = "none";

  function updateTransform() {
    cursor.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
  }

  return {
    cleanup: () => {
      cursor.remove();
      html.style.cursor = previousHtmlCursor;
      html.style.userSelect = previousHtmlUserSelect;
    },
    move: (moveEvent) => {
      const movementX = roundToDpr(moveEvent.movementX, dpr);
      const movementY = roundToDpr(moveEvent.movementY, dpr);
      point.x = wrapNumber(
        point.x + movementX + halfCursorWidth,
        win.innerWidth,
      );
      point.x -= halfCursorWidth;
      point.y += movementY;
      updateTransform();
      return movementX;
    },
  };
}
