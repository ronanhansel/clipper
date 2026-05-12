import {
  memo,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import {
  TIMELINE_MOTION_PART_ID,
  type AdjustmentLayerSelection,
  type CompositionSelection,
  type MotionMarkerSelection,
  type TimelineNodeContextTarget,
  type TimelineSelectionDrag,
} from "../../app/types";
import { clamp, roundToPrecision, roundTenth, roundTwo } from "../../core/math";
import {
  buildLinearTimeline,
  getAdjustmentLayerRowId,
  getAdjustmentPlacement,
  getMendedMarkerDragItems,
  getMotionMarkerLayerId,
  getScrubSnapBoundaries,
  getTimelineMarkerDragSnapBoundaries,
  getTimelinePartAtTime,
  getTimelineTicks,
  getTopTimelineItemAtTime,
  isMotionMarkerOnLayerId,
  isTimelineMarkerMendedEdge,
  timelineDisplayDuration as getTimelineDisplayDuration,
  uniqueTimelineDragItems,
  type TimelineMarkerDragItem,
  type TimelineMarkerMove,
  type TimelineMarkerResize,
} from "../../core/timeline";
import {
  getTimelineBlockTiming,
  getTimelineDragDeltaSeconds,
  getTimelineGroupMoveTiming,
  getTimelineSnapGuideTime,
  type TimelineBlockTimingResult,
} from "../../core/timelineBlockTiming";
import { defaultTimelineLayerState } from "../../core/project";
import { getDisplayNameFromPath } from "../../core/fileNames";
import {
  getEffectDragType,
  getEffectPackage,
  getEffectPackageTimelineDefaultDuration,
  getMotionEffectPackage,
  installedEffectPackages,
} from "../../core/effects/registry";
import type {
  AdjustmentEffectPackage,
  MotionEffectPackage,
  TransitionEffectPackage,
} from "../../core/effects/types";
import {
  applyTimelineBlockPreview,
  clearTimelineBlockPreview,
  computeBulkLayerTargets,
  getLayerMoveDragPreview,
  getTimelineBlockLayerPreview,
  getTimelineLayerDragPreview,
  getTimelineLayerRowAtClientY,
  getTimelineLayerRowAtClientYClamped,
  moveTimelineStateLayer,
  renameTimelineStateLayer,
  resolveTimelineMoveSourceLayer,
  toggleTimelineStateLayerHidden,
  toggleTimelineStateLayerLocked,
  type TimelineLayerCategory,
} from "../../core/timelineLayers";
import {
  getTimelineEffectForLane,
  normalizeAdjustmentTimelineMarker,
  normalizeMotionTimelineMarker,
  normalizeTransitionTimelineMarker,
  timelineEffectMarkerRange,
  type NormalizedTimelineEffectMarker,
} from "../../core/timelineEffectMarkers";
import {
  getAbsoluteTimelineMarkerResizeMarkers,
  getTimelineMarkerMoveState,
  getTimelineMarkerResizeCommits,
  getTimelineMarkerResizePreviewMap,
  getTimelineMarkerResizeState,
  uniqueAbsoluteTimelineMarkers,
  uniqueTimelineResizeTargets,
  type AbsoluteTimelineMarker,
  type TimelinePartMotionView,
} from "../../core/timelineMarkerInteraction";
import type {
  AdjustmentEffectId,
  AdjustmentLayer,
  MotionBlockEffectKind,
  MotionEffectId,
  MotionEffectKind,
  MotionMarker,
  Part,
  TimelinePart,
  TransitionLayer,
} from "../../core/types";
import { getMotionMarkerViews } from "../../core/motionEffects";
import {
  getTransitionMarkerTime,
  normalizeSymmetricTransitionLayer,
} from "../../core/transitions";
import {
  compositionDragPreviewEvent,
  compositionPointerDragEvent,
  effectDragPreviewEvent,
  effectPointerDragEvent,
  getActiveCompositionPointerDrag,
  setActiveCompositionPointerDrag,
  setClipperPointerDragPreview,
  type CompositionPointerDragDetail,
  type EffectPointerDragDetail,
} from "../../lib/pointerDrag";
import { useTimelineScrubber } from "./useTimelineScrubber";
import { TimelineShell } from "./TimelineShell";
import { MotionLane } from "./MotionLane";
import {
  EffectDragPreviewBlock,
  CompositionTimelineBlock,
  LayerLabel,
  LayerResizeSeparator,
  TimelineBlock,
  TimelineLayerLane,
  TimelineMarkerTags,
} from "./TimelinePrimitives";
import {
  TimelineSelectionBox,
  updateTimelineSelectionBoxElement,
} from "./TimelineSelectionBox";
import { useTimelineDragAutoScroll } from "./useTimelineDragAutoScroll";
import { useTimelinePointerTransaction } from "./useTimelinePointerTransaction";
import { buildDirectTimelineModel } from "./directTimelineModel";
import { useTimelineRowResize } from "./useTimelineRowResize";
import { useTimelineViewportController } from "./useTimelineViewportController";
import {
  timelineBlockPreviewKey,
  type TimelineBlockPreviewKind,
  type TimelineBlockPreviewMap,
} from "./timelineBlockPreview";
import type { EffectDragPreview, TimelinePanelProps } from "./timelineTypes";

type TimelineBlankGapSelection = {
  category: TimelineLayerCategory;
  rowKey: string;
  start: number;
  end: number;
  previewDelta?: number;
};
type TimelineGapShiftMoves =
  NonNullable<TimelinePanelProps["onShiftTimelineGapMarkers"]> extends (
    moves: infer Moves,
  ) => void
    ? Moves
    : never;
type PendingTimelineGapSlideAnimation = {
  moves: TimelineGapShiftMoves;
  fromX: number;
};

export const DirectTimelinePanel = memo(function DirectTimelinePanel({
  timelineName,
  timeline,
  motionMarkers = [],
  timelineLayers,
  adjustmentLayers,
  transitionLayers = [],
  timelineViewportState,
  mode,
  selectedPartId,
  selectedParts,
  selectedMotionMarkerPartId,
  selectedMotionMarkerId,
  selectedMotionMarkers,
  selectedAdjustmentLayerId,
  selectedAdjustmentLayers,
  selectedTransitionLayerId,
  selectedTransitionLayers = [],
  sceneDuration,
  currentSceneTime,
  isPlaying,
  playbackPlayheadRef,
  scrubbingRef,
  fastSelectEnabled,
  scrubCommitThrottleMs,
  defaultNewMarkerDurationSeconds,
  timelineEndPaddingFraction,
  timelinePrecision,
  scrubSnapEnabled,
  prerenderCacheCoverage,
  prerenderedCompositionIds,
  prerenderedCompositionRanges = [],
  onScrub,
  onScrubStart,
  onScrubEnd,
  onModeChange,
  onTimelineViewportStateChange,
  onTimelineLayersChange,
  onAddCompositionLayer,
  onRemoveCompositionLayer,
  onAddAdjustmentLayer,
  onRemoveAdjustmentLayer,
  onAddMotionLayer,
  onRemoveMotionLayer,
  onSelectPart,
  onOpenComposePart,
  onSelectMotionMarker,
  onSelectMotionMarkers,
  onSelectAdjustmentLayer,
  onSelectAdjustmentLayers,
  onSelectTransitionLayer,
  onSelectTransitionLayers,
  onSelectTimelineNodes,
  onClearTimelineSelection,
  onOpenNodeContextMenu,
  onOpenBlankContextMenu,
  onMoveAdjustmentLayer,
  onMoveAdjustmentLayers,
  onUpdateAdjustmentLayer,
  onReorderPart,
  onMoveComposition,
  onMoveCompositions,
  onUpdateComposition,
  onMoveMotionMarker,
  onMoveMotionMarkers,
  onUpdateMotionMarkers,
  onResizeMotionMarkers,
  onAddComposition,
  onOpenTimeline,
  onAddAdjustmentEffect,
  onAddMotionEffect,
  onAddTransitionEffect,
  onMoveTransitionLayer,
  onMoveTransitionLayers,
  onShiftTimelineGapMarkers,
  onUpdateTransitionLayer,
}: TimelinePanelProps) {
  const timelineDisplayDuration = getTimelineDisplayDuration(
    sceneDuration,
    timelineEndPaddingFraction,
  );
  const timelineMotionViews = useMemo<TimelinePartMotionView[]>(
    () =>
      timeline.map((timelinePart) => ({
        ...timelinePart,
        ...getMotionMarkerViews(timelinePart),
      })),
    [timeline],
  );
  const motionTimeline = useMemo<TimelinePartMotionView[]>(
    () => [
      {
        id: TIMELINE_MOTION_PART_ID,
        name: "Timeline motion",
        filePath: "",
        start: 0,
        end: timelineDisplayDuration,
        duration: timelineDisplayDuration,
        frame: { width: 1920, height: 1080, style: {} },
        background: {
          id: "timeline-motion-background",
          name: "Background",
          style: {},
          elements: [],
        },
        objects: [],
        snapshot: [],
        ...getMotionMarkerViews({ motionMarkers }),
      },
    ],
    [motionMarkers, timelineDisplayDuration],
  );
  const ticks = useMemo(
    () => getTimelineTicks(timelineDisplayDuration),
    [timelineDisplayDuration],
  );
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingTimelineBlockCategory, setDraggingTimelineBlockCategory] =
    useState<TimelineLayerCategory | null>(null);
  const [timelineSelectionDrag, setTimelineSelectionDrag] =
    useState<TimelineSelectionDrag | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [motionLayerMenuId, setMotionLayerMenuId] = useState<string | null>(
    null,
  );
  const [effectDragPreview, setEffectDragPreview] =
    useState<EffectDragPreview | null>(null);
  const [timelineDragActive, setTimelineDragActive] = useState(false);
  const [timelineFileDragActive, setTimelineFileDragActive] = useState(false);
  const [selectedTimelineGap, setSelectedTimelineGap] =
    useState<TimelineBlankGapSelection | null>(null);
  const effectDragPreviewRef = useRef<EffectDragPreview | null>(null);
  const effectDragPreviewElementRef = useRef<HTMLDivElement | null>(null);
  const effectDragPreviewFrameRef = useRef(0);
  const pendingGapSlideAnimationRef =
    useRef<PendingTimelineGapSlideAnimation | null>(null);
  const timelineSelectionDragRef = useRef<TimelineSelectionDrag | null>(null);
  const timelineSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const timelineSelectionFrameRef = useRef(0);
  const liveTimelineSelectionIdsRef = useRef("");
  const currentSceneTimeRef = useRef(currentSceneTime);
  const [, setShiftSnapActive] = useState(false);
  const provisionalContentWidth =
    timelineDisplayDuration *
    defaultTimelinePixelsPerSecond *
    timelineViewportState.zoom;
  const {
    timelineRef,
    timelineViewportRef,
    timelineLayerRailRef,
    timelineSnapGuideRef,
    timelineZoom,
    updateTimelineZoom,
    syncTimelineScrollPosition,
    saveTimelineDisplacement,
    updateTimelineSnapGuide,
    clearTimelineSnapGuide,
  } = useTimelineViewportController({
    contentWidth: provisionalContentWidth,
    currentTime: currentSceneTime,
    displayDuration: timelineDisplayDuration,
    timelineViewportState,
    onTimelineViewportStateChange,
  });
  const [timelineBlockPreviews, setTimelineBlockPreviews] =
    useState<TimelineBlockPreviewMap | null>(null);
  const timelineBlockPreviewsRef = useRef<TimelineBlockPreviewMap | null>(null);
  const selectedAdjustmentLayerIds = useMemo(
    () =>
      new Set(selectedAdjustmentLayers.map((selection) => selection.layerId)),
    [selectedAdjustmentLayers],
  );
  const selectedTransitionLayerIds = useMemo(
    () =>
      new Set(selectedTransitionLayers.map((selection) => selection.layerId)),
    [selectedTransitionLayers],
  );
  const selectedPartIds = useMemo(
    () => new Set(selectedParts.map((selection) => selection.partId)),
    [selectedParts],
  );
  const selectedMotionKeys = useMemo(
    () =>
      new Set(
        selectedMotionMarkers.map(
          (selection) => `${selection.partId}:${selection.markerId}`,
        ),
      ),
    [selectedMotionMarkers],
  );
  const scrubSnapBoundaries = useMemo(
    () =>
      getScrubSnapBoundaries(
        [...timelineMotionViews, ...motionTimeline],
        adjustmentLayers,
        transitionLayers,
      ),
    [adjustmentLayers, motionTimeline, timelineMotionViews, transitionLayers],
  );
  const contentWidth =
    timelineDisplayDuration * defaultTimelinePixelsPerSecond * timelineZoom;
  const [resizePreviewRowHeights, setResizePreviewRowHeights] = useState<Record<
    string,
    number
  > | null>(null);
  const rowHeights = resizePreviewRowHeights ?? timelineLayers.rowHeights ?? {};
  const {
    adjustmentRows,
    compositionRows,
    transitionRows,
    isCompositionMode,
    laneContentHeight,
    laneRowsStyle,
    layerLayout,
    layerRows,
    layerRowHeights,
    layerRowStarts,
    motionLayers,
    timelineMarkersEditable,
  } = buildDirectTimelineModel({ mode, rowHeights, timelineLayers });
  const layerRailWidth = 260;
  const isDraggingAdjustmentLayer = draggingTimelineBlockCategory === "adjust";
  const isDraggingTransitionLayer =
    draggingTimelineBlockCategory === "transition";
  const isDraggingMotionMarker = draggingTimelineBlockCategory === "motion";
  const isDraggingCompositionBlock = draggingTimelineBlockCategory === "comp";

  useEffect(
    () => () => {
      if (timelineSelectionFrameRef.current)
        window.cancelAnimationFrame(timelineSelectionFrameRef.current);
      if (effectDragPreviewFrameRef.current)
        window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
      clearTimelineSnapGuide();
      setGlobalTimelineDragActive(false);
      setTimelineFileDragActive(false);
    },
    [],
  );

  function setGlobalTimelineDragActive(active: boolean) {
    setTimelineDragActive(active);
  }

  /**
   * Returns the bounding rect of the timeline content area (below the 38px ruler).
   * Layer row start/heights are relative to this rect, so all Y-based row
   * hit-testing, marquee selection, and drop-target calculations MUST use this
   * rect rather than the viewport's first child (which includes the ruler).
   */
  function getTimelineContentRect(): DOMRect | null {
    const content = timelineViewportRef.current?.querySelector<HTMLElement>(
      "[data-timeline-content]",
    );
    return content?.getBoundingClientRect() ?? null;
  }

  /**
   * Returns a timeline container rect safe for layer coordinate calculations.
   * Falls back to viewport first child for robustness (e.g. if content element
   * hasn't mounted yet).
   */
  function getTimelineLayerContainerRect(): DOMRect | undefined {
    return (
      getTimelineContentRect() ??
      timelineViewportRef.current?.firstElementChild?.getBoundingClientRect()
    );
  }

  function withPlayheadSnapBoundary(boundaries: number[]) {
    return Array.from(
      new Set([...boundaries, currentSceneTimeRef.current]),
    ).sort((left, right) => left - right);
  }

  currentSceneTimeRef.current = currentSceneTime;

  function selectTimelineItemAtTime(time: number) {
    if (!isCompositionMode) {
      const part = getTimelinePartAtTime(
        timeline,
        time > 0 ? time - 0.000001 : time,
      );
      if (part && !isCompositionLocked(part)) onSelectPart(part.id);
      return;
    }

    const item =
      getTopTimelineItemAtTime(
        motionTimeline,
        time,
        adjustmentLayers,
        motionLayers,
        adjustmentRows.map((row) => row.key),
        transitionLayers,
      ) ??
      getTopTimelineItemAtTime(
        timeline,
        time,
        adjustmentLayers,
        [],
        adjustmentRows.map((row) => row.key),
        transitionLayers,
      );
    if (!item) return;
    if (item.kind === "adjustment") {
      if (isAdjustmentLocked(item.layer)) return;
      onSelectAdjustmentLayer(item.layer.id);
      return;
    }
    if (item.kind === "transition") {
      if (isTransitionLocked(item.layer)) return;
      onSelectTransitionLayer?.(item.layer.id);
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

  const {
    getTimelineEdgeScrollDelta,
    startScrub,
    continueScrub,
    endScrub,
    timeFromClientX,
  } = useTimelineScrubber({
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
    onRulerScroll: syncTimelineScrollPosition,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onSelectTime: selectTimelineItemAtTime,
    onShiftSnapActiveChange: setShiftSnapActive,
  });

  const { updateTimelineDragAutoScroll, stopTimelineDragAutoScroll } =
    useTimelineDragAutoScroll({
      viewportRef: timelineViewportRef,
      getTimelineEdgeScrollDelta,
      onRulerScroll: syncTimelineScrollPosition,
      onScrollPersist: saveTimelineDisplacement,
    });
  const { startTimelinePointerTransaction } = useTimelinePointerTransaction();

  function blurInspectorFocus() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (!activeElement.closest("[data-inspector-panel]")) return;
    activeElement.blur();
  }

  function getTimelineSelectionContentX(
    selectionDrag: TimelineSelectionDrag,
    edge: "start" | "current",
    rect: DOMRect,
  ) {
    if (edge === "start")
      return selectionDrag.startContentX ?? selectionDrag.startX - rect.left;
    return selectionDrag.currentContentX ?? selectionDrag.currentX - rect.left;
  }

  function getTimelineSelectionContentY(
    selectionDrag: TimelineSelectionDrag,
    edge: "start" | "current",
    rect: DOMRect,
  ) {
    if (edge === "start")
      return (
        selectionDrag.startContentY ??
        (selectionDrag.startY ?? rect.top) - rect.top
      );
    return (
      selectionDrag.currentContentY ??
      (selectionDrag.currentY ?? rect.top) - rect.top
    );
  }

  function refreshTimelineSelectionContentPosition(
    selectionDrag: TimelineSelectionDrag,
    rect: DOMRect,
  ) {
    selectionDrag.currentContentX = selectionDrag.currentX - rect.left;
    if (selectionDrag.currentY !== undefined)
      selectionDrag.currentContentY = selectionDrag.currentY - rect.top;
  }

  function startTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    const gap = getTimelineBlankGapAtPointer(event);
    if (gap) {
      startTimelineGapRipple(event, gap);
      return;
    }
    setSelectedTimelineGap(null);

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect =
      getTimelineLayerContainerRect() ??
      event.currentTarget.getBoundingClientRect();
    const startContentX = event.clientX - rect.left;
    const startContentY = event.clientY - rect.top;
    const next = {
      startX: event.clientX,
      currentX: event.clientX,
      startY: event.clientY,
      currentY: event.clientY,
      startContentX,
      currentContentX: startContentX,
      startContentY,
      currentContentY: startContentY,
    };
    timelineSelectionDragRef.current = next;
    liveTimelineSelectionIdsRef.current = "";
    setTimelineSelectionDrag(next);
  }

  function openBlankTimelineContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    compositionLayerId?: string,
  ) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;
    onOpenBlankContextMenu(event, {
      time: timeFromClientX(event.clientX, false),
      compositionLayerId,
    });
  }

  function openTimelineNodeContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    target: TimelineNodeContextTarget,
  ) {
    onOpenNodeContextMenu(event, {
      ...target,
      time: timeFromClientX(event.clientX, false),
    });
  }

  function timelineSelectionFromDrag(
    selectionDrag: TimelineSelectionDrag,
    rect: DOMRect,
  ) {
    const start = clamp(
      (Math.min(
        getTimelineSelectionContentX(selectionDrag, "start", rect),
        getTimelineSelectionContentX(selectionDrag, "current", rect),
      ) /
        rect.width) *
        timelineDisplayDuration,
      0,
      timelineDisplayDuration,
    );
    const end = clamp(
      (Math.max(
        getTimelineSelectionContentX(selectionDrag, "start", rect),
        getTimelineSelectionContentX(selectionDrag, "current", rect),
      ) /
        rect.width) *
        timelineDisplayDuration,
      0,
      timelineDisplayDuration,
    );
    const dragTop = clamp(
      Math.min(
        getTimelineSelectionContentY(selectionDrag, "start", rect),
        getTimelineSelectionContentY(selectionDrag, "current", rect),
      ),
      0,
      rect.height,
    );
    const dragBottom = clamp(
      Math.max(
        getTimelineSelectionContentY(selectionDrag, "start", rect),
        getTimelineSelectionContentY(selectionDrag, "current", rect),
      ),
      0,
      rect.height,
    );
    const adjustmentSelection: AdjustmentLayerSelection[] = [];
    const compositionSelection: CompositionSelection[] = [];
    const motionSelection: MotionMarkerSelection[] = [];
    const transitionSelection: Array<{ layerId: string }> = [];

    for (const [rowIndex, row] of layerRows.entries()) {
      const rowTop = layerRowStarts[rowIndex];
      const rowBottom = rowTop + layerRowHeights[rowIndex];
      if (rowBottom < dragTop || rowTop > dragBottom) continue;
      if (isLayerLocked(row.category, row.key)) continue;

      const transitionRow = transitionRows.find((item) => item.key === row.key);
      if (transitionRow) {
        transitionSelection.push(
          ...transitionLayers
            .filter(
              (layer) =>
                (layer.layerId ?? layer.effect.effectId) === transitionRow.key,
            )
            .filter(
              (layer) =>
                layer.start <= end && layer.start + layer.duration >= start,
            )
            .map((layer) => ({ layerId: layer.id })),
        );
        continue;
      }

      const adjustmentRow = adjustmentRows.find((item) => item.key === row.key);
      if (adjustmentRow) {
        adjustmentSelection.push(
          ...adjustmentLayers
            .filter(
              (layer) => getAdjustmentLayerRowId(layer) === adjustmentRow.key,
            )
            .filter(
              (layer) =>
                layer.start <= end && layer.start + layer.duration >= start,
            )
            .map((layer) => ({ layerId: layer.id })),
        );
        continue;
      }

      const compositionRow = compositionRows.find(
        (item) => item.id === row.key,
      );
      if (compositionRow) {
        compositionSelection.push(
          ...timeline
            .filter((part) => (part.layerId ?? "comp") === compositionRow.id)
            .filter(
              (part) =>
                part.start <= end && part.start + part.duration >= start,
            )
            .map((part) => ({ partId: part.id })),
        );
        continue;
      }

      const layer = motionLayers.find((item) => item.id === row.key);
      if (!layer) continue;

      motionSelection.push(
        ...motionTimeline.flatMap((timelinePart) =>
          timelinePart.motionMarkers
            .filter((marker) => isMotionMarkerOnLayerId(marker, layer.id))
            .filter(
              (marker) =>
                timelinePart.start + marker.start <= end &&
                timelinePart.start + marker.start + marker.duration >= start,
            )
            .map((marker) => ({
              partId: timelinePart.id,
              markerId: marker.id,
            })),
        ),
      );
    }

    return {
      adjustmentLayers: adjustmentSelection,
      compositions: compositionSelection,
      motionMarkers: motionSelection,
      transitionLayers: transitionSelection,
    };
  }

  function timelineSelectionKey(selection: {
    adjustmentLayers: AdjustmentLayerSelection[];
    compositions: CompositionSelection[];
    motionMarkers: MotionMarkerSelection[];
    transitionLayers: Array<{ layerId: string }>;
  }) {
    return [
      selection.adjustmentLayers.map((item) => item.layerId).join(","),
      selection.compositions.map((item) => item.partId).join(","),
      selection.motionMarkers
        .map((item) => `${item.partId}:${item.markerId}`)
        .join(","),
      selection.transitionLayers.map((item) => item.layerId).join(","),
    ].join("|");
  }

  function getTimelineBlankGapAtPointer(
    event: PointerEvent<HTMLDivElement>,
  ): TimelineBlankGapSelection | null {
    const rect = getTimelineLayerContainerRect();
    if (!rect || timelineDisplayDuration <= 0) return null;
    const row = getTimelineLayerRowAtClientY(layerLayout, rect, event.clientY);
    if (!row || isLayerLocked(row.row.category, row.row.key)) return null;
    const time = clamp(
      ((event.clientX - rect.left) / rect.width) * timelineDisplayDuration,
      0,
      timelineDisplayDuration,
    );
    const markers = getTimelineRowMarkerRanges(
      row.row.category,
      row.row.key,
    ).sort((left, right) => left.start - right.start || left.end - right.end);
    let previousEnd: number | null = null;
    for (const marker of markers) {
      if (previousEnd !== null && time > previousEnd && time < marker.start)
        return {
          category: row.row.category,
          rowKey: row.row.key,
          start: previousEnd,
          end: marker.start,
        };
      previousEnd =
        previousEnd === null ? marker.end : Math.max(previousEnd, marker.end);
    }
    return null;
  }

  function getTimelineRowMarkerRanges(
    category: TimelineLayerCategory,
    rowKey: string,
  ) {
    if (category !== "comp")
      return getNormalizedTimelineEffectMarkers()
        .filter(
          (marker) =>
            marker.laneCategory === category && marker.rowKey === rowKey,
        )
        .map(timelineEffectMarkerRange);
    return timeline
      .filter((part) => (part.layerId ?? "comp") === rowKey)
      .map((part) => ({ start: part.start, end: part.start + part.duration }));
  }

  function getNormalizedTimelineEffectMarkers(): NormalizedTimelineEffectMarker[] {
    return [
      ...transitionLayers.map(normalizeTransitionTimelineMarker),
      ...adjustmentLayers.map(normalizeAdjustmentTimelineMarker),
      ...motionTimeline.flatMap((timelinePart) =>
        timelinePart.motionMarkers.map((marker) =>
          normalizeMotionTimelineMarker(timelinePart, marker),
        ),
      ),
    ];
  }

  function startTimelineGapRipple(
    event: PointerEvent<HTMLDivElement>,
    gap: TimelineBlankGapSelection,
  ) {
    event.preventDefault();
    setSelectedTimelineGap(gap);
    const initialClientX = event.clientX;
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);

    function getGapDelta(clientX: number) {
      const rawDelta = getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft:
          timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
      return roundToPrecision(
        clamp(rawDelta, gap.start - gap.end, 0),
        timelinePrecision,
      );
    }

    function previewGap(clientX: number) {
      const delta = getGapDelta(clientX);
      setSelectedTimelineGap({ ...gap, previewDelta: delta });
      previewTimelineBlocks(getTimelineGapShiftPreviewMap(gap, delta));
    }

    function clearGapDragState() {
      setGlobalTimelineDragActive(false);
      clearTimelineBlockPreviews();
      clearTimelineSnapGuide();
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => setGlobalTimelineDragActive(true),
      onPreview: ({ clientX }) => previewGap(clientX),
      onCommit: ({ clientX }) => {
        const delta = getGapDelta(clientX);
        clearGapDragState();
        if (delta >= 0) return;
        const moves = getTimelineGapShiftMoves(gap, delta);
        if (
          moves.compositions.length ||
          moves.adjustmentLayers.length ||
          moves.motionMarkers.length ||
          moves.transitionLayers.length
        ) {
          queueTimelineGapSlideAnimation(moves, delta);
          onShiftTimelineGapMarkers?.(moves);
        }
        const nextEnd = roundToPrecision(gap.end + delta, timelinePrecision);
        setSelectedTimelineGap(
          nextEnd > gap.start ? { ...gap, end: nextEnd } : null,
        );
      },
      onCancel: clearGapDragState,
      onDragEnd: clearGapDragState,
    });
  }

  function getTimelineGapShiftMoves(
    gap: Pick<TimelineBlankGapSelection, "start" | "end">,
    delta: number,
  ): TimelineGapShiftMoves {
    const startsAfterGap = (start: number) => start >= gap.end - 0.000001;
    const nextStart = (start: number) =>
      roundToPrecision(Math.max(0, start + delta), timelinePrecision);
    return {
      gapStart: gap.start,
      gapEnd: gap.end,
      delta,
      compositions: timeline
        .filter(
          (part) => startsAfterGap(part.start) && !isCompositionLocked(part),
        )
        .map((part) => ({
          compositionId: part.id,
          start: nextStart(part.start),
        })),
      adjustmentLayers: adjustmentLayers
        .filter(
          (layer) => startsAfterGap(layer.start) && !isAdjustmentLocked(layer),
        )
        .map((layer) => ({ layerId: layer.id, start: nextStart(layer.start) })),
      motionMarkers: motionTimeline.flatMap((timelinePart) =>
        timelinePart.motionMarkers
          .filter(
            (marker) =>
              startsAfterGap(timelinePart.start + marker.start) &&
              !isMotionMarkerLocked(marker),
          )
          .map((marker) => ({
            markerId: marker.id,
            start: nextStart(timelinePart.start + marker.start),
          })),
      ),
      transitionLayers: transitionLayers
        .filter(
          (layer) => startsAfterGap(layer.start) && !isTransitionLocked(layer),
        )
        .map((layer) => ({ layerId: layer.id, start: nextStart(layer.start) })),
    };
  }

  function getTimelineGapShiftPreviewMap(
    gap: TimelineBlankGapSelection,
    delta: number,
  ): TimelineBlockPreviewMap {
    const moves = getTimelineGapShiftMoves(gap, delta);
    return {
      ...Object.fromEntries(
        moves.compositions.map((move) => {
          const part = timeline.find((item) => item.id === move.compositionId)!;
          return [
            timelineBlockPreviewKey("composition", part.id),
            { start: move.start, duration: part.duration },
          ];
        }),
      ),
      ...Object.fromEntries(
        moves.adjustmentLayers.map((move) => {
          const layer = adjustmentLayers.find(
            (item) => item.id === move.layerId,
          )!;
          return [
            timelineBlockPreviewKey("adjustment", layer.id),
            { start: move.start, duration: layer.duration },
          ];
        }),
      ),
      ...Object.fromEntries(
        moves.motionMarkers.map((move) => {
          const marker = motionTimeline
            .flatMap((timelinePart) =>
              timelinePart.motionMarkers.map((item) => ({
                timelinePart,
                marker: item,
              })),
            )
            .find((item) => item.marker.id === move.markerId)!;
          return [
            timelineBlockPreviewKey(
              "motion",
              marker.timelinePart.id,
              marker.marker.id,
            ),
            {
              start: move.start - marker.timelinePart.start,
              duration: marker.marker.duration,
            },
          ];
        }),
      ),
      ...Object.fromEntries(
        moves.transitionLayers.map((move) => {
          const layer = transitionLayers.find(
            (item) => item.id === move.layerId,
          )!;
          return [
            timelineBlockPreviewKey("transition", layer.id),
            {
              start: move.start,
              duration: layer.duration,
              midPoint: layer.midPoint,
            },
          ];
        }),
      ),
    };
  }

  function closeSelectedTimelineGap(gap: TimelineBlankGapSelection) {
    const delta = roundToPrecision(gap.start - gap.end, timelinePrecision);
    if (delta >= 0) return false;
    const moves = getTimelineGapShiftMoves(gap, delta);
    if (
      !(
        moves.compositions.length ||
        moves.adjustmentLayers.length ||
        moves.motionMarkers.length ||
        moves.transitionLayers.length
      )
    )
      return false;
    clearTimelineBlockPreviews();
    queueTimelineGapSlideAnimation(moves, delta);
    onShiftTimelineGapMarkers?.(moves);
    setSelectedTimelineGap(null);
    return true;
  }

  function queueTimelineGapSlideAnimation(
    moves: TimelineGapShiftMoves,
    delta: number,
  ) {
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    pendingGapSlideAnimationRef.current = {
      moves,
      fromX: -delta * pixelsPerSecond,
    };
  }

  function getTimelineCompositionElement(partId: string) {
    return (
      timelineViewportRef.current?.querySelector<HTMLElement>(
        `[data-timeline-composition-id="${CSS.escape(partId)}"]`,
      ) ?? null
    );
  }

  function runPendingTimelineGapSlideAnimation() {
    const pending = pendingGapSlideAnimationRef.current;
    if (!pending) return;
    pendingGapSlideAnimationRef.current = null;
    const elements = [
      ...pending.moves.compositions.map((move) =>
        getTimelineCompositionElement(move.compositionId),
      ),
      ...pending.moves.adjustmentLayers.map((move) =>
        getTimelineAdjustmentElement(move.layerId),
      ),
      ...pending.moves.motionMarkers.map((move) =>
        getTimelineMarkerElement(TIMELINE_MOTION_PART_ID, move.markerId),
      ),
      ...pending.moves.transitionLayers.map((move) =>
        getTimelineTransitionElement(move.layerId),
      ),
    ].filter((element): element is HTMLElement => Boolean(element));

    for (const element of elements) {
      element.animate(
        [
          { transform: `translate3d(${pending.fromX}px, 0, 0)`, offset: 0 },
          { transform: "translate3d(0, 0, 0)", offset: 1 },
        ],
        { duration: 190, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
  }

  useEffect(() => {
    if (mode === "compose") return;
    if (!selectedTimelineGap) return;
    const selectedGap: TimelineBlankGapSelection = selectedTimelineGap;

    function closeGapFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      const editable = target?.closest(
        "input, textarea, select, [contenteditable='true']",
      ) as HTMLElement | null;
      if (
        editable &&
        !(editable instanceof HTMLInputElement && editable.type === "range")
      )
        return;
      if (!closeSelectedTimelineGap(selectedGap)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", closeGapFromKeyboard);
    return () => window.removeEventListener("keydown", closeGapFromKeyboard);
  }, [
    selectedTimelineGap,
    mode,
    timeline,
    adjustmentLayers,
    motionTimeline,
    transitionLayers,
    timelinePrecision,
  ]);

  useLayoutEffect(() => {
    runPendingTimelineGapSlideAnimation();
  }, [timeline, adjustmentLayers, motionTimeline, transitionLayers]);

  function scheduleTimelineSelectionUpdate() {
    if (timelineSelectionFrameRef.current) return;
    timelineSelectionFrameRef.current = window.requestAnimationFrame(() => {
      timelineSelectionFrameRef.current = 0;
      const drag = timelineSelectionDragRef.current;
      const rect = getTimelineLayerContainerRect();
      if (!drag || !rect) return;
      refreshTimelineSelectionContentPosition(drag, rect);
      if (timelineSelectionBoxRef.current)
        updateTimelineSelectionBoxElement(
          timelineSelectionBoxRef.current,
          drag,
          rect,
        );
      if (
        Math.max(
          Math.abs(
            getTimelineSelectionContentX(drag, "current", rect) -
              getTimelineSelectionContentX(drag, "start", rect),
          ),
          Math.abs(
            getTimelineSelectionContentY(drag, "current", rect) -
              getTimelineSelectionContentY(drag, "start", rect),
          ),
        ) < 4
      )
        return;
      const selection = timelineSelectionFromDrag(drag, rect);
      const nextSelectionIds = timelineSelectionKey(selection);
      if (nextSelectionIds === liveTimelineSelectionIdsRef.current) return;
      liveTimelineSelectionIdsRef.current = nextSelectionIds;
      if (nextSelectionIds !== "|||")
        startTransition(() => onSelectTimelineNodes(selection));
    });
  }

  function continueTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const current = timelineSelectionDragRef.current;
    if (!current) return;
    const next = {
      ...current,
      currentX: event.clientX,
      currentY: event.clientY,
    };
    timelineSelectionDragRef.current = next;
    scheduleTimelineSelectionUpdate();
    updateTimelineDragAutoScroll(
      event.clientX,
      scheduleTimelineSelectionUpdate,
      event.clientY,
    );
  }

  function endTimelineSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (timelineSelectionFrameRef.current) {
      window.cancelAnimationFrame(timelineSelectionFrameRef.current);
      timelineSelectionFrameRef.current = 0;
    }
    const selectionDrag = timelineSelectionDragRef.current;
    timelineSelectionDragRef.current = null;
    liveTimelineSelectionIdsRef.current = "";
    if (timelineSelectionBoxRef.current)
      timelineSelectionBoxRef.current.style.display = "none";
    setTimelineSelectionDrag(null);
    stopTimelineDragAutoScroll();
    if (!selectionDrag) return;

    const rect = getTimelineLayerContainerRect();
    if (rect) refreshTimelineSelectionContentPosition(selectionDrag, rect);
    const dragDistance = rect
      ? Math.max(
          Math.abs(
            getTimelineSelectionContentX(selectionDrag, "current", rect) -
              getTimelineSelectionContentX(selectionDrag, "start", rect),
          ),
          Math.abs(
            getTimelineSelectionContentY(selectionDrag, "current", rect) -
              getTimelineSelectionContentY(selectionDrag, "start", rect),
          ),
        )
      : 0;
    if (!rect || dragDistance < 4) {
      onClearTimelineSelection();
      return;
    }

    const selection = timelineSelectionFromDrag(selectionDrag, rect);
    if (timelineSelectionKey(selection) !== "|||")
      onSelectTimelineNodes(selection);
    else onClearTimelineSelection();
  }

  function onPartDragStart(
    event: DragEvent<HTMLButtonElement>,
    partId: string,
  ) {
    setDraggedPartId(partId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", partId);
  }

  function onPartDrop(
    event: DragEvent<HTMLButtonElement>,
    targetPartId: string,
  ) {
    event.preventDefault();
    const compositionId = event.dataTransfer.getData(
      "application/x-clipper-composition",
    );
    if (compositionId) {
      onAddComposition(compositionId);
      setDraggedPartId(null);
      return;
    }

    const sourcePartId =
      draggedPartId ?? event.dataTransfer.getData("text/plain");
    if (sourcePartId) onReorderPart(sourcePartId, targetPartId);
    setDraggedPartId(null);
  }

  function selectedMotionDragItems(part: TimelinePart, marker: MotionMarker) {
    const motionKind = marker.kind;
    if (isMotionMarkerLocked(marker)) return [];
    const mendedItems = getMendedMarkerDragItems(
      motionTimeline,
      part,
      marker.id,
      motionKind,
    );
    if (!selectedMotionKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedMotionMarkers.flatMap((selection) => {
      const selectedPart = motionTimeline.find(
        (item) => item.id === selection.partId,
      );
      const selectedMarker = selectedPart?.motionMarkers.find(
        (item) => item.id === selection.markerId,
      );
      return selectedPart &&
        selectedMarker &&
        !isMotionMarkerLocked(selectedMarker)
        ? getMendedMarkerDragItems(
            motionTimeline,
            selectedPart,
            selectedMarker.id,
            selectedMarker.kind,
          )
        : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedMotionResizeTargets(
    part: TimelinePart,
    marker: MotionMarker,
  ) {
    if (isMotionMarkerLocked(marker)) return [];
    if (!selectedMotionKeys.has(`${part.id}:${marker.id}`))
      return [{ part, marker }];
    const targets = selectedMotionMarkers.flatMap((selection) => {
      const target = getMotionSelectionTarget(selection);
      return target ? [target] : [];
    });
    return targets.length > 0
      ? uniqueTimelineResizeTargets(targets)
      : [{ part, marker }];
  }

  function getMotionSelectionTarget(selection: MotionMarkerSelection) {
    const selectedPart = [...timelineMotionViews, ...motionTimeline].find(
      (item) => item.id === selection.partId,
    );
    const selectedMarker = selectedPart?.motionMarkers.find(
      (item) => item.id === selection.markerId,
    );
    return selectedPart &&
      selectedMarker &&
      !isMotionMarkerLocked(selectedMarker)
      ? { part: selectedPart, marker: selectedMarker }
      : null;
  }

  function selectedAdjustmentResizeTargets(layer: AdjustmentLayer) {
    if (isAdjustmentLocked(layer)) return [];
    if (!selectedAdjustmentLayerIds.has(layer.id)) return [layer];
    const targets = selectedAdjustmentLayers.flatMap((selection) => {
      const target = adjustmentLayers.find(
        (item) => item.id === selection.layerId,
      );
      return target && !isAdjustmentLocked(target) ? [target] : [];
    });
    return targets.length > 0
      ? uniqueAdjustmentResizeTargets(targets)
      : [layer];
  }

  function selectedCompositionMoveTargets(composition: TimelinePart) {
    if (isCompositionLocked(composition)) return [];
    if (!selectedPartIds.has(composition.id)) return [composition];
    const targets = selectedParts.flatMap((selection) => {
      const target = timeline.find((item) => item.id === selection.partId);
      return target && !isCompositionLocked(target) ? [target] : [];
    });
    return targets.length > 0
      ? uniqueCompositionTargets(targets)
      : [composition];
  }

  type MixedTimelineMoveItem = {
    id: string;
    kind: "composition" | "adjustment" | "transition" | "motion";
    start: number;
    duration: number;
    layerId: string;
    partId?: string;
    markerId?: string;
  };

  function getSelectedMixedTimelineMoveItems() {
    const items: MixedTimelineMoveItem[] = [];
    for (const selection of selectedParts) {
      const part = timeline.find((item) => item.id === selection.partId);
      if (part && !isCompositionLocked(part))
        items.push({
          id: part.id,
          kind: "composition",
          start: part.start,
          duration: part.duration,
          layerId: part.layerId ?? "comp",
        });
    }
    for (const selection of selectedAdjustmentLayers) {
      const layer = adjustmentLayers.find(
        (item) => item.id === selection.layerId,
      );
      if (layer && !isAdjustmentLocked(layer))
        items.push({
          id: layer.id,
          kind: "adjustment",
          start: layer.start,
          duration: layer.duration,
          layerId: getAdjustmentLayerRowId(layer),
        });
    }
    for (const selection of selectedTransitionLayers) {
      const layer = transitionLayers.find(
        (item) => item.id === selection.layerId,
      );
      if (layer && !isTransitionLocked(layer))
        items.push({
          id: layer.id,
          kind: "transition",
          start: layer.start,
          duration: layer.duration,
          layerId: layer.layerId ?? layer.effect.effectId,
        });
    }
    for (const selection of selectedMotionMarkers) {
      const target = getMotionSelectionTarget(selection);
      if (target)
        items.push({
          id: `${target.part.id}:${target.marker.id}`,
          kind: "motion",
          partId: target.part.id,
          markerId: target.marker.id,
          start: target.part.start + target.marker.start,
          duration: target.marker.duration,
          layerId: getMotionMarkerLayerId(target.marker),
        });
    }
    return items;
  }

  function selectedMixedTimelineMoveItems(
    kind: MixedTimelineMoveItem["kind"],
    id: string,
  ) {
    const items = getSelectedMixedTimelineMoveItems();
    if (
      items.length <= 1 ||
      !items.some((item) => item.kind === kind && item.id === id)
    )
      return [];
    return items;
  }

  function uniqueAdjustmentResizeTargets(targets: AdjustmentLayer[]) {
    const seen = new Set<string>();
    return targets.filter((target) => {
      if (seen.has(target.id)) return false;
      seen.add(target.id);
      return true;
    });
  }

  type MixedTimelineResizeItem =
    | { kind: "composition"; part: TimelinePart }
    | { kind: "adjustment"; layer: AdjustmentLayer }
    | { kind: "transition"; layer: TransitionLayer }
    | { kind: "motion"; part: TimelinePart; marker: MotionMarker };

  function getSelectedMixedTimelineResizeItems(): MixedTimelineResizeItem[] {
    const items: MixedTimelineResizeItem[] = [];
    for (const selection of selectedParts) {
      const part = timeline.find((item) => item.id === selection.partId);
      if (part && !isCompositionLocked(part))
        items.push({ kind: "composition", part });
    }
    for (const selection of selectedAdjustmentLayers) {
      const layer = adjustmentLayers.find(
        (item) => item.id === selection.layerId,
      );
      if (layer && !isAdjustmentLocked(layer))
        items.push({ kind: "adjustment", layer });
    }
    for (const selection of selectedTransitionLayers) {
      const layer = transitionLayers.find(
        (item) => item.id === selection.layerId,
      );
      if (layer && !isTransitionLocked(layer))
        items.push({ kind: "transition", layer });
    }
    for (const selection of selectedMotionMarkers) {
      const target = getMotionSelectionTarget(selection);
      if (target) items.push({ kind: "motion", ...target });
    }
    return items;
  }

  function startMixedTimelineResize(
    event: PointerEvent<HTMLElement>,
    action: "start" | "end",
    anchorComposition?: TimelinePart,
    anchorAdjustment?: AdjustmentLayer,
    anchorTransition?: TransitionLayer,
    anchorMotion?: { part: TimelinePart; marker: MotionMarker },
  ) {
    const resizeItems = getSelectedMixedTimelineResizeItems();
    const comps = resizeItems.filter(
      (item): item is { kind: "composition"; part: TimelinePart } =>
        item.kind === "composition",
    );
    const motions = resizeItems.filter(
      (
        item,
      ): item is { kind: "motion"; part: TimelinePart; marker: MotionMarker } =>
        item.kind === "motion",
    );
    const adjustments = resizeItems.filter(
      (item): item is { kind: "adjustment"; layer: AdjustmentLayer } =>
        item.kind === "adjustment",
    );
    const transitions = resizeItems.filter(
      (item): item is { kind: "transition"; layer: TransitionLayer } =>
        item.kind === "transition",
    );
    const selectedKindCount = [comps, adjustments, transitions, motions].filter(
      (items) => items.length > 0,
    ).length;
    if (selectedKindCount < 2) return;

    const anchorInComps = Boolean(
      anchorComposition &&
      comps.some((c) => c.part.id === anchorComposition.id),
    );
    const anchorInMotions = Boolean(
      anchorMotion &&
      motions.some(
        (m) =>
          m.part.id === anchorMotion.part.id &&
          m.marker.id === anchorMotion.marker.id,
      ),
    );
    const anchorInAdjustments = Boolean(
      anchorAdjustment &&
      adjustments.some((item) => item.layer.id === anchorAdjustment.id),
    );
    const anchorInTransitions = Boolean(
      anchorTransition &&
      transitions.some((item) => item.layer.id === anchorTransition.id),
    );
    if (
      !anchorInComps &&
      !anchorInAdjustments &&
      !anchorInTransitions &&
      !anchorInMotions
    )
      return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedTimelineGap(null);

    const initialClientX = event.clientX;
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const compIds = new Set(comps.map((c) => c.part.id));
    const adjustmentIds = new Set(adjustments.map((item) => item.layer.id));
    const transitionIds = new Set(transitions.map((item) => item.layer.id));
    const boundaries = getUniversalBlockSnapBoundaries({
      excludeCompositionIds: compIds,
      excludeAdjustmentIds: adjustmentIds,
      excludeTransitionIds: transitionIds,
    });

    const anchorStart = anchorComposition
      ? anchorComposition.start
      : anchorAdjustment
        ? anchorAdjustment.start
        : anchorTransition
          ? anchorTransition.start
          : anchorMotion
            ? anchorMotion.part.start + anchorMotion.marker.start
            : 0;
    const anchorDuration = anchorComposition
      ? anchorComposition.duration
      : anchorAdjustment
        ? anchorAdjustment.duration
        : anchorTransition
          ? anchorTransition.duration
          : anchorMotion
            ? anchorMotion.marker.duration
            : 0;

    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft:
          timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function buildNextComps(effectiveDelta: number): TimelinePart[] {
      return comps.map(({ part: comp }) => {
        const timing = getTimelineBlockTiming({
          action,
          initialStart: comp.start,
          initialDuration: comp.duration,
          deltaSeconds: effectiveDelta,
          timelineDuration: timelineDisplayDuration,
          minDuration: 0.1,
          moveMaxStartMode: "start",
          endMaxMode: "none",
          snap: false,
          snapBoundaries: [],
          snapThresholdSeconds: 0,
          precision: timelinePrecision,
        });
        if (action !== "start")
          return { ...comp, start: timing.start, duration: timing.duration };
        const previousTrimStart = comp.trimStart ?? 0;
        const trimStart = roundToPrecision(
          Math.max(previousTrimStart + timing.start - comp.start, 0),
          timelinePrecision,
        );
        const start = roundToPrecision(
          comp.start + trimStart - previousTrimStart,
          timelinePrecision,
        );
        return {
          ...comp,
          start,
          duration: roundToPrecision(
            comp.start + comp.duration - start,
            timelinePrecision,
          ),
          trimStart: trimStart || undefined,
        };
      });
    }

    function buildNextAdjustments(effectiveDelta: number): AdjustmentLayer[] {
      return adjustments.map(({ layer }) => {
        const timing = getTimelineBlockTiming({
          action,
          initialStart: layer.start,
          initialDuration: layer.duration,
          deltaSeconds: effectiveDelta,
          timelineDuration: timelineDisplayDuration,
          minDuration: 0.1,
          moveMaxStartMode: "start",
          endMaxMode: "none",
          snap: false,
          snapBoundaries: [],
          snapThresholdSeconds: 0,
          precision: timelinePrecision,
        });
        return { ...layer, start: timing.start, duration: timing.duration };
      });
    }

    function buildNextTransitions(effectiveDelta: number): TransitionLayer[] {
      return transitions.map(({ layer }) => {
        const timing = getTimelineBlockTiming({
          action,
          initialStart: layer.start,
          initialDuration: layer.duration,
          deltaSeconds: effectiveDelta,
          timelineDuration: timelineDisplayDuration,
          minDuration: 0.1,
          moveMaxStartMode: "start",
          endMaxMode: "none",
          snap: false,
          snapBoundaries: [],
          snapThresholdSeconds: 0,
          precision: timelinePrecision,
        });
        return normalizeSymmetricTransitionLayer({
          ...layer,
          start: timing.start,
          duration: timing.duration,
        });
      });
    }

    function buildNextMotions(
      effectiveDelta: number,
    ): Array<AbsoluteTimelineMarker<MotionMarker>> {
      const resizedMarkers = motions.map(({ part, marker }) => {
        const absoluteMarkers = getAbsoluteTimelineMarkerResizeMarkers(
          part.id === TIMELINE_MOTION_PART_ID
            ? motionTimeline
            : timelineMotionViews,
          { part, marker },
        );
        const resized = getAbsoluteMarkerResizeState(
          absoluteMarkers,
          marker.id,
          part.id,
          action,
          effectiveDelta,
        );
        return (
          resized.find(
            (item) => item.id === marker.id && item.sourcePartId === part.id,
          ) ?? null
        );
      });
      return uniqueAbsoluteTimelineMarkers(
        resizedMarkers.filter(
          (marker): marker is AbsoluteTimelineMarker<MotionMarker> =>
            Boolean(marker),
        ),
      );
    }

    function getNextState(clientX: number, snap: boolean) {
      const rawDelta = getDeltaSeconds(clientX);
      let effectiveDelta: number;
      if (snap) {
        const anchorTiming = getTimelineBlockTiming({
          action,
          initialStart: anchorStart,
          initialDuration: anchorDuration,
          deltaSeconds: rawDelta,
          timelineDuration: timelineDisplayDuration,
          minDuration: 0.1,
          moveMaxStartMode: "start",
          endMaxMode: "none",
          snap: true,
          snapBoundaries: boundaries,
          snapThresholdSeconds,
          precision: timelinePrecision,
        });
        updateTimelineSnapGuide(anchorTiming.guideTime);
        effectiveDelta =
          action === "start"
            ? anchorTiming.start - anchorStart
            : anchorTiming.duration - anchorDuration;
      } else {
        updateTimelineSnapGuide(null);
        effectiveDelta = rawDelta;
      }
      return {
        effectiveDelta,
        nextComps: buildNextComps(effectiveDelta),
        nextAdjustments: buildNextAdjustments(effectiveDelta),
        nextTransitions: buildNextTransitions(effectiveDelta),
        nextMotions: buildNextMotions(effectiveDelta),
      };
    }

    function applyDrag(clientX: number, snap: boolean) {
      const { nextComps, nextAdjustments, nextTransitions, nextMotions } =
        getNextState(clientX, snap);
      const compPreview = previewMapFromBlocks("composition", nextComps);
      const adjustmentPreview = previewMapFromBlocks(
        "adjustment",
        nextAdjustments,
      );
      const transitionPreview = previewMapFromBlocks(
        "transition",
        nextTransitions,
      );
      const motionPreview = previewMapFromMarkers(
        getTimelineMarkerResizePreviewMap(nextMotions),
      );
      const merged = {
        ...compPreview,
        ...adjustmentPreview,
        ...transitionPreview,
        ...motionPreview,
      };
      setTimelineBlockPreviews(merged);
      timelineBlockPreviewsRef.current = merged;
    }

    function clearDragState() {
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      clearTimelineSnapGuide();
      clearTimelineBlockPreviews();
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        setDraggingTimelineBlockCategory(
          anchorComposition
            ? "comp"
            : anchorAdjustment
              ? "adjust"
              : anchorTransition
                ? "transition"
                : "motion",
        );
      },
      onPreview: ({ clientX, snap }) => applyDrag(clientX, snap),
      onCommit: ({ clientX, snap }) => {
        const { nextComps, nextAdjustments, nextTransitions, nextMotions } =
          getNextState(clientX, snap);
        clearTimelineBlockPreviews();
        for (const nextComp of nextComps) {
          onUpdateComposition(nextComp.id, () => ({
            ...nextComp,
            start: roundToPrecision(nextComp.start, timelinePrecision),
            duration: roundToPrecision(nextComp.duration, timelinePrecision),
            trimStart: nextComp.trimStart,
          }));
        }
        for (const nextLayer of nextAdjustments) {
          onUpdateAdjustmentLayer(nextLayer.id, () => ({
            ...nextLayer,
            start: roundToPrecision(nextLayer.start, timelinePrecision),
            duration: roundToPrecision(nextLayer.duration, timelinePrecision),
          }));
        }
        for (const nextLayer of nextTransitions) {
          onUpdateTransitionLayer?.(nextLayer.id, () =>
            normalizeSymmetricTransitionLayer({
              ...nextLayer,
              start: roundToPrecision(nextLayer.start, timelinePrecision),
              duration: roundToPrecision(nextLayer.duration, timelinePrecision),
            }),
          );
        }
        if (nextMotions.length > 0) {
          onResizeMotionMarkers(
            getTimelineMarkerResizeCommits(nextMotions, timelinePrecision),
          );
        }
      },
      onCancel: clearDragState,
      onDragEnd: clearDragState,
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

  function getAbsoluteMotionResizeMarkers(target: {
    part: TimelinePart;
    marker: MotionMarker;
  }) {
    return getAbsoluteTimelineMarkerResizeMarkers(
      target.part.id === TIMELINE_MOTION_PART_ID
        ? motionTimeline
        : timelineMotionViews,
      target,
    );
  }

  function getAbsoluteMarkerResizeState<
    T extends {
      id: string;
      start: number;
      duration: number;
      snapIn?: boolean;
      snapOut?: boolean;
    },
  >(
    markers: Array<AbsoluteTimelineMarker<T>>,
    markerId: string,
    sourcePartId: string,
    action: "start" | "end",
    deltaSeconds: number,
  ) {
    return getTimelineMarkerResizeState({
      markers,
      markerId,
      sourcePartId,
      action,
      deltaSeconds,
      precision: timelinePrecision,
    });
  }

  function getUniversalTimelineSnapBoundaries(
    motionKind: MotionBlockEffectKind | undefined,
    movingKeys: Set<string>,
  ) {
    const movingEdges = getMovingMarkerEdgeTimes(motionKind, movingKeys);
    const snapTimeline = [...timelineMotionViews, ...motionTimeline];
    return withPlayheadSnapBoundary(
      Array.from(
        new Set([
          ...getScrubSnapBoundaries(
            snapTimeline,
            adjustmentLayers,
            transitionLayers,
          ).filter((boundary) => !movingEdges.has(roundTenth(boundary))),
          ...getTimelineMarkerDragSnapBoundaries(
            snapTimeline,
            motionKind,
            movingKeys,
          ),
        ]),
      ).sort((left, right) => left - right),
    );
  }

  type BlockInteractionConfig<
    T extends { id: string; start: number; duration: number },
  > = {
    event: PointerEvent<HTMLElement>;
    item: T;
    action: "move" | "start" | "end";
    isLocked: boolean;
    onSelect: () => void;
    sourceLayerId: string;
    dataAttributeSelector: string;
    category: TimelineLayerCategory;
    previewKind: TimelineBlockPreviewKind;
    resizeCssVar: string;
    boundaries: number[];
    transformTiming: (
      timing: TimelineBlockTimingResult,
      shiftActive: boolean,
    ) => T;
    transformSnapGuide?: (
      timing: TimelineBlockTimingResult,
      result: T,
    ) => number | null;
    isBlocked?: (item: T, targetLayerId?: string) => boolean;
    onMove: (start: number, targetLayerId?: string) => void;
    onResize: (item: T) => void;
    precision?: number;
  };

  function startBlockPointerInteraction<
    T extends { id: string; start: number; duration: number },
  >(config: BlockInteractionConfig<T>) {
    const {
      event,
      item,
      action,
      isLocked,
      onSelect,
      sourceLayerId,
      dataAttributeSelector,
      category,
      previewKind,
      resizeCssVar,
      boundaries,
      transformTiming,
      onMove,
      onResize,
      precision,
    } = config;
    event.preventDefault();
    event.stopPropagation();
    if (isLocked) return;
    setSelectedTimelineGap(null);
    onSelect();

    const element =
      (event.currentTarget.closest(
        dataAttributeSelector,
      ) as HTMLElement | null) ?? event.currentTarget;
    const initialClientX = event.clientX;
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);

    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft:
          timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getNextItem(clientX: number, shiftActive: boolean): T {
      const timing = getTimelineBlockTiming({
        action,
        initialStart: item.start,
        initialDuration: item.duration,
        deltaSeconds: getDeltaSeconds(clientX),
        timelineDuration: timelineDisplayDuration,
        minDuration: 0.1,
        moveMaxStartMode: "start",
        endMaxMode: "none",
        snap: shiftActive,
        snapBoundaries: boundaries,
        snapThresholdSeconds,
        precision,
      });
      const result = transformTiming(timing, shiftActive);
      const snapGuide =
        config.transformSnapGuide?.(timing, result) ?? timing.guideTime;
      updateTimelineSnapGuide(snapGuide);
      return result;
    }

    function applyDrag(clientX: number, clientY: number, snap: boolean) {
      const next = getNextItem(clientX, snap);
      if (action === "move") {
        const preview = getLayerDragPreview(category, sourceLayerId, clientY);
        const blocked =
          config.isBlocked?.(next, preview.targetLayerId ?? sourceLayerId) ??
          false;
        applyTimelineBlockPreview(element, {
          deltaX: (next.start - item.start) * pixelsPerSecond,
          deltaY: preview.deltaY,
          height: preview.height,
          resizeProperty: resizeCssVar,
          blocked,
        });
      } else {
        const blocked = config.isBlocked?.(next) ?? false;
        const block = { ...next, blocked } as typeof next & {
          blocked?: boolean;
        };
        previewTimelineBlocks(previewMapFromBlocks(previewKind, [block]));
      }
    }

    function clearDragState() {
      if (action === "move") clearTimelineBlockPreview(element, resizeCssVar);
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
        if (action === "move") setDraggingTimelineBlockCategory(category);
      },
      onPreview: ({ clientX, clientY, snap }) =>
        applyDrag(clientX, clientY, snap),
      onCommit: ({ clientX, clientY, snap }) => {
        const next = getNextItem(clientX, snap);
        const targetLayerId =
          action === "move"
            ? (getDropLayerId(category, clientY) ?? sourceLayerId)
            : undefined;
        const blocked = config.isBlocked?.(next, targetLayerId) ?? false;
        clearDragState();
        if (blocked) return;
        if (action === "move") {
          onMove(next.start, targetLayerId);
        } else {
          onResize(next);
        }
      },
      onCancel: clearDragState,
      onDragEnd: clearDragState,
    });
  }

  function getUniversalBlockSnapBoundaries(
    options: {
      excludeCompositionIds?: Set<string>;
      excludeAdjustmentIds?: Set<string>;
      excludeTransitionIds?: Set<string>;
    } = {},
  ) {
    const snapTimeline = [
      ...timelineMotionViews.filter(
        (item) => !options.excludeCompositionIds?.has(item.id),
      ),
      ...motionTimeline,
    ];
    const snapAdjustments = adjustmentLayers.filter(
      (item) => !options.excludeAdjustmentIds?.has(item.id),
    );
    const snapTransitions = transitionLayers.filter(
      (item) => !options.excludeTransitionIds?.has(item.id),
    );
    return withPlayheadSnapBoundary(
      getScrubSnapBoundaries(snapTimeline, snapAdjustments, snapTransitions),
    );
  }

  function getMovingMarkerEdgeTimes(
    motionKind: MotionBlockEffectKind | undefined,
    movingKeys: Set<string>,
  ) {
    const edges = new Set<number>();
    for (const timelinePart of [...timelineMotionViews, ...motionTimeline]) {
      const markers = motionKind
        ? timelinePart.motionMarkers.filter((m) => m.kind === motionKind)
        : timelinePart.motionMarkers;
      for (const marker of markers) {
        if (!movingKeys.has(`${timelinePart.id}:${marker.id}`)) continue;
        edges.add(roundTenth(timelinePart.start + marker.start));
        edges.add(
          roundTenth(timelinePart.start + marker.start + marker.duration),
        );
      }
    }
    return edges;
  }

  function getTimelineMarkerElement(partId: string, markerId: string) {
    return (
      timelineViewportRef.current?.querySelector<HTMLElement>(
        `[data-timeline-marker-kind="motion"][data-timeline-marker-part-id="${CSS.escape(partId)}"][data-timeline-marker-id="${CSS.escape(markerId)}"]`,
      ) ?? null
    );
  }

  function getTimelineMarkerLayerId(
    _kind: string,
    partId: string,
    markerId: string,
  ) {
    const timelinePart =
      timelineMotionViews.find((item) => item.id === partId) ??
      motionTimeline.find((item) => item.id === partId);
    return (
      timelinePart?.motionMarkers.find((marker) => marker.id === markerId)
        ?.layerId ?? ""
    );
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

  function previewMapFromBlocks<
    T extends {
      id: string;
      start: number;
      duration: number;
      midPoint?: number;
      blocked?: boolean;
    },
  >(kind: TimelineBlockPreviewKind, blocks: T[]) {
    return Object.fromEntries(
      blocks.map((block) => {
        const preview: {
          start: number;
          duration: number;
          midPoint?: number;
          blocked?: boolean;
        } = { start: block.start, duration: block.duration };
        if (block.midPoint !== undefined) preview.midPoint = block.midPoint;
        if (block.blocked !== undefined) preview.blocked = block.blocked;
        return [timelineBlockPreviewKey(kind, block.id), preview];
      }),
    );
  }

  function previewMapFromMarkers<
    T extends { id: string; start: number; duration: number },
  >(markersByPart: Map<string, T[]>) {
    return Object.fromEntries(
      Array.from(markersByPart).flatMap(([partId, markers]) =>
        markers.map((marker) => [
          timelineBlockPreviewKey("motion", partId, marker.id),
          { start: marker.start, duration: marker.duration },
        ]),
      ),
    );
  }

  function setTimelineMarkerDragTransforms(
    items: TimelineMarkerDragItem[],
    deltaPixels: number,
    deltaYPixels = 0,
    previewHeight?: number,
    pixelsPerSecond?: number,
  ) {
    for (const item of items) {
      const element = getTimelineMarkerElement(item.partId, item.markerId);
      if (!element) continue;
      applyTimelineBlockPreview(element, {
        deltaX: deltaPixels,
        deltaY: deltaYPixels,
        height: previewHeight,
        width:
          pixelsPerSecond === undefined
            ? undefined
            : item.duration * pixelsPerSecond,
      });
    }
  }

  function getDropLayerId(category: TimelineLayerCategory, clientY: number) {
    const rect = getTimelineLayerContainerRect();
    const target = getTimelineLayerRowAtClientYClamped(
      layerLayout,
      rect,
      clientY,
      category,
    )?.row.key;
    return target && !isLayerLocked(category, target) ? target : undefined;
  }

  function getLayerDragPreview(
    category: TimelineLayerCategory,
    sourceLayerId: string | undefined,
    clientY: number,
  ) {
    const preview = getTimelineBlockLayerPreview(
      layerLayout,
      category,
      sourceLayerId,
      clientY,
      getTimelineLayerContainerRect(),
    );
    return preview.targetLayerId &&
      isLayerLocked(category, preview.targetLayerId)
      ? { targetLayerId: undefined, deltaY: 0 }
      : preview;
  }

  function clearTimelineMarkerDragTransforms(items: TimelineMarkerDragItem[]) {
    for (const item of items) {
      const element = getTimelineMarkerElement(item.partId, item.markerId);
      if (!element) continue;
      clearTimelineBlockPreview(element);
    }
  }

  function getTimelineAdjustmentElement(layerId: string) {
    return (
      timelineViewportRef.current?.querySelector<HTMLElement>(
        `[data-timeline-adjustment-id="${CSS.escape(layerId)}"]`,
      ) ?? null
    );
  }

  function getTimelineTransitionElement(layerId: string) {
    return (
      timelineViewportRef.current?.querySelector<HTMLElement>(
        `[data-timeline-transition-id="${CSS.escape(layerId)}"]`,
      ) ?? null
    );
  }

  function setAdjustmentDragPreviews(
    initialLayers: AdjustmentLayer[],
    nextLayers: AdjustmentLayer[],
    pixelsPerSecond: number,
    deltaYPixels = 0,
    previewHeight?: number,
  ) {
    for (const initialLayer of initialLayers) {
      const nextLayer = nextLayers.find((item) => item.id === initialLayer.id);
      const element = getTimelineAdjustmentElement(initialLayer.id);
      if (!nextLayer || !element) continue;
      applyTimelineBlockPreview(element, {
        deltaX: (nextLayer.start - initialLayer.start) * pixelsPerSecond,
        deltaY: deltaYPixels,
        height: previewHeight,
      });
    }
  }

  function clearAdjustmentResizePreviews(layers: AdjustmentLayer[]) {
    for (const layer of layers) {
      const element = getTimelineAdjustmentElement(layer.id);
      if (!element) continue;
      clearTimelineBlockPreview(element, "--clipper-adjustment-resize-width");
    }
  }

  function clearTransitionResizePreviews(layers: TransitionLayer[]) {
    for (const layer of layers) {
      const element = getTimelineTransitionElement(layer.id);
      if (!element) continue;
      clearTimelineBlockPreview(element, "--clipper-transition-resize-width");
    }
  }

  function clearCompositionPreview(element: HTMLElement) {
    clearTimelineBlockPreview(element, "--clipper-composition-resize-width");
  }

  function isCompositionBlocked(
    start: number,
    duration: number,
    layerId: string,
    compositionIdsToExclude?: Set<string>,
  ): boolean {
    const end = start + duration;
    return timeline.some((part) => {
      if (compositionIdsToExclude?.has(part.id)) return false;
      if ((part.layerId ?? "comp") !== layerId) return false;
      const partEnd = part.start + part.duration;
      return start < partEnd && end > part.start;
    });
  }

  function startMixedTimelineMove(
    event: PointerEvent<HTMLElement>,
    anchor: MixedTimelineMoveItem,
    items: MixedTimelineMoveItem[],
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTimelineGap(null);
    const initialClientX = event.clientX;
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const compositionIds = new Set(
      items
        .filter((item) => item.kind === "composition")
        .map((item) => item.id),
    );
    const adjustmentIds = new Set(
      items.filter((item) => item.kind === "adjustment").map((item) => item.id),
    );
    const transitionIds = new Set(
      items.filter((item) => item.kind === "transition").map((item) => item.id),
    );
    const boundaries = getUniversalBlockSnapBoundaries({
      excludeCompositionIds: compositionIds,
      excludeAdjustmentIds: adjustmentIds,
      excludeTransitionIds: transitionIds,
    });

    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft:
          timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getMoveDelta(clientX: number, snap: boolean) {
      const timing = getTimelineGroupMoveTiming({
        items,
        anchorStart: anchor.start,
        deltaSeconds: getDeltaSeconds(clientX),
        timelineDuration: timelineDisplayDuration,
        moveMaxStartMode: "start",
        snap,
        snapBoundaries: boundaries,
        snapThresholdSeconds,
        precision: timelinePrecision,
      });
      updateTimelineSnapGuide(timing.guideTime);
      return timing.deltaSeconds;
    }

    function getNextItems(clientX: number, snap: boolean) {
      const delta = getMoveDelta(clientX, snap);
      return items.map((item) => ({
        ...item,
        start: roundToPrecision(item.start + delta, timelinePrecision),
      }));
    }

    function getMotionElement(item: MixedTimelineMoveItem) {
      return item.partId && item.markerId
        ? getTimelineMarkerElement(item.partId, item.markerId)
        : null;
    }

    function getElement(item: MixedTimelineMoveItem) {
      if (item.kind === "composition")
        return getTimelineCompositionElement(item.id);
      if (item.kind === "adjustment")
        return getTimelineAdjustmentElement(item.id);
      if (item.kind === "transition")
        return getTimelineTransitionElement(item.id);
      return getMotionElement(item);
    }

    function applyDrag(clientX: number, snap: boolean) {
      const nextItems = getNextItems(clientX, snap);
      for (const item of items) {
        const nextItem = nextItems.find(
          (next) => next.id === item.id && next.kind === item.kind,
        );
        const element = getElement(item);
        if (!nextItem || !element) continue;
        applyTimelineBlockPreview(element, {
          deltaX: (nextItem.start - item.start) * pixelsPerSecond,
        });
      }
    }

    function clearDragState() {
      setGlobalTimelineDragActive(false);
      setDraggingTimelineBlockCategory(null);
      clearTimelineSnapGuide();
      window.requestAnimationFrame(() => {
        for (const item of items) {
          const element = getElement(item);
          if (element) clearTimelineBlockPreview(element);
        }
      });
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        setDraggingTimelineBlockCategory(
          anchor.kind === "composition"
            ? "comp"
            : anchor.kind === "adjustment"
              ? "adjust"
              : anchor.kind === "transition"
                ? "transition"
                : "motion",
        );
      },
      onPreview: ({ clientX, snap }) => applyDrag(clientX, snap),
      onCommit: ({ clientX, snap }) => {
        const nextItems = getNextItems(clientX, snap);
        const compositionMoves = nextItems
          .filter((item) => item.kind === "composition")
          .map((item) => ({
            compositionId: item.id,
            start: item.start,
            targetLayerId: item.layerId,
          }));
        const adjustmentMoves = nextItems
          .filter((item) => item.kind === "adjustment")
          .map((item) => ({
            layerId: item.id,
            start: item.start,
            targetLayerId: item.layerId,
          }));
        const transitionMoves = nextItems
          .filter((item) => item.kind === "transition")
          .map((item) => ({
            layerId: item.id,
            start: item.start,
            targetLayerId: item.layerId,
          }));
        const motionMoves: TimelineMarkerMove[] = nextItems.flatMap((item) => {
          if (item.kind !== "motion" || !item.partId || !item.markerId)
            return [];
          if (item.partId === TIMELINE_MOTION_PART_ID)
            return [
              {
                sourcePartId: item.partId,
                markerId: item.markerId,
                targetPartId: item.partId,
                start: item.start,
                targetLayerId: item.layerId,
              },
            ];
          const timelinePart = timeline.find((part) => part.id === item.partId);
          return timelinePart
            ? [
                {
                  sourcePartId: item.partId,
                  markerId: item.markerId,
                  targetPartId: item.partId,
                  start: roundToPrecision(
                    item.start - timelinePart.start,
                    timelinePrecision,
                  ),
                  targetLayerId: item.layerId,
                },
              ]
            : [];
        });
        if (compositionMoves.length) onMoveCompositions(compositionMoves);
        if (adjustmentMoves.length) {
          if (onMoveAdjustmentLayers) onMoveAdjustmentLayers(adjustmentMoves);
          else
            for (const move of adjustmentMoves)
              onMoveAdjustmentLayer(
                move.layerId,
                move.start,
                move.targetLayerId,
              );
        }
        if (transitionMoves.length) {
          if (onMoveTransitionLayers) onMoveTransitionLayers(transitionMoves);
          else
            for (const move of transitionMoves)
              onMoveTransitionLayer?.(
                move.layerId,
                move.start,
                move.targetLayerId,
              );
        }
        if (motionMoves.length) onMoveMotionMarkers(motionMoves);
      },
      onCancel: clearDragState,
      onDragEnd: clearDragState,
    });
  }

  function updateCompositionFromPointer(
    event: PointerEvent<HTMLElement>,
    composition: TimelinePart,
    action: "move" | "start" | "end",
  ) {
    if (action === "move") {
      const mixedItems = selectedMixedTimelineMoveItems(
        "composition",
        composition.id,
      );
      if (mixedItems.length > 1) {
        const anchor = mixedItems.find(
          (item) => item.kind === "composition" && item.id === composition.id,
        );
        if (anchor) {
          startMixedTimelineMove(event, anchor, mixedItems);
          return;
        }
      }
    }
    const moveTargets =
      action === "move"
        ? selectedCompositionMoveTargets(composition)
        : [composition];
    if (moveTargets.length === 0 || isCompositionLocked(composition)) return;
    const isSelectionMove =
      action === "move" &&
      selectedPartIds.has(composition.id) &&
      moveTargets.length > 1;
    const moveTargetIds = new Set(moveTargets.map((item) => item.id));

    if (isSelectionMove) {
      event.preventDefault();
      event.stopPropagation();
      const sourceLayerId = composition.layerId ?? "comp";
      const initialClientX = event.clientX;
      const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
      const pixelsPerSecond =
        (timelineRef.current?.getBoundingClientRect().width ?? 1) /
        Math.max(timelineDisplayDuration, 1);
      const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
      const boundaries = getUniversalBlockSnapBoundaries({
        excludeCompositionIds: moveTargetIds,
      });
      function getDeltaSeconds(clientX: number) {
        return getTimelineDragDeltaSeconds({
          initialClientX,
          clientX,
          initialScrollLeft,
          scrollLeft:
            timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
          pixelsPerSecond,
        });
      }
      function getNextMoveTargets(clientX: number, snap: boolean) {
        const minStart = Math.min(...moveTargets.map((t) => t.start));
        const timing = getTimelineGroupMoveTiming({
          items: moveTargets,
          anchorStart: composition.start,
          deltaSeconds: getDeltaSeconds(clientX),
          timelineDuration: timelineDisplayDuration,
          moveMinStart: composition.start - minStart,
          moveMaxStartMode: "start",
          snap,
          snapBoundaries: boundaries,
          snapThresholdSeconds,
          precision: timelinePrecision,
        });
        updateTimelineSnapGuide(timing.guideTime);
        const moveDelta = timing.deltaSeconds;
        return moveTargets.map((target) => ({
          ...target,
          start: target.start + moveDelta,
        }));
      }
      function isAnyLayerBlocked(
        nextTargets: TimelinePart[],
        layerTargets: Map<string, string>,
      ): boolean {
        return nextTargets.some((nextTarget) => {
          const rowKey =
            layerTargets.get(nextTarget.id) ?? nextTarget.layerId ?? "comp";
          return isCompositionBlocked(
            nextTarget.start,
            nextTarget.duration,
            rowKey,
            moveTargetIds,
          );
        });
      }
      function applyDrag(clientX: number, clientY: number, snap: boolean) {
        const nextTargets = getNextMoveTargets(clientX, snap);
        const containerRect = getTimelineLayerContainerRect();
        const cursorLayerId = getTimelineLayerRowAtClientYClamped(
          layerLayout,
          containerRect,
          clientY,
          "comp",
        )?.row.key;
        const layerTargets = computeBulkLayerTargets(
          layerLayout,
          "comp",
          sourceLayerId,
          cursorLayerId,
          moveTargets,
          "comp",
        );
        const blocked = isAnyLayerBlocked(nextTargets, layerTargets);
        previewTimelineBlocks(
          previewMapFromBlocks(
            "composition",
            nextTargets.map((t) => ({ ...t, blocked }) as any),
          ),
        );
        for (const target of moveTargets) {
          const nextTarget = nextTargets.find((item) => item.id === target.id);
          const targetElement =
            timelineViewportRef.current?.querySelector<HTMLElement>(
              `[data-timeline-composition-id="${CSS.escape(target.id)}"]`,
            );
          if (!nextTarget || !targetElement) continue;
          const computedLayerId = layerTargets.get(target.id);
          const layerPreview = getTimelineLayerDragPreview(
            layerLayout,
            target.layerId ?? "comp",
            computedLayerId && !isLayerLocked("comp", computedLayerId)
              ? computedLayerId
              : undefined,
          );
          applyTimelineBlockPreview(targetElement, {
            deltaX: 0,
            deltaY: layerPreview.deltaY,
            height: layerPreview.height,
            resizeProperty: "--clipper-composition-resize-width",
            blocked,
          });
        }
      }
      function clearDragState() {
        setGlobalTimelineDragActive(false);
        setDraggingTimelineBlockCategory(null);
        clearTimelineSnapGuide();
        window.requestAnimationFrame(() => {
          clearTimelineBlockPreviews();
          for (const target of moveTargets) {
            const targetElement =
              timelineViewportRef.current?.querySelector<HTMLElement>(
                `[data-timeline-composition-id="${CSS.escape(target.id)}"]`,
              );
            if (targetElement)
              clearTimelineBlockPreview(
                targetElement,
                "--clipper-composition-resize-width",
              );
          }
        });
      }
      startTimelinePointerTransaction({
        event,
        updateAutoScroll: updateTimelineDragAutoScroll,
        stopAutoScroll: stopTimelineDragAutoScroll,
        onDragStart: () => {
          setGlobalTimelineDragActive(true);
          setDraggingTimelineBlockCategory("comp");
        },
        onPreview: ({ clientX, clientY, snap }) =>
          applyDrag(clientX, clientY, snap),
        onCommit: ({ clientX, clientY, snap }) => {
          const containerRect = getTimelineLayerContainerRect();
          const cursorLayerId = getTimelineLayerRowAtClientYClamped(
            layerLayout,
            containerRect,
            clientY,
            "comp",
          )?.row.key;
          const layerTargets = computeBulkLayerTargets(
            layerLayout,
            "comp",
            sourceLayerId,
            cursorLayerId,
            moveTargets,
            "comp",
          );
          const nextTargets = getNextMoveTargets(clientX, snap);
          if (isAnyLayerBlocked(nextTargets, layerTargets)) {
            clearDragState();
            return;
          }
          for (const target of moveTargets) {
            const targetElement =
              timelineViewportRef.current?.querySelector<HTMLElement>(
                `[data-timeline-composition-id="${CSS.escape(target.id)}"]`,
              );
            if (targetElement)
              clearTimelineBlockPreview(
                targetElement,
                "--clipper-composition-resize-width",
              );
          }
          onMoveCompositions(
            nextTargets.map((target) => ({
              compositionId: target.id,
              start: roundToPrecision(target.start, timelinePrecision),
              targetLayerId: layerTargets.get(target.id) ?? target.layerId,
            })),
          );
        },
        onCancel: clearDragState,
        onDragEnd: clearDragState,
      });
      return;
    }

    if (action !== "move" && selectedPartIds.has(composition.id)) {
      const mixedResizeItems = getSelectedMixedTimelineResizeItems();
      const hasOtherKind = mixedResizeItems.some(
        (item) => item.kind !== "composition",
      );
      if (hasOtherKind) {
        startMixedTimelineResize(event, action, composition);
        return;
      }
    }

    startBlockPointerInteraction({
      event,
      item: composition,
      action,
      isLocked: isCompositionLocked(composition),
      onSelect: () => onSelectPart(composition.id),
      sourceLayerId: composition.layerId ?? "comp",
      dataAttributeSelector: "[data-timeline-composition-id]",
      category: "comp",
      previewKind: "composition",
      resizeCssVar: "--clipper-composition-resize-width",
      boundaries: getUniversalBlockSnapBoundaries({
        excludeCompositionIds: moveTargetIds,
      }),
      transformTiming: (timing) => {
        if (action !== "start")
          return {
            ...composition,
            start: timing.start,
            duration: timing.duration,
          };
        const previousTrimStart = composition.trimStart ?? 0;
        const trimStart = roundToPrecision(
          Math.max(previousTrimStart + timing.start - composition.start, 0),
          timelinePrecision,
        );
        const start = roundToPrecision(
          composition.start + trimStart - previousTrimStart,
          timelinePrecision,
        );
        return {
          ...composition,
          start,
          duration: roundToPrecision(
            composition.start + composition.duration - start,
            timelinePrecision,
          ),
          trimStart: trimStart || undefined,
        };
      },
      isBlocked: (item, targetLayerId) =>
        isCompositionBlocked(
          item.start,
          item.duration,
          targetLayerId ?? item.layerId ?? "comp",
          moveTargetIds,
        ),
      onMove: (start, targetLayerId) =>
        onMoveComposition(
          composition.id,
          start,
          targetLayerId ?? composition.layerId ?? "comp",
        ),
      onResize: (next) =>
        onUpdateComposition(composition.id, () => ({
          ...composition,
          start: next.start,
          duration: next.duration,
          trimStart: next.trimStart,
        })),
      precision: timelinePrecision,
    });
  }

  function updateAdjustmentFromPointer(
    event: PointerEvent<HTMLElement>,
    layer: AdjustmentLayer,
    action: "move" | "start" | "end",
  ) {
    if (action === "move") {
      const mixedItems = selectedMixedTimelineMoveItems("adjustment", layer.id);
      if (mixedItems.length > 1) {
        const anchor = mixedItems.find(
          (item) => item.kind === "adjustment" && item.id === layer.id,
        );
        if (anchor) {
          startMixedTimelineMove(event, anchor, mixedItems);
          return;
        }
      }
    }
    const resizeTargets = selectedAdjustmentResizeTargets(layer);
    if (resizeTargets.length === 0 || isAdjustmentLocked(layer)) return;
    if (action !== "move" && selectedAdjustmentLayerIds.has(layer.id)) {
      const mixedResizeItems = getSelectedMixedTimelineResizeItems();
      const hasOtherKind = mixedResizeItems.some(
        (item) => item.kind !== "adjustment",
      );
      if (hasOtherKind) {
        startMixedTimelineResize(event, action, undefined, layer);
        return;
      }
    }
    const isSelectionMove =
      action === "move" &&
      selectedAdjustmentLayerIds.has(layer.id) &&
      resizeTargets.length > 1;
    const isSelectionResize =
      action !== "move" &&
      selectedAdjustmentLayerIds.has(layer.id) &&
      resizeTargets.length > 1;
    const resizeTargetIds = new Set(resizeTargets.map((item) => item.id));

    if (isSelectionMove) {
      event.preventDefault();
      event.stopPropagation();
      const sourceLayerId = getAdjustmentLayerRowId(layer);
      const initialClientX = event.clientX;
      const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
      const pixelsPerSecond =
        (timelineRef.current?.getBoundingClientRect().width ?? 1) /
        Math.max(timelineDisplayDuration, 1);
      const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
      const boundaries = getUniversalBlockSnapBoundaries({
        excludeAdjustmentIds: resizeTargetIds,
      });
      function getDeltaSeconds(cx: number) {
        return getTimelineDragDeltaSeconds({
          initialClientX,
          clientX: cx,
          initialScrollLeft,
          scrollLeft:
            timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
          pixelsPerSecond,
        });
      }
      function getNextLayer(
        targetLayer: AdjustmentLayer,
        cx: number,
        snap: boolean,
      ) {
        const timing = getTimelineGroupMoveTiming({
          items: resizeTargets,
          anchorStart: layer.start,
          deltaSeconds: getDeltaSeconds(cx),
          timelineDuration: timelineDisplayDuration,
          moveMaxStartMode: "start",
          snap,
          snapBoundaries: boundaries,
          snapThresholdSeconds,
          precision: timelinePrecision,
        });
        updateTimelineSnapGuide(timing.guideTime);
        return {
          ...targetLayer,
          start: targetLayer.start + timing.deltaSeconds,
          duration: targetLayer.duration,
        };
      }
      function getNextLayers(cx: number, snap: boolean) {
        return resizeTargets.map((t) => getNextLayer(t, cx, snap));
      }
      function applyDrag(cx: number, cy: number, snap: boolean) {
        const nextLayers = getNextLayers(cx, snap);
        const containerRect = getTimelineLayerContainerRect();
        const cursorLayerId = getTimelineLayerRowAtClientYClamped(
          layerLayout,
          containerRect,
          cy,
          "adjust",
        )?.row.key;
        const layerTargets = computeBulkLayerTargets(
          layerLayout,
          "adjust",
          sourceLayerId,
          cursorLayerId,
          resizeTargets.map((l) => ({
            id: l.id,
            layerId: getAdjustmentLayerRowId(l),
          })),
          sourceLayerId,
        );
        for (const targetLayer of resizeTargets) {
          const nextLayer = nextLayers.find(
            (item) => item.id === targetLayer.id,
          );
          const el = getTimelineAdjustmentElement(targetLayer.id);
          if (!nextLayer || !el) continue;
          const computedLayerId = layerTargets.get(targetLayer.id);
          const layerPreview = getTimelineLayerDragPreview(
            layerLayout,
            getAdjustmentLayerRowId(targetLayer),
            computedLayerId && !isLayerLocked("adjust", computedLayerId)
              ? computedLayerId
              : undefined,
          );
          applyTimelineBlockPreview(el, {
            deltaX: (nextLayer.start - targetLayer.start) * pixelsPerSecond,
            deltaY: layerPreview.deltaY,
            height: layerPreview.height,
          });
        }
      }
      function clearDragState() {
        clearAdjustmentResizePreviews(resizeTargets);
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
          setDraggingTimelineBlockCategory("adjust");
        },
        onPreview: ({ clientX, clientY, snap }) =>
          applyDrag(clientX, clientY, snap),
        onCommit: ({ clientX, clientY, snap }) => {
          const containerRect = getTimelineLayerContainerRect();
          const cursorLayerId = getTimelineLayerRowAtClientYClamped(
            layerLayout,
            containerRect,
            clientY,
            "adjust",
          )?.row.key;
          const layerTargets = computeBulkLayerTargets(
            layerLayout,
            "adjust",
            sourceLayerId,
            cursorLayerId,
            resizeTargets.map((l) => ({
              id: l.id,
              layerId: getAdjustmentLayerRowId(l),
            })),
            sourceLayerId,
          );
          for (const targetLayer of getNextLayers(clientX, snap)) {
            onUpdateAdjustmentLayer(targetLayer.id, () => ({
              ...targetLayer,
              layerId:
                layerTargets.get(targetLayer.id) ??
                getAdjustmentLayerRowId(targetLayer),
              start: roundToPrecision(targetLayer.start, timelinePrecision),
            }));
          }
        },
        onCancel: clearDragState,
        onDragEnd: clearDragState,
      });
      return;
    }

    if (isSelectionResize) {
      event.preventDefault();
      event.stopPropagation();
      const initialClientX = event.clientX;
      const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
      const pixelsPerSecond =
        (timelineRef.current?.getBoundingClientRect().width ?? 1) /
        Math.max(timelineDisplayDuration, 1);
      const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
      const boundaries = getUniversalBlockSnapBoundaries({
        excludeAdjustmentIds: resizeTargetIds,
      });
      function getDeltaSeconds(cx: number) {
        return getTimelineDragDeltaSeconds({
          initialClientX,
          clientX: cx,
          initialScrollLeft,
          scrollLeft:
            timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
          pixelsPerSecond,
        });
      }
      function getNextLayer(
        targetLayer: AdjustmentLayer,
        cx: number,
        snap: boolean,
      ) {
        const timing = getTimelineBlockTiming({
          action,
          initialStart: targetLayer.start,
          initialDuration: targetLayer.duration,
          deltaSeconds: getDeltaSeconds(cx),
          timelineDuration: timelineDisplayDuration,
          minDuration: 0.1,
          moveMaxStartMode: "start",
          endMaxMode: "none",
          snap,
          snapBoundaries: boundaries,
          snapThresholdSeconds,
        });
        if (targetLayer.id === layer.id)
          updateTimelineSnapGuide(timing.guideTime);
        return {
          ...targetLayer,
          start: timing.start,
          duration: timing.duration,
        };
      }
      function getNextLayers(cx: number, snap: boolean) {
        return resizeTargets.map((t) => getNextLayer(t, cx, snap));
      }
      startTimelinePointerTransaction({
        event,
        updateAutoScroll: updateTimelineDragAutoScroll,
        stopAutoScroll: stopTimelineDragAutoScroll,
        onDragStart: () => setGlobalTimelineDragActive(true),
        onPreview: ({ clientX, snap }) => {
          previewTimelineBlocks(
            previewMapFromBlocks("adjustment", getNextLayers(clientX, snap)),
          );
        },
        onCommit: ({ clientX, snap }) => {
          clearTimelineBlockPreviews();
          for (const targetLayer of getNextLayers(clientX, snap)) {
            onUpdateAdjustmentLayer(targetLayer.id, () => ({
              ...targetLayer,
              start: roundToPrecision(targetLayer.start, timelinePrecision),
              duration: roundToPrecision(
                targetLayer.duration,
                timelinePrecision,
              ),
            }));
          }
        },
        onCancel: () => {
          clearTimelineBlockPreviews();
          setGlobalTimelineDragActive(false);
          clearTimelineSnapGuide();
        },
        onDragEnd: () => {
          clearTimelineBlockPreviews();
          setGlobalTimelineDragActive(false);
          setDraggingTimelineBlockCategory(null);
          clearTimelineSnapGuide();
        },
      });
      return;
    }

    startBlockPointerInteraction({
      event,
      item: layer,
      action,
      isLocked: isAdjustmentLocked(layer),
      onSelect: () => onSelectAdjustmentLayer(layer.id),
      sourceLayerId: getAdjustmentLayerRowId(layer),
      dataAttributeSelector: "[data-timeline-adjustment-id]",
      category: "adjust",
      previewKind: "adjustment",
      resizeCssVar: "--clipper-adjustment-resize-width",
      boundaries: getUniversalBlockSnapBoundaries({
        excludeAdjustmentIds: resizeTargetIds,
      }),
      transformTiming: (timing) => ({
        ...layer,
        start: timing.start,
        duration: timing.duration,
      }),
      onMove: (start, targetLayerId) =>
        onMoveAdjustmentLayer(
          layer.id,
          start,
          targetLayerId ?? getAdjustmentLayerRowId(layer),
        ),
      onResize: (next) =>
        onUpdateAdjustmentLayer(layer.id, () => ({
          ...layer,
          start: next.start,
          duration: next.duration,
        })),
      precision: timelinePrecision,
    });
  }

  function updateTransitionFromPointer(
    event: PointerEvent<HTMLElement>,
    layer: TransitionLayer,
    action: "move" | "start" | "end",
  ) {
    if (isTransitionLocked(layer)) return;
    if (action === "move") {
      const mixedItems = selectedMixedTimelineMoveItems("transition", layer.id);
      if (mixedItems.length > 1) {
        const anchor = mixedItems.find(
          (item) => item.kind === "transition" && item.id === layer.id,
        );
        if (anchor) {
          startMixedTimelineMove(event, anchor, mixedItems);
          return;
        }
      }
    }
    const resizeTargets = transitionLayers.filter(
      (tl) =>
        selectedTransitionLayerIds.has(tl.id) ||
        tl.id === selectedTransitionLayerId,
    );
    if (action !== "move" && selectedTransitionLayerIds.has(layer.id)) {
      const mixedResizeItems = getSelectedMixedTimelineResizeItems();
      const hasOtherKind = mixedResizeItems.some(
        (item) => item.kind !== "transition",
      );
      if (hasOtherKind) {
        startMixedTimelineResize(event, action, undefined, undefined, layer);
        return;
      }
    }
    const isSelectionMove =
      action === "move" &&
      selectedTransitionLayerIds.has(layer.id) &&
      resizeTargets.length > 1;
    const isSelectionResize =
      action !== "move" &&
      selectedTransitionLayerIds.has(layer.id) &&
      resizeTargets.length > 1;
    const resizeTargetIds = new Set(resizeTargets.map((item) => item.id));

    if (isSelectionMove) {
      event.preventDefault();
      event.stopPropagation();
      const sourceLayerId = layer.layerId ?? layer.effect.effectId;
      const initialClientX = event.clientX;
      const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
      const pixelsPerSecond =
        (timelineRef.current?.getBoundingClientRect().width ?? 1) /
        Math.max(timelineDisplayDuration, 1);
      const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
      const boundaries = getUniversalBlockSnapBoundaries({
        excludeTransitionIds: resizeTargetIds,
      });
      const blocksOverlap = Boolean(
        getEffectPackage(layer.effect.effectId)?.tags?.includes(
          "blocksOverlap",
        ),
      );
      function getDeltaSeconds(cx: number) {
        return getTimelineDragDeltaSeconds({
          initialClientX,
          clientX: cx,
          initialScrollLeft,
          scrollLeft:
            timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
          pixelsPerSecond,
        });
      }
      function getNextLayer(
        targetLayer: TransitionLayer,
        cx: number,
        snap: boolean,
      ) {
        const timing = getTimelineGroupMoveTiming({
          items: resizeTargets,
          anchorStart: layer.start,
          deltaSeconds: getDeltaSeconds(cx),
          timelineDuration: timelineDisplayDuration,
          moveMaxStartMode: "start",
          snap,
          snapBoundaries: boundaries,
          snapThresholdSeconds,
          precision: timelinePrecision,
        });
        updateTimelineSnapGuide(timing.guideTime);
        return {
          ...targetLayer,
          start: targetLayer.start + timing.deltaSeconds,
        };
      }
      function isAnyLayerBlocked(nextLayers: TransitionLayer[]): boolean {
        if (!blocksOverlap) return false;
        const nextById = new Map(nextLayers.map((l) => [l.id, l]));
        return nextLayers.some((nextLayer) => {
          const rowKey = nextLayer.layerId ?? nextLayer.effect.effectId;
          const itemEnd = nextLayer.start + nextLayer.duration;
          return transitionLayers.some((other) => {
            if (resizeTargetIds.has(other.id)) return false;
            if ((other.layerId ?? other.effect.effectId) !== rowKey)
              return false;
            const otherEnd = other.start + other.duration;
            return nextLayer.start < otherEnd && itemEnd > other.start;
          });
        });
      }
      function applyDrag(cx: number, cy: number, snap: boolean) {
        const nextLayers = resizeTargets.map((t) => getNextLayer(t, cx, snap));
        const blocked = isAnyLayerBlocked(nextLayers);
        const containerRect = getTimelineLayerContainerRect();
        const cursorLayerId = getTimelineLayerRowAtClientYClamped(
          layerLayout,
          containerRect,
          cy,
          "transition",
        )?.row.key;
        const layerTargets = computeBulkLayerTargets(
          layerLayout,
          "transition",
          sourceLayerId,
          cursorLayerId,
          resizeTargets.map((l) => ({
            id: l.id,
            layerId: l.layerId ?? l.effect.effectId,
          })),
          sourceLayerId,
        );
        for (const targetLayer of resizeTargets) {
          const nextLayer = nextLayers.find(
            (item) => item.id === targetLayer.id,
          );
          const el = getTimelineTransitionElement(targetLayer.id);
          if (!nextLayer || !el) continue;
          const computedLayerId = layerTargets.get(targetLayer.id);
          const layerPreview = getTimelineLayerDragPreview(
            layerLayout,
            targetLayer.layerId ?? targetLayer.effect.effectId,
            computedLayerId && !isLayerLocked("transition", computedLayerId)
              ? computedLayerId
              : undefined,
          );
          applyTimelineBlockPreview(el, {
            deltaX: (nextLayer.start - targetLayer.start) * pixelsPerSecond,
            deltaY: layerPreview.deltaY,
            height: layerPreview.height,
            resizeProperty: "--clipper-transition-resize-width",
            blocked,
          });
        }
      }
      function clearDragState() {
        clearTransitionResizePreviews(resizeTargets);
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
          setDraggingTimelineBlockCategory("transition");
        },
        onPreview: ({ clientX, clientY, snap }) =>
          applyDrag(clientX, clientY, snap),
        onCommit: ({ clientX, clientY, snap }) => {
          const nextLayers = resizeTargets.map((t) =>
            getNextLayer(t, clientX, snap),
          );
          if (isAnyLayerBlocked(nextLayers)) {
            clearDragState();
            return;
          }
          const containerRect = getTimelineLayerContainerRect();
          const cursorLayerId = getTimelineLayerRowAtClientYClamped(
            layerLayout,
            containerRect,
            clientY,
            "transition",
          )?.row.key;
          const layerTargets = computeBulkLayerTargets(
            layerLayout,
            "transition",
            sourceLayerId,
            cursorLayerId,
            resizeTargets.map((l) => ({
              id: l.id,
              layerId: l.layerId ?? l.effect.effectId,
            })),
            sourceLayerId,
          );
          for (const targetLayer of nextLayers) {
            onMoveTransitionLayer?.(
              targetLayer.id,
              roundToPrecision(targetLayer.start, timelinePrecision),
              layerTargets.get(targetLayer.id) ??
                targetLayer.layerId ??
                targetLayer.effect.effectId,
            );
          }
        },
        onCancel: clearDragState,
        onDragEnd: clearDragState,
      });
      return;
    }
    const midPointAbs = getTransitionMarkerTime(layer);
    const baseBoundaries = getUniversalBlockSnapBoundaries({
      excludeTransitionIds: new Set([layer.id]),
    });
    const snapThresholdSeconds = Math.max(
      0.08,
      8 /
        ((timelineRef.current?.getBoundingClientRect().width ?? 1) /
          Math.max(timelineDisplayDuration, 1)),
    );

    function transformTiming(
      timing: TimelineBlockTimingResult,
      shiftActive: boolean,
    ): TransitionLayer {
      const minDuration = 0.1;
      const r = (v: number) => roundToPrecision(v, timelinePrecision);
      const getSymmetricDuration = (rawHalfDuration: number) =>
        r(
          clamp(
            rawHalfDuration,
            minDuration / 2,
            Math.max(
              Math.min(midPointAbs, timelineDisplayDuration - midPointAbs),
              minDuration / 2,
            ),
          ) * 2,
        );
      if (action === "move") {
        let start = timing.start;
        let midPointGuideTime: number | null = null;
        if (shiftActive) {
          const absMid = start + timing.duration / 2;
          const midSnap = getTimelineSnapGuideTime(
            absMid,
            baseBoundaries,
            snapThresholdSeconds,
          );
          if (midSnap !== null) {
            start = r(
              clamp(
                start + (midSnap - absMid),
                0,
                Math.max(timelineDisplayDuration - layer.duration, 0),
              ),
            );
            midPointGuideTime = midSnap;
          }
        }
        return normalizeSymmetricTransitionLayer({
          ...layer,
          start,
          duration: timing.duration,
          midPointGuideTime,
        } as TransitionLayer & { midPointGuideTime?: number | null });
      }

      if (action === "start") {
        let start = timing.start;
        if (start > midPointAbs - minDuration)
          start = midPointAbs - minDuration;
        let duration = getSymmetricDuration(midPointAbs - start);

        let midPointGuideTime: number | null = null;
        const middleSnap = getTimelineSnapGuideTime(
          midPointAbs,
          baseBoundaries,
          snapThresholdSeconds,
        );
        if (middleSnap !== null && !shiftActive) {
          midPointGuideTime = middleSnap;
        }

        start = r(midPointAbs - duration / 2);
        return normalizeSymmetricTransitionLayer({
          ...layer,
          start,
          duration,
          midPointGuideTime,
        } as TransitionLayer & { midPointGuideTime?: number | null });
      }

      // action === "end"
      let duration = timing.duration;
      let newEnd = layer.start + duration;
      if (newEnd < midPointAbs + minDuration) {
        newEnd = midPointAbs + minDuration;
        duration = newEnd - layer.start;
      }
      duration = getSymmetricDuration(newEnd - midPointAbs);
      let start = r(midPointAbs - duration / 2);

      let midPointGuideTime: number | null = null;
      const middleSnap = getTimelineSnapGuideTime(
        midPointAbs,
        baseBoundaries,
        snapThresholdSeconds,
      );
      if (middleSnap !== null && !shiftActive) {
        midPointGuideTime = middleSnap;
      }

      start = r(start);
      duration = Math.max(duration, minDuration);
      return normalizeSymmetricTransitionLayer({
        ...layer,
        start,
        duration,
        midPointGuideTime,
      } as TransitionLayer & { midPointGuideTime?: number | null });
    }

    function transformSnapGuide(
      timing: TimelineBlockTimingResult,
      result: TransitionLayer & { midPointGuideTime?: number | null },
    ) {
      return result.midPointGuideTime ?? timing.guideTime;
    }

    startBlockPointerInteraction({
      event,
      item: layer,
      action,
      isLocked: isTransitionLocked(layer),
      onSelect: () => onSelectTransitionLayer?.(layer.id),
      sourceLayerId: layer.layerId ?? layer.effect.effectId,
      dataAttributeSelector: "[data-timeline-transition-id]",
      category: "transition",
      previewKind: "transition",
      resizeCssVar: "--clipper-transition-resize-width",
      boundaries: baseBoundaries,
      transformTiming,
      transformSnapGuide,
      precision: timelinePrecision,
      isBlocked: (item, targetLayerId) => {
        const effect = getEffectPackage(layer.effect.effectId);
        if (!effect?.tags?.includes("blocksOverlap")) return false;
        const rowKey = targetLayerId ?? layer.layerId ?? layer.effect.effectId;
        const itemEnd = item.start + item.duration;
        return transitionLayers.some((other) => {
          if (other.id === layer.id) return false;
          if ((other.layerId ?? other.effect.effectId) !== rowKey) return false;
          const otherEnd = other.start + other.duration;
          return item.start < otherEnd && itemEnd > other.start;
        });
      },
      onMove: (start, targetLayerId) =>
        onMoveTransitionLayer?.(
          layer.id,
          start,
          targetLayerId ?? layer.layerId ?? layer.effect.effectId,
        ),
      onResize: (next) =>
        onUpdateTransitionLayer?.(layer.id, () =>
          normalizeSymmetricTransitionLayer({
            ...layer,
            start: next.start,
            duration: next.duration,
          }),
        ),
    });
  }

  function updateMotionMarkerFromPointer(
    event: PointerEvent<HTMLDivElement>,
    part: TimelinePart,
    marker: MotionMarker,
    action: "move" | "start" | "end",
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (action === "move") {
      const mixedItems = selectedMixedTimelineMoveItems(
        "motion",
        `${part.id}:${marker.id}`,
      );
      if (mixedItems.length > 1) {
        const anchor = mixedItems.find(
          (item) =>
            item.kind === "motion" && item.id === `${part.id}:${marker.id}`,
        );
        if (anchor) {
          startMixedTimelineMove(event, anchor, mixedItems);
          return;
        }
      }
    }
    if (
      action !== "move" &&
      selectedMotionKeys.has(`${part.id}:${marker.id}`)
    ) {
      const mixedResizeItems = getSelectedMixedTimelineResizeItems();
      const hasOtherKind = mixedResizeItems.some(
        (item) => item.kind !== "motion",
      );
      if (hasOtherKind) {
        startMixedTimelineResize(
          event,
          action,
          undefined,
          undefined,
          undefined,
          { part, marker },
        );
        return;
      }
    }
    const motionKind = marker.kind;
    const dragItems = selectedMotionDragItems(part, marker);
    if (dragItems.length === 0 || isMotionMarkerLocked(marker)) return;
    const resizeTargets = selectedMotionResizeTargets(part, marker);
    const targetAlreadySelected = selectedMotionKeys.has(
      `${part.id}:${marker.id}`,
    );
    const isSelectionMove = action === "move" && dragItems.length > 1;
    const isSelectionResize =
      action !== "move" && targetAlreadySelected && resizeTargets.length > 1;
    if (!isSelectionMove && !isSelectionResize)
      onSelectMotionMarker(part.id, marker.id);
    const initialClientX = event.clientX;
    const initialClientY = event.clientY;
    const sourceLayerId = getMotionMarkerLayerId(marker);
    const initialScrollLeft = timelineViewportRef.current?.scrollLeft ?? 0;
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const activePartIds = new Map(
      dragItems.map((item) => [`${item.partId}:${item.markerId}`, item.partId]),
    );
    function getDeltaSeconds(clientX: number) {
      return getTimelineDragDeltaSeconds({
        initialClientX,
        clientX,
        initialScrollLeft,
        scrollLeft:
          timelineViewportRef.current?.scrollLeft ?? initialScrollLeft,
        pixelsPerSecond,
      });
    }

    function getMoveDragState(clientX: number, clientY: number, snap: boolean) {
      const deltaSeconds = getDeltaSeconds(clientX);
      const markerLayerLookup = new Map<string, string>();
      for (const item of dragItems) {
        const key = `${item.partId}:${item.markerId}`;
        if (!markerLayerLookup.has(key)) {
          const part = motionTimeline.find((p) => p.id === item.partId);
          const marker = part?.motionMarkers.find(
            (m) => m.id === item.markerId,
          );
          markerLayerLookup.set(
            key,
            getMotionMarkerLayerId(marker ?? { layerId: undefined }),
          );
        }
      }
      const movingKeys = new Set(
        dragItems.map((item) => `${item.partId}:${item.markerId}`),
      );
      const state = getTimelineMarkerMoveState({
        timeline: motionTimeline,
        dragItems,
        rawDeltaSeconds: deltaSeconds,
        timelineDuration: timelineDisplayDuration,
        snap,
        snapBoundaries: getUniversalTimelineSnapBoundaries(
          motionKind,
          movingKeys,
        ),
        snapThresholdSeconds,
        motionKind,
        activePartIds,
        layerLayout,
        sourceLayerId,
        markerLayerLookup,
        containerRect: getTimelineLayerContainerRect(),
        clientY,
        isLayerLocked,
      });
      updateTimelineSnapGuide(state.guideTime);
      return state;
    }

    function commitMoveDrag(clientX: number, clientY: number, snap: boolean) {
      const { moves } = getMoveDragState(clientX, clientY, snap);
      if (dragItems.length > 1) {
        onMoveMotionMarkers(moves);
        return;
      }

      const move = moves[0];
      if (move)
        onMoveMotionMarker(
          move.sourcePartId,
          move.markerId,
          move.targetPartId,
          move.start,
          move.targetLayerId,
        );
    }

    function getResizeDeltaSeconds(clientX: number, snap: boolean) {
      let deltaSeconds = getDeltaSeconds(clientX);
      if (!snap || (action !== "start" && action !== "end")) {
        clearTimelineSnapGuide();
        return deltaSeconds;
      }
      const movingKeys = new Set(
        dragItems.map((item) => `${item.partId}:${item.markerId}`),
      );
      const boundaries = getUniversalTimelineSnapBoundaries(
        motionKind,
        movingKeys,
      );
      const internalMendedEdge = isTimelineMarkerMendedEdge(
        motionTimeline,
        part as TimelinePartMotionView,
        marker,
        action,
      );
      const edgeTime =
        (internalMendedEdge
          ? part.start + marker.start + (action === "end" ? marker.duration : 0)
          : action === "end"
            ? Math.max(
                ...dragItems.map((item) => item.absoluteStart + item.duration),
              )
            : Math.min(...dragItems.map((item) => item.absoluteStart))) +
        deltaSeconds;
      const guideTime = getTimelineSnapGuideTime(
        edgeTime,
        boundaries,
        snapThresholdSeconds,
      );
      deltaSeconds += (guideTime ?? edgeTime) - edgeTime;
      updateTimelineSnapGuide(guideTime);
      return deltaSeconds;
    }

    function getResizeDragState(clientX: number, snap: boolean) {
      return getTimelineMarkerResizePreviewMap(getResizeMarkers(clientX, snap));
    }

    function getResizeMarkers(
      clientX: number,
      snap: boolean,
    ): Array<AbsoluteTimelineMarker<MotionMarker>> {
      const deltaSeconds = getResizeDeltaSeconds(clientX, snap);
      const resizedMarkers = resizeTargets.flatMap((target) =>
        getAbsoluteMarkerResizeState(
          getAbsoluteMotionResizeMarkers(target),
          target.marker.id,
          target.part.id,
          action as "start" | "end",
          deltaSeconds,
        ),
      );
      return uniqueAbsoluteTimelineMarkers(resizedMarkers);
    }

    function commitResizeDrag(clientX: number, snap: boolean) {
      onResizeMotionMarkers(
        getTimelineMarkerResizeCommits(
          getResizeMarkers(clientX, snap),
          timelinePrecision,
        ),
      );
    }

    function applyDrag(clientX: number, clientY: number, snap: boolean) {
      if (action === "move") {
        const { blockDeltaSeconds, layerTargets } = getMoveDragState(
          clientX,
          clientY,
          snap,
        );
        for (const item of dragItems) {
          const element = getTimelineMarkerElement(item.partId, item.markerId);
          if (!element) continue;
          const itemKey = `${item.partId}:${item.markerId}`;
          const targetLayerId = layerTargets.get(itemKey);
          const part = motionTimeline.find((p) => p.id === item.partId);
          const marker = part?.motionMarkers.find(
            (m) => m.id === item.markerId,
          );
          const itemSourceLayer = getMotionMarkerLayerId(
            marker ?? { layerId: undefined },
          );
          const normalizedItemSourceLayer = resolveTimelineMoveSourceLayer(
            layerLayout,
            "motion",
            itemSourceLayer,
          );
          const layerPreview = getLayerMoveDragPreview(
            layerLayout,
            normalizedItemSourceLayer,
            targetLayerId,
            isLayerLocked,
            "motion",
          );
          applyTimelineBlockPreview(element, {
            deltaX: blockDeltaSeconds * pixelsPerSecond,
            deltaY: layerPreview.deltaY,
            height: layerPreview.height,
          });
        }
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
      if (action === "move")
        window.requestAnimationFrame(() =>
          clearTimelineMarkerDragTransforms(dragItems),
        );
      else {
        clearTimelineBlockPreviews();
      }
    }

    startTimelinePointerTransaction({
      event,
      updateAutoScroll: updateTimelineDragAutoScroll,
      stopAutoScroll: stopTimelineDragAutoScroll,
      onDragStart: () => {
        setGlobalTimelineDragActive(true);
        setDraggingTimelineBlockCategory("motion");
      },
      onPreview: ({ clientX, clientY, snap }) =>
        applyDrag(clientX, clientY, snap),
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
    onTimelineLayersChange(
      (state) => {
        const category = getLayerCategory(layerId);
        return category
          ? renameTimelineStateLayer(
              state,
              category,
              layerId,
              nextName,
              defaultTimelineLayerState,
            )
          : state;
      },
      { history: true },
    );
  }

  function toggleLayerHidden(layerId: string) {
    const currentCategory = getLayerCategory(layerId);
    if (currentCategory && isLayerLocked(currentCategory, layerId)) return;
    onTimelineLayersChange(
      (state) => {
        const category = getLayerCategory(layerId);
        return category
          ? toggleTimelineStateLayerHidden(
              state,
              category,
              layerId,
              defaultTimelineLayerState,
            )
          : state;
      },
      { history: false },
    );
  }

  function toggleLayerLocked(layerId: string) {
    onTimelineLayersChange(
      (state) => {
        const category = getLayerCategory(layerId);
        return category
          ? toggleTimelineStateLayerLocked(
              state,
              category,
              layerId,
              defaultTimelineLayerState,
            )
          : state;
      },
      { history: false },
    );
  }

  function getLayerCategory(layerId: string): TimelineLayerCategory | null {
    if (compositionRows.some((row) => row.id === layerId)) return "comp";
    if (adjustmentRows.some((row) => row.key === layerId)) return "adjust";
    if (transitionRows.some((row) => row.key === layerId)) return "transition";
    if (motionLayers.some((row) => row.id === layerId)) return "motion";
    return null;
  }

  function isLayerLocked(
    category: TimelineLayerCategory,
    layerId: string | undefined,
  ) {
    if (!layerId) return false;
    if (category === "comp")
      return Boolean(compositionRows.find((row) => row.id === layerId)?.locked);
    if (category === "adjust")
      return Boolean(adjustmentRows.find((row) => row.key === layerId)?.locked);
    if (category === "transition")
      return Boolean(transitionRows.find((row) => row.key === layerId)?.locked);
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

  function isTransitionLocked(layer: TransitionLayer) {
    return isLayerLocked("transition", layer.layerId ?? layer.effect.effectId);
  }

  function cancelLayerNameEdit() {
    setEditingLayerId(null);
    setLayerNameDraft("");
  }

  function addMotionLayerAround(
    layerId: string,
    placement: "before" | "after",
  ) {
    if (isLayerLocked("motion", layerId)) return;
    onAddMotionLayer(undefined, layerId, placement);
    setMotionLayerMenuId(null);
  }

  function moveLayer(
    category: TimelineLayerCategory,
    layerId: string,
    direction: "up" | "down",
  ) {
    if (isLayerLocked(category, layerId)) return;
    onTimelineLayersChange(
      (state) =>
        moveTimelineStateLayer(
          state,
          category,
          layerId,
          direction,
          defaultTimelineLayerState,
        ),
      { history: true },
    );
    setMotionLayerMenuId(null);
  }

  function addCompositionLayerAround(
    layerId: string,
    placement: "before" | "after",
  ) {
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

  function addAdjustmentLayerAround(
    layerId: string,
    placement: "before" | "after",
  ) {
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

  function getSceneTimeFromClientX(clientX: number) {
    const rect = getTimelineLayerContainerRect();
    if (!rect) return currentSceneTime;
    return clamp(
      ((clientX - rect.left) / rect.width) * timelineDisplayDuration,
      0,
      timelineDisplayDuration,
    );
  }

  function getDropSceneTime(event: DragEvent<HTMLElement>) {
    return getSceneTimeFromClientX(event.clientX);
  }

  function getCompositionDropTargetFromPoint(clientX: number, clientY: number) {
    const rect = getTimelineLayerContainerRect();
    if (!rect) return null;
    const targetLayer = getTimelineLayerRowAtClientY(
      layerLayout,
      rect,
      clientY,
      "comp",
    )?.row.key;
    const compositionRow =
      compositionRows.find((row) => row.id === targetLayer) ??
      compositionRows.find((row) => !row.locked);
    if (!compositionRow || compositionRow.locked) return null;
    return {
      layerId: compositionRow.id,
      sceneTime: getSceneTimeFromClientX(clientX),
    };
  }

  function getCompositionDropTargetFromEvent(event: DragEvent<HTMLElement>) {
    return getCompositionDropTargetFromPoint(event.clientX, event.clientY);
  }

  function handleCompositionNativeDragOver(event: DragEvent<HTMLDivElement>) {
    const hasTimelineDrag = event.dataTransfer.types.includes(
      "application/x-clipper-timeline",
    );
    if (hasTimelineDrag) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setTimelineFileDragActive(true);
      updateEffectDragPreview(null);
      clearTimelineSnapGuide();
      return;
    }

    const textDrag = event.dataTransfer.getData("text/plain");
    const hasCompositionDrag =
      event.dataTransfer.types.includes("application/x-clipper-composition") ||
      isCompositionDragText(textDrag) ||
      Boolean(getActiveCompositionPointerDrag());
    if (!timelineMarkersEditable || !hasCompositionDrag) return;
    const target = getCompositionDropTargetFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleCompositionNativeDrop(event: DragEvent<HTMLDivElement>) {
    if (
      (
        event.nativeEvent as globalThis.DragEvent & {
          __clipperCompositionDropHandled?: boolean;
        }
      ).__clipperCompositionDropHandled
    )
      return;
    const timelineId = event.dataTransfer.getData(
      "application/x-clipper-timeline",
    );
    if (timelineId) {
      event.preventDefault();
      event.stopPropagation();
      setTimelineFileDragActive(false);
      updateEffectDragPreview(null);
      clearTimelineSnapGuide();
      stopTimelineDragAutoScroll();
      onOpenTimeline(timelineId);
      return;
    }

    const activeCompositionDrag = getActiveCompositionPointerDrag();
    const compositionId =
      event.dataTransfer.getData("application/x-clipper-composition") ||
      activeCompositionDrag?.compositionId ||
      event.dataTransfer.getData("text/plain") ||
      "";
    const target = getCompositionDropTargetFromEvent(event);
    if (!timelineMarkersEditable) return;
    if (!compositionId) return;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeCompositionDrag)
      previewCompositionDrop(
        activeCompositionDrag,
        target.layerId,
        target.sceneTime,
      );
    flushEffectDragPreview();
    const preview = effectDragPreviewRef.current;
    const sceneTime =
      preview?.category === "composition" &&
      preview.layerKey === target.layerId &&
      !preview.blocked
        ? preview.start
        : target.sceneTime;
    setGlobalTimelineDragActive(false);
    setClipperPointerDragPreview(compositionDragPreviewEvent, false);
    clearTimelineSnapGuide();
    stopTimelineDragAutoScroll();
    setActiveCompositionPointerDrag(null);
    if (isCompositionBlocked(sceneTime, 0.1, target.layerId, new Set())) {
      requestAnimationFrame(() => updateEffectDragPreview(null));
      return;
    }
    onAddComposition(compositionId, target.layerId, sceneTime);
    requestAnimationFrame(() => updateEffectDragPreview(null));
  }

  function handleTimelineViewportDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setTimelineFileDragActive(false);
    setGlobalTimelineDragActive(false);
    updateEffectDragPreview(null);
    setClipperPointerDragPreview(compositionDragPreviewEvent, false);
    setClipperPointerDragPreview(effectDragPreviewEvent, false);
  }

  function getDraggedEffect(event: DragEvent<HTMLElement>) {
    const types = Array.from(event.dataTransfer.types);
    const registeredType = types.find((type) =>
      type.startsWith("application/x-clipper-effect-"),
    );
    if (registeredType) {
      const effect = installedEffectPackages.find(
        (definition) => getEffectDragType(definition.id) === registeredType,
      )?.id;
      if (effect) return effect;
    }
    return (
      event.dataTransfer.getData("application/x-clipper-effect") ||
      event.dataTransfer.getData("text/plain")
    );
  }

  function getEffectForTimelineLane(
    effectId: string,
    laneCategory: TimelineLayerCategory,
  ) {
    return getTimelineEffectForLane(effectId, laneCategory);
  }

  function getDraggedEffectForTimelineLane(
    event: DragEvent<HTMLElement>,
    laneCategory: TimelineLayerCategory,
  ) {
    return getEffectForTimelineLane(getDraggedEffect(event), laneCategory);
  }

  function getDraggedAdjustmentEffect(event: DragEvent<HTMLElement>) {
    const effect = getDraggedEffectForTimelineLane(event, "adjust");
    return effect?.category === "adjustment"
      ? (effect as AdjustmentEffectPackage)
      : undefined;
  }

  function getDraggedMotionEffect(event: DragEvent<HTMLElement>) {
    const effect = getDraggedEffectForTimelineLane(event, "motion");
    return effect?.category === "motion"
      ? (effect as MotionEffectPackage)
      : undefined;
  }

  function getDraggedTransitionEffect(event: DragEvent<HTMLElement>) {
    const effect = getDraggedEffectForTimelineLane(event, "transition");
    return effect?.category === "transition"
      ? (effect as TransitionEffectPackage)
      : undefined;
  }

  function applyEffectDragPreviewElement(
    preview = effectDragPreviewRef.current,
  ) {
    const element = effectDragPreviewElementRef.current;
    if (!element || !preview) return;
    const rowIndex = layerRows.findIndex((row) => row.key === preview.layerKey);
    if (rowIndex < 0) return;
    const left =
      timelineDisplayDuration > 0
        ? (preview.start / timelineDisplayDuration) * contentWidth
        : 0;
    const width =
      timelineDisplayDuration > 0
        ? (preview.duration / timelineDisplayDuration) * contentWidth
        : 0;
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
    if (Boolean(current) !== Boolean(nextPreview))
      setClipperPointerDragPreview(
        effectDragPreviewEvent,
        Boolean(nextPreview),
      );
    if (!nextPreview) {
      if (effectDragPreviewFrameRef.current)
        window.cancelAnimationFrame(effectDragPreviewFrameRef.current);
      effectDragPreviewFrameRef.current = 0;
      clearTimelineSnapGuide();
      setEffectDragPreview(null);
      return;
    }

    const shouldRemount =
      !current ||
      current.category !== nextPreview.category ||
      current.effectId !== nextPreview.effectId ||
      current.label !== nextPreview.label ||
      current.isEmpty !== nextPreview.isEmpty ||
      current.sourceMissing !== nextPreview.sourceMissing ||
      current.layerKey !== nextPreview.layerKey ||
      current.duration !== nextPreview.duration ||
      current.blocked !== nextPreview.blocked;
    if (shouldRemount) setEffectDragPreview(nextPreview);
    else applyEffectDragPreviewElement(nextPreview);
  }

  function flushEffectDragPreview() {
    const preview = effectDragPreviewRef.current;
    if (!preview) return;
    flushSync(() => setEffectDragPreview(preview));
    applyEffectDragPreviewElement(preview);
  }

  function getEffectPreviewBase(
    effectId: string,
    layerKey: string,
    clientX: number,
    sceneTime: number,
  ) {
    const current = effectDragPreviewRef.current;
    if (current?.effectId === effectId && current.layerKey === layerKey)
      return current;
    const effect = getEffectPackage(effectId);
    if (!effect) return null;

    if (effect.category === "adjustment") {
      const placement = getAdjustmentPlacement(
        adjustmentLayers,
        sceneDuration,
        sceneTime,
      );
      return {
        category: "adjustment" as const,
        effectId,
        layerKey,
        start: placement.start,
        duration: placement.duration,
        initialClientX: clientX,
        initialStart: placement.start,
      };
    }

    if (effect.category === "transition") {
      const duration =
        getEffectPackageTimelineDefaultDuration(effectId) ??
        Math.min(defaultNewMarkerDurationSeconds, Math.max(sceneDuration, 0.1));
      const start = roundToPrecision(
        clamp(sceneTime, 0, timelineDisplayDuration),
        timelinePrecision,
      );
      return {
        category: "transition" as const,
        effectId,
        layerKey,
        start,
        duration,
        initialClientX: clientX,
        initialStart: start,
      };
    }

    const kind = effect.kind;
    const duration = Math.min(
      defaultNewMarkerDurationSeconds,
      Math.max(sceneDuration, 0.1),
    );
    const start = roundToPrecision(
      clamp(sceneTime - duration / 2, 0, timelineDisplayDuration),
      timelinePrecision,
    );
    return {
      category: "motion" as const,
      effectId,
      kind,
      layerKey,
      start,
      duration,
      initialClientX: clientX,
      initialStart: start,
    };
  }

  function getExternalDropTiming(
    start: number,
    duration: number,
    snap: boolean,
  ) {
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
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

  function getExternalTransitionDropTiming(
    start: number,
    duration: number,
    snap: boolean,
  ) {
    const pixelsPerSecond =
      (timelineRef.current?.getBoundingClientRect().width ?? 1) /
      Math.max(timelineDisplayDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const snapBoundaries = getUniversalBlockSnapBoundaries();
    const timing = getTimelineBlockTiming({
      action: "move",
      initialStart: clamp(start, 0, timelineDisplayDuration),
      initialDuration: duration,
      deltaSeconds: 0,
      timelineDuration: timelineDisplayDuration,
      moveMaxStartMode: "start",
      snap,
      snapBoundaries,
      snapThresholdSeconds,
    });

    if (!snap) return timing;

    const midpoint = timing.start + duration / 2;
    const midpointGuideTime = getTimelineSnapGuideTime(
      midpoint,
      snapBoundaries,
      snapThresholdSeconds,
    );
    if (midpointGuideTime === null) return timing;

    return {
      ...timing,
      start: roundToPrecision(
        clamp(
          timing.start + midpointGuideTime - midpoint,
          0,
          Math.max(timelineDisplayDuration - duration, 0),
        ),
        timelinePrecision,
      ),
      guideTime: midpointGuideTime,
    };
  }

  function updateExternalSnapGuide(guideTime: number | null) {
    if (guideTime === null) clearTimelineSnapGuide();
    else updateTimelineSnapGuide(guideTime);
  }

  function previewAdjustmentEffectDrop(
    effectId: AdjustmentEffectId,
    layerId: string,
    clientX: number,
    sceneTime: number,
    snap: boolean,
  ) {
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) return;
    const timing = getExternalDropTiming(sceneTime, base.duration, snap);
    updateExternalSnapGuide(timing.guideTime);
    updateEffectDragPreview({ ...base, start: timing.start });
  }

  function previewMotionEffectDrop(
    effectId: MotionEffectId,
    layerId: string,
    clientX: number,
    sceneTime: number,
    snap: boolean,
  ) {
    const effect = getMotionEffectPackage(effectId);
    const kind = effect?.kind;
    if (!kind) return;
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) {
      updateEffectDragPreview(null);
      return;
    }

    const timing = getExternalDropTiming(sceneTime, base.duration, snap);
    updateExternalSnapGuide(timing.guideTime);
    updateEffectDragPreview({ ...base, start: timing.start });
  }

  function isTransitionBlocked(
    start: number,
    duration: number,
    layerId: string,
    effectId: string,
  ): boolean {
    const effect = getEffectPackage(effectId);
    if (!effect?.tags?.includes("blocksOverlap")) return false;
    const end = start + duration;
    return transitionLayers.some((layer) => {
      if ((layer.layerId ?? layer.effect.effectId) !== layerId) return false;
      const layerEnd = layer.start + layer.duration;
      return start < layerEnd && end > layer.start;
    });
  }

  function previewTransitionEffectDrop(
    effectId: string,
    layerId: string,
    clientX: number,
    sceneTime: number,
    snap: boolean,
  ) {
    const base = getEffectPreviewBase(effectId, layerId, clientX, sceneTime);
    if (!base) return;
    const timing = getExternalTransitionDropTiming(
      sceneTime,
      base.duration,
      snap,
    );
    const blocked = isTransitionBlocked(
      timing.start,
      base.duration,
      layerId,
      effectId,
    );
    updateExternalSnapGuide(timing.guideTime);
    updateEffectDragPreview({ ...base, start: timing.start, blocked });
  }

  function previewCompositionDrop(
    detail: CompositionPointerDragDetail,
    layerId: string,
    sceneTime: number,
  ) {
    const duration = Math.max(detail.duration, 0.1);
    const timing = getExternalDropTiming(sceneTime, duration, detail.shiftKey);
    const start = timing.start;
    updateExternalSnapGuide(timing.guideTime);
    const blocked = isCompositionBlocked(start, duration, layerId, new Set());
    const current = effectDragPreviewRef.current;
    const base =
      current?.category === "composition" &&
      current.layerKey === layerId &&
      current.label === detail.label &&
      current.duration === duration &&
      current.isEmpty === detail.isEmpty &&
      current.sourceMissing === detail.sourceMissing
        ? current
        : {
            category: "composition" as const,
            layerKey: layerId,
            label: detail.label,
            isEmpty: detail.isEmpty,
            sourceMissing: detail.sourceMissing,
            start,
            duration,
            initialClientX: detail.clientX,
            initialStart: start,
          };
    updateEffectDragPreview({ ...base, start, blocked });
  }

  function allowAdjustmentEffectDrop(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("adjust", layerId)) return;
    const effect = getDraggedAdjustmentEffect(event);
    if (!effect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewAdjustmentEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
  }

  function dropAdjustmentEffect(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("adjust", layerId)) return;
    const effect = getDraggedAdjustmentEffect(event);
    if (!effect) return;
    event.preventDefault();
    previewAdjustmentEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
    flushEffectDragPreview();
    const previewStart =
      effectDragPreviewRef.current?.category === "adjustment" &&
      effectDragPreviewRef.current.effectId === effect.id &&
      effectDragPreviewRef.current.layerKey === layerId
        ? effectDragPreviewRef.current.start
        : sceneTime;
    onAddAdjustmentEffect(effect.id, previewStart, layerId);
    requestAnimationFrame(() => updateEffectDragPreview(null));
  }

  function allowMotionEffectDrop(
    event: DragEvent<HTMLElement>,
    kind: MotionEffectKind,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getDraggedMotionEffect(event);
    if (effect?.kind !== kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
  }

  function allowMotionLayerEffectDrop(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getDraggedMotionEffect(event);
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewMotionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
  }

  function allowTransitionEffectDrop(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("transition", layerId)) return;
    const effect = getDraggedTransitionEffect(event);
    if (!effect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    previewTransitionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
  }

  function dropTransitionEffect(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("transition", layerId)) return;
    const effect = getDraggedTransitionEffect(event);
    if (!effect) return;
    event.preventDefault();
    previewTransitionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
    flushEffectDragPreview();
    const previewStart =
      effectDragPreviewRef.current?.category === "transition" &&
      effectDragPreviewRef.current.effectId === effect.id &&
      effectDragPreviewRef.current.layerKey === layerId
        ? effectDragPreviewRef.current.start
        : sceneTime;
    const blocked = isTransitionBlocked(
      previewStart,
      effect.defaultDuration,
      layerId,
      effect.id,
    );
    if (blocked) {
      requestAnimationFrame(() => updateEffectDragPreview(null));
      return;
    }
    onAddTransitionEffect?.(effect.id, previewStart, layerId);
    requestAnimationFrame(() => updateEffectDragPreview(null));
  }

  function dropMotionEffect(
    event: DragEvent<HTMLElement>,
    kind: MotionEffectKind,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getDraggedMotionEffect(event);
    if (effect?.kind !== kind) return;
    event.preventDefault();
    previewMotionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
    flushEffectDragPreview();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime =
      preview?.effectId === effect.id && preview.layerKey === layerId
        ? preview.start
        : sceneTime;
    onAddMotionEffect(effect.id, layerId, targetSceneTime);
    requestAnimationFrame(() => updateEffectDragPreview(null));
  }

  function dropMotionLayerEffect(
    event: DragEvent<HTMLElement>,
    layerId: string,
    sceneTime = getDropSceneTime(event),
  ) {
    if (isLayerLocked("motion", layerId)) return;
    const effect = getDraggedMotionEffect(event);
    const layer = motionLayers.find((item) => item.id === layerId);
    if (!effect || !layer) return;
    event.preventDefault();
    previewMotionEffectDrop(
      effect.id,
      layerId,
      event.clientX,
      sceneTime,
      event.shiftKey,
    );
    flushEffectDragPreview();
    const preview = effectDragPreviewRef.current;
    const targetSceneTime =
      preview?.effectId === effect.id && preview.layerKey === layerId
        ? preview.start
        : sceneTime;
    onAddMotionEffect(effect.id, layerId, targetSceneTime);
    requestAnimationFrame(() => updateEffectDragPreview(null));
  }

  function getEffectPointerDropTarget(clientX: number, clientY: number) {
    const rect = getTimelineLayerContainerRect();
    if (
      !rect ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    )
      return null;
    const target = getTimelineLayerRowAtClientY(layerLayout, rect, clientY);
    return target
      ? { rowKey: target.row.key, sceneTime: getSceneTimeFromClientX(clientX) }
      : null;
  }

  function isEffectPointerOverTimeline(clientX: number, clientY: number) {
    const rect = timelinePanelRef.current?.getBoundingClientRect();
    return Boolean(
      rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
    );
  }

  function updateExternalPointerAutoScroll<
    T extends EffectPointerDragDetail | CompositionPointerDragDetail,
  >(eventName: string, detail: T) {
    if (
      detail.phase === "drop" ||
      !isEffectPointerOverTimeline(detail.clientX, detail.clientY)
    ) {
      stopTimelineDragAutoScroll();
      return;
    }
    updateTimelineDragAutoScroll(
      detail.clientX,
      () => {
        window.dispatchEvent(
          new CustomEvent<T>(eventName, {
            detail: { ...detail, phase: "move" },
          }),
        );
      },
      detail.clientY,
    );
  }

  function handleSharedPointerDrag<
    T extends EffectPointerDragDetail | CompositionPointerDragDetail,
  >(
    detail: T | null | undefined,
    eventName: string,
    previewEventName: string | null,
    resolveTarget: (target: { rowKey: string; sceneTime: number }) => {
      valid: boolean;
      handlePreview: () => void;
      handleDrop: () => void;
    } | null,
  ) {
    if (!detail) return;
    if (detail.phase === "cancel") {
      setGlobalTimelineDragActive(false);
      updateEffectDragPreview(null);
      if (previewEventName)
        setClipperPointerDragPreview(previewEventName, false);
      clearTimelineSnapGuide();
      stopTimelineDragAutoScroll();
      return;
    }

    const overTimeline = isEffectPointerOverTimeline(
      detail.clientX,
      detail.clientY,
    );
    setGlobalTimelineDragActive(detail.phase !== "drop" && overTimeline);
    updateExternalPointerAutoScroll(eventName, detail);

    const target = getEffectPointerDropTarget(detail.clientX, detail.clientY);
    const resolved = target ? resolveTarget(target) : null;

    if (previewEventName)
      setClipperPointerDragPreview(
        previewEventName,
        Boolean(resolved?.valid && detail.phase !== "drop"),
      );

    if (!resolved || !resolved.valid) {
      if (detail.phase === "drop") {
        setGlobalTimelineDragActive(false);
        if (previewEventName)
          setClipperPointerDragPreview(previewEventName, false);
        stopTimelineDragAutoScroll();
      }
      updateEffectDragPreview(null);
      clearTimelineSnapGuide();
      return;
    }

    if (detail.phase === "drop") {
      setGlobalTimelineDragActive(false);
      if (previewEventName)
        setClipperPointerDragPreview(previewEventName, false);
      clearTimelineSnapGuide();
      stopTimelineDragAutoScroll();
      resolved.handlePreview();
      flushEffectDragPreview();
      resolved.handleDrop();
      requestAnimationFrame(() => updateEffectDragPreview(null));
      return;
    }

    resolved.handlePreview();
  }

  useEffect(() => {
    function handleEffectPointerDrag(event: Event) {
      const detail = (event as CustomEvent<EffectPointerDragDetail>).detail;
      if (!isCompositionMode) return;

      handleSharedPointerDrag(
        detail,
        effectPointerDragEvent,
        effectDragPreviewEvent,
        (target) => {
          const transitionEffect = getEffectForTimelineLane(
            detail.effect,
            "transition",
          ) as TransitionEffectPackage | undefined;
          const adjustmentEffect = getEffectForTimelineLane(
            detail.effect,
            "adjust",
          ) as AdjustmentEffectPackage | undefined;
          const motionEffect = getEffectForTimelineLane(
            detail.effect,
            "motion",
          ) as MotionEffectPackage | undefined;

          const transitionRow = transitionEffect
            ? transitionRows.find((row) => row.key === target.rowKey)
            : null;
          if (transitionEffect && transitionRow) {
            return {
              valid: !transitionRow.locked,
              handlePreview: () =>
                previewTransitionEffectDrop(
                  transitionEffect.id,
                  transitionRow.key,
                  detail.clientX,
                  target.sceneTime,
                  detail.shiftKey,
                ),
              handleDrop: () => {
                const previewStart =
                  effectDragPreviewRef.current?.category === "transition" &&
                  effectDragPreviewRef.current.effectId ===
                    transitionEffect.id &&
                  effectDragPreviewRef.current.layerKey === transitionRow.key
                    ? effectDragPreviewRef.current.start
                    : target.sceneTime;
                const blocked =
                  effectDragPreviewRef.current?.category === "transition" &&
                  effectDragPreviewRef.current.blocked;
                if (!blocked)
                  onAddTransitionEffect?.(
                    transitionEffect.id,
                    previewStart,
                    transitionRow.key,
                  );
              },
            };
          }

          const adjustmentRow = adjustmentRows.find(
            (row) => row.key === target.rowKey,
          );
          if (adjustmentEffect && adjustmentRow) {
            return {
              valid: !adjustmentRow.locked,
              handlePreview: () =>
                previewAdjustmentEffectDrop(
                  adjustmentEffect.id,
                  adjustmentRow.key,
                  detail.clientX,
                  target.sceneTime,
                  detail.shiftKey,
                ),
              handleDrop: () => {
                const previewStart =
                  effectDragPreviewRef.current?.category === "adjustment" &&
                  effectDragPreviewRef.current.effectId ===
                    adjustmentEffect.id &&
                  effectDragPreviewRef.current.layerKey === adjustmentRow.key
                    ? effectDragPreviewRef.current.start
                    : target.sceneTime;
                onAddAdjustmentEffect(
                  adjustmentEffect.id,
                  previewStart,
                  adjustmentRow.key,
                );
              },
            };
          }

          const layer = motionEffect
            ? motionLayers.find((item) => item.id === target.rowKey)
            : null;
          if (motionEffect && layer) {
            return {
              valid: !layer.locked,
              handlePreview: () =>
                previewMotionEffectDrop(
                  motionEffect.id,
                  layer.id,
                  detail.clientX,
                  target.sceneTime,
                  detail.shiftKey,
                ),
              handleDrop: () => {
                const preview = effectDragPreviewRef.current;
                const targetSceneTime =
                  preview?.effectId === motionEffect.id &&
                  preview.layerKey === layer.id
                    ? preview.start
                    : target.sceneTime;
                onAddMotionEffect(motionEffect.id, layer.id, targetSceneTime);
              },
            };
          }

          return null;
        },
      );
    }

    window.addEventListener(effectPointerDragEvent, handleEffectPointerDrag);
    return () =>
      window.removeEventListener(
        effectPointerDragEvent,
        handleEffectPointerDrag,
      );
  });

  useEffect(() => {
    function handleCompositionPointerDrag(event: Event) {
      const detail = (event as CustomEvent<CompositionPointerDragDetail>)
        .detail;

      handleSharedPointerDrag(
        detail,
        compositionPointerDragEvent,
        compositionDragPreviewEvent,
        (target) => {
          const compositionRow = compositionRows.find(
            (row) => row.id === target.rowKey,
          );
          if (compositionRow) {
            return {
              valid: !compositionRow.locked,
              handlePreview: () =>
                previewCompositionDrop(
                  detail,
                  compositionRow.id,
                  target.sceneTime,
                ),
              handleDrop: () => {
                const preview = effectDragPreviewRef.current;
                const targetStart =
                  preview?.category === "composition" &&
                  preview.layerKey === compositionRow.id &&
                  !preview.blocked
                    ? preview.start
                    : target.sceneTime;
                setActiveCompositionPointerDrag(null);
                if (preview?.category === "composition" && preview.blocked)
                  return;
                onAddComposition(
                  detail.compositionId,
                  compositionRow.id,
                  targetStart,
                );
              },
            };
          }
          return null;
        },
      );
    }

    window.addEventListener(
      compositionPointerDragEvent,
      handleCompositionPointerDrag,
    );
    return () =>
      window.removeEventListener(
        compositionPointerDragEvent,
        handleCompositionPointerDrag,
      );
  });

  const { startTimelineRowResize: startLayerRowResize } = useTimelineRowResize({
    rowHeights: timelineLayers.rowHeights ?? {},
    setPreviewRowHeights: setResizePreviewRowHeights,
    onCommitRowHeights: (nextHeights) =>
      onTimelineLayersChange(
        (state) => ({ ...state, rowHeights: nextHeights }),
        { history: true },
      ),
    onCanResizeRow: (rowKey) => {
      const category = getLayerCategory(rowKey);
      return !(category && isLayerLocked(category, rowKey));
    },
    onDragActiveChange: setGlobalTimelineDragActive,
  });

  useLayoutEffect(() => {
    if (effectDragPreview) applyEffectDragPreviewElement(effectDragPreview);
  }, [
    effectDragPreview,
    contentWidth,
    layerRows,
    layerRowStarts,
    layerRowHeights,
    timelineDisplayDuration,
  ]);

  return (
    <TimelineShell
      activeMode={mode}
      contentWidth={contentWidth}
      currentTime={currentSceneTime}
      displayDuration={timelineDisplayDuration}
      dragActive={timelineDragActive || timelineFileDragActive}
      dragOverlayLabel={timelineFileDragActive ? "Open timeline" : undefined}
      laneContentHeight={laneContentHeight}
      laneRowsStyle={laneRowsStyle}
      layerRailWidth={layerRailWidth}
      prerenderCacheCoverage={prerenderCacheCoverage}
      refs={{
        playbackPlayheadRef,
        timelineRef,
        timelineViewportRef,
        timelineLayerRailRef,
        timelineSnapGuideRef,
        timelinePanelRef,
      }}
      timelineName={timelineName}
      timelineZoom={timelineZoom}
      ticks={ticks}
      onModeChange={onModeChange}
      onTimelineViewportDragLeave={handleTimelineViewportDragLeave}
      onTimelineViewportDragOver={handleCompositionNativeDragOver}
      onTimelineViewportDrop={handleCompositionNativeDrop}
      onTimelineViewportScroll={saveTimelineDisplacement}
      onTimelineZoomChange={updateTimelineZoom}
      rulerHandlers={{
        onPointerDown: startScrub,
        onPointerMove: continueScrub,
        onPointerUp: endScrub,
        onPointerCancel: endScrub,
      }}
      renderLayerRail={() => (
        <>
          <span className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-[#39404d]" />
          {layerRows.map((row, index) => (
            <span
              className="pointer-events-none absolute right-0 z-40 w-0.5"
              key={`layer-accent-${row.key}`}
              style={{
                top: layerRowStarts[index],
                height: layerRowHeights[index],
                backgroundColor: row.accent,
              }}
            />
          ))}
          {layerRows.length > 0 ? (
            <LayerResizeSeparator
              key={`label-separator-${layerRows[0].key}-top`}
              top={0}
              onPointerDown={(event) =>
                startLayerRowResize(event, layerRows[0].key, "top")
              }
            />
          ) : null}
          {layerRows.slice(1).map((row, index) => (
            <LayerResizeSeparator
              key={`label-separator-${row.key}`}
              top={layerRowStarts[index + 1]}
              onPointerDown={(event) =>
                startLayerRowResize(event, row.key, "top")
              }
            />
          ))}
          {isCompositionMode
            ? transitionRows.map((row, index) => (
                <LayerLabel
                  key={row.key}
                  editing={editingLayerId === row.key}
                  hidden={row.hidden}
                  locked={row.locked}
                  compactControls={layerRowHeights[index] < 50}
                  hideHiddenControl
                  hideLockControl={layerRowHeights[index] < 58}
                  menuOpen={motionLayerMenuId === row.key}
                  name={row.name}
                  draft={layerNameDraft}
                  onDraftChange={setLayerNameDraft}
                  onEdit={() => startLayerNameEdit(row.key, row.name)}
                  onCommit={commitLayerNameEdit}
                  onCancel={cancelLayerNameEdit}
                  onEffectDragOver={(event) =>
                    allowTransitionEffectDrop(event, row.key)
                  }
                  onEffectDrop={(event) => dropTransitionEffect(event, row.key)}
                  onMenuToggle={() =>
                    setMotionLayerMenuId((current) =>
                      current === row.key ? null : row.key,
                    )
                  }
                  onToggleHidden={() => toggleLayerHidden(row.key)}
                  onToggleLocked={() => toggleLayerLocked(row.key)}
                />
              ))
            : null}
          {isCompositionMode
            ? adjustmentRows.map((row, index) => (
                <LayerLabel
                  key={row.key}
                  editing={editingLayerId === row.key}
                  hidden={row.hidden}
                  locked={row.locked}
                  compactControls={
                    layerRowHeights[transitionRows.length + index] < 50
                  }
                  hideLockControl={
                    layerRowHeights[transitionRows.length + index] < 58
                  }
                  menuOpen={motionLayerMenuId === row.key}
                  name={row.name}
                  draft={layerNameDraft}
                  canMoveDown={index < adjustmentRows.length - 1}
                  canMoveUp={index > 0}
                  addBeforeLabel="Add adjust above"
                  addAfterLabel="Add adjust below"
                  removeLabel="Remove adjust"
                  onDraftChange={setLayerNameDraft}
                  onEdit={() => startLayerNameEdit(row.key, row.name)}
                  onCommit={commitLayerNameEdit}
                  onCancel={cancelLayerNameEdit}
                  onEffectDragOver={(event) =>
                    allowAdjustmentEffectDrop(event, row.key)
                  }
                  onEffectDrop={(event) => dropAdjustmentEffect(event, row.key)}
                  onMenuToggle={() =>
                    setMotionLayerMenuId((current) =>
                      current === row.key ? null : row.key,
                    )
                  }
                  onAddBefore={() =>
                    addAdjustmentLayerAround(row.key, "before")
                  }
                  onAddAfter={() => addAdjustmentLayerAround(row.key, "after")}
                  onMoveUp={() => moveAdjustmentRow(row.key, "up")}
                  onMoveDown={() => moveAdjustmentRow(row.key, "down")}
                  onRemove={() => removeAdjustmentLayer(row.key)}
                  onToggleHidden={() => toggleLayerHidden(row.key)}
                  onToggleLocked={() => toggleLayerLocked(row.key)}
                />
              ))
            : null}
          {isCompositionMode
            ? motionLayers.map((layer, index) => (
                <LayerLabel
                  key={layer.id}
                  editing={editingLayerId === layer.id}
                  hidden={Boolean(layer.hidden)}
                  locked={Boolean(layer.locked)}
                  compactControls={
                    layerRowHeights[
                      transitionRows.length + adjustmentRows.length + index
                    ] < 50
                  }
                  hideLockControl={
                    layerRowHeights[
                      transitionRows.length + adjustmentRows.length + index
                    ] < 58
                  }
                  menuOpen={motionLayerMenuId === layer.id}
                  name={layer.name}
                  draft={layerNameDraft}
                  canMoveDown={index < motionLayers.length - 1}
                  canMoveUp={index > 0}
                  addBeforeLabel="Add motion above"
                  addAfterLabel="Add motion below"
                  removeLabel="Remove motion"
                  onDraftChange={setLayerNameDraft}
                  onEdit={() => startLayerNameEdit(layer.id, layer.name)}
                  onCommit={commitLayerNameEdit}
                  onCancel={cancelLayerNameEdit}
                  onEffectDragOver={(event) =>
                    allowMotionLayerEffectDrop(event, layer.id)
                  }
                  onEffectDrop={(event) =>
                    dropMotionLayerEffect(event, layer.id)
                  }
                  onMenuToggle={() =>
                    setMotionLayerMenuId((current) =>
                      current === layer.id ? null : layer.id,
                    )
                  }
                  onAddBefore={() => addMotionLayerAround(layer.id, "before")}
                  onAddAfter={() => addMotionLayerAround(layer.id, "after")}
                  onMoveUp={() => moveMotionLayer(layer.id, "up")}
                  onMoveDown={() => moveMotionLayer(layer.id, "down")}
                  onRemove={() => removeMotionLayer(layer.id)}
                  onToggleHidden={() => toggleLayerHidden(layer.id)}
                  onToggleLocked={() => toggleLayerLocked(layer.id)}
                />
              ))
            : null}
          {compositionRows.map((layer, index) => (
            <LayerLabel
              key={layer.id}
              editing={editingLayerId === layer.id}
              hidden={Boolean(layer.hidden)}
              locked={Boolean(layer.locked)}
              compactControls={
                layerRowHeights[
                  (isCompositionMode
                    ? transitionRows.length +
                      adjustmentRows.length +
                      motionLayers.length
                    : 0) + index
                ] < 50
              }
              hideLockControl={
                layerRowHeights[
                  (isCompositionMode
                    ? transitionRows.length +
                      adjustmentRows.length +
                      motionLayers.length
                    : 0) + index
                ] < 58
              }
              menuOpen={motionLayerMenuId === layer.id}
              name={layer.name}
              draft={layerNameDraft}
              canMoveDown={index < compositionRows.length - 1}
              canMoveUp={index > 0}
              addBeforeLabel="Add composition above"
              addAfterLabel="Add composition below"
              removeLabel="Remove composition"
              onDraftChange={setLayerNameDraft}
              onEdit={() => startLayerNameEdit(layer.id, layer.name)}
              onCommit={commitLayerNameEdit}
              onCancel={cancelLayerNameEdit}
              onMenuToggle={() =>
                setMotionLayerMenuId((current) =>
                  current === layer.id ? null : layer.id,
                )
              }
              onAddBefore={() => addCompositionLayerAround(layer.id, "before")}
              onAddAfter={() => addCompositionLayerAround(layer.id, "after")}
              onMoveUp={() => moveCompositionLayer(layer.id, "up")}
              onMoveDown={() => moveCompositionLayer(layer.id, "down")}
              onRemove={() => removeCompositionLayer(layer.id)}
              onToggleHidden={() => toggleLayerHidden(layer.id)}
              onToggleLocked={() => toggleLayerLocked(layer.id)}
            />
          ))}
        </>
      )}
      renderTimelineViewport={() => (
        <>
          {timelineSelectionDrag ? (
            <TimelineSelectionBox
              boxRef={timelineSelectionBoxRef}
              drag={timelineSelectionDrag}
            />
          ) : null}
          {selectedTimelineGap ? (
            <TimelineBlankGapHighlight
              gap={selectedTimelineGap}
              rowIndex={layerRows.findIndex(
                (row) =>
                  row.key === selectedTimelineGap.rowKey &&
                  row.category === selectedTimelineGap.category,
              )}
              rowStarts={layerRowStarts}
              rowHeights={layerRowHeights}
              timelineDisplayDuration={timelineDisplayDuration}
            />
          ) : null}
          {isCompositionMode
            ? transitionRows.map((row, index) => (
                <TimelineLayerLane
                  key={row.key}
                  hidden={row.hidden}
                  locked={row.locked}
                  overflowVisible
                  className="z-10 block"
                  onPointerDown={startTimelineSelection}
                  onPointerMove={continueTimelineSelection}
                  onPointerUp={endTimelineSelection}
                  onPointerCancel={endTimelineSelection}
                  onContextMenu={openBlankTimelineContextMenu}
                >
                  {transitionLayers
                    .filter(
                      (layer) =>
                        (layer.layerId ?? layer.effect.effectId) === row.key,
                    )
                    .map((layer) => {
                      const previewLayer =
                        timelineBlockPreviews?.[
                          timelineBlockPreviewKey("transition", layer.id)
                        ] ?? layer;
                      const blocked =
                        "blocked" in previewLayer
                          ? previewLayer.blocked
                          : undefined;
                      const selected =
                        selectedTransitionLayerIds.has(layer.id) ||
                        layer.id === selectedTransitionLayerId;
                      const markerTags = getEffectPackage(
                        layer.effect.effectId,
                      )?.timelineTags;
                      const primaryMarkerTag = markerTags?.[0];
                      const stripeHeight = Math.max(
                        layerRowHeights[index] ?? 0,
                        laneContentHeight - (layerRowStarts[index] ?? 0),
                      );
                      const stripeTint = blocked
                        ? "rgba(220,38,38,0.18)"
                        : "rgba(255,140,66,0.14)";
                      const stripeEdge = blocked
                        ? "rgba(248,113,113,0.36)"
                        : "rgba(255,184,112,0.32)";
                      const transitionWidthPercent =
                        (previewLayer.duration / timelineDisplayDuration) * 100;
                      const showTransitionLabel = transitionWidthPercent >= 1.8;
                      return (
                        <div
                          data-timeline-control
                          data-timeline-marker-kind="transition"
                          data-timeline-transition-id={layer.id}
                          key={layer.id}
                          className={`pointer-events-none absolute top-0 box-border ${selected ? "z-30" : "z-10"}`}
                          style={{
                            left: `${(previewLayer.start / timelineDisplayDuration) * 100}%`,
                            width: `calc(${(previewLayer.duration / timelineDisplayDuration) * 100}% + var(--clipper-transition-resize-width, 0px))`,
                            height: stripeHeight,
                          }}
                        >
                          <div
                            className="pointer-events-none absolute inset-x-0 top-0 rounded-[3px]"
                            style={{
                              height: stripeHeight,
                              background: `linear-gradient(90deg, transparent 0, ${stripeEdge} 1px, ${stripeTint} 1px, ${stripeTint} calc(100% - 1px), ${stripeEdge} calc(100% - 1px), transparent 100%)`,
                              backdropFilter: "brightness(1.28) saturate(1.25)",
                              filter:
                                "drop-shadow(0 0 8px rgba(255, 140, 66, 0.18))",
                              boxShadow: selected
                                ? "0 0 0 1px rgba(255,255,255,0.34), 0 0 18px rgba(255,140,66,0.16)"
                                : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                            }}
                          />
                          {showTransitionLabel ? (
                            <div
                              className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col items-end justify-center gap-1.5 overflow-hidden pr-1.5"
                              style={{ height: stripeHeight }}
                            >
                              {primaryMarkerTag?.label ? (
                                <span
                                  className="inline-flex items-center rounded-[3px] border border-white/25 bg-black/24 px-0.5 py-1 text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/85 shadow-[0_1px_2px_rgba(0,0,0,0.25)] [writing-mode:vertical-rl]"
                                  title={
                                    primaryMarkerTag.title ??
                                    primaryMarkerTag.label
                                  }
                                >
                                  {primaryMarkerTag.label}
                                </span>
                              ) : null}
                              <span
                                className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45 [writing-mode:vertical-rl]"
                                title={layer.name}
                              >
                                {layer.name}
                              </span>
                            </div>
                          ) : null}
                          <div
                            className={`pointer-events-auto absolute inset-x-0 top-0 h-full cursor-grab rounded-[3px] border backdrop-blur-[1px] active:cursor-grabbing ${row.locked ? "opacity-45" : selected ? "opacity-95" : "opacity-80"}`}
                            role="button"
                            tabIndex={0}
                            style={{
                              height: layerRowHeights[index],
                              borderColor: selected
                                ? "rgba(255,255,255,0.42)"
                                : stripeEdge,
                              background: blocked
                                ? "rgba(127,29,29,0.22)"
                                : "rgba(255,140,66,0.10)",
                            }}
                            onClick={
                              row.locked
                                ? undefined
                                : () => onSelectTransitionLayer?.(layer.id)
                            }
                            onPointerDown={(event) => {
                              if (row.locked) {
                                event.preventDefault();
                                event.stopPropagation();
                                return;
                              }
                              updateTransitionFromPointer(event, layer, "move");
                            }}
                            onContextMenu={
                              row.locked
                                ? undefined
                                : (event) =>
                                    openTimelineNodeContextMenu(event, {
                                      kind: "transition",
                                      layerId: layer.id,
                                    })
                            }
                          >
                            <span className="sr-only">{layer.name}</span>
                            <span className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/30" />
                          </div>
                          <div
                            className="pointer-events-auto absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                            style={{ height: layerRowHeights[index] }}
                            onPointerDown={
                              row.locked
                                ? undefined
                                : (event) =>
                                    updateTransitionFromPointer(
                                      event,
                                      layer,
                                      "start",
                                    )
                            }
                          />
                          <div
                            className="pointer-events-auto absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                            style={{ height: layerRowHeights[index] }}
                            onPointerDown={
                              row.locked
                                ? undefined
                                : (event) =>
                                    updateTransitionFromPointer(
                                      event,
                                      layer,
                                      "end",
                                    )
                            }
                          />
                        </div>
                      );
                    })}
                </TimelineLayerLane>
              ))
            : null}
          {isCompositionMode
            ? adjustmentRows.map((row) => (
                <TimelineLayerLane
                  key={row.key}
                  hidden={row.hidden}
                  locked={row.locked}
                  overflowVisible={isDraggingAdjustmentLayer}
                  className="block"
                  onDragOver={(event) =>
                    allowAdjustmentEffectDrop(event, row.key)
                  }
                  onDrop={(event) => dropAdjustmentEffect(event, row.key)}
                  onPointerDown={startTimelineSelection}
                  onPointerMove={continueTimelineSelection}
                  onPointerUp={endTimelineSelection}
                  onPointerCancel={endTimelineSelection}
                  onContextMenu={openBlankTimelineContextMenu}
                >
                  {adjustmentLayers
                    .filter(
                      (layer) => getAdjustmentLayerRowId(layer) === row.key,
                    )
                    .map((layer) => {
                      const previewLayer =
                        timelineBlockPreviews?.[
                          timelineBlockPreviewKey("adjustment", layer.id)
                        ] ?? layer;
                      const markerTags = getEffectPackage(
                        layer.effect.effectId,
                      )?.timelineTags;
                      return (
                        <TimelineBlock
                          variant="adjustment"
                          dataAttributes={{
                            "data-timeline-marker-kind": "adjustment",
                            "data-timeline-adjustment-id": layer.id,
                          }}
                          key={layer.id}
                          locked={row.locked}
                          selected={
                            selectedAdjustmentLayerIds.has(layer.id) ||
                            layer.id === selectedAdjustmentLayerId
                          }
                          style={{
                            left: `${(previewLayer.start / timelineDisplayDuration) * 100}%`,
                            width: `calc(${(previewLayer.duration / timelineDisplayDuration) * 100}% + var(--clipper-adjustment-resize-width, 0px))`,
                          }}
                          onPointerDown={(event) =>
                            updateAdjustmentFromPointer(event, layer, "move")
                          }
                          onClick={() => onSelectAdjustmentLayer(layer.id)}
                          onLeftResize={(event) =>
                            updateAdjustmentFromPointer(event, layer, "start")
                          }
                          onRightResize={(event) =>
                            updateAdjustmentFromPointer(event, layer, "end")
                          }
                          onContextMenu={(event) =>
                            openTimelineNodeContextMenu(event, {
                              kind: "adjustment",
                              layerId: layer.id,
                            })
                          }
                        >
                          <span className="pointer-events-none flex min-w-0 flex-col items-start overflow-hidden">
                            <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                              {layer.name}
                            </span>
                            <TimelineMarkerTags tags={markerTags} />
                          </span>
                        </TimelineBlock>
                      );
                    })}
                </TimelineLayerLane>
              ))
            : null}
          {isCompositionMode
            ? motionLayers.map((layer) => (
                <MotionLane
                  key={layer.id}
                  layerId={layer.id}
                  hidden={Boolean(layer.hidden)}
                  locked={Boolean(layer.locked)}
                  timeline={motionTimeline}
                  sceneDuration={timelineDisplayDuration}
                  overflowVisible={isDraggingMotionMarker}
                  timelineBlockPreviews={timelineBlockPreviews}
                  selectedMotionKeys={selectedMotionKeys}
                  selectedMotionMarkerId={selectedMotionMarkerId}
                  selectedMotionMarkerPartId={selectedMotionMarkerPartId}
                  onEffectDragOver={(event) =>
                    allowMotionLayerEffectDrop(event, layer.id)
                  }
                  onEffectDrop={(event) =>
                    dropMotionLayerEffect(event, layer.id)
                  }
                  onStartSelection={startTimelineSelection}
                  onMoveSelection={continueTimelineSelection}
                  onEndSelection={endTimelineSelection}
                  onOpenBlankContextMenu={openBlankTimelineContextMenu}
                  onSelectMotionMarker={onSelectMotionMarker}
                  onOpenNodeContextMenu={openTimelineNodeContextMenu}
                  onUpdateMotionFromPointer={updateMotionMarkerFromPointer}
                />
              ))
            : null}
          {effectDragPreview ? (
            <EffectDragPreviewBlock
              blockRef={effectDragPreviewElementRef}
              preview={effectDragPreview}
            />
          ) : null}
          {compositionRows.map((row) => (
            <TimelineLayerLane
              key={row.id}
              hidden={Boolean(row.hidden)}
              locked={Boolean(row.locked)}
              overflowVisible={
                timelineMarkersEditable && isDraggingCompositionBlock
              }
              className="block"
              onDragOver={(event) => {
                if (
                  timelineMarkersEditable &&
                  !row.locked &&
                  (event.dataTransfer.types.includes(
                    "application/x-clipper-composition",
                  ) ||
                    isCompositionDragText(
                      event.dataTransfer.getData("text/plain"),
                    ) ||
                    getActiveCompositionPointerDrag())
                )
                  event.preventDefault();
              }}
              onDrop={handleCompositionNativeDrop}
              onPointerDown={startTimelineSelection}
              onPointerMove={continueTimelineSelection}
              onPointerUp={endTimelineSelection}
              onPointerCancel={endTimelineSelection}
              onContextMenu={(event) =>
                openBlankTimelineContextMenu(event, row.id)
              }
            >
              {timeline
                .filter((item) => (item.layerId ?? "comp") === row.id)
                .map((item) => {
                  const previewItem =
                    timelineBlockPreviews?.[
                      timelineBlockPreviewKey("composition", item.id)
                    ] ?? item;
                  const isUnlinkedPart = Boolean(item.sourceMissing);
                  return (
                    <CompositionTimelineBlock
                      dataAttributes={{
                        "data-timeline-composition-id": item.id,
                      }}
                      key={item.id}
                      name={getDisplayNameFromPath(item.filePath)}
                      duration={previewItem.duration}
                      sourceMissing={isUnlinkedPart}
                      locked={Boolean(row.locked)}
                      selected={selectedPartIds.has(item.id)}
                      prerendered={Boolean(
                        prerenderedCompositionIds?.has(item.id) &&
                        prerenderedCompositionRanges.some(
                          (range) =>
                            range.compositionId === item.id &&
                            range.start < item.start + item.duration &&
                            range.end > item.start,
                        ),
                      )}
                      style={{
                        left: `${timelineDisplayDuration > 0 ? (previewItem.start / timelineDisplayDuration) * 100 : 0}%`,
                        width: `calc(${timelineDisplayDuration > 0 ? (previewItem.duration / timelineDisplayDuration) * 100 : 0}% + var(--clipper-composition-resize-width, 0px))`,
                      }}
                      onPointerDown={(event) => {
                        if (timelineMarkersEditable)
                          updateCompositionFromPointer(event, item, "move");
                      }}
                      onClick={() => onSelectPart(item.id)}
                      onDoubleClick={() => onOpenComposePart(item.id)}
                      onContextMenu={(event) => {
                        if (timelineMarkersEditable)
                          openTimelineNodeContextMenu(event, {
                            kind: "part",
                            partId: item.id,
                            compositionLayerId: row.id,
                          });
                      }}
                      leftResizeEnabled={timelineMarkersEditable}
                      rightResizeEnabled={timelineMarkersEditable}
                      onLeftResize={(event) =>
                        updateCompositionFromPointer(event, item, "start")
                      }
                      onRightResize={(event) =>
                        updateCompositionFromPointer(event, item, "end")
                      }
                    />
                  );
                })}
            </TimelineLayerLane>
          ))}
        </>
      )}
    />
  );
});

function isCompositionDragText(value: string) {
  return (
    value.includes(".composition.ts") || value.includes(".composition.json")
  );
}

function TimelineBlankGapHighlight({
  gap,
  rowIndex,
  rowStarts,
  rowHeights,
  timelineDisplayDuration,
}: {
  gap: TimelineBlankGapSelection;
  rowIndex: number;
  rowStarts: number[];
  rowHeights: number[];
  timelineDisplayDuration: number;
}) {
  if (rowIndex < 0 || timelineDisplayDuration <= 0) return null;
  const start = gap.start;
  const end = Math.max(gap.start, gap.end + (gap.previewDelta ?? 0));
  return (
    <div
      className="pointer-events-none absolute z-30 rounded-[3px] border border-[var(--clipper-accent)] bg-[rgb(var(--clipper-accent-rgb)/0.16)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_0_18px_rgb(var(--clipper-accent-rgb)/0.18)]"
      style={{
        left: `${(start / timelineDisplayDuration) * 100}%`,
        top: rowStarts[rowIndex],
        width: `${((end - start) / timelineDisplayDuration) * 100}%`,
        height: rowHeights[rowIndex],
      }}
    />
  );
}
