import type { AnimationGraphNodePackage } from "../../types";
import { readNumber, readString } from "../helpers";

export const splitNodeLogic = {
  normalizeConfig: (config) => ({
    mode: readSplitMode(config, "mode"),
    pattern: readString(config, "pattern", ""),
    stagger: readNumber(config, "stagger", 0),
    order: readOrder(config, "order"),
    repeatScope: readRepeatScope(config, "repeatScope"),
  }),
} as const satisfies Partial<AnimationGraphNodePackage>;

function readSplitMode(config: object, key: string) {
  const value = readString(config, key, "word");
  return value === "character" || value === "pattern" ? value : "word";
}

function readOrder(config: object, key: string) {
  const value = readString(config, key, "forward");
  return value === "reverse" || value === "center" ? value : "forward";
}

function readRepeatScope(config: object, key: string) {
  return readString(config, key, "sequence") === "item" ? "item" : "sequence";
}
