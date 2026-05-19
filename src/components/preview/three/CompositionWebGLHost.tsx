import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CompositionRenderer } from "./CompositionRenderer";
import {
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";

export interface CompositionWebGLHostProps {
  part: CompositionClip;
  localTime: number;
  hostClassName?: string;
  /**
   * Render-prop returning the sealed DOM composition tree. The host
   * portals it into the CSS3D plane element so it appears as a flat
   * layer at z=0 viewed through the composition's camera. Optional —
   * when omitted, the renderer just clears (used for placeholder/loading
   * states).
   */
  renderComposition?: () => React.ReactNode;
}

/**
 * `CompositionWebGLHost` mounts a `CompositionRenderer` (CSS3D + WebGL,
 * through-camera) and keeps it driven by the composition's active
 * camera + localTime. Used by:
 *   - the compose-mode camera PIP
 *   - Direct mode's sealed flat output (via `RasterBackend`)
 *
 * The composition's DOM is supplied by the caller via `renderComposition`,
 * which receives the CSS3D plane element to portal a `DomBackend` (or
 * other backend) into. That plumbing lets every FrameObject type render
 * for free without per-type WebGL adapters.
 */
export function CompositionWebGLHost(props: CompositionWebGLHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CompositionRenderer | null>(null);
  const [planeTarget, setPlaneTarget] = useState<HTMLElement | null>(null);

  // Mount/unmount the renderer once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialWidth = host.clientWidth || FRAME_WIDTH;
    const initialHeight = host.clientHeight || FRAME_HEIGHT;
    const renderer = new CompositionRenderer({
      width: initialWidth,
      height: initialHeight,
    });
    rendererRef.current = renderer;
    host.appendChild(renderer.hostRoot);

    const planeEl = document.createElement("div");
    planeEl.dataset.clipperCompositionPlane = "";
    planeEl.style.background = "#000";
    renderer.setCompositionElement(planeEl);
    setPlaneTarget(planeEl);

    const resizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth || FRAME_WIDTH;
      const h = host.clientHeight || FRAME_HEIGHT;
      renderer.setViewport(w, h);
      renderer.render();
    });
    resizeObserver.observe(host);

    return () => {
      rendererRef.current = null;
      setPlaneTarget(null);
      resizeObserver.disconnect();
      if (renderer.hostRoot.parentNode === host)
        host.removeChild(renderer.hostRoot);
      renderer.dispose();
    };
  }, []);

  // Sync camera + render whenever the inputs that affect output change.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setCamera(getActiveCameraObjectProps(props.part, props.localTime));
    renderer.render();
  }, [props.part, props.localTime]);

  // Live scrub from the inspector dispatches `clipper:camera-preview`
  // with the next CameraObjectProps. Apply imperatively so the
  // through-camera output (Direct mode + the compose PIP) updates
  // instantly without a React commit, matching `ComposeAuthorView`'s
  // wireframe-frustum preview path.
  useEffect(() => {
    function handleCameraPreview(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { objectId: string; props: CameraObjectProps }
        | undefined;
      if (!detail) return;
      const camera = findActiveCameraObject(props.part);
      if (!camera || camera.id !== detail.objectId) return;
      const renderer = rendererRef.current;
      if (!renderer) return;
      renderer.setCamera(detail.props);
      renderer.render();
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    return () =>
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
  }, [props.part]);

  // Render once the CSS3D plane DOM target is ready so the portaled
  // composition becomes visible without waiting for an input change.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !planeTarget) return;
    renderer.render();
  }, [planeTarget]);

  return (
    <div
      ref={hostRef}
      className={props.hostClassName ?? "absolute inset-0"}
      data-clipper-composition-webgl
      style={{ pointerEvents: "none" }}
    >
      {props.renderComposition && planeTarget
        ? createPortal(props.renderComposition(), planeTarget)
        : null}
    </div>
  );
}
