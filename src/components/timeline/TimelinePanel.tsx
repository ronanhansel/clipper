import { ComposeAnimationTimelinePanel } from "./ComposeAnimationTimelinePanel";
import { DirectTimelinePanel } from "./DirectTimelinePanel";
import type { TimelinePanelProps } from "./timelineTypes";

export type { TimelinePanelProps } from "./timelineTypes";

export function TimelinePanel(props: TimelinePanelProps) {
  if (props.mode === "compose") {
    return <ComposeAnimationTimelinePanel currentTime={props.currentSceneTime} part={props.composeAnimationPart ?? null} playbackPlayheadRef={props.playbackPlayheadRef} scrubbingRef={props.scrubbingRef} scrubSnapEnabled={props.scrubSnapEnabled} selectedObjectIds={props.selectedObjectIds ?? []} timelineLayers={props.timelineLayers} timelineViewportState={props.timelineViewportState} onExitCompose={props.onExitCompose ?? (() => props.onModeChange("composition"))} onRenameLayer={props.onRenameComposeAnimationLayer} onScrub={props.onScrub} onScrubStart={props.onScrubStart} onScrubEnd={props.onScrubEnd} onSelectObjects={props.onSelectComposeObjects} onTimelineLayersChange={props.onTimelineLayersChange} onTimelineViewportStateChange={props.onTimelineViewportStateChange} onUpdateBackgroundAnimation={props.onUpdateComposeBackgroundAnimation} onUpdateBackgroundMotion={props.onUpdateComposeBackgroundMotion} onUpdateObjectAnimation={props.onUpdateComposeObjectAnimation} onUpdateObjectMotion={props.onUpdateComposeObjectMotion} />;
  }

  return <DirectTimelinePanel {...props} />;
}
