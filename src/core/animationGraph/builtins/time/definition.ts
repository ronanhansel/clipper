import type {
  AnimationController,
  AnimationGraphNodeDefinition,
} from "../../types";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  isAnimationStream,
  readEase,
  readNumber,
  readOptionalNumber,
  readString,
} from "../helpers";

export const timeNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "time",
  label: "Time",
  category: "control",
  controls: [
    {
      id: "timing",
      fields: [
        {
          key: "delay",
          label: "delay",
          type: "number",
          defaultValue: 0,
          min: 0,
          max: 120,
          step: 0.1,
          unit: "s",
        },
        {
          key: "duration",
          label: "duration",
          type: "number",
          defaultValue: 1,
          min: 0.01,
          max: 120,
          step: 0.1,
          unit: "s",
        },
        {
          key: "ease",
          label: "ease",
          defaultValue: "linear",
          options: [
            { value: "linear", label: "Linear" },
            { value: "easeIn", label: "Ease in" },
            { value: "easeOut", label: "Ease out" },
            { value: "easeInOut", label: "Ease in-out" },
            { value: "inAndOut", label: "In and out" },
            { value: "expoIn", label: "Expo in" },
            { value: "expoOut", label: "Expo out" },
            { value: "circOut", label: "Circ out" },
            { value: "backOut", label: "Back out" },
          ],
        },
        {
          key: "schedule",
          label: "schedule",
          defaultValue: "relative",
          options: [
            { value: "relative", label: "Relative" },
            { value: "absolute", label: "Absolute" },
          ],
        },
      ],
    },
  ],
  getPorts: () => [
    animationInputPort("in", "In"),
    animationOutputPort("out", "Out"),
  ],
  createDefaultConfig: () => ({
    delay: 0,
    duration: 1,
    ease: "linear",
    schedule: "relative",
  }),
  normalizeConfig: (config) =>
    typeof config === "object" && config !== null
      ? normalizeTimeConfig(config)
      : {},
  execute: (input) => {
    const patch = timeNodeDefinition.normalizeConfig(
      input.node.config,
    ) as Partial<AnimationController>;
    const streams = (input.inputs.get("in") ?? [])
      .filter(isAnimationStream)
      .map((stream, index) => {
        const next = cloneAnimationStream(
          stream as never,
          `${input.node.id}:out:${index}`,
        );
        next.controller = { ...next.controller, ...patch };
        return next;
      });
    return { outputs: new Map([["out", streams]]) };
  },
};

function normalizeTimeConfig(config: object): Partial<AnimationController> {
  const repeat = readOptionalNumber(config, "repeat");
  return {
    delay: readNumber(config, "delay", 0),
    duration: readNumber(config, "duration", 1),
    ease: readEase(config, "ease", "linear"),
    schedule:
      readString(config, "schedule", "relative") === "absolute"
        ? "absolute"
        : "relative",
    ...(repeat
      ? { repeat: { count: repeat, delay: 0, mode: readRepeatMode(config) } }
      : {}),
  };
}

function readRepeatMode(config: object): "loop" | "reverse" | "mirror" {
  const value = readString(config, "repeatType", "loop");
  return value === "reverse" || value === "mirror" ? value : "loop";
}
