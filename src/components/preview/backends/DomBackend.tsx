import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  getRenderClockAttributes,
  getRenderClockStyle,
  syncDomAnimationsToRenderClock,
} from "../../../render-engine/renderClock";
import { buildFrameObjectParentTransformLookup } from "../../../render-engine/renderRuntime";
import {
  BackgroundLayerView,
  FrameObjectView,
  isObjectInExportTile,
  isPenDrawTool,
} from "../FramePreview";
import {
  cameraObjectPropsToPreviewTransform,
  findActiveCameraObject,
  getActiveCameraObjectProps,
} from "../compositors/useCompositionCamera";
import {
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
} from "../../../core/camera";
import {
  computeCircleOfConfusionPx,
  computeLayerSubjectDistance,
} from "../../../core/cameraOptics";
import { evaluateObjectState } from "../../../core/propertyRegistry";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
} from "../../../core/types";
import type { CompositionBackend } from "./CompositionBackend";

export const DomBackend: CompositionBackend = function DomBackend({
  active,
  activeShapeTool,
  animationsEnabled,
  applyCameraDof = true,
  canSelect,
  cameraHandledExternally,
  editingTextObjectId,
  exportTileFrameBounds,
  focusPicking,
  frameScale,
  hideNullObjects,
  hostRef,
  isPlaying,
  part,
  renderClockSceneTime,
  localTime,
  renderMode,
  onObjectPointerDown,
  onObjectContextMenu,
  onTextEditCommit,
  onTextEditEnd,
  onTextObjectDoubleClick,
}) {
  const renderClockState = useMemo(
    () => ({
      playing: renderMode !== "export" && isPlaying,
      time: localTime,
      mode: renderMode,
    }),
    [isPlaying, localTime, renderMode],
  );
  const renderClockStateRef = useRef(renderClockState);
  renderClockStateRef.current = renderClockState;
  const renderClockStyle = useMemo(
    () => getRenderClockStyle(renderClockState) as CSSProperties,
    [renderClockState],
  );

  const activeCameraId = useMemo(
    () => findActiveCameraObject(part)?.id ?? null,
    [part],
  );

  // Live scrub from the inspector dispatches `clipper:camera-preview`
  // with the next CameraObjectProps. Mirror the imperative pattern from
  // `CompositionWebGLHost` / `ComposeAuthorView`: rAF-coalesce so we
  // commit at most once per frame, and clear on commit (`part` identity
  // changes when the document state updates).
  const [previewCameraOverride, setPreviewCameraOverride] =
    useState<CameraObjectProps | null>(null);

  useEffect(() => {
    if (!activeCameraId) return;
    let pending: CameraObjectProps | null = null;
    let frame = 0;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { objectId: string; props: CameraObjectProps }
        | undefined;
      if (!detail || detail.objectId !== activeCameraId) return;
      pending = detail.props;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending) setPreviewCameraOverride(pending);
          pending = null;
        });
      }
    };
    window.addEventListener("clipper:camera-preview", handler);
    return () => {
      window.removeEventListener("clipper:camera-preview", handler);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeCameraId]);

  // Clear preview on commit (part identity changes when state updates).
  useEffect(() => {
    setPreviewCameraOverride(null);
  }, [part]);

  const activeCameraBase = useMemo(
    () => getActiveCameraObjectProps(part, localTime),
    [part, localTime],
  );
  const activeCamera = previewCameraOverride ?? activeCameraBase;

  const innerCamera = activeCamera
    ? cameraObjectPropsToPreviewTransform(activeCamera)
    : null;
  const innerCameraStyle =
    innerCamera && !cameraHandledExternally
      ? {
          transform: formatCameraPreviewTransform(innerCamera),
          filter: formatCameraPreviewFilter(innerCamera),
          transformOrigin: "center center" as const,
          transformStyle: "preserve-3d" as const,
        }
      : undefined;

  // Always preserve the 3D context through the composition root so per-
  // FrameObject `translateZ` / `rotate{X,Y,Z}` survive even when no inner
  // camera is active. Without this the host flattens children and Z
  // motion has no visible effect.
  const hostTransformStyle: CSSProperties = innerCameraStyle
    ? {}
    : { transformStyle: "preserve-3d" };

  // DoF applies only to layers with `threeD === true`. 2D layers always
  // render sharp on the composition plane (matches AE).
  // TODO: hoist evaluatedObject up so DoF and FrameObjectView share one
  // evaluation. For v1 we accept a duplicate `evaluateObjectState` call
  // per object — DoF only needs the translateZ scalar and the bounds.
  // TODO: enable DoF in export mode once the export path is determinised.
  const dofPxByObjectId = useMemo(() => {
    const map = new Map<string, number>();
    if (!applyCameraDof) return map;
    if (!activeCamera || !activeCamera.dof.enabled) return map;
    if (renderMode === "export") return map;
    for (const obj of part.objects) {
      if (obj.hidden) continue;
      if (obj.type === "camera") continue;
      if (!obj.threeD) continue;
      const evaluated = obj.tracks ? evaluateObjectState(obj, localTime) : obj;
      const transform = (evaluated.transform ?? {}) as Record<string, unknown>;
      const tz =
        typeof transform.translateZ === "number" ? transform.translateZ : 0;
      const subject = computeLayerSubjectDistance(
        activeCamera.position,
        activeCamera.rotation,
        {
          x: evaluated.bounds.x + evaluated.bounds.width / 2,
          y: evaluated.bounds.y + evaluated.bounds.height / 2,
          z: tz,
        },
      );
      const coc = computeCircleOfConfusionPx(
        activeCamera,
        subject,
        FRAME_HEIGHT,
      );
      if (coc > 0) map.set(obj.id, coc);
    }
    return map;
  }, [activeCamera, applyCameraDof, localTime, part.objects, renderMode]);

  // Per-composition backdrop CoC: same optics applied to the
  // composition plane (z=0, frame centroid). Painted on a dedicated
  // underlay so the host's children (focused objects) stay sharp.
  const bgCameraDofPx = useMemo(() => {
    if (!applyCameraDof) return 0;
    if (!activeCamera || !activeCamera.dof.enabled) return 0;
    if (renderMode === "export") return 0;
    const subject = computeLayerSubjectDistance(
      activeCamera.position,
      activeCamera.rotation,
      { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2, z: 0 },
    );
    return computeCircleOfConfusionPx(activeCamera, subject, FRAME_HEIGHT);
  }, [activeCamera, applyCameraDof, renderMode]);

  useLayoutEffect(() => {
    syncDomAnimationsToRenderClock(
      hostRef.current,
      renderClockStateRef.current,
    );
  }, [hostRef, renderClockState.playing, renderClockState.mode]);

  useLayoutEffect(
    () => syncRenderClockSubtree(hostRef.current, renderClockStateRef),
    [hostRef],
  );

  // Extract `backgroundColor` from the frame style so it paints on a
  // dedicated underlay div instead of the host. The host's filter would
  // otherwise apply to the entire subtree (including focused objects);
  // the underlay lets only the composition-plane backdrop blur.
  const frameStyleRecord = part.frame.style as Record<string, string | number>;
  const { backgroundColor: frameBgColor, ...frameStyleRest } = frameStyleRecord;

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-clipper-render-clock-layer
      data-clipper-render-clock-offset={localTime - renderClockSceneTime}
      {...getRenderClockAttributes(renderClockState)}
      style={{
        ...frameStyleRest,
        ...renderClockStyle,
        ...hostTransformStyle,
        ...innerCameraStyle,
        // `overflow: hidden` forces transform-style back to flat (per the
        // CSS Transforms 2 spec), which kills 3D context propagation
        // through the composition root. Use clip on a sibling overlay
        // instead, or rely on `data-clipper-frame-content` (the parent)
        // for clipping. Keep the host's overflow visible so per-layer
        // translateZ / rotate{X,Y,Z} survive.
        overflow: "visible",
      }}
    >
      {frameBgColor !== undefined && (
        <div
          aria-hidden
          data-clipper-frame-backdrop
          className="absolute inset-0"
          style={{
            backgroundColor: frameBgColor as string,
            filter:
              bgCameraDofPx > 0
                ? `blur(${bgCameraDofPx.toFixed(2)}px)`
                : undefined,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      {!part.background.hidden &&
        (bgCameraDofPx > 0 ? (
          <div
            className="absolute inset-0"
            style={{
              filter: `blur(${bgCameraDofPx.toFixed(2)}px)`,
              pointerEvents: "none",
            }}
          >
            <BackgroundLayerView
              animationsEnabled={animationsEnabled}
              background={part.background}
              canSelect={active && canSelect}
              duration={part.duration}
              exportTileFrameBounds={exportTileFrameBounds}
              frameScale={renderMode === "export" ? frameScale : 1}
              previewTime={localTime}
              renderMode={renderMode}
              onPointerDown={undefined}
            />
          </div>
        ) : (
          <BackgroundLayerView
            animationsEnabled={animationsEnabled}
            background={part.background}
            canSelect={active && canSelect}
            duration={part.duration}
            exportTileFrameBounds={exportTileFrameBounds}
            frameScale={renderMode === "export" ? frameScale : 1}
            previewTime={localTime}
            renderMode={renderMode}
            onPointerDown={undefined}
          />
        ))}
      {(() => {
        const parentTransforms = buildFrameObjectParentTransformLookup(
          part.objects,
          localTime,
          part.duration,
          animationsEnabled,
        );
        const childFrameScale = renderMode === "export" ? frameScale : 1;
        return part.objects
          .filter(
            (obj) =>
              !obj.hidden &&
              isObjectInExportTile(obj, exportTileFrameBounds) &&
              !(hideNullObjects && obj.type === "null"),
          )
          .map((object) => (
            <FrameObjectView
              key={object.id}
              activeShapeTool={active ? activeShapeTool : undefined}
              animationsEnabled={animationsEnabled}
              cameraDofPx={dofPxByObjectId.get(object.id)}
              exportTileFrameBounds={exportTileFrameBounds}
              object={object}
              parentTransform={parentTransforms.get(object.id)}
              canSelect={active && canSelect}
              duration={part.duration}
              editing={
                active && !isPlaying && editingTextObjectId === object.id
              }
              focusPicking={active && focusPicking}
              frameScale={childFrameScale}
              isPlaying={isPlaying}
              previewTime={localTime}
              liveTimeOffset={localTime - renderClockSceneTime}
              renderMode={renderMode}
              onDoubleClick={(event) => {
                if (
                  active &&
                  !isPlaying &&
                  (activeShapeTool === "text" || activeShapeTool === null)
                )
                  onTextObjectDoubleClick(event, object);
              }}
              onContextMenu={
                active && !isPlaying && onObjectContextMenu
                  ? (event) => onObjectContextMenu(event, object)
                  : undefined
              }
              onPointerDown={(event) => {
                if (active && !isPlaying && isPenDrawTool(activeShapeTool)) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                if (active && !isPlaying) onObjectPointerDown(event, object);
              }}
              onTextEditCommit={(content, richText, bounds) =>
                onTextEditCommit(object.id, content, richText, bounds)
              }
              onTextEditEnd={onTextEditEnd}
            />
          ));
      })()}
    </div>
  );
};

function syncRenderClockSubtree(
  root: HTMLDivElement | null,
  stateRef: {
    current: { playing: boolean; time: number; mode: "preview" | "export" };
  },
) {
  syncDomAnimationsToRenderClock(root, stateRef.current);
  const frame = requestAnimationFrame(() =>
    syncDomAnimationsToRenderClock(root, stateRef.current),
  );
  const observer =
    typeof MutationObserver !== "undefined" && root
      ? new MutationObserver(() =>
          syncDomAnimationsToRenderClock(root, stateRef.current),
        )
      : null;
  if (observer && root)
    observer.observe(root, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
