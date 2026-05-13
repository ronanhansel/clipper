import type { AdjustmentEffectPackage } from "../../../types";

export const opacityLogic = {
  applyVisualStyle: ({ layer }) => {
    const opacity = Number(
      layer.effect.params?.to ?? layer.effect.params?.from ?? 1,
    );
    return { overlays: [{ id: "opacity", style: { opacity } }] };
  },
} as const satisfies Partial<AdjustmentEffectPackage>;
