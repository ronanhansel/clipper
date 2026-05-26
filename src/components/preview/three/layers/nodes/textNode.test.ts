import { describe, expect, it, vi, beforeEach } from "vitest";
import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";

// troika-three-text reaches for fonts, workers, and a real WebGL ctx
// during sync(). Replace it with a hermetic stub that records prop
// writes and a no-op sync, so tests assert against the captured state
// without booting a renderer or touching the network.
vi.mock("troika-three-text", async () => {
  const three = await import("three");
  // Define inside the factory because vi.mock is hoisted above any
  // top-level test bindings. Extending Object3D so `wrapper.add(text)`
  // attaches it to the parent's `children` (three's `add` rejects
  // non-Object3D args).
  class Text extends three.Object3D {
    public anchorX: string | number = 0;
    public anchorY: string | number = 0;
    public text = "";
    public fontSize = 0.1;
    public fontWeight: string | number = "normal";
    public fontStyle = "normal";
    public letterSpacing = 0;
    public lineHeight: string | number = "normal";
    public textAlign = "left";
    public maxWidth = Infinity;
    public font: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public color: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public material: any = null;
    public fillOpacity = 1;
    public sync = vi.fn();
    public dispose = vi.fn();
  }
  return { Text };
});

import { textNodeFactory } from "./textNode";

type FakeTextShape = {
  anchorX: string | number;
  anchorY: string | number;
  text: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle: string;
  letterSpacing: number;
  lineHeight: string | number;
  textAlign: string;
  maxWidth: number;
  font: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  color: any;
  fillOpacity: number;
  position: { x: number; y: number; z: number };
  sync: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const NULL_CONTEXT = {
  sourceRoot: () => null,
  // unused by TextNode; cast keeps the test free of real shared canvas
  sharedCapture: undefined as unknown as ReturnType<typeof Object> as never,
  requestRender: () => {},
} as const;

class FakeContext2D {
  clearRect = vi.fn();
  drawImage = vi.fn();
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};
  private ctx: FakeContext2D | null = null;
  getContext(kind: string) {
    if (kind !== "2d") return null;
    if (!this.ctx) this.ctx = new FakeContext2D();
    return this.ctx;
  }
  remove(): void {}
}

function withFakeDocument<T>(fn: () => T): T {
  const global = globalThis as { document?: unknown };
  const originalDocument = global.document;
  global.document = {
    createElement(kind: string) {
      if (kind === "canvas") return new FakeCanvas();
      return {};
    },
  };
  try {
    return fn();
  } finally {
    global.document = originalDocument;
  }
}

function makeState(
  overrides: Partial<EvaluatedObjectState> = {},
): EvaluatedObjectState {
  return {
    id: "text-1",
    name: "text-1",
    type: "text",
    selector: "[data-id='text-1']",
    bounds: { x: 0, y: 0, width: 200, height: 60 },
    content: "Hello",
    style: { color: "#ffffff", fontSize: 24, opacity: 1 },
    transform: {},
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
    ...overrides,
  } as unknown as EvaluatedObjectState;
}

describe("textNodeFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers under kind 'text'", () => {
    expect(textNodeFactory.kind).toBe("text");
  });

  it("creates a Group containing a troika Text instance with top-left anchor", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    expect(node.object3D).toBeInstanceOf(THREE.Group);
    expect(node.object3D.children).toHaveLength(1);
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    expect(inner.anchorX).toBe("left");
    expect(inner.anchorY).toBe("top");
    node.dispose();
  });

  it("keeps text from writing depth into DoF samples", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    const inner = node.object3D.children[0] as unknown as {
      material: InstanceType<typeof THREE.MeshBasicMaterial>;
    };
    expect(inner.material.transparent).toBe(true);
    expect(inner.material.premultipliedAlpha).toBe(false);
    expect(inner.material.alphaTest).toBe(0);
    expect(inner.material.depthWrite).toBe(false);
    node.dispose();
  });

  it("uses the capture fallback for WebGPU-node text layers", () => {
    withFakeDocument(() => {
      const sharedCanvas = new FakeCanvas();
      const node = textNodeFactory.create({ id: "text-1" } as FrameObject, {
        sourceRoot: () => null,
        sharedCapture: {
          canvas: sharedCanvas,
          context: sharedCanvas.getContext("2d"),
        } as never,
        requestRender: () => {},
        materialBackend: "webgpu-node",
      });
      expect(node.object3D).toBeInstanceOf(THREE.Mesh);
      expect(node.object3D.material.isNodeMaterial).toBe(true);
      expect(node.object3D.material.userData.webgpuLayerMaterialPort).toBe(
        "capture-fill",
      );
      node.dispose();
    });
  });

  it("update positions the wrapper from resolveLayerTransform", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    node.update(
      makeState({ bounds: { x: 100, y: 50, width: 200, height: 60 } }),
    );
    expect(node.object3D.position.x).toBeCloseTo(100 - 1920 / 2 + 100);
    expect(node.object3D.position.y).toBeCloseTo(-(50 - 1080 / 2 + 30));
    expect(node.object3D.scale.x).toBe(1);
    expect(node.object3D.scale.y).toBe(1);
    node.dispose();
  });

  it("update offsets the inner Text by (-w/2, +h/2) so anchor lands at top-left", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    node.update(makeState({ bounds: { x: 0, y: 0, width: 300, height: 80 } }));
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    expect(inner.position.x).toBe(-150);
    expect(inner.position.y).toBe(40);
    expect(inner.position.z).toBe(0);
    node.dispose();
  });

  it("update copies content and style props onto the Text instance without treating family names as font urls", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    node.update(
      makeState({
        content: "Hi there",
        style: {
          color: "#00ff00",
          fontSize: 32,
          fontWeight: 700,
          fontStyle: "italic",
          letterSpacing: 2,
          lineHeight: 1.2,
          textAlign: "center",
          fontFamily: "Inter",
          opacity: 0.5,
        },
      }),
    );
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    expect(inner.text).toBe("Hi there");
    expect(inner.fontSize).toBe(32);
    expect(inner.fontWeight).toBe(700);
    expect(inner.fontStyle).toBe("italic");
    expect(inner.letterSpacing).toBe(2);
    expect(inner.lineHeight).toBe(1.2);
    expect(inner.textAlign).toBe("center");
    expect(inner.font).toBeNull();
    expect(inner.color.g).toBeCloseTo(1);
    expect(inner.fillOpacity).toBeCloseTo(0.5);
    expect(inner.maxWidth).toBe(200);
    node.dispose();
  });

  it("passes real font file sources to troika", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    node.update(
      makeState({
        style: {
          fontFamily: "/fonts/CustomFont.woff2?v=1",
          fontSource: "clipper-media://file/%2Ffonts%2FCustomFont.woff2",
        },
      }),
    );
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    expect(inner.font).toBe("clipper-media://file/%2Ffonts%2FCustomFont.woff2");
    node.dispose();
  });

  it("falls back to defaults when style props are missing", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    node.update(makeState({ content: "x", style: {} }));
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    expect(inner.fontSize).toBe(16);
    expect(inner.fontWeight).toBe(400);
    expect(inner.fontStyle).toBe("normal");
    expect(inner.letterSpacing).toBe(0);
    expect(inner.lineHeight).toBe("normal");
    expect(inner.textAlign).toBe("left");
    expect(inner.font).toBeNull();
    expect(inner.fillOpacity).toBe(1);
    node.dispose();
  });

  it("calls text.sync() on every update", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    node.update(makeState());
    node.update(makeState({ content: "again" }));
    expect(inner.sync).toHaveBeenCalledTimes(2);
    node.dispose();
  });

  it("dispose releases the Text and detaches from the wrapper", () => {
    const node = textNodeFactory.create(
      { id: "text-1" } as FrameObject,
      NULL_CONTEXT,
    );
    const inner = node.object3D.children[0] as unknown as FakeTextShape;
    node.dispose();
    expect(inner.dispose).toHaveBeenCalledTimes(1);
    expect(node.object3D.children).toHaveLength(0);
  });
});
