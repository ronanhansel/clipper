import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const pixelBlurLogic = {
  applyVisualStyle: ({ layer }) => {
    const amount = getClampedParam(layer, "amount", 6, 0, 18);
    const contrast = getClampedParam(layer, "contrast", 1.08, 0.8, 2);
    return {
      overlays: [
        {
          id: `${layer.id}:pixel-blur`,
          target: getOverlayTarget(layer),
          style: {
            backdropFilter: `blur(${amount}px) contrast(${contrast})`,
            WebkitBackdropFilter: `blur(${amount}px) contrast(${contrast})`,
            imageRendering: "pixelated",
          },
        },
      ],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
