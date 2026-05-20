import * as THREE from "three";
import {
  cameraDofPostProcessKind,
  type CameraDofDepthQuad,
  type CameraDofPass,
} from "./cameraDof";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import {
  WebGlPostProcessRenderer,
  type WebGlPostProcessDrawInput,
  type WebGlPostProcessPrepareInput,
} from "./webGlRenderer";

const fragmentShaderSource = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_sensorHeight;
uniform float u_fov;
uniform float u_focusDistance;
uniform float u_fNumber;
uniform float u_blurLevel;
uniform float u_maxBlurPx;
uniform float u_depthFar;
varying vec2 v_texCoord;

float depthToCocPx(float encodedDepth) {
  if (encodedDepth <= 0.0) return 0.0;
  if (u_fNumber <= 0.0) return 0.0;
  if (u_focusDistance <= 0.0) return 0.0;
  float subject = max(encodedDepth * u_depthFar, 0.0001);
  float fovRad = radians(u_fov);
  float focalLengthMm = u_sensorHeight / (2.0 * tan(fovRad * 0.5));
  if (focalLengthMm <= 0.0) return 0.0;
  if (abs(subject - u_focusDistance) < 1e-6) return 0.0;
  float apertureDiameter = focalLengthMm / u_fNumber;
  float denom = u_focusDistance * (subject - focalLengthMm);
  if (abs(denom) < 1e-6) return 0.0;
  float cocMm = apertureDiameter * abs(focalLengthMm * (subject - u_focusDistance)) / denom;
  float cocPx = abs(cocMm) * (u_resolution.y / u_sensorHeight) * u_blurLevel;
  return clamp(cocPx, 0.0, u_maxBlurPx);
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  float centerDepth = texture2D(u_depth, v_texCoord).r;
  float centerCoc = depthToCocPx(centerDepth);
  if (centerCoc <= 0.01) {
    gl_FragColor = texture2D(u_image, v_texCoord);
    return;
  }

  vec4 accum = texture2D(u_image, v_texCoord);
  float weight = 1.0;
  const int SAMPLE_COUNT = 16;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float angle = float(i) * 6.28318530718 / float(SAMPLE_COUNT);
    vec2 offset = vec2(cos(angle), sin(angle)) * centerCoc * texel;
    vec2 uv = clamp(v_texCoord + offset, vec2(0.0), vec2(1.0));
    float sampleCoc = depthToCocPx(texture2D(u_depth, uv).r);
    float sampleWeight = max(sampleCoc, centerCoc) / max(centerCoc, 0.001);
    accum += texture2D(u_image, uv) * sampleWeight;
    weight += sampleWeight;
  }
  gl_FragColor = accum / weight;
}
`;

const dofUniformNames = [
  "u_image",
  "u_depth",
  "u_resolution",
  "u_sensorHeight",
  "u_fov",
  "u_focusDistance",
  "u_fNumber",
  "u_blurLevel",
  "u_maxBlurPx",
  "u_depthFar",
] as const;

export type CameraDofPostProcessRenderer =
  WebGlPostProcessRenderer<CameraDofPass>;

export function createCameraDofPostProcessRenderer(): CameraDofPostProcessRenderer {
  const depthRenderer = new CameraDofDepthTextureRenderer();
  return new WebGlPostProcessRenderer({
    fragmentShaderSource,
    uniformNames: dofUniformNames,
    prepare: (input) => depthRenderer.prepare(input),
    draw: drawCameraDofPass,
  });
}

export function createCameraDofExportPostProcessRenderer(
  renderer: CameraDofPostProcessRenderer,
): ExportPostProcessRenderer<CameraDofPass> {
  return {
    kind: cameraDofPostProcessKind,
    maxPassesPerFrame: 1,
    unavailableMessage:
      "Export post-process WebGL renderer is unavailable for active Camera DoF pass.",
    render: ({ canvas, source, pass, width, height }) =>
      renderer.render(canvas, source, pass, width, height),
  };
}

class CameraDofDepthTextureRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderer: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scene: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private camera: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private material: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private meshes = new Map<string, any>();
  private depthTexture: WebGLTexture | null = null;
  private width = 0;
  private height = 0;

  prepare({
    gl,
    pass,
    sourceTexture,
    width,
    height,
    uniforms,
  }: WebGlPostProcessPrepareInput<CameraDofPass>) {
    if (!this.ensureThree(width, height)) return false;
    if (!this.depthTexture) {
      this.depthTexture = gl.createTexture();
      if (!this.depthTexture) return false;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    this.syncDepthScene(pass.depthQuads, pass);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    const flipRestore = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipRestore ? 1 : 0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.renderer.domElement as HTMLCanvasElement,
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipRestore);
    gl.uniform1i(uniforms.u_depth, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    return true;
  }

  private ensureThree(width: number, height: number) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        depth: true,
        preserveDrawingBuffer: true,
      });
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
      this.material = new THREE.ShaderMaterial({
        uniforms: { depthFar: { value: 5000 } },
        side: THREE.DoubleSide,
        vertexShader: `
          uniform float depthFar;
          varying float vDepth;
          void main() {
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            vDepth = clamp(-viewPosition.z / max(depthFar, 1.0), 0.0, 1.0);
            gl_Position = projectionMatrix * viewPosition;
          }
        `,
        fragmentShader: `
          varying float vDepth;
          void main() {
            gl_FragColor = vec4(vDepth, vDepth, vDepth, 1.0);
          }
        `,
      });
    }
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  private syncDepthScene(quads: CameraDofDepthQuad[], pass: CameraDofPass) {
    const camera = pass.uniforms;
    const deg = Math.PI / 180;
    this.camera.position.set(
      camera.cameraPos.x,
      -camera.cameraPos.y,
      camera.cameraPos.z,
    );
    this.camera.rotation.order = "XYZ";
    this.camera.rotation.x = -camera.cameraRotation.x * deg;
    this.camera.rotation.y = camera.cameraRotation.y * deg;
    this.camera.rotation.z = -camera.cameraRotation.z * deg;
    this.camera.fov = camera.fov;
    this.camera.near = camera.near;
    this.camera.far = camera.far;
    this.camera.filmGauge = 36;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.depthFar.value = camera.far;

    const activeIds = new Set<string>();
    for (const quad of quads) {
      activeIds.add(quad.id);
      const width = Math.max(1, quad.width);
      const height = Math.max(1, quad.height);
      let mesh = this.meshes.get(quad.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          this.material,
        );
        this.scene.add(mesh);
        this.meshes.set(quad.id, mesh);
      } else {
        const params = mesh.geometry.parameters;
        if (params.width !== width || params.height !== height) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(width, height);
        }
      }
      mesh.position.set(
        quad.x + width / 2,
        -(quad.y + height / 2),
        quad.translateZ,
      );
      mesh.rotation.set(
        quad.rotateX * deg,
        quad.rotateY * deg,
        quad.rotateZ * deg,
      );
      mesh.scale.set(quad.scaleX, quad.scaleY, 1);
      mesh.visible = true;
    }

    for (const [id, mesh] of this.meshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(id);
      }
    }
  }
}

function drawCameraDofPass({
  gl,
  pass,
  width,
  height,
  uniforms,
}: WebGlPostProcessDrawInput<CameraDofPass>) {
  const values = pass.uniforms;
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform1i(uniforms.u_depth, 1);
  gl.uniform2f(uniforms.u_resolution, width, height);
  gl.uniform1f(uniforms.u_sensorHeight, values.sensorHeight);
  gl.uniform1f(uniforms.u_fov, values.fov);
  gl.uniform1f(uniforms.u_focusDistance, values.focusDistance);
  gl.uniform1f(uniforms.u_fNumber, values.fNumber);
  gl.uniform1f(uniforms.u_blurLevel, values.blurLevel);
  gl.uniform1f(uniforms.u_maxBlurPx, values.maxBlurPx);
  gl.uniform1f(uniforms.u_depthFar, values.far);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
