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
 * blocks. Phase 2a returns a lens pass when distortion or chromatic
 * aberration are enabled; phase 2b will prepend a multi-pass DoF stack.
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
 * DoF is disabled. The returned pass is a Three.js `Pass` and owns its
 * CoC + blur sub-passes plus the half-float CoC render target.
 */
export function buildCameraDofComposerPass(
  camera: CameraObjectProps | null | undefined,
  _frameSize: { width: number; height: number },
  idScope: string = "camera",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
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
 * DoF gather (Vogel disk + IGN rotation, pure disc convolution).
 *
 *   inputColor (RGBA16F linear, mipmapped) + inputDepth → blurred RGBA16F
 *
 * Per pixel:
 *   1. Linearise depth, compute signed CoC in pixels.
 *   2. If |CoC| < 0.5 px, output sharp colour and exit early.
 *   3. Otherwise gather along a Vogel disk (golden-angle spiral) of N taps
 *      uniformly weighted. Each tap is rotated by an Interleaved Gradient
 *      Noise (IGN) angle so adjacent pixels see *similar but rotated* tap
 *      sets — this scatters residual structure as low-frequency noise
 *      instead of bars or speckle. Each tap reads at LOD =
 *      log2(radiusPx / sqrt(N)) so its sample is an area integral over
 *      its kernel cell (the cells tile the disc); without this 64 point
 *      samples on a smoothly-shaded interior produce per-pixel speckle,
 *      not blur.
 *   4. Cross-fade to sharp on small CoC so the in-focus → out-of-focus
 *      transition is smooth.
 *
 * Why pure uniform weights:
 *   Earlier iterations weighted each tap by per-tap CoC ('spread' rule)
 *   and a side-mask (foreground/background separation). For coplanar
 *   2D-style compositions (text on a rect at the same z) the conditional
 *   weights collapse into edge-detect artefacts: bright glyph bodies
 *   stay legible because in-stroke taps weight differently from off-
 *   stroke taps and the disc's symmetric integral is broken. A pure
 *   uniform disc convolution matches what a real lens does on flat
 *   subjects — every point on the disc contributes equally — and
 *   reproduces the reference look ("strokes fully dissolve into smooth
 *   grey"). Depth-aware foreground bleed handling can return as a
 *   second pass when real 3D scenes need it; today's compositions are
 *   coplanar enough that the simpler gather wins.
 *
 * Why Vogel + IGN over BokehShader2:
 *   Ring/sample formulations place taps at fixed angles per ring across
 *   the whole frame, producing visible polar bars in flat blurred regions.
 *   Per-pixel decorrelated rotation removes the bars but adds high-variance
 *   speckle. Vogel + IGN is the standard production fix (Frostbite, UE5):
 *   the Vogel pattern is a near-uniform disc sample, and IGN rotation is a
 *   spatially low-discrepancy hash so neighbours integrate over similar
 *   energy and the output is smooth.
 */
const DOF_NUM_TAPS = 64;

const DOF_BOKEH_VERTEX = `
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOF_BOKEH_FRAGMENT = `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_color;
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

// Vogel disk constants
const float GOLDEN_ANGLE = 2.39996323; // PI * (3 - sqrt(5))
const int   NUM_TAPS = ${DOF_NUM_TAPS};
const float NUM_TAPS_F = float(NUM_TAPS);

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
  float cocPx = cocMm * (u_resolution.y / u_sensorHeight) * u_blurLevel;
  return clamp(cocPx, -u_maxBlurPx, u_maxBlurPx);
}

// Interleaved Gradient Noise (Jorge Jimenez). Returns [0,1]. Spatially
// low-discrepancy: the gradient between neighbour pixels is small, so
// rotating a Vogel disk by IGN gives smooth output instead of speckle.
float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 sharpUv = v_uv;
  // Composer RT is premultiplied; integrate premultiplied colour and
  // alpha together so void taps (a=0) don't dim glyph edges into the
  // background. Sharp centre uses LOD 0 so in-focus pixels stay crisp.
  vec4 sharp = textureLod(u_color, sharpUv, 0.0);

  float centerDepth = linearizeDepth(texture(u_depth, sharpUv).r);
  float centerCoc = signedCocPx(centerDepth);
  float centerAbs = abs(centerCoc);

  if (centerAbs < 0.5) {
    fragColor = sharp;
    return;
  }

  vec2 invRes = 1.0 / u_resolution;
  float radiusPx = centerAbs;

  // Per-pixel rotation. IGN gives a smooth low-frequency hash; multiplying
  // by 2π spreads it across the full circle. Adjacent pixels rotate by
  // similar angles so the integration is consistent locally.
  float angle = ign(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(angle);
  float sa = sin(angle);

  // Per-tap mip LOD. With NUM_TAPS over a disc of radius 'radiusPx', the
  // average centre-to-centre tap spacing is roughly 'radiusPx /
  // sqrt(NUM_TAPS)' pixels. Sampling at 'LOD = log2(spacing)' makes each
  // tap an area integral exactly tiling its kernel cell, which is the
  // analytic answer for a uniformly-sampled disc convolution. Three's
  // composer RT is mipmapped (CompositionRenderer's RT uses
  // LinearMipmapLinearFilter); the chain is regenerated on each
  // setRenderTarget transition so by the time this pass runs the LODs
  // are valid.
  float tapSpacingPx = max(radiusPx / sqrt(NUM_TAPS_F), 1.0);
  float tapLod = log2(tapSpacingPx);

  vec4 colorAccum = vec4(0.0);
  float weightAccum = 0.0;

  for (int i = 0; i < NUM_TAPS; i++) {
    float fi = float(i) + 0.5;
    // Vogel disk: r = sqrt(i/N), θ = i * golden_angle. Square-root keeps
    // the tap density uniform across the disc.
    float r = sqrt(fi / NUM_TAPS_F);
    float theta = fi * GOLDEN_ANGLE;
    vec2 unit = vec2(cos(theta), sin(theta));
    // Rotate the whole disc by the per-pixel angle.
    vec2 rotated = vec2(unit.x * ca - unit.y * sa, unit.x * sa + unit.y * ca);
    vec2 offsetPx = rotated * r * radiusPx;
    vec2 sampleUv = sharpUv + offsetPx * invRes;

    vec4 tap = textureLod(u_color, sampleUv, tapLod);
    colorAccum += tap;
    weightAccum += 1.0;
  }

  vec4 blurred = colorAccum / max(weightAccum, 1e-4);
  // Cross-fade to sharp on small CoC so the in-focus → out-of-focus
  // transition is smooth and there's no visible "blur kicks in" line.
  float fade = smoothstep(0.5, 1.5, centerAbs);
  fragColor = mix(sharp, blurred, fade);
}
`;

/**
 * `CameraDofComposerPass` is the camera DoF effect as a Three.js
 * postprocessing `Pass`. The fragment shader gathers along a Vogel disk
 * with per-pixel IGN rotation; see `DOF_BOKEH_FRAGMENT` for the rationale.
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
  private readonly blurMaterial: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly blurScene: any;

  private fullWidth = 1;
  private fullHeight = 1;

  constructor(id: string, pass: CameraDofPass) {
    super();
    this.id = id;
    this.pass = pass;
    const u = pass.uniforms;
    const maxBlurPx = Math.max(u.maxBlurPx * u.blurLevel, 1);

    this.blurMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DOF_BOKEH_VERTEX,
      fragmentShader: DOF_BOKEH_FRAGMENT,
      uniforms: {
        u_color: { value: null },
        u_depth: { value: null },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_sensorHeight: { value: u.sensorHeight },
        u_fov: { value: u.fov },
        u_focusDistance: { value: Math.max(u.focusDistance, 0.001) },
        u_fNumber: { value: Math.max(u.fNumber, 0.1) },
        u_blurLevel: { value: u.blurLevel },
        u_maxBlurPx: { value: maxBlurPx },
        u_depthNear: { value: u.near },
        u_depthFar: { value: u.far },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.blurScene = makeFullscreenScene(this.blurMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.fullWidth && h === this.fullHeight) return;
    this.fullWidth = w;
    this.fullHeight = h;
    this.blurMaterial.uniforms.u_resolution.value.set(w, h);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, writeBuffer: any, readBuffer: any): void {
    const depthTexture = readBuffer?.depthTexture ?? null;
    if (!depthTexture) {
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.clear();
      this.blurMaterial.uniforms.u_color.value = readBuffer.texture;
      return;
    }
    const w = readBuffer?.width ?? 1;
    const h = readBuffer?.height ?? 1;
    if (w !== this.fullWidth || h !== this.fullHeight) {
      this.setSize(w, h);
    }

    this.blurMaterial.uniforms.u_color.value = readBuffer.texture;
    this.blurMaterial.uniforms.u_depth.value = depthTexture;
    this.blurMaterial.uniforms.u_resolution.value.set(w, h);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    renderer.render(this.blurScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.blurMaterial.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFullscreenScene(material: any): any {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(FULLSCREEN_GEOMETRY, material));
  return scene;
}
