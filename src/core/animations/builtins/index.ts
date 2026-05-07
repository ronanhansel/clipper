import type { AnimationDefinition } from "../types";
import { opacityAnimation } from "./opacity";
import { positionAnimation } from "./position";

export { opacityAnimation } from "./opacity";
export { positionAnimation } from "./position";

export const builtInAnimationDefinitions = [
  positionAnimation,
  opacityAnimation,
] as const satisfies readonly AnimationDefinition[];
