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
    | undefined = vi.fn();
  clearRect = vi.fn();
  drawImage = vi.fn();
}

class FakeCanvas {
  readonly tagName = "CANVAS";
  width = 0;
  height = 0;
  layoutSubtree = false;
  requestPaint = vi.fn();
  readonly children: Array<FakeCanvas | FakeElement> = [];
  readonly style: Record<string, string> = {};
  private ctx: FakeContext2D | null = null;
  appendChild(child: FakeCanvas | FakeElement): void {
    this.children.push(child);
  }
  remove(): void {}
  cloneNode(_deep?: boolean): FakeCanvas {
    const clone = new FakeCanvas();
    clone.width = this.width;
    clone.height = this.height;
    clone.layoutSubtree = this.layoutSubtree;
    return clone;
  }
  getContext(kind: string) {
    if (kind !== "2d") return null;
    if (!this.ctx) this.ctx = new FakeContext2D();
    return this.ctx;
  }
  querySelectorAll(_selector: string): FakeCanvas[] {
    return [];
  }
}

class FakeElement {
  readonly tagName = "DIV";
  private readonly attributes = new Map<string, string>();
  private readonly children: Array<FakeCanvas | FakeElement> = [];
  readonly style: Record<string, string> = {};
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: FakeCanvas | FakeElement): void {
    this.children.push(child);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  remove(): void {}
  cloneNode(deep?: boolean): FakeElement {
    const clone = new FakeElement();
    for (const [key, value] of this.attributes) clone.setAttribute(key, value);
    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
  querySelector(selector: string): FakeElement | null {
    const match = /\[data-clipper-render-object-id="([^"]+)"\]/.exec(selector);
    if (!match) return null;
    const id = match[1];
    for (const child of this.children) {
      if (child.tagName !== "DIV") continue;
      if (child.getAttribute("data-clipper-render-object-id") === id)
        return child;
    }
    return null;
  }
  querySelectorAll(selector: string): Array<FakeCanvas | FakeElement> {
    const results: Array<FakeCanvas | FakeElement> = [];
    const visit = (element: FakeCanvas | FakeElement) => {
      if (selector === "canvas" && element.tagName === "CANVAS")
        results.push(element);
      if (element.tagName !== "DIV") return;
      for (const child of element.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return results;
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

function getNodeCaptureCanvas(sharedCapture: {
  canvas: FakeCanvas;
}): FakeCanvas {
  const canvas = sharedCapture.canvas.children.find(
    (child): child is FakeCanvas => child.tagName === "CANVAS",
  );
  if (!canvas) throw new Error("Expected node-owned capture canvas");
  return canvas;
}

function getNodeCaptureContext(sharedCapture: {
  canvas: FakeCanvas;
}): FakeContext2D {
  return getNodeCaptureCanvas(sharedCapture).getContext("2d") as FakeContext2D;
}

function makeContext(
  overrides: Partial<LayerNodeContext> = {},
): LayerNodeContext {
  return {
    sharedCapture:
      makeFakeSharedCapture() as unknown as LayerNodeContext["sharedCapture"],
    sourceRoot: () => null,
    requestRender: () => {},
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
    expect(node.object3D.material.transparent).toBe(true);
    expect(node.object3D.material.premultipliedAlpha).toBe(true);
    expect(node.object3D.material.depthWrite).toBe(true);
    const u = node.object3D.material.uniforms;
    expect(u.u_image.value).toBeInstanceOf(THREE.CanvasTexture);
    expect(u.u_opacity.value).toBe(1);
    expect(u.u_alphaCutoff.value).toBeCloseTo(0.18);
    node.dispose();
  });

  it("can create a WebGPU-compatible node material for capture quads", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    expect(node.object3D).toBeInstanceOf(THREE.Mesh);
    expect(node.object3D.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(node.object3D.material.isNodeMaterial).toBe(true);
    expect(node.object3D.material.transparent).toBe(true);
    expect(node.object3D.material.premultipliedAlpha).toBe(true);
    expect(node.object3D.material.depthWrite).toBe(true);
    expect(node.object3D.material.userData.webgpuLayerMaterialPort).toBe(
      "capture-fill",
    );
    expect(
      node.object3D.material.userData.layerLightingUniforms.u_alphaCutoff.value,
    ).toBeCloseTo(0.18);
    expect(node.object3D.material.userData.layerTextureNode.value).toBe(
      node.object3D.material.userData.layerLightingUniforms.u_image.value,
    );
    expect(node.object3D.material.userData.layerLightingNodes).toBeDefined();
    expect(node.object3D.material.fragmentNode).toBeDefined();
    node.dispose();
  });

  it("updates the WebGPU capture opacity uniform", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    node.update(makeState({ style: { opacity: 0.35 } }));
    expect(
      node.object3D.material.userData.layerLightingUniforms.u_opacity.value,
    ).toBeCloseTo(0.35);
    expect(
      node.object3D.material.userData.layerUniformNodes.u_opacity.value,
    ).toBeCloseTo(0.35);
    node.dispose();
  });

  it("swaps the WebGPU texture node value when capture canvas resizes", () => {
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    const firstMaterial = node.object3D.material;
    const firstTexture = firstMaterial.userData.layerTextureNode.value;
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    const material = node.object3D.material;
    const secondTexture = material.userData.layerTextureNode.value;
    expect(material).not.toBe(firstMaterial);
    expect(secondTexture).toBeInstanceOf(THREE.CanvasTexture);
    expect(secondTexture).not.toBe(firstTexture);
    expect(material.userData.layerLightingUniforms.u_image.value).toBe(
      secondTexture,
    );
    node.dispose();
  });

  it("refreshes the WebGPU texture binding after drawing DOM capture pixels", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
      materialBackend: "webgpu-node",
    });
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    const firstMaterial = node.object3D.material;
    const firstTexture = firstMaterial.userData.layerTextureNode.value;
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    const material = node.object3D.material;
    const nextTexture = material.userData.layerTextureNode.value;
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    expect(material).not.toBe(firstMaterial);
    expect(nextTexture).toBeInstanceOf(THREE.CanvasTexture);
    expect(nextTexture).not.toBe(firstTexture);
    expect(material.userData.layerLightingUniforms.u_image.value).toBe(
      nextTexture,
    );
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
    const factory = createPerElementCaptureFactory("default");
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

  it("pads WebGPU text capture so glyphs can overflow text bounds", () => {
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create(
      { id: "layer-1" } as FrameObject,
      makeContext(),
    );
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        style: { fontSize: 100 },
      }),
    );
    expect(node.object3D.geometry.parameters.width).toBe(370);
    expect(node.object3D.geometry.parameters.height).toBe(270);
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
      requestRender: () => {},
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
      requestRender: () => {},
    });
    expect(() => node.update(makeState())).not.toThrow();
    expect(drawElementImage).not.toHaveBeenCalled();
    node.dispose();
  });

  it("calls drawElementImage on the node-owned capture context when the layer subtree is found", () => {
    const sharedCapture = makeFakeSharedCapture();
    const requestRender = vi.fn();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender,
    });
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    expect(drawElementImage).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledTimes(1);
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    expect(drawElementImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 78, 53]);
    node.dispose();
  });

  it("copies canvas pixels into the capture clone before drawElementImage", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    const sourceCanvas = new FakeCanvas();
    sourceCanvas.width = 40;
    sourceCanvas.height = 20;
    layer.appendChild(sourceCanvas);
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("html");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
    });

    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));

    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    const captured = drawElementImage.mock.calls[0]?.[0] as FakeElement;
    const clonedCanvas = captured.querySelectorAll("canvas")[0] as FakeCanvas;
    expect(clonedCanvas.width).toBe(40);
    expect(clonedCanvas.height).toBe(20);
    expect(clonedCanvas.getContext("2d")?.drawImage).toHaveBeenCalledWith(
      sourceCanvas,
      0,
      0,
    );
    node.dispose();
  });

  it("captures code layers through the per-layer clone path", () => {
    const sharedCapture = makeFakeSharedCapture();
    const requestRender = vi.fn();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender,
    });

    node.update(makeState({ bounds: { x: 20, y: 30, width: 50, height: 25 } }));

    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    expect(drawElementImage).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledTimes(1);
    node.update(makeState({ bounds: { x: 20, y: 30, width: 50, height: 25 } }));
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    expect(drawElementImage.mock.calls[0]?.[0]).not.toBe(root);
    expect(drawElementImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 50, 25]);
    node.dispose();
  });

  it("prepares the per-layer capture clone before drawing it", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
      materialBackend: "webgpu-node",
    });

    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));

    const captureCanvas = getNodeCaptureCanvas(sharedCapture);
    expect(captureCanvas.layoutSubtree).toBe(true);
    expect(captureCanvas.requestPaint).toHaveBeenCalled();
    node.dispose();
  });

  it("keeps pending layer capture isolated from shared canvas resizes", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
      materialBackend: "webgpu-node",
    });

    node.update(
      makeState({ bounds: { x: 0, y: 0, width: 794, height: 1123 } }),
    );
    const captureCanvas = getNodeCaptureCanvas(sharedCapture);
    const drawElementImage = captureCanvas.getContext("2d")
      ?.drawElementImage as ReturnType<typeof vi.fn>;
    sharedCapture.canvas.width = 564;
    sharedCapture.canvas.height = 244;
    node.update(
      makeState({ bounds: { x: 0, y: 0, width: 794, height: 1123 } }),
    );

    expect(sharedCapture.canvas.width).toBe(564);
    expect(sharedCapture.canvas.height).toBe(244);
    expect(captureCanvas.width).toBe(794);
    expect(captureCanvas.height).toBe(1123);
    expect(drawElementImage).toHaveBeenCalledWith(
      expect.any(FakeElement),
      0,
      0,
      794,
      1123,
    );
    node.dispose();
  });

  it("does not recapture unchanged text pixels every update", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
    });
    node.update(makeState());
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    node.update(makeState());
    node.update(makeState());
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    node.dispose();
  });

  it("does not recapture unchanged code pixels every update", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
    });
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 50, height: 25 },
        props: { source: "untitled.tsx", colour: "#5cff00" },
      }),
    );
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 50, height: 25 },
        props: { source: "untitled.tsx", colour: "#5cff00" },
      }),
    );
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 50, height: 25 },
        props: { source: "untitled.tsx", colour: "#5cff00" },
      }),
    );
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    node.dispose();
  });

  it("waits for code SVG fallback instead of retrying capture every update", () => {
    const sharedCapture = makeFakeSharedCapture();
    const requestRender = vi.fn();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const originalImage = (globalThis as { Image?: unknown }).Image;
    const originalXMLSerializer = (globalThis as { XMLSerializer?: unknown })
      .XMLSerializer;
    class PendingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
    }
    class FakeXMLSerializer {
      serializeToString(): string {
        return "<div></div>";
      }
    }
    (globalThis as { Image?: unknown }).Image = PendingImage;
    (globalThis as { XMLSerializer?: unknown }).XMLSerializer =
      FakeXMLSerializer;
    const factory = createPerElementCaptureFactory("code");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender,
    });
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    drawElementImage.mockImplementation(() => {
      throw new DOMException("No cached paint record", "InvalidStateError");
    });

    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 25 } }));

    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    node.dispose();
    (globalThis as { Image?: unknown }).Image = originalImage;
    (globalThis as { XMLSerializer?: unknown }).XMLSerializer =
      originalXMLSerializer;
  });

  it("does not recapture text pixels for opacity-only changes", () => {
    const sharedCapture = makeFakeSharedCapture();
    const root = new FakeElement();
    const layer = new FakeElement();
    layer.setAttribute("data-clipper-render-object-id", "layer-1");
    root.appendChild(layer);
    const factory = createPerElementCaptureFactory("text");
    const node = factory.create({ id: "layer-1" } as FrameObject, {
      sharedCapture:
        sharedCapture as unknown as LayerNodeContext["sharedCapture"],
      sourceRoot: () => root as unknown as Element,
      requestRender: () => {},
    });
    node.update(makeState({ style: { opacity: 1 } }));
    const drawElementImage = getNodeCaptureContext(sharedCapture)
      .drawElementImage as ReturnType<typeof vi.fn>;
    node.update(makeState({ style: { opacity: 0.4 } }));
    node.update(makeState({ style: { opacity: 0.4 } }));
    expect(drawElementImage).toHaveBeenCalledTimes(1);
    expect(node.object3D.material.uniforms.u_opacity.value).toBeCloseTo(0.4);
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
      requestRender: () => {},
    });
    expect(() => node.update(makeState())).not.toThrow();
    const context = getNodeCaptureContext(sharedCapture);
    context.drawElementImage = vi.fn(() => {
      throw new Error("boom");
    });
    expect(() => node.update(makeState())).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    node.dispose();
  });
});
