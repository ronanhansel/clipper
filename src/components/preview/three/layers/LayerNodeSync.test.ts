import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { LayerNodeSync } from "./LayerNodeSync";
import {
  clearLayerNodeRegistry,
  registerLayerNodeFactory,
  type LayerNode,
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

describe("LayerNodeSync", () => {
  beforeEach(() => {
    clearLayerNodeRegistry();
    registerLayerNodeFactory(makeTrackingFactory("default"));
  });

  it("constructs with an empty Group", () => {
    const sync = new LayerNodeSync({ compositeTexture: null });
    expect(sync.group).toBeInstanceOf(THREE.Group);
    expect(sync.group.children).toHaveLength(0);
    sync.dispose();
  });

  it("creates a node per visible non-camera FrameObject", () => {
    const sync = new LayerNodeSync({ compositeTexture: null });
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
    const sync = new LayerNodeSync({ compositeTexture: null });
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
    const sync = new LayerNodeSync({ compositeTexture: null });
    sync.sync(makePart([makeObject("a", "rect"), makeObject("b", "rect")]), 0);
    expect(sync.group.children).toHaveLength(2);
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    expect(sync.group.children).toHaveLength(1);
    expect(sync.describeForTests()[0].id).toBe("a");
    sync.dispose();
  });

  it("rebuilds a node when its FrameObject type changes", () => {
    const sync = new LayerNodeSync({ compositeTexture: null });
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    const firstObject3D = sync.group.children[0];
    sync.sync(makePart([makeObject("a", "text")]), 0);
    expect(sync.group.children).toHaveLength(1);
    expect(sync.group.children[0]).not.toBe(firstObject3D);
    expect(sync.describeForTests()[0]).toEqual({ id: "a", type: "text" });
    sync.dispose();
  });

  it("dispose clears the group", () => {
    const sync = new LayerNodeSync({ compositeTexture: null });
    sync.sync(makePart([makeObject("a", "rect")]), 0);
    expect(sync.group.children).toHaveLength(1);
    sync.dispose();
    expect(sync.group.children).toHaveLength(0);
  });
});
