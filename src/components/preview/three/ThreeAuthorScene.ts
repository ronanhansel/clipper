import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
  type FrameObject,
} from "../../../core/types";
import {
  DEFAULT_FRAME_OBJECT_ADAPTERS,
  type FrameObjectAdapter,
  type FrameObjectAdapterFactory,
} from "./adapters";
import { applyCompositionCameraToThree } from "./compositionCameraThree";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface ThreeAuthorSceneOptions {
  width: number;
  height: number;
}

/**
 * `ThreeAuthorScene` is the AE-style 3D author viewport: orbit camera,
 * scene contents as planes, the active camera shown as a wireframe frustum
 * (`THREE.CameraHelper`) with a TransformControls gizmo for direct
 * manipulation. The author view is a sibling of `CompositionRenderer` —
 * they share adapter logic but otherwise live independently.
 *
 * Rendering is React-driven by default: parent re-runs setObjects /
 * setActiveCamera / render() whenever upstream state changes. Orbit drags
 * and gizmo drags drive their own animation frame loop while active so
 * input feels immediate; on idle the loop stops to save CPU.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject3D = any;

export class ThreeAuthorScene {
  readonly canvas: HTMLCanvasElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orbitCamera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private throughCamera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraGizmoTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orbit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transform: any;

  private factories: FrameObjectAdapterFactory[] =
    DEFAULT_FRAME_OBJECT_ADAPTERS;
  private adapters = new Map<string, FrameObjectAdapter>();

  private width: number;
  private height: number;
  private dragCallback: ((p: CameraObjectProps) => void) | null = null;
  private dragStateCallback: ((active: boolean) => void) | null = null;
  private activeProps: CameraObjectProps = { ...DEFAULT_CAMERA_OBJECT_PROPS };
  private isAttached = false;
  private rafHandle = 0;
  private lastObjects: FrameObject[] | null = null;

  constructor(opts: ThreeAuthorSceneOptions) {
    this.width = Math.max(1, Math.floor(opts.width));
    this.height = Math.max(1, Math.floor(opts.height));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1117);

    // Orbit camera framing roughly the comp's frame at z=0.
    this.orbitCamera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      1,
      40000,
    );
    this.orbitCamera.position.set(0, 0, 3500);

    // Through camera mirrors the comp's authored CameraObjectProps.
    this.throughCamera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_OBJECT_PROPS.fov,
      this.width / this.height,
      DEFAULT_CAMERA_OBJECT_PROPS.near,
      DEFAULT_CAMERA_OBJECT_PROPS.far,
    );
    this.scene.add(this.throughCamera);

    // Wireframe frustum that mirrors throughCamera. `CameraHelper` updates
    // when we call `cameraHelper.update()` after the source camera changes.
    this.cameraHelper = new THREE.CameraHelper(this.throughCamera);
    this.cameraHelper.visible = false;
    this.scene.add(this.cameraHelper);

    // Gizmo target — invisible Object3D that sits at the camera's transform.
    // We attach TransformControls to this, then mirror its transform back
    // to the camera + emit the new CameraObjectProps.
    this.cameraGizmoTarget = new THREE.Object3D();
    this.scene.add(this.cameraGizmoTarget);

    // Renderer + canvas.
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    this.renderer.setSize(this.width, this.height, false);
    this.canvas = this.renderer.domElement as HTMLCanvasElement;

    // Orbit controls — must instantiate AFTER canvas exists.
    this.orbit = new OrbitControls(this.orbitCamera, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.addEventListener("change", () => this.requestRender());

    // Transform controls (gizmo).
    this.transform = new TransformControls(this.orbitCamera, this.canvas);
    this.transform.setSize(0.9);
    this.transform.setSpace("world");
    // Disable orbit while dragging gizmo.
    this.transform.addEventListener(
      "dragging-changed",
      (event: { value: boolean }) => {
        this.orbit.enabled = !event.value;
        if (this.dragStateCallback) this.dragStateCallback(event.value);
        this.requestRender();
      },
    );
    this.transform.addEventListener("objectChange", () => {
      this.commitGizmoTransformToProps();
      this.requestRender();
    });
    this.scene.add(this.transform);

    // Light haze + grid for orientation.
    const grid = new THREE.GridHelper(4000, 20, 0x33384a, 0x222632);
    grid.rotation.x = Math.PI / 2; // Lay flat on z=0 plane.
    this.scene.add(grid);

    this.requestRender();
  }

  setViewport(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.orbitCamera.aspect = w / h;
    this.orbitCamera.updateProjectionMatrix();
    this.throughCamera.aspect = w / h;
    this.throughCamera.updateProjectionMatrix();
    this.requestRender();
  }

  setObjects(objects: FrameObject[]) {
    if (objects === this.lastObjects) {
      this.requestRender();
      return;
    }
    this.lastObjects = objects;
    const incoming = new Set<string>();
    for (const obj of objects) {
      if (obj.type === "camera") continue; // handled by the helper, not adapters
      incoming.add(obj.id);
      let adapter = this.adapters.get(obj.id);
      if (!adapter) {
        const made = this.createAdapter(obj);
        if (!made) continue;
        adapter = made;
        this.adapters.set(obj.id, adapter);
        this.scene.add(adapter.object3D as AnyObject3D);
      }
      adapter.update(obj, 0);
    }
    for (const [id, adapter] of this.adapters) {
      if (!incoming.has(id)) {
        this.scene.remove(adapter.object3D as AnyObject3D);
        adapter.dispose();
        this.adapters.delete(id);
      }
    }
    this.requestRender();
  }

  setActiveCamera(camera: CameraObjectProps | null) {
    const visible = camera != null;
    this.cameraHelper.visible = visible;
    if (camera) {
      this.activeProps = { ...camera };
      applyCompositionCameraToThree(
        this.throughCamera,
        camera,
        this.width / this.height,
      );
      // Mirror to gizmo target. The author scene is y-up but Clipper coords
      // are y-down; applyCompositionCameraToThree already negates y on the
      // camera. Mirror the same to the gizmo target.
      this.cameraGizmoTarget.position.set(
        camera.position.x,
        -camera.position.y,
        camera.position.z,
      );
      this.cameraGizmoTarget.rotation.order = "XYZ";
      this.cameraGizmoTarget.rotation.x = -camera.rotation.x * DEG_TO_RAD;
      this.cameraGizmoTarget.rotation.y = camera.rotation.y * DEG_TO_RAD;
      this.cameraGizmoTarget.rotation.z = -camera.rotation.z * DEG_TO_RAD;
      this.cameraHelper.update();
    } else {
      // Detach gizmo if no camera.
      if (this.isAttached) {
        this.transform.detach();
        this.isAttached = false;
      }
    }
    this.requestRender();
  }

  setSelectedCameraObjectId(id: string | null) {
    if (id == null) {
      if (this.isAttached) {
        this.transform.detach();
        this.isAttached = false;
        this.requestRender();
      }
      return;
    }
    if (!this.isAttached) {
      this.transform.attach(this.cameraGizmoTarget);
      this.isAttached = true;
      this.requestRender();
    }
  }

  setMode(mode: "translate" | "rotate") {
    this.transform.setMode(mode);
    this.requestRender();
  }

  onCameraDrag(callback: (props: CameraObjectProps) => void) {
    this.dragCallback = callback;
  }

  onDragStateChange(callback: (active: boolean) => void) {
    this.dragStateCallback = callback;
  }

  /** Force a render. Idempotent. */
  render() {
    this.renderer.render(this.scene, this.orbitCamera);
  }

  dispose() {
    cancelAnimationFrame(this.rafHandle);
    this.transform.detach();
    this.transform.dispose();
    this.orbit.dispose();
    for (const adapter of this.adapters.values()) {
      this.scene.remove(adapter.object3D as AnyObject3D);
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

  private commitGizmoTransformToProps() {
    const t = this.cameraGizmoTarget;
    const pos = {
      x: t.position.x,
      y: -t.position.y, // back to Clipper y-down
      z: t.position.z,
    };
    const rot = {
      x: -t.rotation.x * RAD_TO_DEG,
      y: t.rotation.y * RAD_TO_DEG,
      z: -t.rotation.z * RAD_TO_DEG,
    };
    const next: CameraObjectProps = {
      ...this.activeProps,
      position: pos,
      rotation: rot,
    };
    this.activeProps = next;
    // Mirror to throughCamera + helper so the wireframe tracks live.
    applyCompositionCameraToThree(
      this.throughCamera,
      next,
      this.width / this.height,
    );
    this.cameraHelper.update();
    if (this.dragCallback) this.dragCallback(next);
  }

  private requestRender() {
    if (this.rafHandle) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = 0;
      this.orbit.update();
      this.render();
    });
  }
}
