import { useEffect } from "react";
import { defaultTimelineLayerState } from "../../core/project";
import { timelineDisplayDuration as getTimelineDisplayDuration } from "../../core/timeline";
import { getActiveCompositionPointerDrag, setActiveCompositionPointerDrag } from "../../lib/pointerDrag";
import { ComposeAnimationTimelinePanel } from "./ComposeAnimationTimelinePanel";
import { DirectTimelinePanel } from "./DirectTimelinePanel";
import type { TimelinePanelProps } from "./timelineTypes";

export type { TimelinePanelProps } from "./timelineTypes";

export function TimelinePanel(props: TimelinePanelProps) {
  useEffect(() => {
    if (props.mode !== "compose") return;

    function getCompositionId(event: DragEvent) {
      return event.dataTransfer?.getData("application/x-clipper-composition") || getActiveCompositionPointerDrag()?.compositionId || "";
    }

    function getTimelineDropTime(event: DragEvent) {
      const content = document.querySelector<HTMLElement>("[data-timeline-content]");
      const rect = content?.getBoundingClientRect();
      if (!rect) return props.currentSceneTime;
      const displayDuration = getTimelineDisplayDuration(props.sceneDuration, props.timelineEndPaddingFraction);
      const ratio = Math.min(Math.max((event.clientX - rect.left) / Math.max(rect.width, 1), 0), 1);
      return ratio * displayDuration;
    }

    function getTargetLayerId() {
      return (props.timelineLayers.compositionLayers?.length ? props.timelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers!)?.[0]?.id ?? "comp";
    }

    function isOverTimeline(event: DragEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      return target instanceof HTMLElement && Boolean(target.closest("[data-timeline-panel]"));
    }

    function handleDragOver(event: DragEvent) {
      const hasCompositionDrag = Boolean(event.dataTransfer?.types.includes("application/x-clipper-composition") || getActiveCompositionPointerDrag());
      if (!isOverTimeline(event) || !hasCompositionDrag) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDrop(event: DragEvent) {
      if (!isOverTimeline(event)) return;
      const compositionId = getCompositionId(event);
      if (!compositionId) return;
      event.preventDefault();
      event.stopPropagation();
      props.onAddComposition(compositionId, getTargetLayerId(), getTimelineDropTime(event));
      setActiveCompositionPointerDrag(null);
      props.onModeChange("composition");
    }

    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("drop", handleDrop, true);
    return () => {
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [props]);

  if (props.mode === "compose" && props.composeAnimationPart) {
    return <ComposeAnimationTimelinePanel currentTime={props.currentSceneTime} part={props.composeAnimationPart ?? null} playbackPlayheadRef={props.playbackPlayheadRef} scrubbingRef={props.scrubbingRef} scrubSnapEnabled={props.scrubSnapEnabled} selectedObjectIds={props.selectedObjectIds ?? []} timelineLayers={props.timelineLayers} timelineViewportState={props.timelineViewportState} onExitCompose={props.onExitCompose ?? (() => props.onModeChange("composition"))} onRenameLayer={props.onRenameComposeAnimationLayer} onScrub={props.onScrub} onScrubStart={props.onScrubStart} onScrubEnd={props.onScrubEnd} onSelectObjects={props.onSelectComposeObjects} onTimelineLayersChange={props.onTimelineLayersChange} onTimelineViewportStateChange={props.onTimelineViewportStateChange} onUpdateBackgroundAnimation={props.onUpdateComposeBackgroundAnimation} onUpdateBackgroundMotion={props.onUpdateComposeBackgroundMotion} onUpdateObjectAnimation={props.onUpdateComposeObjectAnimation} onUpdateObjectMotion={props.onUpdateComposeObjectMotion} />;
  }

  return <DirectTimelinePanel {...props} />;
}
