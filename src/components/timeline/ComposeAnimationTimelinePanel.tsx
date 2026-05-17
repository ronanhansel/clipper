import {
  Component as ReactComponent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Goal } from "lucide-react";
import type { ContextMenuState } from "../../app/types";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import { roundTwo } from "../../core/math";
import { getTimelineTicks } from "../../core/timeline";
import { getDisplayNameFromPath } from "../../core/fileNames";
import {
  upsertPropertyKeyframe,
  type PropertyPath,
} from "../../core/propertyRegistry";
import type {
  FrameObject,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  buildComposeAnimationTimelineRows,
  composeAnimationPresets,
  getComposeAnimationLayerKeyframes,
  getComposeAnimationAttributeTracks,
  buildComposeAnimationTimelineLayers,
  getComposeParentOptions,
  removeComposeGenericPropertyKeyframeSelections,
  moveComposeGenericPropertyKeyframe,
  moveComposeGenericPropertyKeyframesAtTime,
  getGenericPropertyPathForComposeAttribute,
  getGenericPropertyPathFromComposeAnimationId,
  isGenericComposeAnimationId,
  type ComposeAnimationAttributeKey,
  type ComposeAnimationTimelineAttributeKey,
  type ComposeAnimationKeyframePoint,
  type ComposeAnimationKeyframeSelection,
  type ComposeAnimationAttributeTrack,
  type ComposeAnimationTimelineRow,
  type ComposeAnimationTimelineLayer,
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
  onInspectObject?: (object: FrameObject | null) => void;
  onSelectObjects?: (objects: FrameObject[]) => void;
  onTimelineLayersChange: (
    updater: (state: TimelineLayerState) => TimelineLayerState,
    options?: { history?: boolean },
  ) => void;
  onTimelineViewportStateChange: (
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) => void;
  onUpdateObject?: (
    objectId: string,
    updater: (object: FrameObject) => FrameObject,
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
  selections: ComposeAnimationKeyframeSelection[];
};

type ComposeKeyframeMarqueeDrag = {
  startContentX: number;
  startContentY: number;
  currentContentX: number;
  currentContentY: number;
  additive: boolean;
  initialSelectedIds: Set<string>;
};

type ComposePickWhipDrag = {
  childLayerId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

function composeKeyframeSelectionId(
  layerId: string,
  key: ComposeAnimationTimelineAttributeKey,
  animationId: string,
  time: number,
  _pointId?: string,
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
  function ComposeAnimationTimelinePanel(
    props: ComposeAnimationTimelinePanelProps,
  ) {
    return (
      <ComposeAnimationTimelineBoundary
        partId={props.part?.id ?? "compose-animation"}
        filePath={props.part?.filePath ?? "Composition"}
      >
        <ComposeAnimationTimelinePanelContent {...props} />
      </ComposeAnimationTimelineBoundary>
    );
  },
  areComposeAnimationTimelinePanelPropsEqual,
);

function ComposeAnimationTimelinePanelContent({
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
  onInspectObject,
  onSelectObjects,
  onTimelineLayersChange,
  onTimelineViewportStateChange,
  onUpdateObject,
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
  const [overviewDragPreview, setOverviewDragPreview] = useState<{
    layerId: string;
    originalTime: number;
    time: number;
  } | null>(null);
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedEaseTrackIds, setExpandedEaseTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [easeRowHeights, setEaseRowHeights] = useState<Record<string, number>>(
    () => ({}),
  );
  const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [keyframeMarquee, setKeyframeMarquee] =
    useState<ComposeKeyframeMarqueeDrag | null>(null);
  const keyframeMarqueeRef = useRef<ComposeKeyframeMarqueeDrag | null>(null);
  const [pickWhipDrag, setPickWhipDrag] = useState<ComposePickWhipDrag | null>(
    null,
  );
  const pickWhipDragRef = useRef<ComposePickWhipDrag | null>(null);
  const [pickWhipDropLayerId, setPickWhipDropLayerId] = useState<string | null>(
    null,
  );
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
  const layerRailWidth = 430;
  const scrubSnapBoundaries = useMemo(() => {
    const times = new Set<number>([0, partDuration]);
    for (const target of keyframeHitTargets) {
      const roundedTime = Math.round(target.time * 1000) / 1000;
      times.add(roundedTime);
    }
    return Array.from(times).sort((a, b) => a - b);
  }, [partDuration, keyframeHitTargets]);

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
    const selectionsByLayerId = new Map<
      string,
      ComposeAnimationKeyframeSelection[]
    >();
    for (const target of keyframeHitTargets) {
      if (!target.selectionIds.some((id) => selectedKeyframeIds.has(id))) {
        continue;
      }
      const items = selectionsByLayerId.get(target.layerId) ?? [];
      items.push(...target.selections);
      selectionsByLayerId.set(target.layerId, items);
    }
    if (!selectionsByLayerId.size) return false;

    for (const layer of layers) {
      const selections = selectionsByLayerId.get(layer.id);
      if (!selections?.length) continue;
      if (layer.object) {
        onUpdateObject?.(layer.object.id, (object) =>
          removeComposeGenericPropertyKeyframeSelections(
            object,
            selections.filter((selection) =>
              isGenericComposeAnimationId(selection.animationId),
            ),
            currentTime,
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

  function inspectLayer(layer: ComposeAnimationTimelineLayer) {
    onInspectObject?.(layer.object ?? null);
  }

  function setLayerParent(childLayerId: string, parentLayerId: string) {
    if (!onUpdateObject) return;
    const child = layers.find((layer) => layer.id === childLayerId);
    if (!child?.object) return;
    const nextParentId = parentLayerId || undefined;
    const parentOptions = getComposeParentOptions(layers, childLayerId);
    if (
      nextParentId &&
      !parentOptions.some((layer) => layer.id === nextParentId)
    )
      return;
    onUpdateObject(childLayerId, (object) => ({
      ...object,
      parentId: nextParentId,
    }));
  }

  function startPickWhipDrag(
    event: ReactPointerEvent<HTMLElement>,
    childLayerId: string,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const next: ComposePickWhipDrag = {
      childLayerId,
      startX,
      startY,
      currentX: event.clientX,
      currentY: event.clientY,
    };
    pickWhipDragRef.current = next;
    setPickWhipDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);

    function update(moveEvent: globalThis.PointerEvent) {
      const active = pickWhipDragRef.current;
      if (!active) return;
      const updated = {
        ...active,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
      };
      pickWhipDragRef.current = updated;
      setPickWhipDrag(updated);
      setPickWhipDropLayerId(
        getPickWhipTargetLayerId(
          moveEvent.clientX,
          moveEvent.clientY,
          active.childLayerId,
        ),
      );
    }

    function finish(upEvent: globalThis.PointerEvent) {
      const active = pickWhipDragRef.current;
      pickWhipDragRef.current = null;
      setPickWhipDrag(null);
      setPickWhipDropLayerId(null);
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (!active || upEvent.type === "pointercancel") return;
      const targetLayerId = getPickWhipTargetLayerId(
        upEvent.clientX,
        upEvent.clientY,
        active.childLayerId,
      );
      if (!targetLayerId) return;
      setLayerParent(active.childLayerId, targetLayerId);
    }

    function cancel(cancelEvent: globalThis.PointerEvent) {
      finish(cancelEvent);
    }

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  }

  function getPickWhipTargetLayerId(
    clientX: number,
    clientY: number,
    childLayerId: string,
  ) {
    const targetLayerId = document
      .elementsFromPoint(clientX, clientY)
      .map((element) =>
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-compose-parent-drop-layer-id]")
          : null,
      )
      .find((element) => element?.dataset.composeParentDropLayerId)
      ?.dataset.composeParentDropLayerId;
    if (!targetLayerId || targetLayerId === childLayerId) return null;
    return targetLayerId;
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

  function applyEaseToKeyframe(
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    time: number,
    ease: MotionEase | readonly [number, number, number, number],
  ) {
    const path = getGenericPropertyPathFromComposeAnimationId(animationId);
    if (!layer.object || !path) return;
    const roundedTime = Math.round(time * 1000) / 1000;
    onUpdateObject?.(layer.object.id, (object) => {
      const track = object.tracks?.[path];
      if (!track) return object;
      return {
        ...object,
        tracks: {
          ...(object.tracks ?? {}),
          [path]: {
            ...track,
            points: track.points.map((point) =>
              Math.round(point.time * 1000) / 1000 === roundedTime
                ? { ...point, easingToNext: ease }
                : point,
            ),
          },
        },
      };
    });
  }

  function applyEaseToTrack(
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    ease: MotionEase | readonly [number, number, number, number],
  ) {
    const path = getGenericPropertyPathFromComposeAnimationId(animationId);
    if (!layer.object || !path) return;
    onUpdateObject?.(layer.object.id, (object) => {
      const track = object.tracks?.[path];
      if (!track) return object;
      return {
        ...object,
        tracks: {
          ...(object.tracks ?? {}),
          [path]: {
            ...track,
            points: track.points.map((point, index) =>
              index < track.points.length - 1
                ? { ...point, easingToNext: ease }
                : point,
            ),
          },
        },
      };
    });
  }

  function applyPresetToLayer(
    layer: ComposeAnimationTimelineLayer | null,
    presetId: string,
  ) {
    const preset = composeAnimationPresets.find((item) => item.id === presetId);
    if (!layer?.object || !preset) return;
    const delay = Math.max(0, Math.min(currentTime, partDuration));
    onUpdateObject?.(layer.object.id, (object) => {
      let nextObject = object;
      for (const track of preset.tracks) {
        const path = getGenericPropertyPathForComposeAttribute(track.property);
        if (!path) continue;
        for (const point of track.points) {
          const time = Math.round((delay + point.time) * 1000) / 1000;
          nextObject = upsertPropertyKeyframe(
            nextObject,
            path,
            time,
            point.value,
          );
          if (point.easingToNext || point.hold) {
            nextObject = setGenericTrackPointTiming(
              nextObject,
              path,
              time,
              point.easingToNext,
              point.hold,
            );
          }
        }
      }
      return nextObject;
    });
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

  function setGenericTrackPointTiming(
    object: FrameObject,
    path: PropertyPath,
    time: number,
    easingToNext:
      | MotionEase
      | readonly [number, number, number, number]
      | undefined,
    hold: boolean | undefined,
  ) {
    const track = object.tracks?.[path];
    if (!track) return object;
    return {
      ...object,
      tracks: {
        ...(object.tracks ?? {}),
        [path]: {
          ...track,
          points: track.points.map((point) =>
            Math.round(point.time * 1000) / 1000 === time
              ? { ...point, easingToNext, hold }
              : point,
          ),
        },
      },
    };
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
        layerHeaderContent={<ComposeTimelineLayerHeader />}
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
      laneContentHeight={laneContentHeight}
      laneRowsStyle={laneRowsStyle}
      layerRailWidth={layerRailWidth}
      layerHeaderContent={<ComposeTimelineLayerHeader />}
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
              parentOptions={getComposeParentOptions(layers, row.layer.id)}
              onSetLayerParent={setLayerParent}
              onStartPickWhipDrag={startPickWhipDrag}
              pickWhipDropActive={pickWhipDropLayerId === row.layer.id}
            />
          ))}
          {pickWhipDrag ? (
            <ComposePickWhipDragLine drag={pickWhipDrag} />
          ) : null}
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
              onOpenPresetContextMenu={openComposePresetContextMenu}
              onApplyEase={(layer, animationId, time, ease) =>
                applyEaseToKeyframe(layer, animationId, time, ease)
              }
              onResizeEaseRow={(rowId, height) =>
                setEaseRowHeights((prev) => ({ ...prev, [rowId]: height }))
              }
              onMoveKeyframe={(layer, animationId, fromTime, newTime) => {
                if (!layer.object || !isGenericComposeAnimationId(animationId))
                  return;
                onUpdateObject?.(layer.object.id, (object) =>
                  moveComposeGenericPropertyKeyframe(
                    object,
                    animationId,
                    fromTime,
                    newTime,
                    partDuration,
                  ),
                );
              }}
              onMoveKeyframesAtTime={(layer, originalTime, newTime) => {
                if (!layer.object) return;
                onUpdateObject?.(layer.object.id, (object) =>
                  moveComposeGenericPropertyKeyframesAtTime(
                    object,
                    originalTime,
                    newTime,
                    partDuration,
                  ),
                );
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
              onInspectLayer={inspectLayer}
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
}

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
          keyframe.pointId,
        );
        targets.push({
          id,
          layerId: row.layer.id,
          rowId: row.id,
          time: keyframe.time,
          x: (keyframe.time / timelineDuration) * contentWidth,
          y: rowY,
          selectionIds: [id],
          selections: [
            {
              animationId: keyframe.animationId,
              pointId: keyframe.pointId,
              key: row.track.key,
              time: keyframe.time,
            },
          ],
        });
      }
      return;
    }

    if (row.kind !== "layer") return;
    const byTime = new Map<
      number,
      {
        selectionIds: string[];
        selections: ComposeAnimationKeyframeSelection[];
      }
    >();
    for (const track of getComposeAnimationAttributeTracks(row.layer)) {
      for (const keyframe of track.keyframes) {
        const roundedTime = Math.round(keyframe.time * 1000);
        const group = byTime.get(roundedTime) ?? {
          selectionIds: [],
          selections: [],
        };
        group.selectionIds.push(
          composeKeyframeSelectionId(
            row.layer.id,
            track.key,
            keyframe.animationId,
            keyframe.time,
            keyframe.pointId,
          ),
        );
        group.selections.push({
          animationId: keyframe.animationId,
          pointId: keyframe.pointId,
          key: track.key,
          time: keyframe.time,
        });
        byTime.set(roundedTime, group);
      }
    }
    for (const [roundedTime, group] of byTime) {
      const time = roundedTime / 1000;
      targets.push({
        id: `${row.layer.id}:overview:${roundedTime}`,
        layerId: row.layer.id,
        rowId: row.id,
        time,
        x: (time / timelineDuration) * contentWidth,
        y: rowY,
        selectionIds: group.selectionIds,
        selections: group.selections,
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
          keyframe.pointId,
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

function ComposeTimelineLayerHeader() {
  return (
    <div className="grid h-full min-w-0 flex-1 grid-cols-[32px_36px_minmax(0,1fr)_170px] items-center border-b border-[#2d313b] text-[10px] font-extrabold uppercase text-[#7f8796]">
      <span />
      <span className="text-center">#</span>
      <span className="truncate px-1">Layer Name</span>
      <span className="truncate px-2">Parent & Link</span>
    </div>
  );
}

function ComposePickWhipDragLine({ drag }: { drag: ComposePickWhipDrag }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[90] h-screen w-screen"
    >
      <line
        x1={drag.startX}
        y1={drag.startY}
        x2={drag.currentX}
        y2={drag.currentY}
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx={drag.currentX} cy={drag.currentY} fill="white" r="3" />
    </svg>,
    document.body,
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
  parentOptions,
  onSetLayerParent,
  onStartPickWhipDrag,
  pickWhipDropActive,
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
  parentOptions: ComposeAnimationTimelineLayer[];
  onSetLayerParent: (childLayerId: string, parentLayerId: string) => void;
  onStartPickWhipDrag: (
    event: ReactPointerEvent<HTMLElement>,
    childLayerId: string,
  ) => void;
  pickWhipDropActive: boolean;
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
        className={`flex h-full items-center gap-2 border-t border-[#202633] pl-8 pr-3 text-[11px] font-bold text-[#8f98a8]${easeExpanded ? "" : " border-b"} ${row.layer.object?.hidden ? "opacity-35" : ""}`}
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
      className={`grid h-full grid-cols-[32px_36px_minmax(0,1fr)_170px] items-center border border-transparent border-b-[#202633] transition ${row.layer.object?.hidden ? "opacity-40" : ""} ${pickWhipDropActive ? "border-[#159dff] bg-[#159dff]/10 shadow-[inset_0_0_0_1px_rgba(21,157,255,0.45)]" : ""}`}
      data-compose-parent-drop-layer-id={
        row.layer.object ? row.layer.id : undefined
      }
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
      <span
        className="justify-self-center text-[11px] font-extrabold tabular-nums text-[#8f98a8]"
        title={`Layer ${row.layer.number}`}
      >
        {row.layer.number}
      </span>
      <LayerLabel
        editing={editingLayerId === row.layer.id}
        hidden={Boolean(row.layer.object?.hidden)}
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
      <ComposeParentLinkControl
        layer={row.layer}
        parentOptions={parentOptions}
        onSetLayerParent={onSetLayerParent}
        onStartPickWhipDrag={onStartPickWhipDrag}
      />
    </div>
  );
}

function ComposeParentLinkControl({
  layer,
  parentOptions,
  onSetLayerParent,
  onStartPickWhipDrag,
}: {
  layer: ComposeAnimationTimelineLayer;
  parentOptions: ComposeAnimationTimelineLayer[];
  onSetLayerParent: (childLayerId: string, parentLayerId: string) => void;
  onStartPickWhipDrag: (
    event: ReactPointerEvent<HTMLElement>,
    childLayerId: string,
  ) => void;
}) {
  if (!layer.object) {
    return <span className="px-2 text-[11px] font-bold text-[#555d6c]">-</span>;
  }

  return (
    <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-1 pr-2">
      <span
        data-timeline-control
        className="grid h-5 w-5 touch-none place-items-center rounded-[4px] text-[#9aa3b4] transition hover:bg-[#202633] hover:text-[#dfe2ea] active:text-white"
        title="Drag pick whip to a layer name to set parent"
        onPointerDown={(event) => onStartPickWhipDrag(event, layer.id)}
      >
        <PickWhipIcon />
      </span>
      <Select
        value={layer.object.parentId ?? "none"}
        onValueChange={(value) =>
          onSetLayerParent(layer.id, value === "none" ? "" : value)
        }
      >
        <SelectTrigger
          data-timeline-control
          className="h-6 min-w-0 rounded-[4px] bg-[#111319] px-1.5 text-[11px] font-bold text-[#c7ccd8]"
          title="Parent layer"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">None</SelectItem>
            {parentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.number}. {option.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function PickWhipIcon() {
  return <Goal aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />;
}

function ComposeTimelineViewportRow({
  row,
  timelineDuration,
  contentWidth,
  timelineRef,
  easeRowHeight,
  easeExpanded,
  overviewDragPreview,
  onOpenPresetContextMenu,
  onApplyEase,
  onResizeEaseRow,
  onMoveKeyframe,
  onMoveKeyframesAtTime,
  onOverviewDragPreview,
  onOverviewDragEnd,
  selectedKeyframeIds,
  onSelectKeyframeIds,
  onInspectLayer,
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
  onOpenPresetContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    layer: ComposeAnimationTimelineLayer,
  ) => void;
  onApplyEase: (
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    time: number,
    ease: MotionEase | readonly [number, number, number, number],
  ) => void;
  onResizeEaseRow: (rowId: string, height: number) => void;
  onMoveKeyframe: (
    layer: ComposeAnimationTimelineLayer,
    animationId: string,
    fromTime: number,
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
  onInspectLayer: (layer: ComposeAnimationTimelineLayer) => void;
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
        onApplyEase={(animationId, time, ease) =>
          onApplyEase(row.layer, animationId, time, ease)
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
      <div
        className={row.layer.object?.hidden ? "opacity-35" : undefined}
        onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}
      >
        <ComposeAttributeKeyframeLane
          layerId={row.layer.id}
          trackKey={row.track.key}
          keyframes={row.track.keyframes}
          timelineDuration={timelineDuration}
          contentWidth={contentWidth}
          timelineRef={timelineRef}
          overviewDragPreview={overviewDragPreview}
          selectedKeyframeIds={selectedKeyframeIds}
          onInspect={() => onInspectLayer(row.layer)}
          onSelectKeyframeIds={onSelectKeyframeIds}
          onStartKeyframeMarquee={onStartKeyframeMarquee}
          onMoveKeyframe={(animationId, fromTime, newTime) =>
            onMoveKeyframe(row.layer, animationId, fromTime, newTime)
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
      className={`relative h-full border-t border-b border-[#202633] ${row.layer.object?.hidden ? "opacity-35" : ""}`}
      onContextMenu={(event) => onOpenPresetContextMenu(event, row.layer)}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-timeline-control]")) {
          onInspectLayer(row.layer);
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
        onInspectLayer={() => onInspectLayer(row.layer)}
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
  onInspectLayer,
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
  onInspectLayer: () => void;
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
    onInspectLayer();
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
  onInspect,
  onSelectKeyframeIds,
  onStartKeyframeMarquee,
  onMoveKeyframe,
  onDragPreview,
  onDragEnd,
  easeExpanded,
}: {
  layerId: string;
  trackKey: ComposeAnimationTimelineAttributeKey;
  keyframes: ComposeAnimationKeyframePoint[];
  timelineDuration: number;
  contentWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  overviewDragPreview: { originalTime: number; time: number } | null;
  selectedKeyframeIds: Set<string>;
  onInspect: () => void;
  onSelectKeyframeIds: (ids: string[], additive: boolean) => void;
  onStartKeyframeMarquee: (event: PointerEvent<HTMLDivElement>) => void;
  onMoveKeyframe: (
    animationId: string,
    fromTime: number,
    newTime: number,
  ) => void;
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
    onInspect();
    onSelectKeyframeIds(
      [
        composeKeyframeSelectionId(
          layerId,
          trackKey,
          keyframe.animationId,
          keyframe.time,
          keyframe.pointId,
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
        setDragPreviewTime({
          animationId: drag.animationId,
          originalTime: drag.initialTime,
          time: t,
        });
        onDragPreview(drag.initialTime, t);
      },
      onCommit: ({ clientX }) => {
        const drag = dragRef.current;
        if (!drag) return;
        const newTime = timeFromClientX(clientX);
        dragRef.current = null;
        setDragPreviewTime(null);
        onDragEnd();
        onMoveKeyframe(drag.animationId, drag.initialTime, newTime);
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
          onInspect();
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
          keyframe.pointId,
        );
        const selected = selectedKeyframeIds.has(selectionId);
        // Own drag preview takes priority, then overview drag preview for same time
        const displayTime =
          dragPreviewTime &&
          dragPreviewTime.animationId === keyframe.animationId &&
          Math.abs(dragPreviewTime.originalTime - keyframe.time) < 0.001
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
              onInspect();
            }}
            onPointerDown={(event) => startKeyframeDrag(event, keyframe)}
          />
        );
      })}
    </div>
  );
}

const easePresets: { label: string; value: MotionEase }[] = [
  { label: "Snap", value: "snap" },
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
  snap: [1, 0, 1, 0],
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
  ease?: MotionEase | EaseControlPoints,
): string {
  if (ease === "snap") {
    return `M ${x0} ${y0} H ${x1} V ${y1}`;
  }
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
    time: number,
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

  useEffect(() => {
    if (selectedSegIndex === null) return;
    function onMouseDown(e: MouseEvent) {
      if (laneRef.current?.contains(e.target as Node)) return;
      setSelectedSegIndex(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selectedSegIndex]);
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
      const ease = kf.easingToNext as
        | MotionEase
        | EaseControlPoints
        | undefined;
      result.push({
        startAnimationId: kf.animationId,
        endAnimationId: nextKf.animationId,
        ease: ease ?? "linear",
        controlPoints: getEaseControlPoints(ease ?? "linear"),
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

  function openEaseContextMenu(
    event: ReactMouseEvent,
    animationId: string,
    time: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const itemFor = (preset: { label: string; value: MotionEase }) => ({
      label: preset.label,
      action: () => onApplyEase(animationId, time, preset.value),
    });
    const top = ["snap", "linear"] as const;
    const topItems = top
      .map((value) => easePresets.find((p) => p.value === value))
      .filter((preset): preset is { label: string; value: MotionEase } =>
        Boolean(preset),
      )
      .map(itemFor);
    const restItems = easePresets
      .filter((preset) => !top.includes(preset.value as (typeof top)[number]))
      .map(itemFor);
    setAppContextMenu?.({
      x: event.clientX,
      y: event.clientY,
      items: [...topItems, { label: "Ease", children: restItems }],
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
        onApplyEase(seg.startAnimationId, seg.x0Time, newCp);
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
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-timeline-control]"))
          return;
        setSelectedSegIndex(null);
      }}
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
          if (seg.ease === "snap") return null;
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
          const path = buildEaseSvgPath(
            controlPoints,
            x0,
            svgY0,
            x1,
            svgY1,
            seg.ease,
          );
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
          const path = buildEaseSvgPath(
            controlPoints,
            x0,
            svgY0,
            x1,
            svgY1,
            seg.ease,
          );
          return (
            <path
              key={`hit-${i}`}
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: "pointer" }}
              onContextMenu={(e) =>
                openEaseContextMenu(e, seg.startAnimationId, seg.x0Time)
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
                openEaseContextMenu(e, seg.startAnimationId, seg.x0Time)
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
                openEaseContextMenu(e, seg.startAnimationId, seg.x0Time)
              }
            />
            {/* Bezier handle buttons when selected */}
            {isSelected && seg.ease !== "snap" && (
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

class ComposeAnimationTimelineBoundary extends ReactComponent<
  { children: ReactNode; partId: string; filePath: string },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: timelineErrorMessage(error) };
  }

  componentDidUpdate(previousProps: { partId: string }) {
    if (previousProps.partId !== this.props.partId && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: unknown) {
    console.error("Compose animation timeline failed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full min-h-[220px] place-items-center bg-[#080b11] p-6 text-[#ffd6d6]">
          <div className="max-w-[920px] rounded-md border border-[#5a222c] bg-[#1a0f13]/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
            <div className="text-sm font-bold text-[#ff8b96]">
              Composition timeline failed
            </div>
            <div className="mt-1 break-all font-mono text-xs text-[#a7adbb]">
              {this.props.filePath}
            </div>
            <pre className="mt-4 max-h-[260px] overflow-auto whitespace-pre-wrap rounded border border-[#3b2a2a] bg-[#090b10] p-3 font-mono text-xs leading-relaxed text-[#ffd6d6]">
              {this.state.error}
            </pre>
            <button
              className="mt-4 rounded-md border border-[#6a313b] px-3 py-1.5 text-sm font-semibold text-[#ffe2e2] hover:bg-[#2a151a]"
              type="button"
              onClick={() => this.setState({ error: null })}
            >
              Retry timeline
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function timelineErrorMessage(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
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
