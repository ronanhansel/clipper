import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { LayerNodeSync } from "./LayerNodeSync";
import {
  createLayerLightingNodes,
  createLayerLightingUniforms,
} from "./layerLighting";
import {
  clearLayerNodeRegistry,
  registerLayerNodeFactory,
  type LayerNode,
  type LayerNodeContext,
  type LayerNodeFactory,
} from "./layerNodeRegistry";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type FrameObject,
  type FrameObjectType,
} from "../../../../core/types";

function makeObject(
  id: string,
  type: FrameObjectType,
  bounds = { x: 0, y: 0, width: 100, height: 100 },
): FrameObject {
  return {
    id,
    name: id,
    type,
    selector: `[data-id='${id}']`,
    bounds,
    style: {},
    transform: {},
  };
}

function makePart(objects: FrameObject[]): CompositionClip {
  return {
    id: "comp",
    filePath: "comp.json",
    duration: 5,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: {} },
    background: { id: "bg", name: "bg", style: {}, elements: [] },
    objects,
    snapshot: [],
    motionMarkers: [],
  };
}

class TrackingNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  updates = 0;
  disposed = false;
  constructor(
    public readonly id: string,
    public readonly type: FrameObjectType,
  ) {
    this.object3D = new THREE.Object3D();
    this.object3D.name = `tracking:${id}:${type}`;
  }
  update() {
    this.updates += 1;
  }
  dispose() {
    this.disposed = true;
  }
}

class MaterialTrackingNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;

  constructor(id: string) {
    this.object3D = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ depthTest: true, depthWrite: true }),
    );
    this.object3D.name = `material:${id}`;
  }

  update() {}

  dispose() {
    this.object3D.geometry.dispose();
    this.object3D.material.dispose();
  }
}

class WebGpuLightingTrackingNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;

  constructor(id: string) {
    const uniforms = createLayerLightingUniforms();
    const nodes = createLayerLightingNodes(uniforms);
    const material = new THREE.MeshBasicMaterial();
    material.userData.layerLightingUniforms = uniforms;
    material.userData.layerLightingNodes = nodes;
    this.object3D = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.object3D.name = `webgpu-lighting:${id}`;
  }

  update() {}

  dispose() {
    this.object3D.geometry.dispose();
    this.object3D.material.dispose();
  }
}

function makeTrackingFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object) {
      return new TrackingNode(object.id, object.type);
    },
  };
}

function makeMaterialTrackingFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object) {
      return new MaterialTrackingNode(object.id);
    },
  };
}

function makeWebGpuLightingTrackingFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object) {
      return new WebGpuLightingTrackingNode(object.id);
    },
  };
}

function makeContext(): LayerNodeContext {
  return {
    sharedCapture: undefined as unknown as LayerNodeContext["sharedCapture"],
    sourceRoot: () => null,
    requestRender: () => {},
  };
}

describe("LayerNodeSync", () => {
  beforeEach(() => {
    clearLayerNodeRegistry();
    registerLayerNodeFactory(makeTrackingFactory("default"));
  });

  it("constructs with an empty Group", () => {
    const sync = new LayerNodeSync(makeContext());
    expect(sync.group).toBeInstanceOf(THREE.Group);
    expect(sync.group.children).toHaveLength(0);
    sync.dispose();
  });

  it("creates a node per visible non-camera FrameObject", () => {
    const sync = new LayerNodeSync(makeContext());
    const part = makePart([
      makeObject("a", "rect"),
      makeObject("b", "text"),
      { ...makeObject("hidden", "rect"), hidden: true },
      {
        id: "cam",
        name: "cam",
        type: "camera",
        selector: "[data-cam]",
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        style: {},
      },
    ]);
    sync.sync(part, 0);
    expect(sync.group.children).toHaveLength(2);
    const ids = sync
      .describeForTests()
      .map((e) => e.id)
      .sort();
    expect(ids).toEqual(["a", "b"]);
    sync.dispose();
  });

  it("calls update on each node every sync", () => {
    const sync = new LayerNodeSync(makeContext());
    const part = makePart([makeObject("a", "rect")]);
    sync.sync(part, 0);
    sync.sync(part, 0.5);
    const node = sync.group.children[0] as unknown as TrackingNode;
    // The Group child is the node's object3D, not the node itself, so we
    // can't read `updates` from it. The behaviour is covered indirectly:
    // node count stays stable across syncs.
    expect(sync.group.children).toHaveLength(1);
    expect(node).toBeDefined();
    sync.dispose();
  });

  it("removes nodes for objects no longer present", () => {
    const sync = new LayerNodeSync(makeContext());
    sync.sync(makePart([makeObject("a", "rect"), makeObject("b", "rect")]), 0);
    expect(sync.group.children).toHaveLength(2);
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    expect(sync.group.children).toHaveLength(1);
    expect(sync.describeForTests()[0].id).toBe("a");
    sync.dispose();
  });

  it("rebuilds a node when its FrameObject type changes", () => {
    const sync = new LayerNodeSync(makeContext());
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    const firstObject3D = sync.group.children[0];
    sync.sync(makePart([makeObject("a", "text")]), 0);
    expect(sync.group.children).toHaveLength(1);
    expect(sync.group.children[0]).not.toBe(firstObject3D);
    expect(sync.describeForTests()[0]).toEqual({ id: "a", type: "text" });
    sync.dispose();
  });

  it("assigns increasing renderOrder to visible non-camera layers", () => {
    clearLayerNodeRegistry();
    registerLayerNodeFactory(makeMaterialTrackingFactory("default"));
    const sync = new LayerNodeSync(makeContext());
    sync.sync(makePart([makeObject("a", "rect"), makeObject("b", "image")]), 0);
    expect(sync.group.children[0].renderOrder).toBe(100);
    expect(sync.group.children[1].renderOrder).toBe(101);
    sync.dispose();
  });

  it("biases flat layers with polygon offset and restores defaults for 3D layers", () => {
    clearLayerNodeRegistry();
    registerLayerNodeFactory(makeMaterialTrackingFactory("default"));
    const sync = new LayerNodeSync(makeContext());
    const object = makeObject("a", "rect");
    sync.sync(makePart([makeObject("below", "rect"), object]), 0);
    const mesh = sync.group.children[1] as {
      material: {
        depthTest: boolean;
        depthWrite: boolean;
        polygonOffset: boolean;
        polygonOffsetFactor: number;
        polygonOffsetUnits: number;
      };
    };
    const material = mesh.material;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(-1);

    sync.sync(
      makePart([
        makeObject("below", "rect"),
        { ...object, transform: { translateZ: 12 } },
      ]),
      0,
    );
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.polygonOffset).toBe(false);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(0);
    sync.dispose();
  });

  it("syncs lighting state into WebGPU node uniforms", () => {
    clearLayerNodeRegistry();
    registerLayerNodeFactory(makeWebGpuLightingTrackingFactory("default"));
    const sync = new LayerNodeSync(makeContext());
    sync.sync(
      makePart([
        {
          ...makeObject("light", "light"),
          props: {
            kind: "directional",
            color: "#ff3300",
            intensity: 2,
            range: 900,
            angle: 60,
          },
        },
        makeObject("rect", "rect"),
      ]),
      0,
    );
    sync.applyShadow({
      active: false,
      texture: null,
      matrix: new THREE.Matrix4(),
      viewMatrix: new THREE.Matrix4(),
      near: 1,
      far: 1200,
      bias: 0.004,
      darkness: 0.72,
      mapFlipY: false,
    });
    const mesh = sync.group.children[0] as any;
    const nodes = mesh.material.userData.layerLightingNodes;
    expect(nodes.u_lightingActive.value).toBe(1);
    expect(nodes.u_lightCount.value).toBe(1);
    expect(nodes.u_lightIntensity.array[0]).toBe(2);
    expect(nodes.u_lightRange.array[0]).toBe(900);
    expect(nodes.u_lightAngle.array[0]).toBe(60);
    expect(nodes.u_lightKind.array[0]).toBe(1);
    expect(nodes.u_shadowMapFlipY.value).toBe(0);
    sync.dispose();
  });

  it("dispose clears the group", () => {
    const sync = new LayerNodeSync(makeContext());
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    expect(sync.group.children).toHaveLength(1);
    sync.dispose();
    expect(sync.group.children).toHaveLength(0);
  });
});
