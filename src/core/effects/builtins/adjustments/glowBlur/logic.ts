import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const glowBlurLogic = {
  applyVisualStyle: ({ layer }) => {
    const amount = getClampedParam(layer, "amount", 10, 0, 24);
    const brightness = getClampedParam(layer, "brightness", 1.1, 0.8, 2);
    const opacity = getClampedParam(layer, "opacity", 0.65, 0, 1);
    return {
      overlays: [{
        id: `${layer.id}:glow-blur`,
        target: getOverlayTarget(layer),
        style: {
          opacity,
          backdropFilter: `blur(${amount}px) brightness(${brightness}) saturate(1.15)`,
          WebkitBackdropFilter: `blur(${amount}px) brightness(${brightness}) saturate(1.15)`,
        },
      }],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
