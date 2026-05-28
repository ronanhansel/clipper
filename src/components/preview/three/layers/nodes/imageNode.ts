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
  step,
  texture as textureNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import { MEDIA_PLACEHOLDER_DATA_URL } from "../../../../../core/mediaPlaceholder";
import { normalizeClipperMediaUrl } from "../../../../../core/mediaSource";
import { getMediaAssetType } from "../../../../../core/mediaTypes";
import { getMediaVideoTime } from "../../../../../core/mediaVideoPlayback";
import {
  getWebCodecsVideoFrameProvider,
  type WebCodecsVideoFrameProvider,
} from "../../../../../core/webCodecsVideoFrameProvider";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import { serializeSvgForRaster } from "../../../exportSvgRasterCache";
import type {
  LayerNode,
  LayerNodeContext,
  LayerNodeFactory,
} from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";
import {
  applyLayerLightingUniforms,
  createLayerLightingNodes,
  createLayerLightMultiplierNode,
  createLayerLightingUniforms,
  EMPTY_LAYER_LIGHTING,
  LAYER_LIGHTING_FRAGMENT,
  LAYER_LIGHTING_VERTEX_BODY,
  LAYER_LIGHTING_VERTEX_VARYINGS,
} from "../layerLighting";

type ImageMaterialUniforms = ReturnType<typeof createImageUniforms>;
type TextureKind = "image" | "video";
const IMAGE_VERTEX = `
  ${LAYER_LIGHTING_VERTEX_VARYINGS}
  varying vec2 vUv;
  void main() {
    vUv = uv;
    ${LAYER_LIGHTING_VERTEX_BODY}
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const IMAGE_FRAGMENT = `
  precision highp float;
  ${LAYER_LIGHTING_FRAGMENT}
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
    gl_FragColor = vec4(c.rgb * layerLightMultiplier() * u_opacity * coverage * inside, a);
  }
`;

const ALPHA_CUTOFF = 0.01;
const SVG_TAG_RE = /<svg[\s>]/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheEntry = {
  texture: any;
  refCount: number;
  callbacks: Set<() => void>;
};

/**
 * Single source of truth for image textures keyed by `src`. Multiple
 * `ImageNode` instances that share a `src` reuse one GPU texture; the
 * entry is disposed when the last consumer releases it.
 */
const textureCache = new Map<string, CacheEntry>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function acquireImageTexture(
  src: string,
  onTextureReady?: () => void,
): any {
  const existing = textureCache.get(src);
  if (existing) {
    existing.refCount += 1;
    if (onTextureReady) existing.callbacks.add(onTextureReady);
    return existing.texture;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  image.onload = () => {
    texture.needsUpdate = true;
    notifyTextureReady(src, texture);
  };
  image.src = src;
  textureCache.set(src, {
    texture,
    refCount: 1,
    callbacks: new Set(onTextureReady ? [onTextureReady] : []),
  });
  return texture;
}

export function releaseImageTexture(
  src: string,
  onTextureReady?: () => void,
): void {
  const entry = textureCache.get(src);
  if (!entry) return;
  if (onTextureReady) entry.callbacks.delete(onTextureReady);
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  entry.texture.dispose();
  textureCache.delete(src);
}

export function acquireLayerSizedSvgTexture(
  src: string,
  width: number,
  height: number,
  onTextureReady?: () => void,
): { key: string; texture: any } {
  if (typeof document === "undefined") {
    return { key: src, texture: acquireImageTexture(src, onTextureReady) };
  }
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const key = `svg:${w}x${h}:${src}`;
  const existing = textureCache.get(key);
  if (existing) {
    existing.refCount += 1;
    if (onTextureReady) existing.callbacks.add(onTextureReady);
    return { key, texture: existing.texture };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  textureCache.set(key, {
    texture,
    refCount: 1,
    callbacks: new Set(onTextureReady ? [onTextureReady] : []),
  });
  void rasterizeSvgTexture(src, canvas, texture, w, h, key);
  return { key, texture };
}

async function rasterizeSvgTexture(
  src: string,
  canvas: HTMLCanvasElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  texture: any,
  width: number,
  height: number,
  key: string,
): Promise<void> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ImageNode: 2D canvas unavailable");
  try {
    const markup = await loadSvgMarkup(src);
    const sizedSvg = serializeSvgForRaster(markup, width, height, undefined);
    const objectUrl = URL.createObjectURL(
      new Blob([sizedSvg], { type: "image/svg+xml;charset=utf-8" }),
    );
    try {
      const image = await loadImage(objectUrl);
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      texture.needsUpdate = true;
      notifyTextureReady(key, texture);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.warn("ImageNode: SVG rasterization failed", error);
    try {
      const image = await loadImage(src);
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      texture.needsUpdate = true;
      notifyTextureReady(key, texture);
    } catch (fallbackError) {
      console.warn("ImageNode: direct SVG decode failed", fallbackError);
      notifyTextureReady(key, texture);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notifyTextureReady(key: string, texture: any): void {
  const entry = textureCache.get(key);
  if (!entry || entry.texture !== texture) return;
  for (const callback of entry.callbacks) callback();
}

async function loadSvgMarkup(src: string): Promise<string> {
  const inlineMarkup = decodeMaybeSvgMarkup(src);
  if (SVG_TAG_RE.test(inlineMarkup)) return inlineMarkup;
  if (src.startsWith("data:image/svg+xml")) return decodeSvgDataUrl(src);
  const response = await fetch(src);
  return response.text();
}

function decodeMaybeSvgMarkup(input: string): string {
  if (SVG_TAG_RE.test(input)) return input;
  try {
    const decoded = decodeURIComponent(input);
    return SVG_TAG_RE.test(decoded) ? decoded : input;
  } catch {
    return input;
  }
}

function decodeSvgDataUrl(src: string): string {
  const comma = src.indexOf(",");
  if (comma < 0) return src;
  const header = src.slice(0, comma).toLowerCase();
  const body = src.slice(comma + 1);
  if (header.includes(";base64")) return atob(body);
  return decodeURIComponent(body);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("ImageNode: SVG decode failed"));
    image.src = src;
  });
}

/** Visible-for-tests reset hook; production never calls this. */
export function clearImageTextureCacheForTests(): void {
  for (const entry of textureCache.values()) entry.texture.dispose();
  textureCache.clear();
}

type UvCrop = {
  originX: number;
  originY: number;
  sizeX: number;
  sizeY: number;
};

export const FULL_UVS: UvCrop = {
  originX: 0,
  originY: 0,
  sizeX: 1,
  sizeY: 1,
};

export function computeUvCrop(
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
  if (typeof src === "string" && src.length > 0)
    return normalizeClipperMediaUrl(src);
  return null;
}

function isVideoMediaSource(src: string): boolean {
  return getMediaAssetType(src) === "video";
}

function createVideoFrameTexture(): any {
  const texture = new THREE.VideoFrameTexture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function isSvgMediaSource(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  if (SVG_TAG_RE.test(decodeMaybeSvgMarkup(normalized))) return true;
  if (normalized.startsWith("data:image/svg+xml")) return true;
  try {
    return decodeURIComponent(normalized).includes(".svg");
  } catch {
    return normalized.includes(".svg");
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function createImageUniforms(image: unknown) {
  return {
    u_image: { value: image },
    u_size: { value: new THREE.Vector2(1, 1) },
    u_uvOrigin: { value: new THREE.Vector2(0, 0) },
    u_uvSize: { value: new THREE.Vector2(1, 1) },
    u_radius: { value: 0 },
    u_opacity: { value: 1 },
    u_alphaCutoff: { value: ALPHA_CUTOFF },
    ...createLayerLightingUniforms(),
  };
}

function createImageShaderMaterial(image: unknown) {
  return new THREE.ShaderMaterial({
    vertexShader: IMAGE_VERTEX,
    fragmentShader: IMAGE_FRAGMENT,
    uniforms: createImageUniforms(image),
    transparent: true,
    premultipliedAlpha: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function createImageNodeMaterial(image: unknown) {
  const uniforms = createImageUniforms(image);
  const lightingNodes = createLayerLightingNodes(uniforms);
  const lightMultiplierNode = createLayerLightMultiplierNode(lightingNodes);
  const imageTextureNode = textureNode(image);
  const sizeNode = uniform(uniforms.u_size.value);
  const uvOriginNode = uniform(uniforms.u_uvOrigin.value);
  const uvSizeNode = uniform(uniforms.u_uvSize.value);
  const radiusNode = uniform(uniforms.u_radius.value);
  const opacityNode = uniform(uniforms.u_opacity.value);
  const alphaCutoffNode = uniform(uniforms.u_alphaCutoff.value);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    premultipliedAlpha: true,
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
    const px = uv().sub(0.5).mul(sizeNode);
    const halfSize = sizeNode.mul(0.5);
    const r = clamp(radiusNode, 0.0, min(halfSize.x, halfSize.y));
    const q = abs(px).sub(halfSize).add(vec2(r));
    const d = length(max(q, vec2(0.0)))
      .add(min(max(q.x, q.y), 0.0))
      .sub(r);
    const coverage = clamp(float(0.5).sub(d), 0.0, 1.0);
    const alpha = sample.a.mul(opacityNode).mul(coverage).mul(inside);
    alpha.lessThan(alphaCutoffNode).discard();
    return vec4(
      sample.rgb
        .mul(lightMultiplierNode)
        .mul(opacityNode)
        .mul(coverage)
        .mul(inside),
      alpha,
    );
  })();
  material.userData.layerLightingUniforms = uniforms;
  material.userData.layerLightingNodes = lightingNodes;
  material.userData.layerShadowUniforms = uniforms;
  material.userData.layerTextureNode = imageTextureNode;
  material.userData.layerUniformNodes = {
    u_radius: radiusNode,
    u_opacity: opacityNode,
    u_alphaCutoff: alphaCutoffNode,
  };
  material.userData.webgpuLayerMaterialPort = "image-fill";
  return material;
}

function getImageMaterialUniforms(material: {
  uniforms?: ImageMaterialUniforms;
  userData?: { layerLightingUniforms?: unknown };
}): ImageMaterialUniforms {
  const uniforms =
    material.uniforms ?? material.userData?.layerLightingUniforms;
  return uniforms as ImageMaterialUniforms;
}

function syncImageNodeUniforms(
  material: {
    userData?: { layerUniformNodes?: Record<string, { value: unknown }> };
  },
  uniforms: ImageMaterialUniforms,
): void {
  const nodes = material.userData?.layerUniformNodes;
  if (!nodes) return;
  nodes.u_radius.value = uniforms.u_radius.value;
  nodes.u_opacity.value = uniforms.u_opacity.value;
  nodes.u_alphaCutoff.value = uniforms.u_alphaCutoff.value;
}

function setImageMaterialTexture(
  material: {
    uniforms?: ImageMaterialUniforms;
    userData?: Record<string, any>;
  },
  texture: unknown,
): void {
  const uniforms = getImageMaterialUniforms(material);
  uniforms.u_image.value = texture;
  const node = material.userData?.layerTextureNode;
  if (node && typeof node === "object" && "value" in node) {
    node.value = texture;
  }
}

class ImageNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly placeholder: any;
  private currentSrc: string | null = null;
  private currentRawSrc: unknown = undefined;
  private currentNormalizedSrc: string | null = null;
  private currentMediaKindSrc: string | null = null;
  private currentMediaKind: { video: boolean; svg: boolean } = {
    video: false,
    svg: false,
  };
  private currentTextureKey: string | null = null;
  private currentTextureKind: TextureKind | null = null;
  private currentTextureLayerSized = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentTexture: any | null = null;
  private currentVideoProvider: WebCodecsVideoFrameProvider | null = null;
  private currentVideoProviderVersion = 0;
  private currentVideoFrameTime: number | null = null;
  private width = 1;
  private height = 1;

  private readonly requestRender: () => void;
  private readonly context: LayerNodeContext;

  constructor(id: string, context: LayerNodeContext) {
    this.requestRender = context.requestRender;
    this.context = context;
    this.placeholder = acquireImageTexture(MEDIA_PLACEHOLDER_DATA_URL);
    this.material =
      context.materialBackend === "webgpu-node"
        ? createImageNodeMaterial(this.placeholder)
        : createImageShaderMaterial(this.placeholder);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `ImageNode:${id}`;
    this.object3D = this.mesh;
  }

  update(
    state: EvaluatedObjectState,
    options: { localTime: number; isPlaying: boolean } = {
      localTime: 0,
      isPlaying: false,
    },
  ): void {
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

    const src = this.readCachedImageSrc(state);
    const sourceKind = src ? this.readCachedMediaKind(src) : null;
    const textureKey =
      src && !sourceKind?.video && sourceKind?.svg
        ? `svg:${Math.max(1, Math.ceil(t.width))}x${Math.max(1, Math.ceil(t.height))}:${src}`
        : src;
    if (src !== this.currentSrc || textureKey !== this.currentTextureKey) {
      this.releaseCurrentTexture();
      if (src) {
        if (sourceKind?.video) {
          this.currentTexture = createVideoFrameTexture();
          this.currentTextureKey = src;
          this.currentTextureKind = "video";
          this.currentTextureLayerSized = false;
          void this.loadVideoFrameProvider(src);
        } else if (sourceKind?.svg) {
          const lease = acquireLayerSizedSvgTexture(
            src,
            t.width,
            t.height,
            this.requestRender,
          );
          this.currentTextureKey = lease.key;
          this.currentTexture = lease.texture;
          this.currentTextureKind = "image";
          this.currentTextureLayerSized = true;
        } else {
          this.currentTextureKey = src;
          this.currentTexture = acquireImageTexture(src, this.requestRender);
          this.currentTextureKind = "image";
          this.currentTextureLayerSized = false;
        }
        this.setCurrentMaterialTexture(this.currentTexture);
      } else {
        this.currentTextureKey = null;
        this.currentTextureKind = null;
        this.currentTexture = null;
        this.currentVideoProvider = null;
        this.currentVideoFrameTime = null;
        this.currentTextureLayerSized = false;
        this.setCurrentMaterialTexture(this.placeholder);
      }
      this.currentSrc = src;
    }

    const u = getImageMaterialUniforms(this.material);
    u.u_size.value.set(t.width, t.height);

    if (this.currentTextureKind === "video") {
      this.drawVideoFrame(state, options.localTime);
    }

    const image = this.currentTexture?.image as
      | {
          naturalWidth?: number;
          naturalHeight?: number;
          displayWidth?: number;
          displayHeight?: number;
          videoWidth?: number;
          videoHeight?: number;
          width?: number;
          height?: number;
        }
      | undefined;
    const imgW =
      image?.naturalWidth ??
      image?.displayWidth ??
      image?.videoWidth ??
      image?.width ??
      0;
    const imgH =
      image?.naturalHeight ??
      image?.displayHeight ??
      image?.videoHeight ??
      image?.height ??
      0;
    const fit = readObjectFit(state);
    const crop = this.currentTextureLayerSized
      ? FULL_UVS
      : computeUvCrop(fit, imgW, imgH, t.width, t.height);
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
    syncImageNodeUniforms(this.material, u);
    applyLayerLightingUniforms(
      this.material,
      this.context.getLighting?.() ?? EMPTY_LAYER_LIGHTING,
    );
  }

  dispose(): void {
    this.releaseCurrentTexture();
    this.currentSrc = null;
    this.currentRawSrc = undefined;
    this.currentNormalizedSrc = null;
    this.currentMediaKindSrc = null;
    this.currentTextureKey = null;
    this.currentTextureKind = null;
    this.currentTexture = null;
    this.currentVideoProvider = null;
    this.currentVideoFrameTime = null;
    this.mesh.geometry.dispose();
    this.material.dispose();
    releaseImageTexture(MEDIA_PLACEHOLDER_DATA_URL);
  }

  private readCachedImageSrc(state: EvaluatedObjectState): string | null {
    const rawSrc = state.style?.src;
    if (rawSrc === this.currentRawSrc) return this.currentNormalizedSrc;
    this.currentRawSrc = rawSrc;
    this.currentNormalizedSrc = readImageSrc(state);
    return this.currentNormalizedSrc;
  }

  private readCachedMediaKind(src: string): { video: boolean; svg: boolean } {
    if (src === this.currentMediaKindSrc) return this.currentMediaKind;
    this.currentMediaKindSrc = src;
    this.currentMediaKind = {
      video: isVideoMediaSource(src),
      svg: isSvgMediaSource(src),
    };
    return this.currentMediaKind;
  }

  private releaseCurrentTexture(): void {
    if (!this.currentTextureKey) return;
    if (this.currentTextureKind === "video") {
      this.currentTexture?.dispose?.();
      this.currentVideoProvider = null;
      this.currentVideoFrameTime = null;
      this.currentVideoProviderVersion += 1;
    } else {
      releaseImageTexture(this.currentTextureKey, this.requestRender);
    }
    this.currentTextureKey = null;
    this.currentTextureKind = null;
    this.currentTexture = null;
    this.currentVideoProvider = null;
    this.currentVideoFrameTime = null;
  }

  private async loadVideoFrameProvider(src: string): Promise<void> {
    const version = ++this.currentVideoProviderVersion;
    try {
      const provider = await getWebCodecsVideoFrameProvider(src);
      if (
        version !== this.currentVideoProviderVersion ||
        this.currentTextureKind !== "video" ||
        this.currentTextureKey !== src
      ) {
        return;
      }
      this.currentVideoProvider = provider;
      this.requestRender();
    } catch (error) {
      console.warn("ImageNode: WebCodecs video decode failed", error);
    }
  }

  private drawVideoFrame(state: EvaluatedObjectState, localTime: number): void {
    const provider = this.currentVideoProvider;
    const texture = this.currentTexture;
    if (!provider || !texture) return;
    const frame = provider.getFrameAt(getMediaVideoTime(state, localTime));
    if (!frame) return;
    if (this.currentVideoFrameTime === frame.time) return;
    texture.setFrame(frame.frame);
    this.currentVideoFrameTime = frame.time;
  }

  private setCurrentMaterialTexture(texture: unknown): void {
    setImageMaterialTexture(this.material, texture);
  }
}

export const imageNodeFactory: LayerNodeFactory = {
  kind: "image",
  create(object: FrameObject, context: LayerNodeContext) {
    return new ImageNode(object.id, context);
  },
};

export const mediaNodeFactory: LayerNodeFactory = {
  kind: "media",
  create(object: FrameObject, context: LayerNodeContext) {
    return new ImageNode(object.id, context);
  },
};
