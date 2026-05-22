import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import * as THREE from "three";
import { createPerElementCaptureFactory } from "./perElementCaptureNode";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNodeContext } from "../layerNodeRegistry";

// jsdom is not a project dependency — and the brief forbids introducing
// one — so this file installs the bare-minimum DOM globals the node and
// test fixtures need. The canvas implementation never paints; it just
// satisfies `document.createElement('canvas').getContext('2d')` for
// `THREE.CanvasTexture` construction and the node's blit path.

class FakeContext2D {
  drawElementImage:
    | ((el: unknown, x: number, y: number, w: number, h: number) => unknown)
    | undefined;
  clearRect = vi.fn();
  drawImage = vi.fn();
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly children: FakeElement[] = [];
  private ctx: FakeContext2D | null = null;
  appendChild(child: FakeElement): void {
    this.children.push(child);
  }
  getContext(kind: string) {
    if (kind !== "2d") return null;
    if (!this.ctx) this.ctx = new FakeContext2D();
    return this.ctx;
  }
}

class FakeElement {
  private readonly attributes = new Map<string, string>();
  private readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: FakeElement): void {
    this.children.push(child);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  remove(): void {}
  cloneNode(_deep?: boolean): FakeElement {
    const clone = new FakeElement();
    for (const [key, value] of this.attributes) clone.setAttribute(key, value);
    return clone;
  }
  querySelector(selector: string): FakeElement | null {
    const match = /\[data-clipper-render-object-id="([^"]+)"\]/.exec(selector);
    if (!match) return null;
    const id = match[1];
    for (const child of this.children) {
      if (child.getAttribute("data-clipper-render-object-id") === id)
        return child;
    }
    return null;
  }
}

const fakeDocument = {
  createElement(kind: string) {
    if (kind === "canvas") return new FakeCanvas();
    return new FakeElement();
  },
};

let originalDocument: unknown;
beforeAll(() => {
  originalDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = fakeDocument;
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

function makeState(
  overrides: Partial<EvaluatedObjectState> = {},
): EvaluatedObjectState {
  return {
    id: "layer-1",
    name: "layer-1",
    type: "text",
    selector: "[data-id='layer-1']",
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    style: { opacity: 1 },
    transform: {},
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
    ...overrides,
  } as unknown as EvaluatedObjectState;
}

function makeFakeSharedCapture(): {
  canvas: FakeCanvas;
  context: FakeContext2D;
} {
  const canvas = new FakeCanvas();
  const context = canvas.getContext("2d") as FakeContext2D;
  return { canvas, context };
}

function makeContext(
  overrides: Partial<LayerNodeContext> = {},
): LayerNodeContext {
  return {
    sharedCapture:
      makeFakeSharedCapture() as unknown as LayerNodeContext["sharedCapture"],
    sourceRoot: () => null,
    ...overrides,
  };
}

describe("perElementCaptureNode", () => {
  it("registers under the requested kind", () => {
    expect(createPerElementCaptureFactory("text").kind).toBe("text");
    expect(createPerElementCaptureFactory("default").kind).toBe("default");
  });

  it("creates a Mesh with a private CanvasTexture and full-UV plane", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create(
      { id: "layer-1" } as FrameObject,
      makeContext(),
    );
    expect(node.object3D).toBeInstanceOf(THREE.Mesh);
    expect(node.object3D.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(node.object3D.material).toBeInstanceOf(THREE.ShaderMaterial);
    const u = node.object3D.material.uniforms;
    expect(u.u_image.value).toBeInstanceOf(THREE.CanvasTexture);
    expect(u.u_opacity.value).toBe(1);
    node.dispose();
  });

  it("dispose releases geometry, material, and texture", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create(
      { id: "layer-1" } as FrameObject,
      makeContext(),
    );
    const geomDispose = vi.spyOn(node.object3D.geometry, "dispose");
    const matDispose = vi.spyOn(node.object3D.material, "dispose");
    const texDispose = vi.spyOn(
      node.object3D.material.uniforms.u_image.value,
      "dispose",
    );
    node.dispose();
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    expect(texDispose).toHaveBeenCalled();
  });

  it("update resizes the private canvas + geometry on bounds change", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create(
      { id: "layer-1" } as FrameObject,
      makeContext(),
    );
    node.update(makeState({ bounds: { x: 0, y: 0, width: 80, height: 40 } }));
    expect(node.object3D.geometry.parameters.width).toBe(80);
    expect(node.object3D.geometry.parameters.height).toBe(40);

    node.update(makeState({ bounds: { x: 0, y: 0, width: 300, height: 120 } }));
    expect(node.object3D.geometry.parameters.width).toBe(300);
    expect(node.object3D.geometry.parameters.height).toBe(120);
    node.dispose();
  });

  it("update is a no-op when sourceRoot returns null", () => {
    const sharedCapture = makeFakeSharedCapture();
    const drawElementImage = vi.fn();
    sharedCapture.context.drawElementImage = drawElementImage;
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => null,
    });
    expect(() => node.update(makeState())).not.toThrow();
    expect(drawElementImage).not.toHaveBeenCalled();
    node.dispose();
  });

  it("update is a no-op when the layer subtree is missing", () => {
    const sharedCapture = makeFakeSharedCapture();
    const drawElementImage = vi.fn();
    sharedCapture.context.drawElementImage = drawElementImage;
    const root = new FakeElement();
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
    });
    expect(() => node.update(makeState())).not.toThrow();
    expect(drawElementImage).not.toHaveBeenCalled();
    node.dispose();
  });

  it("calls drawElementImage on the shared context when the layer subtree is found", () => {
    const sharedCapture = makeFakeSharedCapture();
    const drawElementImage = vi.fn();
    sharedCapture.context.drawElementImage = drawElementImage;
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
    });
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    expect(drawElementImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 50, 25]);
    node.dispose();
  });

  it("opacity uniform follows state.style.opacity", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create(
      { id: "layer-1" } as FrameObject,
      makeContext(),
    );
    node.update(makeState({ style: { opacity: 0.4 } }));
    expect(node.object3D.material.uniforms.u_opacity.value).toBeCloseTo(0.4);
    node.dispose();
  });

  it("warns once and does not throw when drawElementImage fails", () => {
    const sharedCapture = makeFakeSharedCapture();
    sharedCapture.context.drawElementImage = vi.fn(() => {
      throw new Error("boom");
    });
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
    });
    expect(() => node.update(makeState())).not.toThrow();
    expect(() => node.update(makeState())).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    node.dispose();
  });
});
