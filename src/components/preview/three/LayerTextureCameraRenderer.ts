import * as THREE from "three";
import {
  buildCameraDofDepthQuads,
  type CameraDofDepthQuad,
} from "../../../core/effects/postprocess/cameraDof";
import { captureLiveDomElementToCanvas } from "../../../core/effects/postprocess/liveDomCapability";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_cameraNear;
uniform float u_cameraFar;
uniform float u_sensorHeight;
uniform float u_fov;
uniform float u_focusDistance;
uniform float u_fNumber;
uniform float u_blurLevel;
uniform float u_maxBlurPx;
varying vec2 vUv;

float perspectiveDepthToViewZ(const in float invClipZ, const in float near, const in float far) {
  return (near * far) / ((far - near) * invClipZ - far);
}

float cocForDepth(float depth) {
  if (depth >= 1.0) return 0.0;
  if (u_fNumber <= 0.0) return 0.0;
  if (u_focusDistance < 0.0) return 0.0;
  float viewZ = perspectiveDepthToViewZ(depth, u_cameraNear, u_cameraFar);
  float subject = max(-viewZ, 0.0001);
  float focus = max(u_focusDistance, 0.0001);
  float fovRad = radians(u_fov);
  float focalLengthMm = u_sensorHeight / (2.0 * tan(fovRad * 0.5));
  if (focalLengthMm <= 0.0) return 0.0;
  float apertureDiameter = focalLengthMm / u_fNumber;
  float denom = focus * (subject - focalLengthMm);
  if (abs(denom) < 1e-6) return 0.0;
  float cocMm = apertureDiameter * abs(focalLengthMm * (subject - focus)) / denom;
  return clamp(abs(cocMm) * (u_resolution.y / u_sensorHeight) * u_blurLevel, 0.0, u_maxBlurPx);
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  float centerCoc = cocForDepth(texture2D(u_depth, vUv).x);
  vec4 accum = texture2D(u_color, vUv);
  float weight = 1.0;
  if (centerCoc <= 0.01) {
    gl_FragColor = accum;
    return;
  }
  const int SAMPLE_COUNT = 24;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float angle = float(i) * 6.28318530718 / float(SAMPLE_COUNT);
    float ring = float((i % 3) + 1) / 3.0;
    vec2 offset = vec2(cos(angle), sin(angle)) * centerCoc * ring * texel;
    vec2 uv = clamp(vUv + offset, vec2(0.0), vec2(1.0));
    float sampleCoc = cocForDepth(texture2D(u_depth, uv).x);
    float sampleWeight = max(centerCoc, sampleCoc) / max(centerCoc, 0.001);
    accum += texture2D(u_color, uv) * sampleWeight;
    weight += sampleWeight;
  }
  gl_FragColor = accum / weight;
}
`;

type LayerMeshRecord = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  captureCanvas: HTMLCanvasElement;
};

export class LayerTextureCameraRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    50,
    FRAME_WIDTH / FRAME_HEIGHT,
    1,
    5000,
  );
  private readonly screenScene = new THREE.Scene();
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly screenMaterial = new THREE.ShaderMaterial({
    uniforms: {
      u_color: { value: null },
      u_depth: { value: null },
      u_resolution: { value: new THREE.Vector2(FRAME_WIDTH, FRAME_HEIGHT) },
      u_cameraNear: { value: 1 },
      u_cameraFar: { value: 5000 },
      u_sensorHeight: { value: 24 },
      u_fov: { value: 50 },
      u_focusDistance: { value: 1000 },
      u_fNumber: { value: 2.8 },
      u_blurLevel: { value: 1 },
      u_maxBlurPx: { value: 64 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  private readonly screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    this.screenMaterial,
  );
  private renderTarget: THREE.WebGLRenderTarget;
  private readonly layers = new Map<string, LayerMeshRecord>();
  private width = FRAME_WIDTH;
  private height = FRAME_HEIGHT;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(FRAME_WIDTH, FRAME_HEIGHT, false);
    this.canvas = this.renderer.domElement as HTMLCanvasElement;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.renderTarget = this.createRenderTarget(FRAME_WIDTH, FRAME_HEIGHT);
    this.screenScene.add(this.screenMesh);
  }

  setViewport(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderTarget.dispose();
    this.renderTarget = this.createRenderTarget(w, h);
    this.screenMaterial.uniforms.u_resolution.value.set(w, h);
  }

  render(input: {
    part: CompositionClip;
    localTime: number;
    camera: CameraObjectProps;
    sourceRoot: HTMLElement;
  }) {
    this.setViewport(FRAME_WIDTH, FRAME_HEIGHT);
    applyCompositionCameraToThree(this.camera, input.camera, FRAME_WIDTH / FRAME_HEIGHT);
    const quads = buildCameraDofDepthQuads(input.part, input.localTime);
    this.syncMeshes(input.sourceRoot, quads);
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    if (input.camera.dof.enabled) {
      this.drawDof(input.camera);
    } else {
      this.renderer.copyTextureToTexture(
        this.renderTarget.texture,
        new THREE.Texture(),
      );
      this.screenMaterial.uniforms.u_focusDistance.value = -1;
      this.drawDof(input.camera);
    }
  }

  dispose() {
    for (const record of this.layers.values()) this.disposeLayer(record);
    this.layers.clear();
    this.renderTarget.dispose();
    this.screenMaterial.dispose();
    this.renderer.dispose();
  }

  private syncMeshes(sourceRoot: HTMLElement, quads: CameraDofDepthQuad[]) {
    const active = new Set<string>();
    for (const quad of quads) {
      const element = sourceRoot.querySelector<HTMLElement>(
        `[data-clipper-render-object-id="${cssEscape(quad.id)}"]`,
      );
      if (!element) continue;
      active.add(quad.id);
      const record = this.ensureLayer(quad);
      captureLiveDomElementToCanvas(
        element,
        null,
        record.captureCanvas,
        Math.max(1, Math.ceil(quad.width)),
        Math.max(1, Math.ceil(quad.height)),
      );
      record.texture.needsUpdate = true;
      syncMeshTransform(record.mesh, quad);
    }
    for (const [id, record] of this.layers) {
      if (active.has(id)) continue;
      this.scene.remove(record.mesh);
      this.disposeLayer(record);
      this.layers.delete(id);
    }
  }

  private ensureLayer(quad: CameraDofDepthQuad) {
    const existing = this.layers.get(quad.id);
    const width = Math.max(1, Math.ceil(quad.width));
    const height = Math.max(1, Math.ceil(quad.height));
    if (existing) {
      const params = existing.mesh.geometry.parameters;
      if (params.width !== width || params.height !== height) {
        existing.mesh.geometry.dispose();
        existing.mesh.geometry = new THREE.PlaneGeometry(width, height);
      }
      return existing;
    }
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = width;
    captureCanvas.height = height;
    const texture = new THREE.CanvasTexture(captureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    this.scene.add(mesh);
    const record = { mesh, texture, captureCanvas };
    this.layers.set(quad.id, record);
    return record;
  }

  private drawDof(camera: CameraObjectProps) {
    this.screenMaterial.uniforms.u_color.value = this.renderTarget.texture;
    this.screenMaterial.uniforms.u_depth.value = this.renderTarget.depthTexture;
    this.screenMaterial.uniforms.u_cameraNear.value = camera.near;
    this.screenMaterial.uniforms.u_cameraFar.value = camera.far;
    this.screenMaterial.uniforms.u_sensorHeight.value = camera.sensor.height;
    this.screenMaterial.uniforms.u_fov.value = camera.fov;
    this.screenMaterial.uniforms.u_focusDistance.value = camera.dof.enabled
      ? camera.dof.focusDistance
      : -1;
    this.screenMaterial.uniforms.u_fNumber.value = camera.dof.fNumber;
    this.screenMaterial.uniforms.u_blurLevel.value = camera.dof.blurLevel;
    this.screenMaterial.uniforms.u_maxBlurPx.value = camera.dof.maxBlurPx;
    this.renderer.render(this.screenScene, this.screenCamera);
  }

  private createRenderTarget(width: number, height: number) {
    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.type = THREE.UnsignedShortType;
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      depthTexture,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }

  private disposeLayer(record: LayerMeshRecord) {
    record.mesh.geometry.dispose();
    record.mesh.material.dispose();
    record.texture.dispose();
  }
}

function syncMeshTransform(
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  quad: CameraDofDepthQuad,
) {
  const width = Math.max(1, quad.width);
  const height = Math.max(1, quad.height);
  const deg = Math.PI / 180;
  mesh.position.set(
    quad.x - FRAME_WIDTH / 2 + width / 2,
    -(quad.y - FRAME_HEIGHT / 2 + height / 2),
    quad.translateZ,
  );
  mesh.rotation.set(quad.rotateX * deg, quad.rotateY * deg, quad.rotateZ * deg);
  mesh.scale.set(quad.scaleX, quad.scaleY, 1);
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
    return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
