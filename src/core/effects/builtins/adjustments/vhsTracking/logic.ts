import { createVhsTrackingPostProcessPass } from "../../../postprocess/vhsTracking";
import type { AdjustmentEffectPackage } from "../../../types";

export const vhsTrackingLogic = {
  requiresLiveDomPostProcessSource: true,
  collectPostProcessPasses: ({ layer, sceneTime }) => [
    createVhsTrackingPostProcessPass({ layer, sceneTime }),
  ],
} as const satisfies Partial<
  Pick<
    AdjustmentEffectPackage,
    "collectPostProcessPasses" | "requiresLiveDomPostProcessSource"
  >
>;
