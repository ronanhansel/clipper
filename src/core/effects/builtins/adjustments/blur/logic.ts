import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const blurLogic = {
  applyVisualStyle: ({ layer }) => ({
    filter: `blur(${getClampedParam(layer, "radius", 6, 0, 20)}px)`,
  }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
