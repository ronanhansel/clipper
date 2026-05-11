import type {
  AnimationGraphControlField,
  AnimationGraphNodeDefinition,
  FieldOperator,
  Field,
  GraphPortDefinition,
  GraphStream,
  MathFieldOperator,
  ValueStream,
  ValueStreamType,
} from "../../types";
import { isValueStream, valueOutputPort } from "../helpers";

type Vector = { x: number; y: number };
type ValueNodeSpec = {
  kind: string;
  label: string;
  valueType: ValueStreamType;
  defaultValue: unknown;
  fields: readonly AnimationGraphControlField[];
};

const valueSpecs: readonly ValueNodeSpec[] = [
  valueSpec("value:string", "String", "string", "", "text"),
  valueSpec("value:number", "Number", "number", 0, "number"),
  valueSpec("value:color", "Color", "color", "#ffffff", "color"),
  valueSpec("value:boolean", "Boolean", "boolean", false, "text"),
  {
    kind: "value:vector",
    label: "Vector",
    valueType: "vector",
    defaultValue: { x: 0, y: 0 },
    fields: [numberField("x", "X", 0), numberField("y", "Y", 0)],
  },
  valueSpec("value:stringArray", "String Array", "stringArray", [], "text"),
  valueSpec("value:numberArray", "Number Array", "numberArray", [], "text"),
];

export function createValueNodeDefinition(
  spec: ValueNodeSpec,
): AnimationGraphNodeDefinition {
  return {
    kind: spec.kind,
    label: spec.label,
    category: "value",
    controls: [{ id: "value", fields: spec.fields }],
    getPorts: () => [valueOutputPort(spec.valueType)],
    createDefaultConfig: () => ({ value: spec.defaultValue }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null
        ? config
        : { value: spec.defaultValue },
    execute: ({ node }) => ({
      outputs: new Map([
        [
          "value",
          [
            valueStream(
              `${node.id}:value`,
              spec.valueType,
              readNodeValue(node.config, spec.defaultValue, spec.valueType),
            ),
          ],
        ],
      ]),
    }),
  };
}

const mathOperators: readonly {
  kind: string;
  label: string;
  operator: MathFieldOperator;
  inputs: readonly string[];
}[] = [
  { kind: "value:math:add", label: "Add", operator: "add", inputs: ["a", "b"] },
  {
    kind: "value:math:subtract",
    label: "Subtract",
    operator: "subtract",
    inputs: ["a", "b"],
  },
  {
    kind: "value:math:multiply",
    label: "Multiply",
    operator: "multiply",
    inputs: ["a", "b"],
  },
  {
    kind: "value:math:divide",
    label: "Divide",
    operator: "divide",
    inputs: ["a", "b"],
  },
  {
    kind: "value:math:clamp",
    label: "Clamp",
    operator: "clamp",
    inputs: ["value", "min", "max"],
  },
  {
    kind: "value:math:remap",
    label: "Remap",
    operator: "remap",
    inputs: ["value", "inMin", "inMax", "outMin", "outMax"],
  },
  { kind: "value:math:min", label: "Min", operator: "min", inputs: ["a", "b"] },
  { kind: "value:math:max", label: "Max", operator: "max", inputs: ["a", "b"] },
  { kind: "value:math:abs", label: "Abs", operator: "abs", inputs: ["value"] },
  {
    kind: "value:math:round",
    label: "Round",
    operator: "round",
    inputs: ["value"],
  },
];

const compareOperators = [
  "equals",
  "contains",
  "notContains",
  "gt",
  "lt",
  "gte",
  "lte",
] as const;

export const valueNodeDefinitions = [
  ...valueSpecs.map(createValueNodeDefinition),
  ...mathOperators.map(createMathNodeDefinition),
  ...compareOperators.map((operator) =>
    createCompareNodeDefinition(
      `value:compare:${operator}`,
      `Compare ${operator}`,
      operator,
    ),
  ),
  createCombineVectorNodeDefinition(),
  createSplitVectorNodeDefinition(),
  createCombineColorNodeDefinition(),
  createSplitColorNodeDefinition(),
  createArrayNodeDefinition("number"),
  createArrayNodeDefinition("string"),
  createRandomNodeDefinition("value:random", "Random", false),
  createRandomNodeDefinition("value:noise", "Noise", true),
];

function createMathNodeDefinition(
  spec: (typeof mathOperators)[number],
): AnimationGraphNodeDefinition {
  return {
    kind: spec.kind,
    label: spec.label,
    category: "value",
    controls: [
      {
        id: "math",
        fields: spec.inputs.map((input) =>
          numberField(
            input,
            input,
            input === "max" || input === "inMax" || input === "outMax" ? 1 : 0,
          ),
        ),
      },
    ],
    getPorts: () => [
      ...spec.inputs.map(numberInputPort),
      valueOutputPort("number"),
    ],
    createDefaultConfig: () =>
      Object.fromEntries(
        spec.inputs.map((input) => [
          input,
          input === "max" || input === "inMax" || input === "outMax" ? 1 : 0,
        ]),
      ),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null ? config : {},
    execute: ({ node, inputs }) => {
      const values = spec.inputs.map((input) =>
        readNumberInput(
          inputs,
          input,
          readConfigNumber(
            node.config,
            input,
            input === "max" || input === "inMax" || input === "outMax" ? 1 : 0,
          ),
        ),
      );
      return {
        outputs: new Map([
          [
            "value",
            [
              valueStream(
                `${node.id}:value`,
                "number",
                evaluateMath(spec.operator, values),
              ),
            ],
          ],
        ]),
      };
    },
  };
}

function createCompareNodeDefinition(
  kind: string,
  label: string,
  operator: FieldOperator,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "value",
    controls: [
      {
        id: "compare",
        fields: [
          { key: "right", label: "Right", type: "text", defaultValue: "" },
        ],
      },
    ],
    getPorts: () => [
      anyValueInputPort("left", "Left"),
      anyValueInputPort("right", "Right"),
      valueOutputPort("boolean"),
    ],
    createDefaultConfig: () => ({ right: "" }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null ? config : { right: "" },
    execute: ({ node, inputs }) => {
      const left = readAnyValueInput(
        inputs,
        "left",
        readConfigValue(node.config, "left", ""),
      );
      const right = readAnyValueInput(
        inputs,
        "right",
        readConfigValue(node.config, "right", ""),
      );
      return {
        outputs: new Map([
          [
            "value",
            [
              valueStream(
                `${node.id}:value`,
                "boolean",
                compareValues(left, operator as never, right),
              ),
            ],
          ],
        ]),
      };
    },
  };
}

function createCombineVectorNodeDefinition(): AnimationGraphNodeDefinition {
  return {
    kind: "value:combine:vector",
    label: "Combine Vector",
    category: "value",
    controls: [
      {
        id: "vector",
        fields: [numberField("x", "X", 0), numberField("y", "Y", 0)],
      },
    ],
    getPorts: () => [
      numberInputPort("x"),
      numberInputPort("y"),
      valueOutputPort("vector"),
    ],
    createDefaultConfig: () => ({ x: 0, y: 0 }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null ? config : { x: 0, y: 0 },
    execute: ({ node, inputs }) => ({
      outputs: new Map([
        [
          "value",
          [
            valueStream(`${node.id}:value`, "vector", {
              x: readNumberInput(
                inputs,
                "x",
                readConfigNumber(node.config, "x", 0),
              ),
              y: readNumberInput(
                inputs,
                "y",
                readConfigNumber(node.config, "y", 0),
              ),
            }),
          ],
        ],
      ]),
    }),
  };
}

function createSplitVectorNodeDefinition(): AnimationGraphNodeDefinition {
  return passthroughSplit(
    "value:split:vector",
    "Split Vector",
    "vector",
    ["x", "y"],
    (value, key) => Number((value as Vector)?.[key as keyof Vector] ?? 0),
  );
}

function createCombineColorNodeDefinition(): AnimationGraphNodeDefinition {
  return {
    kind: "value:combine:color",
    label: "Combine Color",
    category: "value",
    controls: [
      {
        id: "color",
        fields: [
          numberField("r", "R", 255),
          numberField("g", "G", 255),
          numberField("b", "B", 255),
          numberField("a", "A", 1),
        ],
      },
    ],
    getPorts: () =>
      ["r", "g", "b", "a"]
        .map(numberInputPort)
        .concat(valueOutputPort("color")),
    createDefaultConfig: () => ({ r: 255, g: 255, b: 255, a: 1 }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null
        ? config
        : { r: 255, g: 255, b: 255, a: 1 },
    execute: ({ node, inputs }) => ({
      outputs: new Map([
        [
          "value",
          [
            valueStream(
              `${node.id}:value`,
              "color",
              rgbaToHex(
                readNumberInput(
                  inputs,
                  "r",
                  readConfigNumber(node.config, "r", 255),
                ),
                readNumberInput(
                  inputs,
                  "g",
                  readConfigNumber(node.config, "g", 255),
                ),
                readNumberInput(
                  inputs,
                  "b",
                  readConfigNumber(node.config, "b", 255),
                ),
                readNumberInput(
                  inputs,
                  "a",
                  readConfigNumber(node.config, "a", 1),
                ),
              ),
            ),
          ],
        ],
      ]),
    }),
  };
}

function createSplitColorNodeDefinition(): AnimationGraphNodeDefinition {
  return passthroughSplit(
    "value:split:color",
    "Split Color",
    "color",
    ["r", "g", "b", "a"],
    (value, key) => splitColor(String(value))[key as "r" | "g" | "b" | "a"],
  );
}

function createArrayNodeDefinition(
  valueType: "number" | "string",
): AnimationGraphNodeDefinition {
  const arrayType = `${valueType}Array` as ValueStreamType;
  return {
    kind: `value:combine:${valueType}Array`,
    label: `Combine ${valueType === "number" ? "Number" : "String"} Array`,
    category: "value",
    controls: [
      {
        id: "array",
        fields: [
          { key: "values", label: "Values", type: "text", defaultValue: "" },
        ],
      },
    ],
    getPorts: () =>
      [
        {
          id: "items",
          label: "Items",
          direction: "input",
          cardinality: "multi",
          type: { kind: "value", valueType },
          role: "parameter",
        },
        valueOutputPort(arrayType),
      ] as GraphPortDefinition[],
    createDefaultConfig: () => ({ values: [] }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null ? config : { values: [] },
    execute: ({ node, inputs }) => ({
      outputs: new Map([
        [
          "value",
          [
            valueStream(`${node.id}:value`, arrayType, [
              ...(inputs.get("items") ?? [])
                .filter(isValueStream)
                .map((stream) => stream.value),
              ...readConfigArray(node.config, valueType),
            ]),
          ],
        ],
      ]),
    }),
  };
}

function createRandomNodeDefinition(
  kind: string,
  label: string,
  noise: boolean,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "value",
    controls: [
      {
        id: "random",
        fields: [
          numberField("min", "Min", 0),
          numberField("max", "Max", 1),
          { key: "seed", label: "Seed", type: "text", defaultValue: "0" },
        ],
      },
    ],
    getPorts: () => [
      numberInputPort("min"),
      numberInputPort("max"),
      valueOutputPort("number"),
    ],
    createDefaultConfig: () => ({ min: 0, max: 1, seed: "0" }),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null
        ? config
        : { min: 0, max: 1, seed: "0" },
    execute: ({ node, inputs }) => {
      const min = readNumberInput(
        inputs,
        "min",
        readConfigNumber(node.config, "min", 0),
      );
      const max = readNumberInput(
        inputs,
        "max",
        readConfigNumber(node.config, "max", 1),
      );
      const seed = String(readConfigValue(node.config, "seed", "0"));
      const random = seededRandom(`${seed}:${noise ? node.id : "random"}`);
      return {
        outputs: new Map([
          [
            "value",
            [
              valueStream(
                `${node.id}:value`,
                "number",
                min + random * (max - min),
              ),
            ],
          ],
        ]),
      };
    },
  };
}

function passthroughSplit(
  kind: string,
  label: string,
  inputType: ValueStreamType,
  keys: readonly string[],
  read: (value: unknown, key: string) => number,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "value",
    getPorts: () => [
      {
        id: "value",
        label: "Value",
        direction: "input",
        cardinality: "single",
        type: { kind: "value", valueType: inputType },
      },
      ...keys.map((key) => ({
        id: key,
        label: key.toUpperCase(),
        direction: "output" as const,
        cardinality: "single" as const,
        type: { kind: "value" as const, valueType: "number" as const },
      })),
    ],
    createDefaultConfig: () => ({}),
    normalizeConfig: (config) =>
      typeof config === "object" && config !== null ? config : {},
    execute: ({ node, inputs }) => {
      const input = inputs.get("value")?.find(isValueStream)?.value;
      return {
        outputs: new Map(
          keys.map((key) => [
            key,
            [valueStream(`${node.id}:${key}`, "number", read(input, key))],
          ]),
        ),
      };
    },
  };
}

function valueSpec(
  kind: string,
  label: string,
  valueType: ValueStreamType,
  defaultValue: unknown,
  type: AnimationGraphControlField["type"],
): ValueNodeSpec {
  return {
    kind,
    label,
    valueType,
    defaultValue,
    fields: [
      {
        key: "value",
        label: "Value",
        type,
        defaultValue: String(defaultValue),
      },
    ],
  };
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
): AnimationGraphControlField {
  return { key, label, type: "number", defaultValue };
}

function numberInputPort(id: string): GraphPortDefinition {
  return {
    id,
    label: id,
    direction: "input",
    cardinality: "single",
    type: { kind: "value", valueType: "number" },
    role: "parameter",
  };
}

function anyValueInputPort(id: string, label: string): GraphPortDefinition {
  return {
    id,
    label,
    direction: "input",
    cardinality: "single",
    type: { kind: "anyValue" },
    role: "parameter",
  };
}

function valueStream(
  id: string,
  valueType: ValueStreamType,
  value: unknown,
): ValueStream {
  return { id, valueType, value };
}

function readNodeValue(
  config: unknown,
  fallback: unknown,
  valueType: ValueStreamType,
) {
  if (valueType === "vector")
    return {
      x: readConfigNumber(config, "x", 0),
      y: readConfigNumber(config, "y", 0),
    };
  const value = readConfigValue(config, "value", fallback);
  if (valueType === "number")
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  if (valueType === "boolean") return value === true || value === "true";
  if (valueType.endsWith("Array"))
    return Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
  return value;
}

function readConfigValue(config: unknown, key: string, fallback: unknown) {
  return typeof config === "object" && config !== null && key in config
    ? (config as Record<string, unknown>)[key]
    : fallback;
}

function readConfigNumber(config: unknown, key: string, fallback: number) {
  const value = Number(readConfigValue(config, key, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function readNumberInput(
  inputs: ReadonlyMap<string, readonly GraphStream[]>,
  key: string,
  fallback: number,
) {
  const stream = inputs.get(key)?.find(isValueStream);
  const value = Number(stream?.value ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function readAnyValueInput(
  inputs: ReadonlyMap<string, readonly GraphStream[]>,
  key: string,
  fallback: unknown,
) {
  return inputs.get(key)?.find(isValueStream)?.value ?? fallback;
}

function readConfigArray(config: unknown, valueType: "number" | "string") {
  const value = readConfigValue(config, "values", []);
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values
    .map((item) =>
      valueType === "number" ? Number(item) : String(item).trim(),
    )
    .filter((item) =>
      typeof item === "number" ? Number.isFinite(item) : item.length > 0,
    );
}

function evaluateMath(operator: MathFieldOperator, values: readonly number[]) {
  const [a = 0, b = 0, c = 1, d = 0, e = 1] = values;
  if (operator === "add") return values.reduce((sum, value) => sum + value, 0);
  if (operator === "subtract") return a - b;
  if (operator === "multiply")
    return values.reduce(
      (product, value) => product * value,
      values.length ? 1 : 0,
    );
  if (operator === "divide") return b === 0 ? 0 : a / b;
  if (operator === "clamp") return Math.min(Math.max(a, b), c);
  if (operator === "remap")
    return c === b ? d : d + ((a - b) / (c - b)) * (e - d);
  if (operator === "min") return Math.min(...values);
  if (operator === "max") return Math.max(...values);
  if (operator === "abs") return Math.abs(a);
  if (operator === "round") return Math.round(a);
  return 0;
}

function compareValues(
  left: unknown,
  operator: "equals" | "contains" | "notContains" | "gt" | "lt" | "gte" | "lte",
  right: unknown,
) {
  if (operator === "equals") return String(left) === String(right);
  if (operator === "contains") return String(left).includes(String(right));
  if (operator === "notContains") return !String(left).includes(String(right));
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (operator === "gt") return a > b;
  if (operator === "lt") return a < b;
  if (operator === "gte") return a >= b;
  if (operator === "lte") return a <= b;
  return false;
}

function rgbaToHex(r: number, g: number, b: number, a: number) {
  const parts = [r, g, b].map((part) =>
    Math.round(Math.min(Math.max(part, 0), 255))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}${Math.round(Math.min(Math.max(a, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

function splitColor(value: string) {
  const hex = value.replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2) || "ff", 16),
    g: Number.parseInt(hex.slice(2, 4) || "ff", 16),
    b: Number.parseInt(hex.slice(4, 6) || "ff", 16),
    a: hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
