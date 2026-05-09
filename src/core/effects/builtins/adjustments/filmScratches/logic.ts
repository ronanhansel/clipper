import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const filmScratchesLogic = {
  applyVisualStyle: ({ sceneTime, layer }) => {
    const intensity = getClampedParam(layer, "intensity", 0.24, 0, 1);
    const density = getClampedParam(layer, "density", 1, 0.25, 3);
    const drift = getClampedParam(layer, "drift", 1, 0, 4);
    const jitter = Math.round(Math.sin(sceneTime * 37) * 18 * drift);
    const spacing = Math.max(72, 180 / density);

    return {
      overlays: [
        {
          id: `${layer.id}:film-scratches`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: [
              "repeating-linear-gradient(90deg, transparent 0 92px, rgba(255,255,255,0.78) 94px 95px, transparent 97px 178px)",
              "repeating-linear-gradient(90deg, transparent 0 154px, rgba(0,0,0,0.34) 157px 158px, transparent 160px 246px)",
            ].join(","),
            backgroundPosition: `${jitter}px 0, ${-jitter * 1.7}px 0`,
            backgroundSize: `${spacing}px 100%, ${spacing * 1.45}px 100%`,
            mixBlendMode: "screen",
            opacity: intensity,
          },
        },
      ],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
