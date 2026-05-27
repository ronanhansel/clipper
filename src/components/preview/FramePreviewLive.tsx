import { memo, useMemo, type ComponentProps } from "react";
import {
  deriveFramePreviewRenderModelFromContext,
  resolveDisplayTimeAndPart,
  type FramePreviewSceneContext,
} from "../../app/state/framePreviewRenderModel";
import { usePlayheadSceneTime } from "../../app/features/playback/usePlayheadTime";
import type { AdjustmentLayer, TimelineMode } from "../../core/types";
import { FramePreview } from "./FramePreview";

type FramePreviewBaseProps = ComponentProps<typeof FramePreview>;

type LiveDerivedKeys =
  | "part"
  | "sceneMotionPart"
  | "sceneWrap"
  | "partStart"
  | "previewParts"
  | "transitionPreviewParts"
  | "previewTime"
  | "sceneTime"
  | "motionLayers"
  | "hiddenMotionLayerIds"
  | "adjustmentLayers"
  | "transitionLayers"
  | "compHidden";

export type FramePreviewLiveProps = Omit<
  FramePreviewBaseProps,
  LiveDerivedKeys
> & {
  isPostProcessSource?: boolean;
  previewSceneContext: FramePreviewSceneContext;
  timelineMode: TimelineMode;
  activeCompositionHidden: boolean;
  adjustmentLayersOverride?: AdjustmentLayer[];
  paused?: boolean;
};

/**
 * Thin wrapper around `FramePreview` that subscribes to the live playhead
 * clock and derives the time-dependent FramePreview props internally. Moves
 * the per-frame React commit out of `AppContent` and into this component, so
 * AppContent only re-renders at structural (preview-key) boundaries.
 *
 * The render model already zeroes scene-aux fields (adjustment / transition /
 * motion / hide-null-objects) in compose mode via `sceneWrap`, so this
 * wrapper just hands the live values straight through.
 */
export const FramePreviewLive = memo(function FramePreviewLive(
  props: FramePreviewLiveProps,
) {
  const {
    previewSceneContext,
    timelineMode,
    activeCompositionHidden,
    adjustmentLayersOverride,
    paused,
    ...passthrough
  } = props;

  const liveTime = usePlayheadSceneTime(!paused && !passthrough.isPlaying);

  const renderModel = useMemo(
    () =>
      deriveFramePreviewRenderModelFromContext(
        previewSceneContext,
        liveTime,
        timelineMode,
      ),
    [previewSceneContext, liveTime, timelineMode],
  );

  const {
    adjustedSceneTime,
    hiddenMotionLayerIds: ctxHiddenMotionLayerIds,
    motionLayers: ctxMotionLayers,
    previewParts: livePreviewParts,
    prewarmParts: livePrewarmParts,
    transitionLayers: ctxTransitionLayers,
    transitionPreviewParts: liveTransitionPreviewParts,
    visibleAdjustmentLayers: ctxAdjustmentLayers,
  } = renderModel;

  const { displayPart, displayPreviewTime, partStart } =
    resolveDisplayTimeAndPart(renderModel);

  const adjustmentLayers = adjustmentLayersOverride ?? ctxAdjustmentLayers;
  const compHidden =
    activeCompositionHidden && renderModel.sceneWrap.hideNullObjects;

  return (
    <FramePreview
      isPostProcessSource={props.isPostProcessSource}
      {...(passthrough as ComponentProps<typeof FramePreview>)}
      previewParts={livePreviewParts}
      prewarmParts={livePrewarmParts}
      transitionPreviewParts={liveTransitionPreviewParts}
      transitionLayers={ctxTransitionLayers}
      part={displayPart}
      sceneMotionPart={renderModel.sceneMotionPart}
      sceneWrap={renderModel.sceneWrap}
      partStart={partStart}
      previewTime={displayPreviewTime}
      sceneTime={adjustedSceneTime}
      timelineMode={timelineMode}
      adjustmentLayers={adjustmentLayers}
      motionLayers={ctxMotionLayers}
      hiddenMotionLayerIds={ctxHiddenMotionLayerIds}
      compHidden={compHidden}
    />
  );
});
