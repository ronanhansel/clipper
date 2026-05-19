import type { FrameObjectAdapterFactory } from "./types";
import { rectImageAdapterFactory } from "./RectImageAdapter";

/**
 * Default adapter set used by `CompositionRenderer` consumers.
 *
 * Order matters: factories are tried in order; the first non-null wins.
 * Phase 4 ships only the rect/image plane adapter. Later phases (text,
 * svg, html via canvas2d rasterization; mesh/model for 3D) prepend or
 * append entries here.
 */
export const DEFAULT_FRAME_OBJECT_ADAPTERS: FrameObjectAdapterFactory[] = [
  rectImageAdapterFactory,
];

export { rectImageAdapterFactory } from "./RectImageAdapter";
export type { FrameObjectAdapter, FrameObjectAdapterFactory } from "./types";
