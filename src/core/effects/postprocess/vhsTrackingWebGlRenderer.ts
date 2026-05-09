import {
  vhsTrackingPostProcessKind,
  type VhsTrackingPostProcessPass,
} from "./vhsTracking";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import {
  WebGlPostProcessRenderer,
  type WebGlPostProcessDrawInput,
} from "./webGlRenderer";

const fragmentShaderSource = `
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_horizontalTear;
uniform float u_verticalRoll;
uniform float u_jitter;
uniform float u_bandSize;
uniform float u_chromaShiftPixels;
uniform float u_scanlines;
uniform float u_noise;
uniform float u_dropout;
uniform float u_tapeStretch;
uniform float u_seed;
varying vec2 v_texCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 19.19) * 43758.5453123);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, u_seed)), hash(vec2(i + 1.0, u_seed)), u);
}

void main() {
  vec2 uv = v_texCoord;
  float t = u_time * max(u_speed, 0.0);
  float line = floor(uv.y * u_resolution.y);
  float frameTick = floor(t * 29.97);
  float perLine = hash(vec2(line, frameTick)) - 0.5;
  float slowLine = noise1(line * 0.018 + frameTick * 0.37) - 0.5;
  float bandCenter = fract(t * 0.18 + noise1(frameTick * 0.13));
  float bandWidth = max(u_bandSize, 0.001);
  float bandDistance = abs(uv.y - bandCenter);
  bandDistance = min(bandDistance, 1.0 - bandDistance);
  float band = 1.0 - smoothstep(0.0, bandWidth, bandDistance);
  float headSwitch = 1.0 - smoothstep(0.02, 0.12, uv.y);
  float stretch = sin((uv.y + t * 0.13) * 22.0) * u_tapeStretch * 0.0025;
  float tear = (slowLine * 0.012 + perLine * 0.003) * u_horizontalTear;
  tear += band * (noise1(frameTick * 1.7) - 0.5) * 0.09 * u_horizontalTear;
  tear += headSwitch * (noise1(t * 7.0) - 0.5) * 0.04 * u_horizontalTear;
  uv.x += (tear + stretch) * u_intensity;
  uv.y = fract(uv.y + u_verticalRoll * u_intensity * 0.035 * t);
  uv.y += (noise1(frameTick * 0.9) - 0.5) * u_jitter * u_intensity * 0.004;

  float chroma = u_chromaShiftPixels * (0.45 + band * 0.9) / max(u_resolution.x, 1.0);
  vec2 redUv = clamp(uv + vec2(chroma, 0.0), 0.0, 1.0);
  vec2 greenUv = clamp(uv, 0.0, 1.0);
  vec2 blueUv = clamp(uv - vec2(chroma, 0.0), 0.0, 1.0);
  vec3 color = vec3(
    texture2D(u_image, redUv).r,
    texture2D(u_image, greenUv).g,
    texture2D(u_image, blueUv).b
  );

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, vec3(luma), 0.18 * u_intensity);
  float scan = sin(line * 3.14159265) * 0.5 + 0.5;
  color *= 1.0 - scan * u_scanlines * 0.18;
  color += (hash(vec2(line, floor(uv.x * u_resolution.x) + frameTick)) - 0.5) * u_noise * 0.22;
  float dropoutLine = step(1.0 - u_dropout * 0.018, hash(vec2(floor(line * 0.25), frameTick * 0.31)));
  float dropoutMask = dropoutLine * smoothstep(0.18, 0.98, hash(vec2(uv.x * 22.0, line + frameTick)));
  color = mix(color, vec3(0.92), dropoutMask * u_dropout * 0.65);
  color += band * vec3(0.08, 0.1, 0.14) * u_intensity;
  color *= 0.96 + 0.05 * noise1(frameTick * 0.41);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const uniformNames = [
  "u_image",
  "u_resolution",
  "u_time",
  "u_intensity",
  "u_speed",
  "u_horizontalTear",
  "u_verticalRoll",
  "u_jitter",
  "u_bandSize",
  "u_chromaShiftPixels",
  "u_scanlines",
  "u_noise",
  "u_dropout",
  "u_tapeStretch",
  "u_seed",
] as const;

export type VhsTrackingPostProcessRenderer =
  WebGlPostProcessRenderer<VhsTrackingPostProcessPass>;

export function createVhsTrackingPostProcessRenderer(): VhsTrackingPostProcessRenderer {
  return new WebGlPostProcessRenderer({
    fragmentShaderSource,
    uniformNames,
    draw: drawVhsTrackingPass,
  });
}

export function createVhsTrackingExportPostProcessRenderer(
  renderer: VhsTrackingPostProcessRenderer,
): ExportPostProcessRenderer<VhsTrackingPostProcessPass> {
  return {
    kind: vhsTrackingPostProcessKind,
    unavailableMessage:
      "Export post-process WebGL renderer is unavailable for active VHS Tracking pass.",
    render: ({ canvas, source, pass, width, height }) =>
      renderer.render(canvas, source, pass, width, height),
  };
}

function drawVhsTrackingPass({
  gl,
  pass,
  width,
  height,
  uniforms,
}: WebGlPostProcessDrawInput<VhsTrackingPostProcessPass>) {
  const values = pass.uniforms;
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform2f(uniforms.u_resolution, width, height);
  gl.uniform1f(uniforms.u_time, values.time);
  gl.uniform1f(uniforms.u_intensity, values.intensity);
  gl.uniform1f(uniforms.u_speed, values.speed);
  gl.uniform1f(uniforms.u_horizontalTear, values.horizontalTear);
  gl.uniform1f(uniforms.u_verticalRoll, values.verticalRoll);
  gl.uniform1f(uniforms.u_jitter, values.jitter);
  gl.uniform1f(uniforms.u_bandSize, values.bandSize);
  gl.uniform1f(uniforms.u_chromaShiftPixels, values.chromaShiftPixels);
  gl.uniform1f(uniforms.u_scanlines, values.scanlines);
  gl.uniform1f(uniforms.u_noise, values.noise);
  gl.uniform1f(uniforms.u_dropout, values.dropout);
  gl.uniform1f(uniforms.u_tapeStretch, values.tapeStretch);
  gl.uniform1f(uniforms.u_seed, values.seed);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
