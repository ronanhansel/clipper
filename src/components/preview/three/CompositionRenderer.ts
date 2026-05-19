// `three` is declared as an untyped ambient module in `src/types/three.d.ts`,
// so type-position references like `THREE.Scene` aren't resolvable. We type
// the THREE-owned fields as `any` and rely on runtime values via the import
// below. Adapter implementations (Phase 4+) and the React wrapper (Phase 5+)
// receive `any`-typed objects, which matches the rest of the repo's usage.
import * as THREE from "three";
import type { CameraObjectProps, FrameObject } from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import type {
  FrameObjectAdapter,
  FrameObjectAdapterFactory,
} from "./adapters/types";

export interface CompositionRendererOptions {
  width: number;
  height: number;
  /**
   * If true, prefer creating an OffscreenCanvas-compatible renderer. Falls
   * back to a regular canvas if OffscreenCanvas is unavailable.
   * Default: false (for v1 we render to a regular canvas DOM element so it
   * can be parented directly).
   */
  preferOffscreen?: boolean;
}

/**
 * `CompositionRenderer` owns the Three.js Scene/Camera/Renderer for a
 * single composition. It is the *self-contained* render unit: feed it
 * FrameObjects + a CompositionCamera + a localTime, and read pixels off
 * `.canvas`. The Direct seam (Phase 5) consumes that canvas as a flat
 * source.
 *
 * This class does NOT touch React. A React wrapper will mount/unmount it
 * and call render() on each tick.
 */
export class CompositionRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly camera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly renderer: any;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;
  private factories: FrameObjectAdapterFactory[] = [];
  private adapters = new Map<string, FrameObjectAdapter>();

  constructor(opts: CompositionRendererOptions) {
    this.width = Math.max(1, Math.floor(opts.width));
    this.height = Math.max(1, Math.floor(opts.height));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      this.width / this.height,
      1,
      10000,
    );
    this.camera.position.set(0, 0, 1000);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement as HTMLCanvasElement;
  }

  setAdapterFactories(factories: FrameObjectAdapterFactory[]) {
    this.factories = factories;
  }

  setCamera(camera: CameraObjectProps | null) {
    this.compositionCamera = camera;
  }

  setViewport(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
  }

  /**
   * Diff incoming objects against the live adapter set. Adapters keyed by
   * FrameObject.id. Order is preserved by reading the `objects` array each
   * render; Three.js does its own depth-sorting so insertion order is not
   * critical for correctness, only for transparency tie-breaking.
   */
  setObjects(objects: FrameObject[]) {
    const incoming = new Set<string>();
    for (const obj of objects) {
      incoming.add(obj.id);
      const existing = this.adapters.get(obj.id);
      if (!existing) {
        const created = this.createAdapter(obj);
        if (!created) continue;
        this.adapters.set(obj.id, created);
        this.scene.add(created.object3D);
      }
    }
    for (const [id, adapter] of this.adapters) {
      if (!incoming.has(id)) {
        this.scene.remove(adapter.object3D);
        adapter.dispose();
        this.adapters.delete(id);
      }
    }
  }

  render(objects: FrameObject[], localTime: number) {
    applyCompositionCameraToThree(
      this.camera,
      this.compositionCamera,
      this.width / this.height,
    );
    for (const obj of objects) {
      const adapter = this.adapters.get(obj.id);
      if (adapter) adapter.update(obj, localTime);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const adapter of this.adapters.values()) {
      this.scene.remove(adapter.object3D);
      adapter.dispose();
    }
    this.adapters.clear();
    this.renderer.dispose();
  }

  private createAdapter(object: FrameObject): FrameObjectAdapter | null {
    for (const factory of this.factories) {
      const adapter = factory(object);
      if (adapter) return adapter;
    }
    return null;
  }
}
