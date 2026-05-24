import * as THREE from "three";
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
          shadowUv + vec2(float(x), float(y)) * texel
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
        vec3 beamDir = normalize(u_lightTarget[i] - u_lightPosition[i]);
        vec3 toPoint = vWorldPosition - u_lightPosition[i];
        float alongBeam = dot(toPoint, beamDir);
        float distanceToSource = length(toPoint);
        vec3 lightDir = normalize(u_lightPosition[i] - vWorldPosition);
        float spread = layerConeMask(toPoint, beamDir, u_lightAngle[i], u_lightSoftness[i]);
        float rangeFalloff = 1.0 - smoothstep(u_lightRange[i] * 0.82, u_lightRange[i], distanceToSource);
        float front = step(0.0, alongBeam);
        direct += color * max(dot(normal, lightDir), 0.0) * spread * rangeFalloff * front;
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
  };
}

export function applyLayerLightingUniforms(
  material: { uniforms: ReturnType<typeof createLayerLightingUniforms> },
  lighting: LayerLightingState,
) {
  const uniforms = material.uniforms;
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
