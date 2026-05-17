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
import type { CompositionBackend } from "./CompositionBackend";

export const DomBackend: CompositionBackend = function DomBackend({
  active,
  activeShapeTool,
  animationsEnabled,
  canSelect,
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
  const renderClockStyle = useMemo(
    () => getRenderClockStyle(renderClockState) as CSSProperties,
    [renderClockState],
  );

  useLayoutEffect(() => {
    renderClockStateRef.current = renderClockState;
    applyRenderClockStateToElement(hostRef.current, renderClockState);
  }, [hostRef, renderClockState]);

  useLayoutEffect(
    () => syncRenderClockSubtree(hostRef.current, renderClockStateRef),
    [hostRef],
  );

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden"
      data-clipper-render-clock-layer
      data-clipper-render-clock-offset={localTime - renderClockSceneTime}
      {...getRenderClockAttributes(renderClockState)}
      style={{ ...(part.frame.style as CSSProperties), ...renderClockStyle }}
    >
      {!part.background.hidden && (
        <BackgroundLayerView
          animationsEnabled={animationsEnabled}
          background={part.background}
          canSelect={active && canSelect}
          duration={part.duration}
          exportTileFrameBounds={exportTileFrameBounds}
          frameScale={frameScale}
          previewTime={localTime}
          renderMode={renderMode}
          onPointerDown={undefined}
        />
      )}
      {part.objects
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
            parentTransform={buildFrameObjectParentTransformLookup(
              part.objects,
              localTime,
              part.duration,
              animationsEnabled,
            ).get(object.id)}
            canSelect={active && canSelect}
            duration={part.duration}
            editing={active && !isPlaying && editingTextObjectId === object.id}
            focusPicking={active && focusPicking}
            frameScale={frameScale}
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
        ))}
    </div>
  );
};

function applyRenderClockStateToElement(
  element: HTMLElement | null,
  state: { playing: boolean; time: number; mode: "preview" | "export" },
  attrs = getRenderClockAttributes(state),
  style = getRenderClockStyle(state),
) {
  if (!element) return;
  for (const [key, value] of Object.entries(attrs))
    element.setAttribute(key, value);
  for (const [key, value] of Object.entries(style))
    element.style.setProperty(key, String(value));
  syncDomAnimationsToRenderClock(element, state);
}

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
