import { Link2 } from "lucide-react";
import { useMemo, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject } from "react";
import type { TimelineNodeContextTarget, TimelineSelectionDrag } from "../../app/types";
import { getEffectPackage, getMotionEffectPackage } from "../../core/effects/registry";
import { isExplicitTimelineMarkerMend } from "../../core/timeline";
import type { EffectTimelineGradient, MotionEffectId, TimelinePart, TranslationMarker, ZoomMarker } from "../../core/types";
import { getTranslationMarkerLayerId, getTranslationMarkerLayerKind, getZoomMarkerLayerId } from "../../core/timeline";
import { TimelineBlock, TimelineLayerLane } from "./TimelinePrimitives";
import { TimelineSelectionBox } from "./TimelineSelectionBox";
import { timelineBlockPreviewKey, type TimelineBlockPreviewMap } from "./timelineBlockPreview";
import type { TimelinePartMotionView } from "./timelineTypes";

export function isZoomMarkerOnLayer(marker: ZoomMarker, layerId: string) {
  return marker.layerId === layerId;
}

export function isAnyTranslationMarkerOnLayer(marker: TranslationMarker, layerId: string) {
  return marker.layerId === layerId;
}

function timelineEdgeIndicatorClass(side: "left" | "right", mended: boolean) {
  const position = side === "left" ? "left-0" : "right-0";
  const gradient = mended ? "bg-[linear-gradient(180deg,#46f4e6,#1bb8ac)]" : "bg-[linear-gradient(180deg,#fb72c6,#db2777)]";
  return `pointer-events-none absolute inset-y-0 ${position} w-1 ${gradient}`;
}

export function isZoomMarkerMendedEdge(timeline: TimelinePartMotionView[], part: TimelinePartMotionView, marker: ZoomMarker, edge: "start" | "end") {
  const markers = timeline.flatMap((timelinePart) => timelinePart.zoomMarkers
    .filter((item) => getZoomMarkerLayerId(item) === getZoomMarkerLayerId(marker))
    .map((item) => ({ ...item, partId: timelinePart.id, start: timelinePart.start + item.start })))
    .sort((left, right) => left.start - right.start);
  const markerIndex = markers.findIndex((item) => item.partId === part.id && item.id === marker.id);
  if (markerIndex < 0) return false;

  if (edge === "start") return Boolean(markers[markerIndex - 1] && isExplicitTimelineMarkerMend(markers[markerIndex - 1], markers[markerIndex]));

  return Boolean(markers[markerIndex + 1] && isExplicitTimelineMarkerMend(markers[markerIndex], markers[markerIndex + 1]));
}

export function isTranslationMarkerMendedEdge(timeline: TimelinePartMotionView[], part: TimelinePartMotionView, marker: TranslationMarker, edge: "start" | "end") {
  const markerKind = getTranslationMarkerLayerKind(marker);
  const markers = timeline.flatMap((timelinePart) => timelinePart.translationMarkers
    .filter((item) => getTranslationMarkerLayerId(item) === getTranslationMarkerLayerId(marker) && getTranslationMarkerLayerKind(item) === markerKind)
    .map((item) => ({ ...item, partId: timelinePart.id, start: timelinePart.start + item.start })))
    .sort((left, right) => left.start - right.start);
  const markerIndex = markers.findIndex((item) => item.partId === part.id && item.id === marker.id);
  if (markerIndex < 0) return false;

  if (edge === "start") return Boolean(markers[markerIndex - 1] && isExplicitTimelineMarkerMend(markers[markerIndex - 1], markers[markerIndex]));

  return Boolean(markers[markerIndex + 1] && isExplicitTimelineMarkerMend(markers[markerIndex], markers[markerIndex + 1]));
}

export function MotionLane({ hidden, locked, layerId, timeline, sceneDuration, overflowVisible, timelineBlockPreviews, motionGradient, zoomSelectionDrag, zoomSelectionBoxRef, translationSelectionDrag, translationSelectionBoxRef, selectedMotionKeys, selectedMotionMarkerId, selectedMotionMarkerPartId, onEffectDragOver, onEffectDrop, onStartSelection, onMoveSelection, onEndSelection, onOpenBlankContextMenu, onSelectMotionMarker, onOpenNodeContextMenu, onUpdateZoomFromPointer, onUpdateTranslationFromPointer }: { hidden: boolean; locked: boolean; layerId: string; timeline: TimelinePartMotionView[]; sceneDuration: number; overflowVisible: boolean; timelineBlockPreviews: TimelineBlockPreviewMap | null; motionGradient?: EffectTimelineGradient; zoomSelectionDrag: TimelineSelectionDrag | null; zoomSelectionBoxRef: RefObject<HTMLDivElement | null>; translationSelectionDrag: TimelineSelectionDrag | null; translationSelectionBoxRef: RefObject<HTMLDivElement | null>; selectedMotionKeys: Set<string>; selectedMotionMarkerId: string | null; selectedMotionMarkerPartId: string | null; onEffectDragOver: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop: (event: DragEvent<HTMLDivElement>) => void; onStartSelection: (event: PointerEvent<HTMLDivElement>) => void; onMoveSelection: (event: PointerEvent<HTMLDivElement>) => void; onEndSelection: (event: PointerEvent<HTMLDivElement>) => void; onOpenBlankContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onSelectMotionMarker: (partId: string, markerId: string) => void; onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void; onUpdateZoomFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") => void; onUpdateTranslationFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") => void }) {
  const motionMarkerEdges = useMemo(() => {
    const edges = new Map<string, { left: boolean; right: boolean }>();
    for (const timelinePart of timeline) {
      for (const marker of timelinePart.translationMarkers) {
        edges.set(timelineBlockPreviewKey("motion", timelinePart.id, marker.id), {
          left: isTranslationMarkerMendedEdge(timeline, timelinePart, marker, "start"),
          right: isTranslationMarkerMendedEdge(timeline, timelinePart, marker, "end"),
        });
      }
      for (const marker of timelinePart.zoomMarkers) {
        edges.set(timelineBlockPreviewKey("motion", timelinePart.id, marker.id), {
          left: isZoomMarkerMendedEdge(timeline, timelinePart, marker, "start"),
          right: isZoomMarkerMendedEdge(timeline, timelinePart, marker, "end"),
        });
      }
    }
    return edges;
  }, [timeline]);

  return <TimelineLayerLane hidden={hidden} locked={locked} overflowVisible={overflowVisible} className="block" onDragOver={onEffectDragOver} onDrop={onEffectDrop} onPointerDown={onStartSelection} onPointerMove={onMoveSelection} onPointerUp={onEndSelection} onPointerCancel={onEndSelection} onContextMenu={onOpenBlankContextMenu}>
    {zoomSelectionDrag ? <TimelineSelectionBox boxRef={zoomSelectionBoxRef} drag={zoomSelectionDrag} /> : null}
    {translationSelectionDrag ? <TimelineSelectionBox boxRef={translationSelectionBoxRef} drag={translationSelectionDrag} /> : null}
    {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.filter((marker) => isAnyTranslationMarkerOnLayer(marker, layerId)).map((marker) => {
      const markerKind = getTranslationMarkerLayerKind(marker);
      const effectId = marker.effectId ?? (markerKind === "rotate" ? "clipper.motion.rotate" : markerKind === "perspective" ? "clipper.motion.perspective" : "clipper.motion.pan");
      const markerKey = timelineBlockPreviewKey("motion", timelinePart.id, marker.id);
      const previewMarker = timelineBlockPreviews?.[markerKey] ?? marker;
      const leftMended = motionMarkerEdges.get(markerKey)?.left ?? false;
      const rightMended = motionMarkerEdges.get(markerKey)?.right ?? false;
      return (
        <TimelineBlock variant="translation" gradient={motionGradient ?? getEffectPackage(effectId)?.timelineGradient} squareLeft={leftMended} squareRight={rightMended} dataAttributes={{ "data-timeline-marker-kind": "motion", "data-timeline-motion-kind": "translation", "data-timeline-marker-part-id": timelinePart.id, "data-timeline-marker-id": marker.id }} locked={locked} selected={selectedMotionKeys.has(`${timelinePart.id}:${marker.id}`) || (marker.id === selectedMotionMarkerId && timelinePart.id === selectedMotionMarkerPartId)} muted key={`translation-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + previewMarker.start) / sceneDuration) * 100}%`, width: `calc(${(previewMarker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectMotionMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "move")} onLeftResize={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "start")} onRightResize={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "end")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "motion", partId: timelinePart.id, markerId: marker.id })} leftHandle={marker.snapIn && !leftMended ? <span className={timelineEdgeIndicatorClass("left", false)} /> : null} rightHandle={marker.snapOut ? <span className={timelineEdgeIndicatorClass("right", rightMended)} /> : null}>
          <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{getTranslationMarkerTimelineLabel(marker, effectId)}</span>
          {markerKind === "pan" && marker.followId ? <Link2 className="pointer-events-none absolute bottom-1 left-1 text-white/85" size={9} strokeWidth={2.5} /> : null}
        </TimelineBlock>
      );
    }))}
    {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.filter((marker) => isZoomMarkerOnLayer(marker, layerId)).map((marker) => {
      const markerKey = timelineBlockPreviewKey("motion", timelinePart.id, marker.id);
      const leftMended = motionMarkerEdges.get(markerKey)?.left ?? false;
      const rightMended = motionMarkerEdges.get(markerKey)?.right ?? false;
      const previewMarker = timelineBlockPreviews?.[markerKey] ?? marker;
      return <TimelineBlock variant="zoom" gradient={getEffectPackage(marker.effectId ?? "clipper.motion.zoom")?.timelineGradient} squareLeft={leftMended} squareRight={rightMended} dataAttributes={{ "data-timeline-marker-kind": "motion", "data-timeline-motion-kind": "zoom", "data-timeline-marker-part-id": timelinePart.id, "data-timeline-marker-id": marker.id }} locked={locked} selected={selectedMotionKeys.has(`${timelinePart.id}:${marker.id}`) || (marker.id === selectedMotionMarkerId && timelinePart.id === selectedMotionMarkerPartId)} key={`zoom-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + previewMarker.start) / sceneDuration) * 100}%`, width: `calc(${(previewMarker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectMotionMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "move")} onLeftResize={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "start")} onRightResize={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "end")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "motion", partId: timelinePart.id, markerId: marker.id })} leftHandle={marker.snapIn && !leftMended ? <span className={timelineEdgeIndicatorClass("left", false)} /> : null} rightHandle={marker.snapOut ? <span className={timelineEdgeIndicatorClass("right", rightMended)} /> : null}>
        <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{getZoomMarkerTimelineLabel(marker)}</span>
      </TimelineBlock>;
    }))}
  </TimelineLayerLane>;
}

function getTimelineMarkerName(marker: Pick<ZoomMarker | TranslationMarker, "name">, fallback: string) {
  return marker.name?.trim() || fallback;
}

function getTranslationMarkerTimelineLabel(marker: TranslationMarker, effectId: MotionEffectId) {
  return getTimelineMarkerName(marker, getMotionEffectPackage(effectId)?.label ?? "Motion");
}

function getZoomMarkerTimelineLabel(marker: ZoomMarker) {
  return getTimelineMarkerName(marker, getMotionEffectPackage(marker.effectId ?? "clipper.motion.zoom")?.label ?? "Zoom");
}
