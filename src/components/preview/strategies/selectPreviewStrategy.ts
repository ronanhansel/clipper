import { computePostProcessPlan } from "../passes/usePostProcessPlan";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import {
  adjustmentLayersRequireLiveDomPostProcessSource,
  transitionLayersRequireLiveDomPostProcessSource,
} from "../../../core/effects/postprocess/liveDomRequirement";
import type { StrategyFramePreviewProps } from "./preview";

export type { StrategyFramePreviewProps };

export type PreviewStrategy =
  | {
      kind: "live-webgl";
      reason: "active-live-passes" | "live-pass-capable-layers";
    }
  | {
      kind: "live-dom";
      reason: "compose-mode" | "no-live-passes" | "dom-overlay-required";
    };

export type SelectPreviewStrategyInput = {
  framePreviewProps: StrategyFramePreviewProps;
  hasActiveLivePasses: boolean;
  hasLivePassCapableLayers: boolean;
  authoringActive: boolean;
};

export type AuthoringSignalInput = Pick<
  StrategyFramePreviewProps,
  | "canSelectObjects"
  | "focusPicking"
  | "trackerPicking"
  | "pickingTranslationPosition"
  | "pickingZoomFocus"
  | "framePickPoint"
  | "dragBox"
  | "marqueeDragging"
  | "selectedObjects"
  | "editingTextObjectId"
  | "shapeDrawPreview"
  | "isPlaying"
>;

export function deriveAuthoringActive(props: AuthoringSignalInput): boolean {
  if (props.isPlaying) return false;
  return (
    props.canSelectObjects ||
    props.focusPicking ||
    props.trackerPicking ||
    props.pickingTranslationPosition ||
    props.pickingZoomFocus ||
    props.framePickPoint !== null ||
    props.dragBox !== null ||
    props.marqueeDragging ||
    props.selectedObjects.length > 0 ||
    props.editingTextObjectId !== null ||
    Boolean(props.shapeDrawPreview)
  );
}

export function computeHasActiveLivePasses(
  framePreviewProps: StrategyFramePreviewProps,
  sceneTime: number,
): boolean {
  return computePostProcessPlan(
    sceneTime,
    framePreviewProps.adjustmentLayers,
    { transitionLayers: framePreviewProps.transitionLayers },
    { width: FRAME_WIDTH, height: FRAME_HEIGHT },
  ).hasLivePasses;
}

export function computeHasLivePassCapableLayers(
  framePreviewProps: StrategyFramePreviewProps,
): boolean {
  return (
    adjustmentLayersRequireLiveDomPostProcessSource(
      framePreviewProps.adjustmentLayers,
    ) ||
    transitionLayersRequireLiveDomPostProcessSource(
      framePreviewProps.transitionLayers,
    )
  );
}

export function selectPreviewStrategy(
  input: SelectPreviewStrategyInput,
): PreviewStrategy {
  const {
    framePreviewProps,
    hasActiveLivePasses,
    hasLivePassCapableLayers,
    authoringActive,
  } = input;

  if (framePreviewProps.timelineMode === "compose") {
    return { kind: "live-dom", reason: "compose-mode" };
  }

  if (hasActiveLivePasses) {
    return { kind: "live-webgl", reason: "active-live-passes" };
  }

  if (hasLivePassCapableLayers) {
    return { kind: "live-webgl", reason: "live-pass-capable-layers" };
  }

  if (authoringActive) {
    return { kind: "live-dom", reason: "dom-overlay-required" };
  }

  return { kind: "live-dom", reason: "no-live-passes" };
}
