import type { FrameObject } from "../../../../core/types";

/**
 * A FrameObjectAdapter is the bridge between Clipper's flat `FrameObject`
 * model and Three.js scene-graph nodes. Each adapter owns:
 *   - one root `Object3D` it returns from `mount()`
 *   - the lifecycle of any GPU resources it creates (textures, materials,
 *     geometries) — released in `dispose()`
 *
 * `update()` is called every render with the current FrameObject state and
 * the resolved `localTime`; the adapter mutates its scene-graph node in
 * place (no allocation) so repeated frames are cheap.
 *
 * Adapters live in `./` next to this file once implemented (Phase 4+).
 */
export interface FrameObjectAdapter {
  /** Stable id from the source FrameObject; used for diffing. */
  readonly id: string;
  /** Root Three.js Object3D this adapter owns. */
  readonly object3D: unknown; // typed as any; THREE module is untyped in this repo
  /** Apply the latest FrameObject + time to the adapter's scene-graph node. */
  update(object: FrameObject, localTime: number): void;
  /** Release GPU resources. Called when the object is removed or the
   *  composition is unmounted. */
  dispose(): void;
}

/**
 * Factory called by the renderer when a new FrameObject appears in the
 * composition. Implementations dispatch on `object.type`.
 *
 * Phase 3 ships only the registry interface; Phase 4 ships
 * Image/Video/etc. factories. Returning `null` means "this adapter does
 * not handle this object type"; the renderer skips it.
 */
export type FrameObjectAdapterFactory = (
  object: FrameObject,
) => FrameObjectAdapter | null;
