import { createFilmBurnTransitionPostProcessPass } from "../../../postprocess/filmBurnTransition";
import type { TransitionEffectPackage } from "../../../types";

export const filmBurnTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ layer, progress }) => {
    const t = Math.max(0, Math.min(1, progress));
    return {
      aStyle: { opacity: t < 0.54 ? 1 : 1 - (t - 0.54) / 0.46 },
      bStyle: { opacity: t < 0.46 ? t / 0.46 : 1 },
      postProcessPasses: [
        createFilmBurnTransitionPostProcessPass({ layer, progress: t }),
      ],
    };
  },
};
