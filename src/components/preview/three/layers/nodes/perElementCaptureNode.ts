import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { Fn, texture as textureNode, uniform, uv, vec4 } from "three/tsl";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject, FrameObjectType } from "../../../../../core/types";
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

/**
 * Per-FrameObject DOM-capture node. Replaces the shared-composite UV-
 * crop fallback that produced cross-layer ghosting in 3D.
 *
 * Each instance owns its OWN private offscreen `<canvas>` + private
 * `THREE.CanvasTexture` sized to the layer's bounds, and a quad with
 * full `[0,1]` UVs (no crop). On every `update`:
 *   1. Resolve the layer's DOM subtree via
 *      `sourceRoot().querySelector('[data-clipper-render-object-id="<id>"]')`.
 *   2. Clone that subtree into the renderer-owned shared capture canvas
 *      as a direct child, then call `drawElementImage(clone, 0, 0, w, h)`.
 *      Chromium requires an immediate canvas child, and the clone lets
 *      us strip the authoring wrapper transform because Three applies
 *      the 3D transform.
 *   3. Blit the pixels from the shared canvas into the private canvas.
 *   4. Mark the texture as needing upload.
 *
 * Contract with the inspector backend: visible layer roots emit
 * `data-clipper-render-object-id="<frameObject.id>"`. If the lookup misses (first
 * commit before the backend has rendered, layer fully clipped, etc.)
 * we leave the texture untouched — the previous frame keeps showing —
 * rather than crashing the whole render.
 */
const PERELEMENT_VERTEX = `
  ${LAYER_LIGHTING_VERTEX_VARYINGS}
  varying vec2 vUv;
  void main() {
    vUv = uv;
    ${LAYER_LIGHTING_VERTEX_BODY}
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PERELEMENT_FRAGMENT = `
  precision highp float;
  ${LAYER_LIGHTING_FRAGMENT}
  varying vec2 vUv;
  uniform sampler2D u_image;
  uniform float u_alphaCutoff;
  uniform float u_opacity;
  void main() {
    vec4 c = texture2D(u_image, vUv);
    float a = c.a * u_opacity;
    if (a < u_alphaCutoff) discard;
    // Premultiplied output for clean OVER-blend math when the bokeh
    // gather samples this RT with linear filtering across edges.
    gl_FragColor = vec4(c.rgb * layerLightMultiplier() * a, a);
  }
`;

const DEFAULT_ALPHA_CUTOFF = 0.01;
const TEXT_ALPHA_CUTOFF = 0.18;

type PerElementCaptureUniforms = ReturnType<
  typeof createPerElementCaptureUniforms
>;

type DrawElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (
    element: Element,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => unknown;
};

function createPerElementCaptureUniforms(image: unknown, alphaCutoff: number) {
  return {
    u_image: { value: image },
    u_alphaCutoff: { value: alphaCutoff },
    u_opacity: { value: 1 },
    ...createLayerLightingUniforms(),
  };
}

function createPerElementCaptureShaderMaterial(
  image: unknown,
  alphaCutoff: number,
) {
  return new THREE.ShaderMaterial({
    vertexShader: PERELEMENT_VERTEX,
    fragmentShader: PERELEMENT_FRAGMENT,
    uniforms: createPerElementCaptureUniforms(image, alphaCutoff),
    transparent: true,
    premultipliedAlpha: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function createPerElementCaptureNodeMaterial(
  image: unknown,
  alphaCutoff: number,
) {
  const uniforms = createPerElementCaptureUniforms(image, alphaCutoff);
  const lightingNodes = createLayerLightingNodes(uniforms);
  const lightMultiplierNode = createLayerLightMultiplierNode(lightingNodes);
  const imageTextureNode = textureNode(image);
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
    const sample = imageTextureNode.sample(uv());
    const alpha = sample.a.mul(opacityNode);
    alpha.lessThan(alphaCutoffNode).discard();
    return vec4(sample.rgb.mul(lightMultiplierNode).mul(alpha), alpha);
  })();
  material.userData.layerLightingUniforms = uniforms;
  material.userData.layerLightingNodes = lightingNodes;
  material.userData.layerShadowUniforms = uniforms;
  material.userData.layerTextureNode = imageTextureNode;
  material.userData.layerUniformNodes = {
    u_opacity: opacityNode,
    u_alphaCutoff: alphaCutoffNode,
  };
  material.userData.webgpuLayerMaterialPort = "capture-fill";
  return material;
}

function getPerElementCaptureUniforms(material: {
  uniforms?: PerElementCaptureUniforms;
  userData?: { layerLightingUniforms?: unknown };
}): PerElementCaptureUniforms {
  const uniforms =
    material.uniforms ?? material.userData?.layerLightingUniforms;
  return uniforms as PerElementCaptureUniforms;
}

function syncPerElementCaptureNodeUniforms(
  material: {
    userData?: { layerUniformNodes?: Record<string, { value: unknown }> };
  },
  uniforms: PerElementCaptureUniforms,
): void {
  const nodes = material.userData?.layerUniformNodes;
  if (!nodes) return;
  nodes.u_opacity.value = uniforms.u_opacity.value;
  nodes.u_alphaCutoff.value = uniforms.u_alphaCutoff.value;
}

class PerElementCaptureNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly texture: any;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly id: string;
  private readonly kind: FrameObjectType | "default";
  private readonly context: LayerNodeContext;
  private width = 1;
  private height = 1;
  private capturePadding = 0;
  private captureWidth = 1;
  private captureHeight = 1;
  private lastCaptureKey = "";
  private warnedMissing = false;
  private readonly videoFrameCache = new Map<number, HTMLCanvasElement>();

  constructor(
    id: string,
    kind: FrameObjectType | "default",
    context: LayerNodeContext,
  ) {
    this.id = id;
    this.kind = kind;
    this.context = context;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1;
    this.canvas.height = 1;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("PerElementCaptureNode: 2D context unavailable");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = true;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    // The captured pixels hold sRGB-encoded bytes from the DOM render.
    // Mark as sRGB so Three linearises on read and the bokeh gather
    // operates in linear-light space — same convention as the old
    // `CapturePlaneTexture`.
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;

    const alphaCutoff =
      kind === "text" ? TEXT_ALPHA_CUTOFF : DEFAULT_ALPHA_CUTOFF;
    this.material =
      context.materialBackend === "webgpu-node"
        ? createPerElementCaptureNodeMaterial(this.texture, alphaCutoff)
        : createPerElementCaptureShaderMaterial(this.texture, alphaCutoff);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `PerElementCaptureNode:${id}`;
    this.object3D = this.mesh;
  }

  update(state: EvaluatedObjectState): void {
    const t = resolveLayerTransform(state);
    if (t.width !== this.width || t.height !== this.height) {
      this.width = t.width;
      this.height = t.height;
    }
    const capturePadding = estimateCapturePadding(this.kind, state);
    const captureWidth = Math.max(1, Math.ceil(t.width + capturePadding * 2));
    const captureHeight = Math.max(1, Math.ceil(t.height + capturePadding * 2));
    if (
      capturePadding !== this.capturePadding ||
      captureWidth !== this.captureWidth ||
      captureHeight !== this.captureHeight
    ) {
      this.capturePadding = capturePadding;
      this.captureWidth = captureWidth;
      this.captureHeight = captureHeight;
      this.canvas.width = captureWidth;
      this.canvas.height = captureHeight;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(captureWidth, captureHeight);
    }

    this.mesh.position.set(t.positionX, t.positionY, t.positionZ);
    this.mesh.rotation.order = "XYZ";
    this.mesh.rotation.x = t.rotationX;
    this.mesh.rotation.y = t.rotationY;
    this.mesh.rotation.z = t.rotationZ;
    this.mesh.scale.set(t.scaleX, t.scaleY, 1);

    const opacity =
      typeof state.style?.opacity === "number" ? state.style.opacity : 1;
    const uniforms = getPerElementCaptureUniforms(this.material);
    uniforms.u_opacity.value = clamp01(opacity);
    syncPerElementCaptureNodeUniforms(this.material, uniforms);
    applyLayerLightingUniforms(
      this.material,
      this.context.getLighting?.() ?? EMPTY_LAYER_LIGHTING,
    );

    this.captureLayerPixels(createCaptureKey(this.kind, state));
  }

  private captureLayerPixels(captureKey: string): void {
    if (this.kind === "text" && captureKey === this.lastCaptureKey) return;
    const sourceRoot = this.context.sourceRoot();
    if (!sourceRoot) return;
    const layerEl = sourceRoot.querySelector(
      `[data-clipper-render-object-id="${cssEscape(this.id)}"]`,
    );
    if (!layerEl) return;

    const sharedCtx = this.context.sharedCapture
      .context as DrawElementImageContext;
    const drawElementImage = sharedCtx.drawElementImage;
    if (typeof drawElementImage !== "function") return;

    const sharedCanvas = this.context.sharedCapture.canvas;
    if (sharedCanvas.width !== this.captureWidth)
      sharedCanvas.width = this.captureWidth;
    if (sharedCanvas.height !== this.captureHeight)
      sharedCanvas.height = this.captureHeight;
    const captureEl = createCaptureClone(
      layerEl,
      this.width,
      this.height,
      this.capturePadding,
      this.captureWidth,
      this.captureHeight,
      this.videoFrameCache,
    );
    try {
      sharedCanvas.appendChild(captureEl);
      sharedCtx.clearRect(0, 0, this.captureWidth, this.captureHeight);
      drawElementImage.call(
        sharedCtx,
        captureEl,
        0,
        0,
        this.captureWidth,
        this.captureHeight,
      );
      this.ctx.clearRect(0, 0, this.captureWidth, this.captureHeight);
      this.ctx.drawImage(
        sharedCanvas,
        0,
        0,
        this.captureWidth,
        this.captureHeight,
        0,
        0,
        this.captureWidth,
        this.captureHeight,
      );
      this.texture.needsUpdate = true;
      this.material.userData.layerVideoFrameSignature =
        this.kind === "media" ? captureKey : undefined;
      this.lastCaptureKey = captureKey;
    } catch (error) {
      if (!this.warnedMissing) {
        this.warnedMissing = true;
        console.warn(
          `PerElementCaptureNode(${this.id}): drawElementImage failed`,
          error,
        );
      }
    } finally {
      captureEl.remove();
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.videoFrameCache.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function cssEscape(value: string): string {
  // Object IDs are inspector-issued — typically `[a-z0-9-]+`. Use the
  // browser's CSS.escape when available; fall back to a conservative
  // escape so jsdom (no CSS.escape) still works in tests.
  const cssGlobal = (
    globalThis as unknown as { CSS?: { escape?: (s: string) => string } }
  ).CSS;
  if (cssGlobal && typeof cssGlobal.escape === "function")
    return cssGlobal.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function createCaptureClone(
  source: Element,
  width: number,
  height: number,
  padding: number,
  captureWidth: number,
  captureHeight: number,
  videoFrameCache: Map<number, HTMLCanvasElement>,
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  if (!clone.style)
    throw new Error("PerElementCaptureNode: capture source is not HTMLElement");
  copyVideoFramesIntoClone(source, clone, videoFrameCache);
  Object.assign(clone.style, {
    position: "absolute",
    left: `${padding}px`,
    top: `${padding}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: "none",
    transformOrigin: "top left",
    pointerEvents: "none",
    margin: "0",
  } as Partial<CSSStyleDeclaration>);
  clone.removeAttribute("data-object-id");
  if (padding <= 0) return clone;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${captureWidth}px`,
    height: `${captureHeight}px`,
    overflow: "visible",
    pointerEvents: "none",
    margin: "0",
  } as Partial<CSSStyleDeclaration>);
  wrapper.appendChild(clone);
  return wrapper;
}

function copyVideoFramesIntoClone(
  source: Element,
  clone: HTMLElement,
  videoFrameCache: Map<number, HTMLCanvasElement>,
): void {
  if (typeof source.querySelectorAll !== "function") return;
  const sourceVideos = Array.from(source.querySelectorAll("video"));
  if (!sourceVideos.length) return;
  const cloneVideos = Array.from(clone.querySelectorAll("video"));
  for (let index = 0; index < sourceVideos.length; index += 1) {
    const sourceVideo = sourceVideos[index];
    const cloneVideo = cloneVideos[index];
    if (!cloneVideo) continue;
    const frameCanvas = readVideoFrameCanvas(
      sourceVideo,
      index,
      videoFrameCache,
    );
    if (!frameCanvas) continue;
    const replacement = document.createElement("canvas");
    replacement.width = frameCanvas.width;
    replacement.height = frameCanvas.height;
    replacement.className = cloneVideo.className;
    replacement.style.cssText = cloneVideo.style.cssText;
    replacement.draggable = false;
    const replacementContext = replacement.getContext("2d");
    if (!replacementContext) continue;
    replacementContext.drawImage(frameCanvas, 0, 0);
    cloneVideo.replaceWith(replacement);
  }
}

function readVideoFrameCanvas(
  video: HTMLVideoElement,
  index: number,
  videoFrameCache: Map<number, HTMLCanvasElement>,
): HTMLCanvasElement | null {
  const hasFrame =
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0;
  if (!hasFrame) return videoFrameCache.get(index) ?? null;
  const canvas = videoFrameCache.get(index) ?? document.createElement("canvas");
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return videoFrameCache.get(index) ?? null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    videoFrameCache.set(index, canvas);
    return canvas;
  } catch {
    return videoFrameCache.get(index) ?? null;
  }
}

function estimateCapturePadding(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
): number {
  if (kind !== "text") return 0;
  const fontSize =
    typeof state.style?.fontSize === "number" ? state.style.fontSize : 16;
  return Math.ceil(Math.max(8, fontSize * 0.85));
}

function createCaptureKey(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
): string {
  if (kind !== "text") return `${Date.now()}:${Math.random()}`;
  return JSON.stringify({
    width: state.bounds?.width,
    height: state.bounds?.height,
    content: state.content,
    style: {
      color: state.style?.color,
      fontFamily: state.style?.fontFamily,
      fontSize: state.style?.fontSize,
      fontSource: state.style?.fontSource,
      fontStyle: state.style?.fontStyle,
      fontWeight: state.style?.fontWeight,
      letterSpacing: state.style?.letterSpacing,
      lineHeight: state.style?.lineHeight,
      textAlign: state.style?.textAlign,
    },
  });
}

export function createPerElementCaptureFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object: FrameObject, context: LayerNodeContext) {
      return new PerElementCaptureNode(object.id, kind, context);
    },
  };
}
