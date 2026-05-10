import type { TransitionEffectPackage } from "../../../types";

export const zoomInTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ sceneTime, layer }) => {
    const t = getLinearProgress(sceneTime, layer.start, layer.duration);
    const direction = layer.effect.params?.direction === "out" ? "out" : "in";
    const zoom = getNumberParam(layer.effect.params?.zoom, 1.72, 1, 3);
    const cutPoint = getNumberParam(
      layer.effect.params?.cutPoint,
      0.88,
      0.4,
      0.95,
    );
    const fadeSoftness = getNumberParam(
      layer.effect.params?.fadeSoftness,
      0,
      0,
      0.5,
    );
    const backgroundColor = getColorParam(
      layer.effect.params?.backgroundColor,
      "#000000",
    );
    const zoomT = easeProgress(t, layer.effect.params?.ease ?? "easeInOut");
    const totalScale = 1 + zoomT * (zoom - 1);
    const exitOpacity =
      fadeSoftness > 0
        ? 1 - smoothstep(cutPoint - fadeSoftness, cutPoint, t)
        : t < cutPoint
          ? 1
          : 0;
    const enterOpacity =
      fadeSoftness > 0
        ? smoothstep(cutPoint, Math.min(1, cutPoint + fadeSoftness), t)
        : t < cutPoint
          ? 0
          : 1;
    const exitScale = direction === "in" ? totalScale : 1 / totalScale;
    const enterScale =
      direction === "in" ? totalScale / zoom : zoom / totalScale;

    return {
      frameStyle: {
        backgroundColor,
      },
      aStyle: {
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
        transformOrigin: "50% 50%",
      },
      bStyle: {
        opacity: enterOpacity,
        transform: `scale(${enterScale})`,
        transformOrigin: "50% 50%",
      },
    };
  },
};

function getNumberParam(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

function getColorParam(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getLinearProgress(sceneTime: number, start: number, duration: number) {
  const finishTime = Math.max(duration, 0.0001);
  return clamp((sceneTime - start) / finishTime, 0, 1);
}

function easeProgress(value: number, ease: unknown) {
  if (ease === "easeOut" || ease === "circOut")
    return 1 - Math.pow(1 - value, 3);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }
  if (ease === "inAndOut") return inAndOutEase(value);
  if (ease === "expoIn") return value <= 0 ? 0 : Math.pow(2, 10 * value - 10);
  if (ease === "expoOut") return value >= 1 ? 1 : 1 - Math.pow(2, -10 * value);
  if (ease === "backOut") {
    return (
      1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
    );
  }
  return value;
}

function inAndOutEase(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value < 0.5
    ? Math.pow(2, 20 * value - 10) / 2
    : (2 - Math.pow(2, -20 * value + 10)) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge1 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
