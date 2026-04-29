import type { MotionEffectPackage } from "../../../types";
import { createMotionBlock } from "../helpers";

export const perspectiveMotionLogic = {
  createDefaultBlock: (input) => createMotionBlock(input, "clipper.motion.perspective", { position: { x: 0, y: 0 }, perspective: { z: 0, rotateX: 8, rotateY: 0 } }),
} as const satisfies Pick<MotionEffectPackage, "createDefaultBlock">;
