import type { AnimationDefinition } from "../types";

export const positionAnimation: AnimationDefinition = {
  property: "position",
  label: "Position",
  category: "Effect",
  popover: { width: 238, height: 164 },
  fieldGroups: [
    {
      id: "x",
      label: "X",
      columns: 2,
      fields: [
        {
          key: "x from",
          label: "from",
          defaultValue: "0",
          min: -10000,
          max: 10000,
          step: 1,
        },
        {
          key: "x to",
          label: "to",
          defaultValue: "0",
          min: -10000,
          max: 10000,
          step: 1,
        },
      ],
    },
    {
      id: "y",
      label: "Y",
      columns: 2,
      fields: [
        {
          key: "y from",
          label: "from",
          defaultValue: "0",
          min: -10000,
          max: 10000,
          step: 1,
        },
        {
          key: "y to",
          label: "to",
          defaultValue: "0",
          min: -10000,
          max: 10000,
          step: 1,
        },
      ],
    },
  ],
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
};
