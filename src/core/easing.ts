import type { MotionEase } from "./types";

export type EaseValue = MotionEase | readonly [number, number, number, number];

export const MOTION_EASES: readonly MotionEase[] = [
  "linear",
  "snap",
  "easeIn",
  "easeOut",
  "easeInOut",
  "inAndOut",
  "expoIn",
  "expoOut",
  "circOut",
  "backOut",
];

export const motionEasePresets: { value: MotionEase; label: string }[] = [
  { value: "snap", label: "Snap" },
  { value: "linear", label: "Linear" },
  { value: "easeIn", label: "Ease in" },
  { value: "easeOut", label: "Ease out" },
  { value: "easeInOut", label: "Ease in-out" },
  { value: "inAndOut", label: "In and out" },
  { value: "expoIn", label: "Expo in" },
  { value: "expoOut", label: "Expo out" },
  { value: "circOut", label: "Circ out" },
  { value: "backOut", label: "Back out" },
];

export const easeCurvePoints: Record<
  MotionEase,
  [number, number, number, number]
> = {
  linear: [0, 0, 1, 1],
  snap: [1, 0, 1, 0],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  inAndOut: [0.76, 0, 0.24, 1],
  expoIn: [0.95, 0.05, 0.795, 0.035],
  expoOut: [0.19, 1, 0.22, 1],
  circOut: [0.075, 0.82, 0.165, 1],
  backOut: [0.34, 1.56, 0.64, 1],
};

export function getEaseControlPoints(
  ease: EaseValue | undefined,
): readonly [number, number, number, number] {
  if (ease && typeof ease !== "string" && ease.length === 4) return ease;
  if (typeof ease === "string" && ease in easeCurvePoints) {
    return easeCurvePoints[ease as MotionEase];
  }
  return easeCurvePoints.linear;
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

function expoOut(value: number): number {
  if (value >= 1) return 1;
  return 1 - Math.pow(2, -10 * value);
}

function inAndOutEase(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value < 0.5
    ? Math.pow(2, 20 * value - 10) / 2
    : (2 - Math.pow(2, -20 * value + 10)) / 2;
}

function backOut(value: number): number {
  return (
    1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
  );
}

export function cubicBezierEase(
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

export function easeProgress(progress: number, ease?: EaseValue): number {
  if (ease === undefined || ease === "linear") return progress;
  if (Array.isArray(ease) && ease.length === 4) {
    return cubicBezierEase(progress, ease[0], ease[1], ease[2], ease[3]);
  }
  switch (ease as MotionEase) {
    case "linear":
      return progress;
    case "snap":
      return progress >= 1 ? 1 : 0;
    case "easeIn":
      return progress * progress * progress;
    case "easeOut":
      return easeOutCubic(progress);
    case "easeInOut":
      return easeInOutCubic(progress);
    case "inAndOut":
      return inAndOutEase(progress);
    case "expoIn":
      return expoIn(progress);
    case "expoOut":
      return expoOut(progress);
    case "circOut":
      return cubicBezierEase(progress, 0.075, 0.82, 0.165, 1);
    case "backOut":
      return backOut(progress);
  }
  return progress;
}
