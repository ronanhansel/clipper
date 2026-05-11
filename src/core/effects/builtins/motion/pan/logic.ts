import type { MotionEffectPackage } from "../../../types";
import { numberParam } from "../../graphRuntime";
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
  graph: {
    label: "Position",
    acceptedStructureKinds: ["text", "richText", "shape", "object"],
    defaultParams: { x: 0, y: 0 },
    paramControls: [
      { key: "x", label: "X", type: "number", defaultValue: 0 },
      { key: "y", label: "Y", type: "number", defaultValue: 0 },
    ],
    runtimeAdapter: ({ effect }) => ({
      keyframes: {
        x: [0, numberParam(effect.params.x, 0)],
        y: [0, numberParam(effect.params.y, 0)],
      },
    }),
  },
  createDefaultBlock: (input) =>
    createMotionBlock(input, "clipper.motion.pan", {
      position: input.position,
    }),
  mendTransitionOptions: panMendTransitionOptions,
} as const satisfies Pick<
  MotionEffectPackage,
  "graph" | "createDefaultBlock" | "mendTransitionOptions"
>;
