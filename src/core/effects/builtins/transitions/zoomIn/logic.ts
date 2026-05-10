import type { TransitionEffectPackage } from "../../../types";

export const zoomInTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ layer, progress }) => {
    const t = clamp(progress, 0, 1);
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
    const zoomT = easeInCubic(Math.min(t / cutPoint, 1));
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
    const exitScale =
      direction === "in" ? 1 + zoomT * (zoom - 1) : 1 - zoomT * (1 - 1 / zoom);
    const enterScale =
      direction === "in"
        ? 1 + (1 - enterOpacity) * 0.04
        : 1 + (1 - enterOpacity) * (zoom - 1) * 0.18;

    return {
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function easeInCubic(value: number) {
  return value * value * value;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge1 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
