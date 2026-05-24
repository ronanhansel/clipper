import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNodeContext } from "../layerNodeRegistry";

// SVGLoader internally calls `new DOMParser()`, which isn't present in
// the vitest Node environment. Mocking the module gives us deterministic
// ShapePath stand-ins and frees the test from any DOM polyfill, exactly
// matching the brief's "avoid real network / DOM" guideline.

function makeRealShape(bbox: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}) {
  const shape = new THREE.Shape();
  shape.moveTo(bbox.minX, bbox.minY);
  shape.lineTo(bbox.maxX, bbox.minY);
  shape.lineTo(bbox.maxX, bbox.maxY);
  shape.lineTo(bbox.minX, bbox.maxY);
  shape.lineTo(bbox.minX, bbox.minY);
  return shape;
}

function makeFakeShapePath(opts: {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}) {
  const bbox = opts.bbox ?? { minX: 0, minY: 0, maxX: 100, maxY: 50 };
  const points = [
    new THREE.Vector2(bbox.minX, bbox.minY),
    new THREE.Vector2(bbox.maxX, bbox.minY),
    new THREE.Vector2(bbox.maxX, bbox.maxY),
    new THREE.Vector2(bbox.minX, bbox.maxY),
  ];
  return {
    userData: {
      style: {
        fill: opts.fill,
        fillOpacity: opts.fillOpacity ?? 1,
        stroke: opts.stroke,
        strokeWidth: opts.strokeWidth ?? 1,
        strokeOpacity: opts.strokeOpacity ?? 1,
      },
    },
    subPaths: [{ getPoints: () => points }],
    toShapes: vi.fn(() => [makeRealShape(bbox)]),
  };
}

const parseFn = vi.fn<(text: string) => { paths: unknown[]; xml: unknown }>(
  () => ({
    paths: [makeFakeShapePath({ fill: "#ff0000" })],
    xml: {},
  }),
);

vi.mock("three/examples/jsm/loaders/SVGLoader.js", () => {
  class SVGLoader {
    parse(text: string) {
      return parseFn(text);
    }
    static pointsToStroke() {
      return new THREE.BufferGeometry();
    }
  }
  return { SVGLoader };
});

let svgNodeFactoryRef: (typeof import("./svgNode"))["svgNodeFactory"];
let getOrLoadSvgRef: (typeof import("./svgNode"))["getOrLoadSvg"];

beforeEach(async () => {
  vi.resetModules();
  parseFn.mockClear();
  parseFn.mockImplementation(() => ({
    paths: [makeFakeShapePath({ fill: "#ff0000" })],
    xml: {},
  }));
  const module = await import("./svgNode");
  svgNodeFactoryRef = module.svgNodeFactory;
  getOrLoadSvgRef = module.getOrLoadSvg;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeState(
  overrides: Partial<EvaluatedObjectState> = {},
): EvaluatedObjectState {
  return {
    id: "svg-1",
    name: "svg-1",
    type: "svg",
    selector: "[data-id='svg-1']",
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    style: { opacity: 1 },
    transform: {},
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
    content: '<svg viewBox="0 0 100 50"><rect width="100" height="50"/></svg>',
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

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("svgNodeFactory", () => {
  it("registers under kind 'svg'", () => {
    expect(svgNodeFactoryRef.kind).toBe("svg");
  });

  it("constructs and disposes without throwing", () => {
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    expect(node.object3D).toBeInstanceOf(THREE.Group);
    expect(() => node.dispose()).not.toThrow();
  });

  it("update applies wrapper transform from bounds", () => {
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(
      makeState({ bounds: { x: 100, y: 50, width: 200, height: 100 } }),
    );
    // `resolveLayerTransform` centres the bounds in Three space:
    // x = bounds.x - FRAME_WIDTH/2 + width/2 = 100 - 960 + 100 = -760
    // y = -(bounds.y - FRAME_HEIGHT/2 + height/2) = -(50 - 540 + 50) = 440
    expect(node.object3D.position.x).toBeCloseTo(-760);
    expect(node.object3D.position.y).toBeCloseTo(440);

    node.update(makeState({ bounds: { x: 0, y: 0, width: 400, height: 200 } }));
    expect(node.object3D.position.x).toBeCloseTo(-760);
    expect(node.object3D.position.y).toBeCloseTo(440);
    node.dispose();
  });

  it("update with inline markup builds a non-empty paths container", async () => {
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    expect(pathsContainer).toBeInstanceOf(THREE.Group);
    expect(pathsContainer.children.length).toBeGreaterThanOrEqual(1);
    node.dispose();
  });

  it("path parsing produces one mesh for a single fill path", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [makeFakeShapePath({ fill: "#00ff00" })],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    expect(pathsContainer.children.length).toBe(1);
    const mesh = pathsContainer.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.material.color.getHexString()).toBe("00ff00");
    node.dispose();
  });

  it("can create WebGPU-compatible node materials for SVG fill paths", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [makeFakeShapePath({ fill: "#00ff00" })],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create({ id: "svg-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    node.update(makeState());
    await flushAsync();

    const mesh = node.object3D.children[0].children[0];
    expect(mesh.material.isNodeMaterial).toBe(true);
    expect(mesh.material.color.getHexString()).toBe("00ff00");
    expect(mesh.material.userData.webgpuLayerMaterialPort).toBe("svg-fill");
    expect(mesh.material.userData.layerLightingUniforms).toBeDefined();
    expect(mesh.material.userData.layerLightingNodes).toBeDefined();
    expect(mesh.material.fragmentNode).toBeDefined();
    node.dispose();
  });

  it("can create WebGPU-compatible node materials for SVG stroke paths", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [
        makeFakeShapePath({
          fill: "none",
          stroke: "#0000ff",
          strokeWidth: 2,
        }),
      ],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create({ id: "svg-1" } as FrameObject, {
      ...makeContext(),
      materialBackend: "webgpu-node",
    });
    node.update(makeState());
    await flushAsync();

    const mesh = node.object3D.children[0].children[0];
    expect(mesh.material.isNodeMaterial).toBe(true);
    expect(mesh.material.color.getHexString()).toBe("0000ff");
    expect(mesh.material.userData.webgpuLayerMaterialPort).toBe("svg-stroke");
    node.dispose();
  });

  it("offsets SVG child meshes by document order to avoid coplanar depth fighting", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [
        makeFakeShapePath({ fill: "#ff0000" }),
        makeFakeShapePath({ fill: "#00ff00" }),
        makeFakeShapePath({ fill: "#0000ff" }),
      ],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    expect(pathsContainer.children).toHaveLength(3);
    expect(pathsContainer.children[0].position.z).toBeCloseTo(0);
    expect(pathsContainer.children[1].position.z).toBeGreaterThan(
      pathsContainer.children[0].position.z,
    );
    expect(pathsContainer.children[2].position.z).toBeGreaterThan(
      pathsContainer.children[1].position.z,
    );
    node.dispose();
  });

  it("opacity propagates to all child materials", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [
        makeFakeShapePath({
          fill: "#ff0000",
          stroke: "#0000ff",
          strokeWidth: 2,
        }),
      ],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();
    node.update(makeState({ style: { opacity: 0.4 } }));

    const pathsContainer = node.object3D.children[0];
    expect(pathsContainer.children.length).toBeGreaterThanOrEqual(2);
    for (const child of pathsContainer.children) {
      expect(child.material.opacity).toBeCloseTo(0.4);
      expect(child.material.transparent).toBe(true);
      expect(child.material.depthWrite).toBe(false);
    }
    node.dispose();
  });

  it("restores depth writes when layer opacity returns to opaque", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [makeFakeShapePath({ fill: "#ff0000" })],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    const mesh = pathsContainer.children[0];
    expect(mesh.material.depthWrite).toBe(true);

    node.update(makeState({ style: { opacity: 0.4 } }));
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);

    node.update(makeState({ style: { opacity: 1 } }));
    expect(mesh.material.transparent).toBe(false);
    expect(mesh.material.depthWrite).toBe(true);
    node.dispose();
  });

  it("keeps intrinsic translucent paths from writing depth", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [makeFakeShapePath({ fill: "#ff0000", fillOpacity: 0.5 })],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    const mesh = pathsContainer.children[0];
    expect(mesh.material.opacity).toBeCloseTo(0.5);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    node.dispose();
  });

  it("dispose tears down child geometries and materials", async () => {
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState());
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    const meshes = pathsContainer.children.slice();
    expect(meshes.length).toBeGreaterThan(0);
    const geomDisposes = meshes.map(
      (m: { geometry: { dispose: () => void } }) =>
        vi.spyOn(m.geometry, "dispose"),
    );
    const matDisposes = meshes.map((m: { material: { dispose: () => void } }) =>
      vi.spyOn(m.material, "dispose"),
    );

    node.dispose();

    for (const spy of geomDisposes) expect(spy).toHaveBeenCalled();
    for (const spy of matDisposes) expect(spy).toHaveBeenCalled();
    expect(pathsContainer.children.length).toBe(0);
  });

  it("URL inputs are loaded via fetch", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('<svg viewBox="0 0 10 10"/>'),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrLoadSvgRef("https://example.com/foo.svg");
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/foo.svg");
    expect(result.viewBox.width).toBe(10);
    expect(result.viewBox.height).toBe(10);
  });

  it("inline markup is parsed without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrLoadSvgRef(
      '<svg viewBox="0 0 200 100"><rect/></svg>',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.viewBox.width).toBe(200);
    expect(result.viewBox.height).toBe(100);
  });

  it("source change rebuilds path meshes", async () => {
    parseFn.mockImplementationOnce(() => ({
      paths: [makeFakeShapePath({ fill: "#ff0000" })],
      xml: {},
    }));
    parseFn.mockImplementationOnce(() => ({
      paths: [
        makeFakeShapePath({ fill: "#ff0000" }),
        makeFakeShapePath({ fill: "#00ff00" }),
      ],
      xml: {},
    }));
    const node = svgNodeFactoryRef.create(
      { id: "svg-1" } as FrameObject,
      undefined as never,
    );
    node.update(makeState({ content: "<svg viewBox='0 0 10 10'/>" }));
    await flushAsync();

    const pathsContainer = node.object3D.children[0];
    expect(pathsContainer.children.length).toBe(1);

    node.update(makeState({ content: "<svg viewBox='0 0 20 20'/>" }));
    await flushAsync();
    expect(pathsContainer.children.length).toBe(2);

    node.dispose();
  });
});
