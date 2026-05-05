import { Minus, Plus } from "lucide-react";
import { useMemo, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode, type RefObject, type WheelEvent } from "react";
import { roundTenth } from "../../core/math";
import type { TimelineMode } from "../../core/types";
import { formatTime } from "../../core/timeline";
import type { PrerenderCacheCoverage } from "../../app/features/preview/usePrerenderCache";
import { TimelineSlider } from "./TimelineSlider";

export type TimelineShellRefs = {
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  timelineRef: RefObject<HTMLDivElement | null>;
  timelineViewportRef: RefObject<HTMLDivElement | null>;
  timelineLayerRailRef: RefObject<HTMLDivElement | null>;
  timelineSnapGuideRef: RefObject<HTMLDivElement | null>;
  timelinePanelRef?: RefObject<HTMLElement | null>;
};

export type TimelineShellProps = {
  contentWidth: number;
  currentTime: number;
  displayDuration: number;
  dragActive?: boolean;
  dragOverlayLabel?: string;
  emptyContent?: ReactNode;
  laneContentHeight: number;
  laneRowsStyle: CSSProperties;
  layerRailWidth: number;
  playheadColor?: string;
  prerenderCacheCoverage?: PrerenderCacheCoverage | null;
  refs: TimelineShellRefs;
  timelineName: string;
  timelineZoom: number;
  ticks: number[];
  activeMode: TimelineMode;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportScroll: () => void;
  onTimelineViewportDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onTimelineViewportDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onTimelineViewportDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onTimelineZoomChange: (zoom: number) => void;
  onLayerRailWheel: (event: WheelEvent<HTMLDivElement>) => void;
  rulerHandlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  };
  renderLayerRail: () => ReactNode;
  renderTimelineViewport: () => ReactNode;
};

export function TimelineShell({ contentWidth, currentTime, displayDuration, dragActive = false, dragOverlayLabel, emptyContent, laneContentHeight, laneRowsStyle, layerRailWidth, playheadColor = "#ff3b30", prerenderCacheCoverage, refs, timelineName, timelineZoom, ticks, activeMode, onModeChange, onTimelineViewportScroll, onTimelineViewportDragLeave, onTimelineViewportDragOver, onTimelineViewportDrop, onTimelineZoomChange, onLayerRailWheel, rulerHandlers, renderLayerRail, renderTimelineViewport }: TimelineShellProps) {
  return (
    <footer ref={refs.timelinePanelRef} data-timeline-panel className={`relative grid h-full min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-1.5 overflow-hidden border-t border-[#1d2028] bg-[#141821] px-[22px] pb-0 pt-2.5 ${dragActive ? "clipper-timeline-dragging-no-hover" : ""}`} onDragLeave={onTimelineViewportDragLeave} onDragOver={onTimelineViewportDragOver} onDrop={onTimelineViewportDrop}>
      {dragActive && dragOverlayLabel ? <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-[rgba(13,17,24,0.78)]"><div className="rounded-full bg-[var(--clipper-accent-muted-surface)] px-5 py-2 text-[12px] font-extrabold uppercase tracking-[0.18em] text-[var(--clipper-accent)]">{dragOverlayLabel}</div></div> : null}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[12px] text-[#9b9da7]">
        <div className="flex rounded-full border border-[#2d313b] bg-[#111319] p-1" aria-label="Timeline mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${activeMode === "compose" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("compose")}>Compose</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${activeMode === "composition" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("composition")}>Direct</button>
        </div>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <TimelineSlider aria-label="Timeline zoom" min={0.01} max={4} step={0.01} value={timelineZoom} onChange={(event) => onTimelineZoomChange(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline out" onClick={() => onTimelineZoomChange(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline in" onClick={() => onTimelineZoomChange(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div ref={refs.playbackPlayheadRef} className="relative h-full min-h-0 max-h-full overflow-hidden" style={{ "--clipper-playhead-left": `${displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0}%` } as CSSProperties}>
        <div className="grid h-full min-h-0 overflow-hidden" style={{ gridTemplateColumns: `${layerRailWidth}px minmax(0, 1fr)` }}>
          <div className="grid min-h-0 min-w-0 grid-rows-[38px_minmax(0,1fr)] overflow-hidden">
            <div className="flex min-w-0 items-center pr-4">
              <span className="min-w-0 truncate text-[13px] font-extrabold text-[#dfe2ea]" title={timelineName}>{timelineName}</span>
            </div>
            <div className="min-h-0 overflow-hidden" onWheel={onLayerRailWheel}>
              <div ref={refs.timelineLayerRailRef} className="relative grid pr-0 will-change-transform" style={{ ...laneRowsStyle, height: laneContentHeight }}>
              {renderLayerRail()}
              </div>
            </div>
          </div>
          <div ref={refs.timelineViewportRef} className="timeline-scrollbar h-full min-h-0 min-w-0 overflow-x-scroll overflow-y-auto pl-0 pr-3 [scrollbar-gutter:stable]" onScroll={onTimelineViewportScroll}>
            <div className="relative" style={{ width: contentWidth, minHeight: 38 + laneContentHeight }}>
              <div className="pointer-events-none sticky top-0 z-50 h-0" style={{ width: contentWidth }}>
                <div ref={refs.timelineSnapGuideRef} className="pointer-events-none absolute top-0 z-20 hidden w-px bg-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_12px_rgba(255,255,255,0.35)]" style={{ height: 38 + laneContentHeight, transform: "translate3d(0, 0, 0)" }} />
                <div className="absolute top-[12px] h-3 w-2.5 rounded-[2px]" style={{ left: "var(--clipper-playhead-left)", backgroundColor: playheadColor, clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)", transform: "translateX(-50%)" }} />
                <div className="absolute top-[38px] w-px" style={{ left: "var(--clipper-playhead-left)", height: laneContentHeight, backgroundColor: playheadColor }} />
              </div>
              <div className="sticky top-0 z-30 bg-[#141821]">
                {prerenderCacheCoverage ? <PrerenderCoverageStrip coverage={prerenderCacheCoverage} sceneDuration={displayDuration} contentWidth={contentWidth} /> : null}
                <TimeRuler rulerRef={refs.timelineRef} ticks={ticks} sceneDuration={displayDuration} contentWidth={contentWidth} onPointerDown={rulerHandlers.onPointerDown} onPointerMove={rulerHandlers.onPointerMove} onPointerUp={rulerHandlers.onPointerUp} onPointerCancel={rulerHandlers.onPointerCancel} />
              </div>
              {emptyContent ? <div className="sticky left-0 grid h-full min-h-[58px] place-items-center">{emptyContent}</div> : <div data-timeline-content className="relative grid" style={{ ...laneRowsStyle, width: contentWidth, height: laneContentHeight }}>
                {renderTimelineViewport()}
              </div>}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function PrerenderCoverageStrip({ coverage, sceneDuration, contentWidth }: { coverage: PrerenderCacheCoverage; sceneDuration: number; contentWidth: number }) {
  if (sceneDuration <= 0 || coverage.blocks.length === 0) return null;
  const minWidthPercent = (2 / Math.max(contentWidth, 1)) * 100;

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-30 h-0.5" style={{ width: contentWidth }} aria-hidden="true">
      {coverage.blocks.map((block) => <span key={`${block.state}:${block.start}:${block.duration}`} className={`absolute top-0 h-0.5 ${block.state === "cached" ? "bg-[#38bdf8]" : block.state === "queued" ? "bg-[#a16207]" : "bg-[#333846]"}`} style={{ left: `${(block.start / sceneDuration) * 100}%`, width: `${Math.max((block.duration / sceneDuration) * 100, minWidthPercent)}%` }} />)}
    </div>
  );
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
