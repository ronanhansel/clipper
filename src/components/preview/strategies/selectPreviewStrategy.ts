import { computePostProcessPlan } from "../passes/usePostProcessPlan";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type { StrategyFramePreviewProps } from "./preview";

export type { StrategyFramePreviewProps };

export type PreviewStrategy =
  | { kind: "live-webgl"; reason: "active-live-passes" }
  | {
      kind: "live-dom";
      reason: "compose-mode" | "no-live-passes" | "dom-overlay-required";
    }
  | { kind: "prerender"; reason: "prerender-frames-available" };

export type SelectPreviewStrategyInput = {
  framePreviewProps: StrategyFramePreviewProps;
  hasActiveLivePasses: boolean;
  prerenderEnabled: boolean;
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
    framePreviewProps.transitionPreviewParts ?? null,
    { width: FRAME_WIDTH, height: FRAME_HEIGHT },
  ).hasLivePasses;
}

export function selectPreviewStrategy(
  input: SelectPreviewStrategyInput,
): PreviewStrategy {
  const {
    framePreviewProps,
    hasActiveLivePasses,
    prerenderEnabled,
    authoringActive,
  } = input;

  if (framePreviewProps.timelineMode === "compose") {
    return { kind: "live-dom", reason: "compose-mode" };
  }

  if (hasActiveLivePasses) {
    return { kind: "live-webgl", reason: "active-live-passes" };
  }

  if (authoringActive) {
    return { kind: "live-dom", reason: "dom-overlay-required" };
  }

  if (prerenderEnabled) {
    return { kind: "prerender", reason: "prerender-frames-available" };
  }

  return { kind: "live-dom", reason: "no-live-passes" };
}
