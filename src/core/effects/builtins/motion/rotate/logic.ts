import type { MotionEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";
import { createMotionBlock } from "../helpers";

export const rotateMotionLogic = {
  graph: {
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    defaultParams: { rotation: 15 },
    paramControls: [
      { key: "rotation", label: "Rotation", type: "number", defaultValue: 15 },
    ],
    runtimeAdapter: ({ effect }) => ({
      keyframes: {
        rotate: [
          0,
          numberParam(effect.params.rotation ?? effect.params.rotate, 0),
        ],
      },
    }),
  },
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.rotate", {
      position: { x: 0, y: 0 },
      rotation: 15,
    }),
} as const satisfies Pick<MotionEffectPackage, "graph" | "createDefaultBlock">;
