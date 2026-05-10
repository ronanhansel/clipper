import type { AnimationDefinition } from "../types";

export const blurAnimation: AnimationDefinition = {
  property: "blur",
  label: "Blur",
  category: "Effect",
  fieldGroups: [
    {
      id: "parameters",
      columns: 2,
      fields: [
        {
          key: "from",
          label: "from",
          defaultValue: "0",
          min: 0,
          max: 200,
          step: 1,
        },
        {
          key: "to",
          label: "to",
          defaultValue: "12",
          min: 0,
          max: 200,
          step: 1,
        },
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
