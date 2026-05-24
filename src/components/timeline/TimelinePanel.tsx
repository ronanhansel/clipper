import { useEffect, useRef } from "react";
import { defaultTimelineLayerState } from "../../core/project";
import { timelineDisplayDuration as getTimelineDisplayDuration } from "../../core/timeline";
import {
  getActiveCompositionPointerDrag,
  setActiveCompositionPointerDrag,
} from "../../lib/pointerDrag";
import { ComposeAnimationTimelinePanel } from "./ComposeAnimationTimelinePanel";
import { DirectTimelinePanel } from "./DirectTimelinePanel";
import type { TimelinePanelProps } from "./timelineTypes";

export type { TimelinePanelProps } from "./timelineTypes";

export function TimelinePanel(props: TimelinePanelProps) {
  const inactivePlaybackPlayheadRef = useRef<HTMLDivElement | null>(null);
  const lastDirectPropsRef = useRef<TimelinePanelProps>(props);
  const lastComposePartRef = useRef(props.composeAnimationPart ?? null);
  const lastComposeSelectedObjectIdsRef = useRef(props.selectedObjectIds ?? []);
  if (props.mode !== "compose") lastDirectPropsRef.current = props;
  if (props.mode === "compose") {
    lastComposePartRef.current = props.composeAnimationPart ?? null;
    lastComposeSelectedObjectIdsRef.current = props.selectedObjectIds ?? [];
  }
  const composePart =
    props.mode === "compose"
      ? (props.composeAnimationPart ?? null)
      : lastComposePartRef.current;
  const composeSelectedObjectIds =
    props.mode === "compose"
      ? (props.selectedObjectIds ?? [])
      : lastComposeSelectedObjectIdsRef.current;
  const composeCurrentTime = props.currentSceneTime;
  const directProps =
    props.mode === "compose" ? lastDirectPropsRef.current : props;
  useEffect(() => {
    function getCompositionId(event: DragEvent) {
      return (
        event.dataTransfer?.getData("application/x-clipper-composition") ||
        getActiveCompositionPointerDrag()?.compositionId ||
        event.dataTransfer?.getData("text/plain") ||
        ""
      );
    }

    function hasCompositionDragData(event: DragEvent) {
      const text = event.dataTransfer?.getData("text/plain") ?? "";
      return Boolean(
        event.dataTransfer?.types.includes(
          "application/x-clipper-composition",
        ) ||
        getActiveCompositionPointerDrag() ||
        isCompositionDragText(text),
      );
    }

    function getTimelineDropTime(event: DragEvent) {
      const content = document.querySelector<HTMLElement>(
        "[data-timeline-content]",
      );
      const rect = content?.getBoundingClientRect();
      if (!rect) return props.currentSceneTime;
      const displayDuration = getTimelineDisplayDuration(
        props.sceneDuration,
        props.timelineEndPaddingFraction,
      );
      const ratio = Math.min(
        Math.max((event.clientX - rect.left) / Math.max(rect.width, 1), 0),
        1,
      );
      return ratio * displayDuration;
    }

    function getTargetLayerId() {
      return (
        (props.timelineLayers.compositionLayers?.length
          ? props.timelineLayers.compositionLayers
          : defaultTimelineLayerState.compositionLayers!)?.[0]?.id ?? "comp"
      );
    }

    function isOverTimeline(event: DragEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      return (
        target instanceof HTMLElement &&
        Boolean(target.closest("[data-timeline-panel]"))
      );
    }

    function handleDragOver(event: DragEvent) {
      if (!isOverTimeline(event) || !hasCompositionDragData(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDrop(event: DragEvent) {
      if (!isOverTimeline(event) || !hasCompositionDragData(event)) return;
      const compositionId = getCompositionId(event);
      if (!compositionId) return;
      event.preventDefault();
      event.stopPropagation();
      (
        event as DragEvent & { __clipperCompositionDropHandled?: boolean }
      ).__clipperCompositionDropHandled = true;
      props.onAddComposition(
        compositionId,
        getTargetLayerId(),
        getTimelineDropTime(event),
      );
      setActiveCompositionPointerDrag(null);
      props.onModeChange("direct");
    }

    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("drop", handleDrop, true);
    return () => {
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [props]);

  return (
    <div className="relative h-full min-h-0">
      <div
        className={
          props.mode === "compose"
            ? "absolute inset-0"
            : "pointer-events-none invisible absolute inset-0"
        }
      >
        <ComposeAnimationTimelinePanel
          currentTime={composeCurrentTime}
          isPlaying={props.isPlaying}
          part={composePart}
          playbackPlayheadRef={
            props.mode === "compose"
              ? props.playbackPlayheadRef
              : inactivePlaybackPlayheadRef
          }
          scrubbingRef={props.scrubbingRef}
          scrubSnapEnabled={props.scrubSnapEnabled}
          selectedObjectIds={composeSelectedObjectIds}
          timelineLayers={props.timelineLayers}
          timelineViewportState={props.timelineViewportState}
          onExitCompose={
            props.onExitCompose ?? (() => props.onModeChange("direct"))
          }
          onRenameLayer={props.onRenameComposeAnimationLayer}
          setAppContextMenu={props.setAppContextMenu}
          onScrub={props.onScrub}
          onScrubStart={props.onScrubStart}
          onScrubEnd={props.onScrubEnd}
          onInspectObject={props.onInspectComposeObject}
          onSelectObjects={props.onSelectComposeObjects}
          onToggleLayerHidden={props.onToggleComposeLayerHidden}
          onReorderComposeObjects={props.onReorderComposeObjects}
          onTimelineLayersChange={props.onTimelineLayersChange}
          onTimelineViewportStateChange={props.onTimelineViewportStateChange}
          onUpdateObject={props.onUpdateComposeObject}
        />
      </div>
      <div
        className={
          props.mode === "compose"
            ? "pointer-events-none invisible absolute inset-0"
            : "absolute inset-0"
        }
      >
        <DirectTimelinePanel
          {...directProps}
          mode={props.mode}
          playbackPlayheadRef={
            props.mode === "compose"
              ? inactivePlaybackPlayheadRef
              : props.playbackPlayheadRef
          }
        />
      </div>
    </div>
  );
}

function isCompositionDragText(value: string) {
  return (
    value.includes(".composition.ts") || value.includes(".composition.json")
  );
}
