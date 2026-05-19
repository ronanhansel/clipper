import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { buildCameraPathData } from "./buildCameraPathData";
import type { CameraPathHandle } from "./cameraPathOverlay";

export interface ComposeAuthorViewProps {
  part: CompositionClip;
  selectedObjectId: string | null;
  localTime: number;
  onCameraPropsChange: (
    cameraObjectId: string,
    next: CameraObjectProps,
  ) => void;
  /**
   * Render-prop returning the sealed DOM composition tree. The author
   * view portals it into the CSS3D plane element so it appears as a flat
   * layer at z=0 in the scene. The owner stays responsible for choosing
   * the backend (DOM vs raster) and wiring its props.
   */
  renderComposition: () => ReactNode;
  /**
   * Optional second tree for the PIP camera preview. The same subtree
   * can't be portaled to two CSS3D targets simultaneously, so the owner
   * supplies a second sealed instance for the PIP. When omitted the PIP
   * just clears.
   */
  renderPipComposition?: () => ReactNode;
  /**
   * Forwarded from the React owner so 3D picks (camera body click) can
   * drive selection state. `null` clears the selection.
   */
  onSelectObject?: (objectId: string | null) => void;
  /**
   * Fired when the user drags a per-axis bezier handle on the camera
   * path overlay. The owner persists the new cp.x onto the matching
   * track point's `easingToNext`.
   */
  onCameraPathEaseChange?: (
    cameraObjectId: string,
    trackPath: string,
    pointIndex: number,
    side: "in" | "out",
    nextCpX: number,
  ) => void;
}

/**
 * `ComposeAuthorView` mounts the AE-style 3D author viewport. The
 * `ThreeAuthorScene` exposes a `hostRoot` div that stacks a CSS3D layer
 * (live composition DOM) and a WebGL canvas (grid + camera frustum +
 * gizmo); we plug that root into our own host div on mount.
 *
 * The composition itself is rendered by the parent via `renderComposition`
 * — we hand it the CSS3D plane element so it can portal a sealed
 * `DomBackend` (or other source) into it. This keeps the author view
 * agnostic about how the composition is drawn while letting it own the
 * 3D camera + gizmo lifecycle.
 */
export function ComposeAuthorView(props: ComposeAuthorViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ThreeAuthorScene | null>(null);
  const draggingRef = useRef(false);
  const pendingDragRef = useRef<CameraObjectProps | null>(null);
  const flushHandleRef = useRef<number>(0);
  const [planeTarget, setPlaneTarget] = useState<HTMLElement | null>(null);
  // Which camera-path keyframe is selected, surfacing its bezier
  // handles. Cleared when the user clicks empty space or selects a
  // different camera.
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<
    number | null
  >(null);
  // Mirror to a ref so the path-data effect can include it as a dep
  // without re-running the unrelated camera-data work whenever the
  // selection toggles. Reads always go through the ref.
  const selectedKeyframeIndexRef = useRef<number | null>(null);
  selectedKeyframeIndexRef.current = selectedKeyframeIndex;

  // Mount/unmount the scene once. The scene owns its own root element
  // (CSS3D layer + WebGL canvas, stacked) and we just parent it into our
  // host div.
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
    host.appendChild(scene.hostRoot);

    // Build the CSS3D plane target that consumers portal into. Sized to
    // FRAME_WIDTH × FRAME_HEIGHT inside ThreeAuthorScene.
    const planeEl = document.createElement("div");
    planeEl.dataset.clipperComposeAuthorPlane = "";
    planeEl.style.background = "#000";
    scene.setCompositionElement(planeEl);
    setPlaneTarget(planeEl);

    const resizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth || FRAME_WIDTH;
      const h = host.clientHeight || FRAME_HEIGHT;
      scene.setViewport(w, h);
    });
    resizeObserver.observe(host);

    return () => {
      sceneRef.current = null;
      setPlaneTarget(null);
      resizeObserver.disconnect();
      if (scene.hostRoot.parentNode === host) host.removeChild(scene.hostRoot);
      scene.dispose();
    };
  }, []);

  // Wire the drag callback whenever the part / callback changes. Mid-drag
  // updates are rAF-throttled to one React commit per frame; the final
  // value is flushed on drag end.
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

  // Forward 3D pick events to React so clicking the camera body selects the
  // camera object (and clicking empty space deselects).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onSelect((picked) => {
      if (picked === "camera") {
        const camera = findActiveCameraObject(props.part);
        if (camera) props.onSelectObject?.(camera.id);
      } else {
        props.onSelectObject?.(null);
      }
    });
  }, [props.part, props.onSelectObject]);

  // Live scrub from the inspector dispatches `clipper:camera-preview`
  // with the next CameraObjectProps. Apply imperatively so the 3D scene
  // updates instantly without a React commit (matches the DOM preview
  // path used for non-camera objects).
  useEffect(() => {
    function handleCameraPreview(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { objectId: string; props: CameraObjectProps }
        | undefined;
      if (!detail) return;
      const camera = findActiveCameraObject(props.part);
      if (!camera || camera.id !== detail.objectId) return;
      const scene = sceneRef.current;
      if (!scene) return;
      scene.setActiveCamera(detail.props);
      scene.render();
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    return () =>
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
  }, [props.part]);

  // Sync active camera + gizmo selection. Skip during gizmo drag — the
  // scene drives its own visual feedback then.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (draggingRef.current) return;
    scene.setActiveCamera(
      getActiveCameraObjectProps(props.part, props.localTime),
    );
    const activeCamera = findActiveCameraObject(props.part);
    const gizmoTargetId =
      activeCamera && props.selectedObjectId === activeCamera.id
        ? activeCamera.id
        : null;
    scene.setSelectedCameraObjectId(gizmoTargetId);
    scene.render();
  }, [props.part, props.selectedObjectId, props.localTime]);

  // Show the camera's keyframed motion path when the camera is selected.
  // Path data + selected-keyframe state both live here; the overlay
  // renders, picks, and drag-edits the bezier handles.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const camera = findActiveCameraObject(props.part);
    const isCameraSelected =
      camera != null && props.selectedObjectId === camera.id;
    if (!isCameraSelected || !camera) {
      scene.setCameraPath(null, false);
      // Clear any path-keyframe selection that belonged to a now-
      // deselected camera, otherwise the overlay would still render
      // its bezier handles when the camera was reselected.
      if (selectedKeyframeIndexRef.current != null) {
        setSelectedKeyframeIndex(null);
      }
      return;
    }
    const data = buildCameraPathData({
      camera,
      selectedKeyframeIndex: selectedKeyframeIndexRef.current,
    });
    if (data == null) {
      scene.setCameraPath(null, false);
      return;
    }
    // If the selected keyframe index falls outside the new keyframe
    // count (e.g. the user deleted a keyframe), reset the selection.
    if (
      selectedKeyframeIndexRef.current != null &&
      selectedKeyframeIndexRef.current >= data.keyframes.length
    ) {
      setSelectedKeyframeIndex(null);
      scene.setCameraPath({ ...data, selectedKeyframeIndex: null }, true);
      return;
    }
    scene.setCameraPath(data, true);
  }, [props.part, props.selectedObjectId, selectedKeyframeIndex]);

  // Wire path-overlay callbacks. The overlay reports selection picks
  // and ongoing handle drags; we mutate React state for selection and
  // dispatch ease writes through the parent for handle drags.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onCameraPathSelect((index) => {
      setSelectedKeyframeIndex(index);
    });
    scene.onCameraPathHandleDrag((handle: CameraPathHandle, nextCp: number) => {
      const camera = findActiveCameraObject(props.part);
      if (!camera) return;
      props.onCameraPathEaseChange?.(
        camera.id,
        handle.trackPath,
        handle.pointIndex,
        handle.side,
        nextCp,
      );
    });
  }, [props.part, props.onCameraPathEaseChange]);

  // Once the CSS3D plane target portal is ready, force one render so the
  // composition is visible on initial mount, not after the next input change.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !planeTarget) return;
    scene.render();
  }, [planeTarget]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-clipper-compose-author-view
    >
      {planeTarget
        ? createPortal(props.renderComposition(), planeTarget)
        : null}

      <div
        className="pointer-events-auto absolute right-3 top-3 w-[28%] max-w-[360px] overflow-hidden rounded-[4px] border border-[#2d313b] bg-[#0a0c10] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}`, zIndex: 10 }}
        data-clipper-camera-pip
      >
        <CompositionWebGLHost
          part={props.part}
          localTime={props.localTime}
          hostClassName="h-full w-full"
          renderComposition={props.renderPipComposition}
        />
      </div>
    </div>
  );
}
