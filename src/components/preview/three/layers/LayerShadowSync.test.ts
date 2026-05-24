import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LayerShadowSync } from "./LayerShadowSync";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type FrameObject,
} from "../../../../core/types";

function makeObject(
  id: string,
  bounds: { x: number; y: number; width: number; height: number },
): FrameObject {
  return {
    id,
    name: id,
    type: "rect",
    selector: `[data-id='${id}']`,
    bounds,
    style: {},
    transform: {},
    props: {},
  };
}

function makeLight(): FrameObject {
  return {
    id: "light-1",
    name: "light-1",
    type: "light",
    selector: "[data-id='light-1']",
    bounds: { x: 30, y: 70, width: 40, height: 40 },
    style: {},
    transform: { translateZ: 600 },
    props: {
      kind: "directional",
      color: "#fff4d6",
      intensity: 1,
      castShadow: true,
      target: { x: -490, y: 220, z: 0 },
      range: 1200,
      angle: 175,
      softness: 0.25,
      debug: true,
    },
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

function makeRectMesh(
  id: string,
  size: InstanceType<typeof THREE.Vector2>,
): InstanceType<typeof THREE.Mesh> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_color: { value: new THREE.Vector4(1, 1, 1, 1) },
      u_size: { value: size },
      u_radius: { value: 0 },
      u_opacity: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.userData.frameObjectId = id;
  return mesh;
}

describe("LayerShadowSync", () => {
  it("keeps per-caster rounded rect uniforms during the shadow pass", () => {
    const sync = new LayerShadowSync();
    const layerRoot = new THREE.Group();
    const first = makeRectMesh("rect-1", new THREE.Vector2(10, 20));
    const second = makeRectMesh("rect-2", new THREE.Vector2(30, 40));
    layerRoot.add(first, second);

    const originalFirstMaterial = first.material;
    const originalSecondMaterial = second.material;
    const rendered: Array<{
      material: InstanceType<typeof THREE.ShaderMaterial>;
      width: number;
      height: number;
    }> = [];
    const renderer = {
      getRenderTarget: () => null,
      getClearColor: () => {},
      getClearAlpha: () => 1,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: (root: InstanceType<typeof THREE.Group>) => {
        root.traverse((node: InstanceType<typeof THREE.Object3D>) => {
          if (!(node instanceof THREE.Mesh) || !node.visible) return;
          const material = node.material as InstanceType<
            typeof THREE.ShaderMaterial
          >;
          rendered.push({
            material,
            width: material.uniforms.u_size.value.x,
            height: material.uniforms.u_size.value.y,
          });
        });
      },
    };

    sync.sync(
      makePart([
        makeLight(),
        makeObject("rect-1", { x: 0, y: 0, width: 10, height: 20 }),
        makeObject("rect-2", { x: 0, y: 0, width: 30, height: 40 }),
      ]),
      0,
      renderer,
      layerRoot,
    );

    expect(rendered).toEqual([
      { material: rendered[0].material, width: 10, height: 20 },
      { material: rendered[1].material, width: 30, height: 40 },
    ]);
    expect(rendered[0].material).not.toBe(rendered[1].material);
    expect(first.material).toBe(originalFirstMaterial);
    expect(second.material).toBe(originalSecondMaterial);
    sync.dispose();
  });
});
