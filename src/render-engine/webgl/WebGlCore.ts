import * as THREE from "three/webgpu";
import * as tsl from "three/tsl";
import { compileComposition3dGraphToTsl } from "../../core/composition3d/tslCompiler";
import { editorGraphToComposition3dGraph } from "../../core/composition3d/editorGraph";
import type { Composition3dGraph } from "../../core/composition3d/types";
import type { Composition3dGraphState } from "../../core/types";

export class WebGlCore {
  private camera: unknown = null;
  private disposed = false;
  private material: unknown = null;
  private mesh: unknown = null;
  private hasCompiledGraph = false;
  private previousGraph: Composition3dGraphState | undefined;
  private renderer: unknown = null;
  private scene: unknown = null;
  private timeUniform: { value: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async init() {
    const renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    await renderer.init();
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const material = new THREE.MeshBasicNodeMaterial();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    this.camera = camera;
    this.material = material;
    this.mesh = mesh;
    this.renderer = renderer;
    this.scene = scene;
    this.timeUniform = tsl.uniform(0) as { value: number };
  }

  resize(width: number, height: number) {
    if (!this.renderer || this.disposed) return;
    (
      this.renderer as {
        setSize: (width: number, height: number, updateStyle?: boolean) => void;
      }
    ).setSize(width, height, false);
  }

  render(graph: Composition3dGraphState | undefined, time: number) {
    if (
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.material ||
      this.disposed
    )
      return;
    if (this.timeUniform) this.timeUniform.value = time;
    if (!this.hasCompiledGraph || graph !== this.previousGraph) {
      const material = this.material as {
        colorNode: unknown;
        needsUpdate: boolean;
      };
      material.colorNode = compileMaterialColorNode(graph, this.timeUniform);
      material.needsUpdate = true;
      this.hasCompiledGraph = true;
      this.previousGraph = graph;
    }
    void (
      this.renderer as {
        renderAsync: (scene: unknown, camera: unknown) => Promise<unknown>;
      }
    ).renderAsync(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    (
      this.mesh as { geometry?: { dispose?: () => void } } | null
    )?.geometry?.dispose?.();
    (this.material as { dispose?: () => void } | null)?.dispose?.();
    (this.renderer as { dispose?: () => void } | null)?.dispose?.();
    this.camera = null;
    this.material = null;
    this.mesh = null;
    this.scene = null;
    this.renderer = null;
    this.timeUniform = null;
  }
}

function compileMaterialColorNode(
  graph: Composition3dGraphState | undefined,
  timeUniform: unknown,
) {
  const compilerGraph = getCompilerGraph(graph);
  return compileComposition3dGraphToTsl(compilerGraph, {
    tsl,
    time: timeUniform,
    loadTexture: (asset) => new THREE.TextureLoader().load(asset),
  });
}

function getCompilerGraph(
  graph: Composition3dGraphState | undefined,
): Composition3dGraph {
  const candidate = editorGraphToComposition3dGraph(graph);
  if (candidate && isCompilerGraph(candidate)) return candidate;
  return defaultCompilerGraph;
}

function isCompilerGraph(value: unknown): value is Composition3dGraph {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { nodes?: unknown }).nodes) &&
    typeof (value as { outNodeId?: unknown }).outNodeId === "string",
  );
}

const defaultCompilerGraph: Composition3dGraph = {
  version: 1,
  outNodeId: "out",
  nodes: [
    { id: "color", kind: "color", params: { value: [0.18, 0.75, 0.42, 1] } },
    { id: "out", kind: "out", inputs: { color: { nodeId: "color" } } },
  ],
};
