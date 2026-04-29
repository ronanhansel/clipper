import type { MotionEffectPackage } from "../../../types";
import { createMotionBlock } from "../helpers";

export const panMotionLogic = {
  createDefaultBlock: (input) => createMotionBlock(input, "clipper.motion.pan", { position: input.position }),
} as const satisfies Pick<MotionEffectPackage, "createDefaultBlock">;
