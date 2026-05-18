import type {
  AnimationTrack,
  AnimationTrackProperty,
  KeyframePoint,
  LayerAnimation,
  Point,
} from "./types";
import type { RenderStyle } from "../render-engine/renderRuntime";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const TRANSFORM_MAP: Partial<Record<AnimationTrackProperty, string>> = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  scale: "scale",
  scaleX: "scaleX",
  scaleY: "scaleY",
  rotate: "rotate",
  rotateX: "rotateX",
  rotateY: "rotateY",
  rotateZ: "rotateZ",
  skewX: "skewX",
  skewY: "skewY",
};

const TRANSFORM_UNITS: Partial<Record<AnimationTrackProperty, string>> = {
  x: "px",
  y: "px",
  z: "px",
  scale: "",
  scaleX: "",
  scaleY: "",
  rotate: "deg",
  rotateX: "deg",
  rotateY: "deg",
  rotateZ: "deg",
  skewX: "deg",
  skewY: "deg",
};

const NUMERIC_TRACK_PROPERTIES = [
  "opacity",
  "x",
  "y",
  "width",
  "height",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skewX",
  "skewY",
  "pathOffset",
  "pathLength",
  "pathSpacing",
  "blur",
] as const satisfies readonly AnimationTrackProperty[];

const COLOR_TRACK_PROPERTIES = [
  "color",
  "backgroundColor",
] as const satisfies readonly AnimationTrackProperty[];

export function evaluateLayerAnimations(
  animations: LayerAnimation[],
  time: number,
): RenderStyle {
  const style: RenderStyle = {};
  const transforms: string[] = [];
  const tracks = collectEnabledTracks(animations);

  const perspectiveTrack = tracks.get("transformPerspective");
  if (perspectiveTrack) {
    const value = evaluateNumericTrack(perspectiveTrack, time);
    transforms.push(`perspective(${Math.round(value)}px)`);
  }

  for (const property of NUMERIC_TRACK_PROPERTIES) {
    const track = tracks.get(property);
    if (!track) continue;
    const value = evaluateNumericTrack(track, time);
    const transformName = TRANSFORM_MAP[property];
    if (transformName) {
      const unit = TRANSFORM_UNITS[property] ?? "";
      const formatted =
        property === "scale" || property === "scaleX" || property === "scaleY"
          ? value.toFixed(4)
          : Math.round(value);
      transforms.push(`${transformName}(${formatted}${unit})`);
    } else if (property === "opacity") {
      style.opacity = value;
    } else if (property === "blur") {
      style.filter = `blur(${Math.max(0, value).toFixed(2)}px)`;
    } else if (property === "width" || property === "height") {
      style[property] = Math.max(0, value);
    }
  }

  for (const property of COLOR_TRACK_PROPERTIES) {
    const track = tracks.get(property);
    if (!track) continue;
    style[property] = evaluateColorTrack(track, time);
  }

  if (transforms.length > 0) style.transform = transforms.join(" ");
  return style;
}

export function evaluateLayerAnimation(
  animation: LayerAnimation,
  time: number,
): RenderStyle {
  return evaluateLayerAnimations([animation], time);
}

function collectEnabledTracks(animations: LayerAnimation[]) {
  const tracks = new Map<AnimationTrackProperty, AnimationTrack>();
  for (const animation of animations) {
    if (animation.enabled === false || !Array.isArray(animation.tracks))
      continue;
    const fallbackEase = animation.options.ease;
    for (const track of animation.tracks) {
      const points = track.points.map((point) =>
        point.easingToNext === undefined && fallbackEase !== undefined
          ? { ...point, easingToNext: fallbackEase }
          : point,
      );
      const existing = tracks.get(track.property);
      if (!existing) {
        tracks.set(track.property, { ...track, points });
        continue;
      }
      tracks.set(track.property, {
        ...existing,
        points: [...existing.points, ...points],
      });
    }
  }
  return tracks;
}

export function evaluateNumericTrack(
  track: AnimationTrack,
  time: number,
): number {
  const sorted = sortedPoints(track.points).filter(
    (point): point is KeyframePoint & { value: number } =>
      typeof point.value === "number",
  );
  if (sorted.length === 0) return 0;
  if (sorted.length === 1 || time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (time < start.time || time > end.time) continue;
    if (start.hold) return start.value;
    const duration = end.time - start.time;
    if (duration <= 0) return end.value;
    const progress = easeAnimationProgress(
      (time - start.time) / duration,
      start.easingToNext,
    );
    return lerp(start.value, end.value, progress);
  }

  return last.value;
}

export function evaluateColorTrack(
  track: AnimationTrack,
  time: number,
): string {
  const sorted = sortedPoints(track.points).filter(
    (point): point is KeyframePoint & { value: string } =>
      typeof point.value === "string",
  );
  if (sorted.length === 0) return "";
  let value = sorted[0].value;
  for (const point of sorted) {
    if (point.time > time) break;
    value = point.value;
  }
  return value;
}

function sortedPoints(points: KeyframePoint[]) {
  return [...points].sort((left, right) => left.time - right.time);
}

export function getLayerAnimationsTranslation(
  animations: LayerAnimation[] | undefined,
  time: number,
): Point {
  const style = evaluateLayerAnimations(animations ?? [], time);
  const transform = typeof style.transform === "string" ? style.transform : "";
  return {
    x: getTranslateValue(transform, "translateX"),
    y: getTranslateValue(transform, "translateY"),
  };
}

function getTranslateValue(transform: string, functionName: string) {
  const match = transform.match(
    new RegExp(`${functionName}\\((-?\\d+(?:\\.\\d+)?)px\\)`),
  );
  return match ? Number(match[1]) : 0;
}

export function interpolateKeyframeValues(
  keyframes: readonly number[],
  progress: number,
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0];

  const segmentCount = keyframes.length - 1;
  const scaled = clamp(progress, 0, 1) * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const t = scaled - index;

  return lerp(keyframes[index], keyframes[index + 1], t);
}

export function easeAnimationProgress(
  progress: number,
  ease?: string | readonly number[],
): number {
  if (ease === "linear" || ease === undefined) return progress;
  if (ease === "snap") return progress >= 1 ? 1 : 0;
  if (ease === "easeIn") return progress * progress * progress;
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(progress);
  if (ease === "easeInOut") return easeInOutCubic(progress);
  if (ease === "inAndOut") return inAndOutEase(progress);
  if (ease === "expoIn") return expoIn(progress);
  if (ease === "expoOut") return expoOut(progress);
  if (ease === "backOut") return backOut(progress);
  if (Array.isArray(ease) && ease.length === 4) {
    return cubicBezierEase(progress, ease[0], ease[1], ease[2], ease[3]);
  }
  return progress;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function expoIn(value: number): number {
  if (value <= 0) return 0;
  return Math.pow(2, 10 * value - 10);
}

function inAndOutEase(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value < 0.5
    ? Math.pow(2, 20 * value - 10) / 2
    : (2 - Math.pow(2, -20 * value + 10)) / 2;
}

function expoOut(value: number): number {
  if (value >= 1) return 1;
  return 1 - Math.pow(2, -10 * value);
}

function backOut(value: number): number {
  return (
    1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
  );
}

function cubicBezierEase(
  progress: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const sampleX = (t: number) =>
    3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const sampleY = (t: number) =>
    3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;

  let low = 0;
  let high = 1;
  let t = progress;

  for (let i = 0; i < 20; i++) {
    const x = sampleX(t);
    if (Math.abs(x - progress) < 1e-6) break;
    if (x < progress) low = t;
    else high = t;
    t = (low + high) / 2;
  }

  return sampleY(t);
}
