import {
  filmBurnTransitionPostProcessKind,
  type FilmBurnTransitionPostProcessPass,
} from "./filmBurnTransition";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import {
  WebGlPostProcessRenderer,
  type WebGlPostProcessDrawInput,
} from "./webGlRenderer";

const fragmentShaderSource = `
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_progress;
uniform float u_intensity;
uniform float u_softness;
uniform float u_grain;
uniform float u_seed;
varying vec2 v_texCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 43.17) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = v_texCoord;
  vec3 source = texture2D(u_image, uv).rgb;
  float p = clamp(u_progress, 0.0, 1.0);
  float edge = smoothstep(0.0, 1.0, p) * 1.45 - 0.2;
  float flameNoise = noise(vec2(uv.x * 2.2 + p * 3.1, uv.y * 4.8 - p * 1.7));
  float verticalBias = uv.x + (flameNoise - 0.5) * u_softness;
  float burn = smoothstep(edge - u_softness, edge + u_softness, verticalBias);
  float hot = smoothstep(edge - u_softness * 0.18, edge + u_softness * 0.22, verticalBias) * (1.0 - burn);
  float flicker = noise(uv * u_resolution / 96.0 + vec2(p * 8.0, u_seed));
  float grain = (hash(uv * u_resolution + p * 97.0) - 0.5) * u_grain;
  vec3 amber = vec3(1.0, 0.47, 0.08);
  vec3 yellow = vec3(1.0, 0.86, 0.33);
  vec3 color = mix(source, amber, burn * u_intensity * 0.68);
  color = mix(color, yellow, hot * u_intensity);
  color += vec3(grain + flicker * 0.08 * u_intensity);
  color *= 1.0 + hot * 0.75 * u_intensity;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const uniformNames = [
  "u_image",
  "u_resolution",
  "u_progress",
  "u_intensity",
  "u_softness",
  "u_grain",
  "u_seed",
] as const;

export type FilmBurnTransitionPostProcessRenderer =
  WebGlPostProcessRenderer<FilmBurnTransitionPostProcessPass>;

export function createFilmBurnTransitionPostProcessRenderer(): FilmBurnTransitionPostProcessRenderer {
  return new WebGlPostProcessRenderer({
    fragmentShaderSource,
    uniformNames,
    draw: drawFilmBurnTransitionPass,
  });
}

export function createFilmBurnTransitionExportPostProcessRenderer(
  renderer: FilmBurnTransitionPostProcessRenderer,
): ExportPostProcessRenderer<FilmBurnTransitionPostProcessPass> {
  return {
    kind: filmBurnTransitionPostProcessKind,
    unavailableMessage:
      "Export post-process WebGL renderer is unavailable for active Film Burn transition pass.",
    render: ({ canvas, source, pass, width, height }) =>
      renderer.render(canvas, source, pass, width, height),
  };
}

function drawFilmBurnTransitionPass({
  gl,
  pass,
  width,
  height,
  uniforms,
}: WebGlPostProcessDrawInput<FilmBurnTransitionPostProcessPass>) {
  const values = pass.uniforms;
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform2f(uniforms.u_resolution, width, height);
  gl.uniform1f(uniforms.u_progress, values.progress);
  gl.uniform1f(uniforms.u_intensity, values.intensity);
  gl.uniform1f(uniforms.u_softness, values.softness);
  gl.uniform1f(uniforms.u_grain, values.grain);
  gl.uniform1f(uniforms.u_seed, values.seed);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
