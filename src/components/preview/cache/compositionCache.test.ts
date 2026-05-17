import { describe, expect, it } from "vitest";
import { CompositionCache } from "./compositionCache";

describe("CompositionCache", () => {
  it("returns a stable entry per id", () => {
    const cache = new CompositionCache();
    const first = cache.get("comp-1");
    const second = cache.get("comp-1");
    expect(first).toBe(second);
    expect(first.compositionId).toBe("comp-1");
    expect(first.version).toBe(0);
    expect(first.cachedVersion).toBe(-1);
    expect(first.canvas).toBeNull();
  });

  it("bumpVersion increments the entry version", () => {
    const cache = new CompositionCache();
    const entry = cache.get("comp-1");
    expect(entry.version).toBe(0);
    cache.bumpVersion("comp-1");
    expect(entry.version).toBe(1);
    cache.bumpVersion("comp-1");
    expect(entry.version).toBe(2);
  });

  it("multiple comp ids are independent", () => {
    const cache = new CompositionCache();
    cache.bumpVersion("a");
    cache.bumpVersion("a");
    cache.bumpVersion("b");
    expect(cache.get("a").version).toBe(2);
    expect(cache.get("b").version).toBe(1);
    expect(cache.get("c").version).toBe(0);
  });

  it("invalidate forces a redraw on next getOrRender", () => {
    const cache = new CompositionCache();
    const entry = cache.get("comp-1");
    const canvas = makeCanvas();
    entry.canvas = canvas;
    cache.markCached("comp-1", canvas);
    expect(cache.isCached("comp-1")).toBe(true);
    cache.invalidate("comp-1");
    expect(cache.isCached("comp-1")).toBe(false);
    expect(entry.cachedVersion).toBe(-1);
  });

  it("markCached aligns cachedVersion with the current version", () => {
    const cache = new CompositionCache();
    cache.bumpVersion("comp-1");
    cache.bumpVersion("comp-1");
    const canvas = makeCanvas();
    cache.get("comp-1").canvas = canvas;
    cache.markCached("comp-1", canvas);
    expect(cache.isCached("comp-1")).toBe(true);
    expect(cache.get("comp-1").cachedVersion).toBe(2);
  });

  it("invalidateAll resets every known entry", () => {
    const cache = new CompositionCache();
    const aCanvas = makeCanvas();
    const bCanvas = makeCanvas();
    cache.get("a").canvas = aCanvas;
    cache.markCached("a", aCanvas);
    cache.get("b").canvas = bCanvas;
    cache.markCached("b", bCanvas);
    cache.invalidateAll();
    expect(cache.isCached("a")).toBe(false);
    expect(cache.isCached("b")).toBe(false);
  });

  it("isCached returns false until first markCached", () => {
    const cache = new CompositionCache();
    expect(cache.isCached("never-touched")).toBe(false);
    cache.get("untouched");
    expect(cache.isCached("untouched")).toBe(false);
  });

  it("destroy clears all entries", () => {
    const cache = new CompositionCache();
    cache.bumpVersion("a");
    cache.bumpVersion("b");
    expect(cache.knownIds().length).toBe(2);
    cache.destroy();
    expect(cache.knownIds().length).toBe(0);
  });
});

function makeCanvas(): HTMLCanvasElement {
  return { width: 0, height: 0 } as unknown as HTMLCanvasElement;
}
