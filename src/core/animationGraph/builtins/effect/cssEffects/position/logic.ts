import type { AnimationLogic } from "../types";

export const positionAnimationLogic = {
  getDetails: (animation) => {
    const x = animation.keyframes.x;
    const y = animation.keyframes.y;
    if (!x && !y) return null;
    return {
      property: "position",
      "x from": String(x?.[0] ?? 0),
      "x to": String(x?.[x.length - 1] ?? 0),
      "y from": String(y?.[0] ?? 0),
      "y to": String(y?.[y.length - 1] ?? 0),
    };
  },
  materializeKeyframes: ({ readNumber }) => ({
    x: [readNumber("x from", 0), readNumber("x to", 0)],
    y: [readNumber("y from", 0), readNumber("y to", 0)],
  }),
} satisfies AnimationLogic;
