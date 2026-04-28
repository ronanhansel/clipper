import { Minus, Plus } from "lucide-react";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject } from "react";
import { defaultTimelinePixelsPerSecond, mutedCaps } from "../../app/config";
import type { TimelineNodeContextTarget, TimelineSelectionDrag, TranslationMarkerSelection, ZoomMarkerSelection } from "../../app/types";
import { clamp, roundTenth } from "../../core/math";
import { buildLinearTimeline, formatTime, getMendedMarkerDragItems, getScrubSnapBoundaries, getTimelineDragConstraintItems, getTimelineMarkerGapIntervals, getTimelineMarkerMoves, getTimelinePartAtTime, getTimelineTicks, getTopTimelineItemAtTime, resizeTimelineMarkersWithPush, snapScrubTimeToBoundary, uniqueTimelineDragItems, type TimelineMarkerDragItem, type TimelineMarkerMove } from "../../core/timeline";
import type { AdjustmentLayer, Part, TimelineMode, TimelinePart, TimelineViewportState, TranslationMarker, ZoomMarker } from "../../core/types";

export type TimelinePanelProps = {
  timeline: TimelinePart[];
  adjustmentLayers: AdjustmentLayer[];
  timelineViewportState: TimelineViewportState;
  mode: TimelineMode;
  selectedPartId: string;
  selectedZoomMarkerPartId: string | null;
  selectedZoomMarkerId: string | null;
  selectedZoomMarkers: ZoomMarkerSelection[];
  selectedTranslationMarkerPartId: string | null;
  selectedTranslationMarkerId: string | null;
  selectedTranslationMarkers: TranslationMarkerSelection[];
  selectedAdjustmentLayerId: string | null;
  sceneDuration: number;
  currentSceneTime: number;
  isPlaying: boolean;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  fastSelectEnabled: boolean;
  scrubCommitThrottleMs: number;
  scrubSnapEnabled: boolean;
  onScrub: (time: number) => void;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
  onSelectPart: (id: string) => void;
  onSelectZoomMarker: (partId: string, markerId: string) => void;
  onSelectZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  onSelectTranslationMarker: (partId: string, markerId: string) => void;
  onSelectTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  onSelectAdjustmentLayer: (layerId: string) => void;
  onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void;
  onMoveAdjustmentLayer: (layerId: string, start: number) => void;
  onUpdateAdjustmentLayer: (layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onMoveZoomMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveZoomMarkers: (moves: TimelineMarkerMove[]) => void;
  onMoveTranslationMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveTranslationMarkers: (moves: TimelineMarkerMove[]) => void;
  onUpdateZoomMarkers: (partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) => void;
  onUpdateTranslationMarkers: (partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) => void;
};

export function TimelinePanel({ timeline, adjustmentLayers, timelineViewportState, mode, selectedPartId, selectedZoomMarkerPartId, selectedZoomMarkerId, selectedZoomMarkers, selectedTranslationMarkerPartId, selectedTranslationMarkerId, selectedTranslationMarkers, selectedAdjustmentLayerId, sceneDuration, currentSceneTime, isPlaying, playbackPlayheadRef, scrubbingRef, fastSelectEnabled, scrubCommitThrottleMs, scrubSnapEnabled, onScrub, onModeChange, onTimelineViewportStateChange, onSelectPart, onSelectZoomMarker, onSelectZoomMarkers, onSelectTranslationMarker, onSelectTranslationMarkers, onSelectAdjustmentLayer, onOpenNodeContextMenu, onMoveAdjustmentLayer, onUpdateAdjustmentLayer, onReorderPart, onMoveZoomMarker, onMoveZoomMarkers, onMoveTranslationMarker, onMoveTranslationMarkers, onUpdateZoomMarkers, onUpdateTranslationMarkers }: TimelinePanelProps) {
  const ticks = useMemo(() => getTimelineTicks(sceneDuration), [sceneDuration]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingZoomMarkerId, setDraggingZoomMarkerId] = useState<string | null>(null);
  const [draggingTranslationMarkerId, setDraggingTranslationMarkerId] = useState<string | null>(null);
  const [zoomSelectionDrag, setZoomSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [translationSelectionDrag, setTranslationSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const zoomSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const translationSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const zoomSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const translationSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const zoomSelectionFrameRef = useRef(0);
  const translationSelectionFrameRef = useRef(0);
  const liveZoomSelectionIdsRef = useRef("");
  const liveTranslationSelectionIdsRef = useRef("");
  const scrubClientXRef = useRef<number | null>(null);
  const scrubSnapRef = useRef(false);
  const scrubAutoScrollFrameRef = useRef(0);
  const scrubPreviewFrameRef = useRef(0);
  const pendingScrubPreviewRef = useRef<{ clientX: number; snap: boolean; commit: "throttled" | "immediate" } | null>(null);
  const pendingScrubCommitRef = useRef<number | null>(null);
  const scrubCommitTimeoutRef = useRef(0);
  const lastScrubCommitAtRef = useRef(0);
  const [shiftSnapActive, setShiftSnapActive] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(timelineViewportState.zoom);
  const restoredTimelineDisplacementRef = useRef<number | null>(null);
  const isScrubSnapActive = scrubSnapEnabled || shiftSnapActive;
  const selectedZoomKeys = useMemo(() => new Set(selectedZoomMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedZoomMarkers]);
  const selectedTranslationKeys = useMemo(() => new Set(selectedTranslationMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedTranslationMarkers]);
  const scrubSnapBoundaries = useMemo(() => getScrubSnapBoundaries(timeline, adjustmentLayers), [adjustmentLayers, timeline]);
  const contentWidth = Math.max(sceneDuration * defaultTimelinePixelsPerSecond * timelineZoom, 760);
  const isCompositionMode = mode === "composition";
  const laneRows = isCompositionMode ? "grid-rows-[38px_44px_58px_58px_58px]" : "grid-rows-[38px_58px]";
  const playheadHeight = isCompositionMode ? 242 : 82;

  useEffect(() => {
    setTimelineZoom(timelineViewportState.zoom);
  }, [timelineViewportState.zoom]);

  useEffect(() => () => {
    if (zoomSelectionFrameRef.current) window.cancelAnimationFrame(zoomSelectionFrameRef.current);
    if (translationSelectionFrameRef.current) window.cancelAnimationFrame(translationSelectionFrameRef.current);
    if (scrubPreviewFrameRef.current) window.cancelAnimationFrame(scrubPreviewFrameRef.current);
    if (scrubCommitTimeoutRef.current) window.clearTimeout(scrubCommitTimeoutRef.current);
  }, []);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport || restoredTimelineDisplacementRef.current === timelineViewportState.displacement) return;

    viewport.scrollLeft = timelineViewportState.displacement;
    restoredTimelineDisplacementRef.current = timelineViewportState.displacement;
  }, [contentWidth, timelineViewportState.displacement]);

  function updateTimelineZoom(nextZoom: number) {
    const zoom = clamp(nextZoom, 0.5, 4);
    setTimelineZoom(zoom);
    onTimelineViewportStateChange((state) => ({ ...state, zoom }));
  }

  function saveTimelineDisplacement() {
    const displacement = Math.max(Math.round(timelineViewportRef.current?.scrollLeft ?? 0), 0);
    restoredTimelineDisplacementRef.current = displacement;
    onTimelineViewportStateChange((state) => ({ ...state, displacement }));
  }

  function timeFromClientX(clientX: number, snap: boolean) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || sceneDuration <= 0) return 0;
    const rawTime = clamp(((clientX - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    if (!snap) return rawTime;

    const pixelsPerSecond = rect.width / sceneDuration;
    const snapThresholdSeconds = Math.min(0.35, Math.max(0.05, 10 / pixelsPerSecond));
    return snapScrubTimeToBoundary(rawTime, scrubSnapBoundaries, snapThresholdSeconds);
  }

  function visibleScrubClientX(clientX: number) {
    const viewport = timelineViewportRef.current;
    if (!viewport) return clientX;
    const rect = viewport.getBoundingClientRect();
    return clamp(clientX, rect.left, rect.right);
  }

  function previewScrubTime(time: number) {
    const playhead = playbackPlayheadRef.current;
    if (!playhead) return;
    playhead.style.setProperty("--clipper-playhead-left", "0px");
    playhead.style.setProperty("--clipper-playhead-x", `${sceneDuration > 0 ? (time / sceneDuration) * contentWidth : 0}px`);
  }

  function commitPendingScrub() {
    if (scrubCommitTimeoutRef.current) {
      window.clearTimeout(scrubCommitTimeoutRef.current);
      scrubCommitTimeoutRef.current = 0;
    }

    const nextTime = pendingScrubCommitRef.current;
    pendingScrubCommitRef.current = null;
    if (nextTime === null) return;
    lastScrubCommitAtRef.current = performance.now();
    if (fastSelectEnabled) selectTimelineItemAtTime(nextTime);
    onScrub(nextTime);
  }

  function scheduleScrubCommit(time: number) {
    pendingScrubCommitRef.current = time;
    const elapsed = performance.now() - lastScrubCommitAtRef.current;
    if (elapsed >= scrubCommitThrottleMs) {
      commitPendingScrub();
      return;
    }

    if (scrubCommitTimeoutRef.current) return;
    scrubCommitTimeoutRef.current = window.setTimeout(commitPendingScrub, scrubCommitThrottleMs - elapsed);
  }

  function updateScrubFromClientX(clientX: number, snap: boolean, commit: "throttled" | "immediate" = "throttled") {
    const time = timeFromClientX(visibleScrubClientX(clientX), snap);
    previewScrubTime(time);
    if (commit === "immediate") {
      pendingScrubCommitRef.current = time;
      commitPendingScrub();
      return;
    }

    scheduleScrubCommit(time);
  }

  function scheduleScrubFromClientX(clientX: number, snap: boolean, commit: "throttled" | "immediate" = "throttled") {
    pendingScrubPreviewRef.current = { clientX, snap, commit };
    if (scrubPreviewFrameRef.current) return;

    scrubPreviewFrameRef.current = window.requestAnimationFrame(() => {
      scrubPreviewFrameRef.current = 0;
      const next = pendingScrubPreviewRef.current;
      pendingScrubPreviewRef.current = null;
      if (!next) return;
      updateScrubFromClientX(next.clientX, next.snap, next.commit);
    });
  }

  function selectTimelineItemAtTime(time: number) {
    if (!isCompositionMode) {
      const part = getTimelinePartAtTime(timeline, time > 0 ? time - 0.000001 : time);
      if (part) onSelectPart(part.id);
      return;
    }

    const item = getTopTimelineItemAtTime(timeline, time, adjustmentLayers);
    if (!item) return;
    if (item.kind === "adjustment") {
      onSelectAdjustmentLayer(item.layer.id);
      return;
    }
    if (item.kind === "translation") {
      onSelectTranslationMarker(item.part.id, item.marker.id);
      return;
    }
    if (item.kind === "zoom") {
      onSelectZoomMarker(item.part.id, item.marker.id);
      return;
    }
    onSelectPart(item.part.id);
  }

  function stopScrubAutoScroll() {
    scrubClientXRef.current = null;
    if (scrubAutoScrollFrameRef.current) window.cancelAnimationFrame(scrubAutoScrollFrameRef.current);
    scrubAutoScrollFrameRef.current = 0;
  }

  function scheduleScrubAutoScroll() {
    if (scrubAutoScrollFrameRef.current) return;

    const tick = () => {
      scrubAutoScrollFrameRef.current = 0;
      const clientX = scrubClientXRef.current;
      const viewport = timelineViewportRef.current;
      if (clientX === null || !viewport) return;

      const rect = viewport.getBoundingClientRect();
      const edgeSize = 72;
      const leftDistance = rect.left + edgeSize - clientX;
      const rightDistance = clientX - (rect.right - edgeSize);
      let scrollDelta = 0;

      if (leftDistance > 0) scrollDelta = -clamp(leftDistance / 3, 5, 34);
      if (rightDistance > 0) scrollDelta = clamp(rightDistance / 3, 5, 34);

      if (scrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        viewport.scrollLeft += scrollDelta;
        if (viewport.scrollLeft !== previousScrollLeft) scheduleScrubFromClientX(clientX, scrubSnapRef.current);
      }

      scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function scrubFromPointer(event: PointerEvent<HTMLDivElement>) {
    const snap = scrubSnapEnabled || event.shiftKey;
    scrubClientXRef.current = event.clientX;
    scrubSnapRef.current = snap;
    setShiftSnapActive((current) => (current === event.shiftKey ? current : event.shiftKey));
    scheduleScrubFromClientX(event.clientX, snap);
    scheduleScrubAutoScroll();
  }

  function startScrub(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;
    event.preventDefault();
    blurInspectorFocus();
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubFromPointer(event);
  }

  function blurInspectorFocus() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (!activeElement.closest("[data-inspector-panel]")) return;
    activeElement.blur();
  }

  function continueScrub(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scrubFromPointer(event);
  }

  function endScrub(event: PointerEvent<HTMLDivElement>) {
    if (scrubPreviewFrameRef.current) {
      window.cancelAnimationFrame(scrubPreviewFrameRef.current);
      scrubPreviewFrameRef.current = 0;
      pendingScrubPreviewRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    scrubbingRef.current = false;
    if (scrubClientXRef.current !== null) updateScrubFromClientX(scrubClientXRef.current, scrubSnapRef.current, "immediate");
    setShiftSnapActive(false);
    stopScrubAutoScroll();
  }

  function startZoomSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX };
    zoomSelectionDragRef.current = next;
    liveZoomSelectionIdsRef.current = "";
    setZoomSelectionDrag(next);
  }

  function zoomSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    return timeline.flatMap((timelinePart) => timelinePart.zoomMarkers
      .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
      .map((marker) => ({ partId: timelinePart.id, markerId: marker.id })));
  }

  function continueZoomSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = zoomSelectionDragRef.current;
    if (!current) return;
    const next = { ...current, currentX: event.clientX };
    zoomSelectionDragRef.current = next;
    if (zoomSelectionFrameRef.current) return;
    const element = event.currentTarget;
    zoomSelectionFrameRef.current = window.requestAnimationFrame(() => {
      zoomSelectionFrameRef.current = 0;
      const drag = zoomSelectionDragRef.current;
      if (!drag) return;
      const rect = element.getBoundingClientRect();
      if (zoomSelectionBoxRef.current) updateTimelineSelectionBoxElement(zoomSelectionBoxRef.current, drag, rect);
      if (Math.abs(drag.currentX - drag.startX) < 4) return;
      const selection = zoomSelectionFromDrag(drag, rect);
      const nextSelectionIds = selection.map((item) => `${item.partId}:${item.markerId}`).join("|");
      if (nextSelectionIds === liveZoomSelectionIdsRef.current) return;
      liveZoomSelectionIdsRef.current = nextSelectionIds;
      if (selection.length > 0) startTransition(() => onSelectZoomMarkers(selection));
    });
  }

  function endZoomSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (zoomSelectionFrameRef.current) {
      window.cancelAnimationFrame(zoomSelectionFrameRef.current);
      zoomSelectionFrameRef.current = 0;
    }
    const selectionDrag = zoomSelectionDragRef.current;
    zoomSelectionDragRef.current = null;
    liveZoomSelectionIdsRef.current = "";
    if (zoomSelectionBoxRef.current) zoomSelectionBoxRef.current.style.display = "none";
    setZoomSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      const time = timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey);
      if (fastSelectEnabled) selectTimelineItemAtTime(time);
      onScrub(time);
      return;
    }

    const selection = zoomSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectZoomMarkers(selection);
  }

  function startTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX };
    translationSelectionDragRef.current = next;
    liveTranslationSelectionIdsRef.current = "";
    setTranslationSelectionDrag(next);
  }

  function translationSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    return timeline.flatMap((timelinePart) => timelinePart.translationMarkers
      .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
      .map((marker) => ({ partId: timelinePart.id, markerId: marker.id })));
  }

  function continueTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = translationSelectionDragRef.current;
    if (!current) return;
    const next = { ...current, currentX: event.clientX };
    translationSelectionDragRef.current = next;
    if (translationSelectionFrameRef.current) return;
    const element = event.currentTarget;
    translationSelectionFrameRef.current = window.requestAnimationFrame(() => {
      translationSelectionFrameRef.current = 0;
      const drag = translationSelectionDragRef.current;
      if (!drag) return;
      const rect = element.getBoundingClientRect();
      if (translationSelectionBoxRef.current) updateTimelineSelectionBoxElement(translationSelectionBoxRef.current, drag, rect);
      if (Math.abs(drag.currentX - drag.startX) < 4) return;
      const selection = translationSelectionFromDrag(drag, rect);
      const nextSelectionIds = selection.map((item) => `${item.partId}:${item.markerId}`).join("|");
      if (nextSelectionIds === liveTranslationSelectionIdsRef.current) return;
      liveTranslationSelectionIdsRef.current = nextSelectionIds;
      if (selection.length > 0) startTransition(() => onSelectTranslationMarkers(selection));
    });
  }

  function endTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (translationSelectionFrameRef.current) {
      window.cancelAnimationFrame(translationSelectionFrameRef.current);
      translationSelectionFrameRef.current = 0;
    }
    const selectionDrag = translationSelectionDragRef.current;
    translationSelectionDragRef.current = null;
    liveTranslationSelectionIdsRef.current = "";
    if (translationSelectionBoxRef.current) translationSelectionBoxRef.current.style.display = "none";
    setTranslationSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      const time = timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey);
      if (fastSelectEnabled) selectTimelineItemAtTime(time);
      onScrub(time);
      return;
    }

    const selection = translationSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectTranslationMarkers(selection);
  }

  function onPartDragStart(event: DragEvent<HTMLButtonElement>, partId: string) {
    setDraggedPartId(partId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", partId);
  }

  function onPartDrop(event: DragEvent<HTMLButtonElement>, targetPartId: string) {
    event.preventDefault();
    const sourcePartId = draggedPartId ?? event.dataTransfer.getData("text/plain");
    if (sourcePartId) onReorderPart(sourcePartId, targetPartId);
    setDraggedPartId(null);
  }

  function selectedZoomDragItems(part: TimelinePart, marker: ZoomMarker) {
    const mendedItems = getMendedMarkerDragItems(timeline, part, marker.id, "zoom");
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? getMendedMarkerDragItems(timeline, selectedPart, selectedMarker.id, "zoom") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedTranslationDragItems(part: TimelinePart, marker: TranslationMarker) {
    const mendedItems = getMendedMarkerDragItems(timeline, part, marker.id, "translation");
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? getMendedMarkerDragItems(timeline, selectedPart, selectedMarker.id, "translation") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function blockDeltaForTimelineDrag(items: TimelineMarkerDragItem[], rawDelta: number, snapThresholdSeconds: number, snap: boolean, kind: "zoom" | "translation") {
    const constraintItems = getTimelineDragConstraintItems(items);
    const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
    const movingKeys = new Set(items.map((item) => `${item.partId}:${item.markerId}`));
    const deltaIntervals = constraintItems.reduce<Array<{ start: number; end: number }>>((intervals, item) => {
      const itemIntervals = getTimelineMarkerGapIntervals(timeline, kind, item.duration, item.absoluteStart, movingKeys);
      if (intervals.length === 0) return itemIntervals;

      return intervals.flatMap((interval) => itemIntervals.flatMap((itemInterval) => {
        const start = Math.max(interval.start, itemInterval.start);
        const end = Math.min(interval.end, itemInterval.end);
        return start <= end ? [{ start, end }] : [];
      }));
    }, []);
    let nextDelta = rawDelta;

    if (snap) {
      for (const boundary of timeline.flatMap((item) => [item.start, item.end])) {
        if (Math.abs(blockStart + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockStart;
        if (Math.abs(blockEnd + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockEnd;
      }
    }

    if (deltaIntervals.length === 0) return clamp(nextDelta, -blockStart, sceneDuration - blockEnd);
    for (const interval of deltaIntervals) {
      if (nextDelta >= interval.start && nextDelta <= interval.end) return nextDelta;
    }

    return deltaIntervals.reduce((nearest, interval) => {
      const candidate = Math.abs(nextDelta - interval.start) < Math.abs(nextDelta - interval.end) ? interval.start : interval.end;
      return Math.abs(nextDelta - candidate) < Math.abs(nextDelta - nearest) ? candidate : nearest;
    }, Math.abs(nextDelta - deltaIntervals[0].start) < Math.abs(nextDelta - deltaIntervals[0].end) ? deltaIntervals[0].start : deltaIntervals[0].end);
  }

  function getTimelineMarkerElement(kind: "zoom" | "translation", partId: string, markerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-marker-kind="${kind}"][data-timeline-marker-part-id="${CSS.escape(partId)}"][data-timeline-marker-id="${CSS.escape(markerId)}"]`) ?? null;
  }

  function setTimelineMarkerDragTransforms(kind: "zoom" | "translation", items: TimelineMarkerDragItem[], deltaPixels: number) {
    for (const item of items) {
      const element = getTimelineMarkerElement(kind, item.partId, item.markerId);
      if (!element) continue;
      element.style.transform = `translate3d(${deltaPixels}px, 0, 0)`;
      element.style.willChange = "transform";
      element.style.zIndex = "25";
    }
  }

  function clearTimelineMarkerDragTransforms(kind: "zoom" | "translation", items: TimelineMarkerDragItem[]) {
    for (const item of items) {
      const element = getTimelineMarkerElement(kind, item.partId, item.markerId);
      if (!element) continue;
      element.style.removeProperty("transform");
      element.style.removeProperty("will-change");
      element.style.removeProperty("z-index");
    }
  }

  function setTimelineMarkerResizePreviews<T extends { id: string; start: number; duration: number }>(kind: "zoom" | "translation", partId: string, initialMarkers: T[], nextMarkers: T[], pixelsPerSecond: number) {
    for (const initialMarker of initialMarkers) {
      const nextMarker = nextMarkers.find((item) => item.id === initialMarker.id);
      if (!nextMarker || (nextMarker.start === initialMarker.start && nextMarker.duration === initialMarker.duration)) continue;
      const element = getTimelineMarkerElement(kind, partId, initialMarker.id);
      if (!element) continue;
      element.style.transform = `translate3d(${(nextMarker.start - initialMarker.start) * pixelsPerSecond}px, 0, 0)`;
      element.style.setProperty("--clipper-timeline-resize-width", `${(nextMarker.duration - initialMarker.duration) * pixelsPerSecond}px`);
      element.style.willChange = "transform, width";
      element.style.zIndex = "25";
    }
  }

  function clearTimelineMarkerResizePreviews<T extends { id: string }>(kind: "zoom" | "translation", partId: string, markers: T[]) {
    for (const marker of markers) {
      const element = getTimelineMarkerElement(kind, partId, marker.id);
      if (!element) continue;
      element.style.removeProperty("transform");
      element.style.removeProperty("--clipper-timeline-resize-width");
      element.style.removeProperty("will-change");
      element.style.removeProperty("z-index");
    }
  }

  function updateAdjustmentFromPointer(event: PointerEvent<HTMLElement>, layer: AdjustmentLayer, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    onSelectAdjustmentLayer(layer.id);
    const element = event.currentTarget.closest("[data-timeline-adjustment-id]") as HTMLElement | null ?? event.currentTarget;
    const initialClientX = event.clientX;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const boundaries = getScrubSnapBoundaries(timeline, adjustmentLayers.filter((item) => item.id !== layer.id));
    let pendingClientX = event.clientX;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getNextLayer(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "start") {
        const maxStart = layer.start + layer.duration - 0.1;
        let nextStart = clamp(layer.start + deltaSeconds, 0, maxStart);
        if (snap) nextStart = clamp(snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds), 0, maxStart);
        return { ...layer, start: nextStart, duration: layer.duration + layer.start - nextStart };
      }

      if (action === "end") {
        const currentEnd = layer.start + layer.duration;
        let nextEnd = clamp(currentEnd + deltaSeconds, layer.start + 0.1, sceneDuration);
        if (snap) nextEnd = clamp(snapScrubTimeToBoundary(nextEnd, boundaries, snapThresholdSeconds), layer.start + 0.1, sceneDuration);
        return { ...layer, duration: nextEnd - layer.start };
      }

      let nextStart = clamp(layer.start + deltaSeconds, 0, Math.max(sceneDuration - layer.duration, 0));
      if (snap) {
        nextStart = snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds);
        nextStart = clamp(nextStart, 0, Math.max(sceneDuration - layer.duration, 0));
      }
      return { ...layer, start: nextStart };
    }

    function applyDrag(clientX: number, snap: boolean) {
      const nextLayer = getNextLayer(clientX, snap);
      element.style.transform = `translate3d(${(nextLayer.start - layer.start) * pixelsPerSecond}px, 0, 0)`;
      element.style.setProperty("--clipper-adjustment-resize-width", `${(nextLayer.duration - layer.duration) * pixelsPerSecond}px`);
      element.style.willChange = "transform, width";
      element.style.zIndex = "25";
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.abs(pendingClientX - initialClientX) < 4) return;
      hasDragged = true;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        const nextLayer = getNextLayer(pendingClientX, pointerEvent.shiftKey);
        if (action === "move") onMoveAdjustmentLayer(layer.id, nextLayer.start);
        else onUpdateAdjustmentLayer(layer.id, () => ({ ...nextLayer, start: roundTenth(nextLayer.start), duration: roundTenth(nextLayer.duration) }));
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.requestAnimationFrame(() => {
        element.style.removeProperty("transform");
        element.style.removeProperty("--clipper-adjustment-resize-width");
        element.style.removeProperty("will-change");
        element.style.removeProperty("z-index");
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function updateZoomFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedZoomDragItems(part, marker);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    if (!isSelectionMove) onSelectZoomMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialZoomMarkers = part.zoomMarkers;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "zoom");
      const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "zoom", activePartIds, snapThresholdSeconds);
      return { blockDeltaSeconds, moves };
    }

    function commitMoveDrag(clientX: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, snap);
      if (dragItems.length > 1) {
        onMoveZoomMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move) onMoveZoomMarker(move.sourcePartId, move.markerId, move.targetPartId, move.start);
    }

    function getResizeDragState(clientX: number) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      return resizeTimelineMarkersWithPush(initialZoomMarkers, marker.id, action as "start" | "end", deltaSeconds, part.duration);
    }

    function commitResizeDrag(clientX: number) {
      const nextMarkers = getResizeDragState(clientX);
      onUpdateZoomMarkers(part.id, () => nextMarkers);
    }

    function applyDrag(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "move") {
        const { blockDeltaSeconds } = getMoveDragState(clientX, snap);
        setTimelineMarkerDragTransforms("zoom", dragItems, blockDeltaSeconds * pixelsPerSecond);
        return;
      }

      if (action === "start" || action === "end") {
        const nextMarkers = resizeTimelineMarkersWithPush(initialZoomMarkers, marker.id, action, deltaSeconds, part.duration);
        setTimelineMarkerResizePreviews("zoom", part.id, initialZoomMarkers, nextMarkers, pixelsPerSecond);
        return;
      }
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.abs(pendingClientX - initialClientX) < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        setDraggingZoomMarkerId(marker.id);
      }
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        if (action === "move") commitMoveDrag(pendingClientX, pointerEvent.shiftKey);
        else commitResizeDrag(pendingClientX);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraggingZoomMarkerId(null);
      if (action === "move") window.requestAnimationFrame(() => clearTimelineMarkerDragTransforms("zoom", dragItems));
      if (action !== "move") window.requestAnimationFrame(() => clearTimelineMarkerResizePreviews("zoom", part.id, initialZoomMarkers));
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function updateTranslationFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedTranslationDragItems(part, marker);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    if (!isSelectionMove) onSelectTranslationMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialTranslationMarkers = part.translationMarkers;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "translation");
      const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "translation", activePartIds, snapThresholdSeconds);
      return { blockDeltaSeconds, moves };
    }

    function commitMoveDrag(clientX: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, snap);
      if (dragItems.length > 1) {
        onMoveTranslationMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move) onMoveTranslationMarker(move.sourcePartId, move.markerId, move.targetPartId, move.start);
    }

    function getResizeDragState(clientX: number) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      return resizeTimelineMarkersWithPush(initialTranslationMarkers, marker.id, action as "start" | "end", deltaSeconds, part.duration);
    }

    function commitResizeDrag(clientX: number) {
      const nextMarkers = getResizeDragState(clientX);
      onUpdateTranslationMarkers(part.id, () => nextMarkers);
    }

    function applyDrag(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "move") {
        const { blockDeltaSeconds } = getMoveDragState(clientX, snap);
        setTimelineMarkerDragTransforms("translation", dragItems, blockDeltaSeconds * pixelsPerSecond);
        return;
      }

      if (action === "start" || action === "end") {
        const nextMarkers = resizeTimelineMarkersWithPush(initialTranslationMarkers, marker.id, action, deltaSeconds, part.duration);
        setTimelineMarkerResizePreviews("translation", part.id, initialTranslationMarkers, nextMarkers, pixelsPerSecond);
        return;
      }
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.abs(pendingClientX - initialClientX) < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        setDraggingTranslationMarkerId(marker.id);
      }
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        if (action === "move") commitMoveDrag(pendingClientX, pointerEvent.shiftKey);
        else commitResizeDrag(pendingClientX);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraggingTranslationMarkerId(null);
      if (action === "move") window.requestAnimationFrame(() => clearTimelineMarkerDragTransforms("translation", dragItems));
      if (action !== "move") window.requestAnimationFrame(() => clearTimelineMarkerResizePreviews("translation", part.id, initialTranslationMarkers));
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const playheadColor = "#ff3b30";

  return (
    <footer className="grid min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-1.5 border-t border-[#1d2028] bg-[#141821] px-[22px] pb-[18px] pt-2.5">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]">
        <div className="flex rounded-full border border-[#2d313b] bg-[#111319] p-1 normal-case tracking-normal" aria-label="Timeline mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "edit" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("edit")}>Edit</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "composition" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("composition")}>Direct</button>
        </div>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <input aria-label="Timeline zoom" className="h-2 w-[168px] accent-[#737884] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#474d5b] [&::-webkit-slider-thumb]:bg-[#9b9da7] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#474d5b] [&::-moz-range-thumb]:bg-[#9b9da7]" type="range" min={0.5} max={4} step={0.05} value={timelineZoom} onChange={(event) => updateTimelineZoom(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline out" onClick={() => updateTimelineZoom(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline in" onClick={() => updateTimelineZoom(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-[72px_minmax(0,1fr)] gap-x-4 overflow-hidden">
        <div className={`grid ${laneRows} pr-1`}>
          <div />
          {isCompositionMode ? <div className={`${mutedCaps} self-center`}>Adjust</div> : null}
          {isCompositionMode ? <div className={`${mutedCaps} self-center`}>Pan</div> : null}
          {isCompositionMode ? <div className={`${mutedCaps} self-center`}>Zoom</div> : null}
          <div className={`${mutedCaps} self-center`}>Comp</div>
        </div>
        <div ref={timelineViewportRef} className="timeline-scrollbar min-h-0 overflow-x-scroll overflow-y-hidden px-3 [scrollbar-gutter:stable]" onScroll={saveTimelineDisplacement}>
          <div className={`grid ${laneRows}`} style={{ width: contentWidth }}>
            <div ref={timelineRef} className="relative h-[32px] pt-1.5 text-xs text-[#777b86] tabular-nums">
              <div className="absolute inset-x-0 top-0 z-20 h-[38px]" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub} />
              {ticks.map((tick) => {
                const isStart = tick === 0;
                const isEnd = tick === sceneDuration;
                const labelAlign = isStart ? "translate-x-0 text-left after:left-0" : isEnd ? "-translate-x-full text-right after:left-full" : "-translate-x-1/2 text-center after:left-1/2";
                return <span className={`absolute bottom-0 ${labelAlign} after:absolute after:bottom-[-9px] after:h-[7px] after:w-px after:bg-[#3a3f4d] after:content-['']`} key={tick} style={{ left: `${(tick / sceneDuration) * 100}%` }}>{formatTime(tick)}</span>;
              })}
              <div ref={playbackPlayheadRef} className="pointer-events-none absolute top-[14px] z-30 w-px will-change-transform" style={{ left: `var(--clipper-playhead-left, ${(currentSceneTime / sceneDuration) * 100}%)`, height: playheadHeight, backgroundColor: playheadColor, transform: "translate3d(var(--clipper-playhead-x, 0px), 0, 0)" }}><div className="absolute left-1/2 top-[-8px] h-3 w-2.5 -translate-x-1/2 rounded-[2px]" style={{ backgroundColor: playheadColor, clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)" }} /></div>
            </div>
            {isCompositionMode ? <div className="relative block overflow-hidden border border-[#2d313b] bg-[#111319] transition" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
              {adjustmentLayers.map((layer) => (
                <div data-timeline-control data-timeline-marker-kind="adjustment" data-timeline-adjustment-id={layer.id} key={layer.id} role="button" tabIndex={0} className={`absolute top-[7px] h-[30px] min-w-[34px] cursor-default overflow-hidden rounded-[10px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#a77cff,#5f35c6)] px-3 py-1.5 text-left text-xs font-extrabold text-white ${layer.id === selectedAdjustmentLayerId ? "z-20 outline outline-2 outline-[var(--clipper-accent)] shadow-[0_0_0_4px_rgb(var(--clipper-accent-rgb)/0.18)]" : "opacity-85"}`} style={{ left: `${(layer.start / sceneDuration) * 100}%`, width: `calc(${(layer.duration / sceneDuration) * 100}% + var(--clipper-adjustment-resize-width, 0px))` }} onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "move")} onClick={() => onSelectAdjustmentLayer(layer.id)} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "adjustment", layerId: layer.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{layer.name}: {layer.effect.every}f</span>
                  <div className="absolute left-0 top-1 bottom-1 w-1 cursor-ew-resize rounded-l-[10px] bg-white/20" onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "start")} />
                  <div className="absolute right-0 top-1 bottom-1 w-1 cursor-ew-resize rounded-r-[10px] bg-white/20" onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "end")} />
                </div>
              ))}
            </div> : null}
            {isCompositionMode ? <div className="relative block overflow-hidden border border-[#2d313b] bg-[#111319] transition" onPointerDown={startTranslationSelection} onPointerMove={continueTranslationSelection} onPointerUp={endTranslationSelection} onPointerCancel={endTranslationSelection}>
              {draggingTranslationMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[rgb(var(--clipper-accent-rgb)/0.9)] shadow-[0_0_10px_rgb(var(--clipper-accent-rgb)/0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`translation-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {translationSelectionDrag ? <TimelineSelectionBox boxRef={translationSelectionBoxRef} drag={translationSelectionDrag} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.map((marker) => (
                <div data-timeline-control data-timeline-marker-kind="translation" data-timeline-marker-part-id={timelinePart.id} data-timeline-marker-id={marker.id} className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-default overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#24b7c9,#127c8d)] px-3 py-2 text-xs font-bold text-white ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedTranslationKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : marker.id === selectedTranslationMarkerId && timelinePart.id === selectedTranslationMarkerPartId ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : "opacity-80"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectTranslationMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "move")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "translation", partId: timelinePart.id, markerId: marker.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Pan {marker.position.x}, {marker.position.y}</span>
                  <div className={`absolute left-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapIn ? "bg-[#37d6c2]" : "rounded-l-[11px] bg-white/15"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapOut ? "bg-[#37d6c2]" : "rounded-r-[11px] bg-white/15"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div> : null}
            {isCompositionMode ? <div className="relative block overflow-hidden border-x border-b border-[#2d313b] bg-[#111319] transition" onPointerDown={startZoomSelection} onPointerMove={continueZoomSelection} onPointerUp={endZoomSelection} onPointerCancel={endZoomSelection}>
              {draggingZoomMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[rgb(var(--clipper-accent-rgb)/0.9)] shadow-[0_0_10px_rgb(var(--clipper-accent-rgb)/0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`zoom-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {zoomSelectionDrag ? <TimelineSelectionBox boxRef={zoomSelectionBoxRef} drag={zoomSelectionDrag} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.map((marker) => (
                <div data-timeline-control data-timeline-marker-kind="zoom" data-timeline-marker-part-id={timelinePart.id} data-timeline-marker-id={marker.id} className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-default overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#f0c95a,#b88312)] px-3 py-2 text-xs font-bold text-[#1a1202] ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedZoomKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : marker.id === selectedZoomMarkerId && timelinePart.id === selectedZoomMarkerPartId ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : "opacity-85"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectZoomMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "move")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "zoom", partId: timelinePart.id, markerId: marker.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Zoom {marker.scale}x</span>
                  <div className={`absolute left-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapIn ? "bg-[#37d6c2]" : "rounded-l-[11px] bg-white/15"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapOut ? "bg-[#37d6c2]" : "rounded-r-[11px] bg-white/15"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div> : null}
            <div className="relative flex h-[58px] overflow-visible border-x border-b border-[#2d313b] bg-[#111319] transition" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
              {timeline.map((item) => {
                const isEmptyPart = item.objects.length === 0 && item.background.elements.length === 0;
                return (
                  <button data-timeline-control draggable key={item.id} className={`relative flex min-w-[86px] cursor-default items-end justify-between gap-2 overflow-hidden ring-1 ring-inset ring-black/55 px-3 py-2 text-left text-[13px] leading-none before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${isEmptyPart ? "bg-[linear-gradient(180deg,#2b2d35,#191b21)] text-[#8c929f] opacity-75" : "bg-[linear-gradient(180deg,#38a86d,#17603c)] text-white"} ${item.id === selectedPartId && !selectedZoomMarkerId && !selectedTranslationMarkerId ? "z-20 opacity-100 outline outline-2 outline-[var(--clipper-accent)] shadow-[0_0_0_4px_rgb(var(--clipper-accent-rgb)/0.18)]" : ""}`} style={{ width: `${(item.duration / sceneDuration) * 100}%` }} onPointerDown={() => onSelectPart(item.id)} onClick={() => onSelectPart(item.id)} onDragStart={(event) => onPartDragStart(event, item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onPartDrop(event, item.id)} onDragEnd={() => setDraggedPartId(null)}>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{item.name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{item.duration}s</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function TimelineSelectionBox({ boxRef, drag }: { boxRef: RefObject<HTMLDivElement | null>; drag: TimelineSelectionDrag }) {
  useLayoutEffect(() => {
    const element = boxRef.current;
    const rect = element?.parentElement?.getBoundingClientRect();
    if (element && rect) updateTimelineSelectionBoxElement(element, drag, rect);
  }, [boxRef, drag]);

  return <div ref={boxRef} className="pointer-events-none absolute top-[6px] z-10 h-[46px] rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.13)] will-change-transform" />;
}

export function updateTimelineSelectionBoxElement(element: HTMLDivElement, drag: TimelineSelectionDrag, rect: DOMRect) {
  const startX = clamp(drag.startX - rect.left, 0, rect.width);
  const currentX = clamp(drag.currentX - rect.left, 0, rect.width);
  element.style.display = Math.abs(currentX - startX) >= 4 ? "block" : "none";
  element.style.transform = `translate3d(${Math.min(startX, currentX)}px, 0, 0)`;
  element.style.width = `${Math.abs(currentX - startX)}px`;
}
