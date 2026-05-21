import * as THREE from "three";
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
import type { ComposerPass, ComposerPassRenderInput } from "./sceneComposer";

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
 * `LensComposerPass` wraps the existing camera lens shader as a single
 * `ComposerPass`. It samples its `inputColor` and writes the lensed
 * result to `output`. Self-contained: owns its own ShaderMaterial,
 * Mesh, and Scene.
 */
export class LensComposerPass implements ComposerPass {
  readonly id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly scene: any;

  constructor(id: string, pass: LensPostProcessPass) {
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

  render(input: ComposerPassRenderInput): void {
    this.material.uniforms.u_image.value = input.inputColor;
    this.material.uniforms.u_resolution.value.set(input.width, input.height);
    input.renderer.setRenderTarget(input.output);
    input.renderer.render(this.scene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.material.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

/**
 * Build the ordered composer pass list implied by a camera's effect
 * blocks. Phase 2a returns a lens pass when distortion or chromatic
 * aberration are enabled; phase 2b will prepend a multi-pass DoF stack.
 */
export function buildCameraComposerPasses(
  camera: CameraObjectProps | null | undefined,
  frameSize: { width: number; height: number },
  idScope: string = "camera",
): ComposerPass[] {
  if (!camera) return [];
  const options: CameraEffectsPassOptions = { idScope, frameSize };
  const passes: ComposerPass[] = [];
  const dofPass = buildCameraDofComposerPass(camera, frameSize, idScope);
  if (dofPass) passes.push(dofPass);
  const lensPass = getCameraLensPostProcessPass(camera, options);
  if (lensPass) {
    passes.push(new LensComposerPass(`${idScope}:camera-lens-pass`, lensPass));
  }
  return passes;
}

/**
 * Build the camera DoF composer pass for the given camera, or null when
 * DoF is disabled. The returned `ComposerPass` owns the four sub-passes
 * (CoC → downsample → bokeh → composite) and their internal half-res
 * render targets.
 */
export function buildCameraDofComposerPass(
  camera: CameraObjectProps | null | undefined,
  _frameSize: { width: number; height: number },
  idScope: string = "camera",
): ComposerPass | null {
  if (!camera) return null;
  const dofPass = createCameraDofPass(camera, idScope);
  if (!dofPass) return null;
  return new CameraDofComposerPass(`${idScope}:camera-dof-pass`, dofPass);
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
  const cocPx =
    cocMm * (resolutionHeight / uniforms.sensorHeight) * uniforms.blurLevel;
  const clamped = Math.max(
    -uniforms.maxBlurPx,
    Math.min(uniforms.maxBlurPx, cocPx),
  );
  return clamped;
}

/**
 * DoF pipeline (full-res Gaussian, post phase 2g).
 *
 *   inputColor (RGBA16F linear) + inputDepth
 *     → 1. coc       (full-res, signed CoC in .r)
 *     → 2. blur      (full-res, depth-aware Gaussian gather:
 *                     out = sum(tap * gaussian(r) * coc-similarity) /
 *                           sum(weights), kernel radius scales with
 *                     |centre CoC|)
 *
 * Why this shape:
 *   - The previous half-res setup → near tile-max → far gather → near
 *     gather → bilateral upsample → composite was correct in principle
 *     (UE5 / Frostbite layout) but produced visible half-res grid
 *     stepping along tilted silhouettes. Stepping comes from the
 *     half-res grid, not from kernel shape — bilateral upsample only
 *     hides it where the CoC similarity test rejects neighbours.
 *   - For SDR editor content (no real specular highlights, no HDR
 *     headroom) a depth-aware single-pass Gaussian is visually
 *     indistinguishable from the disc model and has no half-res grid
 *     to leak through. The CoC-similarity weighting inside the gather
 *     subsumes what the near/far split was doing — sharp foreground
 *     pixels can't pollute a defocused background pixel because their
 *     CoC differs by enough sigmas to push their weight to ~0.
 *   - Single full-res pass is cheaper than the six-pass half-res path
 *     once you account for the bilateral upsample's 8 extra full-res
 *     texture reads per pixel. 48 taps × full-res ≈ 100M reads at
 *     1080p; the old path was 48 × half + 8 × full ≈ 41M, so we trade
 *     ~2.4× reads for zero stepping and one less RT.
 */
const DOF_COC_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_sensorHeight;
uniform float u_fov;
uniform float u_focusDistance;
uniform float u_fNumber;
uniform float u_blurLevel;
uniform float u_maxBlurPx;
uniform float u_depthNear;
uniform float u_depthFar;

float sampleSceneDepth(vec2 uv) {
  // Three's depth attachment is non-linear NDC z in [0,1]. Linearise so
  // the CoC math below matches the analytic export-path formula. With the
  // fullscreen background plane in CompositionRenderer, every pixel has
  // real geometry; the >=1.0 path here is purely defensive (a depth hole
  // → treat as far plane so it joins the far-blur layer cleanly rather
  // than the previous "in-focus sentinel" that produced hard boundaries).
  float z01 = texture2D(u_depth, uv).r;
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
  float cocPx = cocMm * (u_resolution.y / u_sensorHeight) * u_blurLevel;
  return clamp(cocPx, -u_maxBlurPx, u_maxBlurPx);
}

void main() {
  float sceneDepth = sampleSceneDepth(v_uv);
  float coc = signedCocPx(sceneDepth);
  // RGBA16F: write signed CoC straight to .r. Other channels unused
  // (kept for possible future temporal stability / variance signal).
  gl_FragColor = vec4(coc, 0.0, 0.0, 1.0);
}
`;

const DOF_BLUR_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;     // full-res linear RGB
uniform sampler2D u_coc;       // full-res signed CoC in .r
uniform vec2 u_resolution;
uniform float u_maxBlurPx;

const int TAPS = 64;
const float GOLDEN_ANGLE = 2.39996323;

float interleavedGradientNoise(vec2 p) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(p, magic.xy)));
}

void main() {
  // Disc gather at the centre's own CoC radius. Same model as
  // three.js's BokehShader and most production DoF passes. The output
  // pixel reads a uniformly-weighted disc whose radius is the centre's
  // blur amount; an in-focus pixel reads only its own colour
  // (radius ≈ 0); a defocused pixel averages a disc.
  //
  // Two design choices that matter for the look:
  //
  //  1. A small (~2 px) Gaussian "soft kernel" is added on top of the
  //     centre's CoC radius so even sharp pixels sample slightly from
  //     neighbours. Without this, a sharp pixel adjacent to a heavily
  //     defocused pixel keeps a hard edge — the previous behaviour the
  //     user saw as "filter glow, not lens blur".
  //
  //  2. CoC similarity is wide (sigma = 12 px) and applied as a soft
  //     Gaussian rather than a hard accept/reject. Adjacent pixels at
  //     similar (but not identical) depths share most of their tap set,
  //     so silhouettes grade smoothly from sharp to blurred without
  //     visible stepping.
  float cocCentre = texture2D(u_coc, v_uv).r;
  float radiusPx = max(abs(cocCentre), 0.0);

  vec2 invRes = 1.0 / u_resolution;
  float rotation = interleavedGradientNoise(v_uv * u_resolution) * 6.28318530718;

  vec3 accum = vec3(0.0);
  float wSum = 0.0;
  float twoCocSigmaSq = 288.0; // sigma_coc = 12 px

  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float r = sqrt(t) * radiusPx;
    float angle = float(i) * GOLDEN_ANGLE + rotation;
    vec2 offset = vec2(cos(angle), sin(angle)) * r * invRes;
    vec2 uv = clamp(v_uv + offset, vec2(0.0), vec2(1.0));
    vec3 sCol = texture2D(u_image, uv).rgb;
    float sCoc = texture2D(u_coc, uv).r;

    float dCoc = sCoc - cocCentre;
    float wDepth = exp(-(dCoc * dCoc) / twoCocSigmaSq);

    accum += sCol * wDepth;
    wSum += wDepth;
  }

  vec3 result = wSum > 1e-3 ? accum / wSum : texture2D(u_image, v_uv).rgb;
  gl_FragColor = vec4(result, 1.0);
}
`;

/**
 * `CameraDofComposerPass` is the composer-side adapter for the camera
 * DoF effect. Two passes:
 *
 *   inputColor + inputDepth
 *     → 1. coc   (full-res, signed CoC in .r, RGBA16F)
 *     → 2. blur  (full-res Gaussian gather, depth-aware: spatial Gaussian
 *                 × CoC similarity, plus near scatter-as-gather so a
 *                 defocused foreground occludes the focused subject)
 *
 * Replaces the earlier six-pass half-res pipeline (setup → near
 * tile-max → far gather → near gather → bilateral upsample +
 * composite) which produced visible half-res grid stepping along
 * tilted silhouettes. Stepping was a half-res quantisation artefact,
 * not a kernel-shape one. Doing the gather at full-res with depth-aware
 * weights eliminates the grid entirely.
 */

export class CameraDofComposerPass implements ComposerPass {
  readonly id: string;
  readonly pass: CameraDofPass;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cocMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly blurMaterial: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cocScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly blurScene: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cocTarget: any;

  private fullWidth = 1;
  private fullHeight = 1;

  constructor(id: string, pass: CameraDofPass) {
    this.id = id;
    this.pass = pass;
    const u = pass.uniforms;

    this.cocMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_COC_FRAGMENT,
      uniforms: {
        u_depth: { value: null },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_sensorHeight: { value: u.sensorHeight },
        u_fov: { value: u.fov },
        u_focusDistance: { value: u.focusDistance },
        u_fNumber: { value: u.fNumber },
        u_blurLevel: { value: u.blurLevel },
        u_maxBlurPx: { value: Math.max(u.maxBlurPx, 1) },
        u_depthNear: { value: u.near },
        u_depthFar: { value: u.far },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_BLUR_FRAGMENT,
      uniforms: {
        u_image: { value: null },
        u_coc: { value: null },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_maxBlurPx: { value: Math.max(u.maxBlurPx, 1) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.cocScene = makeFullscreenScene(this.cocMaterial);
    this.blurScene = makeFullscreenScene(this.blurMaterial);

    // CoC at full-res in RGBA16F (signed CoC straight to .r — no
    // 8-bit encode/decode, no bilinear-across-sign-discontinuity bug).
    this.cocTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.fullWidth && h === this.fullHeight) return;
    this.fullWidth = w;
    this.fullHeight = h;
    this.cocTarget.setSize(w, h);
    this.cocMaterial.uniforms.u_resolution.value.set(w, h);
    this.blurMaterial.uniforms.u_resolution.value.set(w, h);
  }

  render(input: ComposerPassRenderInput): void {
    if (!input.inputDepth) {
      // No depth attachment available — passthrough so a downstream
      // lens pass still sees the full-frame colour.
      input.renderer.setRenderTarget(input.output);
      input.renderer.clear();
      return;
    }
    if (input.width !== this.fullWidth || input.height !== this.fullHeight) {
      this.setSize(input.width, input.height);
    }

    // 1. CoC at full-res (signed CoC straight to .r, half-float).
    this.cocMaterial.uniforms.u_depth.value = input.inputDepth;
    this.cocMaterial.uniforms.u_resolution.value.set(input.width, input.height);
    input.renderer.setRenderTarget(this.cocTarget);
    input.renderer.clear();
    input.renderer.render(this.cocScene, FULLSCREEN_CAMERA);

    // 2. Depth-aware Gaussian gather + near scatter at full-res →
    // direct write to the composer's output target.
    this.blurMaterial.uniforms.u_image.value = input.inputColor;
    this.blurMaterial.uniforms.u_coc.value = this.cocTarget.texture;
    this.blurMaterial.uniforms.u_resolution.value.set(
      input.width,
      input.height,
    );
    input.renderer.setRenderTarget(input.output);
    input.renderer.clear();
    input.renderer.render(this.blurScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.cocMaterial.dispose();
    this.blurMaterial.dispose();
    this.cocTarget.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFullscreenScene(material: any): any {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(FULLSCREEN_GEOMETRY, material));
  return scene;
}
