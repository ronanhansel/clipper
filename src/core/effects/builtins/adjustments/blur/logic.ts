import type { AdjustmentEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";
import { getClampedParam } from "../helpers";

export const blurLogic = {
  graph: {
    label: "Blur",
    editorAliases: ["blur"],
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    defaultParams: { radius: 6 },
    paramControls: [
      {
        key: "radius",
        label: "Radius",
        type: "number",
        min: 0,
        max: 20,
        step: 0.1,
        defaultValue: 6,
      },
    ],
    runtimeAdapter: ({ effect }) => ({
      keyframes: { blur: [0, numberParam(effect.params.radius, 0)] },
    }),
  },
  applyVisualStyle: ({ layer }) => ({
    filter: `blur(${getClampedParam(layer, "radius", 6, 0, 20)}px)`,
  }),
} as const satisfies Partial<AdjustmentEffectPackage>;
