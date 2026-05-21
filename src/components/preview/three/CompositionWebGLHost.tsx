import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CompositionRenderer } from "./CompositionRenderer";
import { buildCameraComposerPasses } from "./cameraComposerPasses";
import { DomBackend } from "../backends/DomBackend";
import {
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import {
  getCodeObjectComponentTick,
  subscribeCodeObjectComponents,
} from "../../../render-engine/codeObjectRuntime";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import type { CompositionBackendProps } from "../backends/CompositionBackend";

export interface CompositionWebGLHostProps {
  part: CompositionClip;
  localTime: number;
  /**
   * Backend props the internal sealed `DomBackend` needs to render the
   * source tree. The host fills in all sealed/non-interactive values
   * itself; callers only pass the props that vary per frame/state.
   */
  backendProps: Pick<
    CompositionBackendProps,
    | "animationsEnabled"
    | "frameScale"
    | "hideNullObjects"
    | "isPlaying"
    | "duration"
    | "renderClockSceneTime"
    | "renderMode"
    | "exportTileFrameBounds"
  >;
  hostClassName?: string;
}

const NOOP_OBJECT_POINTER: CompositionBackendProps["onObjectPointerDown"] =
  () => {};
const NOOP_TEXT_COMMIT: CompositionBackendProps["onTextEditCommit"] = () => {};
const NOOP_OBJECT_DOUBLE_CLICK: CompositionBackendProps["onTextObjectDoubleClick"] =
  () => {};

const SOURCE_INNER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  pointerEvents: "none",
  overflow: "hidden",
};

/**
 * `CompositionWebGLHost` mounts a `CompositionRenderer` (through-camera
 * WebGL with depth-only meshes + a captured-DOM colour quad) and keeps
 * it driven by the composition's active camera + localTime. Used by:
 *   - the compose-mode camera PIP
 *   - Direct mode's sealed flat output (via `RasterBackend`)
 *
 * The host owns its own hidden source DOM tree (a sealed, non-
 * interactive `DomBackend`) parked off-screen via `position: fixed`.
 * `CompositionRenderer.setComposition` reads from that subtree via
 * `drawElementImage` and projects it through the active camera. The
 * source must remain in the DOM (not `display: none`) so layout/paint
 * runs and the capture path can read pixels.
 */
export function CompositionWebGLHost(props: CompositionWebGLHostProps) {
  const { part, localTime, backendProps } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sourceContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CompositionRenderer | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [captureCanvas, setCaptureCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  // Code-object bundles compile asynchronously. While the bundle is
  // still building, the sealed source DOM renders a "code: compiling…"
  // placeholder; once compilation finishes the runtime bumps a tick
  // that drives `CodeObjectFrame` to swap in the real component. The
  // composition host needs to recapture + render at that point or the
  // through-camera output stays frozen on the placeholder until the
  // user scrubs or moves the camera.
  const codeComponentTick = useSyncExternalStore(
    subscribeCodeObjectComponents,
    getCodeObjectComponentTick,
    getCodeObjectComponentTick,
  );

  // The capture canvas + source subtree live in a fresh `<div>` mounted
  // straight on `document.body`. Two reasons:
  //   1. The source must escape ancestors with `transform`,
  //      `transform-style: preserve-3d`, `filter`, or `perspective`,
  //      which promote `position: fixed` descendants into a 3D rendering
  //      context and confuse `drawElementImage` paint sampling.
  //   2. `CanvasRenderingContext2D.drawElementImage` only accepts the
  //      canvas's IMMEDIATE children as source elements. The capture
  //      canvas (owned by `CompositionRenderer`) must therefore be in
  //      the DOM with the source `<div>` as its direct child.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.createElement("div");
    target.dataset.clipperCompositionWebglSourceHost = "";
    Object.assign(target.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: `${FRAME_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      pointerEvents: "none",
      opacity: "0",
      zIndex: "-1",
      overflow: "hidden",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(target);
    setPortalTarget(target);
    return () => {
      if (target.parentNode) target.parentNode.removeChild(target);
      setPortalTarget(null);
    };
  }, []);

  // Mount/unmount the renderer once the portal target is ready. The
  // capture canvas (owned by the renderer) is moved into the portal so
  // the source DOM can be its immediate child — required by
  // `drawElementImage`. Effects run after commit, so the portal-rendered
  // source DOM is in place by the time we move the canvas.
  useEffect(() => {
    if (!portalTarget) return;
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

    // Park the capture canvas inside the portal target. Style it so
    // it doesn't paint anywhere visible — only its DOM position
    // matters for the `drawElementImage(child)` requirement.
    const captureCanvasEl = renderer.captureCanvas;
    Object.assign(captureCanvasEl.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: `${FRAME_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);
    portalTarget.appendChild(captureCanvasEl);
    setCaptureCanvas(captureCanvasEl);

    // Enable Chromium's experimental layoutsubtree flag eagerly so the
    // first `drawElementImage` call in the rAF effect below succeeds.
    // `prepareLiveDomPostProcessSource` does this on its own when given
    // a non-null source, but setting it here means a missed prepare
    // call (e.g. if React's first commit lands before the portal does)
    // doesn't blow up the capture.
    try {
      (
        captureCanvasEl as HTMLCanvasElement & { layoutSubtree?: boolean }
      ).layoutSubtree = true;
    } catch {
      /* feature flag may not be exposed on this Chromium build */
    }
    try {
      (
        captureCanvasEl as HTMLCanvasElement & { layoutsubtree?: boolean }
      ).layoutsubtree = true;
    } catch {
      /* alt casing */
    }

    const refresh = (cameraOverride?: CameraObjectProps) => {
      const cameraProps =
        cameraOverride ?? getActiveCameraObjectProps(part, localTime);
      renderer.setCamera(cameraProps);
      renderer.setComposerPasses(
        buildCameraComposerPasses(cameraProps, {
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        }),
      );
      renderer.setComposition(part, localTime, sourceContainerRef.current);
      renderer.render();
    };
    refresh();

    const resizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth || FRAME_WIDTH;
      const h = host.clientHeight || FRAME_HEIGHT;
      renderer.setViewport(w, h);
      refresh();
    });
    resizeObserver.observe(host);

    return () => {
      rendererRef.current = null;
      setCaptureCanvas(null);
      resizeObserver.disconnect();
      if (captureCanvasEl.parentNode === portalTarget)
        portalTarget.removeChild(captureCanvasEl);
      if (renderer.hostRoot.parentNode === host)
        host.removeChild(renderer.hostRoot);
      renderer.dispose();
    };
    // Renderer mounts after the portal target is ready; updates flow
    // through the [part, localTime] effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalTarget]);

  // Sync camera + render whenever the inputs that affect output change.
  // `drawElementImage` requires a settled layout pass on the source, so
  // schedule the capture inside `requestAnimationFrame` to give the
  // sealed DomBackend's commit a chance to paint before we read it.
  // Depends on `captureCanvas` so the first capture runs AFTER the
  // portal-mounted source DOM is in the tree (the portal is gated on
  // `captureCanvas` state). That first call routes through
  // `prepareLiveDomPostProcessSource`, which flips `canvas.layoutSubtree
  // = true` — without that flag, `drawElementImage` errors out.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!captureCanvas) return;
    const handle = requestAnimationFrame(() => {
      const r = rendererRef.current;
      if (!r) return;
      const cameraProps = getActiveCameraObjectProps(part, localTime);
      r.setCamera(cameraProps);
      r.setComposerPasses(
        buildCameraComposerPasses(cameraProps, {
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        }),
      );
      r.setComposition(part, localTime, sourceContainerRef.current);
      r.render();
    });
    return () => cancelAnimationFrame(handle);
  }, [part, localTime, captureCanvas, codeComponentTick]);

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
      const camera = findActiveCameraObject(part);
      if (!camera || camera.id !== detail.objectId) return;
      const renderer = rendererRef.current;
      if (!renderer) return;
      renderer.setCamera(detail.props);
      renderer.setComposerPasses(
        buildCameraComposerPasses(detail.props, {
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        }),
      );
      renderer.render();
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    return () =>
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
  }, [part]);

  return (
    <>
      <div
        ref={hostRef}
        className={props.hostClassName ?? "absolute inset-0"}
        data-clipper-composition-webgl
        style={{ pointerEvents: "none" }}
      />
      {captureCanvas
        ? createPortal(
            <div
              ref={sourceContainerRef}
              data-clipper-composition-webgl-source
              aria-hidden="true"
              // React 18 typings don't include the `inert` attribute; the
              // surrounding tree is hidden + pointer-events:none anyway, and
              // the source subtree mirrors that. The `inert` attribute is a
              // belt-and-braces guard for any future rogue focus.
              // @ts-expect-error react 18 lacks `inert`
              inert=""
              style={SOURCE_INNER_STYLE}
            >
              <DomBackend
                active={false}
                activeShapeTool={null}
                animationsEnabled={backendProps.animationsEnabled}
                canSelect={false}
                cameraHandledExternally={true}
                duration={backendProps.duration}
                editingTextObjectId={null}
                exportTileFrameBounds={backendProps.exportTileFrameBounds}
                focusPicking={false}
                frameScale={1}
                hideNullObjects={backendProps.hideNullObjects ?? false}
                hostRef={sourceContainerRef}
                isPlaying={backendProps.isPlaying}
                localTime={localTime}
                part={part}
                renderClockSceneTime={backendProps.renderClockSceneTime}
                renderMode={backendProps.renderMode}
                onObjectPointerDown={NOOP_OBJECT_POINTER}
                onObjectContextMenu={undefined}
                onTextEditCommit={NOOP_TEXT_COMMIT}
                onTextEditEnd={undefined}
                onTextObjectDoubleClick={NOOP_OBJECT_DOUBLE_CLICK}
              />
            </div>,
            captureCanvas,
          )
        : null}
    </>
  );
}
