import type { AnimationGraphNodePackage } from "../../types";
import { registerAnimationGraphConnectionRule } from "../../ruleRegistry";
import { readString } from "../helpers";

export const groupNodeLogic = {
  normalizeConfig: (config) => ({ groupId: readString(config, "groupId", "") }),
} as const satisfies Partial<AnimationGraphNodePackage>;

registerAnimationGraphConnectionRule(
  "registeredGroupOutput",
  ({ from, to }) => {
    if (to.kind === "group") return to.details?.registered === "true";
    if (from.kind === "group") return from.details?.registered === "true";
    return true;
  },
);
