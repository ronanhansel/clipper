import * as THREE from "three";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type FrameObject,
} from "../../../../core/types";
import type { FrameObjectAdapter, FrameObjectAdapterFactory } from "./types";

const TEXTURE_LOADER = new THREE.TextureLoader();

const URL_REGEX = /url\(["']?([^"')]+)["']?\)/i;

function parseBackgroundImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = URL_REGEX.exec(value);
  return match ? match[1] : null;
}

function parseColor(value: unknown): { color: number; alpha: number } {
  if (typeof value !== "string") return { color: 0xffffff, alpha: 1 };
  const trimmed = value.trim();
  if (trimmed === "transparent") return { color: 0x000000, alpha: 0 };
  // CSS rgb()/rgba()
  const rgbMatch = /rgba?\(([^)]+)\)/i.exec(trimmed);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    const r = Number(parts[0]) || 0;
    const g = Number(parts[1]) || 0;
    const b = Number(parts[2]) || 0;
    const a = parts.length === 4 ? Number(parts[3]) : 1;
    return {
      color: ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff),
      alpha: Number.isFinite(a) ? a : 1,
    };
  }
  // Hex #rgb / #rrggbb / #rrggbbaa
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { color: (r << 16) | (g << 8) | b, alpha: 1 };
    }
    if (hex.length === 6) {
      return { color: parseInt(hex, 16), alpha: 1 };
    }
    if (hex.length === 8) {
      const rgb = parseInt(hex.slice(0, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return { color: rgb, alpha: a };
    }
  }
  return { color: 0xffffff, alpha: 1 };
}

// Exposed for unit tests; not part of the public adapter surface.
export const __testing = {
  parseBackgroundImageUrl,
  parseColor,
};

/**
 * Render a `rect` or `image` FrameObject as a flat Three.js plane.
 *
 * Geometry is a 1×1 unit `PlaneGeometry`; the plane is sized via mesh.scale
 * and positioned via mesh.position, so we never re-allocate geometry on
 * size changes.
 *
 * Coordinate mapping (frame-space → Three-space):
 *   - frame origin is top-left (y-down). Three world is y-up.
 *   - We place the plane so its CENTER lands at the bounds midpoint in
 *     frame-centered, y-flipped coords:
 *       cx = bounds.x + bounds.width / 2 - FRAME_WIDTH / 2
 *       cy = -(bounds.y + bounds.height / 2 - FRAME_HEIGHT / 2)
 *     This puts (0,0,0) at the frame center, matching the Phase 1 camera
 *     defaults.
 *
 * Z (depth) is always 0 in v1. The `space: "3d"` toggle (Phase 8) will
 * unlock per-object z translation; until then every plane sits flat.
 */
export class RectImageAdapter implements FrameObjectAdapter {
  readonly id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private geometry: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private material: any;
  private currentTextureUrl: string | null = null;

  constructor(object: FrameObject) {
    this.id = object.id;
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    this.object3D = new THREE.Mesh(this.geometry, this.material);
    this.object3D.name = `clipper-${object.type}-${object.id}`;
    this.update(object, 0);
  }

  update(object: FrameObject, _localTime: number): void {
    if (object.hidden) {
      this.object3D.visible = false;
      return;
    }
    this.object3D.visible = true;

    // Position + size from bounds.
    const w = Math.max(0, object.bounds.width);
    const h = Math.max(0, object.bounds.height);
    const cx = object.bounds.x + w / 2 - FRAME_WIDTH / 2;
    const cy = -(object.bounds.y + h / 2 - FRAME_HEIGHT / 2);
    this.object3D.position.set(cx, cy, 0);
    // PlaneGeometry is 1×1 by default, so scale = pixel size.
    this.object3D.scale.set(Math.max(1, w), Math.max(1, h), 1);

    // Color + alpha from style.
    const { color, alpha } = parseColor(object.style.backgroundColor);
    const opacityRaw = object.style.opacity;
    const opacity =
      typeof opacityRaw === "number" && Number.isFinite(opacityRaw)
        ? Math.max(0, Math.min(1, opacityRaw))
        : 1;
    this.material.color.setHex(color);

    // If a background-image URL is present, the plane's opacity is driven
    // by the texture (so transparent-bg + image still renders fully). When
    // there is no texture, the plane uses the parsed background-color
    // alpha. This matches DOM rendering of `background-color: transparent;
    // background-image: url(...)`.
    const url = parseBackgroundImageUrl(object.style.backgroundImage);
    const baseAlpha = url ? 1 : alpha;
    this.material.opacity = baseAlpha * opacity;

    // Texture from style.backgroundImage (rect+image both supported).
    if (url !== this.currentTextureUrl) {
      // Drop old texture, if any.
      if (this.material.map) {
        this.material.map.dispose();
        this.material.map = null;
      }
      this.currentTextureUrl = url;
      if (url) {
        TEXTURE_LOADER.load(
          url,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tex: any) => {
            // Plane uvs flip to match DOM image orientation (origin top-left).
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = true;
            this.material.map = tex;
            this.material.color.setHex(0xffffff);
            this.material.opacity = opacity;
            this.material.needsUpdate = true;
          },
          undefined,
          () => {
            // On load error, drop back to color-only.
            this.material.map = null;
            this.material.needsUpdate = true;
          },
        );
      } else {
        this.material.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    if (this.material.map) {
      this.material.map.dispose();
      this.material.map = null;
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Factory that handles `rect` and `image` types. Returns `null` for any
 * other type so the renderer can fall through to other factories.
 */
export const rectImageAdapterFactory: FrameObjectAdapterFactory = (object) => {
  if (object.type === "rect" || object.type === "image") {
    return new RectImageAdapter(object);
  }
  return null;
};
