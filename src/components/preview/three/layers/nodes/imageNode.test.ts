import {
  describe,
  expect,
  it,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import * as THREE from "three";
import { MEDIA_PLACEHOLDER_DATA_URL } from "../../../../../core/mediaPlaceholder";
import {
  acquireImageTexture,
  clearImageTextureCacheForTests,
  imageNodeFactory,
  isSvgMediaSource,
  releaseImageTexture,
} from "./imageNode";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNodeContext } from "../layerNodeRegistry";

// The image cache uses `new Image()` and sets `texture.image.naturalWidth`.
// Vitest runs without jsdom in this project, so we install a minimal
// `Image` shim that the cache can construct and the `ImageNode` can
// inspect for intrinsic size during object-fit math.

class FakeImage {
  private srcValue = "";
  crossOrigin: string | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  get src() {
    return this.srcValue;
  }

  set src(value: string) {
    this.srcValue = value;
    if (value.startsWith("blob:")) queueMicrotask(() => this.onload?.());
  }
}

let originalImage: unknown;
beforeAll(() => {
  originalImage = (globalThis as { Image?: unknown }).Image;
  (globalThis as { Image?: unknown }).Image = FakeImage;
});
afterAll(() => {
  (globalThis as { Image?: unknown }).Image = originalImage;
});

beforeEach(() => {
  clearImageTextureCacheForTests();
});

function makeState(
  overrides: Partial<EvaluatedObjectState> = {},
): EvaluatedObjectState {
  return {
    id: "image-1",
    name: "image-1",
    type: "image",
    selector: "[data-id='image-1']",
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    style: { src: "https://example.test/a.png", opacity: 1 },
    transform: {},
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
    ...overrides,
  } as unknown as EvaluatedObjectState;
}

function makeContext(): LayerNodeContext {
  return {
    sharedCapture: undefined as unknown as LayerNodeContext["sharedCapture"],
    sourceRoot: () => null,
    requestRender: () => {},
  };
}

function makeContextWithRender(callback: () => void): LayerNodeContext {
  return {
    sharedCapture: undefined as unknown as LayerNodeContext["sharedCapture"],
    sourceRoot: () => null,
    requestRender: callback,
  };
}

describe("imageNodeFactory", () => {
  it("registers under kind 'image'", () => {
    expect(imageNodeFactory.kind).toBe("image");
  });

  it("creates a Mesh with PlaneGeometry + ShaderMaterial", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    expect(node.object3D).toBeInstanceOf(THREE.Mesh);
    expect(node.object3D.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(node.object3D.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(node.object3D.material.transparent).toBe(true);
    expect(node.object3D.material.premultipliedAlpha).toBe(true);
    node.dispose();
  });

  it("can create a WebGPU-compatible node material for images", () => {
    const node = imageNodeFactory.create({ id: "image-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    expect(node.object3D).toBeInstanceOf(THREE.Mesh);
    expect(node.object3D.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(node.object3D.material.isNodeMaterial).toBe(true);
    expect(node.object3D.material.transparent).toBe(true);
    expect(node.object3D.material.premultipliedAlpha).toBe(true);
    expect(node.object3D.material.userData.webgpuLayerMaterialPort).toBe(
      "image-fill",
    );
    expect(node.object3D.material.userData.layerLightingUniforms).toBe(
      node.object3D.material.userData.layerShadowUniforms,
    );
    expect(node.object3D.material.userData.layerLightingNodes).toBeDefined();
    expect(node.object3D.material.fragmentNode).toBeDefined();
    node.dispose();
  });

  it("updates the WebGPU node material texture and crop uniforms", () => {
    const node = imageNodeFactory.create({ id: "image-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide-node.png", objectFit: "cover", opacity: 0.75 },
      }),
    );
    const material = node.object3D.material;
    const uniforms = material.userData.layerLightingUniforms;
    const tex = uniforms.u_image.value as { image: FakeImage };
    tex.image.naturalWidth = 200;
    tex.image.naturalHeight = 100;
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide-node.png", objectFit: "cover", opacity: 0.75 },
      }),
    );
    expect(material.userData.layerTextureNode.value).toBe(tex);
    expect(uniforms.u_uvSize.value.x).toBeCloseTo(0.5);
    expect(uniforms.u_uvOrigin.value.x).toBeCloseTo(0.25);
    expect(uniforms.u_opacity.value).toBeCloseTo(0.75);
    expect(material.userData.layerUniformNodes.u_opacity.value).toBeCloseTo(
      0.75,
    );
    expect(material.userData.layerUniformNodes.u_radius.value).toBe(0);
    node.dispose();
  });

  it("swaps the WebGPU texture node value when image src changes", () => {
    const node = imageNodeFactory.create({ id: "image-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    node.update(makeState({ style: { src: "node-a.png", opacity: 1 } }));
    const material = node.object3D.material;
    const firstTexture = material.userData.layerTextureNode.value;
    node.update(makeState({ style: { src: "node-b.png", opacity: 1 } }));
    const secondTexture = material.userData.layerTextureNode.value;
    expect(node.object3D.material).toBe(material);
    expect(secondTexture).toBeInstanceOf(THREE.Texture);
    expect(secondTexture).not.toBe(firstTexture);
    node.dispose();
  });

  it("premultiplies image textures so filtered SVG alpha edges blend cleanly", () => {
    const texture = acquireImageTexture("transparent.svg");
    expect(texture.premultiplyAlpha).toBe(true);
    releaseImageTexture("transparent.svg");
  });

  it("detects SVG media sources that need layer-sized rasterization", () => {
    expect(isSvgMediaSource("asset.svg")).toBe(true);
    expect(isSvgMediaSource("clipper-media://file/%2Ftmp%2Ftree.svg")).toBe(
      true,
    );
    expect(
      isSvgMediaSource(encodeURIComponent('<svg viewBox="0 0 10 10"></svg>')),
    ).toBe(true);
    expect(isSvgMediaSource("data:image/svg+xml,%3Csvg%2F%3E")).toBe(true);
    expect(isSvgMediaSource("asset.png")).toBe(false);
  });

  it("dispose releases geometry, material, and the placeholder texture", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    expect(() => node.dispose()).not.toThrow();
  });

  it("update resizes the geometry on bounds change", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(makeState({ bounds: { x: 0, y: 0, width: 80, height: 40 } }));
    expect(node.object3D.geometry.parameters.width).toBe(80);
    expect(node.object3D.geometry.parameters.height).toBe(40);
    node.update(makeState({ bounds: { x: 0, y: 0, width: 320, height: 160 } }));
    expect(node.object3D.geometry.parameters.width).toBe(320);
    expect(node.object3D.geometry.parameters.height).toBe(160);
    node.dispose();
  });

  it("acquires a cached texture on first src and swaps when src changes", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(makeState({ style: { src: "a.png", opacity: 1 } }));
    const firstTexture = node.object3D.material.uniforms.u_image.value;
    expect(firstTexture).toBeInstanceOf(THREE.Texture);

    node.update(makeState({ style: { src: "b.png", opacity: 1 } }));
    const secondTexture = node.object3D.material.uniforms.u_image.value;
    expect(secondTexture).toBeInstanceOf(THREE.Texture);
    expect(secondTexture).not.toBe(firstTexture);
    node.dispose();
  });

  it("does not renormalize unchanged file URLs on every update", () => {
    const originalURL = globalThis.URL;
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    const state = makeState({
      style: { src: "file:///tmp/a.png", opacity: 1 },
    });
    node.update(state);
    const firstTexture = node.object3D.material.uniforms.u_image.value;
    globalThis.URL = class ThrowingURL extends originalURL {
      constructor(url: string | URL, base?: string | URL) {
        if (url === "file:///tmp/a.png") throw new Error("renormalized");
        super(url, base);
      }
    } as typeof URL;
    try {
      expect(() => node.update(state)).not.toThrow();
      expect(node.object3D.material.uniforms.u_image.value).toBe(firstTexture);
    } finally {
      globalThis.URL = originalURL;
      node.dispose();
    }
  });

  it("requests a render when an image texture finishes decoding", () => {
    const requestRender = vi.fn();
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContextWithRender(requestRender),
    );
    node.update(makeState({ style: { src: "late.png", opacity: 1 } }));
    const texture = node.object3D.material.uniforms.u_image.value as {
      image: FakeImage;
    };

    texture.image.onload?.();

    expect(requestRender).toHaveBeenCalledTimes(1);
    node.dispose();
  });

  it("requests a render when a layer-sized SVG media texture finishes rasterizing", async () => {
    const globals = globalThis as unknown as {
      document?: unknown;
      fetch?: unknown;
      URL: typeof URL;
    };
    const originalDocument = globals.document;
    const originalFetch = globals.fetch;
    const originalCreateObjectURL = globals.URL.createObjectURL;
    const originalRevokeObjectURL = globals.URL.revokeObjectURL;
    const requestRender = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    globals.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
      }),
    };
    globals.fetch = vi.fn(async () => ({
      text: async () => '<svg viewBox="0 0 10 10"></svg>',
    }));
    globals.URL.createObjectURL = vi.fn(() => "blob:test-svg");
    globals.URL.revokeObjectURL = vi.fn();

    try {
      const node = imageNodeFactory.create(
        { id: "image-1" } as FrameObject,
        makeContextWithRender(requestRender),
      );
      node.update(makeState({ style: { src: "asset.svg", opacity: 1 } }));
      await vi.waitFor(() => expect(requestRender).toHaveBeenCalledTimes(1));
      expect(context.drawImage).toHaveBeenCalledTimes(1);
      node.dispose();
    } finally {
      globals.document = originalDocument;
      globals.fetch = originalFetch;
      globals.URL.createObjectURL = originalCreateObjectURL;
      globals.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it("rasterizes percent-encoded inline SVG sources without fetching them as URLs", async () => {
    const globals = globalThis as unknown as {
      document?: unknown;
      fetch?: unknown;
      URL: typeof URL;
    };
    const originalDocument = globals.document;
    const originalFetch = globals.fetch;
    const originalCreateObjectURL = globals.URL.createObjectURL;
    const originalRevokeObjectURL = globals.URL.revokeObjectURL;
    const requestRender = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    globals.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
      }),
    };
    globals.fetch = vi.fn(async () => ({
      text: async () => {
        throw new Error("encoded inline SVG should not fetch");
      },
    }));
    globals.URL.createObjectURL = vi.fn(() => "blob:test-svg");
    globals.URL.revokeObjectURL = vi.fn();

    try {
      const node = imageNodeFactory.create(
        { id: "image-1" } as FrameObject,
        makeContextWithRender(requestRender),
      );
      node.update(
        makeState({
          style: {
            src: encodeURIComponent('<svg viewBox="0 0 10 10"></svg>'),
            opacity: 1,
          },
        }),
      );
      await vi.waitFor(() => expect(requestRender).toHaveBeenCalledTimes(1));
      expect(globals.fetch).not.toHaveBeenCalled();
      expect(context.drawImage).toHaveBeenCalledTimes(1);
      node.dispose();
    } finally {
      globals.document = originalDocument;
      globals.fetch = originalFetch;
      globals.URL.createObjectURL = originalCreateObjectURL;
      globals.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it("two nodes sharing src reuse one texture; refcount keeps it alive until last release", () => {
    const a = imageNodeFactory.create(
      { id: "image-a" } as FrameObject,
      makeContext(),
    );
    const b = imageNodeFactory.create(
      { id: "image-b" } as FrameObject,
      makeContext(),
    );
    a.update(makeState({ style: { src: "shared.png", opacity: 1 } }));
    b.update(makeState({ style: { src: "shared.png", opacity: 1 } }));
    const aTex = a.object3D.material.uniforms.u_image.value;
    const bTex = b.object3D.material.uniforms.u_image.value;
    expect(aTex).toBe(bTex);

    const sharedTexture = aTex;
    let disposed = false;
    const originalDispose = sharedTexture.dispose.bind(sharedTexture);
    sharedTexture.dispose = () => {
      disposed = true;
      originalDispose();
    };

    a.dispose();
    expect(disposed).toBe(false);
    b.dispose();
    expect(disposed).toBe(true);
  });

  it("acquireImageTexture / releaseImageTexture refcount behaves as expected", () => {
    const t1 = acquireImageTexture("ref.png");
    const t2 = acquireImageTexture("ref.png");
    expect(t1).toBe(t2);
    let disposed = false;
    const originalDispose = t1.dispose.bind(t1);
    t1.dispose = () => {
      disposed = true;
      originalDispose();
    };
    releaseImageTexture("ref.png");
    expect(disposed).toBe(false);
    releaseImageTexture("ref.png");
    expect(disposed).toBe(true);
  });

  it("style.borderRadius lands in u_radius and style.opacity in u_opacity", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(
      makeState({
        style: { src: "a.png", opacity: 0.4, borderRadius: 16 },
      }),
    );
    const u = node.object3D.material.uniforms;
    expect(u.u_radius.value).toBe(16);
    expect(u.u_opacity.value).toBeCloseTo(0.4);
    node.dispose();
  });

  it("object-fit cover crops UVs to fill a square plane with a wide image", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide.png", objectFit: "cover" },
      }),
    );
    const tex = node.object3D.material.uniforms.u_image.value as {
      image: FakeImage;
    };
    tex.image.naturalWidth = 200;
    tex.image.naturalHeight = 100;
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide.png", objectFit: "cover" },
      }),
    );
    const u = node.object3D.material.uniforms;
    // image AR (2) > plane AR (1) — cover crops X, full Y.
    expect(u.u_uvSize.value.x).toBeCloseTo(0.5);
    expect(u.u_uvSize.value.y).toBeCloseTo(1);
    expect(u.u_uvOrigin.value.x).toBeCloseTo(0.25);
    expect(u.u_uvOrigin.value.y).toBeCloseTo(0);
    node.dispose();
  });

  it("object-fit contain letterboxes UVs for a wide image on a square plane", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide.png", objectFit: "contain" },
      }),
    );
    const tex = node.object3D.material.uniforms.u_image.value as {
      image: FakeImage;
    };
    tex.image.naturalWidth = 200;
    tex.image.naturalHeight = 100;
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "wide.png", objectFit: "contain" },
      }),
    );
    const u = node.object3D.material.uniforms;
    // image AR (2) > plane AR (1) — contain stretches Y past [0,1] so the
    // shader's inside test discards the empty bands.
    expect(u.u_uvSize.value.x).toBeCloseTo(1);
    expect(u.u_uvSize.value.y).toBeCloseTo(2);
    expect(u.u_uvOrigin.value.x).toBeCloseTo(0);
    expect(u.u_uvOrigin.value.y).toBeCloseTo(-0.5);
    node.dispose();
  });

  it("object-fit fill uses full UVs regardless of image aspect", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "any.png", objectFit: "fill" },
      }),
    );
    const tex = node.object3D.material.uniforms.u_image.value as {
      image: FakeImage;
    };
    tex.image.naturalWidth = 400;
    tex.image.naturalHeight = 50;
    node.update(
      makeState({
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        style: { src: "any.png", objectFit: "fill" },
      }),
    );
    const u = node.object3D.material.uniforms;
    expect(u.u_uvSize.value.x).toBeCloseTo(1);
    expect(u.u_uvSize.value.y).toBeCloseTo(1);
    expect(u.u_uvOrigin.value.x).toBeCloseTo(0);
    expect(u.u_uvOrigin.value.y).toBeCloseTo(0);
    node.dispose();
  });

  it("uses the placeholder texture when src is missing", () => {
    const node = imageNodeFactory.create(
      { id: "image-1" } as FrameObject,
      makeContext(),
    );
    node.update(makeState({ style: { opacity: 1 } }));
    const u = node.object3D.material.uniforms;
    expect(u.u_image.value).toBeInstanceOf(THREE.Texture);
    expect(u.u_image.value.image).toBeInstanceOf(FakeImage);
    expect(u.u_image.value.image.src).toBe(MEDIA_PLACEHOLDER_DATA_URL);
    node.dispose();
  });
});
