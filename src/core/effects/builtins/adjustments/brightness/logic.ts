import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const brightnessLogic = {
  applyVisualStyle: ({ layer }) => ({
    filter: `brightness(${getClampedParam(layer, "amount", 1.15, 0, 3)})`,
  }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
