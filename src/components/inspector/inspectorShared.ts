import {
  evaluateObjectState,
  findPropertyKeyframeIndexAtTime,
  getFillValue,
} from "../../core/propertyRegistry";
import type { Bounds, FrameObject } from "../../core/types";
import type { FillValue } from "../../core/fillValue";
import type { ComposeAnimationAttributeKey } from "../timeline/composeAnimationModel";
import type { FillKeyframeState } from "./KeyframedColorInput";

export type BoundsAnimationKey = keyof Bounds;

export type EffectInputConfig = {
  label: string;
  animationKey?: ComposeAnimationAttributeKey;
  value: number | string;
  type?: "number" | "text";
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: string) => void;
  onPreviewNumber?: (value: number) => void;
  linkedKeys?: readonly [BoundsAnimationKey, BoundsAnimationKey];
};

export type EffectInputDescriptorContext = {
  object: FrameObject;
  updateStyleNumber: (key: string, value: string) => void;
  previewStyleNumber: (key: string, value: number) => void;
  updateTransform: (name: string, value: string) => void;
  previewTransform: (name: string, value: number) => void;
};

export type EffectInputDescriptor = {
  key: string;
  build: (context: EffectInputDescriptorContext) => EffectInputConfig;
};

export const effectInputDescriptors: readonly EffectInputDescriptor[] = [
  {
    key: "opacity",
    build: ({ object, updateStyleNumber, previewStyleNumber }) => ({
      label: "Opacity",
      animationKey: "opacity",
      value: Number(object.style.opacity ?? 1),
      min: 0,
      max: 1,
      step: 0.01,
      onPreviewNumber: (value) => previewStyleNumber("opacity", value),
      onCommit: (value) => updateStyleNumber("opacity", value),
    }),
  },
  {
    key: "blur",
    build: () => ({
      label: "Blur",
      animationKey: "blur",
      value: 0,
      min: 0,
      step: 0.1,
      onCommit: () => undefined,
    }),
  },
  {
    key: "scale",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Scale",
      animationKey: "scale",
      value: 1,
      min: 0,
      step: 0.01,
      onCommit: (value) => updateTransform("scale", value),
      onPreviewNumber: (value) => previewTransform("scale", value),
    }),
  },
  {
    key: "scaleX",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Scale X",
      animationKey: "scaleX",
      value: 1,
      min: 0,
      step: 0.01,
      onCommit: (value) => updateTransform("scaleX", value),
      onPreviewNumber: (value) => previewTransform("scaleX", value),
    }),
  },
  {
    key: "scaleY",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Scale Y",
      animationKey: "scaleY",
      value: 1,
      min: 0,
      step: 0.01,
      onCommit: (value) => updateTransform("scaleY", value),
      onPreviewNumber: (value) => previewTransform("scaleY", value),
    }),
  },
  {
    key: "rotate",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Rotation",
      animationKey: "rotate",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("rotate", value),
      onPreviewNumber: (value) => previewTransform("rotate", value),
    }),
  },
  {
    key: "rotateX",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Rotate X",
      animationKey: "rotateX",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("rotateX", value),
      onPreviewNumber: (value) => previewTransform("rotateX", value),
    }),
  },
  {
    key: "rotateY",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Rotate Y",
      animationKey: "rotateY",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("rotateY", value),
      onPreviewNumber: (value) => previewTransform("rotateY", value),
    }),
  },
  {
    key: "rotateZ",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Rotate Z",
      animationKey: "rotateZ",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("rotateZ", value),
      onPreviewNumber: (value) => previewTransform("rotateZ", value),
    }),
  },
  {
    key: "skewX",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Skew X",
      animationKey: "skewX",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("skewX", value),
      onPreviewNumber: (value) => previewTransform("skewX", value),
    }),
  },
  {
    key: "skewY",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Skew Y",
      animationKey: "skewY",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("skewY", value),
      onPreviewNumber: (value) => previewTransform("skewY", value),
    }),
  },
  {
    key: "perspective",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Perspective",
      animationKey: "transformPerspective",
      value: 0,
      min: 0,
      step: 1,
      onCommit: (value) => updateTransform("perspective", value),
      onPreviewNumber: (value) => previewTransform("perspective", value),
    }),
  },
  {
    key: "z",
    build: ({ updateTransform, previewTransform }) => ({
      label: "Z",
      animationKey: "z",
      value: 0,
      step: 1,
      onCommit: (value) => updateTransform("translateZ", value),
      onPreviewNumber: (value) => previewTransform("translateZ", value),
    }),
  },
  {
    key: "pathOffset",
    build: () => ({
      label: "Path Offset",
      animationKey: "pathOffset",
      value: 0,
      step: 0.01,
      onCommit: () => undefined,
    }),
  },
  {
    key: "pathLength",
    build: () => ({
      label: "Path Length",
      animationKey: "pathLength",
      value: 1,
      min: 0,
      step: 0.01,
      onCommit: () => undefined,
    }),
  },
  {
    key: "pathSpacing",
    build: () => ({
      label: "Path Spacing",
      animationKey: "pathSpacing",
      value: 0,
      step: 0.01,
      onCommit: () => undefined,
    }),
  },
];

export function propertyPathForAttribute(key: ComposeAnimationAttributeKey) {
  if (key === "x" || key === "y" || key === "width" || key === "height")
    return `bounds.${key}`;
  if (key === "opacity" || key === "color" || key === "backgroundColor")
    return `style.${key}`;
  if (
    key === "fontSize" ||
    key === "fontWeight" ||
    key === "lineHeight" ||
    key === "letterSpacing" ||
    key === "fontFamily"
  )
    return `style.${key}`;
  if (key === "blur") return "filter.blur";
  if (key === "z") return "transform.translateZ";
  if (key === "transformPerspective") return "transform.perspective";
  if (
    key === "scale" ||
    key === "scaleX" ||
    key === "scaleY" ||
    key === "rotate" ||
    key === "rotateX" ||
    key === "rotateY" ||
    key === "rotateZ" ||
    key === "skewX" ||
    key === "skewY"
  )
    return `transform.${key}`;
  return null;
}

export function coerceInspectorAttributeValue(
  key: ComposeAnimationAttributeKey,
  value: number | string,
) {
  if (typeof value === "number") return value;
  if (key === "color" || key === "backgroundColor" || key === "fontFamily")
    return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

export function hasPropertyTrack(object: FrameObject, path: string | null) {
  return Boolean(path && object.tracks?.[path]?.points.length);
}

export function getPropertyTrackKeyframeAtTime(
  object: FrameObject,
  path: string | null,
  currentTime: number,
) {
  const points = path ? object.tracks?.[path]?.points : undefined;
  if (!points?.length) return null;
  const index = findPropertyKeyframeIndexAtTime(points, currentTime);
  if (index < 0) return null;
  const point = points[index];
  return { time: point.time, value: point.value };
}

export function getEvaluatedAttributeValue(
  object: FrameObject,
  key: ComposeAnimationAttributeKey,
  time: number,
) {
  if (!hasPropertyTrack(object, propertyPathForAttribute(key))) return null;
  const evaluated = evaluateObjectState(object, time);
  if (key === "x" || key === "y" || key === "width" || key === "height")
    return evaluated.bounds[key];
  if (key === "opacity" || key === "color" || key === "backgroundColor")
    return evaluated.style[key] ?? null;
  if (
    key === "fontSize" ||
    key === "fontWeight" ||
    key === "lineHeight" ||
    key === "letterSpacing" ||
    key === "fontFamily"
  )
    return evaluated.style[key] ?? null;
  const transform = evaluated.transform as Record<string, unknown>;
  const filter = evaluated.filter as Record<string, unknown>;
  if (key === "blur") return filter.blur ?? null;
  if (key === "z") return transform.translateZ ?? null;
  if (key === "transformPerspective") return transform.perspective ?? null;
  return transform[key] ?? null;
}

export function isBoundsAnimationKey(
  key: ComposeAnimationAttributeKey,
): key is BoundsAnimationKey {
  return key === "x" || key === "y" || key === "width" || key === "height";
}

export function hasAnyFillTrack(object: FrameObject): boolean {
  const tracks = object.tracks;
  if (!tracks) return false;
  for (const path of Object.keys(tracks)) {
    if (path.startsWith("style.fill.") && tracks[path]?.points.length) {
      return true;
    }
  }
  return false;
}

export function getFillKeyframeStates(
  object: FrameObject,
  currentTime: number,
): FillKeyframeState[] {
  const fill = getFillValue(object);
  const states: FillKeyframeState[] = [];
  const pushState = (path: string, label: string) => {
    states.push({
      path,
      label,
      hasKeyframe: Boolean(
        getPropertyTrackKeyframeAtTime(object, path, currentTime),
      ),
    });
  };

  if (fill.mode === "solid") {
    pushState("style.fill.color", "Color");
    pushState("style.fill.alpha", "Alpha");
  } else {
    if (fill.gradientType === "linear") {
      pushState("style.fill.linearAngle", "Angle");
    } else if (fill.gradientType === "radial") {
      pushState("style.fill.radialCenterX", "CX");
      pushState("style.fill.radialCenterY", "CY");
      pushState("style.fill.radialRadiusX", "RX");
      pushState("style.fill.radialRadiusY", "RY");
    } else if (fill.gradientType === "conic") {
      pushState("style.fill.conicFromAngle", "Angle");
      pushState("style.fill.conicCenterX", "CX");
      pushState("style.fill.conicCenterY", "CY");
    } else if (fill.gradientType === "diamond") {
      pushState("style.fill.diamondRotation", "Rot");
      pushState("style.fill.diamondCenterX", "CX");
      pushState("style.fill.diamondCenterY", "CY");
      pushState("style.fill.diamondRadiusX", "RX");
      pushState("style.fill.diamondRadiusY", "RY");
    }

    for (const stop of fill.stops) {
      pushState(`style.fill.stops[${stop.id}].color`, `S${stop.id.slice(-2)}`);
      pushState(
        `style.fill.stops[${stop.id}].position`,
        `P${stop.id.slice(-2)}`,
      );
      pushState(
        `style.fill.stops[${stop.id}].opacity`,
        `O${stop.id.slice(-2)}`,
      );
    }
  }

  return states;
}

export function readFillPathValue(
  fill: FillValue,
  path: string,
): string | number | boolean {
  if (path === "style.fill.color") return fill.color;
  if (path === "style.fill.alpha") return fill.alpha;
  if (path === "style.fill.gradientType") return fill.gradientType;
  if (path === "style.fill.repeating") return fill.repeating;
  if (path === "style.fill.colorSpace") return fill.colorSpace;
  if (path === "style.fill.linearAngle") return fill.linearAngle;
  if (path === "style.fill.radialShape") return fill.radialShape;
  if (path === "style.fill.radialCenterX") return fill.radialCenterX;
  if (path === "style.fill.radialCenterY") return fill.radialCenterY;
  if (path === "style.fill.radialRadiusX") return fill.radialRadiusX;
  if (path === "style.fill.radialRadiusY") return fill.radialRadiusY;
  if (path === "style.fill.conicFromAngle") return fill.conicFromAngle;
  if (path === "style.fill.conicCenterX") return fill.conicCenterX;
  if (path === "style.fill.conicCenterY") return fill.conicCenterY;
  if (path === "style.fill.diamondCenterX") return fill.diamondCenterX;
  if (path === "style.fill.diamondCenterY") return fill.diamondCenterY;
  if (path === "style.fill.diamondRadiusX") return fill.diamondRadiusX;
  if (path === "style.fill.diamondRadiusY") return fill.diamondRadiusY;
  if (path === "style.fill.diamondRotation") return fill.diamondRotation;

  const stopMatch = path.match(
    /^style\.fill\.stops\[([^\]]+)\]\.(color|position|opacity)$/,
  );
  if (stopMatch) {
    const stop = fill.stops.find((s) => s.id === stopMatch[1]);
    if (stop) return stop[stopMatch[2] as "color" | "position" | "opacity"];
  }

  return 0;
}
