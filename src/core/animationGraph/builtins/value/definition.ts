import type {
  AnimationGraphNodeDefinition,
  ValueStreamType,
} from "../../types";
import { valueOutputPort } from "../helpers";

export function createValueNodeDefinition(
  kind: string,
  label: string,
  valueType: ValueStreamType,
  defaultValue: unknown,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "value",
    getPorts: () => [valueOutputPort(valueType)],
    createDefaultConfig: () => ({ value: defaultValue }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null
        ? config
        : { value: defaultValue },
    execute: (input) => ({
      outputs: new Map([
        [
          "value",
          [
            {
              id: `${input.node.id}:value`,
              valueType,
              value:
                typeof input.node.config === "object" &&
                input.node.config !== null &&
                "value" in input.node.config
                  ? input.node.config.value
                  : defaultValue,
            },
          ],
        ],
      ]),
    }),
  };
}

export const valueNodeDefinitions = [
  createValueNodeDefinition("value:string", "String", "string", ""),
  createValueNodeDefinition("value:number", "Number", "number", 0),
  createValueNodeDefinition("value:color", "Color", "color", "#ffffff"),
  createValueNodeDefinition("value:boolean", "Boolean", "boolean", false),
  createValueNodeDefinition(
    "value:stringArray",
    "String Array",
    "stringArray",
    [],
  ),
  createValueNodeDefinition(
    "value:numberArray",
    "Number Array",
    "numberArray",
    [],
  ),
];
