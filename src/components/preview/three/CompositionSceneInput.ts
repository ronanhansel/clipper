import * as THREE from "three";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { getCameraObjectPropsSignature } from "./cameraObjectSignature";
import { LayerNodeSync } from "./layers/LayerNodeSync";
import {
  LayerShadowSync,
  type LayerShadowDebugImage,
  type LayerShadowDiagnostics,
} from "./layers/LayerShadowSync";
import { SharedCaptureCanvas } from "./SharedCaptureCanvas";

export type CompositionSceneInputOptions = {
  width: number;
  height: number;
  requestRender: () => void;
};

const FAR_PLANE_CLIP_OFFSET = 1;
const FAR_PLANE_OVERSCAN = 1.1;

export class CompositionSceneInput {
  readonly scene: InstanceType<typeof THREE.Scene>;
  readonly camera: InstanceType<typeof THREE.PerspectiveCamera>;
  readonly layerSync: LayerNodeSync;

  private readonly width: number;
  private readonly height: number;
  private readonly sharedCapture: SharedCaptureCanvas;
  private readonly shadowSync: LayerShadowSync;
  private readonly backgroundMesh: InstanceType<typeof THREE.Mesh>;
  private sourceElement: Element | null = null;
  private compositionCamera: CameraObjectProps | null = null;
  private compositionCameraSignature = "";
  private lastComposition: {
    part: CompositionClip | null;
    localTime: number;
    sourceElement: Element | null;
    options: { syncShadows?: boolean; isPlaying?: boolean };
  } | null = null;

  constructor(options: CompositionSceneInputOptions) {
    this.width = options.width;
    this.height = options.height;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_OBJECT_PROPS.fov,
      this.width / this.height,
      DEFAULT_CAMERA_OBJECT_PROPS.near,
      DEFAULT_CAMERA_OBJECT_PROPS.far,
    );

    this.sharedCapture = new SharedCaptureCanvas(FRAME_WIDTH, FRAME_HEIGHT);
    this.layerSync = new LayerNodeSync({
      materialBackend: "webgpu-node",
      sharedCapture: this.sharedCapture,
      sourceRoot: () => this.sourceElement,
      requestRender: options.requestRender,
    });
    this.scene.add(this.layerSync.group);
    this.shadowSync = new LayerShadowSync({ backend: "webgpu-node" });

    this.backgroundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
        transparent: false,
      }),
    );
    this.backgroundMesh.name = "CompositionFarPlane";
    this.backgroundMesh.renderOrder = -1000;
    this.scene.add(this.backgroundMesh);
    this.applyCamera(DEFAULT_CAMERA_OBJECT_PROPS);
  }

  get captureCanvas(): HTMLCanvasElement {
    return this.sharedCapture.canvas;
  }

  get currentCamera(): CameraObjectProps | null {
    return this.compositionCamera;
  }

  applyCamera(camera: CameraObjectProps | null) {
    const signature = getCameraObjectPropsSignature(camera);
    if (signature === this.compositionCameraSignature) return;
    this.compositionCameraSignature = signature;
    this.compositionCamera = camera;
    applyCompositionCameraToThree(
      this.camera,
      camera,
      this.width / this.height,
    );
    this.syncBackgroundMeshToCamera();
  }

  syncBackgroundMeshToCamera() {
    const distance = Math.max(
      this.camera.near,
      this.camera.far - FAR_PLANE_CLIP_OFFSET,
    );
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion,
    );
    this.backgroundMesh.position
      .copy(this.camera.position)
      .addScaledVector(forward, distance);
    this.backgroundMesh.quaternion.copy(this.camera.quaternion);

    const height =
      2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * distance;
    this.backgroundMesh.scale.set(
      height * this.camera.aspect * FAR_PLANE_OVERSCAN,
      height * FAR_PLANE_OVERSCAN,
      1,
    );
    this.backgroundMesh.updateMatrixWorld(true);
  }

  syncComposition(
    part: CompositionClip | null,
    localTime: number,
    sourceElement: Element | null,
    renderer: unknown,
    rendererInitialized: boolean,
    options: { syncShadows?: boolean; isPlaying?: boolean } = {},
  ) {
    this.lastComposition = { part, localTime, sourceElement, options };
    if (sourceElement !== this.sourceElement) {
      this.sourceElement = sourceElement;
      this.sharedCapture.prepare(sourceElement);
    }
    this.layerSync.sync(part, localTime, { isPlaying: options.isPlaying });
    if (!rendererInitialized) {
      this.layerSync.applyShadow(this.shadowSync.getState());
      return;
    }
    if (options.syncShadows === false) {
      this.layerSync.applyShadow(this.shadowSync.getState());
      return;
    }
    const shadow = this.shadowSync.sync(
      part,
      localTime,
      renderer,
      this.layerSync.group,
    );
    this.layerSync.applyShadow(shadow);
  }

  renderSnapshot(renderer: unknown, rendererInitialized: boolean) {
    if (!this.lastComposition) return false;
    this.syncComposition(
      this.lastComposition.part,
      this.lastComposition.localTime,
      this.lastComposition.sourceElement,
      renderer,
      rendererInitialized,
      this.lastComposition.options,
    );
    return true;
  }

  getShadowDiagnostics(): LayerShadowDiagnostics {
    return this.shadowSync.getDiagnostics();
  }

  readShadowDebugImageData(
    renderer: unknown,
    size: number,
  ): LayerShadowDebugImage | null {
    return this.shadowSync.readDebugImageData(renderer, size);
  }

  getCachedShadowDebugImage(): LayerShadowDebugImage | null {
    return this.shadowSync.getCachedDebugImage();
  }

  dispose() {
    this.scene.remove(this.layerSync.group);
    this.layerSync.dispose();
    this.shadowSync.dispose();
    this.scene.remove(this.backgroundMesh);
    this.backgroundMesh.geometry.dispose();
    this.backgroundMesh.material.dispose();
    this.sharedCapture.dispose();
  }
}
