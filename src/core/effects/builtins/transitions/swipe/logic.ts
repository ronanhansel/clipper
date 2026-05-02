import type { TransitionEffectPackage } from "../../../types";

export const swipeTransitionLogic: Pick<TransitionEffectPackage, "renderSequence"> = {
  renderSequence: ({ progress }) => {
    const t = Math.max(0, Math.min(1, progress));

    return {
      aStyle: { transform: `translate3d(${-t * 100}%, 0, 0)` },
      bStyle: { transform: `translate3d(${(1 - t) * 100}%, 0, 0)` },
    };
  },
};
