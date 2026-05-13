import type { LayerAnimation, Point } from "./types";
import type { RenderStyle } from "../render-engine/renderRuntime";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const TRANSFORM_MAP: Record<string, string> = {
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

const TRANSFORM_UNITS: Record<string, string> = {
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

const COLOR_KEYFRAME_KEYS = ["color", "backgroundColor"] as const;

const NUMERIC_KEYFRAME_KEYS = [
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
] as const;

const PERSPECTIVE_KEYFRAME_KEY = "transformPerspective";

type NumericKeyframeKey =
  | (typeof NUMERIC_KEYFRAME_KEYS)[number]
  | typeof PERSPECTIVE_KEYFRAME_KEY;

type ColorKeyframeKey = (typeof COLOR_KEYFRAME_KEYS)[number];

type LayerAnimationEase = LayerAnimation["options"]["ease"];

type NumericTrackPoint = {
  time: number;
  value: number;
  ease?: LayerAnimationEase;
};

type ColorTrackPoint = {
  time: number;
  value: string;
};

export function evaluateLayerAnimations(
  animations: LayerAnimation[],
  time: number,
): RenderStyle {
  return evaluateAuthoritativeLayerAnimationTracks(
    animations.filter((animation) => animation.enabled !== false),
    time,
  );
}

function evaluateAuthoritativeLayerAnimationTracks(
  animations: LayerAnimation[],
  time: number,
): RenderStyle {
  const numericTracks = new Map<NumericKeyframeKey, NumericTrackPoint[]>();
  const colorTracks = new Map<ColorKeyframeKey, ColorTrackPoint[]>();

  for (const animation of animations) {
    collectNumericTrackPoints(animation, numericTracks);
    collectColorTrackPoints(animation, colorTracks);
  }

  const style: RenderStyle = {};
  const transforms: string[] = [];
  const perspectiveTrack = numericTracks.get(PERSPECTIVE_KEYFRAME_KEY);
  if (perspectiveTrack?.length) {
    const value = interpolateNumericTrack(perspectiveTrack, time);
    transforms.push(`perspective(${Math.round(value)}px)`);
  }

  for (const key of NUMERIC_KEYFRAME_KEYS) {
    const points = numericTracks.get(key);
    if (!points?.length) continue;
    const value = interpolateNumericTrack(points, time);
    const transformName = TRANSFORM_MAP[key];
    if (transformName) {
      const unit = TRANSFORM_UNITS[key];
      const formatted =
        key === "scale" || key === "scaleX" || key === "scaleY"
          ? value.toFixed(4)
          : Math.round(value);
      transforms.push(`${transformName}(${formatted}${unit})`);
    } else if (key === "opacity") {
      style.opacity = value;
    } else if (key === "blur") {
      style.filter = `blur(${Math.max(0, value).toFixed(2)}px)`;
    } else if (key === "width" || key === "height") {
      style[key] = Math.max(0, value);
    }
  }

  for (const key of COLOR_KEYFRAME_KEYS) {
    const points = colorTracks.get(key);
    if (!points?.length) continue;
    style[key] = evaluateColorTrack(points, time);
  }

  if (transforms.length > 0) style.transform = transforms.join(" ");
  return style;
}

function collectNumericTrackPoints(
  animation: LayerAnimation,
  tracks: Map<NumericKeyframeKey, NumericTrackPoint[]>,
) {
  for (const key of NUMERIC_KEYFRAME_KEYS) {
    const values = animation.keyframes[key];
    if (!values || !Array.isArray(values) || values.length < 2) continue;
    addNumericTrackPoints(tracks, key, animation, values as readonly number[]);
  }
  const perspectiveValues = animation.keyframes.transformPerspective;
  if (
    perspectiveValues &&
    Array.isArray(perspectiveValues) &&
    perspectiveValues.length >= 2
  ) {
    addNumericTrackPoints(
      tracks,
      PERSPECTIVE_KEYFRAME_KEY,
      animation,
      perspectiveValues as readonly number[],
    );
  }
}

function addNumericTrackPoints(
  tracks: Map<NumericKeyframeKey, NumericTrackPoint[]>,
  key: NumericKeyframeKey,
  animation: LayerAnimation,
  values: readonly number[],
) {
  const points = tracks.get(key) ?? [];
  const delay = animation.options.delay ?? 0;
  const duration = animation.options.duration;
  const lastIndex = Math.max(values.length - 1, 1);
  const singleSyntheticKeyframe =
    values.length === 2 && values[0] === values[1];
  values.forEach((value, index) => {
    if (singleSyntheticKeyframe && index > 0) return;
    points.push({
      time: delay + (duration * index) / lastIndex,
      value,
      ease: animation.options.ease,
    });
  });
  tracks.set(key, points);
}

function collectColorTrackPoints(
  animation: LayerAnimation,
  tracks: Map<ColorKeyframeKey, ColorTrackPoint[]>,
) {
  for (const key of COLOR_KEYFRAME_KEYS) {
    const values = animation.keyframes[key];
    if (!values || !Array.isArray(values) || values.length < 2) continue;
    const points = tracks.get(key) ?? [];
    const delay = animation.options.delay ?? 0;
    const duration = animation.options.duration;
    const lastIndex = Math.max(values.length - 1, 1);
    const singleSyntheticKeyframe =
      values.length === 2 && values[0] === values[1];
    values.forEach((value, index) => {
      if (singleSyntheticKeyframe && index > 0) return;
      points.push({
        time: delay + (duration * index) / lastIndex,
        value,
      });
    });
    tracks.set(key, points);
  }
}

function sortedNumericTrack(points: NumericTrackPoint[]) {
  return [...points].sort((left, right) => left.time - right.time);
}

function sortedColorTrack(points: ColorTrackPoint[]) {
  return [...points].sort((left, right) => left.time - right.time);
}

function interpolateNumericTrack(
  points: NumericTrackPoint[],
  time: number,
): number {
  const sorted = sortedNumericTrack(points);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1 || time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (time < start.time || time > end.time) continue;
    const duration = end.time - start.time;
    if (duration <= 0) return end.value;
    const progress = easeAnimationProgress(
      (time - start.time) / duration,
      start.ease,
    );
    return lerp(start.value, end.value, progress);
  }

  return last.value;
}

function evaluateColorTrack(points: ColorTrackPoint[], time: number): string {
  const sorted = sortedColorTrack(points);
  if (sorted.length === 0) return "";
  let value = sorted[0].value;
  for (const point of sorted) {
    if (point.time > time) break;
    value = point.value;
  }
  return value;
}

export function evaluateLayerAnimation(
  animation: LayerAnimation,
  time: number,
): RenderStyle {
  const progress = getLayerAnimationProgress(animation, time);
  const { keyframes } = animation;
  const style: RenderStyle = {};
  const transforms: string[] = [];

  for (const key of NUMERIC_KEYFRAME_KEYS) {
    const values = keyframes[key as keyof typeof keyframes];
    if (!values || !Array.isArray(values) || values.length < 2) continue;

    const value = interpolateKeyframeValues(
      values as readonly number[],
      progress,
    );
    const transformName = TRANSFORM_MAP[key];

    if (transformName) {
      const unit = TRANSFORM_UNITS[key];
      const formatted =
        key === "scale" || key === "scaleX" || key === "scaleY"
          ? value.toFixed(4)
          : Math.round(value);
      transforms.push(`${transformName}(${formatted}${unit})`);
    } else if (key === "opacity") {
      style.opacity = value;
    } else if (key === "blur") {
      style.filter = `blur(${Math.max(0, value).toFixed(2)}px)`;
    } else if (key === "width" || key === "height") {
      style[key] = Math.max(0, value);
    }
  }

  if (
    keyframes.transformPerspective &&
    Array.isArray(keyframes.transformPerspective) &&
    keyframes.transformPerspective.length >= 2
  ) {
    const value = interpolateKeyframeValues(
      keyframes.transformPerspective as readonly number[],
      progress,
    );
    transforms.unshift(`perspective(${Math.round(value)}px)`);
  }

  for (const key of COLOR_KEYFRAME_KEYS) {
    const values = keyframes[key as keyof typeof keyframes];
    if (!values || !Array.isArray(values) || values.length < 2) continue;

    const index = Math.min(
      Math.floor(progress * (values.length - 1)),
      values.length - 1,
    );
    style[key] = values[index] as string;
  }

  if (transforms.length > 0) {
    style.transform = transforms.join(" ");
  }

  return style;
}

export function getLayerAnimationsTranslation(
  animations: LayerAnimation[] | undefined,
  time: number,
): Point {
  const point = { x: 0, y: 0 };
  for (const animation of animations ?? []) {
    if (animation.enabled === false) continue;
    const progress = getLayerAnimationProgress(animation, time);
    if (animation.keyframes.x)
      point.x += interpolateKeyframeValues(
        animation.keyframes.x as readonly number[],
        progress,
      );
    if (animation.keyframes.y)
      point.y += interpolateKeyframeValues(
        animation.keyframes.y as readonly number[],
        progress,
      );
  }
  return point;
}

export function getLayerAnimationProgress(
  animation: LayerAnimation,
  time: number,
): number {
  const {
    delay = 0,
    duration,
    repeat,
    repeatType = "loop",
    repeatDelay = 0,
  } = animation.options;

  if (time < delay) return 0;

  const elapsed = time - delay;

  if (duration <= 0) return easeAnimationProgress(1, animation.options.ease);

  if (repeat !== undefined) {
    const cycleDuration = duration + repeatDelay;

    if (repeat !== Infinity) {
      const totalDuration = duration + repeat * cycleDuration;
      if (elapsed >= totalDuration) {
        return easeAnimationProgress(
          repeatType === "reverse" || repeatType === "mirror"
            ? repeat % 2 === 0
              ? 0
              : 1
            : 1,
          animation.options.ease,
        );
      }
    }

    const cycleElapsed = elapsed % cycleDuration;

    if (cycleElapsed >= duration) {
      return easeAnimationProgress(1, animation.options.ease);
    }

    const rawProgress = cycleElapsed / duration;
    const cycleIndex = Math.floor(elapsed / cycleDuration);
    let progress: number;

    if (repeatType === "reverse" || repeatType === "mirror") {
      progress = cycleIndex % 2 === 1 ? 1 - rawProgress : rawProgress;
    } else {
      progress = rawProgress;
    }

    return easeAnimationProgress(clamp(progress, 0, 1), animation.options.ease);
  }

  const rawProgress = clamp(elapsed / duration, 0, 1);
  return easeAnimationProgress(rawProgress, animation.options.ease);
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
