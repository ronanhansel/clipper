import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNode, LayerNodeFactory } from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";

const IMAGE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const IMAGE_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_image;
  uniform vec2 u_size;
  uniform vec2 u_uvOrigin;
  uniform vec2 u_uvSize;
  uniform float u_radius;
  uniform float u_opacity;
  uniform float u_alphaCutoff;

  float roundedBoxSdf(vec2 p, vec2 h, float r) {
    vec2 q = abs(p) - h + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 uv = vUv * u_uvSize + u_uvOrigin;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) *
                   step(0.0, uv.y) * step(uv.y, 1.0);
    vec4 c = texture2D(u_image, clamp(uv, 0.0, 1.0));
    vec2 px = (vUv - 0.5) * u_size;
    vec2 halfSize = u_size * 0.5;
    float r = clamp(u_radius, 0.0, min(halfSize.x, halfSize.y));
    float d = roundedBoxSdf(px, halfSize, r);
    float coverage = clamp(0.5 - d, 0.0, 1.0);
    float a = c.a * u_opacity * coverage * inside;
    if (a < u_alphaCutoff) discard;
    gl_FragColor = vec4(c.rgb * a, a);
  }
`;

const ALPHA_CUTOFF = 0.01;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheEntry = { texture: any; refCount: number };

/**
 * Single source of truth for image textures keyed by `src`. Multiple
 * `ImageNode` instances that share a `src` reuse one GPU texture; the
 * entry is disposed when the last consumer releases it.
 */
const textureCache = new Map<string, CacheEntry>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function acquireImageTexture(src: string): any {
  const existing = textureCache.get(src);
  if (existing) {
    existing.refCount += 1;
    return existing.texture;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  image.onload = () => {
    texture.needsUpdate = true;
  };
  image.src = src;
  textureCache.set(src, { texture, refCount: 1 });
  return texture;
}

export function releaseImageTexture(src: string): void {
  const entry = textureCache.get(src);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  entry.texture.dispose();
  textureCache.delete(src);
}

/** Visible-for-tests reset hook; production never calls this. */
export function clearImageTextureCacheForTests(): void {
  for (const entry of textureCache.values()) entry.texture.dispose();
  textureCache.clear();
}

function makePlaceholderTexture(): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
  const data = new Uint8Array([0, 0, 0, 0]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

type UvCrop = {
  originX: number;
  originY: number;
  sizeX: number;
  sizeY: number;
};

const FULL_UVS: UvCrop = { originX: 0, originY: 0, sizeX: 1, sizeY: 1 };

function computeUvCrop(
  objectFit: string,
  imgW: number,
  imgH: number,
  planeW: number,
  planeH: number,
): UvCrop {
  if (imgW <= 0 || imgH <= 0 || planeW <= 0 || planeH <= 0) return FULL_UVS;
  if (objectFit === "fill") return FULL_UVS;
  const imgAR = imgW / imgH;
  const planeAR = planeW / planeH;
  if (objectFit === "contain") {
    if (imgAR >= planeAR) {
      const sizeY = imgAR / planeAR;
      return { originX: 0, originY: (1 - sizeY) / 2, sizeX: 1, sizeY };
    }
    const sizeX = planeAR / imgAR;
    return { originX: (1 - sizeX) / 2, originY: 0, sizeX, sizeY: 1 };
  }
  if (imgAR >= planeAR) {
    const sizeX = planeAR / imgAR;
    return { originX: (1 - sizeX) / 2, originY: 0, sizeX, sizeY: 1 };
  }
  const sizeY = imgAR / planeAR;
  return { originX: 0, originY: (1 - sizeY) / 2, sizeX: 1, sizeY };
}

function readObjectFit(state: EvaluatedObjectState): string {
  const fit = state.style?.objectFit;
  if (typeof fit === "string" && fit.length > 0) return fit;
  return "cover";
}

function readImageSrc(state: EvaluatedObjectState): string | null {
  const src = state.style?.src;
  if (typeof src === "string" && src.length > 0) return src;
  return null;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

class ImageNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly placeholder: any;
  private currentSrc: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentTexture: any | null = null;
  private width = 1;
  private height = 1;

  constructor(id: string) {
    this.placeholder = makePlaceholderTexture();
    this.material = new THREE.ShaderMaterial({
      vertexShader: IMAGE_VERTEX,
      fragmentShader: IMAGE_FRAGMENT,
      uniforms: {
        u_image: { value: this.placeholder },
        u_size: { value: new THREE.Vector2(1, 1) },
        u_uvOrigin: { value: new THREE.Vector2(0, 0) },
        u_uvSize: { value: new THREE.Vector2(1, 1) },
        u_radius: { value: 0 },
        u_opacity: { value: 1 },
        u_alphaCutoff: { value: ALPHA_CUTOFF },
      },
      transparent: false,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `ImageNode:${id}`;
    this.object3D = this.mesh;
  }

  update(state: EvaluatedObjectState): void {
    const t = resolveLayerTransform(state);
    if (t.width !== this.width || t.height !== this.height) {
      this.width = t.width;
      this.height = t.height;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(t.width, t.height);
    }

    this.mesh.position.set(t.positionX, t.positionY, t.positionZ);
    this.mesh.rotation.order = "XYZ";
    this.mesh.rotation.x = t.rotationX;
    this.mesh.rotation.y = t.rotationY;
    this.mesh.rotation.z = t.rotationZ;
    this.mesh.scale.set(t.scaleX, t.scaleY, 1);

    const u = this.material.uniforms;
    u.u_size.value.set(t.width, t.height);

    const src = readImageSrc(state);
    if (src !== this.currentSrc) {
      if (this.currentSrc) releaseImageTexture(this.currentSrc);
      if (src) {
        this.currentTexture = acquireImageTexture(src);
        u.u_image.value = this.currentTexture;
      } else {
        this.currentTexture = null;
        u.u_image.value = this.placeholder;
      }
      this.currentSrc = src;
    }

    const image = this.currentTexture?.image as
      | { naturalWidth?: number; naturalHeight?: number }
      | undefined;
    const imgW = image?.naturalWidth ?? 0;
    const imgH = image?.naturalHeight ?? 0;
    const fit = readObjectFit(state);
    const crop = computeUvCrop(fit, imgW, imgH, t.width, t.height);
    u.u_uvOrigin.value.set(crop.originX, crop.originY);
    u.u_uvSize.value.set(crop.sizeX, crop.sizeY);

    const opacity =
      typeof state.style?.opacity === "number" ? state.style.opacity : 1;
    u.u_opacity.value = clamp01(opacity);

    const radius =
      typeof state.style?.borderRadius === "number"
        ? state.style.borderRadius
        : 0;
    u.u_radius.value = Math.max(0, radius);
  }

  dispose(): void {
    if (this.currentSrc) releaseImageTexture(this.currentSrc);
    this.currentSrc = null;
    this.currentTexture = null;
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.placeholder.dispose();
  }
}

export const imageNodeFactory: LayerNodeFactory = {
  kind: "image",
  create(object: FrameObject) {
    return new ImageNode(object.id);
  },
};
