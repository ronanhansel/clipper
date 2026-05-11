import type {
  AnimationGraphNodeDefinition,
  StructureStream,
} from "../../types";
import {
  animationOutputPort,
  defaultAnimationController,
  readString,
} from "../helpers";

export const sourceNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "source",
  label: "Source",
  category: "control",
  controls: [
    {
      id: "source",
      fields: [{ key: "objectId", label: "object", defaultValue: "" }],
    },
  ],
  getPorts: () => [animationOutputPort("out", "Out")],
  createDefaultConfig: (context) => ({
    objectId: context.sourceObjectId ?? "",
  }),
  normalizeConfig: (config) =>
    typeof config === "object" && config !== null
      ? { objectId: readString(config, "objectId", "") }
      : { objectId: "" },
  execute: (input, context) => {
    const config = sourceNodeDefinition.normalizeConfig(input.node.config) as {
      objectId: string;
    };
    const objectId = config.objectId || context.graph.sourceObjectId;
    const objectType = context.sourceObject?.type;
    const structure: StructureStream =
      objectType === "text"
        ? { kind: "text", objectId }
        : objectType === "rect" || objectType === "svg"
          ? { kind: "shape", objectId }
          : { kind: "object", objectId };
    return {
      outputs: new Map([
        [
          "out",
          [
            {
              id: `${input.node.id}:out:${objectId}`,
              structure,
              controller: { ...defaultAnimationController },
              effects: [],
            },
          ],
        ],
      ]),
    };
  },
};
