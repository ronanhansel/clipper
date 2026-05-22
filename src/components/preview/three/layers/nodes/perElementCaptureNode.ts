import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject, FrameObjectType } from "../../../../../core/types";
import type {
  LayerNode,
  LayerNodeContext,
  LayerNodeFactory,
} from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";

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
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PERELEMENT_FRAGMENT = `
  precision highp float;
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
    gl_FragColor = vec4(c.rgb * a, a);
  }
`;

const ALPHA_CUTOFF = 0.01;

type DrawElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (
    element: Element,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => unknown;
};

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
  private readonly context: LayerNodeContext;
  private width = 1;
  private height = 1;
  private warnedMissing = false;

  constructor(id: string, context: LayerNodeContext) {
    this.id = id;
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

    this.material = new THREE.ShaderMaterial({
      vertexShader: PERELEMENT_VERTEX,
      fragmentShader: PERELEMENT_FRAGMENT,
      uniforms: {
        u_image: { value: this.texture },
        u_alphaCutoff: { value: ALPHA_CUTOFF },
        u_opacity: { value: 1 },
      },
      transparent: false,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `PerElementCaptureNode:${id}`;
    this.object3D = this.mesh;
  }

  update(state: EvaluatedObjectState): void {
    const t = resolveLayerTransform(state);
    if (t.width !== this.width || t.height !== this.height) {
      this.width = t.width;
      this.height = t.height;
      this.canvas.width = t.width;
      this.canvas.height = t.height;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(t.width, t.height);
    }

    this.mesh.position.set(t.positionX, t.positionY, t.positionZ);
    this.mesh.rotation.order = "XYZ";
    this.mesh.rotation.x = t.rotationX;
    this.mesh.rotation.y = t.rotationY;
    this.mesh.rotation.z = t.rotationZ;
    this.mesh.scale.set(t.scaleX, t.scaleY, 1);

    const opacity =
      typeof state.style?.opacity === "number" ? state.style.opacity : 1;
    this.material.uniforms.u_opacity.value = clamp01(opacity);

    this.captureLayerPixels();
  }

  private captureLayerPixels(): void {
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
    const captureEl = createCaptureClone(layerEl, this.width, this.height);
    try {
      sharedCanvas.appendChild(captureEl);
      sharedCtx.clearRect(0, 0, this.width, this.height);
      drawElementImage.call(
        sharedCtx,
        captureEl,
        0,
        0,
        this.width,
        this.height,
      );
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(
        sharedCanvas,
        0,
        0,
        this.width,
        this.height,
        0,
        0,
        this.width,
        this.height,
      );
      this.texture.needsUpdate = true;
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
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  if (!clone.style)
    throw new Error("PerElementCaptureNode: capture source is not HTMLElement");
  Object.assign(clone.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${width}px`,
    height: `${height}px`,
    transform: "none",
    transformOrigin: "top left",
    pointerEvents: "none",
    margin: "0",
  } as Partial<CSSStyleDeclaration>);
  clone.removeAttribute("data-object-id");
  return clone;
}

export function createPerElementCaptureFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object: FrameObject, context: LayerNodeContext) {
      return new PerElementCaptureNode(object.id, context);
    },
  };
}
