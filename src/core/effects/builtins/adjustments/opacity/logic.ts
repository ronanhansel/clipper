import type { AdjustmentEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";

export const opacityLogic = {
  graph: {
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    runtimeAdapter: ({ effect }) => ({
      keyframes: {
        opacity: [
          numberParam(effect.params.from, 1),
          numberParam(effect.params.to ?? effect.params.opacity, 1),
        ],
      },
    }),
  },
  applyVisualStyle: ({ layer }) => {
    const opacity = Number(
      layer.effect.params?.to ?? layer.effect.params?.from ?? 1,
    );
    return { overlays: [{ id: "opacity", style: { opacity } }] };
  },
} as const satisfies Partial<AdjustmentEffectPackage>;
