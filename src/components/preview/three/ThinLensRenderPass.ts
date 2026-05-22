import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import {
  CAMERA_DOF_MAX_BLUR_PX,
  CAMERA_DOF_MIN_F_NUMBER,
  type CameraObjectProps,
} from "../../../core/types";

const FULLSCREEN_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const FULLSCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const GOLDEN_ANGLE = 2.39996323;
const THIN_LENS_SAMPLES = 64;
const APERTURE_WORLD_SCALE = 0.02;
const MIN_BLUR_CAP_DEPTH = 100;
const RESOLVE_SCALE = 0.5;
const RESOLVE_BOKEH_TAPS = 24;
const RESOLVE_BOKEH_RADIUS_HALF_PX = 1.8;
const RESOLVE_BOKEH_BLEND = 0.62;

const COPY_VERTEX = `
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
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

const COPY_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_texture;

void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

const BOKEH_FILL_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_radiusPx;

const float GOLDEN_ANGLE = ${GOLDEN_ANGLE.toFixed(8)};
const int TAP_COUNT = ${RESOLVE_BOKEH_TAPS};
const float TAP_COUNT_F = float(TAP_COUNT);

void main() {
  vec4 center = texture(u_texture, v_uv);
  vec4 color = center * 1.75;
  float weight = 1.75;

  for (int i = 0; i < TAP_COUNT; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / TAP_COUNT_F);
    float theta = fi * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(theta), sin(theta)) * r * u_radiusPx * u_texelSize;
    float tapWeight = 1.0 - r * 0.35;
    color += texture(u_texture, v_uv + offset) * tapWeight;
    weight += tapWeight;
  }

  fragColor = color / weight;
}
`;

const BOKEH_COMPOSITE_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_sharp;
uniform sampler2D u_fill;
uniform float u_blend;

void main() {
  vec4 sharp = texture(u_sharp, v_uv);
  vec4 fill = texture(u_fill, v_uv);
  float contrast = clamp(length(sharp.rgb - fill.rgb) * 1.35, 0.0, 1.0);
  float bandBlend = mix(u_blend * 0.45, u_blend, contrast);
  fragColor = mix(sharp, fill, bandBlend);
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
  private readonly resolveDownsampleTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly resolveFillTarget: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly downsampleMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly bokehFillMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly accumulateScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly downsampleScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly bokehFillScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeScene: any;

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
    const resolveSize = getResolveSize(options.width, options.height);
    this.resolveDownsampleTarget = makeThinLensTarget(
      resolveSize.width,
      resolveSize.height,
      "ThinLensResolveDownsample",
      false,
    );
    this.resolveFillTarget = makeThinLensTarget(
      resolveSize.width,
      resolveSize.height,
      "ThinLensResolveFill",
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
    this.downsampleMaterial = new THREE.ShaderMaterial({
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
    this.bokehFillMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERTEX,
      fragmentShader: BOKEH_FILL_FRAGMENT,
      uniforms: {
        u_texture: { value: null },
        u_texelSize: {
          value: new THREE.Vector2(
            1 / resolveSize.width,
            1 / resolveSize.height,
          ),
        },
        u_radiusPx: { value: getResolveBokehRadiusHalfPx() },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERTEX,
      fragmentShader: BOKEH_COMPOSITE_FRAGMENT,
      uniforms: {
        u_sharp: { value: null },
        u_fill: { value: null },
        u_blend: { value: RESOLVE_BOKEH_BLEND },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.accumulateScene = makeFullscreenScene(this.accumulateMaterial);
    this.downsampleScene = makeFullscreenScene(this.downsampleMaterial);
    this.bokehFillScene = makeFullscreenScene(this.bokehFillMaterial);
    this.compositeScene = makeFullscreenScene(this.compositeMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.sampleTarget.setSize(w, h);
    this.accumulationA.setSize(w, h);
    this.accumulationB.setSize(w, h);
    const resolveSize = getResolveSize(w, h);
    this.resolveDownsampleTarget.setSize(resolveSize.width, resolveSize.height);
    this.resolveFillTarget.setSize(resolveSize.width, resolveSize.height);
    this.bokehFillMaterial.uniforms.u_texelSize.value.set(
      1 / resolveSize.width,
      1 / resolveSize.height,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, _writeBuffer: any, readBuffer: any): void {
    const camera = this.getCamera();
    if (!hasActiveThinLensDof(camera)) {
      this.renderSingle(renderer, readBuffer);
      return;
    }

    const apertureRadiusWorld = getThinLensApertureRadiusWorld(
      camera,
      readBuffer?.height,
    );
    if (apertureRadiusWorld <= 0) {
      this.renderSingle(renderer, readBuffer);
      return;
    }

    const basePosition = this.camera.position.clone();
    const baseQuaternion = this.camera.quaternion.clone();
    const focusDistance = getThinLensFocusDistance(camera);
    const focusPoint = getFocusPoint(this.camera, focusDistance);

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

    this.downsampleMaterial.uniforms.u_texture.value =
      this.accumulationA.texture;

    renderer.setRenderTarget(this.resolveDownsampleTarget);
    renderer.clear();
    renderer.render(this.downsampleScene, FULLSCREEN_CAMERA);

    this.bokehFillMaterial.uniforms.u_texture.value =
      this.resolveDownsampleTarget.texture;
    this.bokehFillMaterial.uniforms.u_radiusPx.value =
      getResolveBokehRadiusHalfPx();

    renderer.setRenderTarget(this.resolveFillTarget);
    renderer.clear();
    renderer.render(this.bokehFillScene, FULLSCREEN_CAMERA);

    this.compositeMaterial.uniforms.u_sharp.value = this.accumulationA.texture;
    this.compositeMaterial.uniforms.u_fill.value =
      this.resolveFillTarget.texture;
    this.compositeMaterial.uniforms.u_blend.value = RESOLVE_BOKEH_BLEND;

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    renderer.render(this.compositeScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.sampleTarget.dispose();
    this.accumulationA.dispose();
    this.accumulationB.dispose();
    this.resolveDownsampleTarget.dispose();
    this.resolveFillTarget.dispose();
    this.accumulateMaterial.dispose();
    this.downsampleMaterial.dispose();
    this.bokehFillMaterial.dispose();
    this.compositeMaterial.dispose();
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

function getThinLensFocusDistance(camera: CameraObjectProps): number {
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

function getResolveSize(
  width: number,
  height: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(width * RESOLVE_SCALE)),
    height: Math.max(1, Math.floor(height * RESOLVE_SCALE)),
  };
}

function getResolveBokehRadiusHalfPx(): number {
  if (THIN_LENS_SAMPLES <= 8) return 2.1;
  if (THIN_LENS_SAMPLES <= 12) return RESOLVE_BOKEH_RADIUS_HALF_PX;
  if (THIN_LENS_SAMPLES <= 16) return 1.45;
  if (THIN_LENS_SAMPLES <= 32) return 1.0;
  return 0.65;
}

function hasActiveThinLensDof(
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

function sampleDisk(i: number, n: number): InstanceType<typeof THREE.Vector2> {
  const r = Math.sqrt((i + 0.5) / n);
  const theta = i * GOLDEN_ANGLE;
  return new THREE.Vector2(Math.cos(theta) * r, Math.sin(theta) * r);
}

export function sampleThinLensDiskPair(
  i: number,
  n: number,
): InstanceType<typeof THREE.Vector2> {
  const pairIndex = Math.floor(i / 2);
  const sample = sampleDisk(pairIndex, Math.max(1, Math.ceil(n / 2)));
  return i % 2 === 0 ? sample : sample.multiplyScalar(-1);
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
