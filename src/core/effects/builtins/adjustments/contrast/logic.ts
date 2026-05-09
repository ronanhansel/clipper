import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const contrastLogic = {
  applyVisualStyle: ({ layer }) => ({
    filter: `contrast(${getClampedParam(layer, "amount", 1.2, 0, 3)})`,
  }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
