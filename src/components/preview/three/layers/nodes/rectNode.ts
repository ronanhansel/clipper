import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNode, LayerNodeFactory } from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";
import { parseCssColorToLinearRgba } from "../color/parseCssColor";

const RECT_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RECT_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform vec4 u_color;            // linear RGBA premultiplied alpha
  uniform vec2 u_size;             // px
  uniform float u_radius;          // px
  uniform float u_opacity;
  uniform float u_alphaCutoff;

  // Signed distance to a rounded box centred at origin with half-extents h
  // and corner radius r. Negative inside, positive outside, zero on edge.
  float roundedBoxSdf(vec2 p, vec2 h, float r) {
    vec2 q = abs(p) - h + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 px = (vUv - 0.5) * u_size;          // pixel coords centred at 0
    vec2 half = u_size * 0.5;
    float r = clamp(u_radius, 0.0, min(half.x, half.y));
    float d = roundedBoxSdf(px, half, r);
    // 1 px AA along the edge.
    float coverage = clamp(0.5 - d, 0.0, 1.0);
    float a = u_color.a * u_opacity * coverage;
    if (a < u_alphaCutoff) discard;
    // Premultiplied output. The rect body is a flat colour for now;
    // gradient/stroke/shadow are phase 1.5.
    gl_FragColor = vec4(u_color.rgb * a, a);
  }
`;

const ALPHA_CUTOFF = 0.01;

class RectNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  private width = 1;
  private height = 1;

  constructor(id: string) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: RECT_VERTEX,
      fragmentShader: RECT_FRAGMENT,
      uniforms: {
        u_color: { value: new THREE.Vector4(0, 0, 0, 1) },
        u_size: { value: new THREE.Vector2(1, 1) },
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
    this.mesh.name = `RectNode:${id}`;
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

    // Background colour. v1 supports CSS colour strings only; gradient
    // FillValues are flattened to a transparent shader output (the
    // background appears empty) until phase 1.5 lands gradient sampling.
    const bg = state.style?.backgroundColor ?? state.style?.color;
    const rgba = typeof bg === "string" ? parseCssColorToLinearRgba(bg) : null;
    if (rgba) {
      u.u_color.value.set(rgba.r, rgba.g, rgba.b, rgba.a);
    } else {
      u.u_color.value.set(0, 0, 0, 0);
    }

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

export const rectNodeFactory: LayerNodeFactory = {
  kind: "rect",
  create(object: FrameObject) {
    return new RectNode(object.id);
  },
};
