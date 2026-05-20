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
 * Production DoF pipeline (phase 2f, after AW/Frostbite/UE5).
 *
 *   inputColor (RGBA16F linear) + inputDepth
 *     → 1. coc          (full-res, signed CoC in .r)
 *     → 2. setup        (half-res, RGBA16F: Karis-prefiltered RGB
 *                        premultiplied by weight; signed CoC in .a)
 *     → 3. nearTileMax  (1/8 res, max-filter of `max(0,-coc)`,
 *                        widens the near gather kernel beyond a
 *                        foreground silhouette so foreground bokeh
 *                        bleeds past its rectangular bounds)
 *     → 4. farGather    (half-res, 48-tap golden-spiral, far CoC only,
 *                        premultiplied RGB + coverage alpha)
 *     → 5. nearGather   (half-res, 48-tap, kernel radius = dilated near
 *                        CoC from pass 3, premultiplied + coverage)
 *     → 6. composite    (full-res):
 *           out = mix(sharp, far.rgb / max(far.a,eps), saturate(far.a));
 *           out = mix(out,  near.rgb / max(near.a,eps), saturate(near.a));
 *
 * Why each piece:
 *   - Linear-light + RGBA16F: Karis prefilter exceeds [0,1]; bokeh shape
 *     in gamma space looks muddy and de-saturated.
 *   - Half-res gather: 48 taps × 1920×1080 was 100M+ texel reads/frame
 *     for a result that visually matches 48 taps × 960×540 ≈ 25M reads.
 *     The half-res result is upsampled with bilinear + MIN/MAX-aware
 *     composite at full res, so card silhouettes stay crisp when in
 *     focus.
 *   - Near-CoC tile-max dilation: a single-gather kernel can only pull
 *     samples *into* a pixel. Without dilation, foreground bokeh stops
 *     at the foreground silhouette — exactly the "hard rectangular
 *     edges" bug. Dilating the near CoC makes the gather pull in
 *     foreground samples even at pixels just outside the silhouette.
 *   - Near/far split: a near-blurred foreground must occlude in-focus
 *     subjects behind it (its rays cross the focal plane and spread); a
 *     far-blurred background must NOT bleed forward over a sharp closer
 *     subject. Single-pass DoF can't represent both at once. Two passes
 *     + over-composite is the canonical fix.
 *   - Karis weight `1 / (1 + luma)`: prevents bright pixels from
 *     dominating the weighted average and producing "firefly bokeh"
 *     (single bright pixels stamping the kernel pattern).
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

const DOF_SETUP_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;     // full-res linear color
uniform sampler2D u_coc;       // full-res signed CoC in .r
uniform vec2 u_halfTexel;      // 1/halfRes (UV step at half-res output)
uniform float u_highlightThreshold;
uniform float u_highlightBoost;

void main() {
  // 4-tap box at full-res to populate one half-res texel. Plain average,
  // no Karis prefilter — Karis 1/(1+luma) is a fix for HDR fireflies but
  // in our SDR-from-DOM input it just attenuates highlights, killing the
  // bokeh-ball pop that real lenses produce. Highlight emphasis is done
  // explicitly below via threshold-and-boost so bright pixels carry
  // extra energy into the gather.
  vec2 o = u_halfTexel * 0.25;
  vec3 c0 = texture2D(u_image, v_uv + vec2(-o.x, -o.y)).rgb;
  vec3 c1 = texture2D(u_image, v_uv + vec2( o.x, -o.y)).rgb;
  vec3 c2 = texture2D(u_image, v_uv + vec2(-o.x,  o.y)).rgb;
  vec3 c3 = texture2D(u_image, v_uv + vec2( o.x,  o.y)).rgb;
  vec3 colour = 0.25 * (c0 + c1 + c2 + c3);
  // Highlight boost: pixels brighter than the threshold get an
  // additive bonus proportional to how far over the threshold they
  // are. The boost is what makes specular highlights, screen LEDs, and
  // sky behind a window form bright, well-defined bokeh discs instead
  // of dim averaged smears. The threshold should be set just below the
  // brightest "non-highlight" content (≈0.85 luma for typical UI).
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  float over = max(luma - u_highlightThreshold, 0.0);
  vec3 boosted = colour + colour * over * u_highlightBoost;
  // Signed CoC: read centre tap (full-res) — averaging signed CoC across
  // a depth discontinuity would fabricate focal-plane pixels.
  float coc = texture2D(u_coc, v_uv).r;
  gl_FragColor = vec4(boosted, coc);
}
`;

const DOF_NEAR_TILE_MAX_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_setup;     // half-res setup target (.a = signed CoC)
uniform vec2 u_halfTexel;      // 1/halfRes
uniform float u_tileSize;      // tile size in half-res pixels (4)

void main() {
  // Max filter over a tile of half-res CoC pixels, restricted to the
  // near (negative) side. Output is a single channel: max(0, -coc).
  // Sample on a 4×4 grid covering the tile.
  vec2 base = v_uv;
  float maxNear = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 uv = base + vec2(float(i), float(j)) * u_halfTexel;
      float coc = texture2D(u_setup, uv).a;
      maxNear = max(maxNear, max(-coc, 0.0));
    }
  }
  gl_FragColor = vec4(maxNear, 0.0, 0.0, 1.0);
}
`;

const DOF_FAR_GATHER_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_setup;     // half-res RGBA: (boosted) RGB, signed CoC in .a
uniform vec2 u_halfResolution;
uniform float u_maxBlurPx;

const int FAR_TAPS = 48;
const float GOLDEN_ANGLE = 2.39996323;

float interleavedGradientNoise(vec2 p) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(p, magic.xy)));
}

void main() {
  // Constant kernel radius for every pixel — this is the
  // scatter-as-gather pivot. Earlier versions scaled the kernel by the
  // centre pixel's CoC, which made in-focus pixels gather nothing from
  // blurred neighbours. Pixelmischief and Doom's bokeh both use a
  // fixed-radius kernel and rely on SpreadCmp to gate per-tap
  // contribution; we do the same.
  float radiusPx = u_maxBlurPx * 0.5; // half-res pixels
  vec2 halfTexel = 1.0 / u_halfResolution;
  float rotation = interleavedGradientNoise(v_uv * u_halfResolution) * 6.28318530718;

  // Centre tap always passes (r=0, step(0, sFar+0.5)=1 unconditionally).
  vec4 centre = texture2D(u_setup, v_uv);
  float centreFar = max(centre.a, 0.0) * 0.5;
  vec3 accum = centre.rgb;
  float coverage = 1.0;

  for (int i = 1; i < FAR_TAPS; i++) {
    float t = (float(i) + 0.5) / float(FAR_TAPS);
    float r = sqrt(t) * radiusPx;
    float angle = float(i) * GOLDEN_ANGLE + rotation;
    vec2 offset = vec2(cos(angle), sin(angle)) * r * halfTexel;
    vec2 uv = clamp(v_uv + offset, vec2(0.0), vec2(1.0));
    vec4 s = texture2D(u_setup, uv);
    float sFar = max(s.a, 0.0) * 0.5; // half-res pixels
    // SpreadCmp: a far tap at distance r from us spreads onto our pixel
    // iff its CoC disc reaches us (sFar >= r). +0.5 = half-pixel
    // tolerance so the disc edge doesn't dither.
    float keep = step(r, sFar + 0.5);
    accum += s.rgb * keep;
    coverage += keep;
  }

  // RGB: gather mean. Alpha: confidence that THIS pixel is far-blurred,
  // derived from centre CoC magnitude. The composite mixes sharp → far
  // by this alpha, so a sharp pixel (centreFar≈0) passes through the
  // sharp source while a heavily blurred pixel (centreFar near radius)
  // is fully replaced by the gather result.
  vec3 outRgb = accum / coverage;
  float farAlpha = clamp(centreFar / max(radiusPx * 0.5, 1.0), 0.0, 1.0);
  gl_FragColor = vec4(outRgb, farAlpha);
}
`;

const DOF_NEAR_GATHER_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_setup;          // half-res setup
uniform sampler2D u_nearTileMax;    // 1/tileSize res, max(0,-coc) per tile
uniform vec2 u_halfResolution;
uniform float u_maxBlurPx;

const int NEAR_TAPS = 48;
const float GOLDEN_ANGLE = 2.39996323;

float interleavedGradientNoise(vec2 p) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(p, magic.xy)));
}

void main() {
  // Sample the dilated near CoC for THIS pixel. Critically: this can be
  // non-zero even when our own CoC is positive or zero — that's the
  // mechanism by which foreground bokeh extends past its silhouette.
  float dilatedNear = texture2D(u_nearTileMax, v_uv).r;
  if (dilatedNear < 0.5) {
    // Pixel is fully outside any nearby foreground silhouette → near
    // layer is empty here. Coverage 0 so the composite passes through.
    gl_FragColor = vec4(0.0);
    return;
  }
  float radiusPx = dilatedNear * 0.5; // half-res pixels
  vec2 halfTexel = 1.0 / u_halfResolution;
  float rotation = interleavedGradientNoise(v_uv * u_halfResolution) * 6.28318530718;
  vec3 accum = vec3(0.0);
  float coverage = 0.0;
  for (int i = 0; i < NEAR_TAPS; i++) {
    float t = (float(i) + 0.5) / float(NEAR_TAPS);
    float r = sqrt(t) * radiusPx;
    float angle = float(i) * GOLDEN_ANGLE + rotation;
    vec2 offset = vec2(cos(angle), sin(angle)) * r * halfTexel;
    vec2 uv = clamp(v_uv + offset, vec2(0.0), vec2(1.0));
    vec4 s = texture2D(u_setup, uv);
    float sNear = max(-s.a, 0.0) * 0.5; // half-res pixels, near only
    // Foreground spread test: a foreground tap at distance r spreads to
    // our pixel iff its near CoC ≥ r. This is what produces the
    // characteristic "near bokeh bleeds forward" behaviour.
    float keep = step(r, sNear + 0.5);
    accum += s.rgb * keep;
    coverage += keep;
  }
  if (coverage < 1e-3) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // RGB: gather mean. Alpha: how covered THIS pixel is by foreground
  // bokeh, from 0 at the dilation boundary to 1 inside a fully-covered
  // foreground region. Composite OVER-blends by this alpha so the
  // foreground occludes everything behind.
  vec3 outRgb = accum / coverage;
  float nearAlpha = clamp(coverage / float(NEAR_TAPS), 0.0, 1.0);
  // Boost alpha so partial coverage still occludes — a foreground edge
  // pixel where ~30% of taps reach should be ~80% opaque, not 30%.
  nearAlpha = clamp(nearAlpha * 2.5, 0.0, 1.0);
  gl_FragColor = vec4(outRgb, nearAlpha);
}
`;

const DOF_COMPOSITE_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_sharp;     // full-res linear color
uniform sampler2D u_far;       // half-res far layer (mean RGB + far-confidence alpha)
uniform sampler2D u_near;      // half-res near layer (mean RGB + coverage alpha)

void main() {
  vec3 sharp = texture2D(u_sharp, v_uv).rgb;
  vec4 far  = texture2D(u_far,   v_uv);
  vec4 near = texture2D(u_near,  v_uv);
  // Far layer: alpha = how far-blurred this pixel wants to be. mix sharp
  // → far gather by that. A pixel right at the focal plane has far.a≈0
  // and stays sharp; a heavily defocused background pixel has far.a≈1
  // and is fully replaced by the gather mean (which is the bokeh disc
  // average for that pixel).
  vec3 result = mix(sharp, far.rgb, clamp(far.a, 0.0, 1.0));
  // Near layer: OVER-composited on top. Foreground bokeh occludes
  // whatever is behind it (sharp + far).
  result = mix(result, near.rgb, clamp(near.a, 0.0, 1.0));
  gl_FragColor = vec4(result, 1.0);
}
`;

/**
 * `CameraDofComposerPass` is the composer-side adapter for the camera
 * DoF effect. It owns three sub-shaders and one full-res render target
 * and orchestrates them per `render()` call.
 *
 * Pass graph (per frame):
 *   inputColor + inputDepth
 *     → coc       (full-res, signed CoC encoded to .r)
 *     → bokeh     (full-res, 96-tap golden-spiral disc, IGN rotation)
 *     → composite (full-res sharp ← blurred lerp by |CoC|)
 *
 * Earlier iterations ran bokeh at half-res with a separate downsample
 * + post-blur smoothing pass. That introduced visible chunky stair-
 * stepping along glyph edges (the 2× downsample destroyed the cards'
 * anti-aliased rims, then the upsample re-quantised them). At full-res
 * the IGN-rotated 96-tap kernel produces smooth bokeh without the
 * downsample workaround.
 */
const NEAR_TILE_PX = 8; // full-res tile size for near-CoC dilation

export class CameraDofComposerPass implements ComposerPass {
  readonly id: string;
  readonly pass: CameraDofPass;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cocMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly setupMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly nearTileMaxMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly farGatherMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly nearGatherMaterial: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeMaterial: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cocScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly setupScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly nearTileMaxScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly farGatherScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly nearGatherScene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeScene: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cocTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private setupTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nearTileMaxTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private farTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nearTarget: any;

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
    this.setupMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_SETUP_FRAGMENT,
      uniforms: {
        u_image: { value: null },
        u_coc: { value: null },
        u_halfTexel: { value: new THREE.Vector2(1, 1) },
        // Threshold above which a pixel's RGB gets a multiplicative
        // boost so it forms a brighter bokeh disc in the gather. 0.85
        // luma puts it just past typical UI mid-greys but below
        // specular highlights and sky / lights.
        u_highlightThreshold: { value: 0.85 },
        // Multiplier applied to the over-threshold portion. 6× makes
        // a luma=1.0 pixel emit ~1 + 0.15*6 = 1.9× its colour into the
        // gather. Big enough for visible bokeh balls without blowing
        // out the average across a flat bright region.
        u_highlightBoost: { value: 6.0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.nearTileMaxMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_NEAR_TILE_MAX_FRAGMENT,
      uniforms: {
        u_setup: { value: null },
        u_halfTexel: { value: new THREE.Vector2(1, 1) },
        u_tileSize: { value: NEAR_TILE_PX * 0.5 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.farGatherMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_FAR_GATHER_FRAGMENT,
      uniforms: {
        u_setup: { value: null },
        u_halfResolution: { value: new THREE.Vector2(1, 1) },
        u_maxBlurPx: { value: Math.max(u.maxBlurPx, 1) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.nearGatherMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_NEAR_GATHER_FRAGMENT,
      uniforms: {
        u_setup: { value: null },
        u_nearTileMax: { value: null },
        u_halfResolution: { value: new THREE.Vector2(1, 1) },
        u_maxBlurPx: { value: Math.max(u.maxBlurPx, 1) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: CAMERA_LENS_VERTEX,
      fragmentShader: DOF_COMPOSITE_FRAGMENT,
      uniforms: {
        u_sharp: { value: null },
        u_far: { value: null },
        u_near: { value: null },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.cocScene = makeFullscreenScene(this.cocMaterial);
    this.setupScene = makeFullscreenScene(this.setupMaterial);
    this.nearTileMaxScene = makeFullscreenScene(this.nearTileMaxMaterial);
    this.farGatherScene = makeFullscreenScene(this.farGatherMaterial);
    this.nearGatherScene = makeFullscreenScene(this.nearGatherMaterial);
    this.compositeScene = makeFullscreenScene(this.compositeMaterial);

    // CoC at full-res in RGBA16F (signed CoC straight to .r — no
    // 8-bit encode/decode, no bilinear-across-sign-discontinuity bug).
    this.cocTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    // Setup at half-res, RGBA16F. Karis-prefiltered RGB premultiplied
    // by weight; signed CoC in alpha for the gather passes.
    this.setupTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    // Near-CoC dilation at 1/NEAR_TILE_PX of full-res. Single-channel
    // half-float is enough — only stores max(0,-coc) magnitude.
    this.nearTileMaxTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    // Far + near layers at half-res, RGBA16F (premult RGB + coverage).
    this.farTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.nearTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.fullWidth && h === this.fullHeight) return;
    this.fullWidth = w;
    this.fullHeight = h;
    const halfW = Math.max(1, Math.floor(w / 2));
    const halfH = Math.max(1, Math.floor(h / 2));
    const tileW = Math.max(1, Math.floor(w / NEAR_TILE_PX));
    const tileH = Math.max(1, Math.floor(h / NEAR_TILE_PX));
    this.cocTarget.setSize(w, h);
    this.setupTarget.setSize(halfW, halfH);
    this.nearTileMaxTarget.setSize(tileW, tileH);
    this.farTarget.setSize(halfW, halfH);
    this.nearTarget.setSize(halfW, halfH);
    this.cocMaterial.uniforms.u_resolution.value.set(w, h);
    this.setupMaterial.uniforms.u_halfTexel.value.set(1 / halfW, 1 / halfH);
    this.nearTileMaxMaterial.uniforms.u_halfTexel.value.set(
      1 / halfW,
      1 / halfH,
    );
    this.farGatherMaterial.uniforms.u_halfResolution.value.set(halfW, halfH);
    this.nearGatherMaterial.uniforms.u_halfResolution.value.set(halfW, halfH);
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

    // 2. Setup / downsample to half-res. Karis-prefiltered colour and
    // signed CoC packed into RGBA16F.
    this.setupMaterial.uniforms.u_image.value = input.inputColor;
    this.setupMaterial.uniforms.u_coc.value = this.cocTarget.texture;
    input.renderer.setRenderTarget(this.setupTarget);
    input.renderer.clear();
    input.renderer.render(this.setupScene, FULLSCREEN_CAMERA);

    // 3. Near-CoC tile-max dilation. Output is R-channel only; widens
    // the near gather kernel beyond a foreground silhouette.
    this.nearTileMaxMaterial.uniforms.u_setup.value = this.setupTarget.texture;
    input.renderer.setRenderTarget(this.nearTileMaxTarget);
    input.renderer.clear();
    input.renderer.render(this.nearTileMaxScene, FULLSCREEN_CAMERA);

    // 4. Far gather (positive CoC only). Premultiplied RGB + coverage.
    this.farGatherMaterial.uniforms.u_setup.value = this.setupTarget.texture;
    input.renderer.setRenderTarget(this.farTarget);
    input.renderer.clear();
    input.renderer.render(this.farGatherScene, FULLSCREEN_CAMERA);

    // 5. Near gather (kernel scaled by dilated near CoC). Premultiplied
    // RGB + coverage.
    this.nearGatherMaterial.uniforms.u_setup.value = this.setupTarget.texture;
    this.nearGatherMaterial.uniforms.u_nearTileMax.value =
      this.nearTileMaxTarget.texture;
    input.renderer.setRenderTarget(this.nearTarget);
    input.renderer.clear();
    input.renderer.render(this.nearGatherScene, FULLSCREEN_CAMERA);

    // 6. Composite at full-res: sharp ← far over ← near over.
    this.compositeMaterial.uniforms.u_sharp.value = input.inputColor;
    this.compositeMaterial.uniforms.u_far.value = this.farTarget.texture;
    this.compositeMaterial.uniforms.u_near.value = this.nearTarget.texture;
    input.renderer.setRenderTarget(input.output);
    input.renderer.clear();
    input.renderer.render(this.compositeScene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.cocMaterial.dispose();
    this.setupMaterial.dispose();
    this.nearTileMaxMaterial.dispose();
    this.farGatherMaterial.dispose();
    this.nearGatherMaterial.dispose();
    this.compositeMaterial.dispose();
    this.cocTarget.dispose();
    this.setupTarget.dispose();
    this.nearTileMaxTarget.dispose();
    this.farTarget.dispose();
    this.nearTarget.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFullscreenScene(material: any): any {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(FULLSCREEN_GEOMETRY, material));
  return scene;
}
