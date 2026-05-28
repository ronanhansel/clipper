import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { Fn, texture as textureNode, uniform, uv, vec4 } from "three/tsl";
import { prepareLiveDomPostProcessSource } from "../../../../../core/effects/postprocess/liveDomCapability";
import { hasVisibleShadow } from "../../../../../core/effects/shadowVisibility";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import {
  type FrameObject,
  type FrameObjectType,
} from "../../../../../core/types";
import type {
  CaptureStatus,
  LayerNode,
  LayerNodeContext,
  LayerNodeFactory,
  LayerNodeUpdateOptions,
} from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";
import {
  createLayerLightingNodes,
  createLayerLightMultiplierNode,
  createLayerLightingUniforms,
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

type CaptureDrawResult = "drawn" | "retry" | "deferred";

type CapturePaddingDeps = {
  kind: FrameObjectType | "default";
  content: unknown;
  width: unknown;
  fontSize: unknown;
  fontWeight: unknown;
  fontStyle: unknown;
  fontFamily: unknown;
  letterSpacing: unknown;
  strokeEnabled: unknown;
  strokeWidth: unknown;
};

type CaptureKeyDeps = {
  kind: FrameObjectType | "default";
  width: unknown;
  height: unknown;
  content: unknown;
  props: unknown;
  background: unknown;
  backgroundColor: unknown;
  border: unknown;
  borderRadius: unknown;
  color: unknown;
  fontFamily: unknown;
  fontSize: unknown;
  fontSource: unknown;
  fontStyle: unknown;
  fontWeight: unknown;
  letterSpacing: unknown;
  lineHeight: unknown;
  textAlign: unknown;
  textBoxLayout: unknown;
};

type CaptureLayoutDeps = {
  width: number;
  height: number;
  padding: number;
  captureKey: string;
  textBoxLayout: string;
  hasActiveShadow: boolean;
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
  lightingEnabled: boolean,
) {
  const colorExpression = lightingEnabled
    ? "c.rgb * layerLightMultiplier() * a"
    : "c.rgb * a";
  return new THREE.ShaderMaterial({
    vertexShader: PERELEMENT_VERTEX,
    fragmentShader: PERELEMENT_FRAGMENT.replace(
      "c.rgb * layerLightMultiplier() * a",
      colorExpression,
    ),
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
  lightingEnabled: boolean,
) {
  const uniforms = createPerElementCaptureUniforms(image, alphaCutoff);
  const lightingNodes = createLayerLightingNodes(uniforms);
  const lightMultiplierNode = lightingEnabled
    ? createLayerLightMultiplierNode(lightingNodes)
    : null;
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
    const rgb = lightMultiplierNode
      ? sample.rgb.mul(lightMultiplierNode).mul(alpha)
      : sample.rgb.mul(alpha);
    return vec4(rgb, alpha);
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

function setPerElementCaptureMaterialTexture(
  material: {
    uniforms?: PerElementCaptureUniforms;
    userData?: Record<string, any>;
  },
  texture: unknown,
): void {
  const uniforms = getPerElementCaptureUniforms(material);
  uniforms.u_image.value = texture;
  const node = material.userData?.layerTextureNode;
  if (node && typeof node === "object" && "value" in node) {
    node.value = texture;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configureCaptureTexture(texture: any): void {
  texture.flipY = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // The captured pixels hold sRGB-encoded bytes from the DOM render.
  // Mark as sRGB so Three linearises on read and the bokeh gather
  // operates in linear-light space.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

class PerElementCaptureNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private texture: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private textureToDisposeAfterReady: any | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly id: string;
  private readonly layerSelector: string;
  private readonly kind: FrameObjectType | "default";
  private readonly context: LayerNodeContext;
  private width = 1;
  private height = 1;
  private layoutWidth = 1;
  private layoutHeight = 1;
  private capturePadding = 0;
  private captureWidth = 1;
  private captureHeight = 1;
  private lastCaptureKey = "";
  private pendingCaptureKey = "";
  private pendingCaptureEl: HTMLElement | null = null;
  private rasterFallbackInFlight = false;
  private warnedMissing = false;
  private readonly videoFrameCache = new Map<number, HTMLCanvasElement>();
  private captureCount = 0;
  private codeDomObservedEl: Element | null = null;
  private codeDomObserver: MutationObserver | null = null;
  private codeDomRevision = 0;
  private layoutObservedEl: Element | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private layoutRevision = 0;
  private layoutRevisionAtRead = -1;
  private captureLayoutDeps: CaptureLayoutDeps | null = null;
  private capturePaddingCache: {
    deps: CapturePaddingDeps;
    padding: number;
  } | null = null;
  private captureKeyCache: { deps: CaptureKeyDeps; key: string } | null = null;

  constructor(
    id: string,
    kind: FrameObjectType | "default",
    context: LayerNodeContext,
  ) {
    this.id = id;
    this.layerSelector = `[data-clipper-render-object-id="${cssEscape(id)}"]`;
    this.kind = kind;
    this.context = context;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1;
    this.canvas.height = 1;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("PerElementCaptureNode: 2D context unavailable");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    configureCaptureTexture(this.texture);
    Object.assign(this.canvas.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);

    const alphaCutoff =
      kind === "text" ? TEXT_ALPHA_CUTOFF : DEFAULT_ALPHA_CUTOFF;
    this.material =
      context.materialBackend === "webgpu-node"
        ? createPerElementCaptureNodeMaterial(this.texture, alphaCutoff, true)
        : createPerElementCaptureShaderMaterial(
            this.texture,
            alphaCutoff,
            true,
          );
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `PerElementCaptureNode:${id}`;
    this.object3D = this.mesh;
  }

  update(
    state: EvaluatedObjectState,
    options?: LayerNodeUpdateOptions,
  ): { captureStatus: CaptureStatus } {
    const t = resolveLayerTransform(state);
    if (t.width !== this.width || t.height !== this.height) {
      this.width = t.width;
      this.height = t.height;
    }

    const capturePadding = this.readCapturePadding(state);
    const captureKey = this.readCaptureKey(state);
    const textBoxLayout = String(state.style?.textBoxLayout ?? "fixed");
    const hasActiveShadow = hasVisibleShadow(state.shadow);
    const layoutDeps = getCaptureLayoutDeps(
      t.width,
      t.height,
      capturePadding,
      captureKey,
      textBoxLayout,
      hasActiveShadow,
    );

    let layoutWidth = this.layoutWidth;
    let layoutHeight = this.layoutHeight;
    let layerEl: HTMLElement | null = null;
    if (!this.canReuseSettledLayout(layoutDeps, captureKey)) {
      layoutWidth = t.width;
      layoutHeight = t.height;
      const sourceRoot = this.context.sourceRoot();
      layerEl = sourceRoot
        ? (sourceRoot.querySelector(this.layerSelector) as HTMLElement | null)
        : null;

      if (layerEl) {
        this.observeCaptureLayout(layerEl);
        this.captureLayoutDeps = layoutDeps;
        this.layoutRevisionAtRead = this.layoutRevision;
      }

      if (layerEl) {
        const isClipped = textBoxLayout === "fixed" && !hasActiveShadow;

        if (isClipped) {
          layoutWidth = layerEl.offsetWidth || t.width;
          layoutHeight = layerEl.offsetHeight || t.height;
        } else {
          layoutWidth =
            Math.max(layerEl.offsetWidth || 0, layerEl.scrollWidth || 0) ||
            t.width;
          layoutHeight =
            Math.max(layerEl.offsetHeight || 0, layerEl.scrollHeight || 0) ||
            t.height;
        }
      }
    }

    this.layoutWidth = layoutWidth;
    this.layoutHeight = layoutHeight;

    const captureWidth = Math.max(
      1,
      Math.ceil(layoutWidth + capturePadding * 2),
    );
    const captureHeight = Math.max(
      1,
      Math.ceil(layoutHeight + capturePadding * 2),
    );
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
      this.canvas.style.width = `${captureWidth}px`;
      this.canvas.style.height = `${captureHeight}px`;
      const previousTexture = this.texture;
      this.texture = new THREE.CanvasTexture(this.canvas);
      configureCaptureTexture(this.texture);
      if (this.lastCaptureKey) {
        this.textureToDisposeAfterReady?.dispose();
        this.textureToDisposeAfterReady = previousTexture;
      } else {
        this.setCurrentMaterialTexture(this.texture);
        previousTexture.dispose();
      }
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(captureWidth, captureHeight);
      this.clearPendingCapture();
      this.captureCount = 0;
      this.captureKeyCache = null;
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
    const isLiveFrame =
      options?.isPlaying === true || options?.quality === "live";
    const frameSensitive = isLiveFrame && isCaptureFrameSensitive(state);
    return {
      captureStatus: this.captureLayerPixels(
        captureKey,
        state,
        layerEl,
        frameSensitive,
      ),
    };
  }

  private readCapturePadding(state: EvaluatedObjectState): number {
    if (this.kind !== "text") return 0;
    const deps = getCapturePaddingDeps(this.kind, state);
    if (
      this.capturePaddingCache &&
      areCapturePaddingDepsEqual(this.capturePaddingCache.deps, deps)
    ) {
      return this.capturePaddingCache.padding;
    }
    const padding = estimateCapturePadding(this.kind, state, this.ctx);
    this.capturePaddingCache = { deps, padding };
    return padding;
  }

  private readCaptureKey(state: EvaluatedObjectState): string {
    if (this.kind === "media") return createCaptureKey(this.kind, state);
    const deps = getCaptureKeyDeps(this.kind, state);
    if (
      this.captureKeyCache &&
      areCaptureKeyDepsEqual(this.captureKeyCache.deps, deps)
    ) {
      return this.captureKeyCache.key;
    }
    const key = createCaptureKey(this.kind, state);
    this.captureKeyCache = { deps, key };
    return key;
  }

  private canReuseSettledLayout(
    layoutDeps: CaptureLayoutDeps,
    captureKey: string,
  ): boolean {
    return (
      this.layoutObserver !== null &&
      this.layoutObservedEl !== null &&
      this.captureLayoutDeps !== null &&
      this.layoutRevisionAtRead === this.layoutRevision &&
      areCaptureLayoutDepsEqual(this.captureLayoutDeps, layoutDeps) &&
      this.canSkipCaptureDom(captureKey)
    );
  }

  private canSkipCaptureDom(
    captureKey: string,
    frameSensitive = false,
  ): boolean {
    if (this.pendingCaptureEl || this.rasterFallbackInFlight) return false;
    if (frameSensitive) return false;
    if (this.kind === "media" || this.captureCount < 5) return false;
    if (this.kind === "code") {
      if (!this.codeDomObservedEl || !this.codeDomObserver) return false;
      return `${captureKey}:${this.codeDomRevision}` === this.lastCaptureKey;
    }
    return captureKey === this.lastCaptureKey;
  }

  private observeCaptureLayout(layerEl: Element): void {
    if (this.layoutObservedEl === layerEl) return;
    this.layoutObserver?.disconnect();
    this.layoutObservedEl = layerEl;
    this.layoutRevision += 1;
    this.layoutRevisionAtRead = -1;
    this.captureLayoutDeps = null;
    this.layoutObserver = null;
    const Observer = globalThis.ResizeObserver;
    if (typeof Observer !== "function") return;
    this.layoutObserver = new Observer(() => {
      this.layoutRevision += 1;
      this.layoutRevisionAtRead = -1;
      this.captureLayoutDeps = null;
      this.captureCount = 0;
      this.context.requestRender();
    });
    this.layoutObserver.observe(layerEl);
  }

  private setCurrentMaterialTexture(texture: unknown): void {
    setPerElementCaptureMaterialTexture(this.material, texture);
  }

  private captureLayerPixels(
    captureKey: string,
    state: EvaluatedObjectState,
    knownLayerEl?: Element | null,
    frameSensitive = false,
  ): CaptureStatus {
    if (this.pendingCaptureEl && this.rasterFallbackInFlight) return "pending";
    if (this.pendingCaptureEl) {
      const result = this.drawPendingCapture();
      if (result === "deferred") return "pending";
      if (result === "retry") {
        this.context.requestRender();
        return "pending";
      }
    }

    if (this.canSkipCaptureDom(captureKey, frameSensitive)) return "ready";

    const layerEl =
      knownLayerEl === undefined
        ? this.context.sourceRoot()?.querySelector(this.layerSelector)
        : knownLayerEl;
    if (!layerEl) return "pending";

    const effectiveCaptureKey =
      this.kind === "code"
        ? `${captureKey}:${this.readCodeLayerDomSignature(layerEl)}`
        : captureKey;

    const isNewKey = effectiveCaptureKey !== this.lastCaptureKey;
    if (!isNewKey && this.captureCount >= 5 && !frameSensitive) {
      return "ready";
    }

    if (isNewKey) {
      this.captureCount = 0;
    }

    const captureCtx = this.ctx as DrawElementImageContext;
    const drawElementImage = captureCtx.drawElementImage;
    if (typeof drawElementImage !== "function") return "failed";

    const sharedCanvas = this.context.sharedCapture.canvas;
    const captureMount = sharedCanvas.parentElement ?? sharedCanvas;
    if (this.canvas.parentNode !== captureMount)
      captureMount.appendChild(this.canvas);
    this.clearPendingCapture();

    const textBoxLayout = String(state.style?.textBoxLayout ?? "fixed");
    const hasActiveShadow = hasVisibleShadow(state.shadow);
    const overflow =
      textBoxLayout === "fixed" && !hasActiveShadow ? "hidden" : "visible";

    this.pendingCaptureEl = createCaptureClone(
      layerEl,
      this.layoutWidth,
      this.layoutHeight,
      this.capturePadding,
      this.captureWidth,
      this.captureHeight,
      this.videoFrameCache,
      overflow,
    );
    this.pendingCaptureKey = effectiveCaptureKey;
    this.canvas.appendChild(this.pendingCaptureEl);
    prepareLiveDomPostProcessSource(this.pendingCaptureEl, this.canvas);
    if (frameSensitive) {
      const result = this.drawPendingCapture();
      if (result === "drawn") return "ready";
      if (result === "deferred") return "pending";
    }
    this.context.requestRender();
    return "pending";
  }

  private drawPendingCapture(): CaptureDrawResult {
    if (!this.pendingCaptureEl) return "drawn";
    const captureCtx = this.ctx as DrawElementImageContext;
    const drawElementImage = captureCtx.drawElementImage;
    if (typeof drawElementImage !== "function") return "drawn";
    try {
      prepareLiveDomPostProcessSource(this.pendingCaptureEl, this.canvas);
      captureCtx.clearRect(0, 0, this.captureWidth, this.captureHeight);
      drawElementImage.call(
        captureCtx,
        this.pendingCaptureEl,
        0,
        0,
        this.captureWidth,
        this.captureHeight,
      );
      this.flushCaptureTexture();
      this.material.userData.layerVideoFrameSignature =
        this.kind === "media" ? this.pendingCaptureKey : undefined;
      if (this.lastCaptureKey === this.pendingCaptureKey) {
        this.captureCount++;
      } else {
        this.captureCount = 1;
      }
      this.lastCaptureKey = this.pendingCaptureKey;
      this.clearPendingCapture();
      return "drawn";
    } catch (error) {
      if (isPaintRecordPending(error)) {
        if (this.kind === "code") {
          this.startForeignObjectRasterFallback(this.pendingCaptureEl);
          return "deferred";
        }
        return "retry";
      }
      if (!this.warnedMissing) {
        this.warnCaptureFailure(error);
      }
      return "retry";
    }
  }

  private clearPendingCapture(): void {
    this.pendingCaptureEl?.remove();
    this.pendingCaptureEl = null;
    this.pendingCaptureKey = "";
    this.rasterFallbackInFlight = false;
  }

  private readCodeLayerDomSignature(layerEl: Element): string {
    if (this.codeDomObservedEl !== layerEl) {
      this.codeDomObserver?.disconnect();
      this.codeDomObservedEl = layerEl;
      this.codeDomRevision += 1;
      this.codeDomObserver = null;
      const Observer = globalThis.MutationObserver;
      if (typeof Observer === "function") {
        this.codeDomObserver = new Observer(() => {
          this.codeDomRevision += 1;
          this.captureCount = 0;
          this.context.requestRender();
        });
        this.codeDomObserver.observe(layerEl, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
      }
    }
    return this.codeDomObserver
      ? String(this.codeDomRevision)
      : getCodeLayerDomSignature(layerEl);
  }

  private startForeignObjectRasterFallback(source: HTMLElement): void {
    if (this.rasterFallbackInFlight) return;
    this.rasterFallbackInFlight = true;
    const image = new Image();
    image.onload = () => {
      try {
        this.ctx.clearRect(0, 0, this.captureWidth, this.captureHeight);
        this.ctx.drawImage(image, 0, 0, this.captureWidth, this.captureHeight);
        this.flushCaptureTexture();
        if (this.lastCaptureKey === this.pendingCaptureKey) {
          this.captureCount++;
        } else {
          this.captureCount = 1;
        }
        this.lastCaptureKey = this.pendingCaptureKey;
        this.clearPendingCapture();
        this.context.requestRender();
      } catch (error) {
        this.rasterFallbackInFlight = false;
        this.warnCaptureFailure(error);
      }
    };
    image.onerror = () => {
      this.rasterFallbackInFlight = false;
      this.warnCaptureFailure(
        new Error("PerElementCaptureNode: code SVG raster fallback failed"),
      );
    };
    image.src = createForeignObjectDataUrl(
      source,
      this.layoutWidth,
      this.layoutHeight,
      this.capturePadding,
      this.captureWidth,
      this.captureHeight,
    );
  }

  private warnCaptureFailure(error: unknown): void {
    if (this.warnedMissing) return;
    this.warnedMissing = true;
    console.warn(
      `PerElementCaptureNode(${this.id}): drawElementImage failed`,
      error,
    );
  }

  private flushCaptureTexture(): void {
    if (this.context.materialBackend !== "webgpu-node") {
      this.texture.needsUpdate = true;
      this.setCurrentMaterialTexture(this.texture);
      this.textureToDisposeAfterReady?.dispose();
      this.textureToDisposeAfterReady = null;
      return;
    }
    const previousTexture = this.texture;
    this.texture = new THREE.CanvasTexture(this.canvas);
    configureCaptureTexture(this.texture);
    this.setCurrentMaterialTexture(this.texture);
    previousTexture.dispose();
    this.textureToDisposeAfterReady?.dispose();
    this.textureToDisposeAfterReady = null;
  }

  dispose(): void {
    this.clearPendingCapture();
    this.codeDomObserver?.disconnect();
    this.codeDomObserver = null;
    this.codeDomObservedEl = null;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    this.layoutObservedEl = null;
    this.canvas.remove();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.textureToDisposeAfterReady?.dispose();
    this.videoFrameCache.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

function isPaintRecordPending(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "InvalidStateError" &&
    error.message.includes("No cached paint record")
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function isCaptureFrameSensitive(state: EvaluatedObjectState): boolean {
  if (state.type === "media" || state.type === "code") return true;
  if (Object.keys(state.tracks ?? {}).length > 0) return true;
  return (
    state.animations?.some((animation) => animation.enabled !== false) === true
  );
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

function getCodeLayerDomSignature(layerEl: Element): string {
  return JSON.stringify({
    childCount: layerEl.childElementCount,
  });
}

function createCaptureClone(
  source: Element,
  width: number,
  height: number,
  padding: number,
  captureWidth: number,
  captureHeight: number,
  videoFrameCache: Map<number, HTMLCanvasElement>,
  overflow: "visible" | "hidden",
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  if (!clone.style)
    throw new Error("PerElementCaptureNode: capture source is not HTMLElement");
  copyImagePixelsIntoClone(source, clone);
  copyCanvasPixelsIntoClone(source, clone);
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
    overflow,
  } as Partial<CSSStyleDeclaration>);
  if (typeof clone.style.setProperty === "function") {
    clone.style.setProperty("overflow", overflow, "important");
  }
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

function copyImagePixelsIntoClone(source: Element, clone: HTMLElement): void {
  if (typeof source.querySelectorAll !== "function") return;
  const sourceImages = Array.from(source.querySelectorAll("img"));
  if (!sourceImages.length) return;
  const cloneImages = Array.from(clone.querySelectorAll("img"));
  for (let index = 0; index < sourceImages.length; index += 1) {
    const sourceImage = sourceImages[index];
    const cloneImage = cloneImages[index];
    if (!cloneImage) continue;
    if (!sourceImage.complete) continue;
    if (sourceImage.naturalWidth <= 0 || sourceImage.naturalHeight <= 0)
      continue;
    const replacement = document.createElement("canvas");
    replacement.width = sourceImage.naturalWidth;
    replacement.height = sourceImage.naturalHeight;
    replacement.style.cssText = cloneImage.style.cssText;
    replacement.className = cloneImage.className;
    const context = replacement.getContext("2d");
    if (!context) continue;
    try {
      context.drawImage(sourceImage, 0, 0);
      cloneImage.replaceWith(replacement);
    } catch {
      // Cross-origin images cannot be copied; keep the cloned image element.
    }
  }
}

function copyCanvasPixelsIntoClone(source: Element, clone: HTMLElement): void {
  if (typeof source.querySelectorAll !== "function") return;
  const sourceCanvases = Array.from(source.querySelectorAll("canvas"));
  if (!sourceCanvases.length) return;
  const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
  for (let index = 0; index < sourceCanvases.length; index += 1) {
    const sourceCanvas = sourceCanvases[index];
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) continue;
    if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) continue;
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    const context = cloneCanvas.getContext("2d");
    if (!context) continue;
    try {
      context.drawImage(sourceCanvas, 0, 0);
    } catch {
      // Tainted canvases cannot be copied; capture the rest of the subtree.
    }
  }
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

function createForeignObjectDataUrl(
  source: HTMLElement,
  width: number,
  height: number,
  padding: number,
  captureWidth: number,
  captureHeight: number,
): string {
  const clone = source.cloneNode(true) as HTMLElement;
  if (!clone.style)
    throw new Error("PerElementCaptureNode: capture source is not HTMLElement");
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  Object.assign(clone.style, {
    position: "relative",
    left: `${padding}px`,
    top: `${padding}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: "none",
    transformOrigin: "top left",
    margin: "0",
  } as Partial<CSSStyleDeclaration>);
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${captureWidth}" height="${captureHeight}"><foreignObject x="0" y="0" width="${captureWidth}" height="${captureHeight}">${markup}</foreignObject></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getCapturePaddingDeps(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
): CapturePaddingDeps {
  return {
    kind,
    content: state.content,
    width: state.bounds?.width,
    fontSize: state.style?.fontSize,
    fontWeight: state.style?.fontWeight,
    fontStyle: state.style?.fontStyle,
    fontFamily: state.style?.fontFamily,
    letterSpacing: state.style?.letterSpacing,
    strokeEnabled: state.stroke?.enabled,
    strokeWidth: state.stroke?.width,
  };
}

function areCapturePaddingDepsEqual(
  a: CapturePaddingDeps,
  b: CapturePaddingDeps,
): boolean {
  return (
    Object.is(a.kind, b.kind) &&
    Object.is(a.content, b.content) &&
    Object.is(a.width, b.width) &&
    Object.is(a.fontSize, b.fontSize) &&
    Object.is(a.fontWeight, b.fontWeight) &&
    Object.is(a.fontStyle, b.fontStyle) &&
    Object.is(a.fontFamily, b.fontFamily) &&
    Object.is(a.letterSpacing, b.letterSpacing) &&
    Object.is(a.strokeEnabled, b.strokeEnabled) &&
    Object.is(a.strokeWidth, b.strokeWidth)
  );
}

function getCaptureLayoutDeps(
  width: number,
  height: number,
  padding: number,
  captureKey: string,
  textBoxLayout: string,
  hasActiveShadow: boolean,
): CaptureLayoutDeps {
  return {
    width,
    height,
    padding,
    captureKey,
    textBoxLayout,
    hasActiveShadow,
  };
}

function areCaptureLayoutDepsEqual(
  a: CaptureLayoutDeps,
  b: CaptureLayoutDeps,
): boolean {
  return (
    Object.is(a.width, b.width) &&
    Object.is(a.height, b.height) &&
    Object.is(a.padding, b.padding) &&
    Object.is(a.captureKey, b.captureKey) &&
    Object.is(a.textBoxLayout, b.textBoxLayout) &&
    Object.is(a.hasActiveShadow, b.hasActiveShadow)
  );
}

function estimateCapturePadding(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
  context: CanvasRenderingContext2D,
): number {
  if (kind !== "text") return 0;
  const fontSize =
    typeof state.style?.fontSize === "number" ? state.style.fontSize : 16;
  const strokeWidth =
    state.stroke?.enabled === true && typeof state.stroke.width === "number"
      ? Math.max(0, state.stroke.width)
      : 0;
  return Math.ceil(
    Math.max(
      8,
      fontSize * 0.85,
      strokeWidth + 2,
      estimateTextOverflowPadding(state, context),
    ),
  );
}

function estimateTextOverflowPadding(
  state: EvaluatedObjectState,
  context: CanvasRenderingContext2D,
): number {
  if (typeof context.measureText !== "function") return 0;
  const text = typeof state.content === "string" ? state.content : "";
  if (!text) return 0;
  const width =
    typeof state.bounds?.width === "number" &&
    Number.isFinite(state.bounds.width)
      ? Math.max(1, state.bounds.width)
      : 1;
  const fontSize =
    typeof state.style?.fontSize === "number" ? state.style.fontSize : 16;
  const fontWeight = state.style?.fontWeight ?? 400;
  const fontStyle =
    typeof state.style?.fontStyle === "string" ? state.style.fontStyle : "";
  const fontFamily =
    typeof state.style?.fontFamily === "string" && state.style.fontFamily.trim()
      ? state.style.fontFamily
      : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  context.font = `${fontStyle ? `${fontStyle} ` : ""}${fontWeight} ${fontSize}px ${fontFamily}`;
  const letterSpacing =
    typeof state.style?.letterSpacing === "number"
      ? Math.max(0, state.style.letterSpacing)
      : 0;
  const longestLineWidth = text
    .split(/\r\n|\r|\n/)
    .reduce(
      (maxWidth, line) =>
        Math.max(
          maxWidth,
          context.measureText(line).width + letterSpacing * line.length,
        ),
      0,
    );
  return Math.max(0, longestLineWidth - width);
}

function getCaptureKeyDeps(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
): CaptureKeyDeps {
  return {
    kind,
    width: state.bounds?.width,
    height: state.bounds?.height,
    content: state.content,
    props: state.props,
    background: state.style?.background,
    backgroundColor: state.style?.backgroundColor,
    border: state.style?.border,
    borderRadius: state.style?.borderRadius,
    color: state.style?.color,
    fontFamily: state.style?.fontFamily,
    fontSize: state.style?.fontSize,
    fontSource: state.style?.fontSource,
    fontStyle: state.style?.fontStyle,
    fontWeight: state.style?.fontWeight,
    letterSpacing: state.style?.letterSpacing,
    lineHeight: state.style?.lineHeight,
    textAlign: state.style?.textAlign,
    textBoxLayout: state.style?.textBoxLayout,
  };
}

function areCaptureKeyDepsEqual(a: CaptureKeyDeps, b: CaptureKeyDeps): boolean {
  return (
    Object.is(a.kind, b.kind) &&
    Object.is(a.width, b.width) &&
    Object.is(a.height, b.height) &&
    Object.is(a.content, b.content) &&
    Object.is(a.props, b.props) &&
    Object.is(a.background, b.background) &&
    Object.is(a.backgroundColor, b.backgroundColor) &&
    Object.is(a.border, b.border) &&
    Object.is(a.borderRadius, b.borderRadius) &&
    Object.is(a.color, b.color) &&
    Object.is(a.fontFamily, b.fontFamily) &&
    Object.is(a.fontSize, b.fontSize) &&
    Object.is(a.fontSource, b.fontSource) &&
    Object.is(a.fontStyle, b.fontStyle) &&
    Object.is(a.fontWeight, b.fontWeight) &&
    Object.is(a.letterSpacing, b.letterSpacing) &&
    Object.is(a.lineHeight, b.lineHeight) &&
    Object.is(a.textAlign, b.textAlign) &&
    Object.is(a.textBoxLayout, b.textBoxLayout)
  );
}

function createCaptureKey(
  kind: FrameObjectType | "default",
  state: EvaluatedObjectState,
): string {
  if (kind === "media") {
    return `${Date.now()}:${Math.random()}`;
  }
  return JSON.stringify({
    kind,
    width: state.bounds?.width,
    height: state.bounds?.height,
    content: state.content,
    props: state.props,
    style: {
      background: state.style?.background,
      backgroundColor: state.style?.backgroundColor,
      border: state.style?.border,
      borderRadius: state.style?.borderRadius,
      color: state.style?.color,
      fontFamily: state.style?.fontFamily,
      fontSize: state.style?.fontSize,
      fontSource: state.style?.fontSource,
      fontStyle: state.style?.fontStyle,
      fontWeight: state.style?.fontWeight,
      letterSpacing: state.style?.letterSpacing,
      lineHeight: state.style?.lineHeight,
      textAlign: state.style?.textAlign,
      textBoxLayout: state.style?.textBoxLayout,
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
