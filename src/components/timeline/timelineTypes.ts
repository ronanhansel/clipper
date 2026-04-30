import type { MotionEffectKind, TimelinePart, TranslationMarker, ZoomMarker } from "../../core/types";

export type EffectDragPreview = {
  category: "adjustment" | "motion" | "composition";
  effectId?: string;
  isEmpty?: boolean;
  kind?: MotionEffectKind;
  layerKey: string;
  label?: string;
  sourceMissing?: boolean;
  start: number;
  duration: number;
  initialClientX: number;
  initialStart: number;
};

export type AbsoluteTimelineMarker<T extends { id: string; start: number; duration: number }> = T & {
  sourcePartId: string;
  sourcePartStart: number;
};

export type TimelinePartMotionView = TimelinePart & {
  zoomMarkers: ZoomMarker[];
  translationMarkers: TranslationMarker[];
};
