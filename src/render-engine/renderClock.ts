export type RenderClockMode = "preview" | "export";

export type RenderClockState = {
  playing: boolean;
  time: number;
  mode?: RenderClockMode;
};

export type DomAnimationLike = Pick<
  Animation,
  "currentTime" | "play" | "pause"
> & { ready?: PromiseLike<unknown> };

export type RenderClockSyncResult = {
  animationCount: number;
  pinnedCount: number;
  failedCount: number;
  pendingReadyCount: number;
};

export type RenderClockReadinessResult = RenderClockSyncResult & {
  passCount: number;
  layerCount: number;
};

export function getRenderClockAttributes(state: RenderClockState) {
  return {
    "data-clipper-render-playing": String(state.playing),
    "data-clipper-render-mode": state.mode ?? "preview",
    "data-clipper-render-time": state.time.toFixed(6),
  };
}

export function getRenderClockStyle(state: RenderClockState) {
  return {
    "--clipper-render-time": state.time,
    "--clipper-render-time-ms": `${Math.max(state.time, 0) * 1000}ms`,
    "--clipper-render-animation-play-state": "paused",
    "--clipper-render-play-state": state.playing ? "playing" : "stopped",
  };
}

export function syncDomAnimationsToRenderClock(
  root: Element | null,
  state: RenderClockState,
) {
  if (!root) return emptyRenderClockSyncResult();
  return syncDomAnimationListToRenderClock(
    getRenderClockAnimations(root),
    state,
  );
}

export function syncDomAnimationListToRenderClock(
  animations: readonly DomAnimationLike[],
  state: RenderClockState,
) {
  const renderTime = state.time * 1000;
  const result = emptyRenderClockSyncResult();
  result.animationCount = animations.length;
  for (const animation of animations) {
    const phaseOffset =
      state.mode === "export" ? 0 : getAnimationPhaseOffset(animation);
    const targetTime = Math.max(renderTime + phaseOffset, 0);
    if (state.playing && state.mode !== "export") {
      const previous = renderClockPlayState.get(animation);
      const currentTime =
        typeof animation.currentTime === "number" &&
        Number.isFinite(animation.currentTime)
          ? animation.currentTime
          : null;
      const drift =
        currentTime === null ? Infinity : Math.abs(currentTime - targetTime);
      if (!previous?.playing || drift > renderClockResyncThresholdMs) {
        try {
          animation.currentTime = targetTime;
          result.pinnedCount += 1;
        } catch {
          result.failedCount += 1;
        }
      }
      if (!previous?.playing) {
        try {
          animation.play();
        } catch {
          // Keep playback driven by future clock syncs if the browser refuses play().
        }
      }
      renderClockPlayState.set(animation, { playing: true });
      if (animation.ready) result.pendingReadyCount += 1;
      continue;
    }
    try {
      animation.pause();
    } catch {
      // Keep pinning time even if the browser refuses to pause a generated animation.
    }
    try {
      animation.currentTime = targetTime;
      result.pinnedCount += 1;
    } catch {
      // Some browser-generated animations can reject currentTime updates before they are ready.
      result.failedCount += 1;
    }
    renderClockPlayState.set(animation, { playing: false });
    if (animation.ready) result.pendingReadyCount += 1;
  }
  return result;
}

const renderClockPhaseOffset = new WeakMap<DomAnimationLike, number>();
const renderClockPlayState = new WeakMap<
  DomAnimationLike,
  { playing: boolean }
>();
const renderClockAnimationCache = new WeakMap<Element, DomAnimationLike[]>();
const renderClockResyncThresholdMs = 24;

export function invalidateRenderClockAnimationCache(root: Element | null) {
  if (!root) return;
  renderClockAnimationCache.delete(root);
}

function getAnimationPhaseOffset(animation: DomAnimationLike) {
  const cached = renderClockPhaseOffset.get(animation);
  if (cached !== undefined) return cached;
  const initialTime =
    typeof animation.currentTime === "number" &&
    Number.isFinite(animation.currentTime)
      ? animation.currentTime
      : 0;
  renderClockPhaseOffset.set(animation, initialTime);
  return initialTime;
}

export async function waitForRenderClockAnimationsReady(
  root: ParentNode | null,
  options: { maxPasses?: number } = {},
): Promise<RenderClockReadinessResult> {
  const maxPasses = options.maxPasses ?? 4;
  const animationFrame =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) =>
          setTimeout(() => callback(0), 0) as unknown as number;
  let aggregate: RenderClockReadinessResult = {
    ...emptyRenderClockSyncResult(),
    passCount: 0,
    layerCount: 0,
  };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    await nextAnimationFrame(animationFrame);
    const layers = getRenderClockLayers(root);
    aggregate = {
      ...emptyRenderClockSyncResult(),
      passCount: pass + 1,
      layerCount: layers.length,
    };
    const readyPromises: PromiseLike<unknown>[] = [];

    for (const layer of layers) {
      const state = getRenderClockStateFromElement(layer);
      if (!state) continue;
      const animations = getRenderClockAnimations(layer);
      mergeRenderClockSyncResult(
        aggregate,
        syncDomAnimationListToRenderClock(animations, state),
      );
      readyPromises.push(
        ...animations
          .map((animation) => animation.ready)
          .filter((ready): ready is PromiseLike<unknown> => Boolean(ready)),
      );
    }

    if (readyPromises.length === 0) return aggregate;
    await Promise.allSettled(readyPromises);
    const afterReady = {
      ...emptyRenderClockSyncResult(),
      passCount: aggregate.passCount,
      layerCount: aggregate.layerCount,
    };
    for (const layer of layers) {
      const state = getRenderClockStateFromElement(layer);
      if (state)
        mergeRenderClockSyncResult(
          afterReady,
          syncDomAnimationsToRenderClock(layer, state),
        );
    }
    aggregate = afterReady;
    if (aggregate.failedCount === 0) return aggregate;
  }

  return aggregate;
}

function getRenderClockLayers(root: ParentNode | null) {
  if (!root) return [];
  const selector = "[data-clipper-render-playing]";
  const layers =
    "matches" in root &&
    typeof root.matches === "function" &&
    root.matches(selector)
      ? [root as Element]
      : [];
  return [...layers, ...querySelectorAllIncludingShadow(root, selector)];
}

function getRenderClockAnimations(root: Element) {
  const cached = renderClockAnimationCache.get(root);
  if (cached) return cached;
  const animations = new Set<DomAnimationLike>();
  if (typeof root.getAnimations === "function") {
    for (const animation of getAnimationsForRenderClock(root) as
      | DomAnimationLike[]
      | Animation[])
      animations.add(animation);
  }
  for (const shadowRoot of getShadowRoots(root)) {
    if (typeof shadowRoot.getAnimations !== "function") continue;
    for (const animation of getAnimationsForRenderClock(shadowRoot) as
      | DomAnimationLike[]
      | Animation[])
      animations.add(animation);
  }
  const result = [...animations];
  renderClockAnimationCache.set(root, result);
  return result;
}

function getAnimationsForRenderClock(root: Element | ShadowRoot): Animation[] {
  return (
    root as unknown as {
      getAnimations: (options?: { subtree?: boolean }) => Animation[];
    }
  ).getAnimations({ subtree: true });
}

function getShadowRoots(root: ParentNode) {
  const roots: ShadowRoot[] = [];
  for (const element of querySelectorAllIncludingShadow(
    root,
    "[data-clipper-shadow-render-root]",
  )) {
    if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  return roots;
}

function querySelectorAllIncludingShadow(root: ParentNode, selector: string) {
  if (typeof root.querySelectorAll !== "function") return [];
  const matches = [...root.querySelectorAll<Element>(selector)];
  for (const element of root.querySelectorAll<Element>("*")) {
    if (!element.shadowRoot) continue;
    matches.push(
      ...querySelectorAllIncludingShadow(element.shadowRoot, selector),
    );
  }
  return matches;
}

function getRenderClockStateFromElement(
  element: Element,
): RenderClockState | null {
  const playing = element.getAttribute("data-clipper-render-playing");
  const time = Number(element.getAttribute("data-clipper-render-time"));
  if (playing === null || !Number.isFinite(time)) return null;
  const mode = element.getAttribute("data-clipper-render-mode");
  return {
    playing: playing === "true",
    time,
    mode: mode === "export" ? "export" : "preview",
  };
}

function mergeRenderClockSyncResult(
  target: RenderClockSyncResult,
  source: RenderClockSyncResult,
) {
  target.animationCount += source.animationCount;
  target.pinnedCount += source.pinnedCount;
  target.failedCount += source.failedCount;
  target.pendingReadyCount += source.pendingReadyCount;
}

function emptyRenderClockSyncResult(): RenderClockSyncResult {
  return {
    animationCount: 0,
    pinnedCount: 0,
    failedCount: 0,
    pendingReadyCount: 0,
  };
}

function nextAnimationFrame(animationFrame: typeof requestAnimationFrame) {
  return new Promise<void>((resolve) => animationFrame(() => resolve()));
}
