import type { TransitionEffectPackage } from "../../../types";

export const fadeTransitionLogic: Pick<TransitionEffectPackage, "renderSequence"> = {
  renderSequence: ({ progress }) => {
    const t = Math.max(0, Math.min(1, progress));
    return {
      aStyle: { opacity: 1 - t },
      bStyle: { opacity: t },
    };
  },
};
