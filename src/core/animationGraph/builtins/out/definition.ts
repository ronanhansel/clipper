import type { AnimationGraphNodeDefinition } from "../../types";
import { animationInputPort, isAnimationStream } from "../helpers";

export const outNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "out",
  label: "Out",
  category: "control",
  getPorts: () => [
    animationInputPort("in", "In", undefined, undefined, "multi"),
  ],
  createDefaultConfig: () => ({}),
  normalizeConfig: () => ({}),
  execute: (input) => ({
    outputs: new Map([
      ["out", (input.inputs.get("in") ?? []).filter(isAnimationStream)],
    ]),
  }),
};
