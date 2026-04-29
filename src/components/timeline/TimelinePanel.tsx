import { Eye, EyeOff, Link2, Lock, Minus, MoreHorizontal, Plus, Unlock } from "lucide-react";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type RefObject, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import { TIMELINE_MOTION_PART_ID, type AdjustmentLayerSelection, type CompositionSelection, type TimelineBlankContextTarget, type TimelineNodeContextTarget, type TimelineSelectionDrag, type TranslationMarkerSelection, type ZoomMarkerSelection } from "../../app/types";
import { clamp, roundTenth, roundTwo } from "../../core/math";
import { buildLinearTimeline, formatTime, getAdjustmentLayerRowId, getAdjustmentPlacement, getMendedMarkerDragItems, getScrubSnapBoundaries, getTimelineDragConstraintItems, getTimelineMarkerDragSnapBoundaries, getTimelineMarkerMoves, getTimelinePartAtTime, getTimelineTicks, getTopTimelineItemAtTime, getTranslationMarkerLayerId, getTranslationMarkerLayerKind, getZoomMarkerLayerId, isExplicitTimelineMarkerMend, resizeTimelineMarkersWithPush, snapScrubTimeToBoundary, snapTimelineBlockStartToBoundary, timelineDisplayDuration as getTimelineDisplayDuration, uniqueTimelineDragItems, type TimelineMarkerDragItem, type TimelineMarkerMove, type TimelineMarkerResize } from "../../core/timeline";
import { defaultTimelineLayerState } from "../../core/project";
import { getAdjustmentEffectPackage, getEffectDragType, getEffectPackage, getMotionEffectPackage, installedEffectPackages } from "../../core/effects/registry";
import { applyTimelineBlockPreview, clearTimelineBlockPreview, getTimelineBlockLayerPreview, getTimelineLayerRowAtClientY, moveTimelineStateLayer, renameTimelineStateLayer, toggleTimelineStateLayerHidden, toggleTimelineStateLayerLocked, type TimelineLayerCategory, type TimelineLayerLayout } from "../../core/timelineLayers";
import type { AdjustmentEffectId, AdjustmentLayer, EffectTimelineGradient, MotionEffectId, MotionEffectKind, Part, TimelineLayerState, TimelineMode, TimelineMotionLayerKind, TimelinePart, TimelineViewportState, TranslationMarker, ZoomMarker } from "../../core/types";
import { compositionDragPreviewEvent, compositionPointerDragEvent, effectDragPreviewEvent, effectPointerDragEvent, setClipperPointerDragPreview, type CompositionPointerDragDetail, type EffectPointerDragDetail } from "../../lib/pointerDrag";

export type TimelinePanelProps = {
  timelineName: string;
  timeline: TimelinePart[];
  zoomMarkers: ZoomMarker[];
  translationMarkers: TranslationMarker[];
  timelineLayers: TimelineLayerState;
  adjustmentLayers: AdjustmentLayer[];
  timelineViewportState: TimelineViewportState;
  mode: TimelineMode;
  selectedPartId: string;
  selectedParts: CompositionSelection[];
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
  defaultNewMarkerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  scrubSnapEnabled: boolean;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
  onTimelineLayersChange: (updater: (state: TimelineLayerState) => TimelineLayerState, options?: { history?: boolean }) => void;
  onAddCompositionLayer: (targetLayerId?: string, placement?: "before" | "after") => void;
  onRemoveCompositionLayer: (layerId: string) => void;
  onAddAdjustmentLayer: (targetLayerId?: string, placement?: "before" | "after") => void;
  onRemoveAdjustmentLayer: (layerId: string) => void;
  onAddMotionLayer: (kind?: TimelineMotionLayerKind, targetLayerId?: string, placement?: "before" | "after") => void;
  onRemoveMotionLayer: (layerId: string) => void;
  onSelectPart: (id: string) => void;
  onOpenComposePart: (id: string) => void;
  onSelectZoomMarker: (partId: string, markerId: string) => void;
  onSelectZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  onSelectTranslationMarker: (partId: string, markerId: string) => void;
  onSelectTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  onSelectAdjustmentLayer: (layerId: string) => void;
  onSelectAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  onSelectTimelineNodes: (selection: { adjustmentLayers: AdjustmentLayerSelection[]; compositions: CompositionSelection[]; zoomMarkers: ZoomMarkerSelection[]; translationMarkers: TranslationMarkerSelection[] }) => void;
  onClearTimelineSelection: () => void;
  onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void;
  onOpenBlankContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineBlankContextTarget) => void;
  onMoveAdjustmentLayer: (layerId: string, start: number, targetLayerId?: string) => void;
  onUpdateAdjustmentLayer: (layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onMoveComposition: (compositionId: string, start: number, targetLayerId?: string) => void;
  onMoveCompositions: (moves: Array<{ compositionId: string; start: number; targetLayerId?: string }>) => void;
  onUpdateComposition: (compositionId: string, updater: (composition: Part) => Part) => void;
  onMoveZoomMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) => void;
  onMoveZoomMarkers: (moves: TimelineMarkerMove[]) => void;
  onMoveTranslationMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number, targetLayerId?: string) => void;
  onMoveTranslationMarkers: (moves: TimelineMarkerMove[]) => void;
  onUpdateZoomMarkers: (partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) => void;
  onUpdateTranslationMarkers: (partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) => void;
  onResizeZoomMarkers: (resizes: TimelineMarkerResize[]) => void;
  onResizeTranslationMarkers: (resizes: TimelineMarkerResize[]) => void;
  onAddComposition: (compositionId: string, targetLayerId?: string, start?: number) => void;
  onAddAdjustmentEffect: (effectId: AdjustmentEffectId, sceneTime: number, layerId?: string) => void;
  onAddMotionEffect: (effectId: MotionEffectId, layerId: string, sceneTime: number) => void;
};

type EffectDragPreview = {
  category: "adjustment" | "motion" | "composition";
  effectId?: string;
  isEmpty?: boolean;
  kind?: MotionEffectKind;
  layerKey: string;
  label?: string;
  sourceMissing?: boolean;
  start: number;
  duration: number;
  initialClientX: number;
  initialStart: number;
};

type AbsoluteTimelineMarker<T extends { id: string; start: number; duration: number }> = T & {
  sourcePartId: string;
  sourcePartStart: number;
};

export function TimelinePanel({ timelineName, timeline, zoomMarkers, translationMarkers, timelineLayers, adjustmentLayers, timelineViewportState, mode, selectedPartId, selectedParts, selectedZoomMarkerPartId, selectedZoomMarkerId, selectedZoomMarkers, selectedTranslationMarkerPartId, selectedTranslationMarkerId, selectedTranslationMarkers, selectedAdjustmentLayerId, selectedAdjustmentLayers, sceneDuration, currentSceneTime, isPlaying, playbackPlayheadRef, scrubbingRef, fastSelectEnabled, scrubCommitThrottleMs, defaultNewMarkerDurationSeconds, timelineEndPaddingFraction, scrubSnapEnabled, onScrub, onScrubStart, onScrubEnd, onModeChange, onTimelineViewportStateChange, onTimelineLayersChange, onAddCompositionLayer, onRemoveCompositionLayer, onAddAdjustmentLayer, onRemoveAdjustmentLayer, onAddMotionLayer, onRemoveMotionLayer, onSelectPart, onOpenComposePart, onSelectZoomMarker, onSelectZoomMarkers, onSelectTranslationMarker, onSelectTranslationMarkers, onSelectAdjustmentLayer, onSelectAdjustmentLayers, onSelectTimelineNodes, onClearTimelineSelection, onOpenNodeContextMenu, onOpenBlankContextMenu, onMoveAdjustmentLayer, onUpdateAdjustmentLayer, onReorderPart, onMoveComposition, onMoveCompositions, onUpdateComposition, onMoveZoomMarker, onMoveZoomMarkers, onMoveTranslationMarker, onMoveTranslationMarkers, onUpdateZoomMarkers, onUpdateTranslationMarkers, onResizeZoomMarkers, onResizeTranslationMarkers, onAddComposition, onAddAdjustmentEffect, onAddMotionEffect }: TimelinePanelProps) {
  const timelineDisplayDuration = getTimelineDisplayDuration(sceneDuration, timelineEndPaddingFraction);
  const motionTimeline = useMemo<TimelinePart[]>(() => [{ id: TIMELINE_MOTION_PART_ID, name: "Timeline motion", filePath: "", start: 0, end: timelineDisplayDuration, duration: timelineDisplayDuration, frame: { width: 1920, height: 1080, style: {} }, background: { id: "timeline-motion-background", name: "Background", style: {}, elements: [] }, objects: [], snapshot: [], motionBlocks: [], zoomMarkers, translationMarkers }], [timelineDisplayDuration, translationMarkers, zoomMarkers]);
  const ticks = useMemo(() => getTimelineTicks(timelineDisplayDuration), [timelineDisplayDuration]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineRulerViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineLayerRailRef = useRef<HTMLDivElement | null>(null);
  const timelineSnapGuideRef = useRef<HTMLDivElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingTimelineBlockCategory, setDraggingTimelineBlockCategory] = useState<TimelineLayerCategory | null>(null);
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
  const timelineDragClientXRef = useRef<number | null>(null);
  const timelineDragAutoScrollFrameRef = useRef(0);
  const timelineDragAutoScrollCallbackRef = useRef<(() => void) | null>(null);
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
  const selectedPartIds = useMemo(() => new Set(selectedParts.map((selection) => selection.partId)), [selectedParts]);
  const selectedZoomKeys = useMemo(() => new Set(selectedZoomMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedZoomMarkers]);
  const selectedTranslationKeys = useMemo(() => new Set(selectedTranslationMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedTranslationMarkers]);
  const scrubSnapBoundaries = useMemo(() => getScrubSnapBoundaries(timeline, adjustmentLayers), [adjustmentLayers, timeline]);
  const contentWidth = Math.max(timelineDisplayDuration * defaultTimelinePixelsPerSecond * timelineZoom, 160);
  const isCompositionMode = mode === "composition";
  const baseMotionLayers = timelineLayers.motionLayers?.length ? timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const compositionRows = timelineLayers.compositionLayers?.length ? timelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers!;
  const motionLayers = baseMotionLayers;
  const adjustmentRows = (timelineLayers.adjustmentLayers?.length ? timelineLayers.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!).map((layer) => {
    const effect = getAdjustmentEffectPackage(layer.id);
    return { key: layer.id, accent: effect?.accent ?? "#8f65f2", name: layer.name, hidden: Boolean(layer.hidden), locked: Boolean(layer.locked), effect };
  });
  const [resizePreviewRowHeights, setResizePreviewRowHeights] = useState<Record<string, number> | null>(null);
  const rowHeights = resizePreviewRowHeights ?? timelineLayers.rowHeights ?? {};
  const directLayerRows = [...adjustmentRows.map((row) => ({ key: row.key, category: "adjust" as const, accent: row.accent })), ...motionLayers.map((layer) => ({ key: layer.id, category: "motion" as const, accent: "#24b7c9" })), ...compositionRows.map((layer) => ({ key: layer.id, category: "comp" as const, accent: "#38a86d" }))];
  const layerRows = isCompositionMode
    ? directLayerRows
    : compositionRows.map((layer) => ({ key: layer.id, category: "comp" as const, accent: "#38a86d" }));
  const directBaseLayerRowHeights = directLayerRows.map((row) => getTimelineLayerRowHeight(rowHeights, row.key));
  const directLayerRowHeightByKey = new Map(directLayerRows.map((row, index) => [row.key, directBaseLayerRowHeights[index]]));
  const baseLayerRowHeights = isCompositionMode
    ? directBaseLayerRowHeights
    : layerRows.map((row) => directLayerRowHeightByKey.get(row.key) ?? getTimelineLayerRowHeight(rowHeights, row.key));
  const layerRowHeights = baseLayerRowHeights;
  const timelineMarkersEditable = isCompositionMode;
  const layerRowStarts = layerRowHeights.reduce<number[]>((starts, height, index) => [...starts, index === 0 ? 0 : starts[index - 1] + layerRowHeights[index - 1]], []);
  const layerLayout: TimelineLayerLayout = { rows: layerRows, starts: layerRowStarts, heights: layerRowHeights };
  const laneRowsStyle = { gridTemplateRows: layerRowHeights.map((height) => `${height}px`).join(" ") };
  const laneContentHeight = layerRowHeights.reduce((total, height) => total + height, 0);
  const layerRailWidth = 260;
  const isDraggingAdjustmentLayer = draggingTimelineBlockCategory === "adjust";
  const isDraggingMotionMarker = draggingTimelineBlockCategory === "motion";
  const isDraggingCompositionBlock = draggingTimelineBlockCategory === "comp";

  useEffect(() => {
    setTimelineZoom(timelineViewportState.zoom);
  }, [timelineViewportState.zoom]);

  useEffect(() => () => {
    if (adjustmentSelectionFrameRef.current) window.cancelAnimationFrame(adjustmentSelectionFrameRef.current);
    if (zoomSelectionFrameRef.current) window.cancelAnimationFrame(zoomSelectionFrameRef.current);
    if (translationSelectionFrameRef.current) window.cancelAnimationFrame(translationSelectionFrameRef.current);
    if (scrubPreviewFrameRef.current) window.cancelAnimationFrame(scrubPreviewFrameRef.current);
    if (timelineDragAutoScrollFrameRef.current) window.cancelAnimationFrame(timelineDragAutoScrollFrameRef.current);
    if (effectDragPreviewFrameRef.current) window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
    if (scrubCommitTimeoutRef.current) window.clearTimeout(scrubCommitTimeoutRef.current);
    clearTimelineSnapGuide();
    setGlobalTimelineDragActive(false);
  }, []);

  function setGlobalTimelineDragActive(active: boolean) {
    setTimelineDragActive(active);
  }

  function withPlayheadSnapBoundary(boundaries: number[]) {
    return Array.from(new Set([...boundaries, currentSceneTimeRef.current])).sort((left, right) => left - right);
  }

  function getTimelineSnapGuideTime(time: number, boundaries: number[], snapThresholdSeconds: number) {
    let guideTime: number | null = null;
    let nearestDistance = snapThresholdSeconds;
    for (const boundary of boundaries) {
      const distance = Math.abs(time - boundary);
      if (distance <= nearestDistance) {
        guideTime = boundary;
        nearestDistance = distance;
      }
    }
    return guideTime;
  }

  function getTimelineBlockSnap(start: number, duration: number, boundaries: number[], snapThresholdSeconds: number) {
    let nextStart = start;
    let guideTime: number | null = null;
    let nearestDistance = snapThresholdSeconds;

    for (const boundary of boundaries) {
      const startDistance = Math.abs(start - boundary);
      if (startDistance <= nearestDistance) {
        nextStart = boundary;
        guideTime = boundary;
        nearestDistance = startDistance;
      }

      const endDistance = Math.abs(start + duration - boundary);
      if (endDistance <= nearestDistance) {
        nextStart = boundary - duration;
        guideTime = boundary;
        nearestDistance = endDistance;
      }
    }

    return { start: nextStart, guideTime };
  }

  function updateTimelineSnapGuide(time: number | null) {
    const element = timelineSnapGuideRef.current;
    if (!element || time === null || timelineDisplayDuration <= 0 || Math.abs(time - currentSceneTimeRef.current) < 0.0001) {
      clearTimelineSnapGuide();
      return;
    }

    element.style.display = "block";
    element.style.transform = `translate3d(${(time / timelineDisplayDuration) * contentWidth}px, 0, 0)`;
  }

  function clearTimelineSnapGuide() {
    if (timelineSnapGuideRef.current) timelineSnapGuideRef.current.style.display = "none";
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

  function scrollTimelineFromLayerRail(event: WheelEvent<HTMLDivElement>) {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    if (event.deltaY === 0 && event.deltaX === 0) return;
    event.preventDefault();
    viewport.scrollTop += event.deltaY;
    viewport.scrollLeft += event.deltaX;
    saveTimelineDisplacement();
  }

  function timeFromClientX(clientX: number, snap: boolean) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || sceneDuration <= 0) return 0;
    const rawTime = clamp(((clientX - rect.left) / rect.width) * timelineDisplayDuration, 0, sceneDuration);
    if (!snap) return rawTime;

    const pixelsPerSecond = rect.width / timelineDisplayDuration;
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
    playhead.style.setProperty("--clipper-playhead-left", `${timelineDisplayDuration > 0 ? (time / timelineDisplayDuration) * 100 : 0}%`);
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
    onScrub(time);
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
      if (item.motionKind === "translation") {
        const marker = item.marker as TranslationMarker;
        if (isTranslationLocked(marker)) return;
        onSelectTranslationMarker(item.part.id, item.marker.id);
      } else {
        const marker = item.marker as ZoomMarker;
        if (isZoomLocked(marker)) return;
        onSelectZoomMarker(item.part.id, item.marker.id);
      }
      return;
    }
    if (isCompositionLocked(item.part)) return;
    onSelectPart(item.part.id);
  }

  function stopScrubAutoScroll() {
    scrubClientXRef.current = null;
    if (scrubAutoScrollFrameRef.current) window.cancelAnimationFrame(scrubAutoScrollFrameRef.current);
    scrubAutoScrollFrameRef.current = 0;
  }

  function getTimelineEdgeScrollDelta(clientX: number, viewport: HTMLElement) {
    const rect = viewport.getBoundingClientRect();
    const edgeSize = 72;
    const leftDistance = rect.left + edgeSize - clientX;
    const rightDistance = clientX - (rect.right - edgeSize);
    if (leftDistance > 0) return -clamp(leftDistance / 3, 5, 34);
    if (rightDistance > 0) return clamp(rightDistance / 3, 5, 34);
    return 0;
  }

  function stopTimelineDragAutoScroll() {
    timelineDragClientXRef.current = null;
    timelineDragAutoScrollCallbackRef.current = null;
    if (timelineDragAutoScrollFrameRef.current) window.cancelAnimationFrame(timelineDragAutoScrollFrameRef.current);
    timelineDragAutoScrollFrameRef.current = 0;
  }

  function scheduleTimelineDragAutoScroll() {
    if (timelineDragAutoScrollFrameRef.current) return;

    const tick = () => {
      timelineDragAutoScrollFrameRef.current = 0;
      const clientX = timelineDragClientXRef.current;
      const viewport = timelineViewportRef.current;
      if (clientX === null || !viewport) return;

      const scrollDelta = getTimelineEdgeScrollDelta(clientX, viewport);
      if (scrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        viewport.scrollLeft += scrollDelta;
        if (viewport.scrollLeft !== previousScrollLeft) {
          syncTimelineRulerScroll(viewport.scrollLeft);
          timelineDragAutoScrollCallbackRef.current?.();
        }
      }

      timelineDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    timelineDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function updateTimelineDragAutoScroll(clientX: number, onScroll: () => void) {
    timelineDragClientXRef.current = clientX;
    timelineDragAutoScrollCallbackRef.current = onScroll;
    scheduleTimelineDragAutoScroll();
  }

  function scheduleScrubAutoScroll() {
    if (scrubAutoScrollFrameRef.current) return;

    const tick = () => {
      scrubAutoScrollFrameRef.current = 0;
      const clientX = scrubClientXRef.current;
      const viewport = timelineViewportRef.current;
      if (clientX === null || !viewport) return;

      const scrollDelta = getTimelineEdgeScrollDelta(clientX, viewport);

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
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    return motionTimeline.flatMap((timelinePart) => timelinePart.zoomMarkers
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
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * timelineDisplayDuration, 0, timelineDisplayDuration);
    return motionTimeline.flatMap((timelinePart) => timelinePart.translationMarkers
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
    const zoomSelection: ZoomMarkerSelection[] = [];
    const translationSelection: TranslationMarkerSelection[] = [];

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

      zoomSelection.push(...motionTimeline.flatMap((timelinePart) => timelinePart.zoomMarkers
        .filter((marker) => isZoomMarkerOnLayer(marker, layer.id))
        .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
        .map((marker) => ({ partId: timelinePart.id, markerId: marker.id }))));
      translationSelection.push(...motionTimeline.flatMap((timelinePart) => timelinePart.translationMarkers
        .filter((marker) => isAnyTranslationMarkerOnLayer(marker, layer.id))
        .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
        .map((marker) => ({ partId: timelinePart.id, markerId: marker.id }))));
    }

    return { adjustmentLayers: adjustmentSelection, compositions: compositionSelection, zoomMarkers: zoomSelection, translationMarkers: translationSelection };
  }

  function timelineSelectionKey(selection: { adjustmentLayers: AdjustmentLayerSelection[]; compositions: CompositionSelection[]; zoomMarkers: ZoomMarkerSelection[]; translationMarkers: TranslationMarkerSelection[] }) {
    return [
      selection.adjustmentLayers.map((item) => item.layerId).join(","),
      selection.compositions.map((item) => item.partId).join(","),
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
      if (nextSelectionIds !== "|||") startTransition(() => onSelectTimelineNodes(selection));
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
    if (timelineSelectionKey(selection) !== "|||") onSelectTimelineNodes(selection);
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
    if (isZoomLocked(marker)) return [];
    const mendedItems = getMendedMarkerDragItems(motionTimeline, part, marker.id, "zoom");
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isZoomLocked(selectedMarker) ? getMendedMarkerDragItems(motionTimeline, selectedPart, selectedMarker.id, "zoom") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedTranslationDragItems(part: TimelinePart, marker: TranslationMarker) {
    if (isTranslationLocked(marker)) return [];
    const mendedItems = getMendedMarkerDragItems(motionTimeline, part, marker.id, "translation");
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isTranslationLocked(selectedMarker) ? getMendedMarkerDragItems(motionTimeline, selectedPart, selectedMarker.id, "translation") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedZoomResizeTargets(part: TimelinePart, marker: ZoomMarker) {
    if (isZoomLocked(marker)) return [];
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) return [{ part, marker }];
    const targets = selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isZoomLocked(selectedMarker) ? [{ part: selectedPart, marker: selectedMarker }] : [];
    });
    return targets.length > 0 ? uniqueTimelineResizeTargets(targets) : [{ part, marker }];
  }

  function selectedTranslationResizeTargets(part: TimelinePart, marker: TranslationMarker) {
    if (isTranslationLocked(marker)) return [];
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) return [{ part, marker }];
    const targets = selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker && !isTranslationLocked(selectedMarker) ? [{ part: selectedPart, marker: selectedMarker }] : [];
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

  function getAbsoluteZoomResizeMarkers(target: { part: TimelinePart; marker: ZoomMarker }) {
    const targetLayerId = getZoomMarkerLayerId(target.marker);
    return motionTimeline.flatMap((timelinePart) => timelinePart.zoomMarkers
      .filter((marker) => getZoomMarkerLayerId(marker) === targetLayerId)
      .map((marker) => ({ ...marker, sourcePartId: timelinePart.id, sourcePartStart: timelinePart.start, start: timelinePart.start + marker.start })));
  }

  function getAbsoluteTranslationResizeMarkers(target: { part: TimelinePart; marker: TranslationMarker }) {
    const targetLayerId = getTranslationMarkerLayerId(target.marker);
    const targetKind = getTranslationMarkerLayerKind(target.marker);
    return motionTimeline.flatMap((timelinePart) => timelinePart.translationMarkers
      .filter((marker) => getTranslationMarkerLayerId(marker) === targetLayerId && getTranslationMarkerLayerKind(marker) === targetKind)
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

  function uniqueAbsoluteTimelineMarkers<T extends { id: string; sourcePartId: string }>(markers: T[]) {
    return Array.from(new Map(markers.map((marker) => [`${marker.sourcePartId}:${marker.id}`, marker])).values());
  }


  function blockDeltaForTimelineDrag(items: TimelineMarkerDragItem[], rawDelta: number, snapThresholdSeconds: number, snap: boolean, kind: "zoom" | "translation", targetLayerId?: string) {
    const constraintItems = getTimelineDragConstraintItems(items);
    const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
    const movingKeys = new Set(items.map((item) => `${item.partId}:${item.markerId}`));
    const snapBoundaries = getUniversalTimelineSnapBoundaries(kind, movingKeys);
    let nextDelta = rawDelta;

    if (snap) {
      const snapped = getTimelineBlockSnap(blockStart + nextDelta, blockEnd - blockStart, snapBoundaries, snapThresholdSeconds);
      nextDelta = snapped.start - blockStart;
      updateTimelineSnapGuide(snapped.guideTime);
    } else {
      clearTimelineSnapGuide();
    }

    return clamp(nextDelta, -blockStart, timelineDisplayDuration - blockStart);
  }

  function getUniversalTimelineSnapBoundaries(kind: "zoom" | "translation", movingKeys: Set<string>) {
    const movingEdges = getMovingMarkerEdgeTimes(kind, movingKeys);
    return withPlayheadSnapBoundary(Array.from(new Set([
      ...getScrubSnapBoundaries(timeline, adjustmentLayers).filter((boundary) => !movingEdges.has(roundTenth(boundary))),
      ...getTimelineMarkerDragSnapBoundaries(timeline, kind, movingKeys),
    ])).sort((left, right) => left - right));
  }

  function getMovingMarkerEdgeTimes(kind: "zoom" | "translation", movingKeys: Set<string>) {
    const edges = new Set<number>();
    for (const timelinePart of timeline) {
      const markers = kind === "zoom" ? timelinePart.zoomMarkers : timelinePart.translationMarkers;
      for (const marker of markers) {
        if (!movingKeys.has(`${timelinePart.id}:${marker.id}`)) continue;
        edges.add(roundTenth(timelinePart.start + marker.start));
        edges.add(roundTenth(timelinePart.start + marker.start + marker.duration));
      }
    }
    return edges;
  }

  function getTimelineMarkerElement(kind: "zoom" | "translation", partId: string, markerId: string) {
    return timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-marker-kind="motion"][data-timeline-motion-kind="${kind}"][data-timeline-marker-part-id="${CSS.escape(partId)}"][data-timeline-marker-id="${CSS.escape(markerId)}"]`) ?? null;
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

  function clearTimelineMarkerDragTransforms(kind: "zoom" | "translation", items: TimelineMarkerDragItem[]) {
    for (const item of items) {
      const element = getTimelineMarkerElement(kind, item.partId, item.markerId);
      if (!element) continue;
      clearTimelineBlockPreview(element);
    }
  }

  function setTimelineMarkerResizePreviews<T extends { id: string; start: number; duration: number }>(kind: "zoom" | "translation", partId: string, initialMarkers: T[], nextMarkers: T[], pixelsPerSecond: number) {
    for (const initialMarker of initialMarkers) {
      const nextMarker = nextMarkers.find((item) => item.id === initialMarker.id);
      if (!nextMarker || (nextMarker.start === initialMarker.start && nextMarker.duration === initialMarker.duration)) continue;
      const element = getTimelineMarkerElement(kind, partId, initialMarker.id);
      if (!element) continue;
      applyTimelineBlockPreview(element, { deltaX: (nextMarker.start - initialMarker.start) * pixelsPerSecond, widthDelta: (nextMarker.duration - initialMarker.duration) * pixelsPerSecond });
    }
  }

  function clearTimelineMarkerResizePreviews<T extends { id: string }>(kind: "zoom" | "translation", partId: string, markers: T[]) {
    for (const marker of markers) {
      const element = getTimelineMarkerElement(kind, partId, marker.id);
      if (!element) continue;
      clearTimelineBlockPreview(element);
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
      applyTimelineBlockPreview(element, { deltaX: (nextLayer.start - initialLayer.start) * pixelsPerSecond, widthDelta: (nextLayer.duration - initialLayer.duration) * pixelsPerSecond, resizeProperty: "--clipper-adjustment-resize-width" });
    }
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
    const initialClientY = event.clientY;
    const sourceLayerId = composition.layerId ?? "comp";
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const moveTargetIds = new Set(moveTargets.map((item) => item.id));
    const boundaries = withPlayheadSnapBoundary(getScrubSnapBoundaries(timeline.filter((item) => !moveTargetIds.has(item.id)), adjustmentLayers));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getDeltaSeconds(clientX: number) {
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      return (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
    }

    function getNextComposition(clientX: number, snap: boolean) {
      const deltaSeconds = getDeltaSeconds(clientX);
      if (action === "start") {
        const maxStart = composition.start + composition.duration - 0.1;
        let nextStart = clamp(composition.start + deltaSeconds, 0, maxStart);
        if (snap) {
          const guideTime = getTimelineSnapGuideTime(nextStart, boundaries, snapThresholdSeconds);
          nextStart = clamp(guideTime ?? nextStart, 0, maxStart);
          updateTimelineSnapGuide(guideTime);
        } else clearTimelineSnapGuide();
        return { ...composition, start: nextStart, duration: composition.duration + composition.start - nextStart };
      }

      if (action === "end") {
        const currentEnd = composition.start + composition.duration;
        let nextEnd = Math.max(currentEnd + deltaSeconds, composition.start + 0.1);
        if (snap) {
          const guideTime = getTimelineSnapGuideTime(nextEnd, boundaries, snapThresholdSeconds);
          nextEnd = Math.max(guideTime ?? nextEnd, composition.start + 0.1);
          updateTimelineSnapGuide(guideTime);
        } else clearTimelineSnapGuide();
        return { ...composition, duration: nextEnd - composition.start };
      }

      let nextStart = Math.max(composition.start + deltaSeconds, 0);
      if (snap) {
        const snapped = getTimelineBlockSnap(nextStart, composition.duration, boundaries, snapThresholdSeconds);
        nextStart = Math.max(snapped.start, 0);
        updateTimelineSnapGuide(snapped.guideTime);
      } else clearTimelineSnapGuide();
      return { ...composition, start: nextStart };
    }

    function getNextMoveTargets(clientX: number, snap: boolean) {
      if (moveTargets.length <= 1) return [getNextComposition(clientX, snap)];
      const deltaSeconds = getDeltaSeconds(clientX);
      const minStart = Math.min(...moveTargets.map((target) => target.start));
      let moveDelta = Math.max(deltaSeconds, -minStart);
      const activeTargetStart = composition.start + moveDelta;
      if (snap) {
        const snapped = getTimelineBlockSnap(activeTargetStart, composition.duration, boundaries, snapThresholdSeconds);
        moveDelta = Math.max(snapped.start - composition.start, -minStart);
        updateTimelineSnapGuide(snapped.guideTime);
      } else clearTimelineSnapGuide();
      return moveTargets.map((target) => ({ ...target, start: target.start + moveDelta }));
    }

    function applyDrag(clientX: number, snap: boolean) {
      const nextComposition = getNextComposition(clientX, snap);
      const preview = action === "move" ? getLayerDragPreview("comp", sourceLayerId, pendingClientY) : { deltaY: 0, height: undefined };
      if (isSelectionMove) {
        const nextTargets = getNextMoveTargets(clientX, snap);
        for (const target of moveTargets) {
          const nextTarget = nextTargets.find((item) => item.id === target.id);
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (!nextTarget || !targetElement) continue;
          applyTimelineBlockPreview(targetElement, { deltaX: (nextTarget.start - target.start) * pixelsPerSecond, deltaY: preview.deltaY, height: preview.height, resizeProperty: "--clipper-composition-resize-width" });
        }
        return;
      }
      applyTimelineBlockPreview(element, { deltaX: (nextComposition.start - composition.start) * pixelsPerSecond, deltaY: preview.deltaY, widthDelta: (nextComposition.duration - composition.duration) * pixelsPerSecond, height: preview.height, resizeProperty: "--clipper-composition-resize-width" });
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
      hasDragged = true;
      setGlobalTimelineDragActive(true);
      if (action === "move") setDraggingTimelineBlockCategory("comp");
      updateTimelineDragAutoScroll(pendingClientX, scheduleDragPreview);
      scheduleDragPreview();
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (hasDragged) {
        const nextComposition = getNextComposition(pendingClientX, pointerEvent.shiftKey);
        for (const target of moveTargets) {
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (targetElement) clearCompositionPreview(targetElement);
        }
        if (isSelectionMove) {
          const targetLayerId = getDropLayerId("comp", pendingClientY) ?? sourceLayerId;
          onMoveCompositions(getNextMoveTargets(pendingClientX, pointerEvent.shiftKey).map((target) => ({ compositionId: target.id, start: roundTenth(target.start), targetLayerId })));
        } else if (action === "move") onMoveComposition(composition.id, roundTenth(nextComposition.start), getDropLayerId("comp", pendingClientY) ?? sourceLayerId);
        else onUpdateComposition(composition.id, (current) => ({ ...current, start: roundTenth(nextComposition.start), duration: roundTenth(nextComposition.duration) }));
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      stopTimelineDragAutoScroll();
      clearTimelineSnapGuide();
      window.requestAnimationFrame(() => {
        for (const target of moveTargets) {
          const targetElement = timelineViewportRef.current?.querySelector<HTMLElement>(`[data-timeline-composition-id="${CSS.escape(target.id)}"]`);
          if (targetElement) clearCompositionPreview(targetElement);
        }
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
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
    const initialClientY = event.clientY;
    const sourceLayerId = getAdjustmentLayerRowId(layer);
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const resizeTargetIds = new Set(resizeTargets.map((item) => item.id));
    const boundaries = withPlayheadSnapBoundary(getScrubSnapBoundaries(timeline, adjustmentLayers.filter((item) => !resizeTargetIds.has(item.id))));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getNextLayer(targetLayer: AdjustmentLayer, clientX: number, snap: boolean) {
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      const deltaSeconds = (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
      if (action === "start") {
        const maxStart = targetLayer.start + targetLayer.duration - 0.1;
        let nextStart = clamp(targetLayer.start + deltaSeconds, 0, maxStart);
        if (snap) {
          const guideTime = getTimelineSnapGuideTime(nextStart, boundaries, snapThresholdSeconds);
          nextStart = clamp(guideTime ?? nextStart, 0, maxStart);
          if (targetLayer.id === layer.id) updateTimelineSnapGuide(guideTime);
        } else if (targetLayer.id === layer.id) clearTimelineSnapGuide();
        return { ...targetLayer, start: nextStart, duration: targetLayer.duration + targetLayer.start - nextStart };
      }

      if (action === "end") {
        const currentEnd = targetLayer.start + targetLayer.duration;
        let nextEnd = Math.max(currentEnd + deltaSeconds, targetLayer.start + 0.1);
        if (snap) {
          const guideTime = getTimelineSnapGuideTime(nextEnd, boundaries, snapThresholdSeconds);
          nextEnd = Math.max(guideTime ?? nextEnd, targetLayer.start + 0.1);
          if (targetLayer.id === layer.id) updateTimelineSnapGuide(guideTime);
        } else if (targetLayer.id === layer.id) clearTimelineSnapGuide();
        return { ...targetLayer, duration: nextEnd - targetLayer.start };
      }

      let nextStart = clamp(targetLayer.start + deltaSeconds, 0, timelineDisplayDuration);
      if (snap) {
        const snapped = getTimelineBlockSnap(nextStart, targetLayer.duration, boundaries, snapThresholdSeconds);
        nextStart = snapped.start;
        nextStart = clamp(nextStart, 0, timelineDisplayDuration);
        if (targetLayer.id === layer.id) updateTimelineSnapGuide(snapped.guideTime);
      } else if (targetLayer.id === layer.id) clearTimelineSnapGuide();
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
      applyTimelineBlockPreview(element, { deltaX: (nextLayer.start - layer.start) * pixelsPerSecond, deltaY: preview.deltaY, widthDelta: (nextLayer.duration - layer.duration) * pixelsPerSecond, height: preview.height, resizeProperty: "--clipper-adjustment-resize-width" });
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
        setGlobalTimelineDragActive(true);
        if (action === "move") setDraggingTimelineBlockCategory("adjust");
      }
      hasDragged = true;
      updateTimelineDragAutoScroll(pendingClientX, scheduleDragPreview);
      scheduleDragPreview();
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
      setDraggingTimelineBlockCategory(null);
      stopTimelineDragAutoScroll();
      clearTimelineSnapGuide();
      window.requestAnimationFrame(() => {
        if (isSelectionMove || isSelectionResize) clearAdjustmentResizePreviews(resizeTargets);
        else clearTimelineBlockPreview(element, "--clipper-adjustment-resize-width");
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function updateZoomFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedZoomDragItems(part, marker);
    if (dragItems.length === 0 || isZoomLocked(marker)) return;
    const resizeTargets = action !== "move" && dragItems.length > 1 ? [{ part, marker }] : selectedZoomResizeTargets(part, marker);
    const targetAlreadySelected = selectedZoomKeys.has(`${part.id}:${marker.id}`);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize = action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectZoomMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = marker.layerId ?? "";
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [`${item.partId}:${item.markerId}`, item.partId]));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      const deltaSeconds = (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
      const targetLayerId = getMotionDropLayerId("motion", pendingClientY);
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "zoom", targetLayerId);
      const moves = getTimelineMarkerMoves(motionTimeline, dragItems, blockDeltaSeconds, "zoom", activePartIds, snapThresholdSeconds).map((move) => ({ ...move, targetLayerId }));
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
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      let deltaSeconds = (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
      if (!snap || (action !== "start" && action !== "end")) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }
      const internalMendedEdge = action === "end" ? isZoomMarkerMendedEdge(timeline, part, marker, "end") : isZoomMarkerMendedEdge(timeline, part, marker, "start");
      if (internalMendedEdge) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }

      const movingKeys = new Set(dragItems.map((item) => `${item.partId}:${item.markerId}`));
      const boundaries = getUniversalTimelineSnapBoundaries("zoom", movingKeys);
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

    function getResizeMarkers(clientX: number, snap: boolean) {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      const resizedMarkers = resizeTargets.flatMap((target) => getAbsoluteMarkerResizeState(getAbsoluteZoomResizeMarkers(target), target.marker.id, target.part.id, action as "start" | "end", deltaSeconds));
      return uniqueAbsoluteTimelineMarkers(resizedMarkers);
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      onResizeZoomMarkers(getTimelineMarkerResizeCommits(getResizeMarkers(clientX, snap)));
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
        if (action === "move") setDraggingTimelineBlockCategory("motion");
      }
      updateTimelineDragAutoScroll(pendingClientX, scheduleDragPreview);
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
      setDraggingTimelineBlockCategory(null);
      stopTimelineDragAutoScroll();
      clearTimelineSnapGuide();
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
    if (dragItems.length === 0 || isTranslationLocked(marker)) return;
    const resizeTargets = action !== "move" && dragItems.length > 1 ? [{ part, marker }] : selectedTranslationResizeTargets(part, marker);
    const targetAlreadySelected = selectedTranslationKeys.has(`${part.id}:${marker.id}`);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize = action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize) onSelectTranslationMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = marker.layerId ?? "";
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(dragItems.map((item) => [`${item.partId}:${item.markerId}`, item.partId]));
    let pendingClientX = event.clientX;
    let pendingClientY = event.clientY;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;
    let hasDragged = false;

    function getMoveDragState(clientX: number, snap: boolean) {
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      const deltaSeconds = (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
      const targetLayerId = getMotionDropLayerId("motion", pendingClientY);
      const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "translation", targetLayerId);
      const moves = getTimelineMarkerMoves(motionTimeline, dragItems, blockDeltaSeconds, "translation", activePartIds, snapThresholdSeconds).map((move) => ({ ...move, targetLayerId }));
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
      const scrollDeltaPixels = (timelineViewportRef.current?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      let deltaSeconds = (clientX + scrollDeltaPixels - initialClientX) / pixelsPerSecond;
      if (!snap || (action !== "start" && action !== "end")) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }
      const internalMendedEdge = action === "end" ? isTranslationMarkerMendedEdge(timeline, part, marker, "end") : isTranslationMarkerMendedEdge(timeline, part, marker, "start");
      if (internalMendedEdge) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }

      const movingKeys = new Set(dragItems.map((item) => `${item.partId}:${item.markerId}`));
      const boundaries = getUniversalTimelineSnapBoundaries("translation", movingKeys);
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

    function getResizeMarkers(clientX: number, snap: boolean) {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      const resizedMarkers = resizeTargets.flatMap((target) => getAbsoluteMarkerResizeState(getAbsoluteTranslationResizeMarkers(target), target.marker.id, target.part.id, action as "start" | "end", deltaSeconds));
      return uniqueAbsoluteTimelineMarkers(resizedMarkers);
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      onResizeTranslationMarkers(getTimelineMarkerResizeCommits(getResizeMarkers(clientX, snap)));
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
        if (action === "move") setDraggingTimelineBlockCategory("motion");
      }
      updateTimelineDragAutoScroll(pendingClientX, scheduleDragPreview);
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
      setDraggingTimelineBlockCategory(null);
      stopTimelineDragAutoScroll();
      clearTimelineSnapGuide();
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

  function isZoomLocked(marker: ZoomMarker) {
    return isLayerLocked("motion", getZoomMarkerLayerId(marker));
  }

  function isTranslationLocked(marker: TranslationMarker) {
    return isLayerLocked("motion", getTranslationMarkerLayerId(marker));
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

  function previewAdjustmentEffectDrop(effectId: AdjustmentEffectId, layerId: string, clientX: number, sceneTime: number, snap: boolean) {
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) return;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const boundaries = getScrubSnapBoundaries(timeline, adjustmentLayers);
    let nextStart = clamp(sceneTime, 0, timelineDisplayDuration);
    if (snap) nextStart = clamp(snapTimelineBlockStartToBoundary(nextStart, base.duration, boundaries, snapThresholdSeconds), 0, timelineDisplayDuration);
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

    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const boundaries = withPlayheadSnapBoundary(getScrubSnapBoundaries(timeline, adjustmentLayers));
    let nextStart = clamp(sceneTime - base.duration / 2, 0, timelineDisplayDuration);
    if (snap) nextStart = clamp(snapTimelineBlockStartToBoundary(nextStart, base.duration, boundaries, snapThresholdSeconds), 0, timelineDisplayDuration);
    updateEffectDragPreview({ ...base, start: roundTenth(nextStart) });
  }

  function previewCompositionDrop(detail: CompositionPointerDragDetail, layerId: string, sceneTime: number) {
    const duration = Math.max(detail.duration, 0.1);
    const start = roundTenth(clamp(sceneTime, 0, timelineDisplayDuration));
    updateEffectDragPreview({ category: "composition", layerKey: layerId, label: detail.label, isEmpty: detail.isEmpty, sourceMissing: detail.sourceMissing, start, duration, initialClientX: detail.clientX, initialStart: start });
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
        if (adjustmentRow.locked) {
          updateEffectDragPreview(null);
          return;
        }
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
      if (!motionEffect || !layer || layer.locked) {
        updateEffectDragPreview(null);
        return;
      }

      if (detail.phase === "drop") {
        const preview = effectDragPreviewRef.current;
        const targetSceneTime = preview?.effectId === motionEffect.id && preview.layerKey === layer.id ? preview.start + preview.duration / 2 : target.sceneTime;
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
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
        return;
      }

      const target = getEffectPointerDropTarget(detail.clientX, detail.clientY);
      const compositionRow = target ? compositionRows.find((row) => row.id === target.rowKey) : null;
      const overTimeline = isEffectPointerOverTimeline(detail.clientX, detail.clientY);
      setGlobalTimelineDragActive(detail.phase !== "drop" && overTimeline);
      setClipperPointerDragPreview(compositionDragPreviewEvent, Boolean(compositionRow && !compositionRow.locked && detail.phase !== "drop"));

      if (!target || !compositionRow || compositionRow.locked) {
        if (detail.phase === "drop") setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        return;
      }

      if (detail.phase === "drop") {
        const preview = effectDragPreviewRef.current;
        const targetStart = preview?.category === "composition" && preview.layerKey === compositionRow.id ? preview.start : target.sceneTime;
        setGlobalTimelineDragActive(false);
        updateEffectDragPreview(null);
        setClipperPointerDragPreview(compositionDragPreviewEvent, false);
        onAddComposition(detail.compositionId, compositionRow.id, targetStart);
        return;
      }

      previewCompositionDrop(detail, compositionRow.id, target.sceneTime);
    }

    window.addEventListener(compositionPointerDragEvent, handleCompositionPointerDrag);
    return () => window.removeEventListener(compositionPointerDragEvent, handleCompositionPointerDrag);
  });

  function startLayerRowResize(event: PointerEvent<HTMLElement>, rowKey: string, edge: "top" | "bottom" = "bottom") {
    const category = getLayerCategory(rowKey);
    if (category && isLayerLocked(category, rowKey)) return;
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
  }, [effectDragPreview, contentWidth, layerRows, layerRowStarts, layerRowHeights, timelineDisplayDuration]);

  const playheadColor = "#ff3b30";

  return (
    <footer ref={timelinePanelRef} className={`grid h-full min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-1.5 overflow-hidden border-t border-[#1d2028] bg-[#141821] px-[22px] pb-0 pt-2.5 ${timelineDragActive ? "clipper-timeline-dragging-no-hover" : ""}`}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[12px] text-[#9b9da7]">
        <div className="flex rounded-full border border-[#2d313b] bg-[#111319] p-1" aria-label="Timeline mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "compose" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("compose")}>Compose</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "composition" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("composition")}>Direct</button>
        </div>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <input aria-label="Timeline zoom" className="h-2 w-[168px] accent-[#737884] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#474d5b] [&::-webkit-slider-thumb]:bg-[#9b9da7] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#474d5b] [&::-moz-range-thumb]:bg-[#9b9da7]" type="range" min={0.01} max={4} step={0.01} value={timelineZoom} onChange={(event) => updateTimelineZoom(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline out" onClick={() => updateTimelineZoom(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline in" onClick={() => updateTimelineZoom(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div ref={playbackPlayheadRef} className="relative grid h-full min-h-0 max-h-full grid-rows-[38px_minmax(0,1fr)] overflow-hidden" style={{ "--clipper-playhead-left": `${timelineDisplayDuration > 0 ? (currentSceneTime / timelineDisplayDuration) * 100 : 0}%`, "--clipper-timeline-scroll-x": `${-(timelineViewportRef.current?.scrollLeft ?? timelineViewportState.displacement)}px` } as CSSProperties}>
        <div className="pointer-events-none absolute right-0 top-0 z-30 overflow-hidden pl-0 pr-3" style={{ left: layerRailWidth, height: 38 + laneContentHeight }}>
          <div className="relative" style={{ width: contentWidth, height: 38 + laneContentHeight, transform: "translate3d(var(--clipper-timeline-scroll-x, 0px), 0, 0)", willChange: "transform" }}>
            <div ref={timelineSnapGuideRef} className="pointer-events-none absolute top-0 z-20 hidden w-px bg-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_12px_rgba(255,255,255,0.35)]" style={{ height: 38 + laneContentHeight, transform: "translate3d(0, 0, 0)" }} />
            <div className="absolute top-[12px] h-3 w-2.5 rounded-[2px]" style={{ left: `var(--clipper-playhead-left)`, backgroundColor: playheadColor, clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)", transform: "translateX(-50%)" }} />
            <div className="absolute top-[38px] w-px" style={{ left: `var(--clipper-playhead-left)`, height: laneContentHeight, backgroundColor: playheadColor }} />
          </div>
        </div>
        <div className="grid min-h-0" style={{ gridTemplateColumns: `${layerRailWidth}px minmax(0, 1fr)` }}>
          <div className="flex min-w-0 items-center pr-4">
            <span className="min-w-0 truncate text-[13px] font-extrabold text-[#dfe2ea]" title={timelineName}>{timelineName}</span>
          </div>
          <div ref={timelineRulerViewportRef} className="relative overflow-hidden pl-0 pr-3">
            <TimeRuler rulerRef={timelineRef} ticks={ticks} sceneDuration={timelineDisplayDuration} contentWidth={contentWidth} onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub} />
          </div>
        </div>
        <div className="grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: `${layerRailWidth}px minmax(0, 1fr)` }}>
          <div className="min-h-0 overflow-hidden" onWheel={scrollTimelineFromLayerRail}>
          <div ref={timelineLayerRailRef} className="relative grid pr-0 will-change-transform" style={{ ...laneRowsStyle, height: laneContentHeight }}>
            <span className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-[#39404d]" />
            {layerRows.map((row, index) => <span className="pointer-events-none absolute right-0 z-40 w-0.5" key={`layer-accent-${row.key}`} style={{ top: layerRowStarts[index], height: layerRowHeights[index], backgroundColor: row.accent }} />)}
            {layerRows.length > 0 ? <LayerResizeSeparator key={`label-separator-${layerRows[0].key}-top`} top={0} onPointerDown={(event) => startLayerRowResize(event, layerRows[0].key, "top")} /> : null}
            {layerRows.slice(1).map((row, index) => <LayerResizeSeparator key={`label-separator-${row.key}`} top={layerRowStarts[index + 1]} onPointerDown={(event) => startLayerRowResize(event, row.key, "top")} />)}
            {isCompositionMode ? adjustmentRows.map((row, index) => <LayerLabel key={row.key} editing={editingLayerId === row.key} hidden={row.hidden} locked={row.locked} compactControls={layerRowHeights[index] < 44} hideLockControl={layerRowHeights[index] < 68} menuOpen={motionLayerMenuId === row.key} name={row.name} draft={layerNameDraft} canMoveDown={index < adjustmentRows.length - 1} canMoveUp={index > 0} addBeforeLabel="Add adjust above" addAfterLabel="Add adjust below" removeLabel="Remove adjust" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(row.key, row.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowAdjustmentEffectDrop(event, row.key, currentSceneTime)} onEffectDrop={(event) => dropAdjustmentEffect(event, row.key, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === row.key ? null : row.key)} onAddBefore={() => addAdjustmentLayerAround(row.key, "before")} onAddAfter={() => addAdjustmentLayerAround(row.key, "after")} onMoveUp={() => moveAdjustmentRow(row.key, "up")} onMoveDown={() => moveAdjustmentRow(row.key, "down")} onRemove={() => removeAdjustmentLayer(row.key)} onToggleHidden={() => toggleLayerHidden(row.key)} onToggleLocked={() => toggleLayerLocked(row.key)} />) : null}
            {isCompositionMode ? motionLayers.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} compactControls={layerRowHeights[adjustmentRows.length + index] < 44} hideLockControl={layerRowHeights[adjustmentRows.length + index] < 68} menuOpen={motionLayerMenuId === layer.id} name={layer.name} draft={layerNameDraft} canMoveDown={index < motionLayers.length - 1} canMoveUp={index > 0} addBeforeLabel="Add motion above" addAfterLabel="Add motion below" removeLabel="Remove motion" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id, currentSceneTime)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id, currentSceneTime)} onMenuToggle={() => setMotionLayerMenuId((current) => current === layer.id ? null : layer.id)} onAddBefore={() => addMotionLayerAround(layer.id, "before")} onAddAfter={() => addMotionLayerAround(layer.id, "after")} onMoveUp={() => moveMotionLayer(layer.id, "up")} onMoveDown={() => moveMotionLayer(layer.id, "down")} onRemove={() => removeMotionLayer(layer.id)} onToggleHidden={() => toggleLayerHidden(layer.id)} onToggleLocked={() => toggleLayerLocked(layer.id)} />) : null}
            {compositionRows.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} compactControls={layerRowHeights[(isCompositionMode ? adjustmentRows.length + motionLayers.length : 0) + index] < 44} hideLockControl={layerRowHeights[(isCompositionMode ? adjustmentRows.length + motionLayers.length : 0) + index] < 68} menuOpen={motionLayerMenuId === layer.id} name={layer.name} draft={layerNameDraft} canMoveDown={index < compositionRows.length - 1} canMoveUp={index > 0} addBeforeLabel="Add composition above" addAfterLabel="Add composition below" removeLabel="Remove composition" onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onMenuToggle={() => setMotionLayerMenuId((current) => current === layer.id ? null : layer.id)} onAddBefore={() => addCompositionLayerAround(layer.id, "before")} onAddAfter={() => addCompositionLayerAround(layer.id, "after")} onMoveUp={() => moveCompositionLayer(layer.id, "up")} onMoveDown={() => moveCompositionLayer(layer.id, "down")} onRemove={() => removeCompositionLayer(layer.id)} onToggleHidden={() => toggleLayerHidden(layer.id)} onToggleLocked={() => toggleLayerLocked(layer.id)} />)}
          </div>
          </div>
            <div ref={timelineViewportRef} className="timeline-scrollbar min-h-0 overflow-x-scroll overflow-y-auto pl-0 pr-3 [scrollbar-gutter:stable]" onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) updateEffectDragPreview(null); }} onScroll={saveTimelineDisplacement}>
              <div className="relative grid" style={{ ...laneRowsStyle, width: contentWidth, height: laneContentHeight }}>
            {timelineSelectionDrag ? <TimelineSelectionBox boxRef={timelineSelectionBoxRef} drag={timelineSelectionDrag} /> : null}
            {isCompositionMode ? adjustmentRows.map((row) => <TimelineLayerLane key={row.key} hidden={row.hidden} locked={row.locked} overflowVisible={isDraggingAdjustmentLayer} className="block" onDragOver={(event) => allowAdjustmentEffectDrop(event, row.key)} onDrop={(event) => dropAdjustmentEffect(event, row.key)} onPointerDown={startTimelineSelection} onPointerMove={continueTimelineSelection} onPointerUp={endTimelineSelection} onPointerCancel={endTimelineSelection} onContextMenu={openBlankTimelineContextMenu}>
              {adjustmentLayers.filter((layer) => getAdjustmentLayerRowId(layer) === row.key).map((layer) => (
                  <TimelineBlock variant="adjustment" gradient={getEffectPackage(layer.effect.effectId)?.timelineGradient} dataAttributes={{ "data-timeline-marker-kind": "adjustment", "data-timeline-adjustment-id": layer.id }} key={layer.id} locked={row.locked} selected={selectedAdjustmentLayerIds.has(layer.id) || layer.id === selectedAdjustmentLayerId} style={{ left: `${(layer.start / timelineDisplayDuration) * 100}%`, width: `calc(${(layer.duration / timelineDisplayDuration) * 100}% + var(--clipper-adjustment-resize-width, 0px))` }} onPointerDown={(event) => updateAdjustmentFromPointer(event, layer, "move")} onClick={() => onSelectAdjustmentLayer(layer.id)} onLeftResize={(event) => updateAdjustmentFromPointer(event, layer, "start")} onRightResize={(event) => updateAdjustmentFromPointer(event, layer, "end")} onContextMenu={(event) => openTimelineNodeContextMenu(event, { kind: "adjustment", layerId: layer.id })}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{layer.name}</span>
                </TimelineBlock>
              ))}
            </TimelineLayerLane>) : null}
            {isCompositionMode ? motionLayers.map((layer) => <MotionLane key={layer.id} layerId={layer.id} hidden={Boolean(layer.hidden)} locked={Boolean(layer.locked)} timeline={motionTimeline} sceneDuration={timelineDisplayDuration} overflowVisible={isDraggingMotionMarker} zoomSelectionDrag={null} zoomSelectionBoxRef={zoomSelectionBoxRef} translationSelectionDrag={null} translationSelectionBoxRef={translationSelectionBoxRef} selectedZoomKeys={selectedZoomKeys} selectedZoomMarkerId={selectedZoomMarkerId} selectedZoomMarkerPartId={selectedZoomMarkerPartId} selectedTranslationKeys={selectedTranslationKeys} selectedTranslationMarkerId={selectedTranslationMarkerId} selectedTranslationMarkerPartId={selectedTranslationMarkerPartId} onEffectDragOver={(event) => allowMotionLayerEffectDrop(event, layer.id)} onEffectDrop={(event) => dropMotionLayerEffect(event, layer.id)} onStartSelection={startTimelineSelection} onMoveSelection={continueTimelineSelection} onEndSelection={endTimelineSelection} onOpenBlankContextMenu={openBlankTimelineContextMenu} onSelectZoomMarker={onSelectZoomMarker} onSelectTranslationMarker={onSelectTranslationMarker} onOpenNodeContextMenu={openTimelineNodeContextMenu} onUpdateZoomFromPointer={updateZoomFromPointer} onUpdateTranslationFromPointer={updateTranslationFromPointer} />) : null}
            {effectDragPreview ? <EffectDragPreviewBlock blockRef={effectDragPreviewElementRef} preview={effectDragPreview} /> : null}
            {compositionRows.map((row) => <TimelineLayerLane key={row.id} hidden={Boolean(row.hidden)} locked={Boolean(row.locked)} overflowVisible={timelineMarkersEditable && isDraggingCompositionBlock} className="block" onDragOver={(event) => { if (timelineMarkersEditable && !row.locked && event.dataTransfer.types.includes("application/x-clipper-composition")) event.preventDefault(); }} onDrop={(event) => { if (!timelineMarkersEditable || row.locked) return; const compositionId = event.dataTransfer.getData("application/x-clipper-composition"); if (!compositionId) return; event.preventDefault(); onAddComposition(compositionId, row.id, getDropSceneTime(event)); }} onPointerDown={startTimelineSelection} onPointerMove={continueTimelineSelection} onPointerUp={endTimelineSelection} onPointerCancel={endTimelineSelection} onContextMenu={openBlankTimelineContextMenu}>
              {timeline.filter((item) => (item.layerId ?? "comp") === row.id).map((item) => {
                const isEmptyPart = item.objects.length === 0 && item.background.elements.length === 0;
                const isUnlinkedPart = Boolean(item.sourceMissing);
                return (
                  <CompositionTimelineBlock dataAttributes={{ "data-timeline-composition-id": item.id }} key={item.id} name={item.name} duration={item.duration} isEmpty={isEmptyPart} sourceMissing={isUnlinkedPart} locked={Boolean(row.locked)} selected={selectedPartIds.has(item.id)} style={{ left: `${timelineDisplayDuration > 0 ? (item.start / timelineDisplayDuration) * 100 : 0}%`, width: `calc(${timelineDisplayDuration > 0 ? (item.duration / timelineDisplayDuration) * 100 : 0}% + var(--clipper-composition-resize-width, 0px))` }} onPointerDown={(event) => { if (timelineMarkersEditable) updateCompositionFromPointer(event, item, "move"); }} onClick={() => onSelectPart(item.id)} onDoubleClick={() => onOpenComposePart(item.id)} onContextMenu={(event) => { if (timelineMarkersEditable) openTimelineNodeContextMenu(event, { kind: "part", partId: item.id }); }} leftResizeEnabled={timelineMarkersEditable} rightResizeEnabled={timelineMarkersEditable} onLeftResize={(event) => updateCompositionFromPointer(event, item, "start")} onRightResize={(event) => updateCompositionFromPointer(event, item, "end")} />
                );
              })}
            </TimelineLayerLane>)}
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

function EffectDragPreviewBlock({ blockRef, preview }: { blockRef: RefObject<HTMLDivElement | null>; preview: EffectDragPreview }) {
  if (preview.category === "composition") {
    return <CompositionTimelineBlock blockRef={blockRef} name={preview.label ?? "Composition"} duration={preview.duration} isEmpty={Boolean(preview.isEmpty)} sourceMissing={Boolean(preview.sourceMissing)} selected={false} preview style={{ left: 0, width: 0 }} />;
  }

  const effect = preview.effectId ? getEffectPackage(preview.effectId) : undefined;
  const gradient = effect?.timelineGradient ?? getDefaultTimelineGradient(preview.category === "motion" && preview.kind === "zoom" ? "zoom" : preview.category === "adjustment" ? "adjustment" : "translation");
  const label = effect?.label ?? preview.label ?? preview.effectId ?? "Composition";

  return (
    <div ref={blockRef} className="pointer-events-none absolute left-0 top-0 z-30 box-border min-w-[18px] overflow-hidden rounded-[3px] px-3 py-2 text-xs font-bold opacity-55 shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)]" style={timelineGradientStyle(gradient)}>
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </div>
  );
}

function CompositionTimelineBlock({ blockRef, name, duration, isEmpty, sourceMissing, locked = false, selected, preview = false, style, dataAttributes, leftResizeEnabled = false, rightResizeEnabled = false, onClick, onDoubleClick, onPointerDown, onContextMenu, onLeftResize, onRightResize }: { blockRef?: RefObject<HTMLDivElement | null>; name: string; duration: number; isEmpty: boolean; sourceMissing: boolean; locked?: boolean; selected: boolean; preview?: boolean; style: CSSProperties; dataAttributes?: Record<string, string>; leftResizeEnabled?: boolean; rightResizeEnabled?: boolean; onClick?: () => void; onDoubleClick?: () => void; onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void; onLeftResize?: (event: PointerEvent<HTMLDivElement>) => void; onRightResize?: (event: PointerEvent<HTMLDivElement>) => void }) {
  const fillClass = preview ? "top-0" : "inset-y-0";
  const interactivityClass = preview ? "pointer-events-none z-30" : "";
  const surfaceClass = sourceMissing ? "bg-black text-[#f1f3f7]" : isEmpty ? "bg-[linear-gradient(180deg,#2b2d35,#191b21)] text-[#8c929f] opacity-75" : "bg-[linear-gradient(180deg,#38a86d,#17603c)] text-white";
  const stateClass = selected ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : preview ? "opacity-90" : locked ? "opacity-45" : "opacity-90";

  function blockPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onPointerDown?.(event);
  }

  return <div ref={blockRef} data-timeline-control {...dataAttributes} role="button" tabIndex={0} className={`absolute ${fillClass} ${interactivityClass} box-border flex min-w-[34px] cursor-default items-end justify-between gap-2 overflow-hidden rounded-[3px] px-3 py-2 text-left text-[13px] leading-none shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${surfaceClass} ${stateClass}`} style={style} onClick={locked ? undefined : onClick} onDoubleClick={locked ? undefined : onDoubleClick} onPointerDown={blockPointerDown} onContextMenu={locked ? undefined : onContextMenu}>
    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{sourceMissing ? `Unlinked: ${name}` : name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{duration}s</small>
    <div className={`absolute left-0 top-0 bottom-0 w-2 ${leftResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={leftResizeEnabled && !locked ? onLeftResize : undefined} />
    <div className={`absolute right-0 top-0 bottom-0 w-2 ${rightResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={rightResizeEnabled && !locked ? onRightResize : undefined} />
  </div>;
}

function LayerLabel({ name, draft, editing, hidden, locked, compactControls, hideLockControl, menuOpen, canMoveDown = true, canMoveUp = true, addAfterLabel = "Add layer below", addBeforeLabel = "Add layer above", removeLabel = "Remove layer", onAddAfter, onAddBefore, onCancel, onCommit, onDraftChange, onEdit, onEffectDragOver, onEffectDrop, onMenuToggle, onMoveDown, onMoveUp, onRemove, onToggleHidden, onToggleLocked }: { name: string; draft: string; editing: boolean; hidden: boolean; locked: boolean; compactControls: boolean; hideLockControl: boolean; menuOpen?: boolean; canMoveDown?: boolean; canMoveUp?: boolean; addAfterLabel?: string; addBeforeLabel?: string; removeLabel?: string; onAddAfter?: () => void; onAddBefore?: () => void; onCancel: () => void; onCommit: () => void; onDraftChange: (value: string) => void; onEdit: () => void; onEffectDragOver?: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop?: (event: DragEvent<HTMLDivElement>) => void; onMenuToggle?: () => void; onMoveDown?: () => void; onMoveUp?: () => void; onRemove?: () => void; onToggleHidden: () => void; onToggleLocked: () => void }) {
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
    <div className={`relative grid h-full grid-cols-[1fr_auto] items-start gap-2 pr-0 pt-2 transition ${hidden ? "opacity-45" : locked ? "opacity-70" : ""}`} onDragOver={locked ? undefined : onEffectDragOver} onDrop={locked ? undefined : onEffectDrop}>
      {editing ? <input autoFocus className="min-w-0 rounded-md border border-[var(--clipper-accent)] bg-[#111319] px-2 py-1 text-xs font-bold text-[#dfe2ea] outline-none" value={draft} onBlur={onCommit} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommit(); if (event.key === "Escape") onCancel(); }} /> : <button className={`relative min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md py-1 pl-0 pr-1 text-left text-[12px] font-bold transition before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-[var(--clipper-accent)] before:opacity-0 before:transition-opacity ${locked ? "cursor-default text-[#ff6b6b]" : "cursor-text text-[#9b9da7] hover:bg-[#20232c]/70 hover:text-[#dfe2ea] hover:before:opacity-100 focus-visible:bg-[#20232c]/70 focus-visible:outline-none focus-visible:before:opacity-100"}`} title={locked ? "Unlock layer to rename" : "Double-click to rename"} onDoubleClick={locked ? undefined : onEdit}>{name}</button>}
      <div className="flex flex-col items-start gap-0.5 self-start justify-self-end pr-2">
        {onMenuToggle ? <button ref={menuButtonRef} data-timeline-control className="grid h-5 w-5 place-items-center rounded text-[#dfe2ea] transition hover:bg-[#20232c] hover:text-[#37d6c2]" title="Layer options" onClick={onMenuToggle}><MoreHorizontal size={13} /></button> : null}
        {compactControls ? null : <button data-timeline-control className={`grid h-5 w-5 place-items-center rounded transition ${locked ? "text-[#737884]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-[#37d6c2]"}`} title={locked ? "Unlock layer before hiding" : hidden ? "Show layer" : "Hide layer"} disabled={locked} onClick={onToggleHidden}>{hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
        {hideLockControl ? null : <button data-timeline-control className={`grid h-5 w-5 place-items-center rounded transition ${locked ? "bg-[#20232c] text-[#37d6c2]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-[#37d6c2]"}`} title={locked ? "Unlock layer" : "Lock layer"} onClick={onToggleLocked}>{locked ? <Lock size={12} /> : <Unlock size={12} />}</button>}
      </div>
      {menuOpen && typeof document !== "undefined" ? createPortal(<div ref={menuRef} data-timeline-control className="fixed z-50 grid min-w-[180px] overflow-hidden rounded-xl border border-[#2d313b] bg-[#111319] py-1 text-xs font-bold text-[#dfe2ea] shadow-[0_18px_48px_rgba(0,0,0,0.48)]" style={{ left: menuPosition?.x ?? 0, top: menuPosition?.y ?? 0, visibility: menuPosition ? "visible" : "hidden" }}>
        <button className="px-3 py-2 text-left hover:bg-[#20232c]" onClick={onToggleLocked}>{locked ? "Unlock layer" : "Lock layer"}</button>
        <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onToggleHidden}>{hidden ? "Enable layer" : "Disable layer"}</button>
        {onMoveUp && canMoveUp ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onMoveUp}>Move up</button> : null}
        {onMoveDown && canMoveDown ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onMoveDown}>Move down</button> : null}
        {onAddBefore ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onAddBefore}>{addBeforeLabel}</button> : null}
        {onAddAfter ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onAddAfter}>{addAfterLabel}</button> : null}
        {onRemove ? <button className="px-3 py-2 text-left text-[#ffb4b4] hover:bg-[#2a1719] disabled:cursor-not-allowed disabled:text-[#73575b] disabled:hover:bg-transparent" disabled={locked} onClick={onRemove}>{removeLabel}</button> : null}
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

function getDefaultTimelineGradient(variant: "adjustment" | "translation" | "zoom"): EffectTimelineGradient {
  if (variant === "adjustment") return { from: "#a77cff", to: "#5f35c6", text: "#ffffff" };
  if (variant === "zoom") return { from: "#f0c95a", to: "#b88312", text: "#1a1202" };
  return { from: "#24b7c9", to: "#127c8d", text: "#ffffff" };
}

function timelineGradientStyle(gradient: EffectTimelineGradient): CSSProperties {
  return {
    background: `linear-gradient(180deg, ${gradient.from}, ${gradient.to})`,
    color: gradient.text ?? "#ffffff",
  };
}

function TimelineLayerLane({ hidden, locked = false, overflowVisible = false, className = "block", children, onClick, onContextMenu, onDragOver, onDrop, onPointerCancel, onPointerDown, onPointerMove, onPointerUp }: { hidden: boolean; locked?: boolean; overflowVisible?: boolean; className?: string; children: ReactNode; onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void; onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void; onDragOver?: (event: DragEvent<HTMLDivElement>) => void; onDrop?: (event: DragEvent<HTMLDivElement>) => void; onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void; onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void }) {
  return <div className={`relative h-full min-h-0 ${className} ${overflowVisible ? "overflow-visible" : "overflow-hidden"} border-x border-[#2d313b] bg-[#111319] transition ${hidden ? "opacity-35" : locked ? "opacity-55" : ""}`} onClick={onClick} onContextMenu={onContextMenu} onDragOver={onDragOver} onDrop={onDrop} onPointerCancel={onPointerCancel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>{children}</div>;
}

function TimelineBlock({ variant, gradient, selected, locked = false, muted, squareLeft, squareRight, leftResizeEnabled = true, rightResizeEnabled = true, style, children, leftHandle, rightHandle, dataAttributes, onClick, onPointerDown, onLeftResize, onRightResize, onContextMenu }: { variant: "adjustment" | "translation" | "zoom"; gradient?: EffectTimelineGradient; selected: boolean; locked?: boolean; muted?: boolean; squareLeft?: boolean; squareRight?: boolean; leftResizeEnabled?: boolean; rightResizeEnabled?: boolean; style: CSSProperties; children: ReactNode; leftHandle?: ReactNode; rightHandle?: ReactNode; dataAttributes: Record<string, string>; onClick: () => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onLeftResize: (event: PointerEvent<HTMLDivElement>) => void; onRightResize: (event: PointerEvent<HTMLDivElement>) => void; onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void }) {
  const variantClass = variant === "adjustment" ? "min-w-[34px] text-left font-extrabold" : "min-w-[18px] font-bold";
  const selectionClass = selected ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : locked ? "opacity-45" : muted ? "opacity-80" : "opacity-85";
  const radiusClass = `${squareLeft ? "rounded-l-none" : ""} ${squareRight ? "rounded-r-none" : ""}`;
  const edgeShadows = [
    squareLeft ? null : "inset 1px 0 0 rgba(0, 0, 0, 0.55)",
    squareRight ? null : "inset -1px 0 0 rgba(0, 0, 0, 0.55)",
  ].filter(Boolean).join(", ");
  const blockStyle = { ...style, ...timelineGradientStyle(gradient ?? getDefaultTimelineGradient(variant)), boxShadow: edgeShadows || undefined };

  function blockPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onPointerDown(event);
  }

  return <div data-timeline-control {...dataAttributes} role="button" tabIndex={0} className={`absolute inset-y-0 box-border cursor-default overflow-hidden rounded-[3px] px-3 py-2 text-xs ${radiusClass} ${variantClass} ${selectionClass}`} style={blockStyle} onClick={locked ? undefined : onClick} onPointerDown={blockPointerDown} onContextMenu={locked ? undefined : onContextMenu}>
    {children}
    <div className={`absolute left-0 top-0 bottom-0 w-2 ${leftResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={leftResizeEnabled && !locked ? onLeftResize : undefined}>{leftHandle}</div>
    <div className={`absolute right-0 top-0 bottom-0 w-2 ${rightResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={rightResizeEnabled && !locked ? onRightResize : undefined}>{rightHandle}</div>
  </div>;
}

function isZoomMarkerOnLayer(marker: ZoomMarker, layerId: string) {
  return marker.layerId === layerId;
}

function isAnyTranslationMarkerOnLayer(marker: TranslationMarker, layerId: string) {
  return marker.layerId === layerId;
}

function timelineEdgeIndicatorClass(side: "left" | "right", mended: boolean) {
  const position = side === "left" ? "left-0" : "right-0";
  const gradient = mended ? "bg-[linear-gradient(180deg,#46f4e6,#1bb8ac)]" : "bg-[linear-gradient(180deg,#fb72c6,#db2777)]";
  return `pointer-events-none absolute inset-y-0 ${position} w-1 ${gradient}`;
}

function isZoomMarkerMendedEdge(timeline: TimelinePart[], part: TimelinePart, marker: ZoomMarker, edge: "start" | "end") {
  const markers = timeline.flatMap((timelinePart) => timelinePart.zoomMarkers
    .filter((item) => getZoomMarkerLayerId(item) === getZoomMarkerLayerId(marker))
    .map((item) => ({ ...item, partId: timelinePart.id, start: timelinePart.start + item.start })))
    .sort((left, right) => left.start - right.start);
  const markerIndex = markers.findIndex((item) => item.partId === part.id && item.id === marker.id);
  if (markerIndex < 0) return false;

  if (edge === "start") return Boolean(markers[markerIndex - 1] && isExplicitTimelineMarkerMend(markers[markerIndex - 1], markers[markerIndex]));

  return Boolean(markers[markerIndex + 1] && isExplicitTimelineMarkerMend(markers[markerIndex], markers[markerIndex + 1]));
}

function isTranslationMarkerMendedEdge(timeline: TimelinePart[], part: TimelinePart, marker: TranslationMarker, edge: "start" | "end") {
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

function MotionLane({ hidden, locked, layerId, timeline, sceneDuration, overflowVisible, zoomSelectionDrag, zoomSelectionBoxRef, translationSelectionDrag, translationSelectionBoxRef, selectedZoomKeys, selectedZoomMarkerId, selectedZoomMarkerPartId, selectedTranslationKeys, selectedTranslationMarkerId, selectedTranslationMarkerPartId, onEffectDragOver, onEffectDrop, onStartSelection, onMoveSelection, onEndSelection, onOpenBlankContextMenu, onSelectZoomMarker, onSelectTranslationMarker, onOpenNodeContextMenu, onUpdateZoomFromPointer, onUpdateTranslationFromPointer }: { hidden: boolean; locked: boolean; layerId: string; timeline: TimelinePart[]; sceneDuration: number; overflowVisible: boolean; zoomSelectionDrag: TimelineSelectionDrag | null; zoomSelectionBoxRef: RefObject<HTMLDivElement | null>; translationSelectionDrag: TimelineSelectionDrag | null; translationSelectionBoxRef: RefObject<HTMLDivElement | null>; selectedZoomKeys: Set<string>; selectedZoomMarkerId: string | null; selectedZoomMarkerPartId: string | null; selectedTranslationKeys: Set<string>; selectedTranslationMarkerId: string | null; selectedTranslationMarkerPartId: string | null; onEffectDragOver: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop: (event: DragEvent<HTMLDivElement>) => void; onStartSelection: (event: PointerEvent<HTMLDivElement>) => void; onMoveSelection: (event: PointerEvent<HTMLDivElement>) => void; onEndSelection: (event: PointerEvent<HTMLDivElement>) => void; onOpenBlankContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onSelectZoomMarker: (partId: string, markerId: string) => void; onSelectTranslationMarker: (partId: string, markerId: string) => void; onOpenNodeContextMenu: (event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) => void; onUpdateZoomFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") => void; onUpdateTranslationFromPointer: (event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") => void }) {
  return <TimelineLayerLane hidden={hidden} locked={locked} overflowVisible={overflowVisible} className="block" onDragOver={onEffectDragOver} onDrop={onEffectDrop} onPointerDown={onStartSelection} onPointerMove={onMoveSelection} onPointerUp={onEndSelection} onPointerCancel={onEndSelection} onContextMenu={onOpenBlankContextMenu}>
    {zoomSelectionDrag ? <TimelineSelectionBox boxRef={zoomSelectionBoxRef} drag={zoomSelectionDrag} /> : null}
    {translationSelectionDrag ? <TimelineSelectionBox boxRef={translationSelectionBoxRef} drag={translationSelectionDrag} /> : null}
    {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.filter((marker) => isAnyTranslationMarkerOnLayer(marker, layerId)).map((marker) => {
      const markerKind = getTranslationMarkerLayerKind(marker);
      const effectId = marker.effectId ?? (markerKind === "rotate" ? "clipper.motion.rotate" : markerKind === "perspective" ? "clipper.motion.perspective" : "clipper.motion.pan");
      const leftMended = isTranslationMarkerMendedEdge(timeline, timelinePart, marker, "start");
      const rightMended = isTranslationMarkerMendedEdge(timeline, timelinePart, marker, "end");
      return (
        <TimelineBlock variant="translation" gradient={getEffectPackage(effectId)?.timelineGradient} squareLeft={leftMended} squareRight={rightMended} dataAttributes={{ "data-timeline-marker-kind": "motion", "data-timeline-motion-kind": "translation", "data-timeline-marker-part-id": timelinePart.id, "data-timeline-marker-id": marker.id }} locked={locked} selected={selectedTranslationKeys.has(`${timelinePart.id}:${marker.id}`) || (marker.id === selectedTranslationMarkerId && timelinePart.id === selectedTranslationMarkerPartId)} muted key={`translation-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectTranslationMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "move")} onLeftResize={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "start")} onRightResize={(event) => onUpdateTranslationFromPointer(event, timelinePart, marker, "end")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "translation", partId: timelinePart.id, markerId: marker.id })} leftHandle={marker.snapIn && !leftMended ? <span className={timelineEdgeIndicatorClass("left", false)} /> : null} rightHandle={marker.snapOut ? <span className={timelineEdgeIndicatorClass("right", rightMended)} /> : null}>
          <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">{getTranslationMarkerTimelineLabel(marker, effectId)}</span>
          {markerKind === "pan" && marker.followId ? <Link2 className="pointer-events-none absolute bottom-1 left-1 text-white/85" size={9} strokeWidth={2.5} /> : null}
        </TimelineBlock>
      );
    }))}
    {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.filter((marker) => isZoomMarkerOnLayer(marker, layerId)).map((marker) => {
      const leftMended = isZoomMarkerMendedEdge(timeline, timelinePart, marker, "start");
      const rightMended = isZoomMarkerMendedEdge(timeline, timelinePart, marker, "end");
      return <TimelineBlock variant="zoom" gradient={getEffectPackage(marker.effectId ?? "clipper.motion.zoom")?.timelineGradient} squareLeft={leftMended} squareRight={rightMended} dataAttributes={{ "data-timeline-marker-kind": "motion", "data-timeline-motion-kind": "zoom", "data-timeline-marker-part-id": timelinePart.id, "data-timeline-marker-id": marker.id }} locked={locked} selected={selectedZoomKeys.has(`${timelinePart.id}:${marker.id}`) || (marker.id === selectedZoomMarkerId && timelinePart.id === selectedZoomMarkerPartId)} key={`zoom-${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `calc(${(marker.duration / sceneDuration) * 100}% + var(--clipper-timeline-resize-width, 0px))` }} onClick={() => onSelectZoomMarker(timelinePart.id, marker.id)} onPointerDown={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "move")} onLeftResize={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "start")} onRightResize={(event) => onUpdateZoomFromPointer(event, timelinePart, marker, "end")} onContextMenu={(event) => onOpenNodeContextMenu(event, { kind: "zoom", partId: timelinePart.id, markerId: marker.id })} leftHandle={marker.snapIn && !leftMended ? <span className={timelineEdgeIndicatorClass("left", false)} /> : null} rightHandle={marker.snapOut ? <span className={timelineEdgeIndicatorClass("right", rightMended)} /> : null}>
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

export function TimeRuler({ rulerRef, ticks, sceneDuration, contentWidth, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { rulerRef: RefObject<HTMLDivElement | null>; ticks: number[]; sceneDuration: number; contentWidth: number; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp: (event: PointerEvent<HTMLDivElement>) => void; onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void }) {
  const tickMarks = useMemo(() => buildTimelineRulerMarks(sceneDuration, contentWidth, ticks), [contentWidth, sceneDuration, ticks]);
  const labelTicks = useMemo(() => ticks.filter((tick, index) => index === 0 || formatTime(tick) !== formatTime(ticks[index - 1])), [ticks]);

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
      {labelTicks.map((tick) => {
        const isStart = tick === 0;
        const isEnd = tick === sceneDuration;
        const labelAlign = isStart ? "translate-x-0 text-left" : isEnd ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
        const left = sceneDuration > 0 ? `${(tick / sceneDuration) * 100}%` : "0%";
        return <span className={`pointer-events-none absolute top-[5px] whitespace-nowrap font-semibold ${labelAlign}`} key={tick} style={{ left }}>{formatTime(tick)}</span>;
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
