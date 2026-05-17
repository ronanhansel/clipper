import { describe, expect, it } from "vitest";
import { createCanvas2dBackend } from "./Canvas2dBackend";
import { createWebGLBackend } from "./WebGLBackend";
import type { WebGLEffectRenderer } from "./WebGLBackend";
import type {
  CompositionRenderInput,
  EffectRenderInput,
  EffectRenderResult,
} from "./types";
import type { CompositionClip } from "../../../core/types";
import { CompositionCache } from "../cache/compositionCache";

describe("Canvas2dBackend", () => {
  it("declares canvas2d capabilities", () => {
    const backend = createCanvas2dBackend();
    expect(backend.capabilities).toEqual({
      kind: "canvas2d",
      supportsRasterCache: true,
      supportsPostProcess: false,
    });
  });

  it("returns rendered=false without target or source", () => {
    const backend = createCanvas2dBackend();
    const composition = stubComposition();
    expect(
      backend.renderComposition({
        composition,
        localTime: 0,
        duration: 1,
        viewport: { width: 4, height: 4 },
      }),
    ).toEqual({ rendered: false });
  });

  it("paints source onto target via 2d context", () => {
    const backend = createCanvas2dBackend();
    const target = makeCanvas(4, 4);
    const source = makeCanvas(4, 4);
    const result = backend.renderComposition({
      composition: stubComposition(),
      localTime: 0,
      duration: 1,
      viewport: { width: 4, height: 4 },
      target,
      source,
    });
    expect(result.rendered).toBe(true);
    const ctx = target.getContext("2d");
    const calls = (ctx as unknown as TestContext).__calls;
    expect(calls).toEqual([
      ["clearRect", 0, 0, 4, 4],
      ["drawImage", source, 0, 0],
    ]);
  });
});

describe("WebGLBackend", () => {
  it("declares webgl capabilities", () => {
    const backend = createWebGLBackend({ renderer: stubWebGlRenderer() });
    expect(backend.capabilities).toEqual({
      kind: "webgl",
      supportsRasterCache: true,
      supportsPostProcess: true,
    });
  });

  it("delegates renderEffect to the underlying renderer", () => {
    const calls: EffectRenderInput[] = [];
    const renderer = stubWebGlRenderer((input) => {
      calls.push({
        output: input.canvas,
        sourceCanvas: input.sourceCanvas ?? null,
        sourceElement: input.sourceElement,
        passes: input.passes,
        width: input.width,
        height: input.height,
        optIn: input.optIn,
      });
      return passingResult();
    });
    const backend = createWebGLBackend({ renderer });
    const result = backend.renderEffect!(stubEffectInput());
    expect(result.rendered).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].width).toBe(8);
  });

  it("renderComposition is a no-op on the webgl backend", () => {
    const backend = createWebGLBackend({ renderer: stubWebGlRenderer() });
    expect(
      backend.renderComposition({
        composition: stubComposition(),
        localTime: 0,
        duration: 1,
        viewport: { width: 1, height: 1 },
      }),
    ).toEqual({ rendered: false });
  });

  it("destroy releases the underlying renderer", () => {
    let destroyed = 0;
    const backend = createWebGLBackend({
      renderer: stubWebGlRenderer(
        () => passingResult(),
        () => destroyed++,
      ),
    });
    backend.destroy();
    expect(destroyed).toBe(1);
  });
});

describe("compositionCache.getOrRender + Canvas2dBackend", () => {
  it("paints into the cache entry's offscreen canvas on miss and skips on hit", () => {
    const cache = new CompositionCache();
    const composition = stubComposition();
    const backend = createCanvas2dBackend();
    const source = makeCanvas(8, 8);
    let paints = 0;
    function paintInto(input: CompositionRenderInput) {
      const entry = cache.get(composition.id);
      if (entry.cachedVersion === entry.version && entry.canvas) return entry;
      entry.canvas ??= makeCanvas(8, 8);
      const result = backend.renderComposition({
        ...input,
        target: entry.canvas,
      });
      if (result.rendered) {
        paints += 1;
        cache.markCached(composition.id, entry.canvas);
      }
      return entry;
    }
    const input: CompositionRenderInput = {
      composition,
      localTime: 0,
      duration: 1,
      viewport: { width: 8, height: 8 },
      source,
    };
    paintInto(input);
    paintInto(input);
    expect(paints).toBe(1);
    cache.bumpVersion(composition.id);
    paintInto(input);
    expect(paints).toBe(2);
  });
});

function stubComposition(): CompositionClip {
  return {
    id: "comp-1",
    type: "composition",
    duration: 1,
    objects: [],
    frame: { style: {} },
    background: { color: "#000" },
  } as unknown as CompositionClip;
}

interface TestContext {
  __calls: unknown[][];
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const calls: unknown[][] = [];
  const context = {
    __calls: calls,
    clearRect(x: number, y: number, w: number, h: number) {
      calls.push(["clearRect", x, y, w, h]);
    },
    drawImage(image: unknown, x: number, y: number) {
      calls.push(["drawImage", image, x, y]);
    },
  };
  return {
    width,
    height,
    getContext: () => context as unknown as CanvasRenderingContext2D,
  } as unknown as HTMLCanvasElement;
}

function passingResult(): EffectRenderResult {
  return {
    rendered: true,
    presentable: true,
    capability: {
      supported: true,
      reason: null,
      drawElementImage: null,
      layoutSubtree: true,
      paint: true,
    } as unknown as EffectRenderResult["capability"],
  };
}

function stubWebGlRenderer(
  render: (
    input: Parameters<WebGLEffectRenderer["render"]>[0],
  ) => EffectRenderResult = () => passingResult(),
  destroy: () => void = () => {},
): WebGLEffectRenderer {
  return { render, destroy };
}

function stubEffectInput(): EffectRenderInput {
  return {
    output: makeCanvas(8, 8),
    sourceCanvas: makeCanvas(8, 8),
    sourceElement: {} as Element,
    passes: [] as unknown as EffectRenderInput["passes"],
    width: 8,
    height: 8,
    optIn: true,
  };
}
