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

function makeSpotLight(): FrameObject {
  return {
    ...makeLight(),
    props: {
      ...makeLight().props,
      kind: "spot",
      range: 900,
      angle: 50,
    },
  };
}

function makePointLight(): FrameObject {
  return {
    ...makeLight(),
    props: {
      ...makeLight().props,
      kind: "point",
      range: 700,
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

    // Each render pass renders to both the main and debug targets, so
    // the rendered array captures materials from both passes.  Only the
    // first pass's captures carry the real per-caster shadow materials.
    const firstPassRendered = rendered.slice(0, 2);
    expect(firstPassRendered).toEqual([
      { material: firstPassRendered[0].material, width: 10, height: 20 },
      { material: firstPassRendered[1].material, width: 30, height: 40 },
    ]);
    expect(firstPassRendered[0].material).not.toBe(
      firstPassRendered[1].material,
    );
    expect(first.material).toBe(originalFirstMaterial);
    expect(second.material).toBe(originalSecondMaterial);
    sync.dispose();
  });

  it("uses node shadow depth materials on the WebGPU backend", () => {
    const sync = new LayerShadowSync({ backend: "webgpu-node" });
    const layerRoot = new THREE.Group();
    const first = makeRectMesh("rect-1", new THREE.Vector2(10, 20));
    const second = makeRectMesh("rect-2", new THREE.Vector2(30, 40));
    layerRoot.add(first, second);

    const rendered: Array<{
      material: {
        isNodeMaterial?: boolean;
        userData: { webgpuLayerShadowMaterialPort?: string };
      };
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
          rendered.push({
            material: node.material as {
              isNodeMaterial?: boolean;
              userData: { webgpuLayerShadowMaterialPort?: string };
            },
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

    // Each render pass renders to both targets, so 4 entries total.
    // Check the first pass (first 2 entries).
    expect(rendered).toHaveLength(4);
    expect(rendered[0].material.isNodeMaterial).toBe(true);
    expect(rendered[1].material.isNodeMaterial).toBe(true);
    expect(rendered[0].material.userData.webgpuLayerShadowMaterialPort).toBe(
      "rounded-rect-depth",
    );
    expect(rendered[1].material.userData.webgpuLayerShadowMaterialPort).toBe(
      "rounded-rect-depth",
    );
    sync.dispose();
  });

  it("uses texture alpha shadow depth materials for WebGPU node materials", () => {
    const sync = new LayerShadowSync({ backend: "webgpu-node" });
    const layerRoot = new THREE.Group();
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 128]),
      1,
      1,
      THREE.RGBAFormat,
    );
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial();
    material.userData.layerShadowUniforms = {
      u_image: { value: texture },
      u_uvOrigin: { value: new THREE.Vector2(0, 0) },
      u_uvSize: { value: new THREE.Vector2(1, 1) },
      u_opacity: { value: 1 },
    };
    material.uniforms = {};
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.userData.frameObjectId = "image-1";
    layerRoot.add(mesh);

    const rendered: Array<{
      material: {
        isNodeMaterial?: boolean;
        userData: { webgpuLayerShadowMaterialPort?: string };
      };
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
          rendered.push({
            material: node.material as {
              isNodeMaterial?: boolean;
              userData: { webgpuLayerShadowMaterialPort?: string };
            },
          });
        });
      },
    };

    const state = sync.sync(
      makePart([
        makeLight(),
        {
          ...makeObject("image-1", { x: 0, y: 0, width: 10, height: 20 }),
          type: "image",
        },
      ]),
      0,
      renderer,
      layerRoot,
    );

    expect(state.mapFlipY).toBe(true);
    // Each render pass renders to both targets, so 2 entries total.
    expect(rendered).toHaveLength(2);
    expect(rendered[0].material.isNodeMaterial).toBe(true);
    expect(rendered[0].material.userData.webgpuLayerShadowMaterialPort).toBe(
      "texture-depth",
    );
    sync.dispose();
  });

  it("uses an orthographic light-space camera for directional shadows", () => {
    const sync = new LayerShadowSync();
    const layerRoot = new THREE.Group();
    layerRoot.add(makeRectMesh("rect-1", new THREE.Vector2(10, 20)));

    let renderedCamera: unknown = null;
    const renderer = {
      getRenderTarget: () => null,
      getClearColor: () => {},
      getClearAlpha: () => 1,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: (_root: InstanceType<typeof THREE.Group>, camera: unknown) => {
        renderedCamera = camera;
      },
    };

    sync.sync(
      makePart([
        makeLight(),
        makeObject("rect-1", { x: 0, y: 0, width: 10, height: 20 }),
      ]),
      0,
      renderer,
      layerRoot,
    );

    expect(renderedCamera).toBeInstanceOf(THREE.OrthographicCamera);
    const camera = renderedCamera as InstanceType<
      typeof THREE.OrthographicCamera
    >;
    const extent = Math.hypot(FRAME_WIDTH, FRAME_HEIGHT);
    expect(camera.left).toBe(-extent);
    expect(camera.right).toBe(extent);
    expect(camera.top).toBe(extent);
    expect(camera.bottom).toBe(-extent);
    expect(camera.far).toBe(6000);
    sync.dispose();
  });

  it("uses a perspective range-limited camera for spot shadows", () => {
    const sync = new LayerShadowSync();
    const layerRoot = new THREE.Group();
    layerRoot.add(makeRectMesh("rect-1", new THREE.Vector2(10, 20)));

    let renderedCamera: unknown = null;
    const renderer = {
      getRenderTarget: () => null,
      getClearColor: () => {},
      getClearAlpha: () => 1,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: (_root: InstanceType<typeof THREE.Group>, camera: unknown) => {
        renderedCamera = camera;
      },
    };

    sync.sync(
      makePart([
        makeSpotLight(),
        makeObject("rect-1", { x: 0, y: 0, width: 10, height: 20 }),
      ]),
      0,
      renderer,
      layerRoot,
    );

    expect(renderedCamera).toBeInstanceOf(THREE.PerspectiveCamera);
    const camera = renderedCamera as InstanceType<
      typeof THREE.PerspectiveCamera
    >;
    expect(camera.fov).toBe(50);
    expect(camera.far).toBe(900);
    sync.dispose();
  });

  it("uses a perspective range-limited camera for point shadows", () => {
    const sync = new LayerShadowSync();
    const layerRoot = new THREE.Group();
    layerRoot.add(makeRectMesh("rect-1", new THREE.Vector2(10, 20)));

    let renderedCamera: unknown = null;
    const renderer = {
      getRenderTarget: () => null,
      getClearColor: () => {},
      getClearAlpha: () => 1,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: (_root: InstanceType<typeof THREE.Group>, camera: unknown) => {
        renderedCamera = camera;
      },
    };

    sync.sync(
      makePart([
        makePointLight(),
        makeObject("rect-1", { x: 0, y: 0, width: 10, height: 20 }),
      ]),
      0,
      renderer,
      layerRoot,
    );

    expect(renderedCamera).toBeInstanceOf(THREE.PerspectiveCamera);
    const camera = renderedCamera as InstanceType<
      typeof THREE.PerspectiveCamera
    >;
    expect(camera.fov).toBe(90);
    expect(camera.far).toBe(700);
    sync.dispose();
  });

  it("reuses the shadow map when light and casters are unchanged", () => {
    const sync = new LayerShadowSync();
    const layerRoot = new THREE.Group();
    layerRoot.add(makeRectMesh("rect-1", new THREE.Vector2(10, 20)));

    let renderCount = 0;
    const renderer = {
      getRenderTarget: () => null,
      getClearColor: () => {},
      getClearAlpha: () => 1,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: () => {
        renderCount += 1;
      },
    };

    const part = makePart([
      makeLight(),
      makeObject("rect-1", { x: 0, y: 0, width: 10, height: 20 }),
    ]);
    sync.sync(part, 0, renderer, layerRoot);
    sync.sync(part, 1, renderer, layerRoot);

    // Each shadow map render produces 2 renderer.render calls (main + debug target).
    expect(renderCount).toBe(2);

    sync.sync(
      makePart([
        makeLight(),
        makeObject("rect-1", { x: 10, y: 0, width: 10, height: 20 }),
      ]),
      1,
      renderer,
      layerRoot,
    );

    expect(renderCount).toBe(4);
    sync.dispose();
  });
});
