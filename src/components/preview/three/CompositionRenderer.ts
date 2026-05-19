import * as THREE from "three";
import {
  CSS3DRenderer,
  CSS3DObject,
} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";

export interface CompositionRendererOptions {
  width: number;
  height: number;
}

/**
 * `CompositionRenderer` is the through-camera renderer for a single
 * composition. It shows the composition's flat output as seen from the
 * active `CameraObjectProps`. Used by Direct mode (sealed output) and
 * the compose-mode camera PIP.
 *
 * Like `ThreeAuthorScene`, it stacks a CSS3D layer (the live composition
 * DOM as a flat plane at z=0) under a transparent WebGL canvas. The
 * WebGL canvas is reserved for any future genuinely-3D scene contents
 * (extruded text, mesh imports). For v1 the WebGL canvas only clears.
 *
 * The composition DOM itself is supplied externally via
 * `setCompositionElement` so the React owner can mount its own
 * `DomBackend` and hand the host element in. That's how every
 * FrameObject type renders for free — text, path, code, svg, pattern2d,
 * etc. — without per-type adapters.
 */
export class CompositionRenderer {
  readonly hostRoot: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly css3dRoot: HTMLDivElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly camera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly renderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cssRenderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private compositionPlane: any | null = null;
  private compositionElement: HTMLElement | null = null;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;

  constructor(opts: CompositionRendererOptions) {
    this.width = Math.max(1, Math.floor(opts.width));
    this.height = Math.max(1, Math.floor(opts.height));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_OBJECT_PROPS.fov,
      this.width / this.height,
      DEFAULT_CAMERA_OBJECT_PROPS.near,
      DEFAULT_CAMERA_OBJECT_PROPS.far,
    );
    applyCompositionCameraToThree(
      this.camera,
      DEFAULT_CAMERA_OBJECT_PROPS,
      this.width / this.height,
    );

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
    this.canvas = this.renderer.domElement as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";

    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(this.width, this.height);
    this.css3dRoot = this.cssRenderer.domElement as HTMLDivElement;
    this.css3dRoot.style.position = "absolute";
    this.css3dRoot.style.inset = "0";
    this.css3dRoot.style.width = "100%";
    this.css3dRoot.style.height = "100%";
    this.css3dRoot.style.pointerEvents = "none";

    this.hostRoot = document.createElement("div");
    this.hostRoot.style.position = "absolute";
    this.hostRoot.style.inset = "0";
    this.hostRoot.style.overflow = "hidden";
    this.hostRoot.appendChild(this.css3dRoot);
    this.hostRoot.appendChild(this.canvas);
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
    this.cssRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCompositionElement(element: HTMLElement | null) {
    if (this.compositionElement === element) return;
    this.compositionElement = element;
    if (this.compositionPlane) {
      this.scene.remove(this.compositionPlane);
      this.compositionPlane = null;
    }
    if (element) {
      element.style.width = `${FRAME_WIDTH}px`;
      element.style.height = `${FRAME_HEIGHT}px`;
      element.style.transformOrigin = "center center";
      const obj = new CSS3DObject(element);
      obj.position.set(0, 0, 0);
      this.compositionPlane = obj;
      this.scene.add(obj);
    }
  }

  render() {
    applyCompositionCameraToThree(
      this.camera,
      this.compositionCamera,
      this.width / this.height,
    );
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.compositionPlane) {
      this.scene.remove(this.compositionPlane);
      this.compositionPlane = null;
    }
    this.compositionElement = null;
    this.renderer.dispose();
  }
}
