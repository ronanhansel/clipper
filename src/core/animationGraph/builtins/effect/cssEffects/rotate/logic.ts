import type { AnimationLogic } from "../types";

export const rotateAnimationLogic = {
  getDetails: (animation) => {
    const rotate = animation.keyframes.rotate;
    if (!rotate) return null;
    return {
      property: "rotate",
      from: String(rotate[0]),
      to: String(rotate[rotate.length - 1]),
    };
  },
  materializeKeyframes: ({ readNumber }) => ({
    rotate: [readNumber("from", 0), readNumber("to", 0)],
  }),
} satisfies AnimationLogic;
