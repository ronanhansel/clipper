import type { AnimationGraphNodePackage } from "../../types";
import {
  readEase,
  readNumber,
  readOptionalNumber,
  readString,
} from "../helpers";

export const timeNodeLogic = {
  normalizeConfig: (config) => ({
    delay: readNumber(config, "delay", 0),
    duration: readNumber(config, "duration", 1),
    ease: readEase(config, "ease", "linear"),
    repeat: readOptionalNumber(config, "repeat"),
    repeatType: readRepeatType(config, "repeatType"),
    schedule: readSchedule(config, "schedule"),
  }),
} as const satisfies Partial<AnimationGraphNodePackage>;

function readRepeatType(config: object, key: string) {
  const value = readString(config, key, "");
  return value === "loop" || value === "reverse" || value === "mirror"
    ? value
    : undefined;
}

function readSchedule(config: object, key: string) {
  return readString(config, key, "relative") === "absolute"
    ? "absolute"
    : "relative";
}
