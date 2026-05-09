import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const lightLeakLogic = {
  applyVisualStyle: ({ sceneTime, layer }) => {
    const intensity = getClampedParam(layer, "intensity", 0.34, 0, 1);
    const warmth = getClampedParam(layer, "warmth", 1, 0, 2);
    const drift = getClampedParam(layer, "drift", 0.8, 0, 4);
    const focusX = getClampedParam(layer, "focusX", 12, 0, 100);
    const focusY = getClampedParam(layer, "focusY", 28, 0, 100);
    const centerX = focusX + Math.sin(sceneTime * 0.8 * drift) * 8 * drift;
    const centerY = focusY + Math.cos(sceneTime * 0.6 * drift) * 18 * drift;
    const red = Math.round(255);
    const green = Math.round(105 + warmth * 45);
    const blue = Math.round(36 + warmth * 26);

    return {
      overlays: [
        {
          id: `${layer.id}:light-leak`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: [
              `radial-gradient(circle at ${centerX}% ${centerY}%, rgba(${red},${green},${blue},0.95) 0, rgba(${red},${green},${blue},0.42) 18%, transparent 46%)`,
              "linear-gradient(90deg, rgba(255,226,143,0.58), transparent 28%)",
            ].join(","),
            mixBlendMode: "screen",
            opacity: intensity,
          },
        },
      ],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
