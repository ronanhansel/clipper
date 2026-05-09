import type { MotionEffectPackage } from "../../../types";
import { createMotionBlock } from "../helpers";

export const rotateMotionLogic = {
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.rotate", {
      position: { x: 0, y: 0 },
      rotation: 15,
    }),
} as const satisfies Pick<MotionEffectPackage, "createDefaultBlock">;
