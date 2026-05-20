import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { LayerCardSync } from "./LayerCardSync";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type FrameObject,
} from "../../../core/types";

function makeRect(
  id: string,
  bounds: { x: number; y: number; width: number; height: number },
  overrides: Partial<FrameObject> = {},
): FrameObject {
  return {
    id,
    name: id,
    type: "rect",
    selector: `[data-object-id='${id}']`,
    bounds,
    style: {},
    ...overrides,
  };
}

function makePart(objects: FrameObject[]): CompositionClip {
  return {
    id: "comp-1",
    filePath: "comp-1.composition.json",
    duration: 5,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: {} },
    background: { id: "bg", name: "bg", style: {}, elements: [] },
    objects,
    snapshot: [],
    motionMarkers: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCompositeTexture(): any {
  // Stand-in for a `THREE.CanvasTexture`. The sync class only stores
  // this on the per-card material's `u_image` uniform — it never reads
  // the texture's API during `sync()`, so a plain marker object is
  // sufficient and avoids needing a JSDOM environment in this test.
  return { __compositeTexture: true };
}

describe("LayerCardSync", () => {
  it("constructs with an empty Group", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    expect(sync.group).toBeInstanceOf(THREE.Group);
    expect(sync.group.children).toHaveLength(0);
    sync.dispose();
  });

  it("sync(null, 0) leaves the group empty", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    sync.sync(null, 0);
    expect(sync.group.children).toHaveLength(0);
    sync.dispose();
  });

  it("creates a card per visible non-camera FrameObject", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const part = makePart([
      makeRect("a", { x: 0, y: 0, width: 100, height: 100 }),
      makeRect("b", { x: 200, y: 200, width: 50, height: 50 }),
      makeRect(
        "c-hidden",
        { x: 0, y: 0, width: 10, height: 10 },
        {
          hidden: true,
        },
      ),
      {
        id: "cam-1",
        name: "Camera",
        type: "camera",
        selector: "[data-object-id='cam-1']",
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        style: {},
      },
    ]);
    sync.sync(part, 0);
    expect(sync.group.children).toHaveLength(2);
    expect(
      sync
        .describeForTests()
        .map((c) => c.id)
        .sort(),
    ).toEqual(["a", "b"]);
    sync.dispose();
  });

  it("places mesh at centred frame coords with y-down conversion", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const part = makePart([
      makeRect("a", { x: 100, y: 200, width: 80, height: 40 }),
    ]);
    sync.sync(part, 0);
    const mesh = sync.group.children[0];
    expect(mesh.position.x).toBeCloseTo(100 - FRAME_WIDTH / 2 + 40);
    expect(mesh.position.y).toBeCloseTo(-(200 - FRAME_HEIGHT / 2 + 20));
    expect(mesh.position.z).toBe(0);
    sync.dispose();
  });

  it("uv-crops the card to the layer's region of the composite", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const part = makePart([
      makeRect("a", { x: 100, y: 200, width: 80, height: 40 }),
    ]);
    sync.sync(part, 0);
    const mesh = sync.group.children[0];
    const uOrigin = mesh.material.uniforms.u_uvOrigin.value;
    const uSize = mesh.material.uniforms.u_uvSize.value;
    expect(uOrigin.x).toBeCloseTo(100 / FRAME_WIDTH);
    // v origin uses (1 - (y + h)/H) because flipY composite UVs.
    expect(uOrigin.y).toBeCloseTo(1 - (200 + 40) / FRAME_HEIGHT);
    expect(uSize.x).toBeCloseTo(80 / FRAME_WIDTH);
    expect(uSize.y).toBeCloseTo(40 / FRAME_HEIGHT);
    sync.dispose();
  });

  it("removes cards for objects no longer present and disposes their geometry", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const part = makePart([
      makeRect("a", { x: 0, y: 0, width: 100, height: 100 }),
      makeRect("b", { x: 0, y: 0, width: 100, height: 100 }),
    ]);
    sync.sync(part, 0);
    expect(sync.group.children).toHaveLength(2);

    const meshB = sync.group.children.find(
      (c: { name: string }) => c.name === "LayerCard:b",
    );
    expect(meshB).toBeDefined();
    const disposeSpy = vi.spyOn(meshB.geometry, "dispose");

    const next = makePart([
      makeRect("a", { x: 0, y: 0, width: 100, height: 100 }),
    ]);
    sync.sync(next, 0);
    expect(sync.group.children).toHaveLength(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it("resizes geometry when bounds change between syncs", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const first = makePart([
      makeRect("a", { x: 0, y: 0, width: 100, height: 100 }),
    ]);
    sync.sync(first, 0);
    let mesh = sync.group.children[0];
    expect(mesh.geometry.parameters.width).toBe(100);

    const second = makePart([
      makeRect("a", { x: 0, y: 0, width: 250, height: 80 }),
    ]);
    sync.sync(second, 0);
    mesh = sync.group.children[0];
    expect(mesh.geometry.parameters.width).toBe(250);
    expect(mesh.geometry.parameters.height).toBe(80);
    sync.dispose();
  });

  it("dispose empties the group", () => {
    const sync = new LayerCardSync(makeCompositeTexture());
    const part = makePart([
      makeRect("a", { x: 0, y: 0, width: 100, height: 100 }),
    ]);
    sync.sync(part, 0);
    expect(sync.group.children).toHaveLength(1);
    sync.dispose();
    expect(sync.group.children).toHaveLength(0);
  });
});
