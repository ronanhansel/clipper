import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import {
  getCameraLensPostProcessPass,
  type CameraEffectsPassOptions,
} from "../../../core/cameraEffectsPasses";
import {
  createCameraDofPass,
  type CameraDofPass,
} from "../../../core/effects/postprocess/cameraDof";
import type { LensPostProcessPass } from "../../../core/effects/postprocess/lens";
import {
  shapeMaskPreviewOpacity,
  shapeMaskPreviewRgb,
} from "../../../core/effects/shapeMask";
import type { CameraObjectProps } from "../../../core/types";

/**
 * Composer-side adapter for the existing lens fragment shader. Phase 2a
 * routes camera lens (distortion + chromatic aberration) through the
 * `CompositionRenderer` composer instead of the `LivePostProcessFramePreview`
 * → `WebGlPostProcessRenderer` path. The shader source is the LDR copy of
 * `lensWebGlRenderer.ts`'s fragment, kept in sync line-for-line so the two
 * paths render identically until v0.2.21 retires the live-DOM path.
 */

const CAMERA_LENS_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_focus;
uniform float u_radiusPixels;
uniform float u_softness;
uniform float u_magnification;
uniform float u_distortion;
uniform float u_chromaticAberrationPixels;
uniform float u_rimWidth;
uniform float u_rimOpacity;
uniform float u_dimAmount;
uniform vec3 u_frameBackground;
uniform float u_chromaMaskEnabled;
uniform float u_chromaMaskPreview;
uniform float u_chromaMaskApplyInside;
uniform vec2 u_chromaMaskFocus;
uniform vec2 u_chromaMaskRadius;
uniform float u_chromaMaskFeather;

void main() {
  vec2 pixel = v_uv * u_resolution;
  vec2 center = u_focus * u_resolution;
  vec2 delta = pixel - center;
  float distanceRatio = length(delta) / max(u_radiusPixels, 1.0);
  float inner = clamp(1.0 - max(u_softness, 0.0) * 0.42, 0.0, 0.98);
  float falloff = 1.0 - smoothstep(inner, 1.0, distanceRatio);
  float coverage = 1.0 - smoothstep(0.995, 1.0, distanceRatio);
  float rimInner = clamp(1.0 - u_rimWidth, 0.0, 0.98);
  float rim = smoothstep(rimInner, 1.0, distanceRatio) * coverage;
  float zoom = mix(1.0, 1.0 / max(u_magnification, 0.01), falloff);
  float barrel = 1.0 + u_distortion * distanceRatio * distanceRatio * max(falloff, rim) * 0.5;
  vec2 lensUv = (center + delta * zoom * barrel) / u_resolution;
  vec2 direction = length(delta) > 0.001 ? normalize(delta) : vec2(0.0);
  float chromaMask = max(rim, falloff * 0.35);
  float shapeMaskCoverage = 1.0;
  if (u_chromaMaskEnabled > 0.5) {
    vec2 maskCenter = u_chromaMaskFocus * u_resolution;
    vec2 maskDelta = pixel - maskCenter;
    vec2 maskRadius = max(u_chromaMaskRadius, vec2(1.0));
    vec2 maskNorm = maskDelta / maskRadius;
    float maskDistRatio = length(maskNorm);
    float maskSoftEdge = u_chromaMaskFeather / max(min(maskRadius.x, maskRadius.y), 1.0);
    shapeMaskCoverage = 1.0 - smoothstep(1.0, 1.0 + maskSoftEdge, maskDistRatio);
    float maskFactor = u_chromaMaskApplyInside > 0.5 ? shapeMaskCoverage : (1.0 - shapeMaskCoverage);
    chromaMask *= maskFactor;
  }
  vec2 aberration = direction * u_chromaticAberrationPixels * chromaMask / u_resolution;
  vec3 lensColor = vec3(
    texture2D(u_image, lensUv + aberration).r,
    texture2D(u_image, lensUv).g,
    texture2D(u_image, lensUv - aberration).b
  );
  vec3 color = mix(u_frameBackground, lensColor, coverage);
  color *= 1.0 - u_dimAmount * (1.0 - coverage);
  color += vec3(0.22) * rim * u_rimOpacity;
  if (u_chromaMaskPreview > 0.5 && u_chromaMaskEnabled > 0.5) {
    float maskFactor = u_chromaMaskApplyInside > 0.5 ? shapeMaskCoverage : (1.0 - shapeMaskCoverage);
    color = mix(color, vec3(${shapeMaskPreviewRgb.r}, ${shapeMaskPreviewRgb.g}, ${shapeMaskPreviewRgb.b}), maskFactor * ${shapeMaskPreviewOpacity});
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

const CAMERA_LENS_VERTEX = `
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FULLSCREEN_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const FULLSCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * `LensComposerPass` wraps the existing camera lens shader as a Three.js
 * postprocessing `Pass`. Uses Three's standard `(renderer, writeBuffer,
 * readBuffer)` contract: reads `readBuffer.texture` for input colour and
 * writes the lensed result to either `writeBuffer` or the screen
 * (`renderToScreen`). Self-contained: owns its own ShaderMaterial, Mesh,
 * and Scene.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class LensComposerPass extends (Pass as any) {
  readonly id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly scene: any;

  constructor(id: string, pass: LensPostProcessPass) {
    super();
    this.id = id;
    const u = pass.uniforms;
    const mask = u.chromaticAberrationMask;
    this.material = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: CAMERA_LENS_FRAGMENT,
      uniforms: {
        u_image: { value: null },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_focus: { value: new THREE.Vector2(u.focus.x, u.focus.y) },
        u_radiusPixels: { value: u.radiusPixels },
        u_softness: { value: u.softness },
        u_magnification: { value: u.magnification },
        u_distortion: { value: u.distortion },
        u_chromaticAberrationPixels: { value: u.chromaticAberrationPixels },
        u_rimWidth: { value: u.rimWidth },
        u_rimOpacity: { value: u.rimOpacity },
        u_dimAmount: { value: u.dimAmount },
        u_frameBackground: {
          value: new THREE.Vector3(
            u.frameBackground.r,
            u.frameBackground.g,
            u.frameBackground.b,
          ),
        },
        u_chromaMaskEnabled: { value: mask.enabled ? 1 : 0 },
        u_chromaMaskPreview: { value: mask.preview ? 1 : 0 },
        u_chromaMaskApplyInside: { value: mask.applyInside ? 1 : 0 },
        u_chromaMaskFocus: {
          value: new THREE.Vector2(mask.focus.x, mask.focus.y),
        },
        u_chromaMaskRadius: {
          value: new THREE.Vector2(mask.radiusX, mask.radiusY),
        },
        u_chromaMaskFeather: { value: mask.feather },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(FULLSCREEN_GEOMETRY, this.material);
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.u_resolution.value.set(width, height);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, writeBuffer: any, readBuffer: any): void {
    this.material.uniforms.u_image.value = readBuffer.texture;
    const w = readBuffer?.width ?? 1;
    const h = readBuffer?.height ?? 1;
    this.material.uniforms.u_resolution.value.set(w, h);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.render(this.scene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.material.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

/**
 * Build the ordered composer pass list implied by a camera's effect
 * blocks. DoF is intentionally not returned here: it is rendered by
 * `ThinLensRenderPass`, which must own the scene camera before the
 * beauty buffer exists. This list is only for post-scene lens effects.
 */
export function buildCameraComposerPasses(
  camera: CameraObjectProps | null | undefined,
  frameSize: { width: number; height: number },
  idScope: string = "camera",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  if (!camera) return [];
  const options: CameraEffectsPassOptions = { idScope, frameSize };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passes: any[] = [];
  const lensPass = getCameraLensPostProcessPass(camera, options);
  if (lensPass) {
    passes.push(new LensComposerPass(`${idScope}:camera-lens-pass`, lensPass));
  }
  return passes;
}

/**
 * Deprecated compatibility hook. Camera DoF is handled by
 * `ThinLensRenderPass`, not by a post-process composer pass, because the
 * near-physical path has to render the actual scene from aperture samples.
 */
export function buildCameraDofComposerPass(
  _camera: CameraObjectProps | null | undefined,
  _frameSize: { width: number; height: number },
  _idScope: string = "camera",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  return null;
}

/**
 * Compute the signed circle of confusion in pixels for a given camera
 * and scene-space depth. Positive = behind focus (far blur), negative =
 * in front of focus (near blur). Mirrors the GLSL math in the DoF composer pass so the live and export paths agree.
 */
export function computeSignedCocPx(
  uniforms: CameraDofPass["uniforms"],
  sceneDepth: number,
  resolutionHeight: number,
): number {
  if (!Number.isFinite(sceneDepth) || sceneDepth <= 0) return 0;
  if (uniforms.fNumber <= 0) return 0;
  if (uniforms.focusDistance < 0) return 0;
  const fovRad = (uniforms.fov * Math.PI) / 180;
  const focalLengthMm = uniforms.sensorHeight / (2 * Math.tan(fovRad * 0.5));
  if (focalLengthMm <= 0) return 0;
  // Thin-lens singularity at s = f. Clamp focus and subject just past the
  // focal length so dialling focus distance below focal length (or scene
  // depth onto the lens) yields a defined, finite CoC instead of an
  // explosion that saturates the whole frame.
  const minDistance = focalLengthMm * 1.01;
  const focus = Math.max(uniforms.focusDistance, minDistance);
  const subject = Math.max(sceneDepth, minDistance);
  if (Math.abs(subject - focus) < 1e-6) return 0;
  const apertureDiameter = focalLengthMm / uniforms.fNumber;
  const denom = focus * (subject - focalLengthMm);
  if (Math.abs(denom) < 1e-6) return 0;
  const cocMm = (apertureDiameter * focalLengthMm * (subject - focus)) / denom;
  const cocPx = cocMm * (resolutionHeight / uniforms.sensorHeight);
  const clamped = Math.max(
    -uniforms.maxBlurPx,
    Math.min(uniforms.maxBlurPx, cocPx),
  );
  return clamped;
}

/**
 * Multi-pass bokeh DoF based on the Pixel Mischief / DOOM structure:
 *
 *   full-res color + depth
 *     → half-res near/far CoC fields
 *     → 64-tap disc blur
 *     → 16-tap max/fill blur
 *     → full-res composite over sharp color
 *
 * Keeping near and far fields in separate render targets is intentionally
 * less clever than the previous single-pass scatter-as-gather shader. It
 * makes the blur stable for high-contrast UI/text layers and prevents
 * per-tap mip filtering from turning glyphs into blocky repeated slabs.
 */
const DOF_DISC_TAPS = 96;
const DOF_FILL_TAPS = 32;
const DOF_SCALE = 0.5;

const DOF_BOKEH_VERTEX = `
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOF_COC_COMMON = `
precision highp float;
uniform sampler2D u_depth;
uniform vec2 u_sourceResolution;
uniform float u_sensorHeight;
uniform float u_fov;
uniform float u_focusDistance;
uniform float u_fNumber;
uniform float u_maxBlurPx;
uniform float u_depthNear;
uniform float u_depthFar;

float linearizeDepth(float z01) {
  if (z01 >= 1.0) return u_depthFar;
  float ndc = z01 * 2.0 - 1.0;
  float denom = u_depthFar + u_depthNear - ndc * (u_depthFar - u_depthNear);
  if (abs(denom) < 1e-6) return u_depthFar;
  return (2.0 * u_depthNear * u_depthFar) / denom;
}

float signedCocPx(float sceneDepth) {
  if (sceneDepth <= 0.0) return 0.0;
  if (u_fNumber <= 0.0) return 0.0;
  if (u_focusDistance < 0.0) return 0.0;
  float fovRad = radians(u_fov);
  float focalLengthMm = u_sensorHeight / (2.0 * tan(fovRad * 0.5));
  if (focalLengthMm <= 0.0) return 0.0;
  // Thin-lens singularity at s = f. Clamp focus + subject just past the
  // focal length so dialling focus onto the lens yields a finite CoC
  // instead of an explosion that saturates every pixel.
  float minDistance = focalLengthMm * 1.01;
  float focus = max(u_focusDistance, minDistance);
  float subject = max(sceneDepth, minDistance);
  if (abs(subject - focus) < 1e-6) return 0.0;
  float apertureDiameter = focalLengthMm / u_fNumber;
  float denom = focus * (subject - focalLengthMm);
  if (abs(denom) < 1e-6) return 0.0;
  float cocMm = apertureDiameter * focalLengthMm * (subject - focus) / denom;
  float cocPx = cocMm * (u_sourceResolution.y / u_sensorHeight);
  return clamp(cocPx, -u_maxBlurPx, u_maxBlurPx);
}

float saturate(float v) {
  return clamp(v, 0.0, 1.0);
}

float cocVisibility(float coc) {
  return smoothstep(0.35, 1.5, abs(coc));
}
`;

const DOF_SPLIT_FRAGMENT = `
in vec2 v_uv;
out vec4 fragColor;
uniform float u_fieldSign;
${DOF_COC_COMMON}

void main() {
  float depth = linearizeDepth(texture(u_depth, v_uv).r);
  float coc = signedCocPx(depth);
  float signedField = coc * u_fieldSign;
  if (signedField <= 0.35) {
    fragColor = vec4(0.0);
    return;
  }
  float cocPx = abs(coc) * cocVisibility(coc);
  fragColor = vec4(0.0, 0.0, 0.0, cocPx);
}
`;

const DOF_BLUR_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_color;
uniform sampler2D u_coc;
uniform vec2 u_sourceResolution;

const float GOLDEN_ANGLE = 2.39996323;
const int TAP_COUNT = ${DOF_DISC_TAPS};
const float TAP_COUNT_F = float(TAP_COUNT);

void main() {
  float cocPx = textureLod(u_coc, v_uv, 0.0).a;
  if (cocPx <= 0.35) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 color = vec3(0.0);
  vec2 sampleStep = cocPx / u_sourceResolution;

  for (int i = 0; i < TAP_COUNT; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / TAP_COUNT_F);
    float theta = fi * GOLDEN_ANGLE;
    vec2 sampleUv = v_uv + vec2(cos(theta), sin(theta)) * r * sampleStep;
    color += textureLod(u_color, sampleUv, 0.0).rgb;
  }

  fragColor = vec4(color / TAP_COUNT_F, cocPx);
}
`;

const DOF_FILL_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_field;
uniform vec2 u_sourceResolution;

const float GOLDEN_ANGLE = 2.39996323;
const int TAP_COUNT = ${DOF_FILL_TAPS};
const float TAP_COUNT_F = float(TAP_COUNT);

void main() {
  vec4 center = textureLod(u_field, v_uv, 0.0);
  float cocPx = center.a;
  if (cocPx <= 0.35) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 color = center.rgb;
  float weight = 1.0;
  vec2 sampleStep = cocPx / u_sourceResolution;

  for (int i = 0; i < TAP_COUNT; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / TAP_COUNT_F);
    float theta = fi * GOLDEN_ANGLE;
    vec2 sampleUv = v_uv + vec2(cos(theta), sin(theta)) * r * sampleStep;
    vec4 tap = textureLod(u_field, sampleUv, 0.0);
    float tapWeight = tap.a > 0.35 ? 1.0 : 0.0;
    color += tap.rgb * tapWeight;
    weight += tapWeight;
  }

  fragColor = vec4(color / weight, cocPx);
}
`;

const DOF_COMPOSITE_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_color;
uniform sampler2D u_near;
uniform sampler2D u_far;
uniform float u_maxBlurPx;

float blendFromCoc(float cocPx) {
  return smoothstep(0.25, max(2.0, min(12.0, u_maxBlurPx * 0.12)), cocPx);
}

void main() {
  vec4 sharp = textureLod(u_color, v_uv, 0.0);
  vec4 farField = textureLod(u_far, v_uv, 0.0);
  vec4 nearField = textureLod(u_near, v_uv, 0.0);
  float farBlend = blendFromCoc(farField.a);
  float nearBlend = blendFromCoc(nearField.a);
  vec4 result = mix(sharp, vec4(farField.rgb, sharp.a), farBlend);
  fragColor = mix(result, vec4(nearField.rgb, sharp.a), nearBlend);
}
`;

/**
 * `CameraDofComposerPass` is the camera DoF effect as a Three.js
 * postprocessing `Pass`. The fragment shader gathers along a stable
 * Vogel disk; see `DOF_BOKEH_FRAGMENT` for the rationale.
 *
 * The depth input comes from `readBuffer.depthTexture` — Three's
 * EffectComposer attaches a `DepthTexture` to its read RT when the
 * RenderPass is configured to populate it (we configure that in
 * `CompositionRenderer`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class CameraDofComposerPass extends (Pass as any) {
  readonly id: string;
  readonly pass: CameraDofPass;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly splitMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly blurMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly fillMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeMaterial: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly splitScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly blurScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly fillScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeScene: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nearFieldTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private farFieldTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nearBlurTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private farBlurTarget: any;

  private fullWidth = 1;
  private fullHeight = 1;
  private scaledWidth = 1;
  private scaledHeight = 1;

  constructor(id: string, pass: CameraDofPass) {
    super();
    this.id = id;
    this.pass = pass;
    const u = pass.uniforms;
    const maxBlurPx = Math.max(u.maxBlurPx, 1);

    const commonUniforms = {
      u_depth: { value: null },
      u_sourceResolution: { value: new THREE.Vector2(1, 1) },
      u_sensorHeight: { value: u.sensorHeight },
      u_fov: { value: u.fov },
      u_focusDistance: { value: Math.max(u.focusDistance, 0.001) },
      u_fNumber: { value: Math.max(u.fNumber, 0.1) },
      u_maxBlurPx: { value: maxBlurPx },
      u_depthNear: { value: u.near },
      u_depthFar: { value: u.far },
    };

    this.splitMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DOF_BOKEH_VERTEX,
      fragmentShader: DOF_SPLIT_FRAGMENT,
      uniforms: {
        u_fieldSign: { value: 1 },
        ...cloneUniformMap(commonUniforms),
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DOF_BOKEH_VERTEX,
      fragmentShader: DOF_BLUR_FRAGMENT,
      uniforms: {
        u_color: { value: null },
        u_coc: { value: null },
        u_sourceResolution: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.fillMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DOF_BOKEH_VERTEX,
      fragmentShader: DOF_FILL_FRAGMENT,
      uniforms: {
        u_field: { value: null },
        u_sourceResolution: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DOF_BOKEH_VERTEX,
      fragmentShader: DOF_COMPOSITE_FRAGMENT,
      uniforms: {
        u_color: { value: null },
        u_near: { value: null },
        u_far: { value: null },
        u_maxBlurPx: { value: maxBlurPx },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.splitScene = makeFullscreenScene(this.splitMaterial);
    this.blurScene = makeFullscreenScene(this.blurMaterial);
    this.fillScene = makeFullscreenScene(this.fillMaterial);
    this.compositeScene = makeFullscreenScene(this.compositeMaterial);
    this.nearFieldTarget = makeDofRenderTarget(1, 1, "CameraDofNearField");
    this.farFieldTarget = makeDofRenderTarget(1, 1, "CameraDofFarField");
    this.nearBlurTarget = makeDofRenderTarget(1, 1, "CameraDofNearBlur");
    this.farBlurTarget = makeDofRenderTarget(1, 1, "CameraDofFarBlur");
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.fullWidth && h === this.fullHeight) return;
    this.fullWidth = w;
    this.fullHeight = h;
    this.scaledWidth = Math.max(1, Math.floor(w * DOF_SCALE));
    this.scaledHeight = Math.max(1, Math.floor(h * DOF_SCALE));
    this.resizeTargets(this.scaledWidth, this.scaledHeight);
    this.splitMaterial.uniforms.u_sourceResolution.value.set(w, h);
    this.blurMaterial.uniforms.u_sourceResolution.value.set(w, h);
    this.fillMaterial.uniforms.u_sourceResolution.value.set(w, h);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, writeBuffer: any, readBuffer: any): void {
    const depthTexture = readBuffer?.depthTexture ?? null;
    if (!depthTexture) {
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.clear();
      this.compositeMaterial.uniforms.u_color.value = readBuffer.texture;
      return;
    }
    const w = readBuffer?.width ?? 1;
    const h = readBuffer?.height ?? 1;
    if (w !== this.fullWidth || h !== this.fullHeight) {
      this.setSize(w, h);
    }

    this.splitMaterial.uniforms.u_depth.value = depthTexture;
    this.splitMaterial.uniforms.u_sourceResolution.value.set(w, h);
    this.blurMaterial.uniforms.u_sourceResolution.value.set(w, h);
    this.fillMaterial.uniforms.u_sourceResolution.value.set(w, h);

    this.renderSplitField(renderer, this.nearFieldTarget, -1);
    this.renderSplitField(renderer, this.farFieldTarget, 1);
    this.renderBlurField(
      renderer,
      readBuffer.texture,
      this.nearFieldTarget,
      this.nearBlurTarget,
    );
    this.renderBlurField(
      renderer,
      readBuffer.texture,
      this.farFieldTarget,
      this.farBlurTarget,
    );
    this.renderFillField(renderer, this.nearBlurTarget, this.nearFieldTarget);
    this.renderFillField(renderer, this.farBlurTarget, this.farFieldTarget);

    this.compositeMaterial.uniforms.u_color.value = readBuffer.texture;
    this.compositeMaterial.uniforms.u_near.value = this.nearFieldTarget.texture;
    this.compositeMaterial.uniforms.u_far.value = this.farFieldTarget.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    renderer.render(this.compositeScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.splitMaterial.dispose();
    this.blurMaterial.dispose();
    this.fillMaterial.dispose();
    this.compositeMaterial.dispose();
    this.nearFieldTarget.dispose();
    this.farFieldTarget.dispose();
    this.nearBlurTarget.dispose();
    this.farBlurTarget.dispose();
    // Geometry is module-shared; do not dispose here.
  }

  private resizeTargets(width: number, height: number): void {
    this.nearFieldTarget.setSize(width, height);
    this.farFieldTarget.setSize(width, height);
    this.nearBlurTarget.setSize(width, height);
    this.farBlurTarget.setSize(width, height);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderSplitField(
    renderer: any,
    target: any,
    fieldSign: number,
  ): void {
    this.splitMaterial.uniforms.u_fieldSign.value = fieldSign;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.splitScene, FULLSCREEN_CAMERA);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderBlurField(
    renderer: any,
    colorTexture: any,
    cocTarget: any,
    target: any,
  ): void {
    this.blurMaterial.uniforms.u_color.value = colorTexture;
    this.blurMaterial.uniforms.u_coc.value = cocTarget.texture;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.blurScene, FULLSCREEN_CAMERA);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderFillField(renderer: any, source: any, target: any): void {
    this.fillMaterial.uniforms.u_field.value = source.texture;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.fillScene, FULLSCREEN_CAMERA);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFullscreenScene(material: any): any {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(FULLSCREEN_GEOMETRY, material));
  return scene;
}

function makeDofRenderTarget(width: number, height: number, name: string) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
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

function cloneUniformMap<T extends Record<string, { value: unknown }>>(
  uniforms: T,
): T {
  const cloned: Record<string, { value: unknown }> = {};
  for (const [key, uniform] of Object.entries(uniforms)) {
    const value = uniform.value as unknown;
    let clonedValue: unknown = value;
    if (value instanceof THREE.Vector2) {
      clonedValue = (value as InstanceType<typeof THREE.Vector2>).clone();
    } else if (value instanceof THREE.Vector3) {
      clonedValue = (value as InstanceType<typeof THREE.Vector3>).clone();
    }
    cloned[key] = {
      value: clonedValue,
    };
  }
  return cloned as T;
}
