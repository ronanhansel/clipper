import type { MotionEffectPackage } from "../../../types";
import { createMotionBlock } from "../helpers";

export const panMendTransitionOptions = [
  {
    key: "motionBlur",
    label: "Motion blur",
    defaultParams: {
      motionBlurStrength: 1,
      motionBlurMax: 24,
      motionBlurWindow: 0.22,
    },
    paramControls: [
      {
        key: "motionBlurStrength",
        label: "Strength",
        type: "number" as const,
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 1,
      },
      {
        key: "motionBlurMax",
        label: "Max blur",
        type: "number" as const,
        min: 1,
        max: 100,
        step: 1,
        defaultValue: 24,
      },
      {
        key: "motionBlurWindow",
        label: "Window",
        type: "number" as const,
        min: 0.01,
        max: 1,
        step: 0.01,
        defaultValue: 0.22,
      },
    ],
  },
] as const;

export const panMotionLogic = {
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.pan", {
      position: input.position,
    }),
  mendTransitionOptions: panMendTransitionOptions,
} as const satisfies Pick<
  MotionEffectPackage,
  "createDefaultBlock" | "mendTransitionOptions"
>;
