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
import { FRAME_WIDTH, type CameraObjectProps } from "../../../core/types";
import type { CompositionBackend } from "./CompositionBackend";

export const DomBackend: CompositionBackend = function DomBackend({
  active,
  activeShapeTool,
  animationsEnabled,
  canSelect,
  cameraPreviewOverride,
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
  const activeCamera =
    cameraPreviewOverride ?? previewCameraOverride ?? activeCameraBase;

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
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      {!part.background.hidden && (
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
      )}
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
