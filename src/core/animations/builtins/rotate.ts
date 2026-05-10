import type { AnimationDefinition } from "../types";

export const rotateAnimation: AnimationDefinition = {
  property: "rotate",
  label: "Rotate",
  category: "Effect",
  fieldGroups: [
    {
      id: "parameters",
      columns: 2,
      fields: [
        { key: "from", label: "from", defaultValue: "0" },
        { key: "to", label: "to", defaultValue: "0" },
      ],
    },
  ],
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
};
