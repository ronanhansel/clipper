import { Link2 } from "lucide-react";
import { useMemo, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject } from "react";
import type { TimelineNodeContextTarget, TimelineSelectionDrag } from "../../app/types";
import { getMotionEffectPackage } from "../../core/effects/registry";
import { isMotionMarkerOnLayerId, isTimelineMarkerMendedEdge } from "../../core/timeline";
import type { MotionMarker, TimelinePart } from "../../core/types";
import { TimelineBlock, TimelineLayerLane } from "./TimelinePrimitives";
import { TimelineSelectionBox } from "./TimelineSelectionBox";
import { timelineBlockPreviewKey, type TimelineBlockPreviewMap } from "./timelineBlockPreview";
import type { TimelinePartMotionView } from "./timelineTypes";

function timelineEdgeIndicatorClass(side: "left" | "right", mended: boolean) {
  const position = side === "left" ? "left-0" : "right-0";
  const gradient = mended ? "bg-[linear-gradient(180deg,#46f4e6,#1bb8ac)]" : "bg-[linear-gradient(180deg,#fb72c6,#db2777)]";
  return `pointer-events-none absolute inset-y-0 ${position} w-1 ${gradient}`;
}

export function MotionLane({ hidden, locked, layerId, timeline, sceneDuration, overflowVisible, timelineBlockPreviews, motionSelectionDrag, motionSelectionBoxRef, selectedMotionKeys, selectedMotionMarkerId, selectedMotionMarkerPartId, onEffectDragOver, onEffectDrop, onStartSelection, onMoveSelection, onEndSelection, onOpenBlankContextMenu, onSelectMotionMarker, onOpenNodeContextMenu, onUpdateMotionFromPointer }: { hidden: boolean; locked: boolean; layerId: string; timeline: TimelinePartMotionView[]; sceneDuration: number; overflowVisible: boolean; timelineBlockPreviews: TimelineBlockPreviewMap | null; motionSelectionDrag: TimelineSelectionDrag | null; motionSelectionBoxRef: RefObject<HTMLDivElement | null>; selectedMotionKeys: Set<string>; selectedMotionMarkerId: string | null; selectedMotionMarkerPartId: string | null; onEffectDragOver: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop: (event: DragEvent<HTMLDivElement>) => void; onStartSelection: (event: PointerEvent<HTMLDivElement>) => void; onMoveSelection: (event: PointerEvent<HTMLDivElement>) => void; onEndSelection: (event: PointerEvent<HTMLDivElement>) => void; onOpenBlankContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onSelectMotionMarker: (partId: string, markerId: string) => void; onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void; onUpdateMotionFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: MotionMarker, action: "move" | "start" | "end") => void }) {
  const motionMarkerEdges = useMemo(() => {
    const edges = new Map<string, { left: boolean; right: boolean }>();
    for (const timelinePart of timeline) {
      for (const marker of timelinePart.motionMarkers) {
        edges.set(timelineBlockPreviewKey("motion", timelinePart.id, marker.id), {
          left: isTimelineMarkerMendedEdge(timeline, timelinePart, marker, "start"),
          right: isTimelineMarkerMendedEdge(timeline, timelinePart, marker, "end"),
        });
      }
    }
    return edges;
  }, [timeline]);

  return <TimelineLayerLane hidden={hidden} locked={locked} overflowVisible={overflowVisible} className="block" onDragOver={onEffectDragOver} onDrop={onEffectDrop} onPointerDown={onStartSelection} onPointerMove={onMoveSelection} onPointerUp={onEndSelection} onPointerCancel={onEndSelection} onContextMenu={onOpenBlankContextMenu}>
    {motionSelectionDrag ? <TimelineSelectionBox boxRef={motionSelectionBoxRef} drag={motionSelectionDrag} /> : null}
    {timeline.flatMap((timelinePart) => timelinePart.motionMarkers.filter((marker) => isMotionMarkerOnLayerId(marker, layerId)).map((marker) => {
      const effectKind = marker.kind as string;
      const effectId = marker.effectId ?? `clipper.motion.${marker.kind}`;
      const markerKey = timelineBlockPreviewKey("motion", timelinePart.id, marker.id);
      const previewMarker = timelineBlockPreviews?.[markerKey] ?? marker;
      const leftMended = motionMarkerEdges.get(markerKey)?.left ?? false;
      const rightMended = motionMarkerEdges.get(markerKey)?.right ?? false;
      const leftIndicator = leftMended || marker.snapIn ? <span className={timelineEdgeIndicatorClass("left", leftMended && !marker.snapIn)} /> : null;
      const rightIndicator = rightMended || marker.snapOut ? <span className={timelineEdgeIndicatorClass("right", rightMended && !marker.snapOut)} /> : null;
      return (
        <TimelineBlock variant="motion" squareLeft={leftMended} squareRight={rightMended} dataAttributes={{ "data-timeline-marker-kind": "motion", "data-timeline-motion-kind": effectKind, "data-timeline-marker-part-id": timelinePart.id, "data-timeline-marker-id": marker.id }} locked={locked} selected={selectedMotionKeys.has(`${timelinePart.id}:${marker.id}`) || (marker.id === selectedMotionMarkerId && timelinePart.id === selectedMotionMarkerPartId)} key={`${effectKind}-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + previewMarker.start) / sceneDuration) * 100}%`, width: `calc(${(previewMarker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectMotionMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateMotionFromPointer(event, timelinePart, marker, "move")} onLeftResize={(event) => onUpdateMotionFromPointer(event, timelinePart, marker, "start")} onRightResize={(event) => onUpdateMotionFromPointer(event, timelinePart, marker, "end")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "motion", partId: timelinePart.id, markerId: marker.id })} leftHandle={leftIndicator} rightHandle={rightIndicator}>
          <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{getMotionMarkerTimelineLabel(marker, effectId)}</span>
          {marker.kind === "pan" && marker.followId ? <Link2 className="pointer-events-none absolute bottom-1 left-1 text-white/85" size={9} strokeWidth={2.5} /> : null}
        </TimelineBlock>
      );
    }))}
  </TimelineLayerLane>;
}

function getMotionMarkerTimelineLabel(marker: { name?: string }, effectId: string) {
  return marker.name?.trim() || getMotionEffectPackage(effectId)?.label || "Motion";
}
