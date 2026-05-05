import { LiveDomTextureUploader, type LiveDomWebGlContext } from "./liveDomCapability";

const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export type WebGlPostProcessDrawInput<TPass> = {
  gl: WebGLRenderingContext;
  pass: TPass;
  width: number;
  height: number;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

export type WebGlPostProcessConfig<TPass> = {
  fragmentShaderSource: string;
  uniformNames: readonly string[];
  draw: (input: WebGlPostProcessDrawInput<TPass>) => void;
};

export class WebGlPostProcessRenderer<TPass> {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffers: WebGLBuffer[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly liveDomTextureUploader = new LiveDomTextureUploader();

  constructor(private readonly config: WebGlPostProcessConfig<TPass>) {}

  render(canvas: HTMLCanvasElement, source: TexImageSource, pass: TPass, width: number, height: number) {
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
    this.config.draw({ gl, pass, width, height, uniforms: this.uniforms });
    return !gl.isContextLost();
  }

  renderElement(canvas: HTMLCanvasElement, source: Element, pass: TPass, width: number, height: number, sourceCanvas?: HTMLCanvasElement | null) {
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

    this.config.draw({ gl, pass, width, height, uniforms: this.uniforms });
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
    const program = createProgram(gl, vertexShaderSource, this.config.fragmentShaderSource);
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
    this.uniforms = Object.fromEntries(this.config.uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
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
