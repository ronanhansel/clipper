import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const hueRotateLogic = {
  applyVisualStyle: ({ layer }) => ({ filter: `hue-rotate(${getClampedParam(layer, "degrees", 30, -180, 180)}deg)` }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
