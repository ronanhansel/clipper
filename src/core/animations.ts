import type { LayerAnimation } from "./types";
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

const COLOR_KEYFRAME_KEYS = ["color", "backgroundColor"];

const NUMERIC_KEYFRAME_KEYS = [
  "opacity",
  "x",
  "y",
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
];

export function evaluateLayerAnimations(animations: LayerAnimation[], time: number): RenderStyle {
  const combined: RenderStyle = {};

  for (const animation of animations) {
    if (animation.enabled === false) continue;

    const style = evaluateLayerAnimation(animation, time);

    for (const key in style) {
      if (key === "transform" && combined.transform !== undefined && style.transform !== undefined) {
        combined.transform = `${combined.transform} ${style.transform}`;
      } else if (style[key] !== undefined) {
        combined[key] = style[key];
      }
    }
  }

  return combined;
}

export function evaluateLayerAnimation(animation: LayerAnimation, time: number): RenderStyle {
  const progress = getLayerAnimationProgress(animation, time);
  const { keyframes } = animation;
  const style: RenderStyle = {};
  const transforms: string[] = [];

  for (const key of NUMERIC_KEYFRAME_KEYS) {
    const values = keyframes[key as keyof typeof keyframes];
    if (!values || !Array.isArray(values) || values.length < 2) continue;

    const value = interpolateKeyframeValues(values as readonly number[], progress);
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
    }
  }

  if (keyframes.transformPerspective && Array.isArray(keyframes.transformPerspective) && keyframes.transformPerspective.length >= 2) {
    const value = interpolateKeyframeValues(keyframes.transformPerspective as readonly number[], progress);
    transforms.unshift(`perspective(${Math.round(value)}px)`);
  }

  for (const key of COLOR_KEYFRAME_KEYS) {
    const values = keyframes[key as keyof typeof keyframes];
    if (!values || !Array.isArray(values) || values.length < 2) continue;

    const index = Math.min(Math.floor(progress * (values.length - 1)), values.length - 1);
    style[key] = values[index] as string;
  }

  if (transforms.length > 0) {
    style.transform = transforms.join(" ");
  }

  return style;
}

export function getLayerAnimationProgress(animation: LayerAnimation, time: number): number {
  const { delay = 0, duration, repeat, repeatType = "loop", repeatDelay = 0 } = animation.options;

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

export function interpolateKeyframeValues(keyframes: readonly number[], progress: number): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0];

  const segmentCount = keyframes.length - 1;
  const scaled = clamp(progress, 0, 1) * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const t = scaled - index;

  return lerp(keyframes[index], keyframes[index + 1], t);
}

export function easeAnimationProgress(progress: number, ease?: string | readonly number[]): number {
  if (ease === "linear" || ease === undefined) return progress;
  if (ease === "easeIn") return progress * progress * progress;
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(progress);
  if (ease === "easeInOut") return easeInOutCubic(progress);
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
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function backOut(value: number): number {
  return 1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2);
}

function cubicBezierEase(progress: number, x1: number, y1: number, x2: number, y2: number): number {
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
