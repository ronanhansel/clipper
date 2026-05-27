import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  abs,
  clamp,
  float,
  Fn,
  length,
  max,
  min,
  modelViewMatrix,
  positionLocal,
  step,
  texture as textureNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import { evaluateObjectState } from "../../../../core/propertyRegistry";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../../core/types";
import type {
  CompositionClip,
  FrameObject,
  LightObjectKind,
} from "../../../../core/types";
import { resolveLayerTransform } from "./layerTransform";
import type { LayerShadowState } from "./layerLighting";
import { resolveLightTargetFromTransform } from "../lightObjectTransform";

type ShadowLight = {
  id: string;
  kind: LightObjectKind;
  debug: boolean;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  range: number;
  angle: number;
};

export type LayerShadowObjectDiagnostics = {
  id: string;
  type: string;
  casts: boolean;
  world: { x: number; y: number; z: number };
  shadow: {
    u: number;
    v: number;
    depth: number;
    inside: boolean;
    closestDepth: number | null;
    depthDelta: number | null;
    blockedAfterBias: boolean | null;
  };
};

export type LayerShadowMapDiagnostics = {
  minDepth: number;
  maxDepth: number;
  nonClearSamples: number;
  totalSamples: number;
};

export type LayerShadowRenderDiagnostics = {
  visibleCasters: number;
  casterOwners: string[];
};

export type LayerShadowDiagnostics = {
  active: boolean;
  reason: string;
  light: ShadowLight | null;
  casterIds: string[];
  render: LayerShadowRenderDiagnostics;
  objects: LayerShadowObjectDiagnostics[];
};

export type LayerShadowDebugImage = {
  image: ImageData;
  map: LayerShadowMapDiagnostics;
  objects: LayerShadowObjectDiagnostics[];
};

const SHADOW_MAP_SIZE = 2048;
const SHADOW_DEBUG_SIZE = 64;
const SHADOW_BIAS = 0.004;
const SHADOW_DARKNESS = 0.72;
const DIRECTIONAL_SHADOW_EXTENT = Math.hypot(FRAME_WIDTH, FRAME_HEIGHT);
const DIRECTIONAL_SHADOW_FAR = 6000;

type LayerShadowBackend = "webgl-shader" | "webgpu-node";

type ShadowDepthUniforms = ReturnType<typeof createShadowDepthUniforms>;

type ShadowDepthNodeUniforms = {
  u_shadowNear: ReturnType<typeof uniform>;
  u_shadowFar: ReturnType<typeof uniform>;
};

const SHADOW_VERTEX = `
  varying vec2 vUv;
  varying float vDepth;
  uniform float u_shadowNear;
  uniform float u_shadowFar;
  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp((-viewPosition.z - u_shadowNear) / max(0.0001, u_shadowFar - u_shadowNear), 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const SHADOW_SOLID_FRAGMENT = `
  precision highp float;
  varying float vDepth;
  void main() {
    gl_FragColor = vec4(clamp(vDepth, 0.0, 1.0), 0.0, 0.0, 1.0);
  }
`;

const SHADOW_TEXTURE_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  varying float vDepth;
  uniform sampler2D u_image;
  uniform vec2 u_uvOrigin;
  uniform vec2 u_uvSize;
  uniform float u_opacity;
  void main() {
    vec2 uv = vUv * u_uvSize + u_uvOrigin;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) *
                   step(0.0, uv.y) * step(uv.y, 1.0);
    float alpha = texture2D(u_image, clamp(uv, 0.0, 1.0)).a * u_opacity * inside;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(clamp(vDepth, 0.0, 1.0), 0.0, 0.0, 1.0);
  }
`;

const SHADOW_ROUNDED_RECT_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  varying float vDepth;
  uniform vec4 u_color;
  uniform vec2 u_size;
  uniform float u_radius;
  uniform float u_opacity;

  float roundedBoxSdf(vec2 p, vec2 h, float r) {
    vec2 q = abs(p) - h + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 px = (vUv - 0.5) * u_size;
    vec2 halfSize = u_size * 0.5;
    float r = clamp(u_radius, 0.0, min(halfSize.x, halfSize.y));
    float d = roundedBoxSdf(px, halfSize, r);
    float coverage = clamp(0.5 - d, 0.0, 1.0);
    float alpha = u_color.a * u_opacity * coverage;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(clamp(vDepth, 0.0, 1.0), 0.0, 0.0, 1.0);
  }
`;

export class LayerShadowSync {
  readonly group = new THREE.Group();
  private readonly backend: LayerShadowBackend;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly renderTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly debugRenderTarget: any;
  private readonly shadowMatrix = new THREE.Matrix4();
  private camera:
    | InstanceType<typeof THREE.OrthographicCamera>
    | InstanceType<typeof THREE.PerspectiveCamera> =
    new THREE.OrthographicCamera();
  private readonly solidMaterial = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_SOLID_FRAGMENT,
    uniforms: createShadowDepthUniforms(),
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  private readonly solidNodeMaterial = createSolidShadowDepthNodeMaterial();
  private readonly textureMaterial = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_TEXTURE_FRAGMENT,
    uniforms: {
      ...createShadowDepthUniforms(),
      u_image: { value: null },
      u_uvOrigin: { value: new THREE.Vector2(0, 0) },
      u_uvSize: { value: new THREE.Vector2(1, 1) },
      u_opacity: { value: 1 },
    },
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  private readonly roundedRectMaterial = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_ROUNDED_RECT_FRAGMENT,
    uniforms: {
      ...createShadowDepthUniforms(),
      u_color: { value: new THREE.Vector4(0, 0, 0, 1) },
      u_size: { value: new THREE.Vector2(1, 1) },
      u_radius: { value: 0 },
      u_opacity: { value: 1 },
    },
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  private state: LayerShadowState = {
    active: false,
    texture: null,
    matrix: new THREE.Matrix4(),
    viewMatrix: new THREE.Matrix4(),
    near: 1,
    far: 1200,
    bias: SHADOW_BIAS,
    darkness: SHADOW_DARKNESS,
    mapFlipY: false,
  };
  private diagnostics: LayerShadowDiagnostics = {
    active: false,
    reason: "not-run",
    light: null,
    casterIds: [],
    render: { visibleCasters: 0, casterOwners: [] },
    objects: [],
  };
  private shadowInputSignature = "";
  private cachedDebugImage: LayerShadowDebugImage | null = null;
  private pendingAsyncReadback = false;

  constructor(options: { backend?: LayerShadowBackend } = {}) {
    this.backend = options.backend ?? "webgl-shader";
    this.group.name = "LayerShadowSync";
    const Target =
      this.backend === "webgpu-node"
        ? THREE.RenderTarget
        : THREE.WebGLRenderTarget;
    this.renderTarget = new Target(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, {
      depthBuffer: true,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.debugRenderTarget = new Target(SHADOW_DEBUG_SIZE, SHADOW_DEBUG_SIZE, {
      depthBuffer: true,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
  }

  sync(
    part: CompositionClip | null,
    localTime: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layerRoot: any,
  ): LayerShadowState {
    if (!part) return this.deactivate("no-part");
    const light = findShadowLight(part, localTime);
    if (!light) return this.deactivate("no-shadow-light");
    const casterIds = new Set(
      part.objects
        .filter((object) => canCastShadow(object))
        .map((object) => object.id),
    );
    if (casterIds.size === 0) {
      return this.deactivate("no-casters", light);
    }

    this.configureCamera(light);
    const shadowInputSignature = buildShadowInputSignature(
      part,
      localTime,
      light,
      casterIds,
      layerRoot,
    );
    const canReuseShadowMap =
      this.state.active && shadowInputSignature === this.shadowInputSignature;
    const renderDiagnostics = canReuseShadowMap
      ? this.diagnostics.render
      : this.renderShadowMap(renderer, layerRoot, casterIds);
    this.shadowInputSignature = shadowInputSignature;
    this.shadowMatrix
      .identity()
      .multiply(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse);
    this.state = {
      active: true,
      texture: this.renderTarget.texture,
      matrix: this.shadowMatrix,
      viewMatrix: this.camera.matrixWorldInverse,
      near: this.camera.near,
      far: this.camera.far,
      bias: SHADOW_BIAS,
      darkness: SHADOW_DARKNESS,
      mapFlipY: this.backend === "webgpu-node",
    };
    this.diagnostics = {
      active: true,
      reason: "active",
      light,
      casterIds: Array.from(casterIds),
      render: renderDiagnostics,
      objects: diagnoseObjects(
        part,
        localTime,
        casterIds,
        this.shadowMatrix,
        this.camera.matrixWorldInverse,
        this.camera.near,
        this.camera.far,
      ),
    };
    return this.state;
  }

  getState(): LayerShadowState {
    return this.state;
  }

  getDiagnostics(): LayerShadowDiagnostics {
    return this.diagnostics;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readDebugImageData(renderer: any, size = 64): LayerShadowDebugImage | null {
    if (!this.state.active) return null;
    // First try the dedicated RGBA8 debug target — universally readable.
    const fromDebugTarget = this.readFromDebugTarget(renderer, size);
    if (fromDebugTarget) return fromDebugTarget;
    // Fall back to reading the main HalfFloat target.
    try {
      const source = new Uint16Array(SHADOW_MAP_SIZE * SHADOW_MAP_SIZE * 4);
      renderer.readRenderTargetPixels(
        this.renderTarget,
        0,
        0,
        SHADOW_MAP_SIZE,
        SHADOW_MAP_SIZE,
        source,
      );
      return buildDebugImageFromHalfFloat(
        source,
        size,
        SHADOW_MAP_SIZE,
        this.diagnostics.objects,
      );
    } catch {
      // Synchronous readback failed — try async for WebGPU.
      this.tryAsyncReadback(renderer, size);
      return this.cachedDebugImage;
    }
  }

  getCachedDebugImage(): LayerShadowDebugImage | null {
    return this.cachedDebugImage;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readFromDebugTarget(
    renderer: any,
    size: number,
  ): LayerShadowDebugImage | null {
    try {
      const pixels = new Uint8Array(SHADOW_DEBUG_SIZE * SHADOW_DEBUG_SIZE * 4);
      renderer.readRenderTargetPixels(
        this.debugRenderTarget,
        0,
        0,
        SHADOW_DEBUG_SIZE,
        SHADOW_DEBUG_SIZE,
        pixels,
      );
      // Verify we got non-trivial data (not all zeros)
      let hasData = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) {
          hasData = true;
          break;
        }
      }
      if (!hasData) return null;
      const image = new ImageData(size, size);
      let minDepth = 1;
      let maxDepth = 0;
      let nonClearSamples = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const sx = Math.floor((x / size) * SHADOW_DEBUG_SIZE);
          const sy = Math.floor((y / size) * SHADOW_DEBUG_SIZE);
          const sourceIndex = (sy * SHADOW_DEBUG_SIZE + sx) * 4;
          const depth = pixels[sourceIndex] / 255;
          minDepth = Math.min(minDepth, depth);
          maxDepth = Math.max(maxDepth, depth);
          if (depth < 0.99) nonClearSamples += 1;
          const value = pixels[sourceIndex];
          const targetIndex = (y * size + x) * 4;
          image.data[targetIndex] = value;
          image.data[targetIndex + 1] = value;
          image.data[targetIndex + 2] = value;
          image.data[targetIndex + 3] = 255;
        }
      }
      const result: LayerShadowDebugImage = {
        image,
        map: { minDepth, maxDepth, nonClearSamples, totalSamples: size * size },
        objects: withShadowSamplesFromRgba8(
          this.diagnostics.objects,
          pixels,
          SHADOW_DEBUG_SIZE,
        ),
      };
      this.cachedDebugImage = result;
      return result;
    } catch {
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tryAsyncReadback(renderer: any, size: number): void {
    if (this.pendingAsyncReadback) return;
    if (typeof renderer.readRenderTargetPixelsAsync !== "function") return;
    this.pendingAsyncReadback = true;
    renderer
      .readRenderTargetPixelsAsync(
        this.renderTarget,
        0,
        0,
        SHADOW_MAP_SIZE,
        SHADOW_MAP_SIZE,
      )
      .then((buffer: ArrayBuffer) => {
        const source = new Uint16Array(buffer);
        this.cachedDebugImage = buildDebugImageFromHalfFloat(
          source,
          size,
          SHADOW_MAP_SIZE,
          this.diagnostics.objects,
        );
      })
      .catch(() => {})
      .finally(() => {
        this.pendingAsyncReadback = false;
      });
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.debugRenderTarget.dispose();
    this.solidMaterial.dispose();
    this.textureMaterial.dispose();
    this.roundedRectMaterial.dispose();
    this.solidNodeMaterial.dispose();
  }

  private deactivate(
    reason: string,
    light: ShadowLight | null = null,
  ): LayerShadowState {
    this.shadowInputSignature = "";
    this.state = {
      active: false,
      texture: null,
      matrix: this.shadowMatrix.identity(),
      viewMatrix: this.camera.matrixWorldInverse,
      near: this.camera.near,
      far: this.camera.far,
      bias: SHADOW_BIAS,
      darkness: SHADOW_DARKNESS,
      mapFlipY: false,
    };
    this.diagnostics = {
      active: false,
      reason,
      light,
      casterIds: [],
      render: { visibleCasters: 0, casterOwners: [] },
      objects: [],
    };
    return this.state;
  }

  private configureCamera(light: ShadowLight): void {
    const position = new THREE.Vector3(
      light.position.x,
      light.position.y,
      light.position.z,
    );
    const target = new THREE.Vector3(
      light.target.x,
      light.target.y,
      light.target.z,
    );
    if (position.distanceToSquared(target) < 1) target.set(0, 0, 0);

    if (light.kind === "spot" || light.kind === "point") {
      const far = Math.max(10, light.range);
      const perspective = new THREE.PerspectiveCamera(
        light.kind === "point" ? 90 : Math.min(175, Math.max(1, light.angle)),
        1,
        1,
        far,
      );
      perspective.position.copy(position);
      perspective.lookAt(target);
      perspective.updateMatrixWorld();
      perspective.updateProjectionMatrix();
      this.copyCamera(perspective);
      return;
    }

    const extent = DIRECTIONAL_SHADOW_EXTENT;
    const sceneCenter = new THREE.Vector3(0, 0, 0);
    const lightDirection = target.clone().sub(position);
    if (lightDirection.lengthSq() < 1) lightDirection.set(0, 0, -1);
    lightDirection.normalize();
    const shadowCameraPosition = sceneCenter
      .clone()
      .sub(lightDirection.multiplyScalar(DIRECTIONAL_SHADOW_FAR * 0.5));
    const orthographic = new THREE.OrthographicCamera(
      -extent,
      extent,
      extent,
      -extent,
      1,
      DIRECTIONAL_SHADOW_FAR,
    );
    orthographic.position.copy(shadowCameraPosition);
    orthographic.lookAt(sceneCenter);
    orthographic.updateMatrixWorld();
    orthographic.updateProjectionMatrix();
    this.copyCamera(orthographic);
  }

  private copyCamera(
    camera:
      | InstanceType<typeof THREE.PerspectiveCamera>
      | InstanceType<typeof THREE.OrthographicCamera>,
  ): void {
    this.camera =
      camera instanceof THREE.PerspectiveCamera
        ? new THREE.PerspectiveCamera()
        : new THREE.OrthographicCamera();
    this.camera.position.copy(camera.position);
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.near = camera.near;
    this.camera.far = camera.far;
    if (
      camera instanceof THREE.OrthographicCamera &&
      this.camera instanceof THREE.OrthographicCamera
    ) {
      this.camera.left = camera.left;
      this.camera.right = camera.right;
      this.camera.top = camera.top;
      this.camera.bottom = camera.bottom;
      this.camera.zoom = camera.zoom;
    }
    if (
      camera instanceof THREE.PerspectiveCamera &&
      this.camera instanceof THREE.PerspectiveCamera
    ) {
      this.camera.fov = camera.fov;
      this.camera.aspect = camera.aspect;
      this.camera.zoom = camera.zoom;
      this.camera.focus = camera.focus;
      this.camera.filmGauge = camera.filmGauge;
      this.camera.filmOffset = camera.filmOffset;
    }
    this.camera.projectionMatrix.copy(camera.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.camera.updateMatrixWorld();
  }

  private renderShadowMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layerRoot: any,
    casterIds: Set<string>,
  ): LayerShadowRenderDiagnostics {
    const swaps: Array<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mesh: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      material: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shadowMaterial: any | null;
      visible: boolean;
    }> = [];
    let visibleCasters = 0;
    const casterOwners: string[] = [];
    layerRoot.traverse((node: { isMesh?: boolean }) => {
      if (!node.isMesh) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = node as any;
      const owner = findFrameObjectOwner(mesh);
      swaps.push({
        mesh,
        material: mesh.material,
        shadowMaterial: null,
        visible: mesh.visible,
      });
      mesh.visible = !!owner && casterIds.has(owner);
      if (!mesh.visible) return;
      visibleCasters += 1;
      if (owner) casterOwners.push(owner);
      const shadowMaterial = this.materialFor(mesh.material);
      applyShadowDepthUniforms(
        shadowMaterial,
        this.camera.near,
        this.camera.far,
      );
      swaps[swaps.length - 1].shadowMaterial = shadowMaterial;
      mesh.material = shadowMaterial;
    });

    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.renderTarget);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, true);
    renderer.render(layerRoot, this.camera);
    // Render the same scene into a small RGBA8 target for reliable debug readback.
    renderer.setRenderTarget(this.debugRenderTarget);
    renderer.clear(true, true, true);
    renderer.render(layerRoot, this.camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    for (const swap of swaps) {
      swap.mesh.material = swap.material;
      swap.mesh.visible = swap.visible;
      disposeShadowMaterial(swap.shadowMaterial);
    }
    return { visibleCasters, casterOwners };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private materialFor(source: any) {
    const material = Array.isArray(source) ? source[0] : source;
    const uniforms =
      material?.userData?.layerShadowUniforms ?? material?.uniforms;
    if (this.backend === "webgpu-node" || material?.isNodeMaterial === true) {
      if (uniforms?.u_image) {
        return createTextureShadowDepthNodeMaterial(uniforms, material);
      }
      if (uniforms?.u_color && uniforms?.u_size && uniforms?.u_radius) {
        return createRoundedRectShadowDepthNodeMaterial(uniforms, material);
      }
      return this.solidNodeMaterial;
    }
    if (uniforms?.u_image) {
      const shadowMaterial = this.textureMaterial.clone();
      shadowMaterial.userData.layerShadowSyncDisposable = true;
      shadowMaterial.uniforms.u_image.value = uniforms.u_image.value;
      shadowMaterial.uniforms.u_uvOrigin.value.copy(
        uniforms.u_uvOrigin?.value ?? new THREE.Vector2(0, 0),
      );
      shadowMaterial.uniforms.u_uvSize.value.copy(
        uniforms.u_uvSize?.value ?? new THREE.Vector2(1, 1),
      );
      shadowMaterial.uniforms.u_opacity.value =
        uniforms.u_opacity?.value ?? material.opacity ?? 1;
      return shadowMaterial;
    }
    if (uniforms?.u_color && uniforms?.u_size && uniforms?.u_radius) {
      const shadowMaterial = this.roundedRectMaterial.clone();
      shadowMaterial.userData.layerShadowSyncDisposable = true;
      shadowMaterial.uniforms.u_color.value.copy(uniforms.u_color.value);
      shadowMaterial.uniforms.u_size.value.copy(uniforms.u_size.value);
      shadowMaterial.uniforms.u_radius.value = uniforms.u_radius.value;
      shadowMaterial.uniforms.u_opacity.value = uniforms.u_opacity?.value ?? 1;
      return shadowMaterial;
    }
    return this.solidMaterial;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disposeShadowMaterial(material: any | null): void {
  if (!material) return;
  if (material.userData?.layerShadowSyncDisposable !== true) return;
  if (typeof material.dispose === "function") material.dispose();
}

function createShadowDepthUniforms() {
  return {
    u_shadowNear: { value: 1 },
    u_shadowFar: { value: 1200 },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyShadowDepthUniforms(
  material: any,
  near: number,
  far: number,
): void {
  const nodes = material?.userData?.layerShadowDepthNodes as
    | ShadowDepthNodeUniforms
    | undefined;
  if (nodes) {
    nodes.u_shadowNear.value = near;
    nodes.u_shadowFar.value = far;
  }
  if (!material?.uniforms) return;
  if (material.uniforms.u_shadowNear) {
    material.uniforms.u_shadowNear.value = near;
  }
  if (material.uniforms.u_shadowFar) {
    material.uniforms.u_shadowFar.value = far;
  }
}

function createSolidShadowDepthNodeMaterial() {
  const uniforms = createShadowDepthUniforms();
  const nodes = createShadowDepthNodes(uniforms);
  const material = new MeshBasicNodeMaterial({
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.fragmentNode = Fn(() =>
    vec4(createShadowDepthNode(nodes), 0, 0, 1),
  )();
  material.userData.layerShadowDepthNodes = nodes;
  material.userData.webgpuLayerShadowMaterialPort = "solid-depth";
  return material;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTextureShadowDepthNodeMaterial(uniforms: any, source: any) {
  const depthUniforms = createShadowDepthUniforms();
  const nodes = createShadowDepthNodes(depthUniforms);
  const imageTextureNode = textureNode(
    uniforms.u_image.value ?? createOpaqueShadowDepthTexture(),
  );
  const uvOriginNode = uniform(
    uniforms.u_uvOrigin?.value ?? new THREE.Vector2(0, 0),
  );
  const uvSizeNode = uniform(
    uniforms.u_uvSize?.value ?? new THREE.Vector2(1, 1),
  );
  const opacityNode = uniform(uniforms.u_opacity?.value ?? source.opacity ?? 1);
  const material = new MeshBasicNodeMaterial({
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.fragmentNode = Fn(() => {
    const imageUv = uv().mul(uvSizeNode).add(uvOriginNode);
    const inside = step(0.0, imageUv.x)
      .mul(step(imageUv.x, 1.0))
      .mul(step(0.0, imageUv.y))
      .mul(step(imageUv.y, 1.0));
    const sample = imageTextureNode.sample(clamp(imageUv, 0.0, 1.0));
    const alpha = sample.a.mul(opacityNode).mul(inside);
    alpha.lessThan(0.02).discard();
    return vec4(createShadowDepthNode(nodes), 0, 0, 1);
  })();
  material.userData.layerShadowDepthNodes = nodes;
  material.userData.layerShadowSyncDisposable = true;
  material.userData.webgpuLayerShadowMaterialPort = "texture-depth";
  return material;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRoundedRectShadowDepthNodeMaterial(uniforms: any, source: any) {
  const depthUniforms = createShadowDepthUniforms();
  const nodes = createShadowDepthNodes(depthUniforms);
  const colorNode = uniform(uniforms.u_color.value);
  const sizeNode = uniform(uniforms.u_size.value);
  const radiusNode = uniform(uniforms.u_radius.value);
  const opacityNode = uniform(uniforms.u_opacity?.value ?? source.opacity ?? 1);
  const material = new MeshBasicNodeMaterial({
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.fragmentNode = Fn(() => {
    const px = uv().sub(0.5).mul(sizeNode);
    const halfSize = sizeNode.mul(0.5);
    const r = clamp(radiusNode, 0.0, min(halfSize.x, halfSize.y));
    const q = abs(px).sub(halfSize).add(vec2(r));
    const d = length(max(q, vec2(0.0)))
      .add(min(max(q.x, q.y), 0.0))
      .sub(r);
    const coverage = clamp(float(0.5).sub(d), 0.0, 1.0);
    const alpha = colorNode.a.mul(opacityNode).mul(coverage);
    alpha.lessThan(0.02).discard();
    return vec4(createShadowDepthNode(nodes), 0, 0, 1);
  })();
  material.userData.layerShadowDepthNodes = nodes;
  material.userData.layerShadowSyncDisposable = true;
  material.userData.webgpuLayerShadowMaterialPort = "rounded-rect-depth";
  return material;
}

function createShadowDepthNodes(
  uniforms: ShadowDepthUniforms,
): ShadowDepthNodeUniforms {
  return {
    u_shadowNear: uniform(uniforms.u_shadowNear.value),
    u_shadowFar: uniform(uniforms.u_shadowFar.value),
  };
}

function createShadowDepthNode(nodes: ShadowDepthNodeUniforms) {
  const viewPosition = modelViewMatrix.mul(vec4(positionLocal, 1.0));
  return clamp(
    viewPosition.z
      .negate()
      .sub(nodes.u_shadowNear)
      .div(max(0.0001, nodes.u_shadowFar.sub(nodes.u_shadowNear))),
    0.0,
    1.0,
  );
}

let opaqueShadowDepthTexture: InstanceType<typeof THREE.DataTexture> | null =
  null;

function createOpaqueShadowDepthTexture(): InstanceType<
  typeof THREE.DataTexture
> {
  if (opaqueShadowDepthTexture) return opaqueShadowDepthTexture;
  opaqueShadowDepthTexture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  opaqueShadowDepthTexture.needsUpdate = true;
  return opaqueShadowDepthTexture;
}

function findShadowLight(
  part: CompositionClip,
  localTime: number,
): ShadowLight | null {
  for (const object of part.objects) {
    if (object.type !== "light" || object.hidden) continue;
    const state = evaluateObjectState(object, localTime);
    const props = state.props ?? {};
    if (props.castShadow === false) continue;
    const kind = readLightKind(props.kind);
    if (kind !== "directional" && kind !== "spot" && kind !== "point") continue;
    const t = resolveLayerTransform(state);
    const transform =
      state.transform && typeof state.transform === "object"
        ? state.transform
        : {};
    const position = { x: t.positionX, y: t.positionY, z: t.positionZ };
    const fallbackTarget =
      props.target &&
      typeof props.target === "object" &&
      !Array.isArray(props.target)
        ? {
            x: readNumber(props.target.x, 0),
            y: readNumber(props.target.y, 0),
            z: readNumber(props.target.z, 0),
          }
        : { x: 0, y: 0, z: 0 };
    return {
      id: object.id,
      kind,
      debug: props.debug !== false,
      position,
      target: resolveLightTargetFromTransform(
        position,
        transform,
        fallbackTarget,
      ),
      range:
        kind === "spot" || kind === "point"
          ? Math.max(10, readNumber(props.range, 1200))
          : DIRECTIONAL_SHADOW_EXTENT,
      angle: kind === "point" ? 90 : readNumber(props.angle, 45),
    };
  }
  return null;
}

function canCastShadow(object: FrameObject): boolean {
  return (
    !object.hidden &&
    object.type !== "camera" &&
    object.type !== "light" &&
    object.props?.castShadow !== false
  );
}

function buildShadowInputSignature(
  part: CompositionClip,
  localTime: number,
  light: ShadowLight,
  casterIds: Set<string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layerRoot: any,
): string {
  const casterState = part.objects
    .filter((object) => casterIds.has(object.id))
    .map((object) => {
      const state = evaluateObjectState(object, localTime);
      const transform = resolveLayerTransform(state);
      return {
        id: object.id,
        bounds: state.bounds,
        props: state.props,
        style: state.style,
        transform,
        type: state.type,
      };
    });
  const materialState: string[] = [];
  layerRoot.traverse((node: { isMesh?: boolean }) => {
    if (!node.isMesh) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesh = node as any;
    const owner = findFrameObjectOwner(mesh);
    if (!owner || !casterIds.has(owner)) return;
    materialState.push(`${owner}:${readMaterialSignature(mesh.material)}`);
  });
  materialState.sort();
  return JSON.stringify({
    light,
    casters: casterState,
    materials: materialState,
  });
}

function diagnoseObjects(
  part: CompositionClip,
  localTime: number,
  casterIds: Set<string>,
  matrix: InstanceType<typeof THREE.Matrix4>,
  viewMatrix: InstanceType<typeof THREE.Matrix4>,
  near: number,
  far: number,
): LayerShadowObjectDiagnostics[] {
  return part.objects
    .filter((object) => object.type !== "camera" && object.type !== "light")
    .map((object) => {
      const state = evaluateObjectState(object, localTime);
      const transform = resolveLayerTransform(state);
      const world = new THREE.Vector3(
        transform.positionX,
        transform.positionY,
        transform.positionZ,
      );
      const projected = new THREE.Vector4(
        world.x,
        world.y,
        world.z,
        1,
      ).applyMatrix4(matrix);
      const invW = projected.w === 0 ? 0 : 1 / projected.w;
      const x = projected.x * invW;
      const y = projected.y * invW;
      const z = projected.z * invW;
      const u = x * 0.5 + 0.5;
      const v = y * 0.5 + 0.5;
      const shadowView = new THREE.Vector4(
        world.x,
        world.y,
        world.z,
        1,
      ).applyMatrix4(viewMatrix);
      const depth = Math.min(
        1,
        Math.max(0, (-shadowView.z - near) / Math.max(0.0001, far - near)),
      );
      return {
        id: object.id,
        type: object.type,
        casts: casterIds.has(object.id),
        world: { x: world.x, y: world.y, z: world.z },
        shadow: {
          u,
          v,
          depth,
          inside:
            u >= 0 && u <= 1 && v >= 0 && v <= 1 && depth >= 0 && depth <= 1,
          closestDepth: null,
          depthDelta: null,
          blockedAfterBias: null,
        },
      };
    });
}

function withShadowSamples(
  objects: LayerShadowObjectDiagnostics[],
  source: Uint16Array,
): LayerShadowObjectDiagnostics[] {
  return objects.map((object) => {
    if (!object.shadow.inside) return object;
    const x = Math.min(
      SHADOW_MAP_SIZE - 1,
      Math.max(0, Math.floor(object.shadow.u * SHADOW_MAP_SIZE)),
    );
    const y = Math.min(
      SHADOW_MAP_SIZE - 1,
      Math.max(0, Math.floor(object.shadow.v * SHADOW_MAP_SIZE)),
    );
    const closestDepth = sampleClosestDepthHalfFloat(
      source,
      x,
      y,
      SHADOW_MAP_SIZE,
    );
    const depthDelta = object.shadow.depth - closestDepth;
    return {
      ...object,
      shadow: {
        ...object.shadow,
        closestDepth,
        depthDelta,
        blockedAfterBias: depthDelta > SHADOW_BIAS,
      },
    };
  });
}

function withShadowSamplesFromRgba8(
  objects: LayerShadowObjectDiagnostics[],
  pixels: Uint8Array,
  mapSize: number,
): LayerShadowObjectDiagnostics[] {
  return objects.map((object) => {
    if (!object.shadow.inside) return object;
    const x = Math.min(
      mapSize - 1,
      Math.max(0, Math.floor(object.shadow.u * mapSize)),
    );
    const y = Math.min(
      mapSize - 1,
      Math.max(0, Math.floor(object.shadow.v * mapSize)),
    );
    const closestDepth = sampleClosestDepthRgba8(pixels, x, y, mapSize);
    const depthDelta = object.shadow.depth - closestDepth;
    return {
      ...object,
      shadow: {
        ...object.shadow,
        closestDepth,
        depthDelta,
        blockedAfterBias: depthDelta > SHADOW_BIAS,
      },
    };
  });
}

function sampleClosestDepthHalfFloat(
  source: Uint16Array,
  x: number,
  y: number,
  mapSize: number,
): number {
  let closest = 1;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const sx = Math.min(mapSize - 1, Math.max(0, x + dx));
      const sy = Math.min(mapSize - 1, Math.max(0, y + dy));
      const depth = halfFloatToNumber(source[(sy * mapSize + sx) * 4]);
      closest = Math.min(closest, depth);
    }
  }
  return closest;
}

function sampleClosestDepthRgba8(
  pixels: Uint8Array,
  x: number,
  y: number,
  mapSize: number,
): number {
  let closest = 1;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const sx = Math.min(mapSize - 1, Math.max(0, x + dx));
      const sy = Math.min(mapSize - 1, Math.max(0, y + dy));
      const depth = pixels[(sy * mapSize + sx) * 4] / 255;
      closest = Math.min(closest, depth);
    }
  }
  return closest;
}

function buildDebugImageFromHalfFloat(
  source: Uint16Array,
  size: number,
  mapSize: number,
  objects: LayerShadowObjectDiagnostics[],
): LayerShadowDebugImage {
  const image = new ImageData(size, size);
  let minDepth = 1;
  let maxDepth = 0;
  let nonClearSamples = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor((x / size) * mapSize);
      const sy = Math.floor((y / size) * mapSize);
      const sourceIndex = (sy * mapSize + sx) * 4;
      const depth = halfFloatToNumber(source[sourceIndex]);
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
      if (depth < 0.999) nonClearSamples += 1;
      const value = Math.round(depth * 255);
      const targetIndex = (y * size + x) * 4;
      image.data[targetIndex] = value;
      image.data[targetIndex + 1] = value;
      image.data[targetIndex + 2] = value;
      image.data[targetIndex + 3] = 255;
    }
  }
  return {
    image,
    map: { minDepth, maxDepth, nonClearSamples, totalSamples: size * size },
    objects: withShadowSamples(objects, source),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findFrameObjectOwner(object: any): string | null {
  let current = object;
  while (current) {
    const id = current.userData?.frameObjectId;
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMaterialSignature(source: any): string {
  const materials = Array.isArray(source) ? source : [source];
  return materials
    .map((material) => {
      const uniforms =
        material?.userData?.layerShadowUniforms ?? material?.uniforms;
      const image = uniforms?.u_image?.value;
      return [
        material?.uuid ?? "",
        material?.version ?? 0,
        material?.userData?.layerVideoFrameSignature ?? "",
        material?.opacity ?? "",
        image?.uuid ?? "",
        image?.version ?? "",
      ].join("/");
    })
    .join("|");
}

function readLightKind(value: unknown): LightObjectKind {
  if (
    value === "ambient" ||
    value === "directional" ||
    value === "point" ||
    value === "spot"
  ) {
    return value;
  }
  return "directional";
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function halfFloatToNumber(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31)
    return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
