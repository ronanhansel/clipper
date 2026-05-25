/**
 * `RasterBackend` is the Direct-mode backend: it treats the composition as a
 * sealed flat output rather than a live React tree of editable objects.
 *
 * Direct mode always routes through `CompositionWebGLHost` — the
 * through-camera GPU renderer with depth-only meshes + a captured-DOM
 * colour quad. The host owns its own internal sealed `DomBackend` source
 * subtree (parked off-screen) and feeds it into the renderer. From the
 * outside, this backend is a single sealed flat output with no per-object
 * interactions.
 *
 * Responsibility split:
 *   - This file seals interactions and forwards `backendProps` to the host.
 *   - `CompositionWebGLHost` owns the source-tree mount and capture timing.
 *   - The CSS camera transform never applies in Direct: the host's
 *     internal source uses `cameraHandledExternally: true`, and the
 *     through-camera renderer bakes the camera into canvas pixels.
 */

import { useRef } from "react";
import type { CompositionBackend } from "./CompositionBackend";
import { CompositionWebGLHost } from "../three/CompositionWebGLHost";

export const RasterBackend: CompositionBackend = function RasterBackend(props) {
  const sealRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={sealRef}
      className="absolute inset-0"
      data-clipper-raster-backend
      data-clipper-raster-mode="webgl"
      style={{ pointerEvents: "none" }}
    >
      <CompositionWebGLHost
        part={props.part}
        localTime={props.localTime}
        backendProps={{
          animationsEnabled: props.animationsEnabled,
          frameScale: props.frameScale,
          previewFps: props.previewFps,
          hideNullObjects: props.hideNullObjects,
          isPlaying: props.isPlaying,
          duration: props.duration,
          renderClockSceneTime: props.renderClockSceneTime,
          renderMode: props.renderMode,
          exportTileFrameBounds: props.exportTileFrameBounds,
        }}
      />
    </div>
  );
};
