import type { AnimationLogic } from "../types";

export const scaleAnimationLogic = {
  getDetails: (animation) => {
    const scale = animation.keyframes.scale;
    if (!scale) return null;
    return {
      property: "scale",
      from: String(scale[0]),
      to: String(scale[scale.length - 1]),
    };
  },
  materializeKeyframes: ({ readNumber }) => ({
    scale: [readNumber("from", 1), readNumber("to", 1)],
  }),
} satisfies AnimationLogic;
