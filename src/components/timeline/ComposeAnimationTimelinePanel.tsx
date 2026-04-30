import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { defaultTimelinePixelsPerSecond } from "../../app/config";
import { roundTwo } from "../../core/math";
import { getTimelineTicks } from "../../core/timeline";
import type { BackgroundLayer, FrameObject, MotionTrack, Part, TimelineLayerState, TimelineViewportState, TimelinePart, TranslationMarker, ZoomMarker } from "../../core/types";
import { useTimelineDragAutoScroll } from "./useTimelineDragAutoScroll";
import { useTimelinePointerTransaction } from "./useTimelinePointerTransaction";
import { getTimelineRowHeight, useTimelineRowResize } from "./useTimelineRowResize";
import { useTimelineScrubber } from "./useTimelineScrubber";
import { useTimelineViewportController } from "./useTimelineViewportController";
import { LayerLabel, LayerResizeSeparator } from "./TimelinePrimitives";
import { TimelineShell } from "./TimelineShell";
import { MotionLane } from "./MotionLane";
import { timelineBlockPreviewKey, type TimelineBlockPreviewMap } from "./timelineBlockPreview";
import type { TimelinePartMotionView } from "./timelineTypes";
import { buildComposeAnimationMotionTimelinePart, buildComposeAnimationTimelineLayers, getComposeAnimationSnapBoundaries, getComposeAnimationTimingDelta, getNextComposeAnimationTiming, updateComposeAnimationLayerMotionTiming, type ComposeAnimationTimelineLayer, type ComposeAnimationTimingDrag } from "./composeAnimationModel";

export function ComposeAnimationTimelinePanel({ currentTime, part, playbackPlayheadRef, scrubbingRef, scrubSnapEnabled, selectedObjectIds, timelineLayers, timelineViewportState, onExitCompose, onRenameLayer, onScrub, onScrubEnd, onScrubStart, onSelectObjects, onTimelineLayersChange, onTimelineViewportStateChange, onUpdateBackgroundMotion, onUpdateObjectMotion }: { currentTime: number; part: Part | null; playbackPlayheadRef: RefObject<HTMLDivElement | null>; scrubbingRef: RefObject<boolean>; scrubSnapEnabled: boolean; selectedObjectIds: string[]; timelineLayers: TimelineLayerState; timelineViewportState: TimelineViewportState; onExitCompose: () => void; onRenameLayer?: (layerId: string, name: string) => void; onScrub: (time: number) => void; onScrubStart: () => void; onScrubEnd: () => void; onSelectObjects?: (objects: FrameObject[]) => void; onTimelineLayersChange: (updater: (state: TimelineLayerState) => TimelineLayerState, options?: { history?: boolean }) => void; onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void; onUpdateBackgroundMotion?: (updater: (motion: MotionTrack | undefined, background: BackgroundLayer) => MotionTrack | undefined) => void; onUpdateObjectMotion?: (objectId: string, updater: (motion: MotionTrack | undefined, object: FrameObject) => MotionTrack | undefined) => void }) {
  const timelineDuration = Math.max(part?.duration ?? 0.1, 0.1);
  const layers = useMemo(() => part ? buildComposeAnimationTimelineLayers(part) : [], [part]);
  const ticks = useMemo(() => getTimelineTicks(timelineDuration), [timelineDuration]);
  const timingDragRef = useRef<ComposeAnimationTimingDrag | null>(null);
  const provisionalContentWidth = Math.max(timelineDuration * defaultTimelinePixelsPerSecond * timelineViewportState.zoom, 160);
  const { timelineRef, timelineViewportRef, timelineRulerViewportRef, timelineLayerRailRef, timelineSnapGuideRef, timelineZoom, updateTimelineZoom, syncTimelineRulerScroll, saveTimelineDisplacement, scrollTimelineFromLayerRail, updateTimelineSnapGuide, clearTimelineSnapGuide } = useTimelineViewportController({
    contentWidth: provisionalContentWidth,
    currentTime,
    displayDuration: timelineDuration,
    playbackPlayheadRef,
    timelineViewportState,
    onTimelineViewportStateChange,
  });
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [timelineBlockPreviews, setTimelineBlockPreviews] = useState<TimelineBlockPreviewMap | null>(null);
  const [timelineDragActive, setTimelineDragActive] = useState(false);
  const [resizePreviewRowHeights, setResizePreviewRowHeights] = useState<Record<string, number> | null>(null);
  const rowHeights = resizePreviewRowHeights ?? timelineLayers.rowHeights ?? {};
  const layerRowHeights = layers.map((layer) => getTimelineRowHeight(rowHeights, layer.id));
  const layerRowStarts = layerRowHeights.reduce<number[]>((starts, height, index) => [...starts, index === 0 ? 0 : starts[index - 1] + layerRowHeights[index - 1]], []);
  const laneRowsStyle = { gridTemplateRows: layerRowHeights.map((height) => `${height}px`).join(" ") || "58px" };
  const laneContentHeight = Math.max(layerRowHeights.reduce((total, height) => total + height, 0), 58);
  const contentWidth = Math.max(timelineDuration * defaultTimelinePixelsPerSecond * timelineZoom, 160);
  const layerRailWidth = 260;
  const composeTimelinePartId = part?.id ?? "compose-animation";
  const composeMotionTimeline = useMemo<TimelinePartMotionView[]>(() => part ? [buildComposeAnimationMotionTimelinePart(part, layers, timelineDuration)] : [], [layers, part, timelineDuration]);
  const selectedComposeMotionKeys = useMemo(() => new Set(layers.filter((layer) => layer.object && selectedObjectIds.includes(layer.object.id)).map((layer) => `${composeTimelinePartId}:${layer.id}`)), [composeTimelinePartId, layers, selectedObjectIds]);

  const scrubSnapBoundaries = useMemo(() => getComposeAnimationSnapBoundaries(layers, timelineDuration), [layers, timelineDuration]);

  const { getTimelineEdgeScrollDelta, startScrub, continueScrub, endScrub } = useTimelineScrubber({
    duration: timelineDuration,
    displayDuration: timelineDuration,
    playbackPlayheadRef,
    scrubbingRef,
    timelineRef,
    viewportRef: timelineViewportRef,
    snapEnabled: scrubSnapEnabled,
    snapBoundaries: scrubSnapBoundaries,
    onRulerScroll: syncTimelineRulerScroll,
    onScrub,
    onScrubStart,
    onScrubEnd,
  });

  const { updateTimelineDragAutoScroll: updateTimingDragAutoScroll, stopTimelineDragAutoScroll: stopTimingDragAutoScroll } = useTimelineDragAutoScroll({
    viewportRef: timelineViewportRef,
    getTimelineEdgeScrollDelta,
    onRulerScroll: syncTimelineRulerScroll,
    onScrollPersist: saveTimelineDisplacement,
  });
  const { startTimelinePointerTransaction: startTimingPointerTransaction } = useTimelinePointerTransaction();

  useEffect(() => () => {
    stopTimingDragAutoScroll();
    clearTimelineSnapGuide();
    setTimelineDragActive(false);
  }, []);

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
    if (nextName && layer && nextName !== layer.name) onRenameLayer?.(editingLayerId, nextName);
    setEditingLayerId(null);
    setLayerNameDraft("");
  }

  function cancelLayerNameEdit() {
    setEditingLayerId(null);
    setLayerNameDraft("");
  }

  const { startTimelineRowResize: startLayerRowResize } = useTimelineRowResize({
    rowHeights: timelineLayers.rowHeights ?? {},
    setPreviewRowHeights: setResizePreviewRowHeights,
    onCommitRowHeights: (nextHeights) => onTimelineLayersChange((state) => ({ ...state, rowHeights: nextHeights }), { history: true }),
    onDragActiveChange: setTimelineDragActive,
  });

  function startTimingDrag(event: PointerEvent<HTMLDivElement>, layer: ComposeAnimationTimelineLayer, action: ComposeAnimationTimingDrag["action"]) {
    if (event.button !== 0 || !layer.motion) return;
    const motion = layer.motion;
    event.preventDefault();
    event.stopPropagation();
    selectLayer(layer);
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(timelineDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    const movingEdges = new Set([roundTwo(motion.delay ?? 0), roundTwo((motion.delay ?? 0) + motion.duration)]);
    const snapBoundaries = Array.from(new Set([
      ...scrubSnapBoundaries.filter((boundary) => !movingEdges.has(roundTwo(boundary))),
      currentTime,
    ])).sort((left, right) => left - right);
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
        timingDragRef.current = { action, initialClientX: event.clientX, initialScrollLeft: timelineViewportRef.current?.scrollLeft ?? 0, initialDelay: motion.delay ?? 0, initialDuration: motion.duration, layer, partId: composeTimelinePartId, pointerId, snapBoundaries, snapThresholdSeconds };
        setTimelineDragActive(true);
      },
      onPreview: ({ pointerId, clientX, snap }) => updateTimingDragFromPointer(pointerId, clientX, snap),
      onCommit: ({ pointerId, clientX, snap }) => finishTimingDragFromPointer(pointerId, clientX, snap),
      onCancel: clearTimingDragState,
      onDragEnd: () => {
        stopTimingDragAutoScroll();
        clearTimelineSnapGuide();
        setTimelineDragActive(false);
      },
    });
  }

  function updateTimingDragFromPointer(pointerId: number, clientX: number, snap: boolean) {
    const drag = timingDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    const deltaSeconds = getComposeAnimationTimingDelta(drag, clientX, timelineViewportRef.current?.scrollLeft ?? 0, contentWidth, timelineDuration);
    const next = getNextComposeAnimationTiming(drag, deltaSeconds, timelineDuration, snap);
    updateTimelineSnapGuide(next.guideTime);
    setTimelineBlockPreviews({ [timelineBlockPreviewKey("motion", drag.partId, drag.layer.id)]: { start: next.delay, duration: next.duration } });
  }

  function finishTimingDragFromPointer(pointerId: number, clientX: number, snap: boolean) {
    const drag = timingDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    const deltaSeconds = getComposeAnimationTimingDelta(drag, clientX, timelineViewportRef.current?.scrollLeft ?? 0, contentWidth, timelineDuration);
    const next = getNextComposeAnimationTiming(drag, deltaSeconds, timelineDuration, snap);
    timingDragRef.current = null;
    setTimelineDragActive(false);
    setTimelineBlockPreviews(null);
    updateComposeAnimationLayerMotionTiming(drag.layer, next, onUpdateBackgroundMotion, onUpdateObjectMotion);
  }

  function updateComposeTranslationFromPointer(event: PointerEvent<HTMLDivElement>, _timelinePart: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") {
    const layer = layers.find((item) => item.id === marker.id);
    if (layer) startTimingDrag(event, layer, action);
  }

  if (!part) {
    return <TimelineShell activeMode="compose" contentWidth={contentWidth} currentTime={currentTime} displayDuration={timelineDuration} emptyContent={<div className="grid h-full place-items-center text-center text-sm font-bold text-[#737884]">Move the playhead over a composition to edit its animations.</div>} laneContentHeight={laneContentHeight} laneRowsStyle={laneRowsStyle} layerRailWidth={layerRailWidth} playheadColor="var(--clipper-accent)" refs={{ playbackPlayheadRef, timelineRef, timelineViewportRef, timelineRulerViewportRef, timelineLayerRailRef, timelineSnapGuideRef }} timelineName="Compose" timelineViewportDisplacement={timelineViewportState.displacement} timelineZoom={timelineZoom} ticks={ticks} onLayerRailWheel={scrollTimelineFromLayerRail} onModeChange={(nextMode) => { if (nextMode === "composition") onExitCompose(); }} onTimelineViewportScroll={saveTimelineDisplacement} onTimelineZoomChange={updateTimelineZoom} rulerHandlers={{ onPointerDown: startScrub, onPointerMove: continueScrub, onPointerUp: endScrub, onPointerCancel: endScrub }} renderLayerRail={() => null} renderTimelineViewport={() => null} />;
  }

  return <TimelineShell activeMode="compose" contentWidth={contentWidth} currentTime={currentTime} displayDuration={timelineDuration} dragActive={timelineDragActive} laneContentHeight={laneContentHeight} laneRowsStyle={laneRowsStyle} layerRailWidth={layerRailWidth} playheadColor="var(--clipper-accent)" refs={{ playbackPlayheadRef, timelineRef, timelineViewportRef, timelineRulerViewportRef, timelineLayerRailRef, timelineSnapGuideRef }} timelineName={part.name} timelineViewportDisplacement={timelineViewportState.displacement} timelineZoom={timelineZoom} ticks={ticks} onLayerRailWheel={scrollTimelineFromLayerRail} onModeChange={(nextMode) => { if (nextMode === "composition") onExitCompose(); }} onTimelineViewportScroll={saveTimelineDisplacement} onTimelineZoomChange={updateTimelineZoom} rulerHandlers={{ onPointerDown: startScrub, onPointerMove: continueScrub, onPointerUp: endScrub, onPointerCancel: endScrub }} renderLayerRail={() => <>
    <span className="pointer-events-none absolute inset-y-0 right-0 z-30 w-px bg-[#39404d]" />
    {layers.map((layer, index) => <span className="pointer-events-none absolute right-0 z-40 w-0.5 bg-[#6f7684]" key={`compose-layer-accent-${layer.id}`} style={{ top: layerRowStarts[index], height: layerRowHeights[index] }} />)}
    {layers.length > 0 ? <LayerResizeSeparator key={`compose-label-separator-${layers[0].id}-top`} top={0} onPointerDown={(event) => startLayerRowResize(event, layers[0].id, "top")} /> : null}
    {layers.slice(1).map((layer, index) => <LayerResizeSeparator key={`compose-label-separator-${layer.id}`} top={layerRowStarts[index + 1]} onPointerDown={(event) => startLayerRowResize(event, layer.id, "top")} />)}
    {layers.map((layer, index) => <LayerLabel key={layer.id} editing={editingLayerId === layer.id} hidden={false} locked={false} compactControls={layerRowHeights[index] < 44} hideLockControl name={layer.name} draft={layerNameDraft} canMoveDown={false} canMoveUp={false} onDraftChange={setLayerNameDraft} onEdit={() => startLayerNameEdit(layer.id, layer.name)} onCommit={commitLayerNameEdit} onCancel={cancelLayerNameEdit} onToggleHidden={() => undefined} onToggleLocked={() => undefined} />)}
  </>} renderTimelineViewport={() => <>
    {layers.map((layer) => <MotionLane key={layer.id} layerId={layer.id} hidden={false} locked={false} timeline={composeMotionTimeline} sceneDuration={timelineDuration} overflowVisible={false} timelineBlockPreviews={timelineBlockPreviews} motionGradient={{ from: "#6f7684", to: "#424854", text: "#f0f2f6" }} zoomSelectionDrag={null} zoomSelectionBoxRef={{ current: null }} translationSelectionDrag={null} translationSelectionBoxRef={{ current: null }} selectedMotionKeys={selectedComposeMotionKeys} selectedMotionMarkerId={null} selectedMotionMarkerPartId={null} onEffectDragOver={() => undefined} onEffectDrop={() => undefined} onStartSelection={(event) => { const target = event.target as HTMLElement; if (!target.closest("[data-timeline-control]")) selectLayer(layer); }} onMoveSelection={() => undefined} onEndSelection={() => undefined} onOpenBlankContextMenu={(event) => event.preventDefault()} onSelectMotionMarker={(_partId, markerId) => { const selectedLayer = layers.find((item) => item.id === markerId); if (selectedLayer) selectLayer(selectedLayer); }} onOpenNodeContextMenu={(event) => event.preventDefault()} onUpdateZoomFromPointer={(event) => event.preventDefault()} onUpdateTranslationFromPointer={updateComposeTranslationFromPointer} />)}
  </>} />;
}
