import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ThreeAuthorScene,
  type ThreeAuthorObjectTransformUpdate,
  type ThreeOrbitState,
} from "./ThreeAuthorScene";
import { CompositionWebGLHost } from "./CompositionWebGLHost";
import {
  applyCameraTargetAutomation,
  evaluateCameraObjectPropsAt,
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import { evaluateObjectState } from "../../../core/propertyRegistry";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { buildCameraPathData } from "./buildCameraPathData";
import type { CameraPathHandle } from "./cameraPathOverlay";
import type { CompositionBackendProps } from "../backends/CompositionBackend";

export type CameraPreviewMode = "pip" | "side-by-side" | "2d";
export type ComposeAuthorViewState = {
  previewMode: CameraPreviewMode;
  sideBySideSplit: number;
  orbit: ThreeOrbitState;
};
function coerceAuthorSceneMode(mode: CameraPreviewMode | undefined) {
  return mode === "side-by-side" ? "side-by-side" : "pip";
}
type CameraPreviewHostProps = {
  part: CompositionClip;
  localTime: number;
  backendProps: ComposeAuthorViewProps["pipBackendProps"];
};

function cssEscape(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

function formatObjectTransform(transform: Record<string, unknown>) {
  const parts: string[] = [];
  const pushTransform = (key: string, unit: string) => {
    const value = transform[key];
    if (typeof value === "number" && Number.isFinite(value))
      parts.push(`${key}(${value}${unit})`);
  };
  pushTransform("perspective", "px");
  pushTransform("translateX", "px");
  pushTransform("translateY", "px");
  pushTransform("translateZ", "px");
  pushTransform("scale", "");
  pushTransform("scaleX", "");
  pushTransform("scaleY", "");
  pushTransform("rotate", "deg");
  pushTransform("rotateX", "deg");
  pushTransform("rotateY", "deg");
  pushTransform("rotateZ", "deg");
  pushTransform("skewX", "deg");
  pushTransform("skewY", "deg");
  return parts.join(" ");
}

function resolveAuthorCameraProps(
  part: CompositionClip,
  cameraObject: CompositionClip["objects"][number],
  localTime: number,
  override?: CameraObjectProps,
) {
  const sourceObject = override
    ? {
        ...cameraObject,
        props:
          override as unknown as CompositionClip["objects"][number]["props"],
      }
    : cameraObject;
  const evaluated = override
    ? override
    : evaluateCameraObjectPropsAt(cameraObject, localTime);
  return applyCameraTargetAutomation(part, sourceObject, localTime, evaluated);
}

function useFitFrameSize() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const readSize = () =>
      setHostSize({
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      });
    readSize();
    const observer = new ResizeObserver(readSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const aspect = FRAME_WIDTH / FRAME_HEIGHT;
  const hostAspect = hostSize.width / hostSize.height;
  const frameSize =
    hostAspect > aspect
      ? {
          width: hostSize.height * aspect,
          height: hostSize.height,
        }
      : {
          width: hostSize.width,
          height: hostSize.width / aspect,
        };

  return { hostRef, frameSize };
}

function applyContainedFrameSize(host: HTMLElement, frame: HTMLElement) {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const aspect = FRAME_WIDTH / FRAME_HEIGHT;
  const hostAspect = width / height;
  const frameSize =
    hostAspect > aspect
      ? {
          width: height * aspect,
          height,
        }
      : {
          width,
          height: width / aspect,
        };
  frame.style.width = `${frameSize.width}px`;
  frame.style.height = `${frameSize.height}px`;
}

function useFitFrameElementRefs() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (!host || !frame) return;
    let frameHandle = 0;
    const readSize = () => {
      if (frameHandle) return;
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        applyContainedFrameSize(host, frame);
      });
    };
    applyContainedFrameSize(host, frame);
    const observer = new ResizeObserver(readSize);
    observer.observe(host);
    return () => {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      observer.disconnect();
    };
  }, []);

  return { hostRef, frameRef };
}

function FitCameraPreview({
  part,
  localTime,
  backendProps,
}: CameraPreviewHostProps) {
  const { hostRef, frameRef } = useFitFrameElementRefs();

  return (
    <div
      ref={hostRef}
      className="grid h-full w-full place-items-center overflow-hidden bg-[#0a0c10]"
    >
      <div
        ref={frameRef}
        className="relative overflow-hidden bg-black"
        style={{
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        }}
      >
        <CompositionWebGLHost
          part={part}
          localTime={localTime}
          hostClassName="h-full w-full"
          backendProps={backendProps}
        />
      </div>
    </div>
  );
}

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
  renderComposition: () => React.ReactNode;
  /**
   * Backend props used by the camera PIP's internal `CompositionWebGLHost`.
   * The host owns its own sealed source tree internally; we just
   * forward the per-frame state.
   */
  pipBackendProps: Pick<
    CompositionBackendProps,
    | "animationsEnabled"
    | "frameScale"
    | "previewFps"
    | "hideNullObjects"
    | "isPlaying"
    | "duration"
    | "renderClockSceneTime"
    | "renderMode"
    | "exportTileFrameBounds"
  >;
  /**
   * Forwarded from the React owner so 3D picks (camera body click) can
   * drive selection state. `null` clears the selection.
   */
  onSelectObject?: (objectId: string | null) => void;
  onObjectTransformChange?: (
    objectId: string,
    transform: ThreeAuthorObjectTransformUpdate,
  ) => void;
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
  authorViewState?: ComposeAuthorViewState;
  onAuthorViewStateChange?: (state: Partial<ComposeAuthorViewState>) => void;
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
 *
 * The camera PIP renders through `CompositionWebGLHost`. Phase 1b ships
 * the PIP without DoF — phase 2 routes DoF passes through the renderer's
 * composer so Direct + PIP share the same post-process path.
 */
export function ComposeAuthorView(props: ComposeAuthorViewProps) {
  const sceneHostRef = useRef<HTMLDivElement | null>(null);
  const sideBySidePreviewRef = useRef<HTMLDivElement | null>(null);
  const sideBySideDividerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ThreeAuthorScene | null>(null);
  const draggingRef = useRef(false);
  const pendingDragRef = useRef<{
    objectId: string;
    props: CameraObjectProps;
  } | null>(null);
  const pendingObjectDragRef = useRef<{
    objectId: string;
    transform: ThreeAuthorObjectTransformUpdate;
  } | null>(null);
  const flushHandleRef = useRef<number>(0);
  const objectFlushHandleRef = useRef<number>(0);
  const orbitPersistTimeoutRef = useRef<number>(0);
  const sideBySideResizeFrameRef = useRef<number>(0);
  const [planeTarget, setPlaneTarget] = useState<HTMLElement | null>(null);
  const [previewMode, setPreviewMode] = useState<CameraPreviewMode>(
    coerceAuthorSceneMode(props.authorViewState?.previewMode),
  );
  const [sideBySideSplit, setSideBySideSplit] = useState(
    props.authorViewState?.sideBySideSplit ?? 0.5,
  );
  useEffect(() => {
    if (!props.authorViewState) return;
    setPreviewMode(coerceAuthorSceneMode(props.authorViewState.previewMode));
    setSideBySideSplit(props.authorViewState.sideBySideSplit);
  }, [props.authorViewState]);
  const rootRef = useRef<HTMLDivElement | null>(null);
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

  const applySideBySideSplitPreview = (split: number) => {
    const host = sceneHostRef.current;
    const preview = sideBySidePreviewRef.current;
    const divider = sideBySideDividerRef.current;
    if (!host || !preview || !divider) return;
    host.style.width = `${split * 100}%`;
    preview.style.width = `${(1 - split) * 100}%`;
    divider.style.left = `${split * 100}%`;
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setViewport(
      host.clientWidth || FRAME_WIDTH,
      host.clientHeight || FRAME_HEIGHT,
    );
  };

  useEffect(() => {
    return () => {
      if (sideBySideResizeFrameRef.current) {
        cancelAnimationFrame(sideBySideResizeFrameRef.current);
        sideBySideResizeFrameRef.current = 0;
      }
    };
  }, []);

  // Mount/unmount the scene once. The scene owns its own root element
  // (CSS3D layer + WebGL canvas, stacked) and we just parent it into our
  // host div.
  useEffect(() => {
    const host = sceneHostRef.current;
    if (!host) return;
    const initialWidth = host.clientWidth || FRAME_WIDTH;
    const initialHeight = host.clientHeight || FRAME_HEIGHT;
    const scene = new ThreeAuthorScene({
      width: initialWidth,
      height: initialHeight,
    });
    if (props.authorViewState?.orbit) {
      scene.setOrbitState(props.authorViewState.orbit);
    }
    sceneRef.current = scene;
    host.appendChild(scene.hostRoot);

    // Build the CSS3D plane target that consumers portal into. Sized to
    // FRAME_WIDTH × FRAME_HEIGHT inside ThreeAuthorScene.
    const planeEl = document.createElement("div");
    planeEl.dataset.clipperComposeAuthorPlane = "";
    planeEl.style.background = "#000";
    scene.setCompositionElement(planeEl);
    setPlaneTarget(planeEl);

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        const w = host.clientWidth || FRAME_WIDTH;
        const h = host.clientHeight || FRAME_HEIGHT;
        scene.setViewport(w, h);
      });
    });
    resizeObserver.observe(host);

    return () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      sceneRef.current = null;
      setPlaneTarget(null);
      resizeObserver.disconnect();
      if (scene.hostRoot.parentNode === host) host.removeChild(scene.hostRoot);
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onViewStateChange((orbit) => {
      if (orbitPersistTimeoutRef.current) {
        window.clearTimeout(orbitPersistTimeoutRef.current);
      }
      orbitPersistTimeoutRef.current = window.setTimeout(() => {
        orbitPersistTimeoutRef.current = 0;
        props.onAuthorViewStateChange?.({ orbit });
      }, 250);
    });
    return () => {
      if (orbitPersistTimeoutRef.current) {
        window.clearTimeout(orbitPersistTimeoutRef.current);
        orbitPersistTimeoutRef.current = 0;
      }
    };
  }, [props.onAuthorViewStateChange]);

  // Wire the drag callback whenever the part / callback changes. Mid-drag
  // updates stay imperative so camera gizmos match object gizmo performance;
  // the document state is committed once on drag end.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onCameraDrag((objectId, next) => {
      const camera = props.part.objects.find(
        (object) =>
          object.id === objectId && object.type === "camera" && !object.hidden,
      );
      const automatedNext = camera
        ? resolveAuthorCameraProps(props.part, camera, props.localTime, next)
        : next;
      const activeCamera = findActiveCameraObject(props.part, props.localTime);
      if (camera && activeCamera?.id === objectId) {
        scene.setActiveCamera(automatedNext, objectId);
      }
      pendingDragRef.current = { objectId, props: automatedNext };
      if (!flushHandleRef.current) {
        flushHandleRef.current = requestAnimationFrame(() => {
          flushHandleRef.current = 0;
          const pending = pendingDragRef.current;
          if (!pending) return;
          if (draggingRef.current) {
            const camera = props.part.objects.find(
              (object) =>
                object.id === pending.objectId &&
                object.type === "camera" &&
                !object.hidden,
            );
            if (camera) {
              const pathData = buildCameraPathData({
                camera,
                selectedKeyframeIndex: selectedKeyframeIndexRef.current,
                previewPositionAtTime: {
                  time: props.localTime,
                  position: pending.props.position,
                },
              });
              if (pathData) scene.setCameraPath(pathData, true);
            }
            window.dispatchEvent(
              new CustomEvent("clipper:camera-preview", {
                detail: {
                  objectId: pending.objectId,
                  props: pending.props,
                  source: "author-gizmo",
                },
              }),
            );
          }
        });
      }
    });
    return () => {
      if (flushHandleRef.current) {
        cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = 0;
      }
      if (objectFlushHandleRef.current) {
        cancelAnimationFrame(objectFlushHandleRef.current);
        objectFlushHandleRef.current = 0;
      }
    };
  }, [props.localTime, props.part, props.onCameraPropsChange]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onDragStateChange((active) => {
      draggingRef.current = active;
      if (!active && pendingDragRef.current) {
        const last = pendingDragRef.current;
        pendingDragRef.current = null;
        props.onCameraPropsChange(last.objectId, last.props);
      }
      if (!active && pendingObjectDragRef.current) {
        const last = pendingObjectDragRef.current;
        pendingObjectDragRef.current = null;
        props.onObjectTransformChange?.(last.objectId, last.transform);
      }
    });
  }, [props.part, props.onCameraPropsChange, props.onObjectTransformChange]);

  // Forward 3D pick events to React so clicking the camera body or elements selects
  // them in the scene (and clicking empty space deselects).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onSelect((picked) => {
      if (picked) {
        props.onSelectObject?.(picked);
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
        | { objectId: string; props: CameraObjectProps; source?: string }
        | undefined;
      if (!detail) return;
      if (detail.source === "author-gizmo") return;
      const camera = props.part.objects.find(
        (object) =>
          object.id === detail.objectId &&
          object.type === "camera" &&
          !object.hidden,
      );
      if (!camera) return;
      const scene = sceneRef.current;
      if (!scene) return;
      const activeCamera = findActiveCameraObject(props.part, props.localTime);
      if (activeCamera?.id === detail.objectId) {
        scene.setActiveCamera(
          resolveAuthorCameraProps(
            props.part,
            camera,
            props.localTime,
            detail.props,
          ),
          detail.objectId,
        );
      }
      scene.setCameraObjects(
        props.part.objects
          .filter((object) => object.type === "camera" && !object.hidden)
          .map((object) => ({
            id: object.id,
            props:
              object.id === detail.objectId
                ? resolveAuthorCameraProps(
                    props.part,
                    object,
                    props.localTime,
                    detail.props,
                  )
                : resolveAuthorCameraProps(props.part, object, props.localTime),
            active: object.id === activeCamera?.id,
            selected: object.id === props.selectedObjectId,
          })),
      );
      scene.render();
    }
    window.addEventListener("clipper:camera-preview", handleCameraPreview);
    return () =>
      window.removeEventListener("clipper:camera-preview", handleCameraPreview);
  }, [props.localTime, props.part, props.selectedObjectId]);

  // Sync active camera + gizmo selection. Skip during gizmo drag — the
  // scene drives its own visual feedback then.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (draggingRef.current) return;
    const activeCamera = findActiveCameraObject(props.part, props.localTime);
    scene.setActiveCamera(
      getActiveCameraObjectProps(props.part, props.localTime),
      activeCamera?.id ?? null,
    );
    scene.setCameraObjects(
      props.part.objects
        .filter((object) => object.type === "camera" && !object.hidden)
        .map((object) => ({
          id: object.id,
          props: resolveAuthorCameraProps(props.part, object, props.localTime),
          active: object.id === activeCamera?.id,
          selected: object.id === props.selectedObjectId,
        })),
    );
    const selectedCamera = props.part.objects.find(
      (object) =>
        object.id === props.selectedObjectId &&
        object.type === "camera" &&
        !object.hidden,
    );
    const cameraSelected =
      selectedCamera != null && props.selectedObjectId === selectedCamera.id;
    if (cameraSelected) {
      scene.setSelectedObject(null, null, null);
      scene.setSelectedCameraObjectId(selectedCamera.id);
    } else {
      scene.setSelectedCameraObjectId(null);
      const selectedObject = props.part.objects.find(
        (object) =>
          object.id === props.selectedObjectId &&
          object.type !== "camera" &&
          !object.hidden &&
          object.threeD === true,
      );
      if (selectedObject) {
        const evaluated = evaluateObjectState(selectedObject, props.localTime);
        scene.setSelectedObject(
          selectedObject.id,
          evaluated.bounds,
          typeof evaluated.transform === "object" ? evaluated.transform : {},
        );
      } else {
        scene.setSelectedObject(null, null, null);
      }
    }
    scene.render();
  }, [props.part, props.selectedObjectId, props.localTime]);

  // Show the camera's keyframed motion path when the camera is selected.
  // Path data + selected-keyframe state both live here; the overlay
  // renders, picks, and drag-edits the bezier handles.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const camera = props.part.objects.find(
      (object) =>
        object.id === props.selectedObjectId &&
        object.type === "camera" &&
        !object.hidden,
    );
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
      const camera = props.part.objects.find(
        (object) =>
          object.id === props.selectedObjectId &&
          object.type === "camera" &&
          !object.hidden,
      );
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

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const applyObjectDragPreview = (
      objectId: string,
      nextTransform: ThreeAuthorObjectTransformUpdate,
    ) => {
      const target = planeTarget?.querySelector<HTMLElement>(
        `[data-clipper-render-object-id="${cssEscape(objectId)}"]`,
      );
      if (!target) return;
      const object = props.part.objects.find((item) => item.id === objectId);
      if (!object) return;
      const evaluated = evaluateObjectState(object, props.localTime);
      const transform =
        evaluated.transform && typeof evaluated.transform === "object"
          ? { ...evaluated.transform }
          : {};
      for (const key of [
        "translateZ",
        "rotateX",
        "rotateY",
        "rotateZ",
      ] as const) {
        const value = nextTransform[key];
        if (value !== undefined) transform[key] = value;
      }
      if (nextTransform.bounds) {
        target.style.left = `${nextTransform.bounds.x}px`;
        target.style.top = `${nextTransform.bounds.y}px`;
        window.dispatchEvent(
          new CustomEvent("clipper:object-preview-bounds", {
            detail: {
              bounds: {
                ...evaluated.bounds,
                ...nextTransform.bounds,
              },
              objectId,
            },
          }),
        );
      }
      target.style.transform = formatObjectTransform(transform);
    };
    scene.onObjectDrag((objectId, nextTransform) => {
      pendingObjectDragRef.current = { objectId, transform: nextTransform };
      if (objectFlushHandleRef.current) return;
      objectFlushHandleRef.current = requestAnimationFrame(() => {
        objectFlushHandleRef.current = 0;
        const pending = pendingObjectDragRef.current;
        if (!pending) return;
        applyObjectDragPreview(pending.objectId, pending.transform);
      });
    });
  }, [planeTarget, props.localTime, props.part]);

  // Synchronize pickable 3D elements in the WebGL hit-testing scene.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (draggingRef.current) return;
    const elements3d = props.part.objects
      .filter(
        (obj) => obj.type !== "camera" && !obj.hidden && obj.threeD === true,
      )
      .map((obj) => {
        const state = evaluateObjectState(obj, props.localTime);
        return {
          id: obj.id,
          bounds: state.bounds,
          transform: typeof state.transform === "object" ? state.transform : {},
        };
      });
    scene.setPickableObjects(elements3d);
  }, [props.part, props.localTime]);

  // Once the CSS3D plane target portal is ready, force one render so the
  // composition is visible on initial mount, not after the next input change.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !planeTarget) return;
    scene.render();
  }, [planeTarget]);

  useEffect(() => {
    const host = sceneHostRef.current;
    const preview = sideBySidePreviewRef.current;
    const divider = sideBySideDividerRef.current;
    if (!host) return;
    if (previewMode !== "side-by-side") {
      host.style.width = "";
      if (preview) preview.style.width = "";
      if (divider) divider.style.left = "";
      return;
    }
    if (!preview || !divider) return;
    applySideBySideSplitPreview(sideBySideSplit);
  }, [previewMode, sideBySideSplit]);

  const startSideBySideResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    let committedSplit = sideBySideSplit;
    const update = (clientX: number) => {
      const next = (clientX - rect.left) / Math.max(1, rect.width);
      const split = Math.min(0.75, Math.max(0.25, next));
      committedSplit = split;
      if (sideBySideResizeFrameRef.current) return;
      sideBySideResizeFrameRef.current = requestAnimationFrame(() => {
        sideBySideResizeFrameRef.current = 0;
        applySideBySideSplitPreview(committedSplit);
      });
    };
    update(event.clientX);
    const handleMove = (moveEvent: PointerEvent) => update(moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (sideBySideResizeFrameRef.current) {
        cancelAnimationFrame(sideBySideResizeFrameRef.current);
        sideBySideResizeFrameRef.current = 0;
      }
      applySideBySideSplitPreview(committedSplit);
      setSideBySideSplit(committedSplit);
      props.onAuthorViewStateChange?.({ sideBySideSplit: committedSplit });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const renderCameraPreview = () => (
    <FitCameraPreview
      part={props.part}
      localTime={props.localTime}
      backendProps={props.pipBackendProps}
    />
  );

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      data-clipper-compose-author-view
    >
      <div
        ref={sceneHostRef}
        className={`${
          previewMode === "side-by-side"
            ? "absolute inset-y-0 left-0"
            : "absolute inset-0"
        }`}
        data-clipper-compose-author-scene
      />
      {planeTarget
        ? createPortal(props.renderComposition(), planeTarget)
        : null}

      {previewMode === "pip" ? (
        <div
          className="pointer-events-auto absolute right-3 top-3 w-[28%] max-w-[360px] overflow-hidden rounded-[4px] border border-[#2d313b] bg-[#0a0c10] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
          style={{
            aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}`,
            zIndex: 10,
          }}
          data-clipper-camera-pip
          data-clipper-camera-pip-dof="deferred"
        >
          <CompositionWebGLHost
            part={props.part}
            localTime={props.localTime}
            hostClassName="h-full w-full"
            backendProps={props.pipBackendProps}
          />
        </div>
      ) : null}

      {previewMode === "side-by-side" ? (
        <div
          ref={sideBySidePreviewRef}
          className="pointer-events-auto absolute inset-y-0 right-0 overflow-hidden border-l border-[#2d313b] bg-[#0a0c10]"
          data-clipper-camera-side-by-side
        >
          {renderCameraPreview()}
        </div>
      ) : null}

      {previewMode === "side-by-side" ? (
        <div
          ref={sideBySideDividerRef}
          className="pointer-events-auto absolute inset-y-0 z-20 w-2 -translate-x-1/2 cursor-col-resize"
          onPointerDown={startSideBySideResize}
          data-clipper-camera-side-by-side-resize
        >
          <div className="mx-auto h-full w-px bg-[#3a4050]" />
        </div>
      ) : null}
    </div>
  );
}
