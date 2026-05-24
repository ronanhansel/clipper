import type { EvaluatedObjectState } from "../../../../core/propertyRegistry";
import type { FrameObject, FrameObjectType } from "../../../../core/types";
import type { SharedCaptureCanvas } from "../SharedCaptureCanvas";
import type { LayerLightingState } from "./layerLighting";

/**
 * One native Three.js node per visible FrameObject.
 *
 * Replaces the v0.2.20 "shared composite + UV-cropped depth-only cards"
 * pattern. Each node owns its own `Object3D` (a textured mesh, a
 * troika-three-text glyph cluster, a per-element capture quad, etc.) and
 * its own pixels at its own scene-space z. The DoF composer pass now
 * sees genuine 3D colour + depth instead of a 2D-flattened composite,
 * which fixes the doubling/ghosting and gives the scatter-as-gather
 * bokeh real per-layer separation to work with.
 */
export interface LayerNode {
  /** The node's root Object3D added to the composition scene. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object3D: any;
  /**
   * Reconcile the node against an evaluated FrameObject for the current
   * `(part, localTime)`. Implementations update bounds, transform,
   * type-specific style, and any internal materials/uniforms.
   */
  update(state: EvaluatedObjectState): void;
  /**
   * Release Three resources owned by this node (geometry, material,
   * textures it allocated, etc.). The caller removes `object3D` from
   * the scene before calling.
   */
  dispose(): void;
}

/**
 * Context made available to factories at node-construction time.
 *
 * - `sourceRoot`: a getter the node calls to find its layer's DOM
 *   subtree (`querySelector('[data-clipper-render-object-id="..."]')`). Per-element
 *   capture nodes use this to grab just their own pixels rather than
 *   sampling a shared 2D-flattened composite — the fix that ends the
 *   v0.2.20 cross-layer ghosting.
 * - `sharedCapture`: the renderer-owned `SharedCaptureCanvas`. Browsers
 *   require the captured element to be a descendant of its `canvas`, so
 *   per-element capture nodes route `drawElementImage` through
 *   `sharedCapture.context` and then blit pixels out of `sharedCapture
 *   .canvas` into their own private canvas.
 * - `requestRender`: schedules a fresh WebGL render when async layer
 *   resources (image decode, SVG rasterization, font atlas updates)
 *   become ready after the current frame has already rendered.
 */
export interface LayerNodeContext {
  sourceRoot: () => Element | null;
  getLighting?: () => LayerLightingState;
  sharedCapture: SharedCaptureCanvas;
  requestRender: () => void;
}

/**
 * Factory that creates a `LayerNode` for a specific FrameObject type.
 * The factory MUST be pure — no DOM access at construction; nodes can
 * lazy-load assets (image textures, fonts) inside their first
 * `update()` if needed.
 */
export interface LayerNodeFactory {
  readonly kind: FrameObjectType | "default";
  create(object: FrameObject, context: LayerNodeContext): LayerNode;
}

const factories = new Map<string, LayerNodeFactory>();

export function registerLayerNodeFactory(factory: LayerNodeFactory): void {
  factories.set(factory.kind, factory);
}

export function getLayerNodeFactory(
  type: FrameObjectType,
): LayerNodeFactory | undefined {
  return factories.get(type) ?? factories.get("default");
}

/** Visible-for-tests view of registered factory keys. */
export function describeLayerNodeRegistry(): string[] {
  return Array.from(factories.keys()).sort();
}

/**
 * Test/reset helper. Production code does NOT call this — factories are
 * registered once at module load via `installDefaultLayerNodeFactories`.
 */
export function clearLayerNodeRegistry(): void {
  factories.clear();
}
