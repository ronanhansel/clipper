import { lensPostProcessKind, type LensPostProcessPass } from "./lens";
import { LiveDomTextureUploader, type LiveDomWebGlContext } from "./liveDomCapability";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import type { PostProcessPass } from "../types";

const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const fragmentShaderSource = `
precision mediump float;
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
  vec2 aberration = direction * u_chromaticAberrationPixels * chromaMask / u_resolution;
  vec3 lensColor = vec3(
    texture2D(u_image, lensUv + aberration).r,
    texture2D(u_image, lensUv).g,
    texture2D(u_image, lensUv - aberration).b
  );
  vec3 color = mix(u_frameBackground, lensColor, coverage);
  color *= 1.0 - u_dimAmount * (1.0 - coverage);
  color += vec3(0.22) * rim * u_rimOpacity;
  gl_FragColor = vec4(color, 1.0);
}
`;

export class LensPostProcessRenderer {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffers: WebGLBuffer[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly liveDomTextureUploader = new LiveDomTextureUploader();

  render(canvas: HTMLCanvasElement, source: TexImageSource, pass: LensPostProcessPass, width: number, height: number) {
    const gl = this.ensureContext(canvas);
    if (!gl || !this.program || !this.texture || gl.isContextLost()) return false;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.draw(gl, pass, width, height);
    return !gl.isContextLost();
  }

  renderElement(canvas: HTMLCanvasElement, source: Element, pass: LensPostProcessPass, width: number, height: number, sourceCanvas?: HTMLCanvasElement | null) {
    const gl = this.ensureContext(canvas);
    if (!gl || !this.program || !this.texture || gl.isContextLost()) return false;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (!this.liveDomTextureUploader.upload(gl as LiveDomWebGlContext, source, sourceCanvas)) return false;

    this.draw(gl, pass, width, height);
    return !gl.isContextLost();
  }

  hasVisiblePixels(canvas: HTMLCanvasElement) {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || canvas.width <= 0 || canvas.height <= 0) return false;
    const pixels = new Uint8Array(16);
    const points = [
      [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
      [Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.25)],
      [Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.75)],
      [Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2)],
    ];
    for (let index = 0; index < points.length; index += 1) {
      const [x, y] = points[index];
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels.subarray(index * 4, index * 4 + 4));
    }
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 4 || pixels[index + 1] > 4 || pixels[index + 2] > 4 || pixels[index + 3] > 4) return true;
    }
    return false;
  }

  getLiveDomContext(canvas: HTMLCanvasElement) {
    return this.ensureContext(canvas) as LiveDomWebGlContext | null;
  }

  private draw(gl: WebGLRenderingContext, pass: LensPostProcessPass, width: number, height: number) {
    const uniforms = pass.uniforms;
    gl.uniform1i(this.uniforms.u_image, 0);
    gl.uniform2f(this.uniforms.u_resolution, width, height);
    gl.uniform2f(this.uniforms.u_focus, uniforms.focus.x, uniforms.focus.y);
    gl.uniform1f(this.uniforms.u_radiusPixels, uniforms.radiusPixels);
    gl.uniform1f(this.uniforms.u_softness, uniforms.softness);
    gl.uniform1f(this.uniforms.u_magnification, uniforms.magnification);
    gl.uniform1f(this.uniforms.u_distortion, uniforms.distortion);
    gl.uniform1f(this.uniforms.u_chromaticAberrationPixels, uniforms.chromaticAberrationPixels);
    gl.uniform1f(this.uniforms.u_rimWidth, uniforms.rimWidth);
    gl.uniform1f(this.uniforms.u_rimOpacity, uniforms.rimOpacity);
    gl.uniform1f(this.uniforms.u_dimAmount, uniforms.dimAmount);
    gl.uniform3f(this.uniforms.u_frameBackground, uniforms.frameBackground.r, uniforms.frameBackground.g, uniforms.frameBackground.b);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  renderSource(canvas: HTMLCanvasElement, source: ImageBitmap, width: number, height: number) {
    return this.render(canvas, source, {
      id: "clipper.postprocess.lens:passthrough",
      kind: lensPostProcessKind,
      target: "final",
      requiresLiveDomSource: true,
      uniforms: {
        focus: { x: 0.5, y: 0.5 },
        radiusPixels: Math.max(width, height),
        softness: 1,
        magnification: 1,
        distortion: 0,
        chromaticAberrationPixels: 0,
        rimWidth: 0.04,
        rimOpacity: 0,
        dimAmount: 0,
        frameBackground: { r: 0, g: 0, b: 0 },
      },
    }, width, height);
  }

  destroy() {
    if (this.gl) {
      for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
      if (this.texture) this.gl.deleteTexture(this.texture);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.clearHandles();
    this.liveDomTextureUploader.clear();
  }

  private ensureContext(canvas: HTMLCanvasElement) {
    if (this.gl && this.canvas !== canvas) this.destroy();
    if (this.gl) return this.gl.isContextLost() ? null : this.gl;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    if (!program) return null;
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, "a_position");
    const texCoord = gl.getAttribLocation(program, "a_texCoord");
    const buffers = [
      bindBuffer(gl, position, [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      bindBuffer(gl, texCoord, [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    ];
    if (buffers.some((buffer) => !buffer)) {
      for (const buffer of buffers) if (buffer) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      return null;
    }

    const texture = gl.createTexture();
    if (!texture) {
      for (const buffer of buffers) if (buffer) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.gl = gl;
    this.canvas = canvas;
    this.program = program;
    this.texture = texture;
    this.buffers = buffers.filter((buffer): buffer is WebGLBuffer => Boolean(buffer));
    this.uniforms = Object.fromEntries(["u_image", "u_resolution", "u_focus", "u_radiusPixels", "u_softness", "u_magnification", "u_distortion", "u_chromaticAberrationPixels", "u_rimWidth", "u_rimOpacity", "u_dimAmount", "u_frameBackground"].map((name) => [name, gl.getUniformLocation(program, name)]));
    return gl;
  }

  private clearHandles() {
    this.gl = null;
    this.canvas = null;
    this.program = null;
    this.texture = null;
    this.buffers = [];
    this.uniforms = {};
  }
}

export function selectLensPostProcessPass(passes: PostProcessPass[]) {
  const lensPasses = passes.filter((pass): pass is LensPostProcessPass => pass.kind === lensPostProcessKind);
  return { pass: lensPasses[0] ?? null, droppedPassCount: Math.max(0, lensPasses.length - 1) };
}

export function createLensExportPostProcessRenderer(renderer: LensPostProcessRenderer): ExportPostProcessRenderer<LensPostProcessPass> {
  return {
    kind: lensPostProcessKind,
    maxPassesPerFrame: 1,
    unavailableMessage: "Export post-process WebGL renderer is unavailable for active Lens pass.",
    render: ({ canvas, source, pass, width, height }) => renderer.render(canvas, source, pass, width, height),
  };
}

function bindBuffer(gl: WebGLRenderingContext, attribute: number, values: number[]) {
  const buffer = gl.createBuffer();
  if (!buffer || attribute < 0) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}
