import { createLightLeakBandsTransitionPostProcessPass } from "../../../postprocess/lightLeakBandsTransition";
import type { TransitionEffectPackage } from "../../../types";

export const lightLeakBandsTransitionLogic: Pick<
  TransitionEffectPackage,
  "renderSequence"
> = {
  renderSequence: ({ layer, progress }) => {
    const t = Math.max(0, Math.min(1, progress));
    return {
      aStyle: { opacity: t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38 },
      bStyle: { opacity: t < 0.38 ? t / 0.38 : 1 },
      postProcessPasses: [
        createLightLeakBandsTransitionPostProcessPass({ layer, progress: t }),
      ],
    };
  },
};
