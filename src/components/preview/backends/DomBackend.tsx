import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
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
  getActiveCameraObjectProps,
  useCompositionCamera,
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
import { FRAME_HEIGHT } from "../../../core/types";
import type { CompositionBackend } from "./CompositionBackend";

export const DomBackend: CompositionBackend = function DomBackend({
  active,
  activeShapeTool,
  animationsEnabled,
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

  const innerCamera = useCompositionCamera({
    part,
    localTime,
  });
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

  const activeCamera = useMemo(
    () => getActiveCameraObjectProps(part, localTime),
    [part, localTime],
  );

  // DoF applies only to layers with `threeD === true`. 2D layers always
  // render sharp on the composition plane (matches AE).
  // TODO: hoist evaluatedObject up so DoF and FrameObjectView share one
  // evaluation. For v1 we accept a duplicate `evaluateObjectState` call
  // per object — DoF only needs the translateZ scalar and the bounds.
  // TODO: enable DoF in export mode once the export path is determinised.
  const dofPxByObjectId = useMemo(() => {
    const map = new Map<string, number>();
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
  }, [activeCamera, localTime, part.objects, renderMode]);

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

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-clipper-render-clock-layer
      data-clipper-render-clock-offset={localTime - renderClockSceneTime}
      {...getRenderClockAttributes(renderClockState)}
      style={{
        ...(part.frame.style as CSSProperties),
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
