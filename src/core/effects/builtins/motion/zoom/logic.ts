import type { MotionEffectPackage } from "../../../types";
import { createMotionBlock } from "../helpers";

export const zoomMotionLogic = {
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.zoom", {
      focus: input.focus,
      scale: 1.8,
    }),
} as const satisfies Pick<MotionEffectPackage, "createDefaultBlock">;
