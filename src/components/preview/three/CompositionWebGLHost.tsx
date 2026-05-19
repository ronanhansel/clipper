import { useEffect, useRef } from "react";
import { CompositionRenderer } from "./CompositionRenderer";
import { DEFAULT_FRAME_OBJECT_ADAPTERS } from "./adapters";
import { getActiveCameraObjectProps } from "../compositors/useCompositionCamera";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
} from "../../../core/types";

export interface CompositionWebGLHostProps {
  part: CompositionClip;
  localTime: number;
  hostClassName?: string;
}

/**
 * `CompositionWebGLHost` mounts a `CompositionRenderer` (Three.js) and
 * keeps its scene in sync with the composition's `objects` + `camera` +
 * `localTime`. Its rendered canvas IS the composition's flat output —
 * Direct mode treats this canvas as a single source, the same way it
 * would treat a video texture.
 *
 * Lifecycle:
 *   - The renderer is constructed on mount, disposed on unmount.
 *   - The renderer's buffer size is fixed at the frame's native pixel
 *     dimensions (FRAME_WIDTH × FRAME_HEIGHT). The canvas is then
 *     CSS-scaled to fill the host via `width: 100%; height: 100%`. This
 *     keeps the camera fov/aspect math in frame-pixel units regardless
 *     of how the parent sizes us.
 *   - Each render is React-driven: when `objects`, `camera`, or
 *     `localTime` changes, an effect re-syncs the scene and renders.
 *     Phase 9 will introduce a per-frame rAF loop for keyframed cameras
 *     if needed; v1 piggybacks on React.
 */
export function CompositionWebGLHost(props: CompositionWebGLHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CompositionRenderer | null>(null);

  // Mount/unmount the renderer once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new CompositionRenderer({
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    });
    renderer.setAdapterFactories(DEFAULT_FRAME_OBJECT_ADAPTERS);
    rendererRef.current = renderer;
    const canvas = renderer.canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);
    return () => {
      rendererRef.current = null;
      if (canvas.parentNode === host) host.removeChild(canvas);
      renderer.dispose();
    };
  }, []);

  // Sync scene + render whenever the inputs that affect output change.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setCamera(getActiveCameraObjectProps(props.part));
    renderer.setObjects(props.part.objects);
    renderer.render(props.part.objects, props.localTime);
  }, [props.part.objects, props.localTime]);

  return (
    <div
      ref={hostRef}
      className={props.hostClassName ?? "absolute inset-0"}
      data-clipper-composition-webgl
      style={{ pointerEvents: "none" }}
    />
  );
}
