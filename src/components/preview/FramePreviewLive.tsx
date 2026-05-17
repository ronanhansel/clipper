import { memo, useMemo, type ComponentProps } from "react";
import {
  deriveFramePreviewRenderModelFromContext,
  resolveDisplayTimeAndPart,
  type FramePreviewSceneContext,
} from "../../app/state/framePreviewRenderModel";
import { usePlayheadTime } from "../../app/features/playback/usePlayheadTime";
import type {
  AdjustmentLayer,
  CompositionClip,
  TimelineMode,
} from "../../core/types";
import { FramePreview } from "./FramePreview";

type FramePreviewBaseProps = ComponentProps<typeof FramePreview>;

// Fields the wrapper derives internally from the live playhead and scene
// context — callers must NOT supply these. Mirrors the conditional logic in
// AppContent (App.tsx:5193-5293).
type LiveDerivedKeys =
  | "part"
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
  previewSceneContext: FramePreviewSceneContext;
  timelineMode: TimelineMode;
  composeMode: boolean;
  hasPreviewComposition: boolean;
  activeCompositionHidden: boolean;
  composeFilePart: CompositionClip | null;
  selectedPart: CompositionClip | null;
  adjustmentLayersOverride?: AdjustmentLayer[];
};

const EMPTY_HIDDEN_MOTION_LAYER_IDS: ReadonlySet<string> = new Set();

/**
 * Thin wrapper around `FramePreview` that subscribes to the live playhead
 * clock and derives the time-dependent FramePreview props internally. Move
 * the per-frame React commit out of `AppContent` and into this component, so
 * AppContent only re-renders at structural (preview-key) boundaries.
 *
 * Pure passthrough for all non-time-dependent props.
 *
 * The conditional logic for gating preview parts / motion layers / etc. on
 * `hasPreviewComposition && !composeMode` mirrors AppContent's
 * `framePreviewProps={...}` block at App.tsx:5193-5293 exactly.
 */
export const FramePreviewLive = memo(function FramePreviewLive(
  props: FramePreviewLiveProps,
) {
  const {
    previewSceneContext,
    timelineMode,
    composeMode,
    hasPreviewComposition,
    activeCompositionHidden,
    composeFilePart,
    selectedPart,
    adjustmentLayersOverride,
    ...passthrough
  } = props;

  const liveTime = usePlayheadTime();

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
    transitionLayers: ctxTransitionLayers,
    transitionPreviewParts: liveTransitionPreviewParts,
    visibleAdjustmentLayers: ctxAdjustmentLayers,
  } = renderModel;

  const { displayPart, displayPreviewTime, partStart } =
    resolveDisplayTimeAndPart({
      composeFilePart,
      model: renderModel,
      selectedPart,
      sceneTime: liveTime,
      timelineMode,
    });

  const showSceneAux = hasPreviewComposition && !composeMode;
  const previewParts = showSceneAux ? livePreviewParts : [];
  const transitionPreviewParts = showSceneAux
    ? liveTransitionPreviewParts
    : null;
  const adjustmentLayers =
    adjustmentLayersOverride ?? (showSceneAux ? ctxAdjustmentLayers : []);
  const transitionLayers = showSceneAux ? ctxTransitionLayers : [];
  const motionLayers = showSceneAux ? ctxMotionLayers : [];
  const hiddenMotionLayerIds = showSceneAux
    ? ctxHiddenMotionLayerIds
    : (EMPTY_HIDDEN_MOTION_LAYER_IDS as Set<string>);
  const compHidden = showSceneAux ? activeCompositionHidden : false;

  return (
    <FramePreview
      {...(passthrough as ComponentProps<typeof FramePreview>)}
      previewParts={previewParts}
      transitionPreviewParts={transitionPreviewParts}
      transitionLayers={transitionLayers}
      part={displayPart}
      partStart={partStart}
      previewTime={displayPreviewTime}
      sceneTime={adjustedSceneTime}
      timelineMode={timelineMode}
      adjustmentLayers={adjustmentLayers}
      motionLayers={motionLayers}
      hiddenMotionLayerIds={hiddenMotionLayerIds}
      compHidden={compHidden}
    />
  );
});
