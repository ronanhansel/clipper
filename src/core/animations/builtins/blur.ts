import type { AnimationDefinition } from "../types";

export const blurAnimation: AnimationDefinition = {
  property: "blur",
  label: "Blur",
  category: "Effect",
  fieldGroups: [
    {
      id: "parameters",
      fields: [
        { key: "from", label: "from", defaultValue: "0" },
        { key: "to", label: "to", defaultValue: "12" },
      ],
    },
  ],
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
};
