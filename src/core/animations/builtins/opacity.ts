import type { AnimationDefinition } from "../types";

export const opacityAnimation: AnimationDefinition = {
  property: "opacity",
  label: "Opacity",
  category: "Effect",
  fieldGroups: [
    {
      id: "parameters",
      columns: 2,
      fields: [
        { key: "from", label: "from", defaultValue: "0" },
        { key: "to", label: "to", defaultValue: "1" },
      ],
    },
  ],
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
};
