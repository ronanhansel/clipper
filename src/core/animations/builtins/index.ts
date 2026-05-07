import type { AnimationDefinition } from "../types";
import { opacityAnimation } from "./opacity";
import { positionAnimation } from "./position";
import { rotateAnimation } from "./rotate";
import { scaleAnimation } from "./scale";

export { opacityAnimation } from "./opacity";
export { positionAnimation } from "./position";
export { rotateAnimation } from "./rotate";
export { scaleAnimation } from "./scale";

export const builtInAnimationDefinitions = [
  positionAnimation,
  opacityAnimation,
  scaleAnimation,
  rotateAnimation,
] as const satisfies readonly AnimationDefinition[];
