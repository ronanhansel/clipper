import { useEffect, useRef, useState } from "react";
import { clamp } from "../../core/math";
import type { TimelineViewportState } from "../../core/types";

export type TimelineViewportControllerOptions = {
  contentWidth: number;
  currentTime: number;
  displayDuration: number;
  timelineViewportState: TimelineViewportState;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
};

export function useTimelineViewportController({ contentWidth, currentTime, displayDuration, timelineViewportState, onTimelineViewportStateChange }: TimelineViewportControllerOptions) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
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
    restoredTimelineDisplacementRef.current = timelineViewportState.displacement;
  }, [contentWidth, timelineViewportState.displacement]);

  function updateTimelineZoom(nextZoom: number) {
    const zoom = clamp(nextZoom, 0.01, 4);
    setTimelineZoom(zoom);
    onTimelineViewportStateChange((state) => ({ ...state, zoom }));
  }

  function syncTimelineScrollPosition() {}

  function saveTimelineDisplacement() {
    const viewport = timelineViewportRef.current;
    const displacement = Math.max(Math.round(viewport?.scrollLeft ?? 0), 0);
    if (timelineLayerRailRef.current) timelineLayerRailRef.current.style.transform = `translate3d(0, ${-(viewport?.scrollTop ?? 0)}px, 0)`;
    restoredTimelineDisplacementRef.current = displacement;
    onTimelineViewportStateChange((state) => ({ ...state, displacement }));
  }

  function scrollTimelineFromLayerRail(event: WheelEvent) {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    if (event.deltaY === 0 && event.deltaX === 0) return;
    event.preventDefault();
    viewport.scrollTop += event.deltaY;
    viewport.scrollLeft += event.deltaX;
    saveTimelineDisplacement();
  }

  useEffect(() => {
    const railContainer = timelineLayerRailRef.current?.parentElement;
    if (!railContainer) return;

    railContainer.addEventListener("wheel", scrollTimelineFromLayerRail, { passive: false });
    return () => railContainer.removeEventListener("wheel", scrollTimelineFromLayerRail);
  });

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
    timelineLayerRailRef,
    timelineSnapGuideRef,
    timelineZoom,
    updateTimelineZoom,
    syncTimelineScrollPosition,
    saveTimelineDisplacement,
    updateTimelineSnapGuide,
    clearTimelineSnapGuide,
  };
}
