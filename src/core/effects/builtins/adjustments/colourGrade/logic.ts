import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam } from "../helpers";

export const colourGradeLogic = {
  applyVisualStyle: ({ layer }) => ({
    filter: [
      `brightness(${offsetPercentToCssMultiplier(getClampedParam(layer, "brightness", 0, -100, 100))})`,
      `contrast(${offsetPercentToCssMultiplier(getClampedParam(layer, "contrast", 0, -100, 100))})`,
      `saturate(${offsetPercentToCssMultiplier(getClampedParam(layer, "saturation", 0, -100, 100))})`,
      `hue-rotate(${getClampedParam(layer, "hue", 0, -180, 180)}deg)`,
    ].join(" "),
  }),
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;

function offsetPercentToCssMultiplier(value: number) {
  return (100 + value) / 100;
}
