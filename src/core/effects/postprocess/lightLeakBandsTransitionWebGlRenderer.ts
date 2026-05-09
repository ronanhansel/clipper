import {
  lightLeakBandsTransitionPostProcessKind,
  type LightLeakBandsTransitionPostProcessPass,
} from "./lightLeakBandsTransition";
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
uniform float u_bandCount;
uniform float u_drift;
uniform float u_warmth;
uniform float u_flicker;
uniform float u_seed;
varying vec2 v_texCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1)) + u_seed * 61.73) * 43758.5453123);
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

float verticalStreak(vec2 uv, float center, float width, float feather) {
  float dist = abs(uv.x - center);
  return 1.0 - smoothstep(width, width + feather, dist);
}

float scratchField(vec2 uv, float p) {
  float result = 0.0;
  float count = floor(max(u_bandCount, 1.0));
  for (int i = 0; i < 12; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float base = hash(vec2(fi + 1.7, u_seed * 0.17));
    float center = fract(base + p * (0.12 + u_drift * 0.08) + fi * 0.07);
    float width = mix(0.0025, 0.03, hash(vec2(fi + 3.1, u_seed * 0.31)) * u_softness);
    float feather = width * mix(1.8, 4.2, hash(vec2(fi + 5.9, u_seed * 0.27)));
    float streak = verticalStreak(uv, center, width, feather);
    float broken = step(0.22, noise(vec2(fi * 7.1, floor(uv.y * 22.0) + p * 9.0)));
    result += streak * broken;
  }
  return clamp(result, 0.0, 1.0);
}

float flashEnvelope(float p) {
  float rise = smoothstep(0.06, 0.32, p);
  float fall = 1.0 - smoothstep(0.58, 0.94, p);
  return rise * fall;
}

void main() {
  vec2 uv = v_texCoord;
  vec3 source = texture2D(u_image, uv).rgb;
  float p = clamp(u_progress, 0.0, 1.0);
  float env = flashEnvelope(p);
  float sweepCenter = mix(-0.08, 1.08, p + (noise(vec2(p * 4.0, u_seed)) - 0.5) * 0.08);
  float sweepWidth = mix(0.04, 0.16, clamp(u_softness, 0.02, 1.0));
  float sweep = verticalStreak(uv, sweepCenter, sweepWidth, sweepWidth * 2.4);
  float streaks = scratchField(uv, p);
  float gateFlicker = 0.72 + noise(vec2(floor(p * 36.0), u_seed * 2.7)) * u_flicker * 1.4;
  float microFlicker = 0.92 + (noise(vec2(uv.y * 36.0, p * 22.0 + u_seed)) - 0.5) * u_flicker;
  float flash = sweep * env * gateFlicker;
  float scratches = streaks * env * microFlicker;
  float baseLeak = max(flash, scratches * 0.9) * u_intensity;

  float warmMix = clamp(u_warmth, 0.0, 1.0);
  float coldMix = clamp(-u_warmth, 0.0, 1.0);
  vec3 amber = mix(vec3(1.0, 0.48, 0.08), vec3(1.0, 0.84, 0.42), warmMix);
  vec3 red = mix(vec3(0.95, 0.28, 0.06), vec3(1.0, 0.58, 0.16), warmMix);
  vec3 cold = mix(vec3(0.72, 0.95, 1.0), vec3(0.34, 0.54, 1.0), coldMix);
  vec3 leakColor = mix(amber, cold, coldMix);
  vec3 coreColor = mix(red, cold, coldMix * 0.72);
  vec3 cyan = cold * (0.28 + coldMix * 0.72);
  float warmBody = flash * (0.7 + 0.3 * noise(vec2(uv.y * 7.0, p * 13.0)));
  float redCore = scratches * (0.55 + 0.45 * noise(vec2(uv.y * 29.0, p * 17.0)));
  float cyanEdge = streaks * flash * 0.45;

  vec3 color = source;
  color += leakColor * warmBody;
  color += coreColor * redCore;
  color += cyan * cyanEdge;
  color = mix(color, vec3(1.0), baseLeak * 0.22);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const uniformNames = [
  "u_image",
  "u_resolution",
  "u_progress",
  "u_intensity",
  "u_softness",
  "u_bandCount",
  "u_drift",
  "u_warmth",
  "u_flicker",
  "u_seed",
] as const;

export type LightLeakBandsTransitionPostProcessRenderer =
  WebGlPostProcessRenderer<LightLeakBandsTransitionPostProcessPass>;

export function createLightLeakBandsTransitionPostProcessRenderer(): LightLeakBandsTransitionPostProcessRenderer {
  return new WebGlPostProcessRenderer({
    fragmentShaderSource,
    uniformNames,
    draw: drawLightLeakBandsTransitionPass,
  });
}

export function createLightLeakBandsTransitionExportPostProcessRenderer(
  renderer: LightLeakBandsTransitionPostProcessRenderer,
): ExportPostProcessRenderer<LightLeakBandsTransitionPostProcessPass> {
  return {
    kind: lightLeakBandsTransitionPostProcessKind,
    unavailableMessage:
      "Export post-process WebGL renderer is unavailable for active Light Leak Bands transition pass.",
    render: ({ canvas, source, pass, width, height }) =>
      renderer.render(canvas, source, pass, width, height),
  };
}

function drawLightLeakBandsTransitionPass({
  gl,
  pass,
  width,
  height,
  uniforms,
}: WebGlPostProcessDrawInput<LightLeakBandsTransitionPostProcessPass>) {
  const values = pass.uniforms;
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform2f(uniforms.u_resolution, width, height);
  gl.uniform1f(uniforms.u_progress, values.progress);
  gl.uniform1f(uniforms.u_intensity, values.intensity);
  gl.uniform1f(uniforms.u_softness, values.softness);
  gl.uniform1f(uniforms.u_bandCount, values.bandCount);
  gl.uniform1f(uniforms.u_drift, values.drift);
  gl.uniform1f(uniforms.u_warmth, values.warmth);
  gl.uniform1f(uniforms.u_flicker, values.flicker);
  gl.uniform1f(uniforms.u_seed, values.seed);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
