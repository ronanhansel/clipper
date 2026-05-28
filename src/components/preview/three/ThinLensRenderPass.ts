import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { Fn, mix, texture, uniform, uv } from "three/tsl";
import {
  CAMERA_DOF_MAX_BLUR_PX,
  CAMERA_DOF_MIN_F_NUMBER,
  type CameraBokehPreset,
  type CameraObjectProps,
} from "../../../core/types";
import type { CompositionSceneInput } from "./CompositionSceneInput";

const GOLDEN_ANGLE = 2.39996323;
export const THIN_LENS_SAMPLES = 64;
const APERTURE_WORLD_SCALE = 0.02;
const MIN_BLUR_CAP_DEPTH = 100;

type ThinLensRenderPassOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: any;
  sceneInput: CompositionSceneInput;
  width: number;
  height: number;
  name: string;
};

export class ThinLensRenderPass {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly outputNode: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly renderer: any;
  private readonly sceneInput: CompositionSceneInput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly sampleTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulationA: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulationB: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly sampleWeight: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateAToBPipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateBToAPipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly copyBToAPipeline: any;

  constructor(options: ThinLensRenderPassOptions) {
    this.renderer = options.renderer;
    this.sceneInput = options.sceneInput;
    this.sampleTarget = makeThinLensTarget(
      options.width,
      options.height,
      `${options.name}:sample`,
      true,
    );
    this.accumulationA = makeThinLensTarget(
      options.width,
      options.height,
      `${options.name}:accum-a`,
      false,
    );
    this.accumulationB = makeThinLensTarget(
      options.width,
      options.height,
      `${options.name}:accum-b`,
      false,
    );
    this.sampleWeight = uniform(1);
    this.accumulateAToBPipeline = makePipeline(
      this.renderer,
      createAccumulateNode(
        this.accumulationA.texture,
        this.sampleTarget.texture,
        this.sampleWeight,
      ),
    );
    this.accumulateBToAPipeline = makePipeline(
      this.renderer,
      createAccumulateNode(
        this.accumulationB.texture,
        this.sampleTarget.texture,
        this.sampleWeight,
      ),
    );
    this.copyBToAPipeline = makePipeline(
      this.renderer,
      texture(this.accumulationB.texture),
    );
    this.outputNode = texture(this.accumulationA.texture);
  }

  render(camera: CameraObjectProps): void {
    const apertureRadiusWorld = getThinLensApertureRadiusWorld(
      camera,
      this.sampleTarget.height,
    );
    const previousTarget = this.renderer.getRenderTarget?.() ?? null;
    if (apertureRadiusWorld <= 0) {
      this.renderSingleSample(previousTarget);
      return;
    }

    const renderCamera = this.sceneInput.camera;
    const basePosition = renderCamera.position.clone();
    const baseQuaternion = renderCamera.quaternion.clone();
    const focusDistance = getThinLensFocusDistance(camera);
    const focusPoint = getFocusPoint(renderCamera, focusDistance);
    let accumulationIsA = true;

    this.clearTarget(this.accumulationA);
    this.clearTarget(this.accumulationB);

    for (let i = 0; i < THIN_LENS_SAMPLES; i += 1) {
      const sample = sampleThinLensAperture(
        i,
        THIN_LENS_SAMPLES,
        camera.dof.bokeh.preset,
      );
      applyThinLensSample(
        renderCamera,
        basePosition,
        baseQuaternion,
        focusPoint,
        apertureRadiusWorld,
        sample,
      );
      this.sceneInput.syncBackgroundMeshToCamera();
      this.renderSceneTo(this.sampleTarget);
      this.sampleWeight.value = 1 / (i + 1);
      if (accumulationIsA) {
        this.renderPipelineTo(this.accumulateAToBPipeline, this.accumulationB);
        accumulationIsA = false;
      } else {
        this.renderPipelineTo(this.accumulateBToAPipeline, this.accumulationA);
        accumulationIsA = true;
      }
    }

    if (!accumulationIsA) {
      this.renderPipelineTo(this.copyBToAPipeline, this.accumulationA);
    }

    renderCamera.position.copy(basePosition);
    renderCamera.quaternion.copy(baseQuaternion);
    renderCamera.updateMatrixWorld(true);
    this.sceneInput.syncBackgroundMeshToCamera();
    this.renderer.setRenderTarget(previousTarget);
  }

  dispose(): void {
    this.sampleTarget.dispose();
    this.accumulationA.dispose();
    this.accumulationB.dispose();
    this.accumulateAToBPipeline.dispose();
    this.accumulateBToAPipeline.dispose();
    this.copyBToAPipeline.dispose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clearTarget(target: any): void {
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderSceneTo(target: any): void {
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.sceneInput.scene, this.sceneInput.camera);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderPipelineTo(pipeline: any, target: any): void {
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    pipeline.render();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderSingleSample(previousTarget: any): void {
    this.sceneInput.syncBackgroundMeshToCamera();
    this.renderSceneTo(this.accumulationA);
    this.renderer.setRenderTarget(previousTarget);
  }
}

export function hasActiveThinLensDof(
  camera: CameraObjectProps | null,
): camera is CameraObjectProps {
  return Boolean(
    camera?.dof.enabled &&
    camera.dof.fNumber > 0 &&
    camera.dof.maxBlurPx > 0 &&
    Number.isFinite(camera.dof.focusDistance) &&
    camera.dof.focusDistance >= 0,
  );
}

export function getThinLensApertureRadiusWorld(
  camera: CameraObjectProps,
  resolutionHeight = 1080,
): number {
  if (!hasActiveThinLensDof(camera)) return 0;
  const focusDistance = getThinLensFocusDistance(camera);
  const fovRad = (camera.fov * Math.PI) / 180;
  const focalLengthMm = getThinLensFocalLengthMm(camera, fovRad);
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return 0;
  const apertureRadiusMm =
    focalLengthMm / Math.max(camera.dof.fNumber, CAMERA_DOF_MIN_F_NUMBER) / 2;
  const sceneHeightAtFocus = 2 * focusDistance * Math.tan(fovRad * 0.5);
  const sceneUnitsPerMm = sceneHeightAtFocus / camera.sensor.height;
  const radius = apertureRadiusMm * sceneUnitsPerMm * APERTURE_WORLD_SCALE;
  const maxRadius = getThinLensMaxBlurRadiusWorld(
    camera,
    focusDistance,
    fovRad,
    resolutionHeight,
  );
  return Math.max(0, Math.min(maxRadius, radius));
}

export function getThinLensFocusDistance(camera: CameraObjectProps): number {
  const fovRad = (camera.fov * Math.PI) / 180;
  const focalLengthMm = getThinLensFocalLengthMm(camera, fovRad);
  const minDistance =
    Number.isFinite(focalLengthMm) && focalLengthMm > 0
      ? focalLengthMm * 1.01
      : 1;
  return Math.max(camera.dof.focusDistance, minDistance);
}

function getThinLensFocalLengthMm(
  camera: CameraObjectProps,
  fovRad = (camera.fov * Math.PI) / 180,
): number {
  return camera.sensor.height / (2 * Math.tan(fovRad * 0.5));
}

export function getThinLensMaxBlurRadiusWorld(
  camera: CameraObjectProps,
  focusDistance = Math.max(camera.dof.focusDistance, 1),
  fovRad = (camera.fov * Math.PI) / 180,
  resolutionHeight = 1080,
): number {
  const maxBlurPx = Math.max(
    0,
    Math.min(CAMERA_DOF_MAX_BLUR_PX, camera.dof.maxBlurPx),
  );
  if (maxBlurPx <= 0) return 0;
  const height = Math.max(1, resolutionHeight);
  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 0) return 0;
  const nearestDepth = Math.max(MIN_BLUR_CAP_DEPTH, camera.near);
  const defocusPerWorldUnit =
    (height / (2 * tanHalfFov)) *
    Math.abs(1 / focusDistance - 1 / nearestDepth);
  if (!Number.isFinite(defocusPerWorldUnit) || defocusPerWorldUnit <= 1e-6)
    return Number.POSITIVE_INFINITY;
  return maxBlurPx / defocusPerWorldUnit;
}

export function sampleThinLensAperture(
  i: number,
  n: number,
  preset: CameraBokehPreset,
): InstanceType<typeof THREE.Vector2> {
  const r = Math.sqrt((i + 0.5) / n);
  const theta = i * GOLDEN_ANGLE;
  const unit = new THREE.Vector2(Math.cos(theta), Math.sin(theta));
  if (preset === "anamorphic") {
    return unit.multiplyScalar(r).multiply(new THREE.Vector2(1.55, 0.62));
  }
  if (preset === "hex") {
    return unit.multiplyScalar(r * polygonRadiusAt(theta, 6));
  }
  if (preset === "octagon") {
    return unit.multiplyScalar(r * polygonRadiusAt(theta, 8));
  }
  if (preset === "star") {
    return unit.multiplyScalar(r * starRadiusAt(theta));
  }
  return unit.multiplyScalar(r);
}

export function sampleThinLensDiskPair(
  i: number,
  n: number,
): InstanceType<typeof THREE.Vector2> {
  const pairIndex = Math.floor(i / 2);
  const sample = sampleThinLensAperture(
    pairIndex,
    Math.max(1, Math.ceil(n / 2)),
    "spherical",
  );
  return i % 2 === 0 ? sample : sample.multiplyScalar(-1);
}

export function applyThinLensSample(
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
  orientThinLensSampleCamera(camera, baseQuaternion, focusPoint);
  camera.updateMatrixWorld(true);
}

export function orientThinLensSampleCamera(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  camera: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseQuaternion: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  focusPoint: any,
): void {
  const baseForward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(baseQuaternion)
    .normalize();
  const nextForward = focusPoint.clone().sub(camera.position);
  if (nextForward.lengthSq() <= 1e-9) {
    camera.quaternion.copy(baseQuaternion);
    return;
  }
  nextForward.normalize();
  const swing = new THREE.Quaternion().setFromUnitVectors(
    baseForward,
    nextForward,
  );
  camera.quaternion.copy(swing.multiply(baseQuaternion));
}

function createAccumulateNode(
  previousTexture: InstanceType<typeof THREE.Texture>,
  currentTexture: InstanceType<typeof THREE.Texture>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sampleWeight: any,
) {
  const previous = texture(previousTexture);
  const current = texture(currentTexture);
  return Fn(() =>
    mix(previous.sample(uv()), current.sample(uv()), sampleWeight),
  )();
}

function makePipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputNode: any,
) {
  const pipeline = new RenderPipeline(renderer, outputNode);
  pipeline.outputColorTransform = false;
  return pipeline;
}

function makeThinLensTarget(
  width: number,
  height: number,
  name: string,
  depthBuffer: boolean,
) {
  const target = new THREE.RenderTarget(width, height, {
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
function getFocusPoint(camera: any, focusDistance: number): any {
  const focusPoint = new THREE.Vector3();
  camera.getWorldDirection(focusPoint);
  focusPoint.multiplyScalar(focusDistance);
  focusPoint.add(camera.position);
  return focusPoint;
}

function polygonRadiusAt(theta: number, sides: number): number {
  const sector = (Math.PI * 2) / sides;
  const local = positiveModulo(theta + sector / 2, sector) - sector / 2;
  return Math.cos(Math.PI / sides) / Math.cos(local);
}

function starRadiusAt(theta: number): number {
  const lobe = Math.abs(Math.cos(theta * 5));
  return 0.42 + Math.pow(lobe, 1.7) * 0.58;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
