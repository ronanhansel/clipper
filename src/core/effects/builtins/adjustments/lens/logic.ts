import type { AdjustmentEffectPackage } from "../../../types";
import { createLensPostProcessPass } from "../../../postprocess/lens";

export const lensLogic = {
  requiresLiveDomPostProcessSource: true,
  collectPostProcessPasses: ({ layer, frameSize }) => [
    createLensPostProcessPass(layer, frameSize),
  ],
} as const satisfies Partial<
  Pick<
    AdjustmentEffectPackage,
    "collectPostProcessPasses" | "requiresLiveDomPostProcessSource"
  >
>;
