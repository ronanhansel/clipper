import type { AnimationDefinition } from "../types";
import { blurAnimation } from "./blur";
import { opacityAnimation } from "./opacity";
import { positionAnimation } from "./position";
import { rotateAnimation } from "./rotate";
import { scaleAnimation } from "./scale";

export { blurAnimation } from "./blur";
export { opacityAnimation } from "./opacity";
export { positionAnimation } from "./position";
export { rotateAnimation } from "./rotate";
export { scaleAnimation } from "./scale";

export const builtInAnimationDefinitions = [
  positionAnimation,
  opacityAnimation,
  blurAnimation,
  scaleAnimation,
  rotateAnimation,
] as const satisfies readonly AnimationDefinition[];
