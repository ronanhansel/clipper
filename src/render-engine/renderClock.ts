export type RenderClockMode = "preview" | "export";

export type RenderClockState = {
  playing: boolean;
  time: number;
  mode?: RenderClockMode;
};

export type DomAnimationLike = Pick<Animation, "currentTime" | "play" | "pause"> & { ready?: PromiseLike<unknown> };

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

export function syncDomAnimationsToRenderClock(root: Element | null, state: RenderClockState) {
  if (!root || typeof root.getAnimations !== "function") return emptyRenderClockSyncResult();
  return syncDomAnimationListToRenderClock(root.getAnimations({ subtree: true }), state);
}

export function syncDomAnimationListToRenderClock(animations: readonly DomAnimationLike[], state: RenderClockState) {
  const renderTime = state.time * 1000;
  const result = emptyRenderClockSyncResult();
  result.animationCount = animations.length;
  for (const animation of animations) {
    const phaseOffset = state.mode === "export" ? 0 : getAnimationPhaseOffset(animation);
    try {
      animation.pause();
    } catch {
      // Keep pinning time even if the browser refuses to pause a generated animation.
    }
    try {
      animation.currentTime = Math.max(renderTime + phaseOffset, 0);
      result.pinnedCount += 1;
    } catch {
      // Some browser-generated animations can reject currentTime updates before they are ready.
      result.failedCount += 1;
    }
    if (animation.ready) result.pendingReadyCount += 1;
  }
  return result;
}

const renderClockPhaseOffset = new WeakMap<DomAnimationLike, number>();

function getAnimationPhaseOffset(animation: DomAnimationLike) {
  const cached = renderClockPhaseOffset.get(animation);
  if (cached !== undefined) return cached;
  const initialTime = typeof animation.currentTime === "number" && Number.isFinite(animation.currentTime) ? animation.currentTime : 0;
  renderClockPhaseOffset.set(animation, initialTime);
  return initialTime;
}

export async function waitForRenderClockAnimationsReady(root: ParentNode | null, options: { maxPasses?: number } = {}): Promise<RenderClockReadinessResult> {
  const maxPasses = options.maxPasses ?? 4;
  const animationFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : ((callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number);
  let aggregate: RenderClockReadinessResult = { ...emptyRenderClockSyncResult(), passCount: 0, layerCount: 0 };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    await nextAnimationFrame(animationFrame);
    const layers = getRenderClockLayers(root);
    aggregate = { ...emptyRenderClockSyncResult(), passCount: pass + 1, layerCount: layers.length };
    const readyPromises: PromiseLike<unknown>[] = [];

    for (const layer of layers) {
      const state = getRenderClockStateFromElement(layer);
      if (!state || typeof layer.getAnimations !== "function") continue;
      const animations = layer.getAnimations({ subtree: true }) as DomAnimationLike[];
      mergeRenderClockSyncResult(aggregate, syncDomAnimationListToRenderClock(animations, state));
      readyPromises.push(...animations.map((animation) => animation.ready).filter((ready): ready is PromiseLike<unknown> => Boolean(ready)));
    }

    if (readyPromises.length === 0) return aggregate;
    await Promise.allSettled(readyPromises);
    const afterReady = { ...emptyRenderClockSyncResult(), passCount: aggregate.passCount, layerCount: aggregate.layerCount };
    for (const layer of layers) {
      const state = getRenderClockStateFromElement(layer);
      if (state) mergeRenderClockSyncResult(afterReady, syncDomAnimationsToRenderClock(layer, state));
    }
    aggregate = afterReady;
    if (aggregate.failedCount === 0) return aggregate;
  }

  return aggregate;
}

function getRenderClockLayers(root: ParentNode | null) {
  if (!root) return [];
  const selector = "[data-clipper-render-playing]";
  const layers = "matches" in root && typeof root.matches === "function" && root.matches(selector) ? [root as Element] : [];
  return [...layers, ...root.querySelectorAll(selector)];
}

function getRenderClockStateFromElement(element: Element): RenderClockState | null {
  const playing = element.getAttribute("data-clipper-render-playing");
  const time = Number(element.getAttribute("data-clipper-render-time"));
  if (playing === null || !Number.isFinite(time)) return null;
  const mode = element.getAttribute("data-clipper-render-mode");
  return { playing: playing === "true", time, mode: mode === "export" ? "export" : "preview" };
}

function mergeRenderClockSyncResult(target: RenderClockSyncResult, source: RenderClockSyncResult) {
  target.animationCount += source.animationCount;
  target.pinnedCount += source.pinnedCount;
  target.failedCount += source.failedCount;
  target.pendingReadyCount += source.pendingReadyCount;
}

function emptyRenderClockSyncResult(): RenderClockSyncResult {
  return { animationCount: 0, pinnedCount: 0, failedCount: 0, pendingReadyCount: 0 };
}

function nextAnimationFrame(animationFrame: typeof requestAnimationFrame) {
  return new Promise<void>((resolve) => animationFrame(() => resolve()));
}
