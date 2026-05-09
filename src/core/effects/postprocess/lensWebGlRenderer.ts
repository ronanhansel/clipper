import { lensPostProcessKind, type LensPostProcessPass } from "./lens";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import {
  WebGlPostProcessRenderer,
  type WebGlPostProcessDrawInput,
} from "./webGlRenderer";
import type { PostProcessPass } from "../types";

const fragmentShaderSource = `
precision highp float;
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
varying vec2 v_texCoord;

void main() {
  vec2 pixel = v_texCoord * u_resolution;
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
    color = mix(color, vec3(1.0, 0.35, 0.35), maskFactor * 0.35);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

const lensUniformNames = [
  "u_image",
  "u_resolution",
  "u_focus",
  "u_radiusPixels",
  "u_softness",
  "u_magnification",
  "u_distortion",
  "u_chromaticAberrationPixels",
  "u_rimWidth",
  "u_rimOpacity",
  "u_dimAmount",
  "u_frameBackground",
  "u_chromaMaskEnabled",
  "u_chromaMaskPreview",
  "u_chromaMaskApplyInside",
  "u_chromaMaskFocus",
  "u_chromaMaskRadius",
  "u_chromaMaskFeather",
] as const;

export type LensPostProcessRenderer =
  WebGlPostProcessRenderer<LensPostProcessPass>;

export function createLensPostProcessRenderer(): LensPostProcessRenderer {
  return new WebGlPostProcessRenderer({
    fragmentShaderSource,
    uniformNames: lensUniformNames,
    draw: drawLensPass,
  });
}

export function selectLensPostProcessPass(passes: PostProcessPass[]) {
  const lensPasses = passes.filter(
    (pass): pass is LensPostProcessPass => pass.kind === lensPostProcessKind,
  );
  return {
    pass: lensPasses[0] ?? null,
    droppedPassCount: Math.max(0, lensPasses.length - 1),
  };
}

export function createLensExportPostProcessRenderer(
  renderer: LensPostProcessRenderer,
): ExportPostProcessRenderer<LensPostProcessPass> {
  return {
    kind: lensPostProcessKind,
    maxPassesPerFrame: 1,
    unavailableMessage:
      "Export post-process WebGL renderer is unavailable for active Lens pass.",
    render: ({ canvas, source, pass, width, height }) =>
      renderer.render(canvas, source, pass, width, height),
  };
}

function drawLensPass({
  gl,
  pass,
  width,
  height,
  uniforms,
}: WebGlPostProcessDrawInput<LensPostProcessPass>) {
  const values = pass.uniforms;
  const mask = values.chromaticAberrationMask;
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform2f(uniforms.u_resolution, width, height);
  gl.uniform2f(uniforms.u_focus, values.focus.x, values.focus.y);
  gl.uniform1f(uniforms.u_radiusPixels, values.radiusPixels);
  gl.uniform1f(uniforms.u_softness, values.softness);
  gl.uniform1f(uniforms.u_magnification, values.magnification);
  gl.uniform1f(uniforms.u_distortion, values.distortion);
  gl.uniform1f(
    uniforms.u_chromaticAberrationPixels,
    values.chromaticAberrationPixels,
  );
  gl.uniform1f(uniforms.u_rimWidth, values.rimWidth);
  gl.uniform1f(uniforms.u_rimOpacity, values.rimOpacity);
  gl.uniform1f(uniforms.u_dimAmount, values.dimAmount);
  gl.uniform3f(
    uniforms.u_frameBackground,
    values.frameBackground.r,
    values.frameBackground.g,
    values.frameBackground.b,
  );
  gl.uniform1f(uniforms.u_chromaMaskEnabled, mask.enabled ? 1 : 0);
  gl.uniform1f(uniforms.u_chromaMaskPreview, mask.preview ? 1 : 0);
  gl.uniform1f(uniforms.u_chromaMaskApplyInside, mask.applyInside ? 1 : 0);
  gl.uniform2f(uniforms.u_chromaMaskFocus, mask.focus.x, mask.focus.y);
  gl.uniform2f(uniforms.u_chromaMaskRadius, mask.radiusX, mask.radiusY);
  gl.uniform1f(uniforms.u_chromaMaskFeather, mask.feather);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
