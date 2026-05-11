import type { AnimationLogic } from "../types";

export const opacityAnimationLogic = {
  getDetails: (animation) => {
    const opacity = animation.keyframes.opacity;
    if (!opacity) return null;
    return {
      property: "opacity",
      from: String(opacity[0]),
      to: String(opacity[opacity.length - 1]),
    };
  },
  materializeKeyframes: ({ readNumber }) => ({
    opacity: [readNumber("from", 0), readNumber("to", 1)],
  }),
} satisfies AnimationLogic;
