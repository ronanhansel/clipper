import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject, FrameObjectType } from "../../../../../core/types";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../../../core/types";
import type {
  LayerNode,
  LayerNodeContext,
  LayerNodeFactory,
} from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";

/**
 * Per-FrameObject capture fallback. Used for types that don't yet have
 * a native Three node implementation (text, image, svg, html, code,
 * pattern2d, template, custom-renderer).
 *
 * Behaviour: UV-crops into the shared composite texture owned by
 * `CompositionRenderer`. Each plane samples just its layer's region of
 * the captured DOM image, with alpha-tested depth writes. This still
 * has cross-layer ghosting for layers that overlap in 2D bounds
 * (because `drawElementImage` requires the source element to be an
 * immediate child of the canvas — only the source root qualifies, so
 * we can't capture individual layers). Phases 2/3 replace text/image
 * with native nodes, eliminating the most common ghost cases.
 */
const FALLBACK_VERTEX = `
  varying vec2 vUv;
  uniform vec2 u_uvOrigin;
  uniform vec2 u_uvSize;
  void main() {
    vUv = u_uvOrigin + uv * u_uvSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FALLBACK_FRAGMENT = `
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
    // gather samples this RT with linear filtering across glyph edges.
    gl_FragColor = vec4(c.rgb * a, a);
  }
`;

const ALPHA_CUTOFF = 0.01;

class CaptureFallbackNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  private width = 1;
  private height = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(id: string, compositeTexture: any) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FALLBACK_VERTEX,
      fragmentShader: FALLBACK_FRAGMENT,
      uniforms: {
        u_image: { value: compositeTexture },
        u_alphaCutoff: { value: ALPHA_CUTOFF },
        u_opacity: { value: 1 },
        u_uvOrigin: { value: new THREE.Vector2(0, 0) },
        u_uvSize: { value: new THREE.Vector2(1, 1) },
      },
      transparent: false,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = `CaptureFallbackNode:${id}`;
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

    // UV-crop into the shared composite. The composite's flipY is
    // inherited from CapturePlaneTexture, so v=0 is the bottom of the
    // image; convert from DOM y-down accordingly.
    const u = this.material.uniforms;
    u.u_uvOrigin.value.set(
      state.bounds.x / FRAME_WIDTH,
      1 - (state.bounds.y + t.height) / FRAME_HEIGHT,
    );
    u.u_uvSize.value.set(t.width / FRAME_WIDTH, t.height / FRAME_HEIGHT);

    const opacity =
      typeof state.style?.opacity === "number" ? state.style.opacity : 1;
    u.u_opacity.value = clamp01(opacity);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Build a `LayerNodeFactory` for a single FrameObject type that uses
 * the shared-composite UV-crop fallback.
 */
export function createCaptureFallbackFactory(
  kind: FrameObjectType | "default",
): LayerNodeFactory {
  return {
    kind,
    create(object: FrameObject, context: LayerNodeContext) {
      return new CaptureFallbackNode(object.id, context.compositeTexture);
    },
  };
}
