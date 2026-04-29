import { Eye, EyeOff, Link2, Minus, MoreHorizontal, Plus } from "lucide-react";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import type { AdjustmentLayerSelection, TimelineNodeContextTarget, TimelineSelectionDrag, TranslationMarkerSelection, ZoomMarkerSelection } from "../../app/types";
import { clamp, roundTenth } from "../../core/math";
import { buildLinearTimeline, formatTime, getAdjustmentLayerRowId, getAdjustmentPlacement, getMendedMarkerDragItems, getScrubSnapBoundaries, getTimelineDragConstraintItems, getTimelineMarkerDragSnapBoundaries, getTimelineMarkerMoves, getTimelineMotionLayersWithMarkers, getTimelinePartAtTime, getTimelineTicks, getTopTimelineItemAtTime, getTranslationMarkerLayerId, getTranslationMarkerLayerKind, getZoomMarkerLayerId, resizeTimelineMarkersWithPush, snapScrubTimeToBoundary, uniqueTimelineDragItems, type TimelineMarkerDragItem, type TimelineMarkerMove } from "../../core/timeline";
import { defaultTimelineLayerState } from "../../core/project";
import { getAdjustmentEffectPackage, getEffectDragType, getEffectPackage, getMotionEffectPackage, installedEffectPackages } from "../../core/effects/registry";
import { getFrameSkipEvery } from "../../core/effects/adjustments";
import { getTimelineLayerDragPreview, getTimelineLayerRowAtClientY, type TimelineLayerCategory, type TimelineLayerLayout } from "../../core/timelineLayers";
import type { AdjustmentEffectId, AdjustmentLayer, MotionEffectId, MotionEffectKind, Part, TimelineLayerState, TimelineMode, TimelineMotionLayerKind, TimelinePart, TimelineViewportState, TranslationMarker, ZoomMarker } from "../../core/types";
import type { EffectPointerDragDetail } from "../ToolsPanel";

export type TimelinePanelProps = {
  timelineName: string;
  timeline: TimelinePart[];
  timelineLayers: TimelineLayerState;
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
  selectedAdjustmentLayers: AdjustmentLayerSelection[];
  sceneDuration: number;
  currentSceneTime: number;
  isPlaying: boolean;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  fastSelectEnabled: boolean;
  scrubCommitThrottleMs: number;
  scrubSnapEnabled: boolean;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
  onTimelineLayersChange: (updater: (state: TimelineLayerState) => TimelineLayerState, options?: { history?: boolean }) => void;
  onAddAdjustmentLayer: (targetLayerId?: string, placement?: "before" | "after") => void;
  onRemoveAdjustmentLayer: (layerId: string) => void;
  onAddMotionLayer: (kind?: TimelineMotionLayerKind, targetLayerId?: string, placement?: "before" | "after") => void;
  onRemoveMotionLayer: (layerId: string) => void;
  onSelectPart: (id: string) => void;
  onSelectZoomMarker: (partId: string, markerId: string) => void;
  onSelectZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  onSelectTranslationMarker: (partId: string, markerId: string) => void;
  onSelectTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  onSelectAdjustmentLayer: (layerId: string) => void;
  onSelectAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  onSelectTimelineNodes: (selection: { adjustmentLayers: AdjustmentLayerSelection[]; zoomMarkers: ZoomMarkerSelection[]; translationMarkers: TranslationMarkerSelection[] }) => void;
  onClearTimelineSelection: () => void;
  onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void;
  onMoveAdjustmentLayer: (layerId: string, start: number, targetLayerId?: string) => void;
  onUpdateAdjustmentLayer: (layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onMoveZoomMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) => void;
  onMoveZoomMarkers: (moves: TimelineMarkerMove[]) => void;
  onMoveTranslationMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) => void;
  onMoveTranslationMarkers: (moves: TimelineMarkerMove[]) => void;
  onUpdateZoomMarkers: (partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) => void;
  onUpdateTranslationMarkers: (partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) => void;
  onAddComposition: (compositionId: string) => void;
  onAddAdjustmentEffect: (effectId: AdjustmentEffectId, sceneTime: number, layerId?: string) => void;
  onAddMotionEffect: (effectId: MotionEffectId, layerId: string, sceneTime: number) => void;
};

type EffectDragPreview = {
  category: "adjustment" | "motion";
  effectId: string;
  kind?: MotionEffectKind;
  layerKey: string;
  start: number;
  duration: number;
  initialClientX: number;
  initialStart: number;
};

export function TimelinePanel({ timelineName, timeline, timelineLayers, adjustmentLayers, timelineViewportState, mode, selectedPartId, selectedZoomMarkerPartId, selectedZoomMarkerId, selectedZoomMarkers, selectedTranslationMarkerPartId, selectedTranslationMarkerId, selectedTranslationMarkers, selectedAdjustmentLayerId, selectedAdjustmentLayers, sceneDuration, currentSceneTime, isPlaying, playbackPlayheadRef, scrubbingRef, fastSelectEnabled, scrubCommitThrottleMs, scrubSnapEnabled, onScrub, onScrubStart, onScrubEnd, onModeChange, onTimelineViewportStateChange, onTimelineLayersChange, onAddAdjustmentLayer, onRemoveAdjustmentLayer, onAddMotionLayer, onRemoveMotionLayer, onSelectPart, onSelectZoomMarker, onSelectZoomMarkers, onSelectTranslationMarker, onSelectTranslationMarkers, onSelectAdjustmentLayer, onSelectAdjustmentLayers, onSelectTimelineNodes, onClearTimelineSelection, onOpenNodeContextMenu, onMoveAdjustmentLayer, onUpdateAdjustmentLayer, onReorderPart, onMoveZoomMarker, onMoveZoomMarkers, onMoveTranslationMarker, onMoveTranslationMarkers, onUpdateZoomMarkers, onUpdateTranslationMarkers, onAddComposition, onAddAdjustmentEffect, onAddMotionEffect }: TimelinePanelProps) {
  const ticks = useMemo(() => getTimelineTicks(sceneDuration), [sceneDuration]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineRulerViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineLayerRailRef = useRef<HTMLDivElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingAdjustmentLayerId, setDraggingAdjustmentLayerId] = useState<string | null>(null);
  const [draggingZoomMarkerId, setDraggingZoomMarkerId] = useState<string | null>(null);
  const [draggingTranslationMarkerId, setDraggingTranslationMarkerId] = useState<string | null>(null);
  const [adjustmentSelectionDrag, setAdjustmentSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [zoomSelectionDrag, setZoomSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
  const [translationSelectionDrag, setTranslationSelectionDrag] = useState<TimelineSelectionDrag | null>(null);
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
  const zoomSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const translationSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const timelineSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const adjustmentSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const zoomSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const translationSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const timelineSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const adjustmentSelectionFrameRef = useRef(0);
  const zoomSelectionFrameRef = useRef(0);
  const translationSelectionFrameRef = useRef(0);
  const timelineSelectionFrameRef = useRef(0);
  const liveAdjustmentSelectionIdsRef = useRef("");
  const liveZoomSelectionIdsRef = useRef("");
  const liveTranslationSelectionIdsRef = useRef("");
  const liveTimelineSelectionIdsRef = useRef("");
  const scrubClientXRef = useRef<number | null>(null);
  const scrubSnapRef = useRef(false);
  const scrubAutoScrollFrameRef = useRef(0);
  const scrubPreviewFrameRef = useRef(0);
  const pendingScrubPreviewRef = useRef<{ clientX: number; snap: boolean; commit: "throttled" | "immediate" } | null>(null);
  const pendingScrubCommitRef = useRef<number | null>(null);
  const latestScrubPreviewTimeRef = useRef<number | null>(null);
  const scrubCommitTimeoutRef = useRef(0);
  const lastScrubCommitAtRef = useRef(0);
  const currentSceneTimeRef = useRef(currentSceneTime);
  const [shiftSnapActive, setShiftSnapActive] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(timelineViewportState.zoom);
  const restoredTimelineDisplacementRef = useRef<number | null>(null);
  const isScrubSnapActive = scrubSnapEnabled || shiftSnapActive;
  const selectedAdjustmentLayerIds = useMemo(() => new Set(selectedAdjustmentLayers.map((selection) => selection.layerId)), [selectedAdjustmentLayers]);
  const selectedZoomKeys = useMemo(() => new Set(selectedZoomMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedZoomMarkers]);
  const selectedTranslationKeys = useMemo(() => new Set(selectedTranslationMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedTranslationMarkers]);
  const scrubSnapBoundaries = useMemo(() => getScrubSnapBoundaries(timeline, adjustmentLayers), [adjustmentLayers, timeline]);
  const contentWidth = Math.max(sceneDuration * defaultTimelinePixelsPerSecond * timelineZoom, 160);
  const isCompositionMode = mode === "composition";
  const baseMotionLayers = timelineLayers.motionLayers?.length ? timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const motionLayers = useMemo(() => getTimelineMotionLayersWithMarkers(baseMotionLayers, timeline), [baseMotionLayers, timeline]);
  const adjustmentRows = (timelineLayers.adjustmentLayers?.length ? timelineLayers.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!).map((layer) => {
    const effect = getAdjustmentEffectPackage(layer.id);
    return { key: layer.id, accent: effect?.accent ?? "#8f65f2", name: layer.name, hidden: Boolean(layer.hidden), effect };
  });
  const [resizePreviewRowHeights, setResizePreviewRowHeights] = useState<Record<string, number> | null>(null);
  const rowHeights = resizePreviewRowHeights ?? timelineLayers.rowHeights ?? {};
  const layerRows = isCompositionMode
    ? [...adjustmentRows.map((row) => ({ key: row.key, category: "adjust" as const, accent: row.accent })), ...motionLayers.map((layer) => ({ key: layer.id, category: "motion" as const, accent: "#24b7c9" })), { key: "comp", category: "comp" as const, accent: "#38a86d" }]
    : [{ key: "comp", category: "comp" as const, accent: "#38a86d" }];
  const layerRowHeights = layerRows.map((row) => getTimelineLayerRowHeight(rowHeights, row.key));
  const layerRowStarts = layerRowHeights.reduce<number[]>((starts, height, index) => [...starts, index === 0 ? 0 : starts[index - 1] + layerRowHeights[index - 1]], []);
  const layerLayout: TimelineLayerLayout = { rows: layerRows, starts: layerRowStarts, heights: layerRowHeights };
  const laneRowsStyle = { gridTemplateRows: layerRowHeights.map((height) => `${height}px`).join(" ") };
  const laneContentHeight = layerRowHeights.reduce((total, height) => total + height, 0);
  const layerRailWidth = 260;
  const isDraggingAdjustmentLayer = Boolean(draggingAdjustmentLayerId);
  const isDraggingMotionMarker = Boolean(draggingZoomMarkerId || draggingTranslationMarkerId);

  useEffect(() => {
    setTimelineZoom(timelineViewportState.zoom);
  }, [timelineViewportState.zoom]);

  useEffect(() => () => {
    if (adjustmentSelectionFrameRef.current) window.cancelAnimationFrame(adjustmentSelectionFrameRef.current);
    if (zoomSelectionFrameRef.current) window.cancelAnimationFrame(zoomSelectionFrameRef.current);
    if (translationSelectionFrameRef.current) window.cancelAnimationFrame(translationSelectionFrameRef.current);
    if (scrubPreviewFrameRef.current) window.cancelAnimationFrame(scrubPreviewFrameRef.current);
    if (effectDragPreviewFrameRef.current) window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
    if (scrubCommitTimeoutRef.current) window.clearTimeout(scrubCommitTimeoutRef.current);
    setGlobalTimelineDragActive(false);
  }, []);

  function setGlobalTimelineDragActive(active: boolean) {
    setTimelineDragActive(active);
  }

  function withPlayheadSnapBoundary(boundaries: number[]) {
    return Array.from(new Set([...boundaries, currentSceneTimeRef.current])).sort((left, right) => left - right);
  }

  currentSceneTimeRef.current = currentSceneTime;

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;

    if (restoredTimelineDisplacementRef.current !== timelineViewportState.displacement) viewport.scrollLeft = timelineViewportState.displacement;
    syncTimelineRulerScroll(viewport.scrollLeft);
    restoredTimelineDisplacementRef.current = timelineViewportState.displacement;
  }, [contentWidth, timelineViewportState.displacement]);

  function updateTimelineZoom(nextZoom: number) {
    const zoom = clamp(nextZoom, 0.01, 4);
    setTimelineZoom(zoom);
    onTimelineViewportStateChange((state) => ({ ...state, zoom }));
  }

  function syncTimelineRulerScroll(displacement = timelineViewportRef.current?.scrollLeft ?? 0) {
    if (timelineRulerViewportRef.current) timelineRulerViewportRef.current.scrollLeft = displacement;
    if (playbackPlayheadRef.current) playbackPlayheadRef.current.style.setProperty("--clipper-timeline-scroll-x", `${-displacement}px`);
  }

  function saveTimelineDisplacement() {
    const viewport = timelineViewportRef.current;
    const displacement = Math.max(Math.round(viewport?.scrollLeft ?? 0), 0);
    if (timelineLayerRailRef.current) timelineLayerRailRef.current.style.transform = `translate3d(0, ${-(viewport?.scrollTop ?? 0)}px, 0)`;
    syncTimelineRulerScroll(displacement);
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
    latestScrubPreviewTimeRef.current = time;
    const playhead = playbackPlayheadRef.current;
    if (!playhead) return;
    playhead.style.setProperty("--clipper-playhead-left", `${sceneDuration > 0 ? (time / sceneDuration) * 100 : 0}%`);
    playhead.style.removeProperty("--clipper-playhead-x");
  }

  useLayoutEffect(() => {
    if (!scrubbingRef.current || latestScrubPreviewTimeRef.current === null) return;
    previewScrubTime(latestScrubPreviewTimeRef.current);
  });

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

    const item = getTopTimelineItemAtTime(timeline, time, adjustmentLayers, motionLayers, adjustmentRows.map((row) => row.key));
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
        if (viewport.scrollLeft !== previousScrollLeft) {
          syncTimelineRulerScroll(viewport.scrollLeft);
          scheduleScrubFromClientX(clientX, scrubSnapRef.current);
        }
      }

      scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function scrubFromPointer(event: PointerEvent<HTMLDivElement>) {
    const snap = event.shiftKey;
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
    onScrubStart();
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
    latestScrubPreviewTimeRef.current = null;
    setShiftSnapActive(false);
    stopScrubAutoScroll();
    onScrubEnd();
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
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
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
      onClearTimelineSelection();
      return;
    }

    const selection = zoomSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectZoomMarkers(selection);
    else onClearTimelineSelection();
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
      onClearTimelineSelection();
      return;
    }

    const selection = translationSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectTranslationMarkers(selection);
    else onClearTimelineSelection();
  }

  function startTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { startX: event.clientX, currentX: event.clientX, startY: event.clientY, currentY: event.clientY };
    timelineSelectionDragRef.current = next;
    liveTimelineSelectionIdsRef.current = "";
    setTimelineSelectionDrag(next);
  }

  function timelineSelectionFromDrag(selectionDrag: TimelineSelectionDrag, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const dragTop = clamp(Math.min(selectionDrag.startY ?? rect.top, selectionDrag.currentY ?? rect.top) - rect.top, 0, rect.height);
    const dragBottom = clamp(Math.max(selectionDrag.startY ?? rect.top, selectionDrag.currentY ?? rect.top) - rect.top, 0, rect.height);
    const adjustmentSelection: AdjustmentLayerSelection[] = [];
    const zoomSelection: ZoomMarkerSelection[] = [];
    const translationSelection: TranslationMarkerSelection[] = [];

    for (const [rowIndex, row] of layerRows.entries()) {
      const rowTop = layerRowStarts[rowIndex];
      const rowBottom = rowTop + layerRowHeights[rowIndex];
      if (rowBottom < dragTop || rowTop > dragBottom) continue;

      const adjustmentRow = adjustmentRows.find((item) => item.key === row.key);
      if (adjustmentRow) {
        adjustmentSelection.push(...adjustmentLayers
          .filter((layer) => getAdjustmentLayerRowId(layer) === adjustmentRow.key)
          .filter((layer) => layer.start <= end && layer.start + layer.duration >= start)
          .map((layer) => ({ layerId: layer.id })));
        continue;
      }

      const layer = motionLayers.find((item) => item.id === row.key);
      if (!layer) continue;

      zoomSelection.push(...timeline.flatMap((timelinePart) => timelinePart.zoomMarkers
        .filter((marker) => isZoomMarkerOnLayer(marker, layer.id))
        .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
        .map((marker) => ({ partId: timelinePart.id, markerId: marker.id }))));
      translationSelection.push(...timeline.flatMap((timelinePart) => timelinePart.translationMarkers
        .filter((marker) => isAnyTranslationMarkerOnLayer(marker, layer.id))
        .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
        .map((marker) => ({ partId: timelinePart.id, markerId: marker.id }))));
    }

    return { adjustmentLayers: adjustmentSelection, zoomMarkers: zoomSelection, translationMarkers: translationSelection };
  }

  function timelineSelectionKey(selection: { adjustmentLayers: AdjustmentLayerSelection[]; zoomMarkers: ZoomMarkerSelection[]; translationMarkers: TranslationMarkerSelection[] }) {
    return [
      selection.adjustmentLayers.map((item) => item.layerId).join(","),
      selection.zoomMarkers.map((item) => `${item.partId}:${item.markerId}`).join(","),
      selection.translationMarkers.map((item) => `${item.partId}:${item.markerId}`).join(","),
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

  function selectedZoomResizeTargets(part: TimelinePart, marker: ZoomMarker) {
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) return [{ part, marker }];
    const targets = selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? [{ part: selectedPart, marker: selectedMarker }] : [];
    });
    return targets.length > 0 ? uniqueTimelineResizeTargets(targets) : [{ part, marker }];
  }

  function selectedTranslationResizeTargets(part: TimelinePart, marker: TranslationMarker) {
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) return [{ part, marker }];
    const targets = selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? [{ part: selectedPart, marker: selectedMarker }] : [];
    });
    return targets.length > 0 ? uniqueTimelineResizeTargets(targets) : [{ part, marker }];
  }

  function selectedAdjustmentResizeTargets(layer: AdjustmentLayer) {
    if (!selectedAdjustmentLayerIds.has(layer.id)) return [layer];
    const targets = selectedAdjustmentLayers.flatMap((selection) => adjustmentLayers.find((item) => item.id === selection.layerId) ?? []);
    return targets.length > 0 ? uniqueAdjustmentResizeTargets(targets) : [layer];
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

  function blockDeltaForTimelineDrag(items: TimelineMarkerDragItem[], rawDelta: number, snapThresholdSeconds: number, snap: boolean, kind: "zoom" | "translation", targetLayerId?: string) {
    const constraintItems = getTimelineDragConstraintItems(items);
    const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
    const movingKeys = new Set(items.map((item) => `${item.partId}:${item.markerId}`));
    const snapBoundaries = getUniversalTimelineSnapBoundaries(kind, movingKeys);
    let nextDelta = rawDelta;

    if (snap) {
      for (const boundary of snapBoundaries) {
        if (Math.abs(blockStart + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockStart;
        if (Math.abs(blockEnd + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockEnd;
      }
    }

    return clamp(nextDelta, -blockStart, sceneDuration - blockEnd);
  }

  function getUniversalTimelineSnapBoundaries(kind: "zoom" | "translation", movingKeys: Set<string>) {
    return withPlayheadSnapBoundary(Array.from(new Set([
      ...getScrubSnapBoundaries(timeline, adjustmentLayers),
      ...getTimelineMarkerDragSnapBoundaries(timeline, kind, movingKeys),
    ])).sort((left, right) => left - right));
  }

  function getTimelineMarkerElement(kind: "zoom" | "translation", partId: string, markerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-marker-kind="${kind}"][data-timeline-marker-part-id="${CSS.escape(partId)}"][data-timeline-marker-id="${CSS.escape(markerId)}"]`) ?? null;
  }

  function getTimelineMarkerLayerId(kind: "zoom" | "translation", partId: string, markerId: string) {
    const timelinePart = timeline.find((item) => item.id === partId);
    if (kind === "zoom") return timelinePart?.zoomMarkers.find((marker) => marker.id === markerId)?.layerId ?? "";
    const marker = timelinePart?.translationMarkers.find((item) => item.id === markerId);
    return marker?.layerId ?? "";
  }

  function setTimelineMarkerDragTransforms(kind: "zoom" | "translation", items: TimelineMarkerDragItem[], deltaPixels: number, deltaYPixels = 0, previewHeight?: number) {
    for (const item of items) {
      const element = getTimelineMarkerElement(kind, item.partId, item.markerId);
      if (!element) continue;
      element.style.transform = `translate3d(${deltaPixels}px, ${deltaYPixels}px, 0)`;
      if (previewHeight !== undefined) {
        element.style.bottom = "auto";
        element.style.height = `${previewHeight}px`;
      }
      element.style.willChange = "transform";
      element.style.zIndex = "25";
    }
  }

  function getDropLayerId(category: TimelineLayerCategory, clientY: number) {
    const rect = timelineViewportRef.current?.firstElementChild?.getBoundingClientRect();
    return getTimelineLayerRowAtClientY(layerLayout, rect, clientY, category)?.row.key;
  }

  function getLayerDragPreview(category: TimelineLayerCategory, sourceLayerId: string | undefined, clientY: number) {
    return getTimelineLayerDragPreview(layerLayout, sourceLayerId, getDropLayerId(category, clientY));
  }

  function clearTimelineMarkerDragTransforms(kind: "zoom" | "translation", items: TimelineMarkerDragItem[]) {
    for (const item of items) {
      const element = getTimelineMarkerElement(kind, item.partId, item.markerId);
      if (!element) continue;
      element.style.removeProperty("transform");
      element.style.removeProperty("bottom");
      element.style.removeProperty("height");
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

  function getTimelineAdjustmentElement(layerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-adjustment-id="${CSS.escape(layerId)}"]`) ?? null;
  }

  function setAdjustmentResizePreviews(initialLayers: AdjustmentLayer[], nextLayers: AdjustmentLayer[], pixelsPerSecond: number) {
    for (const initialLayer of initialLayers) {
      const nextLayer = nextLayers.find((item) => item.id === initialLayer.id);
      if (!nextLayer || (nextLayer.start === initialLayer.start && nextLayer.duration === initialLayer.duration)) continue;
      const element = getTimelineAdjustmentElement(initialLayer.id);
      if (!element) continue;
      element.style.transform = `translate3d(${(nextLayer.start - initialLayer.start) * pixelsPerSecond}px, 0, 0)`;
      element.style.setProperty("--clipper-adjustment-resize-width", `${(nextLayer.duration - initialLayer.duration) * pixelsPerSecond}px`);
      element.style.willChange = "transform, width";
      element.style.zIndex = "25";
    }
  }

  function setAdjustmentDragPreviews(initialLayers: AdjustmentLayer[], nextLayers: AdjustmentLayer[], pixelsPerSecond: number, deltaYPixels = 0, previewHeight?: number) {
    for (const initialLayer of initialLayers) {
      const nextLayer = nextLayers.find((item) => item.id === initialLayer.id);
      const element = getTimelineAdjustmentElement(initialLayer.id);
      if (!nextLayer || !element) continue;
      element.style.transform = `translate3d(${(nextLayer.start - initialLayer.start) * pixelsPerSecond}px, ${deltaYPixels}px, 0)`;
      if (previewHeight !== undefined) {
        element.style.bottom = "auto";
        element.style.height = `${previewHeight}px`;
      }
      element.style.willChange = "transform";
      element.style.zIndex = "25";
    }
  }

  function clearAdjustmentResizePreviews(layers: AdjustmentLayer[]) {
    for (const layer of layers) {
      const element = getTimelineAdjustmentElement(layer.id);
      if (!element) continue;
      element.style.removeProperty("transform");
      element.style.removeProperty("--clipper-adjustment-resize-width");
      element.style.removeProperty("bottom");
      element.style.removeProperty("height");
      element.style.removeProperty("will-change");
      element.style.removeProperty("z-index");
    }
  }

  function updateAdjustmentFromPointer(event: PointerEvent<HTMLElement>, layer: AdjustmentLayer, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const resizeTargets = selectedAdjustmentResizeTargets(layer);
    const isSelectionMove = action === "move" && selectedAdjustmentLayerIds.has(layer.id) && resizeTargets.length > 1;
    const isSelectionResize = action !== "move" && selectedAdjustmentLayerIds.has(layer.id) && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectAdjustmentLayer(layer.id);
    const element = event.currentTarget.closest("[data-timeline-adjustment-id]") as HTMLElement | null ?? event.currentTarget;
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = getAdjustmentLayerRowId(layer);
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const resizeTargetIds = new Set(resizeTargets.map((item) => item.id));
    const boundaries = withPlayheadSnapBoundary(getScrubSnapBoundaries(timeline, adjustmentLayers.filter((item) => !resizeTargetIds.has(item.id))));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getNextLayer(targetLayer: AdjustmentLayer, clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "start") {
        const maxStart = targetLayer.start + targetLayer.duration - 0.1;
        let nextStart = clamp(targetLayer.start + deltaSeconds, 0, maxStart);
        if (snap) nextStart = clamp(snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds), 0, maxStart);
        return { ...targetLayer, start: nextStart, duration: targetLayer.duration + targetLayer.start - nextStart };
      }

      if (action === "end") {
        const currentEnd = targetLayer.start + targetLayer.duration;
        let nextEnd = clamp(currentEnd + deltaSeconds, targetLayer.start + 0.1, sceneDuration);
        if (snap) nextEnd = clamp(snapScrubTimeToBoundary(nextEnd, boundaries, snapThresholdSeconds), targetLayer.start + 0.1, sceneDuration);
        return { ...targetLayer, duration: nextEnd - targetLayer.start };
      }

      let nextStart = clamp(targetLayer.start + deltaSeconds, 0, Math.max(sceneDuration - targetLayer.duration, 0));
      if (snap) {
        nextStart = snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds);
        nextStart = clamp(nextStart, 0, Math.max(sceneDuration - targetLayer.duration, 0));
      }
      return { ...targetLayer, start: nextStart };
    }

    function getNextLayers(clientX: number, snap: boolean) {
      return resizeTargets.map((target) => getNextLayer(target, clientX, snap));
    }

    function applyDrag(clientX: number, snap: boolean) {
      const nextLayer = getNextLayer(layer, clientX, snap);
      if (action === "move" && isSelectionMove) {
        const preview = getLayerDragPreview("adjust", sourceLayerId, pendingClientY);
        setAdjustmentDragPreviews(resizeTargets, getNextLayers(clientX, snap), pixelsPerSecond, preview.deltaY, preview.height);
        return;
      }
      if (action !== "move" && isSelectionResize) {
        setAdjustmentResizePreviews(resizeTargets, getNextLayers(clientX, snap), pixelsPerSecond);
        return;
      }
      const preview = action === "move" ? getLayerDragPreview("adjust", sourceLayerId, pendingClientY) : { deltaY: 0, height: undefined };
      element.style.transform = `translate3d(${(nextLayer.start - layer.start) * pixelsPerSecond}px, ${preview.deltaY}px, 0)`;
      element.style.setProperty("--clipper-adjustment-resize-width", `${(nextLayer.duration - layer.duration) * pixelsPerSecond}px`);
      if (preview.height !== undefined) {
        element.style.bottom = "auto";
        element.style.height = `${preview.height}px`;
      }
      element.style.willChange = "transform, width";
      element.style.zIndex = "25";
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingClientY = pointerEvent.clientY;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.max(Math.abs(pendingClientX - initialClientX), Math.abs(pendingClientY - initialClientY)) < 4) return;
      if (!hasDragged) {
        setGlobalTimelineDragActive(true);
        if (action === "move") setDraggingAdjustmentLayerId(layer.id);
      }
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
        const nextLayer = getNextLayer(layer, pendingClientX, pointerEvent.shiftKey);
        if (action === "move") {
          const targetLayerId = getDropLayerId("adjust", pendingClientY) ?? sourceLayerId;
          if (isSelectionMove) {
            for (const targetLayer of getNextLayers(pendingClientX, pointerEvent.shiftKey)) {
              onUpdateAdjustmentLayer(targetLayer.id, () => ({ ...targetLayer, layerId: targetLayerId, start: roundTenth(targetLayer.start) }));
            }
          } else {
            onMoveAdjustmentLayer(layer.id, nextLayer.start, targetLayerId);
          }
        }
        else {
          for (const targetLayer of getNextLayers(pendingClientX, pointerEvent.shiftKey)) {
            onUpdateAdjustmentLayer(targetLayer.id, () => ({ ...targetLayer, start: roundTenth(targetLayer.start), duration: roundTenth(targetLayer.duration) }));
          }
        }
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGlobalTimelineDragActive(false);
      setDraggingAdjustmentLayerId(null);
      window.requestAnimationFrame(() => {
        if (isSelectionMove || isSelectionResize) clearAdjustmentResizePreviews(resizeTargets);
        else {
          element.style.removeProperty("transform");
          element.style.removeProperty("--clipper-adjustment-resize-width");
          element.style.removeProperty("bottom");
          element.style.removeProperty("height");
          element.style.removeProperty("will-change");
          element.style.removeProperty("z-index");
        }
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function updateZoomFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedZoomDragItems(part, marker);
    const resizeTargets = selectedZoomResizeTargets(part, marker);
    const targetAlreadySelected = selectedZoomKeys.has(`${part.id}:${marker.id}`);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize = action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectZoomMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = marker.layerId ?? "";
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      const targetLayerId = getMotionDropLayerId("motion", pendingClientY);
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "zoom", targetLayerId);
      const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "zoom", activePartIds, snapThresholdSeconds).map((move) => ({ ...move, targetLayerId }));
      return { blockDeltaSeconds, moves };
    }

    function commitMoveDrag(clientX: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, snap);
      if (dragItems.length > 1) {
        onMoveZoomMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move) onMoveZoomMarker(move.sourcePartId, move.markerId, move.targetPartId, move.start, move.targetLayerId);
    }

    function getResizeDeltaSeconds(clientX: number, snap: boolean) {
      let deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (!snap || (action !== "start" && action !== "end")) return deltaSeconds;

      const movingKeys = new Set([`${part.id}:${marker.id}`]);
      const boundaries = getUniversalTimelineSnapBoundaries("zoom", movingKeys);
      const edgeTime = part.start + marker.start + (action === "end" ? marker.duration : 0) + deltaSeconds;
      deltaSeconds += snapScrubTimeToBoundary(edgeTime, boundaries, snapThresholdSeconds) - edgeTime;
      return deltaSeconds;
    }

    function getResizeDragState(clientX: number, snap: boolean) {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      return resizeTargets.reduce((states, target) => {
        const currentMarkers = states.get(target.part.id) ?? target.part.zoomMarkers;
        states.set(target.part.id, resizeTimelineMarkersWithPush(currentMarkers, target.marker.id, action as "start" | "end", deltaSeconds, target.part.duration));
        return states;
      }, new Map<string, ZoomMarker[]>());
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      const nextMarkersByPart = getResizeDragState(clientX, snap);
      for (const [partId, nextMarkers] of nextMarkersByPart) onUpdateZoomMarkers(partId, () => nextMarkers);
    }

    function applyDrag(clientX: number, snap: boolean) {
      if (action === "move") {
        const { blockDeltaSeconds } = getMoveDragState(clientX, snap);
        const preview = getLayerDragPreview("motion", sourceLayerId, pendingClientY);
        setTimelineMarkerDragTransforms("zoom", dragItems, blockDeltaSeconds * pixelsPerSecond, preview.deltaY, preview.height);
        return;
      }

      if (action === "start" || action === "end") {
        const nextMarkersByPart = getResizeDragState(clientX, snap);
        for (const [partId, nextMarkers] of nextMarkersByPart) {
          const previewPart = timeline.find((item) => item.id === partId);
          if (previewPart) setTimelineMarkerResizePreviews("zoom", partId, previewPart.zoomMarkers, nextMarkers, pixelsPerSecond);
        }
        return;
      }
    }

    function scheduleDragPreview() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingClientY = pointerEvent.clientY;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.max(Math.abs(pendingClientX - initialClientX), Math.abs(pendingClientY - initialClientY)) < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        setGlobalTimelineDragActive(true);
        setDraggingZoomMarkerId(marker.id);
      }
      scheduleDragPreview();
    }

    function key(pointerEvent: KeyboardEvent) {
      if (pointerEvent.key !== "Shift") return;
      pendingSnap = pointerEvent.shiftKey;
      if (hasDragged) scheduleDragPreview();
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        if (action === "move") commitMoveDrag(pendingClientX, pointerEvent.shiftKey);
        else commitResizeDrag(pendingClientX, pointerEvent.shiftKey);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      setGlobalTimelineDragActive(false);
      setDraggingZoomMarkerId(null);
      if (action === "move") window.requestAnimationFrame(() => clearTimelineMarkerDragTransforms("zoom", dragItems));
      if (action !== "move") window.requestAnimationFrame(() => {
        for (const target of resizeTargets) clearTimelineMarkerResizePreviews("zoom", target.part.id, target.part.zoomMarkers);
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
  }

  function updateTranslationFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedTranslationDragItems(part, marker);
    const resizeTargets = selectedTranslationResizeTargets(part, marker);
    const targetAlreadySelected = selectedTranslationKeys.has(`${part.id}:${marker.id}`);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize = action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectTranslationMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = marker.layerId ?? "";
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      const targetLayerId = getMotionDropLayerId("motion", pendingClientY);
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "translation", targetLayerId);
      const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "translation", activePartIds, snapThresholdSeconds).map((move) => ({ ...move, targetLayerId }));
      return { blockDeltaSeconds, moves };
    }

    function commitMoveDrag(clientX: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, snap);
      if (dragItems.length > 1) {
        onMoveTranslationMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move) onMoveTranslationMarker(move.sourcePartId, move.markerId, move.targetPartId, move.start, move.targetLayerId);
    }

    function getResizeDeltaSeconds(clientX: number, snap: boolean) {
      let deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (!snap || (action !== "start" && action !== "end")) return deltaSeconds;

      const movingKeys = new Set([`${part.id}:${marker.id}`]);
      const boundaries = getUniversalTimelineSnapBoundaries("translation", movingKeys);
      const edgeTime = part.start + marker.start + (action === "end" ? marker.duration : 0) + deltaSeconds;
      deltaSeconds += snapScrubTimeToBoundary(edgeTime, boundaries, snapThresholdSeconds) - edgeTime;
      return deltaSeconds;
    }

    function getResizeDragState(clientX: number, snap: boolean) {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      return resizeTargets.reduce((states, target) => {
        const currentMarkers = states.get(target.part.id) ?? target.part.translationMarkers;
        const targetLayerId = getTimelineMarkerLayerId("translation", target.part.id, target.marker.id);
        const layerMarkers = currentMarkers.filter((item) => getTimelineMarkerLayerId("translation", target.part.id, item.id) === targetLayerId);
        const nextLayerMarkers = resizeTimelineMarkersWithPush(layerMarkers, target.marker.id, action as "start" | "end", deltaSeconds, target.part.duration);
        const nextLayerMarkersById = new Map(nextLayerMarkers.map((item) => [item.id, item]));
        states.set(target.part.id, currentMarkers.map((item) => nextLayerMarkersById.get(item.id) ?? item));
        return states;
      }, new Map<string, TranslationMarker[]>());
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      const nextMarkersByPart = getResizeDragState(clientX, snap);
      for (const [partId, nextMarkers] of nextMarkersByPart) onUpdateTranslationMarkers(partId, () => nextMarkers);
    }

    function applyDrag(clientX: number, snap: boolean) {
      if (action === "move") {
        const { blockDeltaSeconds } = getMoveDragState(clientX, snap);
        const preview = getLayerDragPreview("motion", sourceLayerId, pendingClientY);
        setTimelineMarkerDragTransforms("translation", dragItems, blockDeltaSeconds * pixelsPerSecond, preview.deltaY, preview.height);
        return;
      }

      if (action === "start" || action === "end") {
        const nextMarkersByPart = getResizeDragState(clientX, snap);
        for (const [partId, nextMarkers] of nextMarkersByPart) {
          const previewPart = timeline.find((item) => item.id === partId);
          if (previewPart) setTimelineMarkerResizePreviews("translation", partId, previewPart.translationMarkers, nextMarkers, pixelsPerSecond);
        }
        return;
      }
    }

    function scheduleDragPreview() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingClientY = pointerEvent.clientY;
      pendingSnap = pointerEvent.shiftKey;
      if (!hasDragged && Math.max(Math.abs(pendingClientX - initialClientX), Math.abs(pendingClientY - initialClientY)) < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        setGlobalTimelineDragActive(true);
        setDraggingTranslationMarkerId(marker.id);
      }
      scheduleDragPreview();
    }

    function key(pointerEvent: KeyboardEvent) {
      if (pointerEvent.key !== "Shift") return;
      pendingSnap = pointerEvent.shiftKey;
      if (hasDragged) scheduleDragPreview();
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        if (action === "move") commitMoveDrag(pendingClientX, pointerEvent.shiftKey);
        else commitResizeDrag(pendingClientX, pointerEvent.shiftKey);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      setGlobalTimelineDragActive(false);
      setDraggingTranslationMarkerId(null);
      if (action === "move") window.requestAnimationFrame(() => clearTimelineMarkerDragTransforms("translation", dragItems));
      if (action !== "move") window.requestAnimationFrame(() => {
        for (const target of resizeTargets) clearTimelineMarkerResizePreviews("translation", target.part.id, target.part.translationMarkers);
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
  }

  function startLayerNameEdit(layerId: string, name: string) {
    setEditingLayerId(layerId);
    setLayerNameDraft(name);
  }

  function commitLayerNameEdit() {
    const layerId = editingLayerId;
    const nextName = layerNameDraft.trim();
    setEditingLayerId(null);
    if (!layerId || !nextName) return;
    onTimelineLayersChange((state) => {
      if (layerId === "comp") return { ...state, compName: nextName };
      if (adjustmentRows.some((row) => row.key === layerId)) return { ...state, adjustmentLayers: (state.adjustmentLayers ?? defaultTimelineLayerState.adjustmentLayers!).map((layer) => (layer.id === layerId ? { ...layer, name: nextName } : layer)) };
      return { ...state, motionLayers: (state.motionLayers ?? []).map((layer) => (layer.id === layerId ? { ...layer, name: nextName } : layer)) };
    }, { history: true });
  }

  function toggleLayerHidden(layerId: string) {
    onTimelineLayersChange((state) => {
      if (layerId === "comp") return { ...state, compHidden: !state.compHidden || undefined };
      if (adjustmentRows.some((row) => row.key === layerId)) return { ...state, adjustmentLayers: (state.adjustmentLayers ?? defaultTimelineLayerState.adjustmentLayers!).map((layer) => (layer.id === layerId ? { ...layer, hidden: !layer.hidden || undefined } : layer)) };
      return { ...state, motionLayers: (state.motionLayers ?? []).map((layer) => (layer.id === layerId ? { ...layer, hidden: !layer.hidden || undefined } : layer)) };
    }, { history: false });
  }

  function cancelLayerNameEdit() {
    setEditingLayerId(null);
    setLayerNameDraft("");
  }

  function addMotionLayerAround(layerId: string, placement: "before" | "after") {
    onAddMotionLayer(undefined, layerId, placement);
    setMotionLayerMenuId(null);
  }

  function addAdjustmentLayerAround(layerId: string, placement: "before" | "after") {
    onAddAdjustmentLayer(layerId, placement);
    setMotionLayerMenuId(null);
  }

  function moveAdjustmentRow(layerId: string, direction: "up" | "down") {
    onTimelineLayersChange((state) => {
      const layers = state.adjustmentLayers?.length ? state.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!;
      const index = layers.findIndex((layer) => layer.id === layerId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= layers.length) return state;
      const nextLayers = [...layers];
      [nextLayers[index], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[index]];
      return { ...state, adjustmentLayers: nextLayers };
    }, { history: true });
    setMotionLayerMenuId(null);
  }

  function removeAdjustmentLayer(layerId: string) {
    onRemoveAdjustmentLayer(layerId);
    setMotionLayerMenuId(null);
  }

  function moveMotionLayer(layerId: string, direction: "up" | "down") {
    onTimelineLayersChange((state) => {
      const layers = state.motionLayers?.length ? state.motionLayers : defaultTimelineLayerState.motionLayers!;
      const index = layers.findIndex((layer) => layer.id === layerId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= layers.length) return state;
      const nextLayers = [...layers];
      [nextLayers[index], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[index]];
      return { ...state, motionLayers: nextLayers };
    }, { history: true });
    setMotionLayerMenuId(null);
  }

  function removeMotionLayer(layerId: string) {
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
    return clamp(((clientX - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
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
    const left = sceneDuration > 0 ? (preview.start / sceneDuration) * contentWidth : 0;
    const width = sceneDuration > 0 ? (preview.duration / sceneDuration) * contentWidth : 0;
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
    if (Boolean(current) !== Boolean(nextPreview)) window.dispatchEvent(new CustomEvent("clipper:effect-drag-preview", { detail: { active: Boolean(nextPreview) } }));
    if (!nextPreview) {
      if (effectDragPreviewFrameRef.current) window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
      effectDragPreviewFrameRef.current = 0;
      setEffectDragPreview(null);
      return;
    }

    const shouldRemount = !current || current.effectId !== nextPreview.effectId || current.layerKey !== nextPreview.layerKey || current.duration !== nextPreview.duration || current.initialClientX !== nextPreview.initialClientX || current.initialStart !== nextPreview.initialStart;
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

    const timelinePart = getTimelinePartAtTime(timeline, sceneTime);
    if (!timelinePart) return null;
    const kind = effect.kind;
    const duration = Math.min(1, Math.max(sceneDuration, 0.1));
    const start = roundTenth(clamp(sceneTime - duration / 2, 0, Math.max(sceneDuration - duration, 0)));
    return { category: "motion" as const, effectId, kind, layerKey, start, duration, initialClientX: clientX, initialStart: start };
  }

  function previewAdjustmentEffectDrop(effectId: AdjustmentEffectId, layerId: string, clientX: number, sceneTime: number, snap: boolean) {
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) return;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const boundaries = getScrubSnapBoundaries(timeline, adjustmentLayers);
    let nextStart = clamp(sceneTime, 0, Math.max(sceneDuration - base.duration, 0));
    if (snap) nextStart = clamp(snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds), 0, Math.max(sceneDuration - base.duration, 0));
    updateEffectDragPreview({ ...base, start: roundTenth(nextStart) });
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

    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const boundaries = withPlayheadSnapBoundary(getScrubSnapBoundaries(timeline, adjustmentLayers));
    let nextStart = clamp(sceneTime - base.duration / 2, 0, Math.max(sceneDuration - base.duration, 0));
    if (snap) nextStart = clamp(snapScrubTimeToBoundary(nextStart, boundaries, snapThresholdSeconds), 0, Math.max(sceneDuration - base.duration, 0));
    updateEffectDragPreview({ ...base, start: roundTenth(nextStart) });
  }

  function allowAdjustmentEffectDrop(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getAdjustmentEffectPackage(getDraggedEffect(event));
    if (!effect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewAdjustmentEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function dropAdjustmentEffect(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getAdjustmentEffectPackage(getDraggedEffect(event));
    if (!effect) return;
    event.preventDefault();
    const previewStart = effectDragPreviewRef.current?.category === "adjustment" && effectDragPreviewRef.current.effectId === effect.id && effectDragPreviewRef.current.layerKey === layerId ? effectDragPreviewRef.current.start : sceneTime;
    updateEffectDragPreview(null);
    onAddAdjustmentEffect(effect.id, previewStart, layerId);
  }

  function allowMotionEffectDrop(event: DragEvent<HTMLElement>, kind: MotionEffectKind, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    if (effect?.kind !== kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function allowMotionLayerEffectDrop(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(effect.id, layerId, event.clientX, sceneTime, event.shiftKey);
  }

  function dropMotionEffect(event: DragEvent<HTMLElement>, kind: MotionEffectKind, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    if (effect?.kind !== kind) return;
    event.preventDefault();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime = preview?.effectId === effect.id && preview.layerKey === layerId ? preview.start + 0.5 : sceneTime;
    updateEffectDragPreview(null);
    onAddMotionEffect(effect.id, layerId, targetSceneTime);
  }

  function dropMotionLayerEffect(event: DragEvent<HTMLElement>, layerId: string, sceneTime = getDropSceneTime(event)) {
    const effect = getMotionEffectPackage(getDraggedEffect(event));
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime = preview?.effectId === effect.id && preview.layerKey === layerId ? preview.start + 0.5 : sceneTime;
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

  useEffect(() => {
    function handleEffectPointerDrag(event: Event) {
      const detail = (event as CustomEvent<EffectPointerDragDetail>).detail;
      if (!detail || !isCompositionMode) return;
      if (detail.phase === "cancel") {
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        return;
      }

      setGlobalTimelineDragActive(detail.phase !== "drop" && isEffectPointerOverTimeline(detail.clientX, detail.clientY));
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
        if (detail.phase === "drop") {
          const previewStart = effectDragPreviewRef.current?.category === "adjustment" && effectDragPreviewRef.current.effectId === adjustmentEffect.id && effectDragPreviewRef.current.layerKey === adjustmentRow.key ? effectDragPreviewRef.current.start : target.sceneTime;
          setGlobalTimelineDragActive(false);
          updateEffectDragPreview(null);
          onAddAdjustmentEffect(adjustmentEffect.id, previewStart, adjustmentRow.key);
          return;
        }
        previewAdjustmentEffectDrop(adjustmentEffect.id, adjustmentRow.key, detail.clientX, target.sceneTime, detail.shiftKey);
        return;
      }

      const layer = motionEffect ? motionLayers.find((item) => item.id === target.rowKey) : null;
      if (!motionEffect || !layer) {
        updateEffectDragPreview(null);
        return;
      }

      if (detail.phase === "drop") {
        const preview = effectDragPreviewRef.current;
        const targetSceneTime = preview?.effectId === motionEffect.id && preview.layerKey === layer.id ? preview.start + 0.5 : target.sceneTime;
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        onAddMotionEffect(motionEffect.id, layer.id, targetSceneTime);
        return;
      }

      previewMotionEffectDrop(motionEffect.id, layer.id, detail.clientX, target.sceneTime, detail.shiftKey);
    }

    window.addEventListener("clipper:effect-pointer-drag", handleEffectPointerDrag);
    return () => window.removeEventListener("clipper:effect-pointer-drag", handleEffectPointerDrag);
  });

  function startLayerRowResize(event: PointerEvent<HTMLElement>, rowKey: string, edge: "top" | "bottom" = "bottom") {
    event.preventDefault();
    setGlobalTimelineDragActive(true);
    const startY = event.clientY;
    const initialHeights = { ...(timelineLayers.rowHeights ?? {}) };
    const initialHeight = getTimelineLayerRowHeight(initialHeights, rowKey);
    let nextHeights = initialHeights;

    function move(pointerEvent: globalThis.PointerEvent) {
      const deltaY = pointerEvent.clientY - startY;
      const height = clamp(Math.round(initialHeight + (edge === "top" ? -deltaY : deltaY)), 42, 140);
      nextHeights = { ...initialHeights, [rowKey]: height };
      setResizePreviewRowHeights(nextHeights);
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGlobalTimelineDragActive(false);
      setResizePreviewRowHeights(null);
      onTimelineLayersChange((state) => ({ ...state, rowHeights: nextHeights }), { history: true });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  useLayoutEffect(() => {
    if (effectDragPreview) applyEffectDragPreviewElement(effectDragPreview);
  }, [effectDragPreview, contentWidth, layerRows, layerRowStarts, layerRowHeights, sceneDuration]);

  const playheadColor = "#ff3b30";

  return (
    <footer ref={timelinePanelRef} className={`grid h-full min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-1.5 overflow-hidden border-t border-[#1d2028] bg-[#141821] px-[22px] pb-[18px] pt-2.5 ${timelineDragActive ? "clipper-timeline-dragging-no-hover" : ""}`}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]">
        <div className="flex rounded-full border border-[#2d313b] bg-[#111319] p-1 normal-case tracking-normal" aria-label="Timeline mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "edit" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("edit")}>Edit</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "composition" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("composition")}>Direct</button>
        </div>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <input aria-label="Timeline zoom" className="h-2 w-[168px] accent-[#737884] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#474d5b] [&::-webkit-slider-thumb]:bg-[#9b9da7] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#474d5b] [&::-moz-range-thumb]:bg-[#9b9da7]" type="range" min={0.01} max={4} step={0.01} value={timelineZoom} onChange={(event) => updateTimelineZoom(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline out" onClick={() => updateTimelineZoom(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline in" onClick={() => updateTimelineZoom(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div ref={playbackPlayheadRef} className="relative grid h-full min-h-0 max-h-full grid-rows-[38px_minmax(0,1fr)] overflow-hidden" style={{ "--clipper-playhead-left": `${sceneDuration > 0 ? (currentSceneTime / sceneDuration) * 100 : 0}%`, "--clipper-timeline-scroll-x": `${-(timelineViewportRef.current?.scrollLeft ?? timelineViewportState.displacement)}px` } as CSSProperties}>
        <div className="pointer-events-none absolute right-0 top-0 z-30 overflow-hidden pl-0 pr-3" style={{ left: layerRailWidth, height: 38 + laneContentHeight }}>
          <div className="relative" style={{ width: contentWidth, height: 38 + laneContentHeight, transform: "translate3d(var(--clipper-timeline-scroll-x, 0px), 0, 0)", willChange: "transform" }}>
            <div className="absolute top-[12px] h-3 w-2.5 rounded-[2px]" style={{ left: `var(--clipper-playhead-left)`, backgroundColor: playheadColor, clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)", transform: "translateX(-50%)" }} />
            <div className="absolute top-[38px] w-px" style={{ left: `var(--clipper-playhead-left)`, height: laneContentHeight, backgroundColor: playheadColor }} />
          </div>
        </div>
        <div className="grid min-h-0" style={{ gridTemplateColumns: `${layerRailWidth}px minmax(0, 1fr)` }}>
          <div className="flex min-w-0 items-center pr-4">
            <span className="min-w-0 truncate text-[13px] font-extrabold text-[#dfe2ea]" title={timelineName}>{timelineName}</span>
          </div>
          <div ref={timelineRulerViewportRef} className="relative overflow-hidden pl-0 pr-3">
            <TimeRuler rulerRef={timelineRef} ticks={ticks} sceneDuration={sceneDuration} contentWidth={contentWidth} onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub} />
          </div>
        </div>
        <div className="grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: `${layerRailWidth}px minmax(0, 1fr)` }}>
          <div className="min-h-0 overflow-hidden">
          <div ref={timelineLayerRailRef} className="relative grid pr-0 will-change-transform" style={{ ...laneRowsStyle, height: laneContentHeight }}>
            <span className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-[#39404d]" />
            {layerRows.map((row, index) => <span className="pointer-events-none absolute right-0 z-40 w-0.5" key={`layer-accent-${row.key}`} style={{ top: layerRowStarts[index], height: layerRowHeights[index], backgroundColor: row.accent }} />)}
            {layerRows.length > 0 ? <LayerResizeSeparator key={`label-separator-${layerRows[0].key}-top`} top={0} onPointerDown={(event) => startLayerRowResize(event, layerRows[0].key, "top")} /> : null}
            {layerRows.slice(1).map((row, index) => <LayerResizeSeparator key={`label-separator-${row.key}`} top={layerRowStarts[index + 1]} onPointerDown={(event) => startLayerRowResize(event, row.key, "top")} />)}
            {isCompositionMode ? adjustmentRows.map((row, index) => <LayerLabel key={row.key} editing={editingLayerId === row.key} hidden={row.hidden} menuOpen={motionLayerMenuId === row.key} name={row.name} draft={layerNameDraft} canMoveDown={index < adjustmentRows.length - 1} canMoveUp={index > 0} addBeforeLabel="Add adjust above" addAfterLabel="Add adjust below" removeLabel="Remove adjust layer" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(row.key, row.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowAdjustmentEffectDrop(event, row.key, currentSceneTime)} onEffectDrop={(event) => dropAdjustmentEffect(event, row.key, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === row.key ? null : row.key)} onAddBefore={() => addAdjustmentLayerAround(row.key, "before")} onAddAfter={() => addAdjustmentLayerAround(row.key, "after")} onMoveUp={() => moveAdjustmentRow(row.key, "up")} onMoveDown={() => moveAdjustmentRow(row.key, "down")} onRemove={() => removeAdjustmentLayer(row.key)} onToggleHidden={() => toggleLayerHidden(row.key)} />) : null}
            {isCompositionMode ? motionLayers.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={Boolean(layer.hidden)} menuOpen={motionLayerMenuId === layer.id} name={layer.name} draft={layerNameDraft} canMoveDown={index < motionLayers.length - 1} canMoveUp={index > 0} addBeforeLabel="Add motion above" addAfterLabel="Add motion below" removeLabel="Remove motion layer" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id, currentSceneTime)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === layer.id ? null : layer.id)} onAddBefore={() => addMotionLayerAround(layer.id, "before")} onAddAfter={() => addMotionLayerAround(layer.id, "after")} onMoveUp={() => moveMotionLayer(layer.id, "up")} onMoveDown={() => moveMotionLayer(layer.id, "down")} onRemove={() => removeMotionLayer(layer.id)} onToggleHidden={() => toggleLayerHidden(layer.id)} />) : null}
            <LayerLabel editing={editingLayerId === "comp"} hidden={Boolean(timelineLayers.compHidden)} name={timelineLayers.compName ?? "Comp"} draft={layerNameDraft} onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit("comp", timelineLayers.compName ?? "Comp")} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onToggleHidden={() => toggleLayerHidden("comp")} />
          </div>
          </div>
            <div ref={timelineViewportRef} className="timeline-scrollbar min-h-0 overflow-x-scroll overflow-y-auto pl-0 pr-3 [scrollbar-gutter:stable]" onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) updateEffectDragPreview(null); }} onScroll={saveTimelineDisplacement}>
              <div className="relative grid" style={{ ...laneRowsStyle, width: contentWidth, height: laneContentHeight }}>
            {isDraggingMotionMarker || isDraggingAdjustmentLayer || effectDragPreview ? <TimelineBoundaryGuides timeline={timeline} sceneDuration={sceneDuration} /> : null}
            {timelineSelectionDrag ? <TimelineSelectionBox boxRef={timelineSelectionBoxRef} drag={timelineSelectionDrag} /> : null}
            {isCompositionMode ? adjustmentRows.map((row) => <TimelineLayerLane key={row.key} hidden={row.hidden} overflowVisible={isDraggingAdjustmentLayer} className="block" onDragOver={(event) => allowAdjustmentEffectDrop(event, row.key)} onDrop={(event) => dropAdjustmentEffect(event, row.key)} onPointerDown={startTimelineSelection} onPointerMove={continueTimelineSelection} onPointerUp={endTimelineSelection} onPointerCancel={endTimelineSelection}>
              {adjustmentLayers.filter((layer) => getAdjustmentLayerRowId(layer) === row.key).map((layer) => (
                  <div data-timeline-control data-timeline-marker-kind="adjustment" data-timeline-adjustment-id={layer.id} key={layer.id} role="button" tabIndex={0} className={`absolute inset-y-0 box-border min-w-[34px] cursor-default overflow-hidden shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] bg-[linear-gradient(180deg,#a77cff,#5f35c6)] px-3 py-2 text-left text-xs font-extrabold text-white ${selectedAdjustmentLayerIds.has(layer.id) || layer.id === selectedAdjustmentLayerId ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : "opacity-85"}`} style={{ left: `${(layer.start / sceneDuration) * 100}%`, width: `calc(${(layer.duration / sceneDuration) * 100}% + var(--clipper-adjustment-resize-width, 0px))` }} onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "move")} onClick={() => onSelectAdjustmentLayer(layer.id)} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "adjustment", layerId: layer.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{layer.name}: {getFrameSkipEvery(layer)}f</span>
                  <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "start")} />
                  <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "end")} />
                </div>
              ))}
            </TimelineLayerLane>) : null}
            {isCompositionMode ? motionLayers.map((layer) => <MotionLane key={layer.id} layerId={layer.id} hidden={Boolean(layer.hidden)} timeline={timeline} sceneDuration={sceneDuration} draggingZoomMarkerId={draggingZoomMarkerId} draggingTranslationMarkerId={draggingTranslationMarkerId} zoomSelectionDrag={null} zoomSelectionBoxRef={zoomSelectionBoxRef} translationSelectionDrag={null} translationSelectionBoxRef={translationSelectionBoxRef} selectedZoomKeys={selectedZoomKeys} selectedZoomMarkerId={selectedZoomMarkerId} selectedZoomMarkerPartId={selectedZoomMarkerPartId} selectedTranslationKeys={selectedTranslationKeys} selectedTranslationMarkerId={selectedTranslationMarkerId} selectedTranslationMarkerPartId={selectedTranslationMarkerPartId} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id)} onStartSelection={startTimelineSelection} onMoveSelection={continueTimelineSelection} onEndSelection={endTimelineSelection} onSelectZoomMarker={onSelectZoomMarker} onSelectTranslationMarker={onSelectTranslationMarker} onOpenNodeContextMenu={onOpenNodeContextMenu} onUpdateZoomFromPointer={updateZoomFromPointer} onUpdateTranslationFromPointer={updateTranslationFromPointer} />) : null}
            {effectDragPreview ? <EffectDragPreviewBlock blockRef={effectDragPreviewElementRef} preview={effectDragPreview} /> : null}
            <TimelineLayerLane hidden={Boolean(timelineLayers.compHidden)} className="flex" onClick={(event) => { if (event.target === event.currentTarget) onClearTimelineSelection(); }} onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-clipper-composition")) event.preventDefault(); }} onDrop={(event) => { const compositionId = event.dataTransfer.getData("application/x-clipper-composition"); if (!compositionId) return; event.preventDefault(); onAddComposition(compositionId); }}>
              {timeline.map((item) => {
                const isEmptyPart = item.objects.length === 0 && item.background.elements.length === 0;
                const isUnlinkedPart = Boolean(item.sourceMissing);
                return (
                  <button data-timeline-control draggable key={item.id} className={`relative flex min-h-0 min-w-[86px] cursor-default items-end justify-between gap-2 self-stretch overflow-hidden shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] px-3 py-2 text-left text-[13px] leading-none before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${isUnlinkedPart ? "bg-black text-[#f1f3f7]" : isEmptyPart ? "bg-[linear-gradient(180deg,#2b2d35,#191b21)] text-[#8c929f] opacity-75" : "bg-[linear-gradient(180deg,#38a86d,#17603c)] text-white"} ${item.id === selectedPartId && !selectedZoomMarkerId && !selectedTranslationMarkerId ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : ""}`} style={{ width: `${(item.duration / sceneDuration) * 100}%` }} onPointerDown={() => onSelectPart(item.id)} onClick={() => onSelectPart(item.id)} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "part", partId: item.id })} onDragStart={(event) => onPartDragStart(event, item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onPartDrop(event, item.id)} onDragEnd={() => setDraggedPartId(null)}>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{isUnlinkedPart ? `Unlinked: ${item.name}` : item.name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{item.duration}s</small>
                  </button>
                );
              })}
            </TimelineLayerLane>
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

  return <div ref={boxRef} className="pointer-events-none absolute left-0 top-0 z-40 border border-[#159dff] bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)] will-change-transform" style={{ display: "none" }} />;
}

function TimelineBoundaryGuides({ timeline, sceneDuration }: { timeline: TimelinePart[]; sceneDuration: number }) {
  return <div className="pointer-events-none absolute inset-0 z-30">
    {timeline.slice(1).map((part) => <div className="absolute top-0 h-full w-px bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.35)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`timeline-boundary-${part.id}`} style={{ left: `${sceneDuration > 0 ? (part.start / sceneDuration) * 100 : 0}%` }} />)}
  </div>;
}

function EffectDragPreviewBlock({ blockRef, preview }: { blockRef: RefObject<HTMLDivElement | null>; preview: EffectDragPreview }) {
  const effect = getEffectPackage(preview.effectId);
  const className = preview.category === "adjustment"
    ? "bg-[linear-gradient(180deg,#a77cff,#5f35c6)] text-white"
    : preview.kind === "zoom"
      ? "bg-[linear-gradient(180deg,#f0c95a,#b88312)] text-[#1a1202]"
      : "bg-[linear-gradient(180deg,#24b7c9,#127c8d)] text-white";
  const label = effect?.label ?? preview.effectId;

  return (
    <div ref={blockRef} className={`pointer-events-none absolute left-0 top-0 z-30 box-border min-w-[18px] overflow-hidden px-3 py-2 text-xs font-bold opacity-55 shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] ${className}`}>
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </div>
  );
}

function LayerLabel({ name, draft, editing, hidden, menuOpen, canMoveDown = true, canMoveUp = true, addAfterLabel = "Add layer below", addBeforeLabel = "Add layer above", removeLabel = "Remove layer", onAddAfter, onAddBefore, onCancel, onCommit, onDraftChange, onEdit, onEffectDragOver, onEffectDrop, onMenuToggle, onMoveDown, onMoveUp, onRemove, onToggleHidden }: { name: string; draft: string; editing: boolean; hidden: boolean; menuOpen?: boolean; canMoveDown?: boolean; canMoveUp?: boolean; addAfterLabel?: string; addBeforeLabel?: string; removeLabel?: string; onAddAfter?: () => void; onAddBefore?: () => void; onCancel: () => void; onCommit: () => void; onDraftChange: (value: string) => void; onEdit: () => void; onEffectDragOver?: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop?: (event: DragEvent<HTMLDivElement>) => void; onMenuToggle?: () => void; onMoveDown?: () => void; onMoveUp?: () => void; onRemove?: () => void; onToggleHidden: () => void }) {
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    function updateMenuPosition() {
      const buttonRect = menuButtonRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!buttonRect || !menuRect) return;

      const gap = 6;
      const margin = 8;
      let x = buttonRect.right - menuRect.width;
      let y = buttonRect.bottom + gap;

      if (x + menuRect.width > window.innerWidth - margin) x = window.innerWidth - menuRect.width - margin;
      if (x < margin) x = margin;
      if (y + menuRect.height > window.innerHeight - margin) y = buttonRect.top - menuRect.height - gap;
      if (y < margin) y = margin;

      setMenuPosition({ x, y });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !onMenuToggle) return;
    const closeMenu = onMenuToggle;

    function closeOnOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuOpen, onMenuToggle]);

  return (
    <div className={`relative grid h-full grid-cols-[1fr_auto] items-center gap-2 pr-0 transition ${hidden ? "opacity-45" : ""}`} onDragOver={onEffectDragOver} onDrop={onEffectDrop}>
      {editing ? <input autoFocus className="min-w-0 rounded-md border border-[var(--clipper-accent)] bg-[#111319] px-2 py-1 text-xs font-bold normal-case tracking-normal text-[#dfe2ea] outline-none" value={draft} onBlur={onCommit} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommit(); if (event.key === "Escape") onCancel(); }} /> : <button className="relative min-w-0 cursor-text overflow-hidden text-ellipsis whitespace-nowrap rounded-md py-1 pl-0 pr-1 text-left text-[12px] font-bold normal-case tracking-normal text-[#9b9da7] transition hover:bg-[#20232c]/70 hover:text-[#dfe2ea] before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-[var(--clipper-accent)] before:opacity-0 before:transition-opacity hover:before:opacity-100 focus-visible:bg-[#20232c]/70 focus-visible:outline-none focus-visible:before:opacity-100" title="Double-click to rename" onDoubleClick={onEdit}>{name}</button>}
      <div className="flex items-center gap-2 justify-self-end pr-2">
        <button data-timeline-control className="grid h-7 w-7 place-items-center rounded-md border border-[#2d313b] bg-[#111319] text-[#dfe2ea] hover:border-[#37d6c2]" title={hidden ? "Show layer" : "Hide layer"} onClick={onToggleHidden}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        {onMenuToggle ? <button ref={menuButtonRef} data-timeline-control className="grid h-7 w-7 place-items-center rounded-md border border-[#2d313b] bg-[#111319] text-[#dfe2ea] hover:border-[#37d6c2]" title="Layer options" onClick={onMenuToggle}><MoreHorizontal size={15} /></button> : null}
      </div>
      {menuOpen && typeof document !== "undefined" ? createPortal(<div ref={menuRef} data-timeline-control className="fixed z-50 grid min-w-[180px] overflow-hidden rounded-xl border border-[#2d313b] bg-[#111319] py-1 text-xs font-bold normal-case tracking-normal text-[#dfe2ea] shadow-[0_18px_48px_rgba(0,0,0,0.48)]" style={{ left: menuPosition?.x ?? 0, top: menuPosition?.y ?? 0, visibility: menuPosition ? "visible" : "hidden" }}>
        {onMoveUp ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#5f6470] disabled:hover:bg-transparent" disabled={!canMoveUp} onClick={onMoveUp}>Move up</button> : null}
        {onMoveDown ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#5f6470] disabled:hover:bg-transparent" disabled={!canMoveDown} onClick={onMoveDown}>Move down</button> : null}
        {onAddBefore ? <button className="px-3 py-2 text-left hover:bg-[#20232c]" onClick={onAddBefore}>{addBeforeLabel}</button> : null}
        {onAddAfter ? <button className="px-3 py-2 text-left hover:bg-[#20232c]" onClick={onAddAfter}>{addAfterLabel}</button> : null}
        {onRemove ? <button className="px-3 py-2 text-left text-[#ffb4b4] hover:bg-[#2a1719]" onClick={onRemove}>{removeLabel}</button> : null}
      </div>, document.body) : null}
    </div>
  );
}

function LayerResizeSeparator({ top, onPointerDown }: { top: number; onPointerDown: (event: PointerEvent<HTMLElement>) => void }) {
  return <div className="absolute left-0 right-0 z-40 h-2 -translate-y-1 cursor-row-resize transition before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-[#2d313b] before:content-[''] hover:bg-[rgb(var(--clipper-accent-rgb)/0.08)] hover:before:bg-[var(--clipper-accent)]" style={{ top }} onPointerDown={onPointerDown} />;
}

function getTimelineLayerRowHeight(rowHeights: Record<string, number>, key: string) {
  return clamp(Math.round(rowHeights[key] ?? 58), 42, 140);
}

function TimelineLayerLane({ hidden, overflowVisible = false, className = "block", children, onClick, onDragOver, onDrop, onPointerCancel, onPointerDown, onPointerMove, onPointerUp }: { hidden: boolean; overflowVisible?: boolean; className?: string; children: ReactNode; onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void; onDragOver?: (event: DragEvent<HTMLDivElement>) => void; onDrop?: (event: DragEvent<HTMLDivElement>) => void; onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void; onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void }) {
  return <div className={`relative h-full min-h-0 ${className} ${overflowVisible ? "overflow-visible" : "overflow-hidden"} border-x border-[#2d313b] bg-[#111319] transition ${hidden ? "opacity-35" : ""}`} onClick={onClick} onDragOver={onDragOver} onDrop={onDrop} onPointerCancel={onPointerCancel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>{children}</div>;
}

function isZoomMarkerOnLayer(marker: ZoomMarker, layerId: string) {
  return marker.layerId === layerId;
}

function isAnyTranslationMarkerOnLayer(marker: TranslationMarker, layerId: string) {
  return marker.layerId === layerId;
}

function MotionLane({ hidden, layerId, timeline, sceneDuration, draggingZoomMarkerId, draggingTranslationMarkerId, zoomSelectionDrag, zoomSelectionBoxRef, translationSelectionDrag, translationSelectionBoxRef, selectedZoomKeys, selectedZoomMarkerId, selectedZoomMarkerPartId, selectedTranslationKeys, selectedTranslationMarkerId, selectedTranslationMarkerPartId, onEffectDragOver, onEffectDrop, onStartSelection, onMoveSelection, onEndSelection, onSelectZoomMarker, onSelectTranslationMarker, onOpenNodeContextMenu, onUpdateZoomFromPointer, onUpdateTranslationFromPointer }: { hidden: boolean; layerId: string; timeline: TimelinePart[]; sceneDuration: number; draggingZoomMarkerId: string | null; draggingTranslationMarkerId: string | null; zoomSelectionDrag: TimelineSelectionDrag | null; zoomSelectionBoxRef: RefObject<HTMLDivElement | null>; translationSelectionDrag: TimelineSelectionDrag | null; translationSelectionBoxRef: RefObject<HTMLDivElement | null>; selectedZoomKeys: Set<string>; selectedZoomMarkerId: string | null; selectedZoomMarkerPartId: string | null; selectedTranslationKeys: Set<string>; selectedTranslationMarkerId: string | null; selectedTranslationMarkerPartId: string | null; onEffectDragOver: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop: (event: DragEvent<HTMLDivElement>) => void; onStartSelection: (event: PointerEvent<HTMLDivElement>) => void; onMoveSelection: (event: PointerEvent<HTMLDivElement>) => void; onEndSelection: (event: PointerEvent<HTMLDivElement>) => void; onSelectZoomMarker: (partId: string, markerId: string) => void; onSelectTranslationMarker: (partId: string, markerId: string) => void; onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void; onUpdateZoomFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") => void; onUpdateTranslationFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") => void }) {
  return <TimelineLayerLane hidden={hidden} overflowVisible={Boolean(draggingZoomMarkerId || draggingTranslationMarkerId)} className="block" onDragOver={onEffectDragOver} onDrop={onEffectDrop} onPointerDown={onStartSelection} onPointerMove={onMoveSelection} onPointerUp={onEndSelection} onPointerCancel={onEndSelection}>
    {zoomSelectionDrag ? <TimelineSelectionBox boxRef={zoomSelectionBoxRef} drag={zoomSelectionDrag} /> : null}
    {translationSelectionDrag ? <TimelineSelectionBox boxRef={translationSelectionBoxRef} drag={translationSelectionDrag} /> : null}
    {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.filter((marker) => isAnyTranslationMarkerOnLayer(marker, layerId)).map((marker) => {
      const markerKind = getTranslationMarkerLayerKind(marker);
      return (
        <div data-timeline-control data-timeline-marker-kind="translation" data-timeline-marker-part-id={timelinePart.id} data-timeline-marker-id={marker.id} className={`absolute inset-y-0 box-border min-w-[18px] cursor-default overflow-hidden shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] bg-[linear-gradient(180deg,#24b7c9,#127c8d)] px-3 py-2 text-xs font-bold text-white ${selectedTranslationKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : marker.id === selectedTranslationMarkerId && timelinePart.id === selectedTranslationMarkerPartId ? "opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : "opacity-80"}`} key={`translation-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectTranslationMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "move")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "translation", partId: timelinePart.id, markerId: marker.id })}>
          <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{markerKind === "rotate" ? `Rotate ${Math.round(marker.rotation ?? 0)}deg` : markerKind === "perspective" ? `Perspective ${Math.round(marker.perspective?.rotateX ?? 0)}deg` : `Pan ${marker.position.x}, ${marker.position.y}`}</span>
          {markerKind === "pan" && marker.followId ? <Link2 className="pointer-events-none absolute bottom-1 left-1 text-white/85" size={9} strokeWidth={2.5} /> : null}
          <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "start")}>{marker.snapIn ? <span className="pointer-events-none absolute inset-y-0 left-0 border-l-4 border-[#ec4899]" /> : null}</div>
          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "end")}>{marker.snapOut ? <span className="pointer-events-none absolute inset-y-0 right-0 border-r-4 border-[#ec4899]" /> : null}</div>
        </div>
      );
    }))}
    {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.filter((marker) => isZoomMarkerOnLayer(marker, layerId)).map((marker) => (
      <div data-timeline-control data-timeline-marker-kind="zoom" data-timeline-marker-part-id={timelinePart.id} data-timeline-marker-id={marker.id} className={`absolute inset-y-0 box-border min-w-[18px] cursor-default overflow-hidden shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] bg-[linear-gradient(180deg,#f0c95a,#b88312)] px-3 py-2 text-xs font-bold text-[#1a1202] ${selectedZoomKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : marker.id === selectedZoomMarkerId && timelinePart.id === selectedZoomMarkerPartId ? "opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : "opacity-85"}`} key={`zoom-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectZoomMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "move")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "zoom", partId: timelinePart.id, markerId: marker.id })}>
        <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Zoom {marker.scale}x</span>
        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "start")}>{marker.snapIn ? <span className="pointer-events-none absolute inset-y-0 left-0 border-l-4 border-[#ec4899]" /> : null}</div>
        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "end")}>{marker.snapOut ? <span className="pointer-events-none absolute inset-y-0 right-0 border-r-4 border-[#ec4899]" /> : null}</div>
      </div>
    )))}
  </TimelineLayerLane>;
}

export function TimeRuler({ rulerRef, ticks, sceneDuration, contentWidth, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { rulerRef: RefObject<HTMLDivElement | null>; ticks: number[]; sceneDuration: number; contentWidth: number; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp: (event: PointerEvent<HTMLDivElement>) => void; onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void }) {
  const tickMarks = useMemo(() => buildTimelineRulerMarks(sceneDuration, contentWidth, ticks), [contentWidth, sceneDuration, ticks]);

  return (
    <div ref={rulerRef} className="relative h-[38px] pt-1.5 text-xs text-[#858a96] tabular-nums" style={{ width: contentWidth }}>
      <div className="absolute inset-x-0 top-0 z-20 h-[38px]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#454b5a]" />
      {tickMarks.map((mark) => {
        const left = sceneDuration > 0 ? `${(mark.time / sceneDuration) * 100}%` : "0%";
        const tickAlign = mark.time === 0 ? "translate-x-0" : mark.time === sceneDuration ? "-translate-x-full" : "-translate-x-1/2";
        const className = mark.kind === "major" ? "h-[16px] bg-[#596071]" : mark.kind === "medium" ? "h-[11px] bg-[#444a58]" : "h-[6px] bg-[#363b47]";
        return <span className={`pointer-events-none absolute bottom-0 w-px ${tickAlign} ${className}`} key={`${mark.time}-${mark.kind}`} style={{ left }} />;
      })}
      {ticks.map((tick) => {
        const isStart = tick === 0;
        const isEnd = tick === sceneDuration;
        const labelAlign = isStart ? "translate-x-0 text-left" : isEnd ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
        const left = sceneDuration > 0 ? `${(tick / sceneDuration) * 100}%` : "0%";
        return <span className={`pointer-events-none absolute top-[5px] whitespace-nowrap font-semibold tracking-[0.01em] ${labelAlign}`} key={tick} style={{ left }}>{formatTime(tick)}</span>;
      })}
    </div>
  );
}

function buildTimelineRulerMarks(sceneDuration: number, contentWidth: number, labeledTicks: number[]) {
  if (sceneDuration <= 0) return [{ time: 0, kind: "major" as const }];

  const pixelsPerSecond = contentWidth / sceneDuration;
  const minorStep = pixelsPerSecond >= 28 ? 0.5 : pixelsPerSecond >= 14 ? 1 : 5;
  const labeledTickSet = new Set(labeledTicks.map((tick) => roundTenth(tick)));
  const marks: Array<{ time: number; kind: "major" | "medium" | "minor" }> = [];

  for (let time = 0; time <= sceneDuration; time = roundTenth(time + minorStep)) {
    const roundedTime = roundTenth(time);
    const isMajor = labeledTickSet.has(roundedTime) || roundedTime === 0 || roundedTime === roundTenth(sceneDuration);
    const isMedium = Number.isInteger(roundedTime) && roundedTime % 1 === 0;
    marks.push({ time: roundedTime, kind: isMajor ? "major" : isMedium ? "medium" : "minor" });
  }

  const roundedDuration = roundTenth(sceneDuration);
  if (!marks.some((mark) => mark.time === roundedDuration)) marks.push({ time: sceneDuration, kind: "major" });
  return marks;
}

export function updateTimelineSelectionBoxElement(element: HTMLDivElement, drag: TimelineSelectionDrag, rect: DOMRect) {
  const startX = clamp(drag.startX - rect.left, 0, rect.width);
  const currentX = clamp(drag.currentX - rect.left, 0, rect.width);
  const startY = drag.startY === undefined ? 0 : clamp(drag.startY - rect.top, 0, rect.height);
  const currentY = drag.currentY === undefined ? rect.height : clamp(drag.currentY - rect.top, 0, rect.height);
  element.style.display = Math.max(Math.abs(currentX - startX), Math.abs(currentY - startY)) >= 4 ? "block" : "none";
  element.style.transform = `translate3d(${Math.min(startX, currentX)}px, ${Math.min(startY, currentY)}px, 0)`;
  element.style.width = `${Math.abs(currentX - startX)}px`;
  element.style.height = `${Math.abs(currentY - startY)}px`;
}
