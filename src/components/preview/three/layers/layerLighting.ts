import * as THREE from "three";
import {
  clamp,
  cos,
  float,
  frontFacing,
  Fn,
  int,
  max,
  mix,
  normalWorld,
  positionWorld,
  radians,
  smoothstep,
  step,
  texture as textureNode,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { LightObjectKind } from "../../../../core/types";

export const MAX_LAYER_LIGHTS = 8;

export type LayerLightState = {
  kind: LightObjectKind;
  color: string;
  intensity: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  range: number;
  angle: number;
  softness: number;
};

export type LayerLightingState = {
  active: boolean;
  lights: LayerLightState[];
  shadow: LayerShadowState;
};

export type LayerShadowState = {
  active: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  texture: any | null;
  matrix: InstanceType<typeof THREE.Matrix4>;
  viewMatrix: InstanceType<typeof THREE.Matrix4>;
  near: number;
  far: number;
  bias: number;
  darkness: number;
  mapFlipY: boolean;
};

export const EMPTY_LAYER_LIGHTING: LayerLightingState = {
  active: false,
  lights: [],
  shadow: {
    active: false,
    texture: null,
    matrix: new THREE.Matrix4(),
    viewMatrix: new THREE.Matrix4(),
    near: 1,
    far: 1200,
    bias: 0.004,
    darkness: 0.72,
    mapFlipY: false,
  },
};

const EMPTY_LAYER_SHADOW = EMPTY_LAYER_LIGHTING.shadow;

export const LAYER_LIGHTING_VERTEX_VARYINGS = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
`;

export const LAYER_LIGHTING_VERTEX_BODY = `
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
`;

export const LAYER_LIGHTING_FRAGMENT = `
  uniform float u_lightingActive;
  uniform int u_lightCount;
  uniform int u_lightKind[${MAX_LAYER_LIGHTS}];
  uniform vec3 u_lightColor[${MAX_LAYER_LIGHTS}];
  uniform vec3 u_lightPosition[${MAX_LAYER_LIGHTS}];
  uniform vec3 u_lightTarget[${MAX_LAYER_LIGHTS}];
  uniform float u_lightIntensity[${MAX_LAYER_LIGHTS}];
  uniform float u_lightRange[${MAX_LAYER_LIGHTS}];
  uniform float u_lightAngle[${MAX_LAYER_LIGHTS}];
  uniform float u_lightSoftness[${MAX_LAYER_LIGHTS}];
  uniform float u_shadowActive;
  uniform sampler2D u_shadowMap;
  uniform mat4 u_shadowMatrix;
  uniform mat4 u_shadowViewMatrix;
  uniform float u_shadowNear;
  uniform float u_shadowFar;
  uniform float u_shadowBias;
  uniform float u_shadowDarkness;
  uniform float u_shadowMapFlipY;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  float layerConeMask(vec3 toPoint, vec3 beamDir, float angleDeg, float softness) {
    float halfAngle = radians(clamp(angleDeg, 1.0, 175.0)) * 0.5;
    float penumbra = max(0.001, softness) * halfAngle;
    float inner = cos(max(0.001, halfAngle - penumbra));
    float outer = cos(halfAngle);
    float cone = dot(normalize(toPoint), beamDir);
    return smoothstep(outer, inner, cone);
  }

  float layerShadowVisibility() {
    if (u_shadowActive < 0.5) return 1.0;
    vec4 shadowClip = u_shadowMatrix * vec4(vWorldPosition, 1.0);
    vec3 shadowCoord = shadowClip.xyz / shadowClip.w;
    vec2 shadowUv = shadowCoord.xy * 0.5 + 0.5;
    vec2 shadowSampleUv = vec2(shadowUv.x, mix(shadowUv.y, 1.0 - shadowUv.y, u_shadowMapFlipY));
    vec4 shadowView = u_shadowViewMatrix * vec4(vWorldPosition, 1.0);
    float currentDepth = clamp((-shadowView.z - u_shadowNear) / max(0.0001, u_shadowFar - u_shadowNear), 0.0, 1.0);
    if (
      shadowUv.x < 0.0 || shadowUv.x > 1.0 ||
      shadowUv.y < 0.0 || shadowUv.y > 1.0 ||
      currentDepth < 0.0 || currentDepth > 1.0
    ) {
      return 1.0;
    }

    vec2 texel = vec2(1.0 / 2048.0);
    float blocked = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        float closestDepth = texture2D(
          u_shadowMap,
          shadowSampleUv + vec2(float(x), float(y)) * texel
        ).r;
        blocked += currentDepth - u_shadowBias > closestDepth ? 1.0 : 0.0;
      }
    }
    float occlusion = blocked / 9.0;
    return mix(1.0, 1.0 - u_shadowDarkness, occlusion);
  }

  vec3 layerLightMultiplier() {
    if (u_lightingActive < 0.5) return vec3(1.0);
    vec3 normal = normalize(gl_FrontFacing ? vWorldNormal : -vWorldNormal);
    vec3 ambient = vec3(0.0);
    vec3 direct = vec3(0.0);
    for (int i = 0; i < ${MAX_LAYER_LIGHTS}; i++) {
      if (i >= u_lightCount) break;
      vec3 color = u_lightColor[i] * u_lightIntensity[i];
      if (u_lightKind[i] == 0) {
        ambient += color;
      } else if (u_lightKind[i] == 1) {
        vec3 lightDir = normalize(u_lightPosition[i] - u_lightTarget[i]);
        direct += color * max(dot(normal, lightDir), 0.0);
      } else {
        vec3 toLight = u_lightPosition[i] - vWorldPosition;
        float distanceSq = max(dot(toLight, toLight), 1.0);
        float distanceToSource = sqrt(distanceSq);
        vec3 lightDir = normalize(toLight);
        float attenuation = 1.0 - smoothstep(u_lightRange[i] * 0.82, u_lightRange[i], distanceToSource);
        float diffuse = max(dot(normal, lightDir), 0.0);
        if (u_lightKind[i] == 3) {
          vec3 spotDir = normalize(u_lightTarget[i] - u_lightPosition[i]);
          float cone = layerConeMask(-toLight, spotDir, u_lightAngle[i], u_lightSoftness[i]);
          diffuse *= cone;
        }
        direct += color * diffuse * attenuation;
      }
    }
    float visibility = layerShadowVisibility();
    return max(ambient + direct * visibility, vec3(0.0));
  }
`;

export function createLayerLightingUniforms() {
  return {
    u_lightingActive: { value: 0 },
    u_lightCount: { value: 0 },
    u_lightKind: { value: new Array(MAX_LAYER_LIGHTS).fill(0) },
    u_lightColor: {
      value: Array.from(
        { length: MAX_LAYER_LIGHTS },
        () => new THREE.Vector3(1, 1, 1),
      ),
    },
    u_lightPosition: {
      value: Array.from(
        { length: MAX_LAYER_LIGHTS },
        () => new THREE.Vector3(0, 0, 0),
      ),
    },
    u_lightTarget: {
      value: Array.from(
        { length: MAX_LAYER_LIGHTS },
        () => new THREE.Vector3(0, 0, 0),
      ),
    },
    u_lightIntensity: { value: new Array(MAX_LAYER_LIGHTS).fill(0) },
    u_lightRange: { value: new Array(MAX_LAYER_LIGHTS).fill(1200) },
    u_lightAngle: { value: new Array(MAX_LAYER_LIGHTS).fill(45) },
    u_lightSoftness: { value: new Array(MAX_LAYER_LIGHTS).fill(0.25) },
    u_shadowActive: { value: 0 },
    u_shadowMap: { value: createOpaqueShadowTexture() },
    u_shadowMatrix: { value: new THREE.Matrix4() },
    u_shadowViewMatrix: { value: new THREE.Matrix4() },
    u_shadowNear: { value: EMPTY_LAYER_LIGHTING.shadow.near },
    u_shadowFar: { value: EMPTY_LAYER_LIGHTING.shadow.far },
    u_shadowBias: { value: EMPTY_LAYER_LIGHTING.shadow.bias },
    u_shadowDarkness: { value: EMPTY_LAYER_LIGHTING.shadow.darkness },
    u_shadowMapFlipY: { value: EMPTY_LAYER_LIGHTING.shadow.mapFlipY ? 1 : 0 },
  };
}

export type LayerLightingUniforms = ReturnType<
  typeof createLayerLightingUniforms
>;

export function createLayerLightingNodes(uniforms: LayerLightingUniforms) {
  const shadowMapNode = textureNode(uniforms.u_shadowMap.value);
  return {
    u_lightingActive: uniform(uniforms.u_lightingActive.value),
    u_lightCount: uniform(uniforms.u_lightCount.value, "int"),
    u_lightKind: uniformArray(uniforms.u_lightKind.value, "int"),
    u_lightColor: uniformArray(uniforms.u_lightColor.value, "vec3"),
    u_lightPosition: uniformArray(uniforms.u_lightPosition.value, "vec3"),
    u_lightTarget: uniformArray(uniforms.u_lightTarget.value, "vec3"),
    u_lightIntensity: uniformArray(uniforms.u_lightIntensity.value),
    u_lightRange: uniformArray(uniforms.u_lightRange.value),
    u_lightAngle: uniformArray(uniforms.u_lightAngle.value),
    u_lightSoftness: uniformArray(uniforms.u_lightSoftness.value),
    u_shadowActive: uniform(uniforms.u_shadowActive.value),
    u_shadowMap: shadowMapNode,
    u_shadowMatrix: uniform(uniforms.u_shadowMatrix.value),
    u_shadowViewMatrix: uniform(uniforms.u_shadowViewMatrix.value),
    u_shadowNear: uniform(uniforms.u_shadowNear.value),
    u_shadowFar: uniform(uniforms.u_shadowFar.value),
    u_shadowBias: uniform(uniforms.u_shadowBias.value),
    u_shadowDarkness: uniform(uniforms.u_shadowDarkness.value),
    u_shadowMapFlipY: uniform(uniforms.u_shadowMapFlipY.value),
  };
}

export type LayerLightingNodes = ReturnType<typeof createLayerLightingNodes>;

export function createLayerLightMultiplierNode(nodes: LayerLightingNodes) {
  return Fn(() => {
    const worldPosition = positionWorld;
    const normal = normalWorld
      .mul(float(frontFacing).mul(2.0).sub(1.0))
      .normalize();
    const ambient = vec3(0, 0, 0).toVar("layerAmbient");
    const direct = vec3(0, 0, 0).toVar("layerDirect");

    for (let i = 0; i < MAX_LAYER_LIGHTS; i += 1) {
      const active = float(nodes.u_lightCount.greaterThan(int(i))).mul(
        nodes.u_lightingActive,
      );
      const kind = nodes.u_lightKind.element(i);
      const lightPosition = nodes.u_lightPosition.element(i);
      const lightTarget = nodes.u_lightTarget.element(i);
      const lightRange = nodes.u_lightRange.element(i);
      const lightColor = nodes.u_lightColor
        .element(i)
        .mul(nodes.u_lightIntensity.element(i))
        .mul(active);
      const ambientMask = float(kind.equal(int(0)));
      const directionalMask = float(kind.equal(int(1)));
      const pointMask = float(kind.equal(int(2)));
      const spotMask = float(kind.equal(int(3)));

      ambient.addAssign(lightColor.mul(ambientMask));

      const directionalLightDir = lightPosition.sub(lightTarget).normalize();
      direct.addAssign(
        lightColor
          .mul(max(normal.dot(directionalLightDir), 0.0))
          .mul(directionalMask),
      );

      const toLight = lightPosition.sub(worldPosition);
      const distanceToSource = toLight.length();
      const lightDir = toLight.normalize();
      const rangeFalloff = float(1.0).sub(
        smoothstep(lightRange.mul(0.82), lightRange, distanceToSource),
      );
      const diffuse = max(normal.dot(lightDir), 0.0);
      const spotDir = lightTarget.sub(lightPosition).normalize();
      const spotCone = createLayerConeMaskNode(
        toLight.negate(),
        spotDir,
        nodes.u_lightAngle.element(i),
        nodes.u_lightSoftness.element(i),
      );
      direct.addAssign(
        lightColor.mul(diffuse).mul(rangeFalloff).mul(pointMask),
      );
      direct.addAssign(
        lightColor.mul(diffuse).mul(spotCone).mul(rangeFalloff).mul(spotMask),
      );
    }

    const visibility = createLayerShadowVisibilityNode(nodes);
    return max(ambient.add(direct.mul(visibility)), vec3(0, 0, 0));
  })();
}

function createLayerConeMaskNode(
  toPoint: any,
  beamDir: any,
  angleDeg: any,
  softness: any,
) {
  const halfAngle = radians(clamp(angleDeg, 1.0, 175.0)).mul(0.5);
  const penumbra = max(0.001, softness).mul(halfAngle);
  const inner = cos(max(0.001, halfAngle.sub(penumbra)));
  const outer = cos(halfAngle);
  const cone = toPoint.normalize().dot(beamDir);
  return smoothstep(outer, inner, cone);
}

function createLayerShadowVisibilityNode(nodes: LayerLightingNodes) {
  return Fn(() => {
    const shadowClip = nodes.u_shadowMatrix.mul(vec4(positionWorld, 1.0));
    const shadowCoord = shadowClip.xyz.div(shadowClip.w);
    const shadowUv = shadowCoord.xy.mul(0.5).add(0.5);
    const shadowSampleUv = vec2(
      shadowUv.x,
      mix(shadowUv.y, float(1.0).sub(shadowUv.y), nodes.u_shadowMapFlipY),
    );
    const shadowView = nodes.u_shadowViewMatrix.mul(vec4(positionWorld, 1.0));
    const currentDepth = clamp(
      shadowView.z
        .negate()
        .sub(nodes.u_shadowNear)
        .div(max(0.0001, nodes.u_shadowFar.sub(nodes.u_shadowNear))),
      0.0,
      1.0,
    );
    const inBounds = step(0.0, shadowUv.x)
      .mul(step(shadowUv.x, 1.0))
      .mul(step(0.0, shadowUv.y))
      .mul(step(shadowUv.y, 1.0))
      .mul(step(0.0, currentDepth))
      .mul(step(currentDepth, 1.0))
      .mul(nodes.u_shadowActive);
    const texel = vec2(1 / 2048, 1 / 2048);
    const blocked = float(0).toVar("layerShadowBlocked");
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        const offset = vec2(x, y).mul(texel);
        const closestDepth = nodes.u_shadowMap.sample(
          shadowSampleUv.add(offset),
        ).r;
        blocked.addAssign(
          step(closestDepth, currentDepth.sub(nodes.u_shadowBias)),
        );
      }
    }
    const occlusion = blocked.div(9.0);
    const shadowed = mix(
      float(1.0),
      float(1.0).sub(nodes.u_shadowDarkness),
      occlusion,
    );
    return mix(float(1.0), shadowed, inBounds);
  })();
}

export function applyLayerLightingUniforms(
  material: {
    uniforms?: LayerLightingUniforms;
    userData?: {
      layerLightingUniforms?: unknown;
      layerLightingNodes?: LayerLightingNodes;
    };
  },
  lighting: LayerLightingState,
) {
  const uniforms =
    (material.userData?.layerLightingUniforms as
      | LayerLightingUniforms
      | undefined) ?? material.uniforms;
  if (!uniforms) return;
  const shadow = lighting.shadow ?? EMPTY_LAYER_SHADOW;
  const lights = lighting.active
    ? lighting.lights.slice(0, MAX_LAYER_LIGHTS)
    : [];
  uniforms.u_lightingActive.value = lighting.active ? 1 : 0;
  uniforms.u_lightCount.value = lights.length;
  uniforms.u_shadowActive.value = shadow.active ? 1 : 0;
  uniforms.u_shadowMap.value = shadow.texture ?? createOpaqueShadowTexture();
  uniforms.u_shadowMatrix.value.copy(shadow.matrix);
  uniforms.u_shadowViewMatrix.value.copy(shadow.viewMatrix);
  uniforms.u_shadowNear.value = shadow.near;
  uniforms.u_shadowFar.value = shadow.far;
  uniforms.u_shadowBias.value = shadow.bias;
  uniforms.u_shadowDarkness.value = shadow.darkness;
  uniforms.u_shadowMapFlipY.value = shadow.mapFlipY ? 1 : 0;
  for (let i = 0; i < MAX_LAYER_LIGHTS; i += 1) {
    const light = lights[i];
    if (!light) {
      uniforms.u_lightKind.value[i] = 0;
      uniforms.u_lightIntensity.value[i] = 0;
      uniforms.u_lightRange.value[i] = 1200;
      uniforms.u_lightAngle.value[i] = 45;
      uniforms.u_lightSoftness.value[i] = 0.25;
      continue;
    }
    uniforms.u_lightKind.value[i] = lightKindToUniform(light.kind);
    uniforms.u_lightIntensity.value[i] = Math.max(0, light.intensity);
    uniforms.u_lightRange.value[i] = Math.max(1, light.range);
    uniforms.u_lightAngle.value[i] = Math.min(175, Math.max(1, light.angle));
    uniforms.u_lightSoftness.value[i] = Math.min(
      1,
      Math.max(0.001, light.softness),
    );
    const color = new THREE.Color(light.color);
    uniforms.u_lightColor.value[i].set(color.r, color.g, color.b);
    uniforms.u_lightPosition.value[i].set(
      light.position.x,
      light.position.y,
      light.position.z,
    );
    uniforms.u_lightTarget.value[i].set(
      light.target.x,
      light.target.y,
      light.target.z,
    );
  }
  syncLayerLightingNodes(material.userData?.layerLightingNodes, uniforms);
}

function syncLayerLightingNodes(
  nodes: LayerLightingNodes | undefined,
  uniforms: LayerLightingUniforms,
): void {
  if (!nodes) return;
  nodes.u_lightingActive.value = uniforms.u_lightingActive.value;
  nodes.u_lightCount.value = uniforms.u_lightCount.value;
  nodes.u_lightKind.array = uniforms.u_lightKind.value;
  nodes.u_lightColor.array = uniforms.u_lightColor.value;
  nodes.u_lightPosition.array = uniforms.u_lightPosition.value;
  nodes.u_lightTarget.array = uniforms.u_lightTarget.value;
  nodes.u_lightIntensity.array = uniforms.u_lightIntensity.value;
  nodes.u_lightRange.array = uniforms.u_lightRange.value;
  nodes.u_lightAngle.array = uniforms.u_lightAngle.value;
  nodes.u_lightSoftness.array = uniforms.u_lightSoftness.value;
  nodes.u_shadowActive.value = uniforms.u_shadowActive.value;
  nodes.u_shadowMap.value = uniforms.u_shadowMap.value;
  nodes.u_shadowMatrix.value = uniforms.u_shadowMatrix.value;
  nodes.u_shadowViewMatrix.value = uniforms.u_shadowViewMatrix.value;
  nodes.u_shadowNear.value = uniforms.u_shadowNear.value;
  nodes.u_shadowFar.value = uniforms.u_shadowFar.value;
  nodes.u_shadowBias.value = uniforms.u_shadowBias.value;
  nodes.u_shadowDarkness.value = uniforms.u_shadowDarkness.value;
  nodes.u_shadowMapFlipY.value = uniforms.u_shadowMapFlipY.value;
}

let opaqueShadowTexture: InstanceType<typeof THREE.DataTexture> | null = null;

function createOpaqueShadowTexture(): InstanceType<typeof THREE.DataTexture> {
  if (opaqueShadowTexture) return opaqueShadowTexture;
  opaqueShadowTexture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  opaqueShadowTexture.needsUpdate = true;
  return opaqueShadowTexture;
}

function lightKindToUniform(kind: LightObjectKind) {
  if (kind === "ambient") return 0;
  if (kind === "directional") return 1;
  if (kind === "point") return 2;
  return 3;
}
