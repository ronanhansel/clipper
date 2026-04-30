import { getTimelineDragDeltaSeconds, getTimelineBlockTiming, type TimelineBlockTimingAction } from "../../core/timelineBlockTiming";
import type { BackgroundLayer, FrameObject, MotionTrack, Part, TranslationMarker } from "../../core/types";
import type { TimelinePartMotionView } from "./timelineTypes";

export type ComposeAnimationTimelineLayer = {
  id: string;
  name: string;
  kind: "object" | "background-object" | "background";
  object?: FrameObject;
  motion?: MotionTrack;
};

export type ComposeAnimationTimingDrag = {
  action: TimelineBlockTimingAction;
  initialClientX: number;
  initialScrollLeft: number;
  initialDelay: number;
  initialDuration: number;
  layer: ComposeAnimationTimelineLayer;
  partId: string;
  pointerId: number;
  snapBoundaries: number[];
  snapThresholdSeconds: number;
};

export function buildComposeAnimationTimelineLayers(part: Part): ComposeAnimationTimelineLayer[] {
  return [
    ...[...part.objects].reverse().map((object) => ({ id: object.id, name: object.name || object.id, kind: "object" as const, motion: object.motion, object })),
    ...[...part.background.elements].reverse().map((object) => ({ id: object.id, name: object.name || object.id, kind: "background-object" as const, motion: object.motion, object })),
    { id: part.background.id, name: part.background.name || "Background", kind: "background" as const, motion: part.background.motion },
  ];
}

export function buildComposeAnimationMotionTimelinePart(part: Part, layers: ComposeAnimationTimelineLayer[], timelineDuration: number): TimelinePartMotionView {
  const translationMarkers = layers.flatMap((layer): TranslationMarker[] => {
    if (!layer.motion) return [];
    return [{
      id: layer.id,
      name: composeAnimationMotionLabel(layer.motion),
      layerId: layer.id,
      effectId: "clipper.motion.pan",
      kind: "pan",
      start: layer.motion.delay ?? 0,
      duration: layer.motion.duration,
      position: { x: 0, y: 0 },
    }];
  });

  return {
    ...part,
    start: 0,
    end: timelineDuration,
    duration: timelineDuration,
    zoomMarkers: [],
    translationMarkers,
  };
}

export function getComposeAnimationSnapBoundaries(layers: ComposeAnimationTimelineLayer[], timelineDuration: number) {
  return Array.from(new Set([
    0,
    timelineDuration,
    ...layers.flatMap((layer) => layer.motion ? [layer.motion.delay ?? 0, (layer.motion.delay ?? 0) + layer.motion.duration] : []),
  ])).sort((left, right) => left - right);
}

export function getComposeAnimationTimingDelta(drag: ComposeAnimationTimingDrag, clientX: number, scrollLeft: number, contentWidth: number, timelineDuration: number) {
  return getTimelineDragDeltaSeconds({
    initialClientX: drag.initialClientX,
    clientX,
    initialScrollLeft: drag.initialScrollLeft,
    scrollLeft,
    pixelsPerSecond: Math.max(contentWidth, 1) / Math.max(timelineDuration, 0.0001),
  });
}

export function getNextComposeAnimationTiming(drag: ComposeAnimationTimingDrag, deltaSeconds: number, timelineDuration: number, snap: boolean) {
  const timing = getTimelineBlockTiming({
    action: drag.action,
    initialStart: drag.initialDelay,
    initialDuration: drag.initialDuration,
    deltaSeconds,
    timelineDuration,
    snap,
    snapBoundaries: drag.snapBoundaries,
    snapThresholdSeconds: drag.snapThresholdSeconds,
  });
  return { delay: timing.start, duration: timing.duration, guideTime: timing.guideTime };
}

export function updateComposeAnimationLayerMotionTiming(layer: ComposeAnimationTimelineLayer, timing: { delay: number; duration: number }, onUpdateBackgroundMotion?: (updater: (motion: MotionTrack | undefined, background: BackgroundLayer) => MotionTrack | undefined) => void, onUpdateObjectMotion?: (objectId: string, updater: (motion: MotionTrack | undefined, object: FrameObject) => MotionTrack | undefined) => void) {
  if (layer.kind === "background") {
    onUpdateBackgroundMotion?.((motion) => motion ? { ...motion, delay: timing.delay || undefined, duration: timing.duration } : motion);
    return;
  }
  if (layer.object) onUpdateObjectMotion?.(layer.object.id, (motion) => motion ? { ...motion, delay: timing.delay || undefined, duration: timing.duration } : motion);
}

function composeAnimationMotionLabel(motion: MotionTrack) {
  const properties = [motion.opacity ? "opacity" : null, motion.x ? "x" : null, motion.y ? "y" : null, motion.path ? "path" : null, motion.scale ? "scale" : null, motion.scaleX ? "scaleX" : null, motion.scaleY ? "scaleY" : null, motion.rotate ? "rotate" : null, motion.skewX ? "skewX" : null, motion.skewY ? "skewY" : null].filter(Boolean);
  return properties.length > 0 ? properties.join(" + ") : "Motion";
}
