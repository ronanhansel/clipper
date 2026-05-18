/**
 * `RasterBackend` is the Direct-mode backend: it treats the composition as a
 * sealed flat output rather than a live React tree of editable objects.
 *
 * Today it ships as a *non-interactive* `DomBackend` wrapped in a
 * `pointer-events: none` shell. That achieves the architectural seal Direct
 * mode wants — no per-object selection, no shape-draw, no text edit, no
 * focus pick — without committing to off-DOM rasterisation yet.
 *
 * The real off-DOM rasterisation path will replace the body of this
 * component (offscreen canvas via `drawElementImage`, cached per
 * `(compositionId, version, time)`) without touching `SceneCompositor`,
 * `CompositionCompositor`, or any consumer. The seam at
 * `CompositionBackend.ts` is the contract.
 *
 * Why a sealed DOM tree counts as "flat" today:
 *   - Direct already gates every interaction prop to compose-mode at the
 *     `App.tsx` data layer, so interaction handlers passed to RasterBackend
 *     are no-ops.
 *   - `pointer-events: none` on the host prevents any rogue handler from
 *     firing if a future regression leaks one through.
 *   - The composition still renders correctly because `DomBackend` already
 *     evaluates animations / parent transforms / render-clock internally.
 */

import { useRef } from "react";
import { DomBackend } from "./DomBackend";
import { useCompositionCamera } from "../compositors/useCompositionCamera";
import { useFrameSnapshot } from "../cache/useFrameSnapshot";
import {
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
} from "../../../core/camera";
import { useCompositionCache } from "../cache/useCompositionCache";
import type { CompositionBackend } from "./CompositionBackend";

const SEALED_INTERACTIONS = {
  canSelect: false,
  focusPicking: false,
  editingTextObjectId: null as string | null,
  activeShapeTool: null,
  onObjectPointerDown: () => {},
  onObjectContextMenu: undefined,
  onTextEditCommit: () => {},
  onTextEditEnd: undefined,
  onTextObjectDoubleClick: () => {},
};

export const RasterBackend: CompositionBackend = function RasterBackend(props) {
  const compositionId = props.part.compositionId ?? props.part.id;
  const cache = useCompositionCache();
  const version = cache.getCacheKey(compositionId);

  const innerCamera = useCompositionCamera({
    part: props.part,
    localTime: props.localTime,
  });
  const snapshot = useFrameSnapshot({
    compositionId,
    version,
    time: props.localTime,
  });
  void snapshot;

  const sealRef = useRef<HTMLDivElement | null>(null);

  const innerCameraStyle = innerCamera
    ? {
        transform: formatCameraPreviewTransform(innerCamera),
        filter: formatCameraPreviewFilter(innerCamera),
        transformOrigin: "center center" as const,
      }
    : undefined;

  return (
    <div
      ref={sealRef}
      className="absolute inset-0"
      data-clipper-raster-backend
      style={{
        pointerEvents: "none",
        transformStyle: "preserve-3d",
        ...innerCameraStyle,
      }}
    >
      <DomBackend {...props} {...SEALED_INTERACTIONS} hostRef={props.hostRef} />
    </div>
  );
};
