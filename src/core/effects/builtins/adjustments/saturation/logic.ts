import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const saturationLogic = {
  applyVisualStyle: ({ layer }) => ({ filter: `saturate(${getClampedParam(layer, "amount", 1.25, 0, 3)})` }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
