import type { AdjustmentEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";
import { getClampedParam } from "../helpers";

export const blurLogic = {
  graph: {
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    runtimeAdapter: ({ effect }) => ({
      keyframes: { blur: [0, numberParam(effect.params.radius, 0)] },
    }),
  },
  applyVisualStyle: ({ layer }) => ({
    filter: `blur(${getClampedParam(layer, "radius", 6, 0, 20)}px)`,
  }),
} as const satisfies Partial<AdjustmentEffectPackage>;
