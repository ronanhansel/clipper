import type { TransitionEffectPackage } from "../../../types";

export const scaleFadeTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ layer, progress }) => {
    const t = Math.max(0, Math.min(1, progress));
    const scaleOut = getScaleParam(layer.effect.params?.scaleOut, 1.08);
    const scaleIn = getScaleParam(layer.effect.params?.scaleIn, 1.08);
    return {
      aStyle: { opacity: 1 - t, transform: `scale(${1 + t * (scaleOut - 1)})` },
      bStyle: {
        opacity: t,
        transform: `scale(${scaleIn - t * (scaleIn - 1)})`,
      },
    };
  },
};

function getScaleParam(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0.5, Math.min(2, value))
    : fallback;
}
