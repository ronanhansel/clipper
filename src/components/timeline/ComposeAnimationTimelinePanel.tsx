import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ContextMenuState } from "../../app/types";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import { roundTwo } from "../../core/math";
import { getTimelineTicks } from "../../core/timeline";
import { getDisplayNameFromPath } from "../../core/fileNames";
import type {
  FrameObject,
  LayerAnimation,
  MotionMarker,
  Part,
  TimelineLayerState,
  TimelineViewportState,
  TimelinePart,
} from "../../core/types";
import { useTimelineDragAutoScroll } from "./useTimelineDragAutoScroll";
import { useTimelinePointerTransaction } from "./useTimelinePointerTransaction";
import { useTimelineScrubber } from "./useTimelineScrubber";
import { useTimelineViewportController } from "./useTimelineViewportController";
import { LayerLabel } from "./TimelinePrimitives";
import { TimelineShell } from "./TimelineShell";
import { MarqueeSelectionBox } from "./TimelineSelectionBox";
import { MotionLane } from "./MotionLane";
import {
  timelineBlockPreviewKey,
  type TimelineBlockPreviewMap,
} from "./timelineBlockPreview";
import type { TimelinePartMotionView } from "./timelineTypes";
import {
  buildComposeAnimationMotionTimelinePart,
  buildComposeAnimationTimelineRows,
  composeAnimationPresets,
  createComposeAnimationPresetAnimation,
  getComposeAnimationLayerKeyframes,
  getComposeAnimationAttributeTracks,
  buildComposeAnimationTimelineLayers,
  getComposeAnimationSnapBoundaries,
  getComposeAnimationTimingDelta,
  getNextComposeAnimationTiming,
  removeComposeAnimationKeyframeSelections,
  updateComposeAnimationLayerMotionTiming,
  moveComposeAnimationAttributeKeyframe,
  moveComposeAnimationKeyframesAtTime,
  updateComposeAnimationEase,
  type ComposeAnimationAttributeKey,
  type ComposeAnimationKeyframePoint,
  type ComposeAnimationKeyframeSelection,
  type ComposeAnimationAttributeTrack,
  type ComposeAnimationTimelineRow,
  type ComposeAnimationTimelineLayer,
  type ComposeAnimationTimingDrag,
} from "./composeAnimationModel";
import type { MotionEase } from "../../core/types";

type ComposeAnimationTimelinePanelProps = {
  currentTime: number;
  isPlaying: boolean;
  part: Part | null;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  scrubSnapEnabled: boolean;
  selectedObjectIds: string[];
  timelineLayers: TimelineLayerState;
  timelineViewportState: TimelineViewportState;
  onExitCompose: () => void;
  onRenameLayer?: (layerId: string, name: string) => void;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onSelectObjects?: (objects: FrameObject[]) => void;
  onTimelineLayersChange: (
    updater: (state: TimelineLayerState) => TimelineLayerState,
    options?: { history?: boolean },
  ) => void;
  onTimelineViewportStateChange: (
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) => void;
  onUpdateBackgroundAnimation?: (
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) => void;
  onUpdateObjectAnimation?: (
    objectId: string,
    updater: (animations: LayerAnimation[]) => LayerAnimation[],
  ) => void;
  setAppContextMenu?: (menu: ContextMenuState) => void;
};

const composeTimelineRowHeight = 34;
const composeKeyframeHitRadiusPx = 8;

type ComposeKeyframeHitTarget = {
  id: string;
  layerId: string;
  rowId: string;
  time: number;
  x: number;
  y: number;
  selectionIds: string[];
  selection?: ComposeAnimationKeyframeSelection;
};

type ComposeKeyframeMarqueeDrag = {
  startContentX: number;
  startContentY: number;
  currentContentX: number;
  currentContentY: number;
  additive: boolean;
  initialSelectedIds: Set<string>;
};

function composeKeyframeSelectionId(
  layerId: string,
  key: ComposeAnimationAttributeKey,
  animationId: string,
  time: number,
) {
  return `${layerId}:${key}:${animationId}:${Math.round(time * 1000)}`;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const editable = element?.closest(
    "input, textarea, select, [contenteditable='true']",
  ) as HTMLElement | null;
  return Boolean(
    editable &&
    !(editable instanceof HTMLInputElement && editable.type === "range"),
  );
}

export const ComposeAnimationTimelinePanel = memo(
  function ComposeAnimationTimelinePanel({
    currentTime,
    isPlaying,
    part,
    playbackPlayheadRef,
    scrubbingRef,
    scrubSnapEnabled,
    selectedObjectIds,
    timelineLayers,
    timelineViewportState,
    onExitCompose,
    onRenameLayer,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onSelectObjects,
    onTimelineLayersChange,
    onTimelineViewportStateChange,
    onUpdateBackgroundAnimation,
    onUpdateObjectAnimation,
    setAppContextMenu,
  }: ComposeAnimationTimelinePanelProps) {
    const partDuration = part?.duration ?? 0.1;
    const timelineDuration = Math.max(partDuration, 10);
    const layers = useMemo(
      () => (part ? buildComposeAnimationTimelineLayers(part) : []),
      [part],
    );
    const ticks = useMemo(
      () => getTimelineTicks(timelineDuration),
      [timelineDuration],
    );
    const timingDragRef = useRef<ComposeAnimationTimingDrag | null>(null);
    const provisionalContentWidth =
      timelineDuration *
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
      currentTime,
      displayDuration: timelineDuration,
      timelineViewportState,
      onTimelineViewportStateChange,
    });
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const [layerNameDraft, setLayerNameDraft] = useState("");
    const [timelineBlockPreviews, setTimelineBlockPreviews] =
      useState<TimelineBlockPreviewMap | null>(null);
    const [timelineDragActive, setTimelineDragActive] = useState(false);
    const [overviewDragPreview, setOverviewDragPreview] = useState<{
      layerId: string;
      originalTime: number;
      time: number;
    } | null>(null);
    const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [expandedEaseTrackIds, setExpandedEaseTrackIds] = useState<
      Set<string>
    >(() => new Set());
    const [easeRowHeights, setEaseRowHeights] = useState<
      Record<string, number>
    >(() => ({}));
    const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [keyframeMarquee, setKeyframeMarquee] =
      useState<ComposeKeyframeMarqueeDrag | null>(null);
    const keyframeMarqueeRef = useRef<ComposeKeyframeMarqueeDrag | null>(null);
    const rows = useMemo(
      () =>
        buildComposeAnimationTimelineRows(
          layers,
          expandedLayerIds,
          expandedEaseTrackIds,
        ),
      [expandedLayerIds, expandedEaseTrackIds, layers],
    );
    const timelineRowStarts = rows.reduce<number[]>(
      (starts, row, index) => [
        ...starts,
        index === 0
          ? 0
          : starts[index - 1] +
            getComposeRowHeight(rows[index - 1], easeRowHeights),
      ],
      [],
    );
    const laneRowsStyle = {
      gridTemplateRows:
        rows
          .map((row) => `${getComposeRowHeight(row, easeRowHeights)}px`)
          .join(" ") || `${composeTimelineRowHeight}px`,
    };
    const laneContentHeight = Math.max(
      rows.reduce(
        (sum, row) => sum + getComposeRowHeight(row, easeRowHeights),
        0,
      ),
      composeTimelineRowHeight,
    );
    const contentWidth =
      timelineDuration * defaultTimelinePixelsPerSecond * timelineZoom;
    const keyframeHitTargets = useMemo(
      () =>
        buildComposeKeyframeHitTargets(
          rows,
          timelineRowStarts,
          easeRowHeights,
          contentWidth,
          partDuration,
        ),
      [contentWidth, easeRowHeights, partDuration, rows, timelineRowStarts],
    );
    const layerRailWidth = 260;
    const composeTimelinePartId = part?.id ?? "compose-animation";
    const composeMotionTimeline = useMemo<TimelinePartMotionView[]>(
      () =>
        part
          ? [
              buildComposeAnimationMotionTimelinePart(
                part,
                layers,
                partDuration,
              ),
            ]
          : [],
      [layers, part, partDuration],
    );
    const selectedComposeMotionKeys = useMemo(() => {
      const keys = new Set<string>();
      for (const layer of layers) {
        if (layer.object && selectedObjectIds.includes(layer.object.id)) {
          keys.add(`${composeTimelinePartId}:${layer.id}`);
          if (layer.animations) {
            for (const animation of layer.animations) {
              keys.add(
                `${composeTimelinePartId}:${layer.id}/anim/${animation.id}`,
              );
            }
          }
        }
      }
      return keys;
    }, [composeTimelinePartId, layers, selectedObjectIds]);
    const scrubSnapBoundaries = useMemo(
      () => getComposeAnimationSnapBoundaries(layers, partDuration),
      [layers, partDuration],
    );

    const { getTimelineEdgeScrollDelta, startScrub, continueScrub, endScrub } =
      useTimelineScrubber({
        duration: partDuration,
        displayDuration: partDuration,
        playbackPlayheadRef,
        scrubbingRef,
        timelineRef,
        viewportRef: timelineViewportRef,
        snapEnabled: scrubSnapEnabled,
        snapBoundaries: scrubSnapBoundaries,
        onRulerScroll: syncTimelineScrollPosition,
        onScrub,
        onScrubStart,
        onScrubEnd,
      });

    const {
      updateTimelineDragAutoScroll: updateTimingDragAutoScroll,
      stopTimelineDragAutoScroll: stopTimingDragAutoScroll,
    } = useTimelineDragAutoScroll({
      viewportRef: timelineViewportRef,
      getTimelineEdgeScrollDelta,
      onRulerScroll: syncTimelineScrollPosition,
      onScrollPersist: saveTimelineDisplacement,
    });
    const { startTimelinePointerTransaction: startTimingPointerTransaction } =
      useTimelinePointerTransaction();

    useEffect(
      () => () => {
        stopTimingDragAutoScroll();
        clearTimelineSnapGuide();
        setTimelineDragActive(false);
      },
      [],
    );

    useEffect(() => {
      setSelectedKeyframeIds((current) => {
        if (!current.size) return current;
        const liveIds = new Set(
          keyframeHitTargets.flatMap((target) => target.selectionIds),
        );
        const next = new Set([...current].filter((id) => liveIds.has(id)));
        return next.size === current.size ? current : next;
      });
    }, [keyframeHitTargets]);

    useEffect(() => {
      function deleteSelectedFromKeyboard(event: KeyboardEvent) {
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (isEditableKeyboardTarget(event.target)) return;
        if (!selectedKeyframeIds.size) return;
        if (!deleteSelectedKeyframes()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }

      window.addEventListener("keydown", deleteSelectedFromKeyboard, true);
      return () =>
        window.removeEventListener("keydown", deleteSelectedFromKeyboard, true);
    }, [keyframeHitTargets, selectedKeyframeIds]);

    function getTimelineContentRect() {
      return timelineViewportRef.current
        ?.querySelector<HTMLElement>("[data-timeline-content]")
        ?.getBoundingClientRect();
    }

    function selectKeyframeIds(ids: string[], additive: boolean) {
      setSelectedKeyframeIds((current) => {
        const next = additive ? new Set(current) : new Set<string>();
        for (const id of ids) {
          if (additive && next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    }

    function deleteSelectedKeyframes() {
      const selectedTargets = keyframeHitTargets
        .filter(
          (target) => target.selection && selectedKeyframeIds.has(target.id),
        )
        .map((target) => ({
          layerId: target.layerId,
          selection: target.selection as ComposeAnimationKeyframeSelection,
        }));
      if (!selectedTargets.length) return false;

      for (const layer of layers) {
        const selections = selectedTargets
          .filter((target) => target.layerId === layer.id)
          .map((target) => target.selection);
        if (!selections.length) continue;
        if (layer.kind === "background") {
          onUpdateBackgroundAnimation?.((animations) =>
            removeComposeAnimationKeyframeSelections(
              animations,
              selections,
              partDuration,
            ),
          );
        } else if (layer.object) {
          onUpdateObjectAnimation?.(layer.object.id, (animations) =>
            removeComposeAnimationKeyframeSelections(
              animations,
              selections,
              partDuration,
            ),
          );
        }
      }
      setSelectedKeyframeIds(new Set());
      return true;
    }

    function updateMarqueeSelection(drag: ComposeKeyframeMarqueeDrag) {
      const left = Math.min(drag.startContentX, drag.currentContentX);
      const right = Math.max(drag.startContentX, drag.currentContentX);
      const top = Math.min(drag.startContentY, drag.currentContentY);
      const bottom = Math.max(drag.startContentY, drag.currentContentY);
      const next = drag.additive
        ? new Set(drag.initialSelectedIds)
        : new Set<string>();
      for (const target of keyframeHitTargets) {
        const hit =
          target.x >= left - composeKeyframeHitRadiusPx &&
          target.x <= right + composeKeyframeHitRadiusPx &&
          target.y >= top - composeKeyframeHitRadiusPx &&
          target.y <= bottom + composeKeyframeHitRadiusPx;
        if (!hit) continue;
        for (const id of target.selectionIds) next.add(id);
      }
      setSelectedKeyframeIds(next);
    }

    function startKeyframeMarquee(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-timeline-control]")) return;
      const rect = getTimelineContentRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      const startContentX = event.clientX - rect.left;
      const startContentY = event.clientY - rect.top;
      const next: ComposeKeyframeMarqueeDrag = {
        startContentX,
        startContentY,
        currentContentX: startContentX,
        currentContentY: startContentY,
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        initialSelectedIds: selectedKeyframeIds,
      };
      keyframeMarqueeRef.current = next;
      setKeyframeMarquee(next);

      function onMove(moveEvent: globalThis.PointerEvent) {
        const active = keyframeMarqueeRef.current;
        const activeRect = getTimelineContentRect();
        if (!active || !activeRect) return;
        const updated = {
          ...active,
          currentContentX: moveEvent.clientX - activeRect.left,
          currentContentY: moveEvent.clientY - activeRect.top,
        };
        keyframeMarqueeRef.current = updated;
        setKeyframeMarquee(updated);
        updateMarqueeSelection(updated);
      }

      function onUp(upEvent: globalThis.PointerEvent) {
        const active = keyframeMarqueeRef.current;
        if (active) {
          const dragDistance = Math.max(
            Math.abs(active.currentContentX - active.startContentX),
            Math.abs(active.currentContentY - active.startContentY),
          );
          if (dragDistance < 4 && !active.additive)
            setSelectedKeyframeIds(new Set());
        }
        keyframeMarqueeRef.current = null;
        setKeyframeMarquee(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        upEvent.preventDefault();
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }

    function selectLayer(layer: ComposeAnimationTimelineLayer) {
      onSelectObjects?.(layer.object ? [layer.object] : []);
    }

    function startLayerNameEdit(layerId: string, name: string) {
      setEditingLayerId(layerId);
      setLayerNameDraft(name);
    }

    function commitLayerNameEdit() {
      if (!editingLayerId) return;
      const nextName = layerNameDraft.trim();
      const layer = layers.find((item) => item.id === editingLayerId);
      if (nextName && layer && nextName !== layer.name)
        onRenameLayer?.(editingLayerId, nextName);
      setEditingLayerId(null);
      setLayerNameDraft("");
    }

    function cancelLayerNameEdit() {
      setEditingLayerId(null);
      setLayerNameDraft("");
    }

    function toggleLayerExpanded(layerId: string) {
      setExpandedLayerIds((current) => {
        const next = new Set(current);
        if (next.has(layerId)) next.delete(layerId);
        else next.add(layerId);
        return next;
      });
    }

    function toggleEaseExpanded(attributeRowId: string) {
      setExpandedEaseTrackIds((current) => {
        const next = new Set(current);
        if (next.has(attributeRowId)) next.delete(attributeRowId);
        else next.add(attributeRowId);
        return next;
      });
    }

    function applyEaseToTrack(
      layer: ComposeAnimationTimelineLayer,
      animationId: string,
      ease: MotionEase | readonly [number, number, number, number],
    ) {
      const updater = (animations: LayerAnimation[]) =>
        updateComposeAnimationEase(animations, animationId, ease);
      if (layer.kind === "background") {
        onUpdateBackgroundAnimation?.(updater);
      } else if (layer.object) {
        onUpdateObjectAnimation?.(layer.object.id, updater);
      }
    }

    function applyPresetToLayer(
      layer: ComposeAnimationTimelineLayer | null,
      presetId: string,
    ) {
      const preset = composeAnimationPresets.find(
        (item) => item.id === presetId,
      );
      if (!layer || !preset) return;
      const animation = createComposeAnimationPresetAnimation(
        preset,
        currentTime,
        timelineDuration,
      );
      if (layer.kind === "background") {
        onUpdateBackgroundAnimation?.((animations) => [
          ...animations,
          animation,
        ]);
      } else if (layer.object) {
        onUpdateObjectAnimation?.(layer.object.id, (animations) => [
          ...animations,
          animation,
        ]);
      }
    }

    function openComposePresetContextMenu(
      event: ReactMouseEvent<HTMLElement>,
      layer: ComposeAnimationTimelineLayer,
    ) {
      event.preventDefault();
      event.stopPropagation();
      selectLayer(layer);
      setAppContextMenu?.({
        x: event.clientX,
        y: event.clientY,
        items: composeAnimationPresets.map((preset) => ({
          label: preset.label,
          action: () => applyPresetToLayer(layer, preset.id),
        })),
      });
    }

    function startTimingDrag(
      event: PointerEvent<HTMLDivElement>,
      layer: ComposeAnimationTimelineLayer,
      action: ComposeAnimationTimingDrag["action"],
      animation?: LayerAnimation,
    ) {
      if (event.button !== 0) return;
      if (!animation) return;
      const initialDelay = animation.options.delay ?? 0;
      const initialDuration = animation.options.duration;
      const markerId = `${layer.id}/anim/${animation.id}`;
      event.preventDefault();
      event.stopPropagation();
      selectLayer(layer);
      const pixelsPerSecond =
        (timelineRef.current?.getBoundingClientRect().width ?? 1) /
        Math.max(partDuration, 1);
      const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
      const movingEdges = new Set([
        roundTwo(initialDelay),
        roundTwo(initialDelay + initialDuration),
      ]);
      const snapBoundaries = Array.from(
        new Set([
          ...scrubSnapBoundaries.filter(
            (boundary) => !movingEdges.has(roundTwo(boundary)),
          ),
          currentTime,
        ]),
      ).sort((left, right) => left - right);
      function clearTimingDragState() {
        timingDragRef.current = null;
        stopTimingDragAutoScroll();
        clearTimelineSnapGuide();
        setTimelineBlockPreviews(null);
        setTimelineDragActive(false);
      }

      startTimingPointerTransaction({
        event,
        capturePointer: true,
        updateAutoScroll: updateTimingDragAutoScroll,
        stopAutoScroll: stopTimingDragAutoScroll,
        onDragStart: ({ pointerId }) => {
          timingDragRef.current = {
            action,
            initialClientX: event.clientX,
            initialScrollLeft: timelineViewportRef.current?.scrollLeft ?? 0,
            initialDelay,
            initialDuration,
            layer,
            partId: composeTimelinePartId,
            markerId,
            animationId: animation.id,
            pointerId,
            snapBoundaries,
            snapThresholdSeconds,
          };
          setTimelineDragActive(true);
        },
        onPreview: ({ pointerId, clientX, snap }) =>
          updateTimingDragFromPointer(pointerId, clientX, snap),
        onCommit: ({ pointerId, clientX, snap }) =>
          finishTimingDragFromPointer(pointerId, clientX, snap),
        onCancel: clearTimingDragState,
        onDragEnd: () => {
          stopTimingDragAutoScroll();
          clearTimelineSnapGuide();
          setTimelineDragActive(false);
        },
      });
    }

    function updateTimingDragFromPointer(
      pointerId: number,
      clientX: number,
      snap: boolean,
    ) {
      const drag = timingDragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      const deltaSeconds = getComposeAnimationTimingDelta(
        drag,
        clientX,
        timelineViewportRef.current?.scrollLeft ?? 0,
        contentWidth,
        partDuration,
      );
      const next = getNextComposeAnimationTiming(
        drag,
        deltaSeconds,
        partDuration,
        snap,
      );
      updateTimelineSnapGuide(next.guideTime);
      setTimelineBlockPreviews({
        [timelineBlockPreviewKey("motion", drag.partId, drag.markerId)]: {
          start: next.delay,
          duration: next.duration,
        },
      });
    }

    function finishTimingDragFromPointer(
      pointerId: number,
      clientX: number,
      snap: boolean,
    ) {
      const drag = timingDragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      const deltaSeconds = getComposeAnimationTimingDelta(
        drag,
        clientX,
        timelineViewportRef.current?.scrollLeft ?? 0,
        contentWidth,
        partDuration,
      );
      const next = getNextComposeAnimationTiming(
        drag,
        deltaSeconds,
        partDuration,
        snap,
      );
      timingDragRef.current = null;
      setTimelineDragActive(false);
      setTimelineBlockPreviews(null);
      updateComposeAnimationLayerMotionTiming(
        drag.layer,
        next,
        undefined,
        undefined,
        onUpdateBackgroundAnimation,
        onUpdateObjectAnimation,
        drag.animationId,
      );
    }

    function updateComposeMotionFromPointer(
      event: PointerEvent<HTMLDivElement>,
      _timelinePart: TimelinePart,
      marker: MotionMarker,
      action: "move" | "start" | "end",
    ) {
      const animMatch = marker.id.match(/^(.+)\/anim\/(.+)$/);
      if (animMatch) {
        const [, layerId, animationId] = animMatch;
        const layer = layers.find((item) => item.id === layerId);
        if (!layer) return;
        const animation = layer.animations?.find(
          (anim) => anim.id === animationId,
        );
        if (animation) startTimingDrag(event, layer, action, animation);
        return;
      }
      const layer = layers.find((item) => item.id === marker.id);
      if (layer) startTimingDrag(event, layer, action);
    }

    if (!part) {
      return (
        <TimelineShell
          activeMode="compose"
          contentWidth={contentWidth}
          currentTime={currentTime}
          disableDeclarativePlayhead={isPlaying}
          displayDuration={partDuration}
          emptyContent={
            <div className="grid h-full place-items-center text-center text-sm font-bold text-[#737884]">
              Move the playhead over a composition to edit its animations.
            </div>
          }
          laneContentHeight={laneContentHeight}
          laneRowsStyle={laneRowsStyle}
          layerRailWidth={layerRailWidth}
          playheadColor="var(--clipper-accent)"
          refs={{
            playbackPlayheadRef,
            timelineRef,
            timelineViewportRef,
            timelineLayerRailRef,
            timelineSnapGuideRef,
            scrubbingRef,
          }}
          timelineName="Compose"
          timelineZoom={timelineZoom}
          ticks={ticks}
          onModeChange={(nextMode) => {
            if (nextMode === "composition") onExitCompose();
          }}
          onTimelineViewportScroll={saveTimelineDisplacement}
          onTimelineZoomChange={updateTimelineZoom}
          rulerHandlers={{
            onPointerDown: startScrub,
            onPointerMove: continueScrub,
            onPointerUp: endScrub,
            onPointerCancel: endScrub,
          }}
          renderLayerRail={() => null}
          renderTimelineViewport={() => null}
        />
      );
    }

    return (
      <TimelineShell
        activeMode="compose"
        contentWidth={contentWidth}
        currentTime={currentTime}
        disableDeclarativePlayhead={isPlaying}
        displayDuration={partDuration}
        dragActive={timelineDragActive}
        laneContentHeight={laneContentHeight}
        laneRowsStyle={laneRowsStyle}
        layerRailWidth={layerRailWidth}
        playheadColor="var(--clipper-accent)"
        refs={{
          playbackPlayheadRef,
          timelineRef,
          timelineViewportRef,
          timelineLayerRailRef,
          timelineSnapGuideRef,
          scrubbingRef,
        }}
        timelineName={getDisplayNameFromPath(part.filePath)}
        timelineZoom={timelineZoom}
        ticks={ticks}
        onModeChange={(nextMode) => {
          if (nextMode === "composition") onExitCompose();
        }}
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
            {rows.map((row, index) => (
              <span
                className="pointer-events-none absolute right-0 z-40 w-0.5 bg-[#6f7684]"
                key={`compose-layer-accent-${row.id}`}
                style={{
                  top: timelineRowStarts[index],
                  height: getComposeRowHeight(row, easeRowHeights),
                }}
              />
            ))}
            {rows.map((row) => (
              <ComposeTimelineRailRow
                key={row.id}
                row={row}
                compact
                editingLayerId={editingLayerId}
                expanded={expandedLayerIds.has(row.layer.id)}
                easeExpanded={
                  row.kind === "attribute"
                    ? expandedEaseTrackIds.has(row.id)
                    : false
                }
                easeRowHeight={getComposeRowHeight(row, easeRowHeights)}
                layerNameDraft={layerNameDraft}
                onCancelLayerNameEdit={cancelLayerNameEdit}
                onCommitLayerNameEdit={commitLayerNameEdit}
                onDraftChange={setLayerNameDraft}
                onStartLayerNameEdit={startLayerNameEdit}
                onOpenPresetContextMenu={openComposePresetContextMenu}
                onToggleExpanded={toggleLayerExpanded}
                onToggleEaseExpanded={toggleEaseExpanded}
                onResizeEaseRow={(rowId, height) =>
                  setEaseRowHeights((prev) => ({ ...prev, [rowId]: height }))
                }
              />
            ))}
          </>
        )}
        renderTimelineViewport={() => (
          <>
            {rows.map((row) => (
              <ComposeTimelineViewportRow
                key={row.id}
                row={row}
                timelineDuration={partDuration}
                contentWidth={contentWidth}
                timelineRef={timelineRef}
                easeRowHeight={
                  row.kind === "ease"
                    ? getComposeRowHeight(row, easeRowHeights)
                    : composeTimelineRowHeight
                }
                easeExpanded={
                  row.kind === "attribute"
                    ? expandedEaseTrackIds.has(row.id)
                    : false
                }
                overviewDragPreview={
                  overviewDragPreview?.layerId === row.layer.id
                    ? overviewDragPreview
                    : null
                }
                onSelectLayer={selectLayer}
                onOpenPresetContextMenu={openComposePresetContextMenu}
                onApplyEase={(layer, animationId, ease) =>
                  applyEaseToTrack(layer, animationId, ease)
                }
                onResizeEaseRow={(rowId, height) =>
                  setEaseRowHeights((prev) => ({ ...prev, [rowId]: height }))
                }
                onMoveKeyframe={(layer, animationId, newTime) => {
                  if (layer.kind === "background") {
                    onUpdateBackgroundAnimation?.((animations) =>
                      moveComposeAnimationAttributeKeyframe(
                        animations,
                        animationId,
                        newTime,
                        partDuration,
                      ),
                    );
                  } else if (layer.object) {
                    onUpdateObjectAnimation?.(layer.object.id, (animations) =>
                      moveComposeAnimationAttributeKeyframe(
                        animations,
                        animationId,
                        newTime,
                        partDuration,
                      ),
                    );
                  }
                }}
                onMoveKeyframesAtTime={(layer, originalTime, newTime) => {
                  if (layer.kind === "background") {
                    onUpdateBackgroundAnimation?.((animations) =>
                      moveComposeAnimationKeyframesAtTime(
                        animations,
                        originalTime,
                        newTime,
                        partDuration,
                      ),
                    );
                  } else if (layer.object) {
                    onUpdateObjectAnimation?.(layer.object.id, (animations) =>
                      moveComposeAnimationKeyframesAtTime(
                        animations,
                        originalTime,
                        newTime,
                        partDuration,
                      ),
                    );
                  }
                }}
                onOverviewDragPreview={(originalTime, time) =>
                  setOverviewDragPreview({
                    layerId: row.layer.id,
                    originalTime,
                    time,
                  })
                }
                onOverviewDragEnd={() => setOverviewDragPreview(null)}
                selectedKeyframeIds={selectedKeyframeIds}
                onSelectKeyframeIds={selectKeyframeIds}
                onStartKeyframeMarquee={startKeyframeMarquee}
                setAppContextMenu={setAppContextMenu}
              />
            ))}
            {keyframeMarquee ? (
              <ComposeKeyframeMarquee marquee={keyframeMarquee} />
            ) : null}
          </>
        )}
      />
    );
  },
  areComposeAnimationTimelinePanelPropsEqual,
);

function buildComposeKeyframeHitTargets(
  rows: ComposeAnimationTimelineRow[],
  rowStarts: number[],
  easeRowHeights: Record<string, number>,
  contentWidth: number,
  timelineDuration: number,
): ComposeKeyframeHitTarget[] {
  const targets: ComposeKeyframeHitTarget[] = [];
  if (timelineDuration <= 0) return targets;

  rows.forEach((row, index) => {
    const rowTop = rowStarts[index] ?? 0;
    const rowY = rowTop + getComposeRowHeight(row, easeRowHeights) / 2;
    if (row.kind === "attribute") {
      for (const keyframe of row.track.keyframes) {
        const id = composeKeyframeSelectionId(
          row.layer.id,
          row.track.key,
          keyframe.animationId,
          keyframe.time,
        );
        targets.push({
          id,
          layerId: row.layer.id,
          rowId: row.id,
          time: keyframe.time,
          x: (keyframe.time / timelineDuration) * contentWidth,
          y: rowY,
          selectionIds: [id],
          selection: {
            animationId: keyframe.animationId,
            key: row.track.key,
            time: keyframe.time,
          },
        });
      }
      return;
    }

    if (row.kind !== "layer") return;
    const byTime = new Map<number, string[]>();
    for (const track of getComposeAnimationAttributeTracks(row.layer)) {
      for (const keyframe of track.keyframes) {
        const roundedTime = Math.round(keyframe.time * 1000);
        const ids = byTime.get(roundedTime) ?? [];
        ids.push(
          composeKeyframeSelectionId(
            row.layer.id,
            track.key,
            keyframe.animationId,
            keyframe.time,
          ),
        );
        byTime.set(roundedTime, ids);
      }
    }
    for (const [roundedTime, selectionIds] of byTime) {
      const time = roundedTime / 1000;
      targets.push({
        id: `${row.layer.id}:overview:${roundedTime}`,
        layerId: row.layer.id,
        rowId: row.id,
        time,
        x: (time / timelineDuration) * contentWidth,
        y: rowY,
        selectionIds,
      });
    }
  });
  return targets;
}

function composeLayerTimeSelectionIds(
  layerId: string,
  layer: ComposeAnimationTimelineLayer,
  time: number,
) {
  const roundedTime = Math.round(time * 1000);
  return getComposeAnimationAttributeTracks(layer).flatMap((track) =>
    track.keyframes
      .filter((keyframe) => Math.round(keyframe.time * 1000) === roundedTime)
      .map((keyframe) =>
        composeKeyframeSelectionId(
          layerId,
          track.key,
          keyframe.animationId,
          keyframe.time,
        ),
      ),
  );
}

function ComposeKeyframeMarquee({
  marquee,
}: {
  marquee: ComposeKeyframeMarqueeDrag;
}) {
  const left = Math.min(marquee.startContentX, marquee.currentContentX);
  const top = Math.min(marquee.startContentY, marquee.currentContentY);
  const width = Math.abs(marquee.currentContentX - marquee.startContentX);
  const height = Math.abs(marquee.currentContentY - marquee.startContentY);
  return (
    <MarqueeSelectionBox
      left={left}
      top={top}
      width={width}
      height={height}
      zIndexClassName="z-50"
    />
  );
}

function ComposeTimelineRailRow({
  row,
  compact,
  editingLayerId,
  expanded,
  easeExpanded,
  easeRowHeight,
  layerNameDraft,
  onCancelLayerNameEdit,
  onCommitLayerNameEdit,
  onDraftChange,
  onStartLayerNameEdit,
  onOpenPresetContextMenu,
  onToggleExpanded,
  onToggleEaseExpanded,
  onResizeEaseRow,
}: {
  row: ComposeAnimationTimelineRow;
  compact: boolean;
  editingLayerId: string | null;
  expanded: boolean;
  easeExpanded: boolean;
  easeRowHeight: number;
  layerNameDraft: string;
  onCancelLayerNameEdit: () => void;
  onCommitLayerNameEdit: () => void;
  onDraftChange: (value: string) => void;
  onStartLayerNameEdit: (layerId: string, name: string) => void;
  onOpenPresetContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    layer: ComposeAnimationTimelineLayer,
  ) => void;
  onToggleExpanded: (layerId: string) => void;
  onToggleEaseExpanded: (attributeRowId: string) => void;
  onResizeEaseRow: (rowId: string, height: number) => void;
}) {
  if (row.kind === "ease") {
    const resizeDragRef = { startY: 0, startHeight: 0 };
    function startRailResize(event: ReactPointerEvent<HTMLDivElement>) {
      event.preventDefault();
      event.stopPropagation();
      resizeDragRef.startY = event.clientY;
      resizeDragRef.startHeight = easeRowHeight;
      event.currentTarget.setPointerCapture(event.pointerId);
      function onMove(e: globalThis.PointerEvent) {
        const next = Math.max(
          minEaseRowHeight,
          Math.min(
            maxEaseRowHeight,
            resizeDragRef.startHeight + (e.clientY - resizeDragRef.startY),
          ),
        );
        onResizeEaseRow(row.id, next);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }
    return (
      <div className="relative flex h-full items-center border-b border-[#202633] pl-8 pr-3 text-[11px] font-bold text-[#687386]">
        <div
          className="absolute bottom-0 left-0 right-0 h-1 cursor-pointer opacity-0 hover:opacity-100 hover:bg-[var(--clipper-accent,#6c8ef5)] transition-opacity"
          onPointerDown={startRailResize}
        />
      </div>
    );
  }

  if (row.kind === "attribute") {
    return (
      <div
        className={`flex h-full items-center gap-2 border-t border-[#202633] pl-8 pr-3 text-[11px] font-bold text-[#8f98a8]${easeExpanded ? "" : " border-b"}`}
        onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}
      >
        <span className="h-px w-3 bg-[#3a4352]" />
        <span className="truncate" title={row.track.label}>
          {row.track.label}
        </span>
        <button
          data-timeline-control
          className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] transition ${easeExpanded ? "bg-[#202633] text-[#dfe2ea]" : "text-[#687386] hover:bg-[#202633] hover:text-[#8f98a8]"}`}
          title={easeExpanded ? "Hide ease editor" : "Show ease editor"}
          onClick={() => onToggleEaseExpanded(row.id)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M1 10 C3 10 4 2 6 2 S9 10 11 10" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-[32px_minmax(0,1fr)] items-center"
      onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}
    >
      <button
        data-timeline-control
        className="flex h-5 w-5 items-center justify-center justify-self-center self-center leading-none rounded-[4px] text-[#8f98a8] transition hover:bg-[#202633] hover:text-[#dfe2ea]"
        title={expanded ? "Collapse attributes" : "Expand attributes"}
        onClick={() => onToggleExpanded(row.layer.id)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {expanded ? (
          <ChevronDown size={13} strokeWidth={2.6} />
        ) : (
          <ChevronRight size={13} strokeWidth={2.6} />
        )}
      </button>
      <LayerLabel
        editing={editingLayerId === row.layer.id}
        hidden={false}
        locked={false}
        compactControls={compact}
        hideLockControl
        centered
        name={row.layer.name}
        draft={layerNameDraft}
        canMoveDown={false}
        canMoveUp={false}
        onDraftChange={onDraftChange}
        onEdit={() => onStartLayerNameEdit(row.layer.id, row.layer.name)}
        onCommit={onCommitLayerNameEdit}
        onCancel={onCancelLayerNameEdit}
        onToggleHidden={() => undefined}
        onToggleLocked={() => undefined}
      />
    </div>
  );
}

function ComposeTimelineViewportRow({
  row,
  timelineDuration,
  contentWidth,
  timelineRef,
  easeRowHeight,
  easeExpanded,
  overviewDragPreview,
  onSelectLayer,
  onOpenPresetContextMenu,
  onApplyEase,
  onResizeEaseRow,
  onMoveKeyframe,
  onMoveKeyframesAtTime,
  onOverviewDragPreview,
  onOverviewDragEnd,
  selectedKeyframeIds,
  onSelectKeyframeIds,
  onStartKeyframeMarquee,
  setAppContextMenu,
}: {
  row: ComposeAnimationTimelineRow;
  timelineDuration: number;
  contentWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  easeRowHeight: number;
  easeExpanded: boolean;
  overviewDragPreview: { originalTime: number; time: number } | null;
  onSelectLayer: (layer: ComposeAnimationTimelineLayer) => void;
  onOpenPresetContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    layer: ComposeAnimationTimelineLayer,
  ) => void;
  onApplyEase: (
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    ease: MotionEase | readonly [number, number, number, number],
  ) => void;
  onResizeEaseRow: (rowId: string, height: number) => void;
  onMoveKeyframe: (
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    newTime: number,
  ) => void;
  onMoveKeyframesAtTime: (
    layer: ComposeAnimationTimelineLayer,
    originalTime: number,
    newTime: number,
  ) => void;
  onOverviewDragPreview: (originalTime: number, time: number) => void;
  onOverviewDragEnd: () => void;
  selectedKeyframeIds: Set<string>;
  onSelectKeyframeIds: (ids: string[], additive: boolean) => void;
  onStartKeyframeMarquee: (event: PointerEvent<HTMLDivElement>) => void;
  setAppContextMenu?: (menu: ContextMenuState) => void;
}) {
  if (row.kind === "ease") {
    return (
      <ComposeEaseLane
        track={row.track}
        layer={row.layer}
        timelineDuration={timelineDuration}
        height={easeRowHeight}
        contentWidth={contentWidth}
        timelineRef={timelineRef}
        overviewDragPreview={overviewDragPreview}
        onApplyEase={(animationId, ease) =>
          onApplyEase(row.layer, animationId, ease)
        }
        onMoveKeyframesAtTime={(originalTime, newTime) =>
          onMoveKeyframesAtTime(row.layer, originalTime, newTime)
        }
        onDragPreview={onOverviewDragPreview}
        onDragEnd={onOverviewDragEnd}
        onResize={(height) => onResizeEaseRow(row.id, height)}
        setAppContextMenu={setAppContextMenu}
      />
    );
  }

  if (row.kind === "attribute") {
    return (
      <div onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}>
        <ComposeAttributeKeyframeLane
          layerId={row.layer.id}
          trackKey={row.track.key}
          keyframes={row.track.keyframes}
          timelineDuration={timelineDuration}
          contentWidth={contentWidth}
          timelineRef={timelineRef}
          overviewDragPreview={overviewDragPreview}
          selectedKeyframeIds={selectedKeyframeIds}
          onSelect={() => onSelectLayer(row.layer)}
          onSelectKeyframeIds={onSelectKeyframeIds}
          onStartKeyframeMarquee={onStartKeyframeMarquee}
          onMoveKeyframe={(animationId, newTime) =>
            onMoveKeyframe(row.layer, animationId, newTime)
          }
          onDragPreview={onOverviewDragPreview}
          onDragEnd={onOverviewDragEnd}
          easeExpanded={easeExpanded}
        />
      </div>
    );
  }

  return (
    <div
      className="relative h-full border-t border-b border-[#202633]"
      onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-timeline-control]")) {
          onSelectLayer(row.layer);
          onStartKeyframeMarquee(event);
        }
      }}
    >
      <ComposeLayerKeyframeOverview
        layerId={row.layer.id}
        layer={row.layer}
        keyframes={getComposeAnimationLayerKeyframes(row.layer)}
        timelineDuration={timelineDuration}
        contentWidth={contentWidth}
        timelineRef={timelineRef}
        overviewDragPreview={overviewDragPreview}
        selectedKeyframeIds={selectedKeyframeIds}
        onSelectKeyframeIds={onSelectKeyframeIds}
        onSelectLayer={() => onSelectLayer(row.layer)}
        onMoveKeyframesAtTime={(originalTime, newTime) =>
          onMoveKeyframesAtTime(row.layer, originalTime, newTime)
        }
        onDragPreview={onOverviewDragPreview}
        onDragEnd={onOverviewDragEnd}
      />
    </div>
  );
}

function ComposeLayerKeyframeOverview({
  layerId,
  layer,
  keyframes,
  timelineDuration,
  contentWidth,
  timelineRef,
  overviewDragPreview,
  selectedKeyframeIds,
  onSelectKeyframeIds,
  onSelectLayer,
  onMoveKeyframesAtTime,
  onDragPreview,
  onDragEnd,
}: {
  layerId: string;
  layer: ComposeAnimationTimelineLayer;
  keyframes: ComposeAnimationKeyframePoint[];
  timelineDuration: number;
  contentWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  overviewDragPreview: { originalTime: number; time: number } | null;
  selectedKeyframeIds: Set<string>;
  onSelectKeyframeIds: (ids: string[], additive: boolean) => void;
  onSelectLayer: () => void;
  onMoveKeyframesAtTime: (originalTime: number, newTime: number) => void;
  onDragPreview: (originalTime: number, time: number) => void;
  onDragEnd: () => void;
}) {
  const { startTimelinePointerTransaction } = useTimelinePointerTransaction();
  const dragRef = useRef<{ originalTime: number } | null>(null);
  const [dragPreviewTime, setDragPreviewTime] = useState<{
    originalTime: number;
    time: number;
  } | null>(null);

  function timeFromClientX(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || contentWidth <= 0 || timelineDuration <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(ratio * timelineDuration, timelineDuration));
  }

  function startKeyframeDrag(
    event: PointerEvent<HTMLButtonElement>,
    keyframe: ComposeAnimationKeyframePoint,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelectLayer();
    const ids = composeLayerTimeSelectionIds(layerId, layer, keyframe.time);
    onSelectKeyframeIds(ids, event.shiftKey || event.metaKey || event.ctrlKey);
    startTimelinePointerTransaction({
      event,
      capturePointer: true,
      onDragStart: () => {
        dragRef.current = { originalTime: keyframe.time };
      },
      onPreview: ({ clientX }) => {
        const drag = dragRef.current;
        if (!drag) return;
        const t = timeFromClientX(clientX);
        setDragPreviewTime({ originalTime: drag.originalTime, time: t });
        onDragPreview(drag.originalTime, t);
      },
      onCommit: ({ clientX }) => {
        const drag = dragRef.current;
        if (!drag) return;
        const newTime = timeFromClientX(clientX);
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
        onMoveKeyframesAtTime(drag.originalTime, newTime);
      },
      onCancel: () => {
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
      },
      onDragEnd: () => {
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
      },
    });
  }

  if (!keyframes.length) return null;
  return (
    <div className="absolute inset-y-0 left-0 right-0 z-30">
      {keyframes.map((keyframe, index) => {
        const selectionIds = composeLayerTimeSelectionIds(
          layerId,
          layer,
          keyframe.time,
        );
        const selected = selectionIds.some((id) => selectedKeyframeIds.has(id));
        const displayTime =
          dragPreviewTime?.originalTime === keyframe.time
            ? dragPreviewTime.time
            : overviewDragPreview &&
                Math.abs(overviewDragPreview.originalTime - keyframe.time) <
                  0.001
              ? overviewDragPreview.time
              : keyframe.time;
        return (
          <button
            key={`${keyframe.animationId}-${keyframe.time}-${index}`}
            data-timeline-control
            className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
              selected
                ? "border-[#159dff] bg-[#159dff] shadow-[0_0_0_3px_rgba(21,157,255,0.24)]"
                : "border-white bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.12)]"
            }`}
            style={{
              left: `${timelineDuration > 0 ? (displayTime / timelineDuration) * 100 : 0}%`,
            }}
            onClick={(event) => {
              if (dragRef.current) return;
              event.stopPropagation();
            }}
            onPointerDown={(event) => startKeyframeDrag(event, keyframe)}
          />
        );
      })}
    </div>
  );
}

function ComposeAttributeKeyframeLane({
  layerId,
  trackKey,
  keyframes,
  timelineDuration,
  contentWidth,
  timelineRef,
  overviewDragPreview,
  selectedKeyframeIds,
  onSelect,
  onSelectKeyframeIds,
  onStartKeyframeMarquee,
  onMoveKeyframe,
  onDragPreview,
  onDragEnd,
  easeExpanded,
}: {
  layerId: string;
  trackKey: ComposeAnimationAttributeKey;
  keyframes: ComposeAnimationKeyframePoint[];
  timelineDuration: number;
  contentWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  overviewDragPreview: { originalTime: number; time: number } | null;
  selectedKeyframeIds: Set<string>;
  onSelect: () => void;
  onSelectKeyframeIds: (ids: string[], additive: boolean) => void;
  onStartKeyframeMarquee: (event: PointerEvent<HTMLDivElement>) => void;
  onMoveKeyframe: (animationId: string, newTime: number) => void;
  onDragPreview: (originalTime: number, time: number) => void;
  onDragEnd: () => void;
  easeExpanded: boolean;
}) {
  const { startTimelinePointerTransaction } = useTimelinePointerTransaction();
  const dragRef = useRef<{
    animationId: string;
    initialTime: number;
  } | null>(null);
  const [dragPreviewTime, setDragPreviewTime] = useState<{
    animationId: string;
    time: number;
  } | null>(null);

  function timeFromClientX(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || contentWidth <= 0 || timelineDuration <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(ratio * timelineDuration, timelineDuration));
  }

  function startKeyframeDrag(
    event: PointerEvent<HTMLButtonElement>,
    keyframe: ComposeAnimationKeyframePoint,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    onSelectKeyframeIds(
      [
        composeKeyframeSelectionId(
          layerId,
          trackKey,
          keyframe.animationId,
          keyframe.time,
        ),
      ],
      event.shiftKey || event.metaKey || event.ctrlKey,
    );
    startTimelinePointerTransaction({
      event,
      capturePointer: true,
      onDragStart: () => {
        dragRef.current = {
          animationId: keyframe.animationId,
          initialTime: keyframe.time,
        };
      },
      onPreview: ({ clientX }) => {
        const drag = dragRef.current;
        if (!drag) return;
        const t = timeFromClientX(clientX);
        setDragPreviewTime({ animationId: drag.animationId, time: t });
        onDragPreview(drag.initialTime, t);
      },
      onCommit: ({ clientX }) => {
        const drag = dragRef.current;
        if (!drag) return;
        const newTime = timeFromClientX(clientX);
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
        onMoveKeyframe(drag.animationId, newTime);
      },
      onCancel: () => {
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
      },
      onDragEnd: () => {
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
      },
    });
  }

  return (
    <div
      className={`relative h-full border-t border-[#202633] bg-[#111722]${easeExpanded ? "" : " border-b"}`}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-timeline-control]")) {
          onSelect();
          onStartKeyframeMarquee(event);
        }
      }}
    >
      {keyframes.map((keyframe, index) => {
        const selectionId = composeKeyframeSelectionId(
          layerId,
          trackKey,
          keyframe.animationId,
          keyframe.time,
        );
        const selected = selectedKeyframeIds.has(selectionId);
        // Own drag preview takes priority, then overview drag preview for same time
        const displayTime =
          dragPreviewTime?.animationId === keyframe.animationId
            ? dragPreviewTime.time
            : overviewDragPreview &&
                Math.abs(overviewDragPreview.originalTime - keyframe.time) <
                  0.001
              ? overviewDragPreview.time
              : keyframe.time;
        return (
          <button
            key={`${keyframe.animationId}-${keyframe.time}-${index}`}
            data-timeline-control
            className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
              selected
                ? "border-[#159dff] bg-[#159dff] shadow-[0_0_0_3px_rgba(21,157,255,0.24)]"
                : "border-white bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.14)]"
            }`}
            title={`${keyframe.time.toFixed(2)}s: ${String(keyframe.value)}`}
            style={{
              left: `${timelineDuration > 0 ? (displayTime / timelineDuration) * 100 : 0}%`,
            }}
            onClick={(event) => {
              if (dragRef.current) return;
              event.stopPropagation();
              onSelect();
            }}
            onPointerDown={(event) => startKeyframeDrag(event, keyframe)}
          />
        );
      })}
    </div>
  );
}

const easePresets: { label: string; value: MotionEase }[] = [
  { label: "Linear", value: "linear" },
  { label: "Ease in", value: "easeIn" },
  { label: "Ease out", value: "easeOut" },
  { label: "Ease in-out", value: "easeInOut" },
  { label: "In and out", value: "inAndOut" },
  { label: "Expo in", value: "expoIn" },
  { label: "Expo out", value: "expoOut" },
  { label: "Circ out", value: "circOut" },
  { label: "Back out", value: "backOut" },
];

const easeCurvePoints: Record<MotionEase, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  inAndOut: [0.76, 0, 0.24, 1],
  expoIn: [0.95, 0.05, 0.795, 0.035],
  expoOut: [0.19, 1, 0.22, 1],
  circOut: [0.075, 0.82, 0.165, 1],
  backOut: [0.34, 1.56, 0.64, 1],
};

type EaseControlPoints = readonly [number, number, number, number];

function getEaseControlPoints(
  ease: MotionEase | EaseControlPoints | undefined,
): EaseControlPoints {
  if (ease && typeof ease !== "string" && ease.length === 4) return ease;
  return easeCurvePoints[ease ?? "linear"] ?? easeCurvePoints.linear;
}

const defaultEaseRowHeight = 72;
const minEaseRowHeight = 48;
const maxEaseRowHeight = 160;

function getComposeRowHeight(
  row: ComposeAnimationTimelineRow,
  easeRowHeights: Record<string, number>,
): number {
  if (row.kind === "ease") {
    const h = easeRowHeights[row.id] ?? defaultEaseRowHeight;
    return Math.max(minEaseRowHeight, Math.min(maxEaseRowHeight, h));
  }
  return composeTimelineRowHeight;
}

function buildEaseSvgPath(
  controlPoints: EaseControlPoints,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  // CSS cubic-bezier(p1x, p1y, p2x, p2y) describes value progress over time.
  // x0,y0 = SVG position of start keyframe; x1,y1 = SVG position of end keyframe.
  // SVG Y is inverted: smaller Y = higher on screen = higher value.
  // The bezier handles in CSS space: p1x/p2x are time fractions (0→1),
  // p1y/p2y are value fractions (0→1, where 0=start value, 1=end value).
  // In SVG space: time maps to x (x0→x1), value maps to y (y0→y1, already inverted).
  const [p1x, p1y, p2x, p2y] = controlPoints;
  const w = x1 - x0; // width in SVG units
  const h = y1 - y0; // height in SVG units (negative when value increases, since SVG Y inverted)
  // Control point 1: at time=p1x, value=p1y
  const cp1x = x0 + p1x * w;
  const cp1y = y0 + p1y * h;
  // Control point 2: at time=p2x, value=p2y
  const cp2x = x0 + p2x * w;
  const cp2y = y0 + p2y * h;
  return `M ${x0} ${y0} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x1} ${y1}`;
}

function ComposeEaseLane({
  track,
  layer,
  timelineDuration,
  height,
  contentWidth,
  timelineRef,
  overviewDragPreview,
  onApplyEase,
  onMoveKeyframesAtTime,
  onDragPreview,
  onDragEnd,
  onResize,
  setAppContextMenu,
}: {
  track: ComposeAnimationAttributeTrack;
  layer: ComposeAnimationTimelineLayer;
  timelineDuration: number;
  height: number;
  contentWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  overviewDragPreview: { originalTime: number; time: number } | null;
  onApplyEase: (
    animationId: string,
    ease: MotionEase | readonly [number, number, number, number],
  ) => void;
  onMoveKeyframesAtTime: (originalTime: number, newTime: number) => void;
  onDragPreview: (originalTime: number, time: number) => void;
  onDragEnd: () => void;
  onResize: (height: number) => void;
  setAppContextMenu:
    | ((menu: import("../../app/types").ContextMenuState) => void)
    | undefined;
}) {
  const { startTimelinePointerTransaction } = useTimelinePointerTransaction();
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [selectedSegIndex, setSelectedSegIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    originalTime: number;
    time: number;
    xFrac: number;
  } | null>(null);
  const [handlePreview, setHandlePreview] = useState<{
    segIndex: number;
    controlPoints: EaseControlPoints;
  } | null>(null);

  const segments = useMemo(() => {
    const result: {
      startAnimationId: string;
      endAnimationId: string;
      ease: MotionEase | EaseControlPoints;
      controlPoints: EaseControlPoints;
      x0Time: number;
      x1Time: number;
      x0Frac: number;
      x1Frac: number;
      normY0: number;
      normY1: number;
    }[] = [];
    if (timelineDuration <= 0) return result;

    const numericKeyframes = track.keyframes.filter(
      (kf): kf is typeof kf & { value: number } => typeof kf.value === "number",
    );
    if (numericKeyframes.length < 2) return result;

    const sorted = [...numericKeyframes].sort((a, b) => a.time - b.time);
    const allValues = sorted.map((kf) => kf.value);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    // When all values are equal, center the line at 0.5
    const range = maxVal === minVal ? 0 : maxVal - minVal;

    for (let i = 0; i < sorted.length - 1; i++) {
      const kf = sorted[i];
      const nextKf = sorted[i + 1];
      const ease = layer.animations?.find((a) => a.id === kf.animationId)
        ?.options.ease as MotionEase | EaseControlPoints | undefined;
      result.push({
        startAnimationId: kf.animationId,
        endAnimationId: nextKf.animationId,
        ease: ease ?? "easeInOut",
        controlPoints: getEaseControlPoints(ease ?? "easeInOut"),
        x0Time: kf.time,
        x1Time: nextKf.time,
        x0Frac: sorted[i].time / timelineDuration,
        x1Frac: nextKf.time / timelineDuration,
        // range=0 means flat: center at 0.5
        normY0: range === 0 ? 0.5 : (sorted[i].value - minVal) / range,
        normY1: range === 0 ? 0.5 : (nextKf.value - minVal) / range,
      });
    }
    return result;
  }, [track, layer, timelineDuration]);

  function openEaseContextMenu(event: ReactMouseEvent, animationId: string) {
    event.preventDefault();
    event.stopPropagation();
    setAppContextMenu?.({
      x: event.clientX,
      y: event.clientY,
      items: easePresets.map((preset) => ({
        label: preset.label,
        action: () => onApplyEase(animationId, preset.value),
      })),
    });
  }

  function timeFromClientX(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || contentWidth <= 0 || timelineDuration <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(ratio * timelineDuration, timelineDuration));
  }

  const pad = 8;
  const svgH = Math.max(height - 2, 1);
  const drawH = svgH - pad * 2;

  function getDisplayXFrac(time: number, fallback: number) {
    const preview = dragPreview ?? overviewDragPreview;
    return preview && Math.abs(preview.originalTime - time) < 0.001
      ? Math.max(0, Math.min(1, preview.time / timelineDuration))
      : fallback;
  }

  function startDotDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    segIndex: number,
    isStart: boolean,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const seg = segments[segIndex];
    if (!seg) return;
    const originalTime = isStart ? seg.x0Time : seg.x1Time;
    setSelectedSegIndex(segIndex);

    startTimelinePointerTransaction({
      event,
      capturePointer: true,
      onDragStart: () => {
        setSelectedSegIndex(null);
      },
      onPreview: ({ clientX }) => {
        const newTime = timeFromClientX(clientX);
        setDragPreview({
          originalTime,
          time: newTime,
          xFrac: timelineDuration > 0 ? newTime / timelineDuration : 0,
        });
        onDragPreview(originalTime, newTime);
      },
      onCommit: ({ clientX, hasDragged }) => {
        setDragPreview(null);
        if (hasDragged) {
          const newTime = timeFromClientX(clientX);
          onMoveKeyframesAtTime(originalTime, newTime);
        }
      },
      onCancel: () => {
        setDragPreview(null);
        onDragEnd();
      },
      onDragEnd: () => {
        setDragPreview(null);
        onDragEnd();
      },
    });
  }

  function startHandleDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    segIndex: number,
    handleIndex: 0 | 1,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const seg = segments[segIndex];
    if (!seg) return;

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    const laneRect = laneRef.current?.getBoundingClientRect();
    if (!timelineRect || !laneRect) return;

    const x0 = seg.x0Frac * timelineRect.width;
    const x1 = seg.x1Frac * timelineRect.width;
    const segWidth = x1 - x0;
    const y0 = pad + (1 - seg.normY0) * drawH;
    const y1 = pad + (1 - seg.normY1) * drawH;
    const segHeight = y1 - y0;

    let newCp = [...seg.controlPoints] as [number, number, number, number];

    startTimelinePointerTransaction({
      event,
      capturePointer: true,
      onPreview: ({ clientX, clientY }) => {
        if (segWidth <= 0) return;
        const relX = (clientX - timelineRect.left - x0) / segWidth;
        const pointerY = clientY - laneRect.top;
        const relY =
          Math.abs(segHeight) < 0.0001
            ? 1 - (pointerY - pad) / drawH
            : (pointerY - y0) / segHeight;
        const clampedX = Math.max(0, Math.min(1, relX));
        const clampedY = Math.max(-0.5, Math.min(1.5, relY));
        if (handleIndex === 0) {
          newCp = [clampedX, clampedY, newCp[2], newCp[3]];
        } else {
          newCp = [newCp[0], newCp[1], clampedX, clampedY];
        }
        setHandlePreview({ segIndex, controlPoints: newCp });
      },
      onCommit: () => {
        setHandlePreview(null);
        onApplyEase(seg.startAnimationId, newCp);
      },
      onCancel: () => {
        setHandlePreview(null);
      },
      onDragEnd: () => {
        setHandlePreview(null);
      },
    });
  }

  return (
    <div
      ref={laneRef}
      className="relative border-b border-[#1a2030] bg-[#0d1018]"
      style={{ height }}
    >
      {/* Grid lines + bezier handle lines */}
      <svg
        className="absolute inset-0 w-full pointer-events-none"
        style={{ height: svgH }}
      >
        <line
          x1="0%"
          y1={pad}
          x2="100%"
          y2={pad}
          stroke="#1a2535"
          strokeWidth="1"
        />
        <line
          x1="0%"
          y1={svgH / 2}
          x2="100%"
          y2={svgH / 2}
          stroke="#1e2535"
          strokeWidth="1"
        />
        <line
          x1="0%"
          y1={svgH - pad}
          x2="100%"
          y2={svgH - pad}
          stroke="#1a2535"
          strokeWidth="1"
        />
        {segments.map((seg, i) => {
          if (selectedSegIndex !== i) return null;
          const svgY0 = pad + (1 - seg.normY0) * drawH;
          const svgY1 = pad + (1 - seg.normY1) * drawH;
          const controlPoints =
            handlePreview?.segIndex === i
              ? handlePreview.controlPoints
              : seg.controlPoints;
          const [cp1x, cp1y, cp2x, cp2y] = controlPoints;
          const displayX0Frac = getDisplayXFrac(seg.x0Time, seg.x0Frac);
          const displayX1Frac = getDisplayXFrac(seg.x1Time, seg.x1Frac);
          const h1x = `${(displayX0Frac + cp1x * (displayX1Frac - displayX0Frac)) * 100}%`;
          const h1y = svgY0 + cp1y * (svgY1 - svgY0);
          const h2x = `${(displayX0Frac + cp2x * (displayX1Frac - displayX0Frac)) * 100}%`;
          const h2y = svgY0 + cp2y * (svgY1 - svgY0);
          const x0Pct = `${displayX0Frac * 100}%`;
          const x1Pct = `${displayX1Frac * 100}%`;
          return (
            <g key={`handles-${i}`}>
              <line
                x1={x0Pct}
                y1={svgY0}
                x2={h1x}
                y2={h1y}
                stroke="var(--clipper-accent,#6c8ef5)"
                strokeWidth="1"
                strokeDasharray="3 2"
                opacity="0.8"
              />
              <line
                x1={x1Pct}
                y1={svgY1}
                x2={h2x}
                y2={h2y}
                stroke="var(--clipper-accent,#6c8ef5)"
                strokeWidth="1"
                strokeDasharray="3 2"
                opacity="0.8"
              />
            </g>
          );
        })}
      </svg>
      {/* Ease curves */}
      <svg
        className="absolute inset-0 w-full pointer-events-none"
        style={{ height: svgH }}
        viewBox={`0 0 1000 ${svgH}`}
        preserveAspectRatio="none"
      >
        {segments.length > 0 ? (
          <>
            <line
              x1={0}
              y1={pad + (1 - segments[0].normY0) * drawH}
              x2={
                getDisplayXFrac(segments[0].x0Time, segments[0].x0Frac) * 1000
              }
              y2={pad + (1 - segments[0].normY0) * drawH}
              stroke="var(--clipper-accent,#6c8ef5)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={
                getDisplayXFrac(
                  segments[segments.length - 1].x1Time,
                  segments[segments.length - 1].x1Frac,
                ) * 1000
              }
              y1={pad + (1 - segments[segments.length - 1].normY1) * drawH}
              x2={1000}
              y2={pad + (1 - segments[segments.length - 1].normY1) * drawH}
              stroke="var(--clipper-accent,#6c8ef5)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {segments.map((seg, i) => {
          const displayX0Frac = getDisplayXFrac(seg.x0Time, seg.x0Frac);
          const displayX1Frac = getDisplayXFrac(seg.x1Time, seg.x1Frac);
          const x0 = displayX0Frac * 1000;
          const x1 = displayX1Frac * 1000;
          const svgY0 = pad + (1 - seg.normY0) * drawH;
          const svgY1 = pad + (1 - seg.normY1) * drawH;
          const controlPoints =
            handlePreview?.segIndex === i
              ? handlePreview.controlPoints
              : seg.controlPoints;
          const path = buildEaseSvgPath(controlPoints, x0, svgY0, x1, svgY1);
          return (
            <path
              key={`curve-${i}`}
              d={path}
              fill="none"
              stroke="var(--clipper-accent,#6c8ef5)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {/* Hit areas for curves (right-click) */}
      <svg
        className="absolute inset-0 w-full"
        style={{ height: svgH }}
        viewBox={`0 0 1000 ${svgH}`}
        preserveAspectRatio="none"
      >
        {segments.map((seg, i) => {
          const x0 = getDisplayXFrac(seg.x0Time, seg.x0Frac) * 1000;
          const x1 = getDisplayXFrac(seg.x1Time, seg.x1Frac) * 1000;
          const svgY0 = pad + (1 - seg.normY0) * drawH;
          const svgY1 = pad + (1 - seg.normY1) * drawH;
          const controlPoints =
            handlePreview?.segIndex === i
              ? handlePreview.controlPoints
              : seg.controlPoints;
          const path = buildEaseSvgPath(controlPoints, x0, svgY0, x1, svgY1);
          return (
            <path
              key={`hit-${i}`}
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: "pointer" }}
              onContextMenu={(e) =>
                openEaseContextMenu(e, seg.startAnimationId)
              }
            />
          );
        })}
      </svg>
      {/* HTML button overlays for dots — proper pointer capture + hover */}
      {segments.map((seg, i) => {
        const displayX0Frac = getDisplayXFrac(seg.x0Time, seg.x0Frac);
        const displayX1Frac = getDisplayXFrac(seg.x1Time, seg.x1Frac);
        const svgY0 = pad + (1 - seg.normY0) * drawH;
        const svgY1 = pad + (1 - seg.normY1) * drawH;
        const isSelected = selectedSegIndex === i;
        const dotColor = isSelected
          ? "#ffffff"
          : "var(--clipper-accent,#6c8ef5)";
        const controlPoints =
          handlePreview?.segIndex === i
            ? handlePreview.controlPoints
            : seg.controlPoints;
        const [cp1x, cp1y, cp2x, cp2y] = controlPoints;
        const h1xFrac = displayX0Frac + cp1x * (displayX1Frac - displayX0Frac);
        const h1y =
          pad + (1 - (seg.normY0 + cp1y * (seg.normY1 - seg.normY0))) * drawH;
        const h2xFrac = displayX0Frac + cp2x * (displayX1Frac - displayX0Frac);
        const h2y =
          pad + (1 - (seg.normY0 + cp2y * (seg.normY1 - seg.normY0))) * drawH;
        const handlePad = 8;
        const h1ButtonY = Math.max(handlePad, Math.min(svgH - handlePad, h1y));
        const h2ButtonY = Math.max(handlePad, Math.min(svgH - handlePad, h2y));
        return (
          <div key={`dots-${i}`}>
            {/* Start dot */}
            <button
              data-timeline-control
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125 focus:outline-none"
              style={{
                left: `${displayX0Frac * 100}%`,
                top: svgY0,
                background: dotColor,
                border: "1.5px solid #0d1018",
                cursor: "pointer",
              }}
              onPointerDown={(e) => startDotDrag(e, i, true)}
              onContextMenu={(e) =>
                openEaseContextMenu(e, seg.startAnimationId)
              }
            />
            {/* End dot */}
            <button
              data-timeline-control
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125 focus:outline-none"
              style={{
                left: `${displayX1Frac * 100}%`,
                top: svgY1,
                background: dotColor,
                border: "1.5px solid #0d1018",
                cursor: "pointer",
              }}
              onPointerDown={(e) => startDotDrag(e, i, false)}
              onContextMenu={(e) =>
                openEaseContextMenu(e, seg.startAnimationId)
              }
            />
            {/* Bezier handle buttons when selected */}
            {isSelected && (
              <>
                <button
                  data-timeline-control
                  className="absolute z-50 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[1px] transition-transform hover:scale-125 focus:outline-none"
                  style={{
                    left: `${h1xFrac * 100}%`,
                    top: h1ButtonY,
                    background: "#0d1018",
                    border: "1.5px solid var(--clipper-accent,#6c8ef5)",
                    boxShadow: "0 0 0 2px rgba(108,142,245,0.2)",
                    cursor: "pointer",
                  }}
                  onPointerDown={(e) => startHandleDrag(e, i, 0)}
                />
                <button
                  data-timeline-control
                  className="absolute z-50 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[1px] transition-transform hover:scale-125 focus:outline-none"
                  style={{
                    left: `${h2xFrac * 100}%`,
                    top: h2ButtonY,
                    background: "#0d1018",
                    border: "1.5px solid var(--clipper-accent,#6c8ef5)",
                    boxShadow: "0 0 0 2px rgba(108,142,245,0.2)",
                    cursor: "pointer",
                  }}
                  onPointerDown={(e) => startHandleDrag(e, i, 1)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function areComposeAnimationTimelinePanelPropsEqual(
  previous: ComposeAnimationTimelinePanelProps,
  next: ComposeAnimationTimelinePanelProps,
) {
  if (!next.scrubbingRef.current) return false;
  return (
    previous.part === next.part &&
    previous.isPlaying === next.isPlaying &&
    previous.playbackPlayheadRef === next.playbackPlayheadRef &&
    previous.scrubbingRef === next.scrubbingRef &&
    previous.scrubSnapEnabled === next.scrubSnapEnabled &&
    previous.selectedObjectIds === next.selectedObjectIds &&
    previous.timelineLayers === next.timelineLayers &&
    previous.timelineViewportState === next.timelineViewportState
  );
}
