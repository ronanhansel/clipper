import * as THREE from "three";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";

const BG_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BG_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_image;
  void main() {
    vec3 c = texture2D(u_image, vUv).rgb;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/**
 * A fullscreen-frame plane that fills the depth + colour attachments
 * behind the per-layer cards. Without it, the composer's primary RT is
 * cleared to transparent black wherever no card covers — and the DoF
 * gather pulls those black/zero-alpha pixels into the bokeh average,
 * producing dark fringing along card silhouettes and uneven brightness
 * in blurred regions.
 *
 * The plane samples the same composite `CanvasTexture` the cards crop
 * from, so its colour is exactly the original DOM render. Cards then
 * write their own (typically nearer) regions on top via depth test —
 * the cards always win because the bg plane sits at world z = -1 while
 * cards sit at world z = 0 + translateZ (≥ 0 by default). When camera
 * pans past the frame edge, the area outside the bg plane is still
 * void; that's a follow-up if pannable cameras need it.
 */
export class CompositionBackgroundPlane {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly geometry: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(compositeTexture: any) {
    this.geometry = new THREE.PlaneGeometry(FRAME_WIDTH, FRAME_HEIGHT);
    this.material = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: {
        u_image: { value: compositeTexture },
      },
      depthTest: true,
      depthWrite: true,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "CompositionBackgroundPlane";
    this.mesh.position.set(0, 0, -1);
    // Render before cards so cards win the depth test for their own
    // pixels and the bg plane fills the colour + depth attachments
    // everywhere else.
    this.mesh.renderOrder = -1000;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
