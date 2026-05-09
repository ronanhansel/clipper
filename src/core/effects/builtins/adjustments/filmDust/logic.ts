import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget } from "../helpers";

export const filmDustLogic = {
  applyVisualStyle: ({ sceneTime, layer }) => {
    const intensity = getClampedParam(layer, "intensity", 0.28, 0, 1);
    const density = getClampedParam(layer, "density", 1, 0.25, 3);
    const drift = getClampedParam(layer, "drift", 1, 0, 4);
    const offsetX = Math.round(sceneTime * 41 * drift) % 97;
    const offsetY = Math.round(sceneTime * 67 * drift) % 113;
    const scale = Math.max(1, 38 / density);

    return {
      overlays: [
        {
          id: `${layer.id}:film-dust`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: [
              "radial-gradient(circle at 14% 18%, rgba(255,255,255,0.95) 0 0.9px, transparent 1.4px)",
              "radial-gradient(circle at 72% 36%, rgba(255,255,255,0.75) 0 0.7px, transparent 1.2px)",
              "radial-gradient(circle at 42% 78%, rgba(0,0,0,0.5) 0 0.8px, transparent 1.5px)",
            ].join(","),
            backgroundPosition: `${offsetX}px ${offsetY}px, ${-offsetY}px ${offsetX}px, ${offsetY / 2}px ${-offsetX / 2}px`,
            backgroundSize: `${scale}px ${scale}px, ${scale * 1.7}px ${scale * 1.7}px, ${scale * 2.3}px ${scale * 2.3}px`,
            mixBlendMode: "screen",
            opacity: intensity,
          },
        },
      ],
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;
