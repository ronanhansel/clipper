import type { AnimationLogic } from "../types";

export const blurAnimationLogic = {
  getDetails: (animation) => {
    const blur = animation.keyframes.blur;
    if (!blur) return null;
    return {
      property: "blur",
      from: String(blur[0]),
      to: String(blur[blur.length - 1]),
    };
  },
  materializeKeyframes: ({ readNumber }) => ({
    blur: [readNumber("from", 0), readNumber("to", 12)],
  }),
} satisfies AnimationLogic;
