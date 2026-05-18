import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { computePostProcessPlan } from "../passes/usePostProcessPlan";
import { readRawSceneTime } from "../../../app/features/playback/playbackTimeStore";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type {
  AdjustmentVisualOverlay,
  AdjustmentVisualStyle,
} from "../../../core/effects/types";
import type { RefObject } from "react";
import type { FramePreview } from "../FramePreview";
import type {
  FramePreviewLive,
  FramePreviewLiveProps,
} from "../FramePreviewLive";
import type { PrerenderBlock } from "../../../app/features/preview/usePrerenderCache";

type FramePreviewLiveExtras = Pick<
  FramePreviewLiveProps,
  "previewSceneContext" | "timelineMode" | "activeCompositionHidden"
>;

export type StrategyFramePreviewProps = ComponentProps<typeof FramePreview> &
  FramePreviewLiveExtras;

export type PrerenderDisplayMode = "dom" | "canvas2d" | "webgl";

export const PRERENDER_MISS_GRACE_MS = 220;
export const DOM_FALLBACK_READY_TOLERANCE_SECONDS = 1 / 60;

export function readPreviewSceneTime(
  currentSceneTimeRef: RefObject<number>,
): number {
  return readRawSceneTime(currentSceneTimeRef.current);
}

export function requiresDomOverlayPreview(
  props: StrategyFramePreviewProps,
): boolean {
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
    props.editingTextObjectId !== null
  );
}

export function getPreviewPlanFrameSize() {
  return { width: FRAME_WIDTH, height: FRAME_HEIGHT };
}

export function makePreviewCanvasStyle(frameScale: number): CSSProperties {
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    transform: `scale(${frameScale})`,
    transformOrigin: "top left",
  };
}

export { computePostProcessPlan };

export function toFramePreviewLiveProps(
  props: StrategyFramePreviewProps,
): FramePreviewLiveProps {
  const {
    part: _part,
    sceneMotionPart: _sceneMotionPart,
    sceneWrap: _sceneWrap,
    partStart: _partStart,
    previewParts: _previewParts,
    transitionPreviewParts: _transitionPreviewParts,
    previewTime: _previewTime,
    sceneTime: _sceneTime,
    motionLayers: _motionLayers,
    hiddenMotionLayerIds: _hiddenMotionLayerIds,
    adjustmentLayers: _adjustmentLayers,
    transitionLayers: _transitionLayers,
    compHidden: _compHidden,
    ...rest
  } = props;
  void _part;
  void _sceneMotionPart;
  void _sceneWrap;
  void _partStart;
  void _previewParts;
  void _transitionPreviewParts;
  void _previewTime;
  void _sceneTime;
  void _motionLayers;
  void _hiddenMotionLayerIds;
  void _adjustmentLayers;
  void _transitionLayers;
  void _compHidden;
  return rest as FramePreviewLiveProps;
}

export function getFrameForTime(block: PrerenderBlock, sceneTime: number) {
  const sceneFrameIndex = Math.round(sceneTime * block.frameRate);
  const blockStartFrameIndex = Math.round(block.startTime * block.frameRate);
  const frameIndex = sceneFrameIndex - blockStartFrameIndex;
  if (frameIndex < 0 || frameIndex >= block.frames.length) return null;
  return block.frames[frameIndex] ?? null;
}

export const noopFramePointer: StrategyFramePreviewProps["onFramePointerDown"] =
  () => {};
export const noopObjectPointerDown: StrategyFramePreviewProps["onObjectPointerDown"] =
  () => {};
export const noopObjectResizePointerDown: StrategyFramePreviewProps["onObjectResizePointerDown"] =
  () => {};
export const noopTextEditCommit: StrategyFramePreviewProps["onTextEditCommit"] =
  () => {};
export const noopTextObjectDoubleClick: StrategyFramePreviewProps["onTextObjectDoubleClick"] =
  () => {};
export const noopTrackerTargetPick: StrategyFramePreviewProps["onTrackerTargetPick"] =
  () => {};

export function LiveVisualOverlays({
  overlays,
}: {
  overlays: AdjustmentVisualOverlay[] | undefined;
}): ReactNode {
  if (!overlays?.length) return null;
  return (
    <>
      {overlays.map((overlay) => (
        <div
          className="pointer-events-none absolute inset-0"
          key={overlay.id}
          style={{ zIndex: 2147483647, ...overlay.style }}
        />
      ))}
    </>
  );
}

export type { FramePreviewLive, AdjustmentVisualStyle };
