import { useEffect, useRef, useState, type RefObject, type WheelEvent } from "react";
import { clamp } from "../../core/math";
import type { TimelineViewportState } from "../../core/types";

export type TimelineViewportControllerOptions = {
  contentWidth: number;
  currentTime: number;
  displayDuration: number;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  timelineViewportState: TimelineViewportState;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
};

export function useTimelineViewportController({ contentWidth, currentTime, displayDuration, playbackPlayheadRef, timelineViewportState, onTimelineViewportStateChange }: TimelineViewportControllerOptions) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineRulerViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineLayerRailRef = useRef<HTMLDivElement | null>(null);
  const timelineSnapGuideRef = useRef<HTMLDivElement | null>(null);
  const restoredTimelineDisplacementRef = useRef<number | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(timelineViewportState.zoom);

  useEffect(() => {
    setTimelineZoom(timelineViewportState.zoom);
  }, [timelineViewportState.zoom]);

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

  function updateTimelineSnapGuide(time: number | null) {
    const element = timelineSnapGuideRef.current;
    if (!element || time === null || displayDuration <= 0 || Math.abs(time - currentTime) < 0.0001) {
      clearTimelineSnapGuide();
      return;
    }

    element.style.display = "block";
    element.style.transform = `translate3d(${(time / displayDuration) * contentWidth}px, 0, 0)`;
  }

  function clearTimelineSnapGuide() {
    if (timelineSnapGuideRef.current) timelineSnapGuideRef.current.style.display = "none";
  }

  return {
    timelineRef,
    timelineViewportRef,
    timelineRulerViewportRef,
    timelineLayerRailRef,
    timelineSnapGuideRef,
    timelineZoom,
    updateTimelineZoom,
    syncTimelineRulerScroll,
    saveTimelineDisplacement,
    scrollTimelineFromLayerRail,
    updateTimelineSnapGuide,
    clearTimelineSnapGuide,
  };
}
