import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const directionalBlurLogic = {
  applyVisualStyle: ({ layer }) => {
    const amount = getClampedParam(layer, "amount", 10, 0, 32);
    const angle = getClampedParam(layer, "angle", 0, -180, 180);
    const opacity = getClampedParam(layer, "opacity", 0.9, 0, 1);
    return {
      overlays: [
        {
          id: `${layer.id}:directional-blur`,
          target: getOverlayTarget(layer),
          style: {
            opacity,
            backdropFilter: `blur(${amount}px)`,
            WebkitBackdropFilter: `blur(${amount}px)`,
            transform: `rotate(${angle}deg) scaleX(1.35)`,
            transformOrigin: "center",
          },
        },
      ],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
