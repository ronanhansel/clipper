import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const vignetteLogic = {
  applyVisualStyle: ({ layer }) => {
    const intensity = getClampedParam(layer, "intensity", 0.42, 0, 1);
    const softness = getClampedParam(layer, "softness", 0.64, 0.2, 1);
    const focusX = getClampedParam(layer, "focusX", 50, 0, 100);
    const focusY = getClampedParam(layer, "focusY", 50, 0, 100);
    const clearStop = Math.round(softness * 62);

    return {
      overlays: [{
        id: `${layer.id}:vignette`,
        target: getOverlayTarget(layer),
        style: {
          backgroundImage: `radial-gradient(ellipse at ${focusX}% ${focusY}%, transparent 0 ${clearStop}%, rgba(0,0,0,0.88) 100%)`,
          mixBlendMode: "multiply",
          opacity: intensity,
        },
      }],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
