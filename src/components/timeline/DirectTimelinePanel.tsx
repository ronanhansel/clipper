import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import { TIMELINE_MOTION_PART_ID, type AdjustmentLayerSelection, type CompositionSelection, type MotionMarkerSelection, type TimelineNodeContextTarget, type TimelineSelectionDrag } from "../../app/types";
import { clamp, roundTenth, roundTwo } from "../../core/math";
import { buildLinearTimeline, getAdjustmentLayerRowId, getAdjustmentPlacement, getMendedMarkerDragItems, getMotionMarkerLayerId, getScrubSnapBoundaries, getTimelineDragConstraintItems, getTimelineMarkerDragSnapBoundaries, getTimelineMarkerMoves, getTimelinePartAtTime, getTimelineTicks, getTopTimelineItemAtTime, isMotionMarkerOnLayerId, isTimelineMarkerMendedEdge, resizeTimelineMarkersWithPush, timelineDisplayDuration as getTimelineDisplayDuration, uniqueTimelineDragItems, type TimelineMarkerDragItem, type TimelineMarkerMove, type TimelineMarkerResize } from "../../core/timeline";
import { getTimelineBlockTiming, getTimelineDragDeltaSeconds, getTimelineSnapGuideTime } from "../../core/timelineBlockTiming";
import { defaultTimelineLayerState } from "../../core/project";
import { getAdjustmentEffectPackage, getEffectDragType, getEffectPackage, getMotionEffectPackage, installedEffectPackages } from "../../core/effects/registry";
import { applyTimelineBlockPreview, clearTimelineBlockPreview, getTimelineBlockLayerPreview, getTimelineLayerRowAtClientY, moveTimelineStateLayer, renameTimelineStateLayer, toggleTimelineStateLayerHidden, toggleTimelineStateLayerLocked, type TimelineLayerCategory } from "../../core/timelineLayers";
import type { AdjustmentEffectId, AdjustmentLayer, MotionBlockEffectKind, MotionEffectId, MotionEffectKind, MotionMarker, Part, TimelineMotionLayerKind, TimelinePart } from "../../core/types";
import { getMotionMarkerViews } from "../../core/motionEffects";
import { compositionDragPreviewEvent, compositionPointerDragEvent, effectDragPreviewEvent, effectPointerDragEvent, setClipperPointerDragPreview, type CompositionPointerDragDetail, type EffectPointerDragDetail } from "../../lib/pointerDrag";
import { useTimelineScrubber } from "./useTimelineScrubber";
import { TimelineShell } from "./TimelineShell";
import { MotionLane } from "./MotionLane";
import { EffectDragPreviewBlock, CompositionTimelineBlock, LayerLabel, LayerResizeSeparator, TimelineBlock, TimelineLayerLane } from "./TimelinePrimitives";
import { TimelineSelectionBox, updateTimelineSelectionBoxElement } from "./TimelineSelectionBox";
import { useTimelineDragAutoScroll } from "./useTimelineDragAutoScroll";
import { useTimelinePointerTransaction } from "./useTimelinePointerTransaction";
import { buildDirectTimelineModel } from "./directTimelineModel";
import { useTimelineRowResize } from "./useTimelineRowResize";
import { useTimelineViewportController } from "./useTimelineViewportController";
import { timelineBlockPreviewKey, type TimelineBlockPreviewMap } from "./timelineBlockPreview";
import type { AbsoluteTimelineMarker, EffectDragPreview, TimelinePanelProps, TimelinePartMotionView } from "./timelineTypes";

export function DirectTimelinePanel({ timelineName, timeline, motionMarkers = [], timelineLayers, adjustmentLayers, timelineViewportState, mode, selectedPartId, selectedParts, selectedMotionMarkerPartId, selectedMotionMarkerId, selectedMotionMarkers, selectedAdjustmentLayerId, selectedAdjustmentLayers, sceneDuration, currentSceneTime, isPlaying, playbackPlayheadRef, scrubbingRef, fastSelectEnabled, scrubCommitThrottleMs, defaultNewMarkerDurationSeconds, timelineEndPaddingFraction, scrubSnapEnabled, onScrub, onScrubStart, onScrubEnd, onModeChange, onTimelineViewportStateChange, onTimelineLayersChange, onAddCompositionLayer, onRemoveCompositionLayer, onAddAdjustmentLayer, onRemoveAdjustmentLayer, onAddMotionLayer, onRemoveMotionLayer, onSelectPart, onOpenComposePart, onSelectMotionMarker, onSelectMotionMarkers, onSelectAdjustmentLayer, onSelectAdjustmentLayers, onSelectTimelineNodes, onClearTimelineSelection, onOpenNodeContextMenu, onOpenBlankContextMenu, onMoveAdjustmentLayer, onUpdateAdjustmentLayer, onReorderPart, onMoveComposition, onMoveCompositions, onUpdateComposition, onMoveMotionMarker, onMoveMotionMarkers, onUpdateMotionMarkers, onResizeMotionMarkers, onAddComposition, onAddAdjustmentEffect, onAddMotionEffect }: TimelinePanelProps) {
  const timelineDisplayDuration = getTimelineDisplayDuration(sceneDuration, timelineEndPaddingFraction);
  const timelineMotionViews = useMemo<TimelinePartMotionView[]>(() => timeline.map((timelinePart) => ({ ...timelinePart, ...getMotionMarkerViews(timelinePart) })), [timeline]);
  const motionTimeline = useMemo<TimelinePartMotionView[]>(() => [{ id: TIMELINE_MOTION_PART_ID, name: "Timeline motion", filePath: "", start: 0, end: timelineDisplayDuration, duration: timelineDisplayDuration, frame: { width: 1920, height: 1080, style: {} }, background: { id: "timeline-motion-background", name: "Background", style: {}, elements: [] }, objects: [], snapshot: [], ...getMotionMarkerViews({ motionMarkers }) }], [motionMarkers, timelineDisplayDuration]);
  const ticks = useMemo(() => getTimelineTicks(timelineDisplayDuration), [timelineDisplayDuration]);
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingTimelineBlockCategory, setDraggingTimelineBlockCategory] = useState<TimelineLayerCategory | null>(null);
  const [adjustmentSelectionDrag, setAdjustmentSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [motionSelectionDrag, setMotionSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [timelineSelectionDrag, setTimelineSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [motionLayerMenuId, setMotionLayerMenuId] = useState<string | null>(null);
  const [effectDragPreview, setEffectDragPreview] = useState<EffectDragPreview | null>(null);
  const [timelineDragActive, setTimelineDragActive] = useState(false);
  const effectDragPreviewRef = useRef<EffectDragPreview | null>(null);
  const effectDragPreviewElementRef = useRef<HTMLDivElement | null>(null);
  const effectDragPreviewFrameRef = useRef(0);
  const adjustmentSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const motionSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const timelineSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const adjustmentSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const motionSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const timelineSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const adjustmentSelectionFrameRef = useRef(0);
  const motionSelectionFrameRef = useRef(0);
  const timelineSelectionFrameRef = useRef(0);
  const liveAdjustmentSelectionIdsRef = useRef("");
  const liveMotionSelectionIdsRef = useRef("");
  const liveTimelineSelectionIdsRef = useRef("");
  const currentSceneTimeRef = useRef(currentSceneTime);
  const [, setShiftSnapActive] = useState(false);
  const provisionalContentWidth = Math.max(timelineDisplayDuration * defaultTimelinePixelsPerSecond * timelineViewportState.zoom, 160);
  const { timelineRef, timelineViewportRef, timelineRulerViewportRef, timelineLayerRailRef, timelineSnapGuideRef, timelineZoom, updateTimelineZoom, syncTimelineRulerScroll, saveTimelineDisplacement, scrollTimelineFromLayerRail, updateTimelineSnapGuide, clearTimelineSnapGuide } = useTimelineViewportController({
    contentWidth: provisionalContentWidth,
    currentTime: currentSceneTime,
    displayDuration: timelineDisplayDuration,
    playbackPlayheadRef,
    timelineViewportState,
    onTimelineViewportStateChange,
  });
  const [timelineBlockPreviews, setTimelineBlockPreviews] = useState<TimelineBlockPreviewMap | null>(null);
  const timelineBlockPreviewsRef = useRef<TimelineBlockPreviewMap | null>(null);
  const selectedAdjustmentLayerIds = useMemo(() => new Set(selectedAdjustmentLayers.map((selection) => selection.layerId)), [selectedAdjustmentLayers]);
  const selectedPartIds = useMemo(() => new Set(selectedParts.map((selection) => selection.partId)), [selectedParts]);
  const selectedMotionKeys = useMemo(() => new Set(selectedMotionMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedMotionMarkers]);
  const scrubSnapBoundaries = useMemo(() => getScrubSnapBoundaries(timeline, adjustmentLayers), [adjustmentLayers, timeline]);
  const contentWidth = Math.max(timelineDisplayDuration * defaultTimelinePixelsPerSecond * timelineZoom, 160);
  const [resizePreviewRowHeights, setResizePreviewRowHeights] = useState<Record<string, number> | null>(null);
  const rowHeights = resizePreviewRowHeights ?? timelineLayers.rowHeights ?? {};
  const { adjustmentRows, compositionRows, isCompositionMode, laneContentHeight, laneRowsStyle, layerLayout, layerRows, layerRowHeights, layerRowStarts, motionLayers, timelineMarkersEditable } = buildDirectTimelineModel({ mode, rowHeights, timelineLayers });
  const layerRailWidth = 260;
  const isDraggingAdjustmentLayer = draggingTimelineBlockCategory === "adjust";
  const isDraggingMotionMarker = draggingTimelineBlockCategory === "motion";
  const isDraggingCompositionBlock = draggingTimelineBlockCategory === "comp";

  useEffect(() => () => {
    if (adjustmentSelectionFrameRef.current) window.cancelAnimationFrame(adjustmentSelectionFrameRef.current);
    if (motionSelectionFrameRef.current) window.cancelAnimationFrame(motionSelectionFrameRef.current);
    if (effectDragPreviewFrameRef.current) window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
    clearTimelineSnapGuide();
    setGlobalTimelineDragActive(false);
  }, []);

  function setGlobalTimelineDragActive(active: boolean) {
    setTimelineDragActive(active);
  }

  function withPlayheadSnapBoundary(boundaries: number[]) {
    return Array.from(new Set([...boundaries, currentSceneTimeRef.current])).sort((left, right) => left - right);
  }

  currentSceneTimeRef.current = currentSceneTime;

  function selectTimelineItemAtTime(time: number) {
    if (!isCompositionMode) {
      const part = getTimelinePartAtTime(timeline, time > 0 ? time - 0.000001 : time);
      if (part && !isCompositionLocked(part)) onSelectPart(part.id);
      return;
    }

    const item = getTopTimelineItemAtTime(motionTimeline, time, adjustmentLayers, motionLayers, adjustmentRows.map((row) => row.key)) ?? getTopTimelineItemAtTime(timeline, time, adjustmentLayers, [], adjustmentRows.map((row) => row.key));
    if (!item) return;
    if (item.kind === "adjustment") {
      if (isAdjustmentLocked(item.layer)) return;
      onSelectAdjustmentLayer(item.layer.id);
      return;
    }
    if (item.kind === "motion") {
      const marker = item.marker;
      if (isMotionMarkerLocked(marker)) return;
      onSelectMotionMarker(item.part.id, item.marker.id);
      return;
    }
    if (isCompositionLocked(item.part)) return;
    onSelectPart(item.part.id);
  }

  const { getTimelineEdgeScrollDelta, startScrub, continueScrub, endScrub, timeFromClientX } = useTimelineScrubber({
    duration: sceneDuration,
    displayDuration: timelineDisplayDuration,
    playbackPlayheadRef,
    scrubbingRef,
    timelineRef,
    viewportRef: timelineViewportRef,
    fastSelectEnabled,
    scrubCommitThrottleMs,
    snapEnabled: scrubSnapEnabled,
    snapBoundaries: scrubSnapBoundaries,
    onBlurBeforeScrub: blurInspectorFocus,
    onRulerScroll: syncTimelineRulerScroll,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onSelectTime: selectTimelineItemAtTime,
    onShiftSnapActiveChange: setShiftSnapActive,
  });

  const { updateTimelineDragAutoScroll, stopTimelineDragAutoScroll } = useTimelineDragAutoScroll({
    viewportRef: timelineViewportRef,
    getTimelineEdgeScrollDelta,
    onRulerScroll: syncTimelineRulerScroll,
    onScrollPersist: saveTimelineDisplacement,
  });
  const { startTimelinePointerTransaction } = useTimelinePointerTransaction();

  function blurInspectorFocus() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (!activeElement.closest("[data-inspector-panel]")) return;
    activeElement.blur();
  }

  function startAdjustmentSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX };
    adjustmentSelectionDragRef.current = next;
    liveAdjustmentSelectionIdsRef.current = "";
    setAdjustmentSelectionDrag(next);
  }

  function adjustmentSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    return adjustmentLayers
      .filter((layer) => layer.start <= end && layer.start + layer.duration >= start)
      .map((layer) => ({ layerId: layer.id }));
  }

  function continueAdjustmentSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = adjustmentSelectionDragRef.current;
    if (!current) return;
    const next = { ...current, currentX: event.clientX };
    adjustmentSelectionDragRef.current = next;
    if (adjustmentSelectionFrameRef.current) return;
    const element = event.currentTarget;
    adjustmentSelectionFrameRef.current = window.requestAnimationFrame(() => {
      adjustmentSelectionFrameRef.current = 0;
      const drag = adjustmentSelectionDragRef.current;
      if (!drag) return;
      const rect = element.getBoundingClientRect();
      if (adjustmentSelectionBoxRef.current) updateTimelineSelectionBoxElement(adjustmentSelectionBoxRef.current, drag, rect);
      if (Math.abs(drag.currentX - drag.startX) < 4) return;
      const selection = adjustmentSelectionFromDrag(drag, rect);
      const nextSelectionIds = selection.map((item) => item.layerId).join("|");
      if (nextSelectionIds === liveAdjustmentSelectionIdsRef.current) return;
      liveAdjustmentSelectionIdsRef.current = nextSelectionIds;
      if (selection.length > 0) startTransition(() => onSelectAdjustmentLayers(selection));
    });
  }

  function endAdjustmentSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (adjustmentSelectionFrameRef.current) {
      window.cancelAnimationFrame(adjustmentSelectionFrameRef.current);
      adjustmentSelectionFrameRef.current = 0;
    }
    const selectionDrag = adjustmentSelectionDragRef.current;
    adjustmentSelectionDragRef.current = null;
    liveAdjustmentSelectionIdsRef.current = "";
    if (adjustmentSelectionBoxRef.current) adjustmentSelectionBoxRef.current.style.display = "none";
    setAdjustmentSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      onClearTimelineSelection();
      return;
    }

    const selection = adjustmentSelectionFromDrag(selectionDrag, rect);
    if (selection.length > 0) onSelectAdjustmentLayers(selection);
    else onClearTimelineSelection();
  }

  function startMotionSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX };
    motionSelectionDragRef.current = next;
    liveMotionSelectionIdsRef.current = "";
    setMotionSelectionDrag(next);
  }

  function motionSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    return motionTimeline.flatMap((timelinePart) => timelinePart.motionMarkers
      .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
      .map((marker) => ({ partId: timelinePart.id, markerId: marker.id })));
  }

  function continueMotionSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = motionSelectionDragRef.current;
    if (!current) return;
    const next = { ...current, currentX: event.clientX };
    motionSelectionDragRef.current = next;
    if (motionSelectionFrameRef.current) return;
    const element = event.currentTarget;
    motionSelectionFrameRef.current = window.requestAnimationFrame(() => {
      motionSelectionFrameRef.current = 0;
      const drag = motionSelectionDragRef.current;
      if (!drag) return;
      const rect = element.getBoundingClientRect();
      if (motionSelectionBoxRef.current) updateTimelineSelectionBoxElement(motionSelectionBoxRef.current, drag, rect);
      if (Math.abs(drag.currentX - drag.startX) < 4) return;
      const selection = motionSelectionFromDrag(drag, rect);
      const nextSelectionIds = selection.map((item) => `${item.partId}:${item.markerId}`).join("|");
      if (nextSelectionIds === liveMotionSelectionIdsRef.current) return;
      liveMotionSelectionIdsRef.current = nextSelectionIds;
      if (selection.length > 0) startTransition(() => onSelectMotionMarkers(selection));
    });
  }

  function endMotionSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (motionSelectionFrameRef.current) {
      window.cancelAnimationFrame(motionSelectionFrameRef.current);
      motionSelectionFrameRef.current = 0;
    }
    const selectionDrag = motionSelectionDragRef.current;
    motionSelectionDragRef.current = null;
    liveMotionSelectionIdsRef.current = "";
    if (motionSelectionBoxRef.current) motionSelectionBoxRef.current.style.display = "none";
    setMotionSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      onClearTimelineSelection();
      return;
    }

    const selection = motionSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectMotionMarkers(selection);
    else onClearTimelineSelection();
  }

  function startTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX, startY: event.clientY, currentY: event.clientY };
    timelineSelectionDragRef.current = next;
    liveTimelineSelectionIdsRef.current = "";
    setTimelineSelectionDrag(next);
  }

  function openBlankTimelineContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;
    onOpenBlankContextMenu(event, { time: timeFromClientX(event.clientX, false) });
  }

  function openTimelineNodeContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) {
    onOpenNodeContextMenu(event, { ...target, time: timeFromClientX(event.clientX, false) });
  }

  function timelineSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const dragTop = clamp(Math.min(selectionDrag.startY ?? rect.top, selectionDrag.currentY ?? rect.top) - rect.top, 0, rect.height);
    const dragBottom = clamp(Math.max(selectionDrag.startY ?? rect.top, selectionDrag.currentY ?? rect.top) - rect.top, 0, rect.height);
    const adjustmentSelection: AdjustmentLayerSelection[] = [];
    const compositionSelection: CompositionSelection[] = [];
    const motionSelection: MotionMarkerSelection[] = [];

    for (const [rowIndex, row] of layerRows.entries()) {
      const rowTop = layerRowStarts[rowIndex];
      const rowBottom = rowTop + layerRowHeights[rowIndex];
      if (rowBottom < dragTop || rowTop > dragBottom) continue;
      if (isLayerLocked(row.category, row.key)) continue;

      const adjustmentRow = adjustmentRows.find((item) => item.key === row.key);
      if (adjustmentRow) {
        adjustmentSelection.push(...adjustmentLayers
          .filter((layer) => getAdjustmentLayerRowId(layer) === adjustmentRow.key)
          .filter((layer) => layer.start <= end && layer.start + layer.duration >= start)
          .map((layer) => ({ layerId: layer.id })));
        continue;
      }

      const compositionRow = compositionRows.find((item) => item.id === row.key);
      if (compositionRow) {
        compositionSelection.push(...timeline
          .filter((part) => (part.layerId ?? "comp") === compositionRow.id)
          .filter((part) => part.start <= end && part.start + part.duration >= start)
          .map((part) => ({ partId: part.id })));
        continue;
      }

      const layer = motionLayers.find((item) => item.id === row.key);
      if (!layer) continue;

      motionSelection.push(...motionTimeline.flatMap((timelinePart) => timelinePart.motionMarkers
        .filter((marker) => isMotionMarkerOnLayerId(marker, layer.id))
        .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
        .map((marker) => ({ partId: timelinePart.id, markerId: marker.id }))));
    }

    return { adjustmentLayers: adjustmentSelection, compositions: compositionSelection, motionMarkers: motionSelection };
  }

  function timelineSelectionKey(selection: { adjustmentLayers: AdjustmentLayerSelection[]; compositions: CompositionSelection[]; motionMarkers: MotionMarkerSelection[] }) {
    return [
      selection.adjustmentLayers.map((item) => item.layerId).join(","),
      selection.compositions.map((item) => item.partId).join(","),
      selection.motionMarkers.map((item) => `${item.partId}:${item.markerId}`).join(","),
    ].join("|");
  }

  function continueTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = timelineSelectionDragRef.current;
    if (!current) return;
    const next = { ...current, currentX: event.clientX, currentY: event.clientY };
    timelineSelectionDragRef.current = next;
    if (timelineSelectionFrameRef.current) return;
    timelineSelectionFrameRef.current = window.requestAnimationFrame(() => {
      timelineSelectionFrameRef.current = 0;
      const drag = timelineSelectionDragRef.current;
      const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
      if (!drag || !rect) return;
      if (timelineSelectionBoxRef.current) updateTimelineSelectionBoxElement(timelineSelectionBoxRef.current, drag, rect);
      if (Math.max(Math.abs(drag.currentX - drag.startX), Math.abs((drag.currentY ?? drag.startY ?? 0) - (drag.startY ?? 0))) < 4) return;
      const selection = timelineSelectionFromDrag(drag, rect);
      const nextSelectionIds = timelineSelectionKey(selection);
      if (nextSelectionIds === liveTimelineSelectionIdsRef.current) return;
      liveTimelineSelectionIdsRef.current = nextSelectionIds;
      if (nextSelectionIds !== "||") startTransition(() => onSelectTimelineNodes(selection));
    });
  }

  function endTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (timelineSelectionFrameRef.current) {
      window.cancelAnimationFrame(timelineSelectionFrameRef.current);
      timelineSelectionFrameRef.current = 0;
    }
    const selectionDrag = timelineSelectionDragRef.current;
    timelineSelectionDragRef.current = null;
    liveTimelineSelectionIdsRef.current = "";
    if (timelineSelectionBoxRef.current) timelineSelectionBoxRef.current.style.display = "none";
    setTimelineSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
    const dragDistance = Math.max(Math.abs(selectionDrag.currentX - selectionDrag.startX), Math.abs((selectionDrag.currentY ?? selectionDrag.startY ?? 0) - (selectionDrag.startY ?? 0)));
    if (!rect || dragDistance < 4) {
      onClearTimelineSelection();
      return;
    }

    const selection = timelineSelectionFromDrag(selectionDrag, rect);
    if (timelineSelectionKey(selection) !== "||") onSelectTimelineNodes(selection);
    else onClearTimelineSelection();
  }

  function onPartDragStart(event: DragEvent<HTMLButtonElement>, partId: string) {
    setDraggedPartId(partId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", partId);
  }

  function onPartDrop(event: DragEvent<HTMLButtonElement>, targetPartId: string) {
    event.preventDefault();
    const compositionId = event.dataTransfer.getData("application/x-clipper-composition");
    if (compositionId) {
      onAddComposition(compositionId);
      setDraggedPartId(null);
      return;
    }

    const sourcePartId = draggedPartId ?? event.dataTransfer.getData("text/plain");
    if (sourcePartId) onReorderPart(sourcePartId, targetPartId);
    setDraggedPartId(null);
  }

  function selectedMotionDragItems(part: TimelinePart, marker: MotionMarker) {
    const motionKind = marker.kind;
    if (isMotionMarkerLocked(marker)) return [];
    const mendedItems = getMendedMarkerDragItems(motionTimeline, part, marker.id, motionKind);
    if (!selectedMotionKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedMotionMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.motionMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isMotionMarkerLocked(selectedMarker) ? getMendedMarkerDragItems(motionTimeline, selectedPart, selectedMarker.id, selectedMarker.kind) : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedMotionResizeTargets(part: TimelinePart, marker: MotionMarker) {
    if (isMotionMarkerLocked(marker)) return [];
    if (!selectedMotionKeys.has(`${part.id}:${marker.id}`)) return [{ part, marker }];
    const targets = selectedMotionMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.motionMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isMotionMarkerLocked(selectedMarker) ? [{ part: selectedPart, marker: selectedMarker }] : [];
    });
    return targets.length > 0 ? uniqueTimelineResizeTargets(targets) : [{ part, marker }];
  }

  function selectedAdjustmentResizeTargets(layer: AdjustmentLayer) {
    if (isAdjustmentLocked(layer)) return [];
    if (!selectedAdjustmentLayerIds.has(layer.id)) return [layer];
    const targets = selectedAdjustmentLayers.flatMap((selection) => {
      const target = adjustmentLayers.find((item) => item.id === selection.layerId);
      return target && !isAdjustmentLocked(target) ? [target] : [];
    });
    return targets.length > 0 ? uniqueAdjustmentResizeTargets(targets) : [layer];
  }

  function selectedCompositionMoveTargets(composition: TimelinePart) {
    if (isCompositionLocked(composition)) return [];
    if (!selectedPartIds.has(composition.id)) return [composition];
    const targets = selectedParts.flatMap((selection) => {
      const target = timeline.find((item) => item.id === selection.partId);
      return target && !isCompositionLocked(target) ? [target] : [];
    });
    return targets.length > 0 ? uniqueCompositionTargets(targets) : [composition];
  }

  function uniqueTimelineResizeTargets<T extends { id: string }>(targets: Array<{ part: TimelinePart; marker: T }>) {
    const seen = new Set<string>();
    return targets.filter((target) => {
      const key = `${target.part.id}:${target.marker.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueAdjustmentResizeTargets(targets: AdjustmentLayer[]) {
    const seen = new Set<string>();
    return targets.filter((target) => {
      if (seen.has(target.id)) return false;
      seen.add(target.id);
      return true;
    });
  }

  function uniqueCompositionTargets(targets: TimelinePart[]) {
    const seen = new Set<string>();
    return targets.filter((target) => {
      if (seen.has(target.id)) return false;
      seen.add(target.id);
      return true;
    });
  }

  function getAbsoluteMotionResizeMarkers(target: { part: TimelinePart; marker: MotionMarker }) {
    const targetLayerId = getMotionMarkerLayerId(target.marker);
    const targetKind = target.marker.kind;
    return motionTimeline.flatMap((timelinePart) => timelinePart.motionMarkers
      .filter((marker) => getMotionMarkerLayerId(marker) === targetLayerId && marker.kind === targetKind)
      .map((marker) => ({ ...marker, sourcePartId: timelinePart.id, sourcePartStart: timelinePart.start, start: timelinePart.start + marker.start })));
  }

  function getAbsoluteMarkerResizeState<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(markers: Array<AbsoluteTimelineMarker<T>>, markerId: string, sourcePartId: string, action: "start" | "end", deltaSeconds: number) {
    return resizeTimelineMarkersWithPush(markers, markerId, action, deltaSeconds, Number.POSITIVE_INFINITY, 0, sourcePartId).filter((marker) => {
      const initial = markers.find((item) => item.id === marker.id && item.sourcePartId === marker.sourcePartId);
      return initial && (initial.start !== marker.start || initial.duration !== marker.duration);
    });
  }

  function getTimelineMarkerResizeCommits<T extends { id: string; start: number; duration: number }>(markers: Array<AbsoluteTimelineMarker<T>>): TimelineMarkerResize[] {
    return markers.map((marker) => ({ sourcePartId: marker.sourcePartId, markerId: marker.id, absoluteStart: roundTwo(marker.start), duration: roundTwo(marker.duration) }));
  }

  function getTimelineMarkerResizePreviewMap<T extends { id: string; start: number; duration: number }>(markers: Array<AbsoluteTimelineMarker<T>>) {
    return markers.reduce((byPart, marker) => {
      const partMarkers = byPart.get(marker.sourcePartId) ?? [];
      partMarkers.push({ ...marker, start: marker.start - marker.sourcePartStart });
      byPart.set(marker.sourcePartId, partMarkers);
      return byPart;
    }, new Map<string, Array<AbsoluteTimelineMarker<T>>>());
  }

  function uniqueAbsoluteTimelineMarkers<T extends { id: string }>(markers: Array<T & { sourcePartId: string }>) {
    return Array.from(new Map(markers.map((marker) => [`${marker.sourcePartId}:${marker.id}`, marker])).values());
  }


  function blockDeltaForTimelineDrag(items: TimelineMarkerDragItem[], rawDelta: number, snapThresholdSeconds: number, snap: boolean, motionKind: MotionBlockEffectKind | undefined) {
    const constraintItems = getTimelineDragConstraintItems(items);
    const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
    const movingKeys = new Set(items.map((item) => `${item.partId}:${item.markerId}`));
    const snapBoundaries = getUniversalTimelineSnapBoundaries(motionKind, movingKeys);
    const timing = getTimelineBlockTiming({
      action: "move",
      initialStart: blockStart,
      initialDuration: blockEnd - blockStart,
      deltaSeconds: rawDelta,
      timelineDuration: timelineDisplayDuration,
      minDuration: 0.1,
      moveMaxStartMode: "start",
      endMaxMode: "none",
      snap,
      snapBoundaries,
      snapThresholdSeconds,
    });
    updateTimelineSnapGuide(timing.guideTime);
    return timing.start - blockStart;
  }

  function getUniversalTimelineSnapBoundaries(motionKind: MotionBlockEffectKind | undefined, movingKeys: Set<string>) {
    const movingEdges = getMovingMarkerEdgeTimes(motionKind, movingKeys);
    const snapTimeline = [...timelineMotionViews, ...motionTimeline];
    return withPlayheadSnapBoundary(Array.from(new Set([
      ...getScrubSnapBoundaries(snapTimeline, adjustmentLayers).filter((boundary) => !movingEdges.has(roundTenth(boundary))),
      ...getTimelineMarkerDragSnapBoundaries(snapTimeline, motionKind, movingKeys),
    ])).sort((left, right) => left - right));
  }

  function getUniversalBlockSnapBoundaries(options: { excludeCompositionIds?: Set<string>; excludeAdjustmentIds?: Set<string> } = {}) {
    const snapTimeline = [...timelineMotionViews.filter((item) => !options.excludeCompositionIds?.has(item.id)), ...motionTimeline];
    const snapAdjustments = adjustmentLayers.filter((item) => !options.excludeAdjustmentIds?.has(item.id));
    return withPlayheadSnapBoundary(getScrubSnapBoundaries(snapTimeline, snapAdjustments));
  }

  function getMovingMarkerEdgeTimes(motionKind: MotionBlockEffectKind | undefined, movingKeys: Set<string>) {
    const edges = new Set<number>();
    for (const timelinePart of timelineMotionViews) {
      const markers = motionKind ? timelinePart.motionMarkers.filter((m) => m.kind === motionKind) : timelinePart.motionMarkers;
      for (const marker of markers) {
        if (!movingKeys.has(`${timelinePart.id}:${marker.id}`)) continue;
        edges.add(roundTenth(timelinePart.start + marker.start));
        edges.add(roundTenth(timelinePart.start + marker.start + marker.duration));
      }
    }
    return edges;
  }

  function getTimelineMarkerElement(motionKind: string, partId: string, markerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-marker-kind="motion"][data-timeline-motion-kind="${CSS.escape(motionKind)}"][data-timeline-marker-part-id="${CSS.escape(partId)}"][data-timeline-marker-id="${CSS.escape(markerId)}"]`) ?? null;
  }

  function getTimelineMarkerLayerId(_kind: string, partId: string, markerId: string) {
    const timelinePart = timelineMotionViews.find((item) => item.id === partId) ?? motionTimeline.find((item) => item.id === partId);
    return timelinePart?.motionMarkers.find((marker) => marker.id === markerId)?.layerId ?? "";
  }

  function previewTimelineBlocks(previews: TimelineBlockPreviewMap) {
    timelineBlockPreviewsRef.current = previews;
    setTimelineBlockPreviews(previews);
  }

  function clearTimelineBlockPreviews() {
    if (!timelineBlockPreviewsRef.current) return;
    timelineBlockPreviewsRef.current = null;
    setTimelineBlockPreviews(null);
  }

  function previewMapFromBlocks<T extends { id: string; start: number; duration: number }>(kind: "composition" | "adjustment", blocks: T[]) {
    return Object.fromEntries(blocks.map((block) => [timelineBlockPreviewKey(kind, block.id), { start: block.start, duration: block.duration }]));
  }

  function previewMapFromMarkers<T extends { id: string; start: number; duration: number }>(markersByPart: Map<string, T[]>) {
    return Object.fromEntries(Array.from(markersByPart).flatMap(([partId, markers]) => markers.map((marker) => [timelineBlockPreviewKey("motion", partId, marker.id), { start: marker.start, duration: marker.duration }])));
  }

  function setTimelineMarkerDragTransforms(motionKind: string, items: TimelineMarkerDragItem[], deltaPixels: number, deltaYPixels = 0, previewHeight?: number) {
    for (const item of items) {
      const element = getTimelineMarkerElement(motionKind, item.partId, item.markerId);
      if (!element) continue;
      applyTimelineBlockPreview(element, { deltaX: deltaPixels, deltaY: deltaYPixels, height: previewHeight });
    }
  }

  function getDropLayerId(category: TimelineLayerCategory, clientY: number) {
    const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
    const target = getTimelineLayerRowAtClientY(layerLayout, rect, clientY, category)?.row.key;
    return target && !isLayerLocked(category, target) ? target : undefined;
  }

  function getLayerDragPreview(category: TimelineLayerCategory, sourceLayerId: string | undefined, clientY: number) {
    const preview = getTimelineBlockLayerPreview(layerLayout, category, sourceLayerId, clientY, timelineViewportRef.current?.firstElementChild?.getBoundingClientRect());
    return preview.targetLayerId && isLayerLocked(category, preview.targetLayerId) ? { targetLayerId: undefined, deltaY: 0 } : preview;
  }

  function clearTimelineMarkerDragTransforms(motionKind: string, items: TimelineMarkerDragItem[]) {
    for (const item of items) {
      const element = getTimelineMarkerElement(motionKind, item.partId, item.markerId);
      if (!element) continue;
      clearTimelineBlockPreview(element);
    }
  }

  function getTimelineAdjustmentElement(layerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-adjustment-id="${CSS.escape(layerId)}"]`) ?? null;
  }

  function setAdjustmentDragPreviews(initialLayers: AdjustmentLayer[], nextLayers: AdjustmentLayer[], pixelsPerSecond: number, deltaYPixels = 0, previewHeight?: number) {
    for (const initialLayer of initialLayers) {
      const nextLayer = nextLayers.find((item) => item.id === initialLayer.id);
      const element = getTimelineAdjustmentElement(initialLayer.id);
      if (!nextLayer || !element) continue;
      applyTimelineBlockPreview(element, { deltaX: (nextLayer.start - initialLayer.start) * pixelsPerSecond, deltaY: deltaYPixels, height: previewHeight });
    }
  }

  function clearAdjustmentResizePreviews(layers: AdjustmentLayer[]) {
    for (const layer of layers) {
      const element = getTimelineAdjustmentElement(layer.id);
      if (!element) continue;
      clearTimelineBlockPreview(element, "--clipper-adjustment-resize-width");
    }
  }

  function clearCompositionPreview(element: HTMLElement) {
    clearTimelineBlockPreview(element, "--clipper-composition-resize-width");
  }

  function updateCompositionFromPointer(event: PointerEvent<HTMLElement>, composition: TimelinePart, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const moveTargets = action === "move" ? selectedCompositionMoveTargets(composition) : [composition];
    if (moveTargets.length === 0 || isCompositionLocked(composition)) return;
    const isSelectionMove = action === "move" && selectedPartIds.has(composition.id) && moveTargets.length > 1;
    if (!isSelectionMove) onSelectPart(composition.id);
    const element = event.currentTarget.closest("[data-timeline-composition-id]") as HTMLElement | null ?? event.currentTarget;
    const initialClientX = event.clientX;
    const sourceLayerId = composition.layerId ?? "comp";
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const moveTargetIds = new Set(moveTargets.map((item) => item.id));
    const boundaries = getUniversalBlockSnapBoundaries({ excludeCompositionIds: moveTargetIds });
    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft: timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getNextBlockTiming(target: TimelinePart, clientX: number, snap: boolean, moveMinStart = 0) {
      const timing = getTimelineBlockTiming({
        action,
        initialStart: target.start,
        initialDuration: target.duration,
        deltaSeconds: getDeltaSeconds(clientX),
        timelineDuration: timelineDisplayDuration,
        minDuration: 0.1,
        moveMinStart,
        moveMaxStartMode: "start",
        endMaxMode: "none",
        snap,
        snapBoundaries: boundaries,
        snapThresholdSeconds,
      });
      return timing;
    }

    function getNextComposition(clientX: number, snap: boolean) {
      const timing = getNextBlockTiming(composition, clientX, snap);
      updateTimelineSnapGuide(timing.guideTime);
      return { ...composition, start: timing.start, duration: timing.duration };
    }

    function getNextMoveTargets(clientX: number, snap: boolean) {
      if (moveTargets.length <= 1) return [getNextComposition(clientX, snap)];
      const minStart = Math.min(...moveTargets.map((target) => target.start));
      const timing = getNextBlockTiming(composition, clientX, snap, composition.start - minStart);
      const moveDelta = timing.start - composition.start;
      updateTimelineSnapGuide(timing.guideTime);
      return moveTargets.map((target) => ({ ...target, start: target.start + moveDelta }));
    }

    function applyDrag(clientX: number, clientY: number, snap: boolean) {
      const nextComposition = getNextComposition(clientX, snap);
      const preview = action === "move" ? getLayerDragPreview("comp", sourceLayerId, clientY) : { deltaY: 0, height: undefined };
      if (isSelectionMove) {
        const nextTargets = getNextMoveTargets(clientX, snap);
        previewTimelineBlocks(previewMapFromBlocks("composition", nextTargets));
        for (const target of moveTargets) {
          const nextTarget = nextTargets.find((item) => item.id === target.id);
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (!nextTarget || !targetElement) continue;
          applyTimelineBlockPreview(targetElement, { deltaX: 0, deltaY: preview.deltaY, height: preview.height, resizeProperty: "--clipper-composition-resize-width" });
        }
        return;
      }
      previewTimelineBlocks(previewMapFromBlocks("composition", [nextComposition]));
      applyTimelineBlockPreview(element, { deltaX: 0, deltaY: preview.deltaY, height: preview.height, resizeProperty: "--clipper-composition-resize-width" });
    }

    function clearCompositionDragState() {
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      clearTimelineSnapGuide();
      window.requestAnimationFrame(() => {
        clearTimelineBlockPreviews();
        for (const target of moveTargets) {
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (targetElement) clearCompositionPreview(targetElement);
        }
      });
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        if (action === "move") setDraggingTimelineBlockCategory("comp");
      },
      onPreview: ({ clientX, clientY, snap }) => applyDrag(clientX, clientY, snap),
      onCommit: ({ clientX, clientY, snap }) => {
        const nextComposition = getNextComposition(clientX, snap);
        for (const target of moveTargets) {
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (targetElement) clearCompositionPreview(targetElement);
        }
        if (isSelectionMove) {
          const targetLayerId = getDropLayerId("comp", clientY) ?? sourceLayerId;
          onMoveCompositions(getNextMoveTargets(clientX, snap).map((target) => ({ compositionId: target.id, start: roundTenth(target.start), targetLayerId })));
        } else if (action === "move") onMoveComposition(composition.id, roundTenth(nextComposition.start), getDropLayerId("comp", clientY) ?? sourceLayerId);
        else onUpdateComposition(composition.id, (current) => ({ ...current, start: roundTenth(nextComposition.start), duration: roundTenth(nextComposition.duration) }));
      },
      onCancel: clearCompositionDragState,
      onDragEnd: clearCompositionDragState,
    });
  }

  function updateAdjustmentFromPointer(event: PointerEvent<HTMLElement>, layer: AdjustmentLayer, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const resizeTargets = selectedAdjustmentResizeTargets(layer);
    if (resizeTargets.length === 0 || isAdjustmentLocked(layer)) return;
    const isSelectionMove = action === "move" && selectedAdjustmentLayerIds.has(layer.id) && resizeTargets.length > 1;
    const isSelectionResize = action !== "move" && selectedAdjustmentLayerIds.has(layer.id) && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectAdjustmentLayer(layer.id);
    const element = event.currentTarget.closest("[data-timeline-adjustment-id]") as HTMLElement | null ?? event.currentTarget;
    const initialClientX = event.clientX;
    const sourceLayerId = getAdjustmentLayerRowId(layer);
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const resizeTargetIds = new Set(resizeTargets.map((item) => item.id));
    const boundaries = getUniversalBlockSnapBoundaries({ excludeAdjustmentIds: resizeTargetIds });
    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft: timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getNextLayer(targetLayer: AdjustmentLayer, clientX: number, snap: boolean) {
      const timing = getTimelineBlockTiming({
        action,
        initialStart: targetLayer.start,
        initialDuration: targetLayer.duration,
        deltaSeconds: getDeltaSeconds(clientX),
        timelineDuration: timelineDisplayDuration,
        minDuration: 0.1,
        moveMaxStartMode: "start",
        endMaxMode: "none",
        snap,
        snapBoundaries: boundaries,
        snapThresholdSeconds,
      });
      if (targetLayer.id === layer.id) updateTimelineSnapGuide(timing.guideTime);
      return { ...targetLayer, start: timing.start, duration: timing.duration };
    }

    function getNextLayers(clientX: number, snap: boolean) {
      return resizeTargets.map((target) => getNextLayer(target, clientX, snap));
    }

    function applyDrag(clientX: number, clientY: number, snap: boolean) {
      const nextLayer = getNextLayer(layer, clientX, snap);
      if (action === "move" && isSelectionMove) {
        const preview = getLayerDragPreview("adjust", sourceLayerId, clientY);
        setAdjustmentDragPreviews(resizeTargets, getNextLayers(clientX, snap), pixelsPerSecond, preview.deltaY, preview.height);
        return;
      }
      if (action !== "move" && isSelectionResize) {
        previewTimelineBlocks(previewMapFromBlocks("adjustment", getNextLayers(clientX, snap)));
        return;
      }
      const preview = action === "move" ? getLayerDragPreview("adjust", sourceLayerId, clientY) : { deltaY: 0, height: undefined };
      if (action === "move") applyTimelineBlockPreview(element, { deltaX: (nextLayer.start - layer.start) * pixelsPerSecond, deltaY: preview.deltaY, height: preview.height, resizeProperty: "--clipper-adjustment-resize-width" });
      else previewTimelineBlocks(previewMapFromBlocks("adjustment", [nextLayer]));
    }

    function clearAdjustmentDragState() {
      if (isSelectionMove) clearAdjustmentResizePreviews(resizeTargets);
      else if (action === "move") clearTimelineBlockPreview(element, "--clipper-adjustment-resize-width");
      else clearTimelineBlockPreviews();
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      clearTimelineSnapGuide();
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        if (action === "move") setDraggingTimelineBlockCategory("adjust");
      },
      onPreview: ({ clientX, clientY, snap }) => applyDrag(clientX, clientY, snap),
      onCommit: ({ clientX, clientY, snap }) => {
        const nextLayer = getNextLayer(layer, clientX, snap);
        clearAdjustmentDragState();
        if (action === "move") {
          const targetLayerId = getDropLayerId("adjust", clientY) ?? sourceLayerId;
          if (isSelectionMove) {
            for (const targetLayer of getNextLayers(clientX, snap)) {
              onUpdateAdjustmentLayer(targetLayer.id, () => ({ ...targetLayer, layerId: targetLayerId, start: roundTenth(targetLayer.start) }));
            }
          } else {
            onMoveAdjustmentLayer(layer.id, nextLayer.start, targetLayerId);
          }
        }
        else {
          for (const targetLayer of getNextLayers(clientX, snap)) {
            onUpdateAdjustmentLayer(targetLayer.id, () => ({ ...targetLayer, start: roundTenth(targetLayer.start), duration: roundTenth(targetLayer.duration) }));
          }
        }
      },
      onCancel: clearAdjustmentDragState,
      onDragEnd: clearAdjustmentDragState,
    });
  }

  function updateMotionMarkerFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: MotionMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const motionKind = marker.kind;
    const dragItems = selectedMotionDragItems(part, marker);
    if (dragItems.length === 0 || isMotionMarkerLocked(marker)) return;
    const resizeTargets = selectedMotionResizeTargets(part, marker);
    const targetAlreadySelected = selectedMotionKeys.has(`${part.id}:${marker.id}`);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize = action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectMotionMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const sourceLayerId = getMotionMarkerLayerId(marker);
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [`${item.partId}:${item.markerId}`, item.partId]));
    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft: timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getMoveDragState(clientX: number, clientY: number, snap: boolean) {
      const deltaSeconds = getDeltaSeconds(clientX);
      const targetLayerId = getMotionDropLayerId("motion", clientY) ?? sourceLayerId;
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, motionKind);
      const moves = getTimelineMarkerMoves(motionTimeline, dragItems, blockDeltaSeconds, motionKind, activePartIds, snapThresholdSeconds).map((move) => ({ ...move, targetLayerId }));
      return { blockDeltaSeconds, moves };
    }

    function commitMoveDrag(clientX: number, clientY: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, clientY, snap);
      if (dragItems.length > 1) {
        onMoveMotionMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move) onMoveMotionMarker(move.sourcePartId, move.markerId, move.targetPartId, move.start, move.targetLayerId);
    }

    function getResizeDeltaSeconds(clientX: number, snap: boolean) {
      let deltaSeconds = getDeltaSeconds(clientX);
      if (!snap || (action !== "start" && action !== "end")) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }
      const internalMendedEdge = isTimelineMarkerMendedEdge(motionTimeline, part as TimelinePartMotionView, marker, action);
      if (internalMendedEdge) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }

      const movingKeys = new Set(dragItems.map((item) => `${item.partId}:${item.markerId}`));
      const boundaries = getUniversalTimelineSnapBoundaries(motionKind, movingKeys);
      const edgeTime = (action === "end"
        ? Math.max(...dragItems.map((item) => item.absoluteStart + item.duration))
        : Math.min(...dragItems.map((item) => item.absoluteStart))) + deltaSeconds;
      const guideTime = getTimelineSnapGuideTime(edgeTime, boundaries, snapThresholdSeconds);
      deltaSeconds += (guideTime ?? edgeTime) - edgeTime;
      updateTimelineSnapGuide(guideTime);
      return deltaSeconds;
    }

    function getResizeDragState(clientX: number, snap: boolean) {
      return getTimelineMarkerResizePreviewMap(getResizeMarkers(clientX, snap));
    }

    function getResizeMarkers(clientX: number, snap: boolean): Array<AbsoluteTimelineMarker<MotionMarker>> {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      const resizedMarkers = resizeTargets.flatMap((target) => getAbsoluteMarkerResizeState(getAbsoluteMotionResizeMarkers(target), target.marker.id, target.part.id, action as "start" | "end", deltaSeconds));
      return uniqueAbsoluteTimelineMarkers(resizedMarkers);
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      onResizeMotionMarkers(getTimelineMarkerResizeCommits(getResizeMarkers(clientX, snap)));
    }

    function applyDrag(clientX: number, clientY: number, snap: boolean) {
      if (action === "move") {
        const { blockDeltaSeconds } = getMoveDragState(clientX, clientY, snap);
        const preview = getLayerDragPreview("motion", sourceLayerId, clientY);
        setTimelineMarkerDragTransforms(marker.kind, dragItems, blockDeltaSeconds * pixelsPerSecond, preview.deltaY, preview.height);
        return;
      }

      if (action === "start" || action === "end") {
        const nextMarkersByPart = getResizeDragState(clientX, snap);
        previewTimelineBlocks(previewMapFromMarkers(nextMarkersByPart));
        return;
      }
    }

    function clearMotionMarkerDragState() {
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      clearTimelineSnapGuide();
      if (action === "move") window.requestAnimationFrame(() => clearTimelineMarkerDragTransforms(marker.kind, dragItems));
      else clearTimelineBlockPreviews();
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        if (action === "move") setDraggingTimelineBlockCategory("motion");
      },
      onPreview: ({ clientX, clientY, snap }) => applyDrag(clientX, clientY, snap),
      onCommit: ({ clientX, clientY, snap }) => {
        if (action === "move") commitMoveDrag(clientX, clientY, snap);
        else {
          clearTimelineBlockPreviews();
          commitResizeDrag(clientX, snap);
        }
      },
      onCancel: clearMotionMarkerDragState,
      onDragEnd: clearMotionMarkerDragState,
    });
  }

  function startLayerNameEdit(layerId: string, name: string) {
    const category = getLayerCategory(layerId);
    if (category && isLayerLocked(category, layerId)) return;
    setEditingLayerId(layerId);
    setLayerNameDraft(name);
  }

  function commitLayerNameEdit() {
    const layerId = editingLayerId;
    const nextName = layerNameDraft.trim();
    setEditingLayerId(null);
    if (!layerId || !nextName) return;
    const currentCategory = getLayerCategory(layerId);
    if (currentCategory && isLayerLocked(currentCategory, layerId)) return;
    onTimelineLayersChange((state) => {
      const category = getLayerCategory(layerId);
      return category ? renameTimelineStateLayer(state, category, layerId, nextName, defaultTimelineLayerState) : state;
    }, { history: true });
  }

  function toggleLayerHidden(layerId: string) {
    const currentCategory = getLayerCategory(layerId);
    if (currentCategory && isLayerLocked(currentCategory, layerId)) return;
    onTimelineLayersChange((state) => {
      const category = getLayerCategory(layerId);
      return category ? toggleTimelineStateLayerHidden(state, category, layerId, defaultTimelineLayerState) : state;
    }, { history: false });
  }

  function toggleLayerLocked(layerId: string) {
    onTimelineLayersChange((state) => {
      const category = getLayerCategory(layerId);
      return category ? toggleTimelineStateLayerLocked(state, category, layerId, defaultTimelineLayerState) : state;
    }, { history: false });
  }

  function getLayerCategory(layerId: string): TimelineLayerCategory | null {
    if (compositionRows.some((row) => row.id === layerId)) return "comp";
    if (adjustmentRows.some((row) => row.key === layerId)) return "adjust";
    if (motionLayers.some((row) => row.id === layerId)) return "motion";
    return null;
  }

  function isLayerLocked(category: TimelineLayerCategory, layerId: string | undefined) {
    if (!layerId) return false;
    if (category === "comp") return Boolean(compositionRows.find((row) => row.id === layerId)?.locked);
    if (category === "adjust") return Boolean(adjustmentRows.find((row) => row.key === layerId)?.locked);
    return Boolean(motionLayers.find((row) => row.id === layerId)?.locked);
  }

  function isCompositionLocked(part: TimelinePart) {
    return isLayerLocked("comp", part.layerId ?? "comp");
  }

  function isAdjustmentLocked(layer: AdjustmentLayer) {
    return isLayerLocked("adjust", getAdjustmentLayerRowId(layer));
  }

  function isMotionMarkerLocked(marker: MotionMarker) {
    return isLayerLocked("motion", getMotionMarkerLayerId(marker));
  }

  function cancelLayerNameEdit() {
    setEditingLayerId(null);
    setLayerNameDraft("");
  }

  function addMotionLayerAround(layerId: string, placement: "before" | "after") {
    if (isLayerLocked("motion", layerId)) return;
    onAddMotionLayer(undefined, layerId, placement);
    setMotionLayerMenuId(null);
  }

  function moveLayer(category: TimelineLayerCategory, layerId: string, direction: "up" | "down") {
    if (isLayerLocked(category, layerId)) return;
    onTimelineLayersChange((state) => moveTimelineStateLayer(state, category, layerId, direction, defaultTimelineLayerState), { history: true });
    setMotionLayerMenuId(null);
  }

  function addCompositionLayerAround(layerId: string, placement: "before" | "after") {
    if (isLayerLocked("comp", layerId)) return;
    onAddCompositionLayer(layerId, placement);
    setMotionLayerMenuId(null);
  }

  function moveCompositionLayer(layerId: string, direction: "up" | "down") {
    moveLayer("comp", layerId, direction);
  }

  function removeCompositionLayer(layerId: string) {
    if (isLayerLocked("comp", layerId)) return;
    onRemoveCompositionLayer(layerId);
    setMotionLayerMenuId(null);
  }

  function addAdjustmentLayerAround(layerId: string, placement: "before" | "after") {
    if (isLayerLocked("adjust", layerId)) return;
    onAddAdjustmentLayer(layerId, placement);
    setMotionLayerMenuId(null);
  }

  function moveAdjustmentRow(layerId: string, direction: "up" | "down") {
    moveLayer("adjust", layerId, direction);
  }

  function removeAdjustmentLayer(layerId: string) {
    if (isLayerLocked("adjust", layerId)) return;
    onRemoveAdjustmentLayer(layerId);
    setMotionLayerMenuId(null);
  }

  function moveMotionLayer(layerId: string, direction: "up" | "down") {
    moveLayer("motion", layerId, direction);
  }

  function removeMotionLayer(layerId: string) {
    if (isLayerLocked("motion", layerId)) return;
    onRemoveMotionLayer(layerId);
    setMotionLayerMenuId(null);
  }

  function getMotionDropLayerId(kind: TimelineMotionLayerKind, clientY: number) {
    if (kind === "empty") return undefined;
    return getDropLayerId("motion", clientY);
  }

  function getSceneTimeFromClientX(clientX: number) {
    const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
    if (!rect) return currentSceneTime;
    return clamp(((clientX - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
  }

  function getDropSceneTime(event: DragEvent<HTMLElement>) {
    return getSceneTimeFromClientX(event.clientX);
  }

  function getDraggedEffect(event: DragEvent<HTMLElement>) {
    const types = Array.from(event.dataTransfer.types);
    const registeredType = types.find((type) => type.startsWith("application/x-clipper-effect-"));
    if (registeredType) {
      const effect = installedEffectPackages.find((definition) => getEffectDragType(definition.id) === registeredType)?.id;
      if (effect) return effect;
    }
    return event.dataTransfer.getData("application/x-clipper-effect") || event.dataTransfer.getData("text/plain");
  }

  function applyEffectDragPreviewElement(preview = effectDragPreviewRef.current) {
    const element = effectDragPreviewElementRef.current;
    if (!element || !preview) return;
    const rowIndex = layerRows.findIndex((row) => row.key === preview.layerKey);
    if (rowIndex < 0) return;
    const left = timelineDisplayDuration > 0 ? (preview.start / timelineDisplayDuration) * contentWidth : 0;
    const width = timelineDisplayDuration > 0 ? (preview.duration / timelineDisplayDuration) * contentWidth : 0;
    element.style.transform = `translate3d(${left}px, ${layerRowStarts[rowIndex]}px, 0)`;
    element.style.width = `${width}px`;
    element.style.height = `${layerRowHeights[rowIndex]}px`;
    element.style.willChange = "transform, width";
  }

  function scheduleEffectDragPreviewElementUpdate() {
    if (effectDragPreviewFrameRef.current) return;
    effectDragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      effectDragPreviewFrameRef.current = 0;
      applyEffectDragPreviewElement();
    });
  }

  function updateEffectDragPreview(nextPreview: EffectDragPreview | null) {
    const current = effectDragPreviewRef.current;
    effectDragPreviewRef.current = nextPreview;
    if (Boolean(current) !== Boolean(nextPreview)) setClipperPointerDragPreview(effectDragPreviewEvent, Boolean(nextPreview));
    if (!nextPreview) {
      if (effectDragPreviewFrameRef.current) window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
      effectDragPreviewFrameRef.current = 0;
      clearTimelineSnapGuide();
      setEffectDragPreview(null);
      return;
    }

    const shouldRemount = !current || current.category !== nextPreview.category || current.effectId !== nextPreview.effectId || current.label !== nextPreview.label || current.isEmpty !== nextPreview.isEmpty || current.sourceMissing !== nextPreview.sourceMissing || current.layerKey !== nextPreview.layerKey || current.duration !== nextPreview.duration || current.initialClientX !== nextPreview.initialClientX || current.initialStart !== nextPreview.initialStart;
    if (shouldRemount) setEffectDragPreview(nextPreview);
    else scheduleEffectDragPreviewElementUpdate();
  }

  function getEffectPreviewBase(effectId: string, layerKey: string, clientX: number, sceneTime: number) {
    const current = effectDragPreviewRef.current;
    if (current?.effectId === effectId && current.layerKey === layerKey) return current;
    const effect = getEffectPackage(effectId);
    if (!effect) return null;

    if (effect.category === "adjustment") {
      const placement = getAdjustmentPlacement(adjustmentLayers, sceneDuration, sceneTime);
      return { category: "adjustment" as const, effectId, layerKey, start: placement.start, duration: placement.duration, initialClientX: clientX, initialStart: placement.start };
    }

    const kind = effect.kind;
    const duration = Math.min(defaultNewMarkerDurationSeconds, Math.max(sceneDuration, 0.1));
    const start = roundTenth(clamp(sceneTime - duration / 2, 0, timelineDisplayDuration));
    return { category: "motion" as const, effectId, kind, layerKey, start, duration, initialClientX: clientX, initialStart: start };
  }

  function getExternalDropTiming(start: number, duration: number, snap: boolean) {
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    return getTimelineBlockTiming({
      action: "move",
      initialStart: clamp(start, 0, timelineDisplayDuration),
      initialDuration: duration,
      deltaSeconds: 0,
      timelineDuration: timelineDisplayDuration,
      moveMaxStartMode: "start",
      snap,
      snapBoundaries: getUniversalBlockSnapBoundaries(),
      snapThresholdSeconds: Math.max(0.08, 8 / pixelsPerSecond),
    });
  }

  function updateExternalSnapGuide(guideTime: number | null) {
    if (guideTime === null) clearTimelineSnapGuide();
    else updateTimelineSnapGuide(guideTime);
  }

  function previewAdjustmentEffectDrop(effectId: AdjustmentEffectId, layerId: string, clientX: number, sceneTime: number, snap: boolean) {
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) return;
    const timing = getExternalDropTiming(sceneTime, base.duration, snap);
    updateExternalSnapGuide(timing.guideTime);
    updateEffectDragPreview({ ...base, start: timing.start });
  }

  function previewMotionEffectDrop(effectId: MotionEffectId, layerId: string, clientX: number, sceneTime: number, snap: boolean) {
    const effect = getMotionEffectPackage(effectId);
    const kind = effect?.kind;
    if (!kind) return;
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) {
      updateEffectDragPreview(null);
      return;
    }

    const timing = getExternalDropTiming(sceneTime - base.duration / 2, base.duration, snap);
    updateExternalSnapGuide(timing.guideTime);
    updateEffectDragPreview({ ...base, start: timing.start });
  }

  function previewCompositionDrop(detail: CompositionPointerDragDetail, layerId: string, sceneTime: number) {
    const duration = Math.max(detail.duration, 0.1);
    const timing = getExternalDropTiming(sceneTime, duration, detail.shiftKey);
    const start = timing.start;
    updateExternalSnapGuide(timing.guideTime);
    const current = effectDragPreviewRef.current;
    const base = current?.category === "composition" && current.layerKey === layerId && current.label === detail.label && current.duration === duration && current.isEmpty === detail.isEmpty && current.sourceMissing === detail.sourceMissing
      ? current
      : { category: "composition" as const, layerKey: layerId, label: detail.label, isEmpty: detail.isEmpty, sourceMissing: detail.sourceMissing, start, duration, initialClientX: detail.clientX, initialStart: start };
    updateEffectDragPreview({ ...base, start });
  }

  function allowAdjustmentEffectDrop(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("adjust", layerId)) return;
    const effect = getAdjustmentEffectPackage(getDraggedEffect(event));
    if (!effect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewAdjustmentEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function dropAdjustmentEffect(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("adjust", layerId)) return;
    const effect = getAdjustmentEffectPackage(getDraggedEffect(event));
    if (!effect) return;
    event.preventDefault();
    const previewStart = effectDragPreviewRef.current?.category === "adjustment" && effectDragPreviewRef.current.effectId === effect.id && effectDragPreviewRef.current.layerKey === layerId ? effectDragPreviewRef.current.start : sceneTime;
    updateEffectDragPreview(null);
    onAddAdjustmentEffect(effect.id, previewStart, layerId);
  }

  function allowMotionEffectDrop(event: DragEvent<HTMLElement>, kind: MotionEffectKind, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    if (effect?.kind !== kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function allowMotionLayerEffectDrop(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function dropMotionEffect(event: DragEvent<HTMLElement>, kind: MotionEffectKind, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    if (effect?.kind !== kind) return;
    event.preventDefault();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime = preview?.effectId === effect.id && preview.layerKey === layerId ? preview.start + preview.duration / 2 : sceneTime;
    updateEffectDragPreview(null);
    onAddMotionEffect(effect.id, layerId, targetSceneTime);
  }

  function dropMotionLayerEffect(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime = preview?.effectId === effect.id && preview.layerKey === layerId ? preview.start + preview.duration / 2 : sceneTime;
    updateEffectDragPreview(null);
    onAddMotionEffect(effect.id, layerId, targetSceneTime);
  }

  function getEffectPointerDropTarget(clientX: number, clientY: number) {
    const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const target = getTimelineLayerRowAtClientY(layerLayout, rect, clientY);
    return target ? { rowKey: target.row.key, sceneTime: getSceneTimeFromClientX(clientX) } : null;
  }

  function isEffectPointerOverTimeline(clientX: number, clientY: number) {
    const rect = timelinePanelRef.current?.getBoundingClientRect();
    return Boolean(rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);
  }

  function updateExternalPointerAutoScroll<T extends EffectPointerDragDetail | CompositionPointerDragDetail>(eventName: string, detail: T) {
    if (detail.phase === "drop" || !isEffectPointerOverTimeline(detail.clientX, detail.clientY)) {
      stopTimelineDragAutoScroll();
      return;
    }
    updateTimelineDragAutoScroll(detail.clientX, () => {
      window.dispatchEvent(new CustomEvent<T>(eventName, { detail: { ...detail, phase: "move" } }));
    }, detail.clientY);
  }

  useEffect(() => {
    function handleEffectPointerDrag(event: Event) {
      const detail = (event as CustomEvent<EffectPointerDragDetail>).detail;
      if (!detail || !isCompositionMode) return;
      if (detail.phase === "cancel") {
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        stopTimelineDragAutoScroll();
        return;
      }

      setGlobalTimelineDragActive(detail.phase !== "drop" && isEffectPointerOverTimeline(detail.clientX, detail.clientY));
      updateExternalPointerAutoScroll(effectPointerDragEvent, detail);
      const target = getEffectPointerDropTarget(detail.clientX, detail.clientY);
      const motionEffect = getMotionEffectPackage(detail.effect);
      const adjustmentEffect = getAdjustmentEffectPackage(detail.effect);
      if (!target) {
        if (detail.phase === "drop") setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        return;
      }

      const adjustmentRow = adjustmentRows.find((row) => row.key === target.rowKey);
      if (adjustmentEffect && adjustmentRow) {
        if (adjustmentRow.locked) {
          updateEffectDragPreview(null);
          return;
        }
        if (detail.phase === "drop") {
          const previewStart = effectDragPreviewRef.current?.category === "adjustment" && effectDragPreviewRef.current.effectId === adjustmentEffect.id && effectDragPreviewRef.current.layerKey === adjustmentRow.key ? effectDragPreviewRef.current.start : target.sceneTime;
          setGlobalTimelineDragActive(false);
          updateEffectDragPreview(null);
          stopTimelineDragAutoScroll();
          onAddAdjustmentEffect(adjustmentEffect.id, previewStart, adjustmentRow.key);
          return;
        }
        previewAdjustmentEffectDrop(adjustmentEffect.id, adjustmentRow.key, detail.clientX, target.sceneTime, detail.shiftKey);
        return;
      }

      const layer = motionEffect ? motionLayers.find((item) => item.id === target.rowKey) : null;
      if (!motionEffect || !layer || layer.locked) {
        updateEffectDragPreview(null);
        return;
      }

      if (detail.phase === "drop") {
        const preview = effectDragPreviewRef.current;
        const targetSceneTime = preview?.effectId === motionEffect.id && preview.layerKey === layer.id ? preview.start + preview.duration / 2 : target.sceneTime;
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        stopTimelineDragAutoScroll();
        onAddMotionEffect(motionEffect.id, layer.id, targetSceneTime);
        return;
      }

      previewMotionEffectDrop(motionEffect.id, layer.id, detail.clientX, target.sceneTime, detail.shiftKey);
    }

    window.addEventListener(effectPointerDragEvent, handleEffectPointerDrag);
    return () => window.removeEventListener(effectPointerDragEvent, handleEffectPointerDrag);
  });

  useEffect(() => {
    function handleCompositionPointerDrag(event: Event) {
      const detail = (event as CustomEvent<CompositionPointerDragDetail>).detail;
      if (!detail) return;
      if (detail.phase === "cancel") {
        setGlobalTimelineDragActive(false);
        setClipperPointerDragPreview(compositionDragPreviewEvent, false);
        clearTimelineSnapGuide();
        stopTimelineDragAutoScroll();
        return;
      }

      const target = getEffectPointerDropTarget(detail.clientX, detail.clientY);
      const compositionRow = target ? compositionRows.find((row) => row.id === target.rowKey) : null;
      const overTimeline = isEffectPointerOverTimeline(detail.clientX, detail.clientY);
      setGlobalTimelineDragActive(detail.phase !== "drop" && overTimeline);
      updateExternalPointerAutoScroll(compositionPointerDragEvent, detail);
      setClipperPointerDragPreview(compositionDragPreviewEvent, Boolean(compositionRow && !compositionRow.locked && detail.phase !== "drop"));

      if (!target || !compositionRow || compositionRow.locked) {
        if (detail.phase === "drop") setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        clearTimelineSnapGuide();
        return;
      }

      if (detail.phase === "drop") {
        const preview = effectDragPreviewRef.current;
        const targetStart = preview?.category === "composition" && preview.layerKey === compositionRow.id ? preview.start : target.sceneTime;
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        setClipperPointerDragPreview(compositionDragPreviewEvent, false);
        clearTimelineSnapGuide();
        stopTimelineDragAutoScroll();
        onAddComposition(detail.compositionId, compositionRow.id, targetStart);
        return;
      }

      previewCompositionDrop(detail, compositionRow.id, target.sceneTime);
    }

    window.addEventListener(compositionPointerDragEvent, handleCompositionPointerDrag);
    return () => window.removeEventListener(compositionPointerDragEvent, handleCompositionPointerDrag);
  });

  const { startTimelineRowResize: startLayerRowResize } = useTimelineRowResize({
    rowHeights: timelineLayers.rowHeights ?? {},
    setPreviewRowHeights: setResizePreviewRowHeights,
    onCommitRowHeights: (nextHeights) => onTimelineLayersChange((state) => ({ ...state, rowHeights: nextHeights }), { history: true }),
    onCanResizeRow: (rowKey) => {
      const category = getLayerCategory(rowKey);
      return !(category && isLayerLocked(category, rowKey));
    },
    onDragActiveChange: setGlobalTimelineDragActive,
  });

  useLayoutEffect(() => {
    if (effectDragPreview) applyEffectDragPreviewElement(effectDragPreview);
  }, [effectDragPreview, contentWidth, layerRows, layerRowStarts, layerRowHeights, timelineDisplayDuration]);

  return <TimelineShell activeMode={mode} contentWidth={contentWidth} currentTime={currentSceneTime} displayDuration={timelineDisplayDuration} dragActive={timelineDragActive} laneContentHeight={laneContentHeight} laneRowsStyle={laneRowsStyle} layerRailWidth={layerRailWidth} refs={{ playbackPlayheadRef, timelineRef, timelineViewportRef, timelineRulerViewportRef, timelineLayerRailRef, timelineSnapGuideRef, timelinePanelRef }} timelineName={timelineName} timelineViewportDisplacement={timelineViewportState.displacement} timelineZoom={timelineZoom} ticks={ticks} onLayerRailWheel={scrollTimelineFromLayerRail} onModeChange={onModeChange} onTimelineViewportDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) updateEffectDragPreview(null); }} onTimelineViewportScroll={saveTimelineDisplacement} onTimelineZoomChange={updateTimelineZoom} rulerHandlers={{ onPointerDown: startScrub, onPointerMove: continueScrub, onPointerUp: endScrub, onPointerCancel: endScrub }} renderLayerRail={() => <>
            <span className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-[#39404d]" />
            {layerRows.map((row, index) => <span className="pointer-events-none absolute right-0 z-40 w-0.5" key={`layer-accent-${row.key}`} style={{ top: layerRowStarts[index], height: layerRowHeights[index], backgroundColor: row.accent }} />)}
            {layerRows.length > 0 ? <LayerResizeSeparator key={`label-separator-${layerRows[0].key}-top`} top={0} onPointerDown={(event) => startLayerRowResize(event, layerRows[0].key, "top")} /> : null}
            {layerRows.slice(1).map((row, index) => <LayerResizeSeparator key={`label-separator-${row.key}`} top={layerRowStarts[index + 1]} onPointerDown={(event) => startLayerRowResize(event, row.key, "top")} />)}
            {isCompositionMode ? adjustmentRows.map((row, index) => <LayerLabel key={row.key} editing={editingLayerId === row.key} hidden={row.hidden} locked={row.locked} compactControls={layerRowHeights[index] < 50} hideLockControl={layerRowHeights[index] < 58} menuOpen={motionLayerMenuId === row.key} name={row.name} draft={layerNameDraft} canMoveDown={index < adjustmentRows.length - 1} canMoveUp={index > 0} addBeforeLabel="Add adjust above" addAfterLabel="Add adjust below" removeLabel="Remove adjust" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(row.key, row.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowAdjustmentEffectDrop(event, row.key, currentSceneTime)} onEffectDrop={(event) => dropAdjustmentEffect(event, row.key, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === row.key ? null : row.key)} onAddBefore={() => addAdjustmentLayerAround(row.key, "before")} onAddAfter={() => addAdjustmentLayerAround(row.key, "after")} onMoveUp={() => moveAdjustmentRow(row.key, "up")} onMoveDown={() => moveAdjustmentRow(row.key, "down")} onRemove={() => removeAdjustmentLayer(row.key)} onToggleHidden={() => toggleLayerHidden(row.key)} onToggleLocked={() => toggleLayerLocked(row.key)} />) : null}
            {isCompositionMode ? motionLayers.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} compactControls={layerRowHeights[adjustmentRows.length + index] < 50} hideLockControl={layerRowHeights[adjustmentRows.length + index] < 58} menuOpen={motionLayerMenuId === layer.id} name={layer.name} draft={layerNameDraft} canMoveDown={index < motionLayers.length - 1} canMoveUp={index > 0} addBeforeLabel="Add motion above" addAfterLabel="Add motion below" removeLabel="Remove motion" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id, currentSceneTime)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === layer.id ? null : layer.id)} onAddBefore={() => addMotionLayerAround(layer.id, "before")} onAddAfter={() => addMotionLayerAround(layer.id, "after")} onMoveUp={() => moveMotionLayer(layer.id, "up")} onMoveDown={() => moveMotionLayer(layer.id, "down")} onRemove={() => removeMotionLayer(layer.id)} onToggleHidden={() => toggleLayerHidden(layer.id)} onToggleLocked={() => toggleLayerLocked(layer.id)} />) : null}
            {compositionRows.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} compactControls={layerRowHeights[(isCompositionMode ? adjustmentRows.length + motionLayers.length : 0) + index] < 50} hideLockControl={layerRowHeights[(isCompositionMode ? adjustmentRows.length + motionLayers.length : 0) + index] < 58} menuOpen={motionLayerMenuId === layer.id} name={layer.name} draft={layerNameDraft} canMoveDown={index < compositionRows.length - 1} canMoveUp={index > 0} addBeforeLabel="Add composition above" addAfterLabel="Add composition below" removeLabel="Remove composition" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onMenuToggle={() => setMotionLayerMenuId((current) => current === layer.id ? null : layer.id)} onAddBefore={() => addCompositionLayerAround(layer.id, "before")} onAddAfter={() => addCompositionLayerAround(layer.id, "after")} onMoveUp={() => moveCompositionLayer(layer.id, "up")} onMoveDown={() => moveCompositionLayer(layer.id, "down")} onRemove={() => removeCompositionLayer(layer.id)} onToggleHidden={() => toggleLayerHidden(layer.id)} onToggleLocked={() => toggleLayerLocked(layer.id)} />)}
          </>} renderTimelineViewport={() => <>
            {timelineSelectionDrag ? <TimelineSelectionBox boxRef={timelineSelectionBoxRef} drag={timelineSelectionDrag} /> : null}
            {isCompositionMode ? adjustmentRows.map((row) => <TimelineLayerLane key={row.key} hidden={row.hidden} locked={row.locked} overflowVisible={isDraggingAdjustmentLayer} className="block" onDragOver={(event) => allowAdjustmentEffectDrop(event, row.key)} onDrop={(event) => dropAdjustmentEffect(event, row.key)} onPointerDown={startTimelineSelection} onPointerMove={continueTimelineSelection} onPointerUp={endTimelineSelection} onPointerCancel={endTimelineSelection} onContextMenu={openBlankTimelineContextMenu}>
              {adjustmentLayers.filter((layer) => getAdjustmentLayerRowId(layer) === row.key).map((layer) => {
                const previewLayer = timelineBlockPreviews?.[timelineBlockPreviewKey("adjustment", layer.id)] ?? layer;
                return (
                  <TimelineBlock variant="adjustment" gradient={getEffectPackage(layer.effect.effectId)?.timelineGradient} dataAttributes={{ "data-timeline-marker-kind": "adjustment", "data-timeline-adjustment-id": layer.id }} key={layer.id} locked={row.locked} selected={selectedAdjustmentLayerIds.has(layer.id) || layer.id === selectedAdjustmentLayerId} style={{ left: `${(previewLayer.start / timelineDisplayDuration) * 100}%`, width: `calc(${(previewLayer.duration / timelineDisplayDuration) * 100}% + var(--clipper-adjustment-resize-width, 0px))` }} onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "move")} onClick={() => onSelectAdjustmentLayer(layer.id)} onLeftResize={(event) => updateAdjustmentFromPointer(event, layer, "start")} onRightResize={(event) => updateAdjustmentFromPointer(event, layer, "end")} onContextMenu={(event) => openTimelineNodeContextMenu(event, { kind: "adjustment", layerId: layer.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{layer.name}</span>
                </TimelineBlock>
                );
              })}
            </TimelineLayerLane>) : null}
            {isCompositionMode ? motionLayers.map((layer) => <MotionLane key={layer.id} layerId={layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} timeline={motionTimeline} sceneDuration={timelineDisplayDuration} overflowVisible={isDraggingMotionMarker} timelineBlockPreviews={timelineBlockPreviews} motionSelectionDrag={null} motionSelectionBoxRef={motionSelectionBoxRef} selectedMotionKeys={selectedMotionKeys} selectedMotionMarkerId={selectedMotionMarkerId} selectedMotionMarkerPartId={selectedMotionMarkerPartId} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id)} onStartSelection={startTimelineSelection} onMoveSelection={continueTimelineSelection} onEndSelection={endTimelineSelection} onOpenBlankContextMenu={openBlankTimelineContextMenu} onSelectMotionMarker={onSelectMotionMarker} onOpenNodeContextMenu={openTimelineNodeContextMenu} onUpdateMotionFromPointer={updateMotionMarkerFromPointer} />) : null}
            {effectDragPreview ? <EffectDragPreviewBlock blockRef={effectDragPreviewElementRef} preview={effectDragPreview} /> : null}
            {compositionRows.map((row) => <TimelineLayerLane key={row.id} hidden={Boolean(row.hidden)} locked={Boolean(row.locked)} overflowVisible={timelineMarkersEditable && isDraggingCompositionBlock} className="block" onDragOver={(event) => { if (timelineMarkersEditable && !row.locked && event.dataTransfer.types.includes("application/x-clipper-composition")) event.preventDefault(); }} onDrop={(event) => { if (!timelineMarkersEditable || row.locked) return; const compositionId = event.dataTransfer.getData("application/x-clipper-composition"); if (!compositionId) return; event.preventDefault(); onAddComposition(compositionId, row.id, getDropSceneTime(event)); }} onPointerDown={startTimelineSelection} onPointerMove={continueTimelineSelection} onPointerUp={endTimelineSelection} onPointerCancel={endTimelineSelection} onContextMenu={openBlankTimelineContextMenu}>
              {timeline.filter((item) => (item.layerId ?? "comp") === row.id).map((item) => {
                const previewItem = timelineBlockPreviews?.[timelineBlockPreviewKey("composition", item.id)] ?? item;
                const isEmptyPart = item.objects.length === 0 && item.background.elements.length === 0;
                const isUnlinkedPart = Boolean(item.sourceMissing);
                return (
                  <CompositionTimelineBlock dataAttributes={{ "data-timeline-composition-id": item.id }} key={item.id} name={item.name} duration={previewItem.duration} isEmpty={isEmptyPart} sourceMissing={isUnlinkedPart} locked={Boolean(row.locked)} selected={selectedPartIds.has(item.id)} style={{ left: `${timelineDisplayDuration > 0 ? (previewItem.start / timelineDisplayDuration) * 100 : 0}%`, width: `calc(${timelineDisplayDuration > 0 ? (previewItem.duration / timelineDisplayDuration) * 100 : 0}% + var(--clipper-composition-resize-width, 0px))` }} onPointerDown={(event) => { if (timelineMarkersEditable) updateCompositionFromPointer(event, item, "move"); }} onClick={() => onSelectPart(item.id)} onDoubleClick={() => onOpenComposePart(item.id)} onContextMenu={(event) => { if (timelineMarkersEditable) openTimelineNodeContextMenu(event, { kind: "part", partId: item.id }); }} leftResizeEnabled={timelineMarkersEditable} rightResizeEnabled={timelineMarkersEditable} onLeftResize={(event) => updateCompositionFromPointer(event, item, "start")} onRightResize={(event) => updateCompositionFromPointer(event, item, "end")} />
                );
              })}
            </TimelineLayerLane>)}
          </>} />;
}
