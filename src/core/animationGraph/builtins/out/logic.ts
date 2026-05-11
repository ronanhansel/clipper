import type { AnimationGraphNodePackage } from "../../types";

export const outNodeLogic = {
  normalizeConfig: () => ({}),
} as const satisfies Partial<AnimationGraphNodePackage>;
