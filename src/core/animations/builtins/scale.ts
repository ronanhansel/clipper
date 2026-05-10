import type { AnimationDefinition } from "../types";

export const scaleAnimation: AnimationDefinition = {
  property: "scale",
  label: "Scale",
  category: "Effect",
  fieldGroups: [
    {
      id: "parameters",
      columns: 2,
      fields: [
        { key: "from", label: "from", defaultValue: "1" },
        { key: "to", label: "to", defaultValue: "1" },
      ],
    },
  ],
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
};
