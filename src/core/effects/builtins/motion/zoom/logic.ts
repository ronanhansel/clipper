import type { MotionEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";
import { createMotionBlock } from "../helpers";

export const zoomMotionLogic = {
  graph: {
    label: "Scale",
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    defaultParams: { scale: 1.8 },
    paramControls: [
      { key: "scale", label: "Scale", type: "number", defaultValue: 1.8 },
    ],
    runtimeAdapter: ({ effect }) => ({
      keyframes: { scale: [1, numberParam(effect.params.scale, 1)] },
    }),
  },
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.zoom", {
      focus: input.focus,
      scale: 1.8,
    }),
} as const satisfies Pick<MotionEffectPackage, "graph" | "createDefaultBlock">;
