import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const radialBlurLogic = {
  applyVisualStyle: ({ layer }) => {
    const amount = getClampedParam(layer, "amount", 10, 0, 28);
    const focusX = getClampedParam(layer, "focusX", 50, 0, 100);
    const focusY = getClampedParam(layer, "focusY", 50, 0, 100);
    const radius = getClampedParam(layer, "radius", 34, 1, 80);
    const softness = getClampedParam(layer, "softness", 22, 0, 40);
    return {
      overlays: [{
        id: `${layer.id}:radial-blur`,
        target: getOverlayTarget(layer),
        style: {
          backdropFilter: `blur(${amount}px)`,
          WebkitBackdropFilter: `blur(${amount}px)`,
          maskImage: `radial-gradient(circle at ${focusX}% ${focusY}%, transparent 0%, transparent ${radius}%, rgba(0, 0, 0, 1) ${Math.min(radius + softness, 100)}%)`,
          WebkitMaskImage: `radial-gradient(circle at ${focusX}% ${focusY}%, transparent 0%, transparent ${radius}%, rgba(0, 0, 0, 1) ${Math.min(radius + softness, 100)}%)`,
        },
      }],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
