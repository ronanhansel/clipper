import * as THREE from "three";
import { evaluateObjectState } from "../../../../core/propertyRegistry";
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
const SHADOW_BIAS = 0.004;
const SHADOW_DARKNESS = 0.72;

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
  private readonly renderTarget: InstanceType<typeof THREE.WebGLRenderTarget>;
  private readonly shadowMatrix = new THREE.Matrix4();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly solidMaterial = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_SOLID_FRAGMENT,
    uniforms: createShadowDepthUniforms(),
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
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
  };
  private diagnostics: LayerShadowDiagnostics = {
    active: false,
    reason: "not-run",
    light: null,
    casterIds: [],
    render: { visibleCasters: 0, casterOwners: [] },
    objects: [],
  };

  constructor() {
    this.group.name = "LayerShadowSync";
    this.renderTarget = new THREE.WebGLRenderTarget(
      SHADOW_MAP_SIZE,
      SHADOW_MAP_SIZE,
      {
        depthBuffer: true,
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.NoColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      },
    );
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
    const renderDiagnostics = this.renderShadowMap(
      renderer,
      layerRoot,
      casterIds,
    );
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
      const image = new ImageData(size, size);
      let minDepth = 1;
      let maxDepth = 0;
      let nonClearSamples = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const sx = Math.floor((x / size) * SHADOW_MAP_SIZE);
          const sy = Math.floor((y / size) * SHADOW_MAP_SIZE);
          const sourceIndex = (sy * SHADOW_MAP_SIZE + sx) * 4;
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
        map: {
          minDepth,
          maxDepth,
          nonClearSamples,
          totalSamples: size * size,
        },
        objects: withShadowSamples(this.diagnostics.objects, source),
      };
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.solidMaterial.dispose();
    this.textureMaterial.dispose();
    this.roundedRectMaterial.dispose();
  }

  private deactivate(
    reason: string,
    light: ShadowLight | null = null,
  ): LayerShadowState {
    this.state = {
      active: false,
      texture: null,
      matrix: this.shadowMatrix.identity(),
      viewMatrix: this.camera.matrixWorldInverse,
      near: this.camera.near,
      far: this.camera.far,
      bias: SHADOW_BIAS,
      darkness: SHADOW_DARKNESS,
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

    const perspective = new THREE.PerspectiveCamera(
      Math.min(175, Math.max(1, light.angle)),
      1,
      1,
      Math.max(10, light.range),
    );
    perspective.position.copy(position);
    perspective.lookAt(target);
    perspective.updateMatrixWorld();
    perspective.updateProjectionMatrix();
    this.copyCamera(perspective);
  }

  private copyCamera(
    camera:
      | InstanceType<typeof THREE.PerspectiveCamera>
      | InstanceType<typeof THREE.OrthographicCamera>,
  ): void {
    this.camera.position.copy(camera.position);
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.near = camera.near;
    this.camera.far = camera.far;
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
    const uniforms = material?.uniforms;
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
  if (!material?.uniforms) return;
  if (material.uniforms.u_shadowNear)
    material.uniforms.u_shadowNear.value = near;
  if (material.uniforms.u_shadowFar) material.uniforms.u_shadowFar.value = far;
}

function findShadowLight(
  part: CompositionClip,
  localTime: number,
): ShadowLight | null {
  for (const object of part.objects) {
    if (object.type !== "light" || object.hidden) continue;
    const props = object.props ?? {};
    if (props.castShadow === false) continue;
    const kind = readLightKind(props.kind);
    if (kind !== "directional") continue;
    const state = evaluateObjectState(object, localTime);
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
      range: readNumber(props.range, 1200),
      angle: readNumber(props.angle, 45),
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
    const closestDepth = sampleClosestDepth(source, x, y);
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

function sampleClosestDepth(source: Uint16Array, x: number, y: number): number {
  let closest = 1;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const sx = Math.min(SHADOW_MAP_SIZE - 1, Math.max(0, x + dx));
      const sy = Math.min(SHADOW_MAP_SIZE - 1, Math.max(0, y + dy));
      const depth = halfFloatToNumber(source[(sy * SHADOW_MAP_SIZE + sx) * 4]);
      closest = Math.min(closest, depth);
    }
  }
  return closest;
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

function readLightKind(value: unknown): LightObjectKind {
  if (value === "ambient" || value === "directional" || value === "point") {
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
