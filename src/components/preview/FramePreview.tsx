import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { mutedCaps, selectorBlue, selectorHandleSizePx, selectorOffsetPx } from "../../app/config";
import { getRenderableTextSegments, getSelectionFormatState, normalizeEditableFormatting, renderRichTextSegments, richTextSegmentsFromElement, shouldPersistRichText, textSegmentsToEditableNodes } from "../../app/richText";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { boundsToViewport, getActiveTranslation, getActiveZoom, getCameraPreviewTransform, type CameraPreviewTransform } from "../../core/camera";
import { generateChartObjects, type ChartGeneratedObject } from "../../core/chart";
import { getBoundsUnion, insetBounds, isVisibleMarqueeBounds, updateDragSelectionBoxElement, type ResizeHandle } from "../../core/frameInteraction";
import { clamp } from "../../core/math";
import { evaluateBackgroundLayer, evaluateFrameObject, isTimeSensitiveFrameObject, type EvaluatedFrameObject } from "../../core/renderRuntime";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type MotionEase, type Part, type Point, type RichTextSegment, type SelectionPayload, type TimelineMode, type TranslationMarker, type ZoomMarker } from "../../core/types";
import type { PlaybackClock } from "../../app/types";

export const FramePreview = memo(function FramePreview({ cameraRef, dragBox, dragSelectionBoxRef, framePickPoint, focusPicking, canSelectObjects, cameraTransform, frameViewportRef, frameScale, isPlaying, part, partStart, adjustmentLayers, playbackClock, previewTime, timelineMode, zoomMarkers, pickingTranslationPosition, pickingZoomFocus, selectedObjects, marqueeDragging, editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown, onObjectResizePointerDown, onTextEditCommit, onTextObjectDoubleClick }: { cameraRef: RefObject<HTMLDivElement | null>; dragBox: Bounds | null; dragSelectionBoxRef: RefObject<HTMLDivElement | null>; framePickPoint: Point | null; focusPicking: boolean; canSelectObjects: boolean; cameraTransform: CameraPreviewTransform; frameViewportRef: RefObject<HTMLDivElement | null>; frameScale: number; isPlaying: boolean; part: Part; partStart: number; adjustmentLayers?: AdjustmentLayer[]; playbackClock: PlaybackClock; previewTime: number; timelineMode: TimelineMode; zoomMarkers: ZoomMarker[]; pickingTranslationPosition: boolean; pickingZoomFocus: boolean; selectedObjects: SelectionPayload["objects"]; marqueeDragging: boolean; editingTextObjectId: string | null; onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onObjectResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void }) {
  const frameStyle = useMemo(() => ({ ...part.frame.style, width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${frameScale})` }) as CSSProperties, [frameScale, part.frame.style]);
  const viewportStyle = useMemo(() => ({ width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale }) as CSSProperties, [frameScale]);
  const animationsEnabled = timelineMode !== "edit";
  const timeSensitive = isPlaybackTimeSensitivePart(part, timelineMode, adjustmentLayers, animationsEnabled);
  const [livePreviewTime, setLivePreviewTime] = useState(previewTime);
  const displayPreviewTime = isPlaying && playbackClock && timeSensitive ? livePreviewTime : previewTime;
  const liveCameraTransform = useMemo(() => {
    if (timelineMode !== "composition") return cameraTransform;
    const activeZoom = pickingZoomFocus ? null : getActiveZoom(zoomMarkers, displayPreviewTime);
    const activeTranslation = pickingTranslationPosition ? null : getActiveTranslation(part.translationMarkers, displayPreviewTime, part);
    return getCameraPreviewTransform(activeZoom, activeTranslation);
  }, [cameraTransform, displayPreviewTime, part, part.translationMarkers, pickingTranslationPosition, pickingZoomFocus, timelineMode, zoomMarkers]);
  const selectedBounds = useMemo(() => selectedObjects.length > 0 ? getBoundsUnion(selectedObjects.map((object) => object.bounds)) : null, [selectedObjects]);
  const selectedViewportBounds = useMemo(() => selectedBounds ? insetBounds(boundsToViewport(selectedBounds, liveCameraTransform, frameScale), -selectorOffsetPx) : null, [frameScale, liveCameraTransform, selectedBounds]);
  const [selectorHover, setSelectorHover] = useState(false);
  const selectorHoverRef = useRef(false);
  const showDragBox = dragBox && isVisibleMarqueeBounds(dragBox, frameScale);
  const isUnlinkedPart = Boolean(part.sourceMissing);

  useLayoutEffect(() => {
    if (isPlaying && playbackClock && timeSensitive) return;
    setLivePreviewTime(previewTime);
  }, [isPlaying, playbackClock, previewTime, timeSensitive]);

  useEffect(() => {
    if (!isPlaying || !playbackClock || !timeSensitive) return;
    const clock = playbackClock;
    let frame = 0;

    function tick(now: number) {
      const nextSceneTime = clock.startedFrom + (now - clock.startedAt) / 1000;
      setLivePreviewTime(clamp(applyAdjustmentLayersToSceneTime(nextSceneTime, adjustmentLayers) - partStart, 0, part.duration));
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [adjustmentLayers, isPlaying, part.duration, partStart, playbackClock, timeSensitive]);

  useEffect(() => {
    if (!cameraRef.current) return;
    cameraRef.current.style.transform = `translate(${liveCameraTransform.x}px, ${liveCameraTransform.y}px) scale(${liveCameraTransform.scale})`;
  }, [cameraRef, liveCameraTransform]);

  function updateSelectorHover(event: PointerEvent<HTMLDivElement>) {
    if (!selectedViewportBounds || marqueeDragging) {
      if (selectorHoverRef.current) {
        selectorHoverRef.current = false;
        setSelectorHover(false);
      }
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hovering = x >= selectedViewportBounds.x && x <= selectedViewportBounds.x + selectedViewportBounds.width && y >= selectedViewportBounds.y && y <= selectedViewportBounds.y + selectedViewportBounds.height;
    if (hovering === selectorHoverRef.current) return;
    selectorHoverRef.current = hovering;
    setSelectorHover(hovering);
  }

  function handleFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    updateSelectorHover(event);
    onFramePointerMove(event);
  }

  function clearSelectorHover() {
    if (!selectorHoverRef.current) return;
    selectorHoverRef.current = false;
    setSelectorHover(false);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between text-[#dfe2ea]"><span className={mutedCaps}>{part.name}</span><strong className="text-[13px]">{FRAME_WIDTH} x {FRAME_HEIGHT}</strong></div>
      <div ref={frameViewportRef} className={`relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${focusPicking ? "cursor-crosshair ring-2 ring-[#37d6c2]" : ""}`} style={viewportStyle} onPointerDownCapture={onFramePointerDownCapture} onPointerDown={onFramePointerDown} onPointerMove={handleFramePointerMove} onPointerUp={onFramePointerUp} onPointerCancel={onFramePointerCancel} onPointerLeave={clearSelectorHover}>
        <div className="absolute left-0 top-0 origin-top-left overflow-hidden" style={frameStyle}>
          {isUnlinkedPart ? <div className="absolute inset-0 bg-black" ref={cameraRef} /> : <div className="absolute inset-0 origin-center" ref={cameraRef}>
            <BackgroundLayerView animationsEnabled={animationsEnabled} background={part.background} duration={part.duration} previewTime={displayPreviewTime} />
            {part.objects.map((object) => (
              <FrameObjectView key={object.id} animationsEnabled={animationsEnabled} object={object} canSelect={canSelectObjects} duration={part.duration} editing={editingTextObjectId === object.id} focusPicking={focusPicking} previewTime={displayPreviewTime} onDoubleClick={(event) => onTextObjectDoubleClick(event, object)} onPointerDown={(event) => onObjectPointerDown(event, object)} onTextEditCommit={(content, richText) => onTextEditCommit(object.id, content, richText)} />
            ))}
          </div>}
        </div>
        {canSelectObjects && !isUnlinkedPart ? selectedObjects.map((object) => <SelectionOverlayBox key={object.id} objectId={object.id} bounds={object.bounds} cameraTransform={liveCameraTransform} frameScale={frameScale} highlighted={selectorHover} interactive={!marqueeDragging} onResizePointerDown={(event, handle) => onObjectResizePointerDown(event, handle, object.id)} />) : null}
        {dragBox ? <DragSelectionBox ref={dragSelectionBoxRef} bounds={dragBox} frameScale={frameScale} visible={Boolean(showDragBox)} /> : null}
        {focusPicking && framePickPoint ? <FramePickPointOverlay point={framePickPoint} frameScale={frameScale} /> : null}
      </div>
    </div>
  );
});

export function FramePickPointOverlay({ point, frameScale }: { point: Point; frameScale: number }) {
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: point.x * frameScale, top: point.y * frameScale }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#37d6c2] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

export const FrameObjectView = memo(function FrameObjectView({ animationsEnabled, object, canSelect, duration, editing, focusPicking, previewTime, onDoubleClick, onPointerDown, onTextEditCommit }: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number; onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onTextEditCommit: (content: string, richText?: RichTextSegment[]) => void }) {
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animation = { style: evaluatedObject.renderStyle, content: evaluatedObject.renderContent };
  const editableRef = useRef<HTMLDivElement | null>(null);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const style = {
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...animation.style,
    transform: `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = evaluatedObject.renderRichText;
  const textSegments = useMemo(() => getRenderableTextSegments(content ?? "", richText), [content, richText]);

  useEffect(() => {
    if (!editing || !editableRef.current) return;
    const editable = editableRef.current;
    editable.replaceChildren(...textSegmentsToEditableNodes(getRenderableTextSegments(object.content ?? "", object.richText), Boolean(object.richText)));
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;

    function commitBeforeAppPointerHandling(event: globalThis.PointerEvent) {
      const editable = editableRef.current;
      if (!editable || editable.contains(event.target as Node)) return;
      commitTextEdit();
    }

    window.addEventListener("pointerdown", commitBeforeAppPointerHandling, true);
    return () => window.removeEventListener("pointerdown", commitBeforeAppPointerHandling, true);
  }, [editing, object.style]);

  function commitTextEdit() {
    if (!editableRef.current) return;
    normalizeEditableFormatting(editableRef.current);
    const richText = richTextSegmentsFromElement(editableRef.current, object.style);
    onTextEditCommit(richText.map((segment) => segment.text).join(""), shouldPersistRichText(richText, object.style) ? richText : undefined);
  }

  function onTextEditKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        toggleEditableSelectionFormat(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
      if (event.key === "Enter") editableRef.current?.blur();
    }
    if (event.key === "Escape") editableRef.current?.blur();
  }

  function toggleEditableSelectionFormat(format: "bold" | "italic" | "underline") {
    if (!editableRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editableRef.current.contains(range.commonAncestorContainer)) return;

    const current = getSelectionFormatState(selection, format);
    const span = document.createElement("span");
    if (format === "bold") span.style.fontWeight = current ? "400" : "700";
    if (format === "italic") span.style.fontStyle = current ? "normal" : "italic";
    if (format === "underline") span.style.textDecorationLine = current ? "none" : "underline";
    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
  }

  return (
    <div className={`absolute flex touch-none select-none flex-col justify-center whitespace-pre-line ${object.type === "chart" ? "overflow-visible" : "overflow-hidden"} ${focusPicking ? "cursor-crosshair" : editing ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""}`} data-object-id={canSelect ? object.id : undefined} style={style} onDoubleClick={onDoubleClick} onPointerDown={onPointerDown}>
      {object.type === "text" && editing ? <div ref={editableRef} className="min-h-0 w-full whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={commitTextEdit} onKeyDown={onTextEditKeyDown} onPointerDown={(event) => event.stopPropagation()} /> : null}
      {object.type === "text" && !editing ? <div className="min-h-0 w-full whitespace-pre-wrap">{renderRichTextSegments(textSegments, Boolean(richText))}</div> : null}
      {object.type === "chart" && object.chart ? <ChartObjectView animationsEnabled={animationsEnabled} object={object} duration={duration} previewTime={previewTime} /> : null}
      {object.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && object.type !== "chart" && content ? content : null}
    </div>
  );
}, areFrameObjectPropsEqual);

function ChartObjectView({ animationsEnabled, object, duration, previewTime }: { animationsEnabled: boolean; object: FrameObject; duration: number; previewTime: number }) {
  const chartObjects = useMemo(() => object.chart ? generateChartObjects({ ...object.chart, bounds: object.bounds }) : [], [object.bounds, object.chart]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {chartObjects.map((chartObject) => <GeneratedChartObjectView key={chartObject.id} animationsEnabled={animationsEnabled} chartObject={chartObject} chartBounds={object.bounds} duration={duration} previewTime={previewTime} />)}
    </div>
  );
}

function GeneratedChartObjectView({ animationsEnabled, chartObject, chartBounds, duration, previewTime }: { animationsEnabled: boolean; chartObject: ChartGeneratedObject; chartBounds: Bounds; duration: number; previewTime: number }) {
  const object = useMemo<FrameObject>(() => chartGeneratedObjectToFrameObject(chartObject), [chartObject]);
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animationTransform = typeof evaluatedObject.renderStyle.transform === "string" ? evaluatedObject.renderStyle.transform : undefined;
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const style = {
    left: object.bounds.x - chartBounds.x,
    top: object.bounds.y - chartBounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...evaluatedObject.renderStyle,
    transform: `${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: "transform",
  } as CSSProperties;
  const content = evaluatedObject.renderContent ?? object.content;

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-visible whitespace-pre-line" style={style}>
      {object.type === "text" ? <div className="min-h-0 w-full whitespace-pre-wrap">{content}</div> : null}
      {object.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && content ? content : null}
    </div>
  );
}

function chartGeneratedObjectToFrameObject(object: ChartGeneratedObject): FrameObject {
  return {
    id: object.id,
    name: object.name ?? object.id,
    type: object.kind,
    selector: "",
    bounds: object.bounds,
    content: object.content,
    template: object.template,
    style: object.style,
    motion: object.motion,
    layoutId: object.layoutId,
  };
}

function areFrameObjectPropsEqual(previous: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number }, next: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number }) {
  return previous.object === next.object
    && previous.animationsEnabled === next.animationsEnabled
    && previous.canSelect === next.canSelect
    && previous.duration === next.duration
    && previous.editing === next.editing
    && previous.focusPicking === next.focusPicking
    && (!next.animationsEnabled || !isPreviewTimeSensitiveObject(next.object) || previous.previewTime === next.previewTime);
}

function areBackgroundLayerPropsEqual(previous: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }, next: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }) {
  const timeSensitive = Boolean(next.background.motion) || next.background.elements.some(isPreviewTimeSensitiveObject);
  return previous.animationsEnabled === next.animationsEnabled && previous.background === next.background && previous.duration === next.duration && (!next.animationsEnabled || !timeSensitive || previous.previewTime === next.previewTime);
}

function areBackgroundElementPropsEqual(previous: { duration: number; element: EvaluatedFrameObject; previewTime: number }, next: { duration: number; element: EvaluatedFrameObject; previewTime: number }) {
  return previous.element === next.element && previous.duration === next.duration && (!next.element.timeSensitive || previous.previewTime === next.previewTime);
}

function isPreviewTimeSensitiveObject(object: FrameObject) {
  return isTimeSensitiveFrameObject(object) || object.type === "chart" || isAnimatedGraphObject(object.id);
}

function isPlaybackTimeSensitivePart(part: Part, timelineMode: TimelineMode, adjustmentLayers: AdjustmentLayer[] | undefined, animationsEnabled: boolean) {
  return (animationsEnabled && (Boolean(part.background.motion)
    || part.background.elements.some(isPreviewTimeSensitiveObject)
    || part.objects.some(isPreviewTimeSensitiveObject)))
    || (animationsEnabled && Boolean(adjustmentLayers?.length))
    || (timelineMode === "composition" && (part.zoomMarkers.length > 0 || part.translationMarkers.length > 0));
}

export function SelectionOverlayBox({ objectId, bounds, cameraTransform, frameScale, highlighted, interactive, onResizePointerDown }: { objectId: string; bounds: Bounds; cameraTransform: CameraPreviewTransform; frameScale: number; highlighted: boolean; interactive: boolean; onResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void }) {
  const viewportBounds = insetBounds(boundsToViewport(bounds, cameraTransform, frameScale), -selectorOffsetPx);
  const horizontalEdgeClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute left-0 w-full cursor-ns-resize opacity-95 ${highlighted ? "h-0.5" : "h-px"}`;
  const verticalEdgeClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute top-0 h-full cursor-ew-resize opacity-95 ${highlighted ? "w-0.5" : "w-px"}`;
  const edgeStyle = { backgroundColor: selectorBlue };
  const handleClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute border-2 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.24)]`;
  const handleStyle = { width: selectorHandleSizePx, height: selectorHandleSizePx };
  const handleStyleWithColor = { ...handleStyle, borderColor: selectorBlue };
  const handleInset = selectorHandleSizePx / 2;
  const keepLeftHandleInside = viewportBounds.x < handleInset;
  const keepTopHandleInside = viewportBounds.y < handleInset;
  const keepRightHandleInside = viewportBounds.x + viewportBounds.width > FRAME_WIDTH * frameScale - handleInset;
  const keepBottomHandleInside = viewportBounds.y + viewportBounds.height > FRAME_HEIGHT * frameScale - handleInset;
  const topLeftHandleClass = `${handleClass} left-0 top-0 ${keepLeftHandleInside ? "" : "-translate-x-1/2"} ${keepTopHandleInside ? "" : "-translate-y-1/2"} cursor-nwse-resize`;
  const topRightHandleClass = `${handleClass} right-0 top-0 ${keepRightHandleInside ? "" : "translate-x-1/2"} ${keepTopHandleInside ? "" : "-translate-y-1/2"} cursor-nesw-resize`;
  const bottomRightHandleClass = `${handleClass} bottom-0 right-0 ${keepRightHandleInside ? "" : "translate-x-1/2"} ${keepBottomHandleInside ? "" : "translate-y-1/2"} cursor-nwse-resize`;
  const bottomLeftHandleClass = `${handleClass} bottom-0 left-0 ${keepLeftHandleInside ? "" : "-translate-x-1/2"} ${keepBottomHandleInside ? "" : "translate-y-1/2"} cursor-nesw-resize`;
  return (
    <div data-frame-selection-box={objectId} className="pointer-events-none absolute bg-transparent" style={{ left: viewportBounds.x, top: viewportBounds.y, width: viewportBounds.width, height: viewportBounds.height, transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", zIndex: 70 }}>
      <div className={`${horizontalEdgeClass} top-0`} style={edgeStyle} onPointerDown={(event) => onResizePointerDown(event, "top")} />
      <div className={`${horizontalEdgeClass} bottom-0`} style={edgeStyle} onPointerDown={(event) => onResizePointerDown(event, "bottom")} />
      <div className={`${verticalEdgeClass} left-0`} style={edgeStyle} onPointerDown={(event) => onResizePointerDown(event, "left")} />
      <div className={`${verticalEdgeClass} right-0`} style={edgeStyle} onPointerDown={(event) => onResizePointerDown(event, "right")} />
      <div className={topLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-left")} />
      <div className={topRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-right")} />
      <div className={bottomRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-right")} />
      <div className={bottomLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-left")} />
    </div>
  );
}

export function DragSelectionBox({ ref, bounds, frameScale, visible }: { ref: RefObject<HTMLDivElement | null>; bounds: Bounds; frameScale: number; visible: boolean }) {
  useLayoutEffect(() => {
    if (ref.current) updateDragSelectionBoxElement(ref.current, bounds, frameScale, visible);
  }, [bounds, frameScale, ref, visible]);

  return <div ref={ref} className="pointer-events-none absolute left-0 top-0 border bg-[#159dff]/10 opacity-100 shadow-[0_0_0_1px_rgba(21,157,255,0.18)] will-change-transform" style={{ borderColor: selectorBlue, zIndex: 69 }} />;
}

export const BackgroundLayerView = memo(function BackgroundLayerView({ animationsEnabled, background, duration, previewTime }: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }) {
  const evaluatedBackground = useMemo(() => evaluateBackgroundLayer(background, previewTime, duration, { animations: animationsEnabled }), [animationsEnabled, background, duration, previewTime]);
  const layerStyle = evaluatedBackground.renderStyle as CSSProperties;
  const fillStyle = evaluatedBackground.fillStyle as CSSProperties;

  return (
    <div className={`pointer-events-none absolute inset-0 ${background.stretchToElements ? "overflow-visible" : "overflow-hidden"}`} data-layer-id={background.id} style={layerStyle}>
      <div className="absolute" style={fillStyle} />
      {evaluatedBackground.elements.map((element) => <BackgroundElementView duration={duration} element={element} key={element.id} previewTime={previewTime} />)}
    </div>
  );
}, areBackgroundLayerPropsEqual);

export const BackgroundElementView = memo(function BackgroundElementView({ element }: { duration: number; element: EvaluatedFrameObject; previewTime: number }) {
  const animation = { style: element.renderStyle, content: element.renderContent };
  const style = {
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    ...element.style,
    ...animation.style,
  } as CSSProperties;
  const content = animation.content ?? element.content;
  const textLines = useMemo(() => content?.split("\n") ?? [], [content]);

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line" data-background-element-id={element.id} style={style}>
      {element.type === "text" ? textLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {element.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(element.type === "html" || element.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {element.type !== "text" && element.type !== "svg" && element.type !== "html" && element.type !== "template" && content ? content : null}
    </div>
  );
}, areBackgroundElementPropsEqual);

function evaluateObjectForPreview(object: FrameObject, time: number, duration: number, animationsEnabled: boolean): EvaluatedFrameObject {
  const evaluatedObject = evaluateFrameObject(object, time, duration, { animations: animationsEnabled });
  const legacyAnimation = animationsEnabled && !object.motion ? getObjectPreviewAnimation(object, time) : { style: {} as CSSProperties };

  return {
    ...evaluatedObject,
    renderContent: legacyAnimation.content ?? evaluatedObject.renderContent,
    renderRichText: legacyAnimation.content ? undefined : evaluatedObject.renderRichText,
    renderStyle: {
      ...evaluatedObject.renderStyle,
      ...legacyAnimation.style,
    },
    timeSensitive: animationsEnabled && (evaluatedObject.timeSensitive || isAnimatedGraphObject(object.id) || Boolean(legacyAnimation.content)),
  };
}

function getObjectPreviewAnimation(object: FrameObject, time: number): { style: CSSProperties; content?: string } {
  const graphAnimation = getAnimatedGraphPreviewAnimation(object.id, time);
  if (graphAnimation) return graphAnimation;

  if (object.motion) {
    return { style: getMotionPreviewAnimation(object.motion, time) };
  }

  if (object.id === "hero-title") {
    const progress = easeOutCubic(clamp(time / 0.9, 0, 1));
    return {
      style: {
        opacity: progress,
        transform: `translateY(${Math.round((1 - progress) * 46)}px)`,
      },
    };
  }

  if (object.id === "hero-panel") {
    const progress = easeOutCubic(clamp((time - 0.45) / 1.25, 0, 1));
    const drift = Math.sin(Math.max(time - 1.7, 0) * 1.8) * 10;
    return {
      style: {
        opacity: clamp((time - 0.25) / 0.45, 0, 1),
        transform: `translateY(${Math.round((1 - progress) * -72 + drift)}px) rotate(${(-3 + progress * 3).toFixed(2)}deg)`,
      },
    };
  }

  if (object.id === "object-rule" && object.content) {
    const progress = clamp((time - 1.15) / 2.1, 0, 1);
    const visibleCharacters = Math.floor(object.content.length * progress);
    const cursor = progress < 1 && Math.floor(time * 4) % 2 === 0 ? "|" : "";
    return {
      content: `${object.content.slice(0, visibleCharacters)}${cursor}`,
      style: { opacity: time < 1.05 ? 0 : 1 },
    };
  }

  if (object.id === "inspector-card") {
    const progress = easeOutCubic(clamp((time - 0.6) / 0.6, 0, 1));
    return {
      style: {
        opacity: progress,
        transform: `translateX(${Math.round((1 - progress) * 60)}px)`,
      },
    };
  }

  if (object.id === "selector-box-demo") {
    const progress = clamp((time - 1) / 1, 0, 1);
    return {
      style: {
        opacity: progress,
        transform: `scale(${(0.98 + progress * 0.02).toFixed(3)})`,
      },
    };
  }

  return { style: {} };
}

const animatedGraphLineSegments: Record<string, { delay: number; duration: number; rotate: number }> = {
  "graph-line-1": { delay: 1.66, duration: 0.88, rotate: -25.3 },
  "graph-line-2": { delay: 2.54, duration: 0.88, rotate: -27.9 },
  "graph-line-3": { delay: 3.42, duration: 0.88, rotate: -20.7 },
};

function isAnimatedGraphObject(id: string) {
  return id in animatedGraphLineSegments || id === "graph-line" || id === "graph-value-primary" || id === "graph-value-secondary";
}

function getAnimatedGraphPreviewAnimation(id: string, time: number): { style: CSSProperties; content?: string } | null {
  const lineSegment = animatedGraphLineSegments[id];
  if (lineSegment) {
    const progress = easeOutCubic(clamp((time - lineSegment.delay) / lineSegment.duration, 0, 1));
    return {
      style: {
        opacity: progress > 0 ? 1 : 0,
        transform: `rotate(${lineSegment.rotate}deg) scaleX(${progress.toFixed(3)})`,
      },
    };
  }

  if (id === "graph-line") {
    const progress = easeOutCubic(clamp((time - 1.66) / 2.64, 0, 1));
    return {
      style: {
        opacity: progress > 0 ? 1 : 0,
        transform: `scaleX(${progress.toFixed(3)})`,
        transformOrigin: "left center",
      },
    };
  }

  const valueProgress = easeOutCubic(clamp((time - 1.66) / 2.64, 0, 1));
  if (id === "graph-value-primary") {
    return {
      content: `$${Math.round(interpolate([18, 96] as const, valueProgress))}k`,
      style: { opacity: clamp((time - 1.45) / 0.35, 0, 1) },
    };
  }

  if (id === "graph-value-secondary") {
    return {
      content: `+${Math.round(interpolate([12, 148] as const, valueProgress))}%`,
      style: { opacity: clamp((time - 1.72) / 0.35, 0, 1) },
    };
  }

  return null;
}

function getMotionPreviewAnimation(motion: FrameObject["motion"] | BackgroundLayer["motion"] | undefined, time: number): CSSProperties {
  if (!motion) return {};
  const delay = motion.delay ?? 0;
  const elapsed = Math.max(time - delay, 0);
  const cycleTime = motion.loop && motion.duration > 0 ? elapsed % motion.duration : elapsed;
  const progress = easeProgress(clamp(cycleTime / motion.duration, 0, 1), motion.ease);
  const transforms: string[] = [];

  if (motion.x) transforms.push(`translateX(${Math.round(interpolate(motion.x, progress))}px)`);
  if (motion.y) transforms.push(`translateY(${Math.round(interpolate(motion.y, progress))}px)`);
  if (motion.rotate) transforms.push(`rotate(${interpolate(motion.rotate, progress).toFixed(2)}deg)`);

  return {
    opacity: motion.opacity ? interpolate(motion.opacity, progress) : undefined,
    transform: transforms.length > 0 ? transforms.join(" ") : undefined,
  };
}

function interpolate(range: readonly [number, number], progress: number) {
  return range[0] + (range[1] - range[0]) * progress;
}

function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(value);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return easeInOutCubic(value);
  return value;
}

function cameraEaseProgress(value: number, ease: MotionEase | undefined) {
  return easeProgress(value, ease ?? "easeInOut");
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
