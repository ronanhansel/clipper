import type { AnimationGraphNodePackage } from "../../types";
import { readString } from "../helpers";

export const sourceNodeLogic = {
  normalizeConfig: (config) => ({
    objectId: readString(config, "objectId", ""),
  }),
} as const satisfies Partial<AnimationGraphNodePackage>;
