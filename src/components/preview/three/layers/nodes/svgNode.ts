import * as THREE from "three";
// SVGLoader ships no bundled type declarations on three@0.184; the
// project's `src/types/three.d.ts` already declares `module "three"` as
// any, but the addons path needs its own ambient.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no types for `three/examples/jsm/loaders/SVGLoader.js`
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNode, LayerNodeFactory } from "../layerNodeRegistry";
import { resolveLayerTransform } from "../layerTransform";

/**
 * Native SVG layer node. Replaces the per-element DOM-capture fallback
 * for `svg` FrameObjects so vector content stays sharp at any zoom and
 * integrates correctly with 3D depth + DoF.
 *
 * Pipeline: resolve a source string from the layer (URL or inline
 * markup), parse it once via `THREE.SVGLoader`, and build one
 * `ShapeGeometry` mesh per fill plus one stroke mesh per sub-path. All
 * meshes live under a private `pathsContainer` so we can rebuild without
 * disturbing the wrapper's layer transform.
 */

type SvgViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type ParsedSvg = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paths: any[];
  viewBox: SvgViewBox;
};

const parseCache = new Map<string, Promise<ParsedSvg>>();

const VIEWBOX_RE = /viewBox\s*=\s*"([^"]+)"/i;
const WIDTH_RE = /\bwidth\s*=\s*"([\d.]+)/i;
const HEIGHT_RE = /\bheight\s*=\s*"([\d.]+)/i;
const SVG_TAG_RE = /<svg[\s>]/i;
const SVG_PATH_Z_STEP = 0.01;

function looksLikeInlineMarkup(input: string): boolean {
  return SVG_TAG_RE.test(input);
}

async function loadSvgText(input: string): Promise<string> {
  // Inline markup contains `<svg`; everything else (http(s), data:,
  // bare or absolute path) is fed to `fetch`, which already speaks all
  // three schemes uniformly.
  if (looksLikeInlineMarkup(input)) return input;
  const response = await fetch(input);
  return response.text();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveViewBox(markup: string, paths: any[]): SvgViewBox {
  const vb = VIEWBOX_RE.exec(markup);
  if (vb) {
    const parts = vb[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: Math.max(1, parts[2]),
        height: Math.max(1, parts[3]),
      };
    }
  }
  const widthMatch = WIDTH_RE.exec(markup);
  const heightMatch = HEIGHT_RE.exec(markup);
  if (widthMatch && heightMatch) {
    const w = Number(widthMatch[1]);
    const h = Number(heightMatch[1]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { minX: 0, minY: 0, width: w, height: h };
    }
  }
  return computeBoundsFromPaths(paths);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeBoundsFromPaths(paths: any[]): SvgViewBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    const subPaths = path.subPaths ?? [];
    for (const subPath of subPaths) {
      const points =
        typeof subPath.getPoints === "function" ? subPath.getPoints() : [];
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export async function getOrLoadSvg(input: string): Promise<ParsedSvg> {
  const cached = parseCache.get(input);
  if (cached) return cached;
  const promise = (async () => {
    const text = await loadSvgText(input);
    const loader = new SVGLoader();
    const result = loader.parse(text);
    return { paths: result.paths, viewBox: deriveViewBox(text, result.paths) };
  })();
  parseCache.set(input, promise);
  try {
    return await promise;
  } catch (error) {
    parseCache.delete(input);
    throw error;
  }
}

type MaterialEntry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  material: any;
  baseOpacity: number;
  baseDepthWrite: boolean;
};

class SvgNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly wrapper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly pathsContainer: any;
  private readonly id: string;
  private readonly materialEntries: MaterialEntry[] = [];
  private currentSrc: string | null = null;
  private parsed: ParsedSvg | null = null;
  private currentOpacity = 1;
  private warnedFailure = false;

  constructor(id: string) {
    this.id = id;
    this.wrapper = new THREE.Group();
    this.wrapper.name = `SvgNode:${id}`;
    this.pathsContainer = new THREE.Group();
    this.pathsContainer.name = `SvgNode:${id}:paths`;
    this.wrapper.add(this.pathsContainer);
    this.object3D = this.wrapper;
  }

  update(state: EvaluatedObjectState): void {
    const t = resolveLayerTransform(state);
    this.wrapper.position.set(t.positionX, t.positionY, t.positionZ);
    this.wrapper.rotation.order = "XYZ";
    this.wrapper.rotation.x = t.rotationX;
    this.wrapper.rotation.y = t.rotationY;
    this.wrapper.rotation.z = t.rotationZ;
    this.wrapper.scale.set(t.scaleX, t.scaleY, 1);

    const opacity = clamp01(
      typeof state.style?.opacity === "number" ? state.style.opacity : 1,
    );
    this.currentOpacity = opacity;
    this.applyOpacity();

    const src = resolveSvgSource(state);
    if (src !== this.currentSrc) {
      this.currentSrc = src;
      this.parsed = null;
      this.disposePathChildren();
      if (src) this.requestLoad(src);
    }

    if (this.parsed) this.applyFitTransform(t.width, t.height);
  }

  private requestLoad(src: string): void {
    getOrLoadSvg(src)
      .then((parsed) => {
        if (this.currentSrc !== src) return;
        this.parsed = parsed;
        this.rebuildMeshes(parsed);
        this.applyOpacity();
      })
      .catch((error) => {
        if (this.warnedFailure) return;
        this.warnedFailure = true;
        console.warn(`SvgNode(${this.id}): failed to load SVG`, error);
      });
  }

  private rebuildMeshes(parsed: ParsedSvg): void {
    this.disposePathChildren();
    let drawIndex = 0;
    for (const path of parsed.paths) {
      const style = (path.userData && path.userData.style) || {};
      const fillOpacity =
        typeof style.fillOpacity === "number" ? style.fillOpacity : 1;
      if (style.fill && style.fill !== "none") {
        const shapes = path.toShapes(true);
        if (shapes && shapes.length > 0) {
          const depthWrite = fillOpacity >= 1;
          const geometry = new THREE.ShapeGeometry(shapes);
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(style.fill),
            transparent: fillOpacity < 1,
            opacity: fillOpacity,
            depthWrite,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.z = drawIndex * SVG_PATH_Z_STEP;
          this.pathsContainer.add(mesh);
          this.materialEntries.push({
            material,
            baseOpacity: fillOpacity,
            baseDepthWrite: depthWrite,
          });
          drawIndex += 1;
        }
      }

      const strokeWidth =
        typeof style.strokeWidth === "number" ? style.strokeWidth : 1;
      const strokeOpacity =
        typeof style.strokeOpacity === "number" ? style.strokeOpacity : 1;
      if (style.stroke && style.stroke !== "none" && strokeWidth > 0) {
        for (const subPath of path.subPaths ?? []) {
          const points = subPath.getPoints();
          const geometry = SVGLoader.pointsToStroke(points, style);
          if (!geometry) continue;
          const depthWrite = strokeOpacity >= 1;
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(style.stroke),
            transparent: strokeOpacity < 1,
            opacity: strokeOpacity,
            depthWrite,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.z = drawIndex * SVG_PATH_Z_STEP;
          this.pathsContainer.add(mesh);
          this.materialEntries.push({
            material,
            baseOpacity: strokeOpacity,
            baseDepthWrite: depthWrite,
          });
          drawIndex += 1;
        }
      }
    }
  }

  private applyFitTransform(layerWidth: number, layerHeight: number): void {
    if (!this.parsed) return;
    const vb = this.parsed.viewBox;
    // `meet` (preserveAspectRatio default): uniform scale that fits the
    // viewBox inside the layer with no cropping.
    const fit = Math.min(layerWidth / vb.width, layerHeight / vb.height);
    // SVG y-down → Three y-up: negate scale.y so glyphs render upright.
    this.pathsContainer.scale.set(fit, -fit, 1);
    // Anchor (vb.minX, vb.minY) at the wrapper's top-left (-w/2, +h/2).
    // With scale (fit, -fit), a vertex (x, y) lands at (px + x*fit, py - y*fit);
    // solving for the anchor gives the position below.
    this.pathsContainer.position.set(
      -layerWidth / 2 - vb.minX * fit,
      layerHeight / 2 + vb.minY * fit,
      0,
    );
  }

  private applyOpacity(): void {
    const o = this.currentOpacity;
    for (const entry of this.materialEntries) {
      const opacity = entry.baseOpacity * o;
      const transparent = opacity < 1;
      const depthWrite = entry.baseDepthWrite && !transparent;
      const needsUpdate =
        entry.material.transparent !== transparent ||
        entry.material.depthWrite !== depthWrite;
      entry.material.opacity = opacity;
      entry.material.transparent = transparent;
      entry.material.depthWrite = depthWrite;
      if (needsUpdate) entry.material.needsUpdate = true;
    }
  }

  private disposePathChildren(): void {
    for (const child of this.pathsContainer.children.slice()) {
      this.pathsContainer.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this.materialEntries.length = 0;
  }

  dispose(): void {
    this.disposePathChildren();
  }
}

function resolveSvgSource(state: EvaluatedObjectState): string | null {
  // Brief priority: prefer `style.src` (URL) when present; otherwise
  // fall back to the FrameObject's `content` field, which holds inline
  // markup for compose-drawn svgs.
  const styleSrc = state.style?.src;
  if (typeof styleSrc === "string" && styleSrc.length > 0) return styleSrc;
  const content = state.content;
  if (typeof content === "string" && content.length > 0) return content;
  return null;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export const svgNodeFactory: LayerNodeFactory = {
  kind: "svg",
  create(object: FrameObject) {
    return new SvgNode(object.id);
  },
};
