import { useEffect, useRef, useState } from "react";
import { ThreeAuthorScene } from "./ThreeAuthorScene";
import { CompositionWebGLHost } from "./CompositionWebGLHost";
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

export interface ComposeAuthorViewProps {
  part: CompositionClip;
  selectedObjectId: string | null;
  localTime: number;
  onCameraPropsChange: (
    cameraObjectId: string,
    next: CameraObjectProps,
  ) => void;
}

/**
 * `ComposeAuthorView` is the compose-mode 3D author viewport. It mounts
 * a `ThreeAuthorScene` (orbit camera, frustum wireframe of the active
 * composition camera, transform gizmo) and keeps it synced with the
 * composition's objects and the user's selection.
 *
 * Lifecycle:
 *   - The Three.js scene is created on mount, disposed on unmount.
 *   - The internal renderer buffer is sized to the host element via a
 *     ResizeObserver, so layout changes adjust aspect without re-mount.
 *   - On every React render that changes inputs, we sync objects, the
 *     active camera, and the selected-camera-id into the scene; the scene
 *     coalesces redraws via its own rAF loop.
 *
 * Output: a full-canvas `<div>` host that swallows pointer events for the
 * orbit/gizmo. The parent decides whether to mount this or `DomBackend`;
 * the parent also keeps the regular DOM tree mounted *behind* this for
 * layer-panel and selection consistency (visually hidden).
 */
export function ComposeAuthorView(props: ComposeAuthorViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ThreeAuthorScene | null>(null);
  const draggingRef = useRef(false);
  const pendingDragRef = useRef<CameraObjectProps | null>(null);
  const flushHandleRef = useRef<number>(0);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [pipVisible, setPipVisible] = useState<boolean>(true);

  // Mount/unmount the scene once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialWidth = host.clientWidth || FRAME_WIDTH;
    const initialHeight = host.clientHeight || FRAME_HEIGHT;
    const scene = new ThreeAuthorScene({
      width: initialWidth,
      height: initialHeight,
    });
    sceneRef.current = scene;
    const canvas = scene.canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const resizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth || FRAME_WIDTH;
      const h = host.clientHeight || FRAME_HEIGHT;
      scene.setViewport(w, h);
    });
    resizeObserver.observe(host);

    return () => {
      sceneRef.current = null;
      resizeObserver.disconnect();
      if (canvas.parentNode === host) host.removeChild(canvas);
      scene.dispose();
    };
  }, []);

  // Wire the drag callback whenever the part / callback changes. The scene
  // calls this on every gizmo `objectChange`; we forward to the parent
  // along with the active camera object's id so it knows which layer to
  // mutate. We resolve the camera id at the time of the drag, not at
  // setup, so deletion+recreation of cameras is handled.
  //
  // Mid-drag updates are rAF-throttled to one React commit per frame; the
  // final value is flushed on drag end. This stops 60+ Hz state churn from
  // racing the gizmo and tanking input latency.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onCameraDrag((next) => {
      pendingDragRef.current = next;
      if (!flushHandleRef.current) {
        flushHandleRef.current = requestAnimationFrame(() => {
          flushHandleRef.current = 0;
          const pending = pendingDragRef.current;
          if (!pending) return;
          const camera = findActiveCameraObject(props.part);
          if (!camera) return;
          // Only apply mid-drag updates if drag is still active. Drag-end
          // path (in onDragStateChange below) flushes the final value.
          if (draggingRef.current) {
            props.onCameraPropsChange(camera.id, pending);
            pendingDragRef.current = null;
          }
        });
      }
    });
    return () => {
      if (flushHandleRef.current) {
        cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = 0;
      }
    };
  }, [props.part, props.onCameraPropsChange]);

  // Track gizmo drag state so the sync effect can skip during a drag and
  // we can flush the final pending value on drag end.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onDragStateChange((active) => {
      draggingRef.current = active;
      if (!active && pendingDragRef.current) {
        const last = pendingDragRef.current;
        pendingDragRef.current = null;
        const camera = findActiveCameraObject(props.part);
        if (camera) props.onCameraPropsChange(camera.id, last);
      }
    });
  }, [props.part, props.onCameraPropsChange]);

  // Sync objects + active camera every time relevant inputs change. Skip
  // during an active gizmo drag — the scene drives its own visual feedback
  // and re-applying the React-known camera mid-drag fights the user.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (draggingRef.current) return;
    scene.setObjects(props.part.objects);
    scene.setActiveCamera(getActiveCameraObjectProps(props.part));
    const activeCamera = findActiveCameraObject(props.part);
    const gizmoTargetId =
      activeCamera && props.selectedObjectId === activeCamera.id
        ? activeCamera.id
        : null;
    scene.setSelectedCameraObjectId(gizmoTargetId);
    scene.render();
  }, [props.part, props.selectedObjectId]);

  // Mode toggle propagates to the gizmo.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setMode(mode);
  }, [mode]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-clipper-compose-author-view
    >
      <div className="pointer-events-none absolute right-3 top-3 flex gap-1.5">
        <button
          type="button"
          className={`pointer-events-auto rounded-[7px] border border-[#2d313b] px-2 py-1 text-[11px] font-semibold transition ${
            mode === "translate"
              ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]"
              : "bg-[#11141a]/90 text-[#dfe2ea] hover:bg-[#20232c]"
          }`}
          onClick={() => setMode("translate")}
        >
          Move
        </button>
        <button
          type="button"
          className={`pointer-events-auto rounded-[7px] border border-[#2d313b] px-2 py-1 text-[11px] font-semibold transition ${
            mode === "rotate"
              ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]"
              : "bg-[#11141a]/90 text-[#dfe2ea] hover:bg-[#20232c]"
          }`}
          onClick={() => setMode("rotate")}
        >
          Rotate
        </button>
      </div>

      {pipVisible ? (
        <div
          className="pointer-events-auto absolute right-3 top-12 w-[28%] max-w-[360px] overflow-hidden rounded-[10px] border border-[#2d313b] bg-[#0a0c10] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
          style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}` }}
          data-clipper-camera-pip
        >
          <button
            type="button"
            aria-label="Hide camera preview"
            className="absolute left-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-[6px] bg-[#11141a]/85 text-[#dfe2ea] outline-none transition hover:bg-[#20232c]"
            onClick={() => setPipVisible(false)}
          >
            ×
          </button>
          <CompositionWebGLHost
            part={props.part}
            localTime={props.localTime}
            hostClassName="h-full w-full"
          />
        </div>
      ) : (
        <button
          type="button"
          aria-label="Show camera preview"
          className="pointer-events-auto absolute right-3 top-12 rounded-[7px] border border-[#2d313b] bg-[#11141a]/90 px-2 py-1 text-[11px] font-semibold text-[#dfe2ea] transition hover:bg-[#20232c]"
          onClick={() => setPipVisible(true)}
        >
          Show camera
        </button>
      )}
    </div>
  );
}
