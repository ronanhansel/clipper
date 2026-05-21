import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { CameraObjectProps } from "../../../core/types";

const FULLSCREEN_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const FULLSCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const GOLDEN_ANGLE = 2.39996323;
const THIN_LENS_SAMPLES = 16;
const APERTURE_WORLD_SCALE = 0.02;

const COPY_VERTEX = `
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COPY_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_texture;

void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

const ACCUMULATE_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_previous;
uniform sampler2D u_current;
uniform float u_sampleIndex;

void main() {
  vec4 previous = texture(u_previous, v_uv);
  vec4 current = texture(u_current, v_uv);
  float amount = 1.0 / (u_sampleIndex + 1.0);
  fragColor = mix(previous, current, amount);
}
`;

type ThinLensRenderPassOptions = {
  width: number;
  height: number;
  getCamera: () => CameraObjectProps | null;
};

/**
 * Render-pass DoF. Unlike post-process blur, this jitters the camera over
 * an aperture disk, keeps every sample aimed at the same focus point, and
 * averages the actual scene renders. It is still rasterized, but it asks
 * the physically relevant question: what does the scene look like through
 * different points on the lens?
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ThinLensRenderPass extends (Pass as any) {
  readonly isRenderPass = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly camera: any;
  private readonly getCamera: () => CameraObjectProps | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly sampleTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private accumulationA: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private accumulationB: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly copyMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly copyScene: any;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    camera: any,
    options: ThinLensRenderPassOptions,
  ) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.getCamera = options.getCamera;
    this.needsSwap = false;
    this.clear = true;

    this.sampleTarget = makeThinLensTarget(
      options.width,
      options.height,
      "ThinLensSample",
      true,
    );
    this.accumulationA = makeThinLensTarget(
      options.width,
      options.height,
      "ThinLensAccumA",
      false,
    );
    this.accumulationB = makeThinLensTarget(
      options.width,
      options.height,
      "ThinLensAccumB",
      false,
    );

    this.accumulateMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERTEX,
      fragmentShader: ACCUMULATE_FRAGMENT,
      uniforms: {
        u_previous: { value: null },
        u_current: { value: null },
        u_sampleIndex: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      uniforms: {
        u_texture: { value: null },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.accumulateScene = makeFullscreenScene(this.accumulateMaterial);
    this.copyScene = makeFullscreenScene(this.copyMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.sampleTarget.setSize(w, h);
    this.accumulationA.setSize(w, h);
    this.accumulationB.setSize(w, h);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, _writeBuffer: any, readBuffer: any): void {
    const camera = this.getCamera();
    if (!hasActiveThinLensDof(camera)) {
      this.renderSingle(renderer, readBuffer);
      return;
    }

    const apertureRadiusWorld = getThinLensApertureRadiusWorld(camera);
    if (apertureRadiusWorld <= 0) {
      this.renderSingle(renderer, readBuffer);
      return;
    }

    const basePosition = this.camera.position.clone();
    const baseQuaternion = this.camera.quaternion.clone();
    const focusPoint = getFocusPoint(this.camera, camera.dof.focusDistance);

    for (let i = 0; i < THIN_LENS_SAMPLES; i++) {
      const sample = sampleDisk(i, THIN_LENS_SAMPLES);
      applyThinLensSample(
        this.camera,
        basePosition,
        baseQuaternion,
        focusPoint,
        apertureRadiusWorld,
        sample,
      );

      renderer.setRenderTarget(this.sampleTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.accumulateSample(renderer, i);
    }

    this.camera.position.copy(basePosition);
    this.camera.quaternion.copy(baseQuaternion);
    this.camera.updateMatrixWorld(true);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    this.copyMaterial.uniforms.u_texture.value = this.accumulationA.texture;
    renderer.render(this.copyScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.sampleTarget.dispose();
    this.accumulationA.dispose();
    this.accumulationB.dispose();
    this.accumulateMaterial.dispose();
    this.copyMaterial.dispose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderSingle(renderer: any, readBuffer: any): void {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private accumulateSample(renderer: any, sampleIndex: number): void {
    this.accumulateMaterial.uniforms.u_previous.value =
      this.accumulationA.texture;
    this.accumulateMaterial.uniforms.u_current.value =
      this.sampleTarget.texture;
    this.accumulateMaterial.uniforms.u_sampleIndex.value = sampleIndex;
    renderer.setRenderTarget(this.accumulationB);
    renderer.clear();
    renderer.render(this.accumulateScene, FULLSCREEN_CAMERA);
    const previous = this.accumulationA;
    this.accumulationA = this.accumulationB;
    this.accumulationB = previous;
  }
}

export function getThinLensApertureRadiusWorld(
  camera: CameraObjectProps,
): number {
  if (!hasActiveThinLensDof(camera)) return 0;
  const focusDistance = Math.max(camera.dof.focusDistance, 1);
  const fovRad = (camera.fov * Math.PI) / 180;
  const focalLengthMm = camera.sensor.height / (2 * Math.tan(fovRad * 0.5));
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return 0;
  const apertureRadiusMm =
    focalLengthMm / Math.max(camera.dof.fNumber, 0.1) / 2;
  const sceneHeightAtFocus = 2 * focusDistance * Math.tan(fovRad * 0.5);
  const sceneUnitsPerMm = sceneHeightAtFocus / camera.sensor.height;
  const radius =
    apertureRadiusMm *
    sceneUnitsPerMm *
    Math.max(camera.dof.blurLevel, 0) *
    APERTURE_WORLD_SCALE;
  const maxRadius = Math.max(1, camera.dof.maxBlurPx * 0.25);
  return Math.max(0, Math.min(maxRadius, radius));
}

function hasActiveThinLensDof(
  camera: CameraObjectProps | null,
): camera is CameraObjectProps {
  return Boolean(
    camera?.dof.enabled &&
    camera.dof.fNumber > 0 &&
    camera.dof.blurLevel > 0 &&
    camera.dof.maxBlurPx > 0 &&
    Number.isFinite(camera.dof.focusDistance) &&
    camera.dof.focusDistance > 0,
  );
}

function sampleDisk(i: number, n: number): InstanceType<typeof THREE.Vector2> {
  const r = Math.sqrt((i + 0.5) / n);
  const theta = i * GOLDEN_ANGLE;
  return new THREE.Vector2(Math.cos(theta) * r, Math.sin(theta) * r);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFocusPoint(camera: any, focusDistance: number): any {
  const focusPoint = new THREE.Vector3();
  camera.getWorldDirection(focusPoint);
  focusPoint.multiplyScalar(focusDistance);
  focusPoint.add(camera.position);
  return focusPoint;
}

function applyThinLensSample(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  camera: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  basePosition: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseQuaternion: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  focusPoint: any,
  apertureRadiusWorld: number,
  sample: InstanceType<typeof THREE.Vector2>,
): void {
  camera.position.copy(basePosition);
  camera.quaternion.copy(baseQuaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion);
  camera.position.addScaledVector(right, sample.x * apertureRadiusWorld);
  camera.position.addScaledVector(up, sample.y * apertureRadiusWorld);
  camera.lookAt(focusPoint);
  camera.updateMatrixWorld(true);
}

function makeThinLensTarget(
  width: number,
  height: number,
  name: string,
  depthBuffer: boolean,
) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  target.texture.name = name;
  return target;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFullscreenScene(material: any): any {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(FULLSCREEN_GEOMETRY, material));
  return scene;
}
