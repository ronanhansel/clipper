import * as THREE from "three/webgpu";
import * as tsl from "three/tsl";
import { compileComposition3dGraphToTsl } from "./tslCompiler";
import type { Composition3dGraph } from "./types";

export type Composition3dWebGlCoreOptions = {
  graph: Composition3dGraph;
  root: HTMLElement;
  width: number;
  height: number;
  loadTexture?: (asset: string) => unknown;
};

export function createComposition3dWebGlCore({ graph, root, width, height, loadTexture = defaultLoadTexture }: Composition3dWebGlCoreOptions) {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(width, height);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = compileComposition3dGraphToTsl(graph, { tsl, loadTexture }) as never;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  let disposed = false;
  renderer.setAnimationLoop(() => {
    if (!disposed) void renderer.renderAsync(scene, camera);
  });

  return () => {
    disposed = true;
    renderer.setAnimationLoop(null);
    mesh.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function defaultLoadTexture(asset: string) {
  return new THREE.TextureLoader().load(asset);
}
