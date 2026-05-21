import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
// @ts-ignore - Three BokehShader2 has no .d.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { BokehShader } from "three/examples/jsm/shaders/BokehShader2.js";
const ThreeBokehShader2: any = BokehShader;
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

/**
 * `CameraDofComposerPass` is the camera DoF effect as a Three.js
 * postprocessing `Pass`, backed by Three's native `BokehShader2`.
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

    const bokehUniforms = THREE.UniformsUtils.clone(ThreeBokehShader2.uniforms);
    const focalLengthMm =
      u.sensorHeight / (2 * Math.tan((u.fov * Math.PI) / 360));
    const maxBlurPx = Math.max(u.maxBlurPx * u.blurLevel, 1);
    const maxBlurRingScale = maxBlurPx / 4;
    const fragmentShader = ThreeBokehShader2.fragmentShader
      .replace(
        `			if(blur < 0.05) {
				//some optimization thingy
				col = texture2D(tColor, vUv.xy).rgb;
			} else {
				col = texture2D(tColor, vUv.xy).rgb;
				float s = 1.0;
				int ringsamples;

				for (int i = 1; i <= rings; i++) {
					/*unboxstart*/
					ringsamples = i * samples;

					for (int j = 0 ; j < maxringsamples ; j++) {
						if (j >= ringsamples) break;
						s += gather(float(i), float(j), ringsamples, col, w, h, blur);
					}
					/*unboxend*/
				}

				col /= s; //divide by sample count
			}`,
        `			vec3 sharp = texture2D(tColor, vUv.xy).rgb;
			col = sharp;
			float s = 1.0;
			int ringsamples;

			for (int i = 1; i <= rings; i++) {
				/*unboxstart*/
				ringsamples = i * samples;

				for (int j = 0 ; j < maxringsamples ; j++) {
					if (j >= ringsamples) break;
					s += gather(float(i), float(j), ringsamples, col, w, h, blur);
				}
				/*unboxend*/
			}

			col /= s; //divide by sample count
			col = mix(sharp, col, smoothstep(0.0, 0.12, blur));`,
      )
      .replace(
        `			float step = PI*2.0 / float(ringsamples);
			float pw = cos(j*step)*i;
			float ph = sin(j*step)*i;`,
        `			float step = PI*2.0 / float(ringsamples);
			float jitter = rand(vUv.xy) * PI * 2.0;
			float pw = cos(j*step + jitter)*i;
			float ph = sin(j*step + jitter)*i;`,
      )
      .replace("#include <tonemapping_fragment>", "")
      .replace("#include <colorspace_fragment>", "");
    this.blurMaterial = new THREE.ShaderMaterial({
      defines: {
        ...ThreeBokehShader2.defines,
        RINGS: 5,
        SAMPLES: 5,
      },
      uniforms: bokehUniforms,
      vertexShader: ThreeBokehShader2.vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    bokehUniforms.tColor.value = null;
    bokehUniforms.tDepth.value = null;
    bokehUniforms.textureWidth.value = 1;
    bokehUniforms.textureHeight.value = 1;
    bokehUniforms.focalDepth.value = Math.max(u.focusDistance, 0.001);
    bokehUniforms.focalLength.value = focalLengthMm;
    bokehUniforms.fstop.value = Math.max(u.fNumber, 0.1);
    bokehUniforms.maxblur.value = maxBlurRingScale;
    bokehUniforms.znear.value = u.near;
    bokehUniforms.zfar.value = u.far;
    bokehUniforms.shaderFocus.value = false;
    bokehUniforms.manualdof.value = false;
    bokehUniforms.showFocus.value = false;
    bokehUniforms.vignetting.value = false;
    bokehUniforms.depthblur.value = false;
    bokehUniforms.noise.value = true;
    bokehUniforms.dithering.value = 0.0001;
    bokehUniforms.threshold.value = 1.0;
    bokehUniforms.gain.value = 0.0;
    bokehUniforms.bias.value = 0.5;
    bokehUniforms.fringe.value = 0.0;
    bokehUniforms.pentagon.value = false;

    this.blurScene = makeFullscreenScene(this.blurMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.fullWidth && h === this.fullHeight) return;
    this.fullWidth = w;
    this.fullHeight = h;
    this.blurMaterial.uniforms.textureWidth.value = w;
    this.blurMaterial.uniforms.textureHeight.value = h;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(renderer: any, writeBuffer: any, readBuffer: any): void {
    const depthTexture = readBuffer?.depthTexture ?? null;
    if (!depthTexture) {
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.clear();
      this.blurMaterial.uniforms.tColor.value = readBuffer.texture;
      return;
    }
    const w = readBuffer?.width ?? 1;
    const h = readBuffer?.height ?? 1;
    if (w !== this.fullWidth || h !== this.fullHeight) {
      this.setSize(w, h);
    }

    this.blurMaterial.uniforms.tColor.value = readBuffer.texture;
    this.blurMaterial.uniforms.tDepth.value = depthTexture;
    this.blurMaterial.uniforms.textureWidth.value = w;
    this.blurMaterial.uniforms.textureHeight.value = h;
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
