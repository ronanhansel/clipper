import type { AdjustmentEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";

export const opacityLogic = {
  graph: {
    label: "Opacity",
    editorAliases: ["opacity"],
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    defaultParams: { from: 1, to: 1 },
    paramControls: [
      {
        key: "from",
        label: "From",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 1,
      },
      {
        key: "to",
        label: "To",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 1,
      },
    ],
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
