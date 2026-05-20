import * as THREE from "three";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
} from "../../../core/types";
import { evaluateObjectState } from "../../../core/propertyRegistry";

const DEG_TO_RAD = Math.PI / 180;

type LayerCard = {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mesh: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  material: any;
  width: number;
  height: number;
};

const LAYER_VERTEX_SHADER = `
  varying vec2 vUv;
  uniform vec2 u_uvOrigin;
  uniform vec2 u_uvSize;
  void main() {
    vUv = u_uvOrigin + uv * u_uvSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LAYER_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_image;
  uniform float u_alphaCutoff;
  
  void main() {
    vec4 c = texture2D(u_image, vUv);
    // Alpha-test: only write depth for visible pixels
    if (c.a < u_alphaCutoff) discard;
    // DEPTH-ONLY: color writes are disabled imperatively below;
    // the fragment just needs to pass the depth test.
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;

const ALPHA_CUTOFF = 0.01;

/**
 * One depth-only card per visible non-camera FrameObject. These cards
 * write ONLY to the depth attachment — color comes exclusively from the
 * shared background plane. This is the key fix: the original design
 * sampled the composite texture for color AND depth, which caused
 * duplicate stacking because the DoF composer read the composited color
 * from each layer's UV-cropped plane. Now each card's color contribution
 * is suppressed; only depth matters for the DoF CoC calculation.
 */
export class LayerCardSync {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly group: any;

  private cards = new Map<string, LayerCard>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly compositeTexture: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(compositeTexture: any) {
    this.group = new THREE.Group();
    this.group.name = "LayerCardSync";
    this.compositeTexture = compositeTexture;
  }

  sync(part: CompositionClip | null, localTime: number): void {
    const seen = new Set<string>();

    if (part) {
      for (const object of part.objects) {
        if (object.hidden) continue;
        if (object.type === "camera") continue;
        seen.add(object.id);

        const evaluated = evaluateObjectState(object, localTime);
        const transform = evaluated.transform;
        const width = Math.max(1, Math.floor(evaluated.bounds.width));
        const height = Math.max(1, Math.floor(evaluated.bounds.height));

        const translateZ = readNumber(transform, "translateZ", 0);
        const rotateX = readNumber(transform, "rotateX", 0);
        const rotateY = readNumber(transform, "rotateY", 0);
        const rotateZ = readNumber(transform, "rotateZ", 0);
        const scaleX = readNumber(
          transform,
          "scaleX",
          readNumber(transform, "scale", 1),
        );
        const scaleY = readNumber(
          transform,
          "scaleY",
          readNumber(transform, "scale", 1),
        );

        const cx = evaluated.bounds.x - FRAME_WIDTH / 2 + width / 2;
        const cy = -(evaluated.bounds.y - FRAME_HEIGHT / 2 + height / 2);

        let card = this.cards.get(object.id);
        if (!card) {
          card = createCard(object.id, width, height, this.compositeTexture);
          this.cards.set(object.id, card);
          this.group.add(card.mesh);
        } else if (card.width !== width || card.height !== height) {
          resizeCard(card, width, height);
        }

        // UV crop: sample the layer's region from the full composite
        const uOrigin = evaluated.bounds.x / FRAME_WIDTH;
        const vOrigin = 1 - (evaluated.bounds.y + height) / FRAME_HEIGHT;
        const uSize = width / FRAME_WIDTH;
        const vSize = height / FRAME_HEIGHT;
        card.material.uniforms.u_uvOrigin.value.set(uOrigin, vOrigin);
        card.material.uniforms.u_uvSize.value.set(uSize, vSize);

        card.mesh.position.set(cx, cy, translateZ);
        card.mesh.rotation.order = "XYZ";
        card.mesh.rotation.x = -rotateX * DEG_TO_RAD;
        card.mesh.rotation.y = rotateY * DEG_TO_RAD;
        card.mesh.rotation.z = -rotateZ * DEG_TO_RAD;
        card.mesh.scale.set(scaleX, scaleY, 1);
      }
    }

    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      this.group.remove(card.mesh);
      disposeCard(card);
      this.cards.delete(id);
    }
  }

  describeForTests(): { id: string; width: number; height: number }[] {
    return Array.from(this.cards.values()).map((card) => ({
      id: card.id,
      width: card.width,
      height: card.height,
    }));
  }

  clear(): void {
    for (const card of this.cards.values()) {
      this.group.remove(card.mesh);
      disposeCard(card);
    }
    this.cards.clear();
  }

  dispose(): void {
    this.clear();
  }
}

function createCard(
  id: string,
  width: number,
  height: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compositeTexture: any,
): LayerCard {
  const material = new THREE.ShaderMaterial({
    vertexShader: LAYER_VERTEX_SHADER,
    fragmentShader: LAYER_FRAGMENT_SHADER,
    uniforms: {
      u_image: { value: compositeTexture },
      u_alphaCutoff: { value: ALPHA_CUTOFF },
      u_uvOrigin: { value: new THREE.Vector2(0, 0) },
      u_uvSize: { value: new THREE.Vector2(1, 1) },
    },
    transparent: false,
    depthTest: true,
    depthWrite: true,
    colorWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = `LayerCard:${id}`;

  return { id, mesh, material, width, height };
}

function resizeCard(card: LayerCard, width: number, height: number): void {
  card.width = width;
  card.height = height;
  card.mesh.geometry.dispose();
  card.mesh.geometry = new THREE.PlaneGeometry(width, height);
}

function disposeCard(card: LayerCard): void {
  card.mesh.geometry.dispose();
  card.material.dispose();
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
