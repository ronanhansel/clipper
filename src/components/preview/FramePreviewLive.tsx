import { memo, useMemo, type ComponentProps } from "react";
import {
  deriveFramePreviewRenderModelFromContext,
  type FramePreviewSceneContext,
} from "../../app/state/framePreviewRenderModel";
import { usePlayheadTime } from "../../app/features/playback/usePlayheadTime";
import type {
  AdjustmentLayer,
  CompositionClip,
  TimelineMode,
  TransitionLayer,
} from "../../core/types";
import type { TimelinePreviewStackPart } from "../../core/timeline";
import type { PostProcessPass } from "../../core/effects/types";
import { FramePreview } from "./FramePreview";

// FramePreview accepts a few extra optional props via spread that are not in
// its formal prop type (it reads them off `arguments[0]`). PreviewColumn
// declares the same extension, so we mirror that here so this wrapper can
// thread those props through.
type FramePreviewExtraProps = {
  previewParts?: TimelinePreviewStackPart[];
  transitionPreviewParts?: {
    from: TimelinePreviewStackPart[];
    to: TimelinePreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
    postProcessPasses: PostProcessPass[];
  } | null;
  transitionLayers?: TransitionLayer[];
};

type FramePreviewBaseProps = ComponentProps<typeof FramePreview> &
  FramePreviewExtraProps;

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
  /**
   * Whether the active composition's timeline layer is hidden. Mirrors
   * AppContent's `activeCompositionHidden` (App.tsx:1536). Time-stable across
   * ticks within one composition; only changes at preview-key boundaries.
   */
  activeCompositionHidden: boolean;
  /**
   * Optional file-backed composition that overrides `part`/`previewTime` when
   * compose-mode is active. Mirrors `composeFilePart` in
   * editorDerivedState.ts:144-150.
   */
  composeFilePart: CompositionClip | null;
  /**
   * Selected part used as the duration-clamp fallback in the compose-mode
   * preview-time formula (editorDerivedState.ts:124-137). Stable per session.
   */
  selectedPart: CompositionClip | null;
  /**
   * Optional override that bypasses the wrapper's internally-computed
   * `adjustmentLayers`. Used by `LivePostProcessFramePreview`'s off-screen
   * source canvas, which needs a per-pass-filtered subset.
   */
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
    activeComposition,
    activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds: ctxHiddenMotionLayerIds,
    motionLayers: ctxMotionLayers,
    part: livePart,
    previewParts: livePreviewParts,
    previewTime: livePreviewTime,
    transitionLayers: ctxTransitionLayers,
    transitionPreviewParts: liveTransitionPreviewParts,
    visibleAdjustmentLayers: ctxAdjustmentLayers,
  } = renderModel;

  // Compose-aware preview time. Mirrors editorDerivedState.ts:124-137.
  const composePreviewTime =
    timelineMode === "compose"
      ? Math.min(
          Math.max(
            activeTimelinePart
              ? liveTime -
                  (activeTimelinePart.start ?? 0) +
                  (activeTimelinePart.trimStart ?? 0)
              : liveTime,
            0,
          ),
          (activeComposition ?? selectedPart)?.duration ?? 0,
        )
      : livePreviewTime;

  const displayPart = composeFilePart ?? livePart;
  const displayPreviewTime =
    composeFilePart && timelineMode === "compose"
      ? composePreviewTime
      : livePreviewTime;

  const showSceneAux = hasPreviewComposition && !composeMode;
  const partStart = composeMode ? 0 : (activeTimelinePart?.start ?? 0);
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
      {...({
        previewParts,
        transitionPreviewParts,
        transitionLayers,
      } as Partial<FramePreviewExtraProps>)}
      part={displayPart}
      partStart={partStart}
      previewTime={displayPreviewTime}
      sceneTime={adjustedSceneTime}
      adjustmentLayers={adjustmentLayers}
      motionLayers={motionLayers}
      hiddenMotionLayerIds={hiddenMotionLayerIds}
      compHidden={compHidden}
    />
  );
});
