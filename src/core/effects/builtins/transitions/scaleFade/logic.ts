import type { TransitionEffectPackage } from "../../../types";

export const scaleFadeTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ progress }) => {
    const t = Math.max(0, Math.min(1, progress));
    return {
      aStyle: { opacity: 1 - t, transform: `scale(${1 + t * 0.08})` },
      bStyle: { opacity: t, transform: `scale(${1.08 - t * 0.08})` },
    };
  },
};
