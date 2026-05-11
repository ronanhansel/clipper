import type {
  AnimationGraphAnimationConfig,
  AnimationGraphConditionConfig,
  AnimationGraphSplitConfig,
  AnimationGraphTimeConfig,
  AnimationGraphNodePosition,
  AnimationGraphValueType,
  MotionEase,
  TypedAnimationGraphNode,
  TypedAnimationGraphSocket,
} from "../types";

type SocketSpec = { id: string; label: string; type: AnimationGraphValueType };
type InputSocketSpec = SocketSpec & {
  accepts?: readonly AnimationGraphValueType[];
};

type NodeDefinition = {
  kind: TypedAnimationGraphNode["kind"];
  label: string;
  inputs: readonly InputSocketSpec[];
  outputs: readonly SocketSpec[];
};

const definitions = {
  source: {
    kind: "source",
    label: "Layer",
    inputs: [],
    outputs: [
      { id: "structure", label: "Structure", type: "Structure.Object" },
    ],
  },
  time: {
    kind: "time",
    label: "Time",
    inputs: [
      {
        id: "structure",
        label: "Structure",
        type: "Structure.Object",
        accepts: [
          "Structure.Shape",
          "Structure.TextObject",
          "Structure.RichTextObject",
          "Structure.Object",
        ],
      },
      {
        id: "controller",
        label: "AnimationController",
        type: "AnimationController",
      },
    ],
    outputs: [
      { id: "structure", label: "Structure", type: "Structure.Object" },
      {
        id: "controller",
        label: "AnimationController",
        type: "AnimationController",
      },
    ],
  },
  split: {
    kind: "split",
    label: "Split",
    inputs: [
      {
        id: "source",
        label: "Source",
        type: "Structure.TextObject",
        accepts: [
          "Structure.Object",
          "Structure.TextObject",
          "Value.String",
          "Value.Number",
          "Value.StringArray",
          "Value.NumberArray",
        ],
      },
      { id: "controller", label: "Controller", type: "AnimationController" },
    ],
    outputs: [
      {
        id: "items",
        label: "Items",
        type: "Structure.RichTextObject",
      },
      { id: "controller", label: "Controller", type: "AnimationController" },
    ],
  },
  condition: {
    kind: "condition",
    label: "Condition",
    inputs: [
      {
        id: "source",
        label: "Source",
        type: "Structure.TextObject",
        accepts: [
          "Structure.TextObject",
          "Structure.RichTextObject",
          "Value.String",
          "Value.Number",
        ],
      },
      { id: "controller", label: "Controller", type: "AnimationController" },
    ],
    outputs: [
      { id: "matched", label: "Matched", type: "Structure.RichTextObject" },
      { id: "output:1", label: "Output 1", type: "AnimationController" },
      { id: "output:2", label: "Output 2", type: "AnimationController" },
      { id: "output:3", label: "Output 3", type: "AnimationController" },
      { id: "output:4", label: "Output 4", type: "AnimationController" },
    ],
  },
  effect: {
    kind: "effect",
    label: "Effect Mix",
    inputs: [
      {
        id: "structure",
        label: "Structure",
        type: "Structure.Object",
        accepts: [
          "Structure.Shape",
          "Structure.TextObject",
          "Structure.RichTextObject",
          "Structure.Object",
        ],
      },
      { id: "controller", label: "Controller", type: "AnimationController" },
      { id: "effect", label: "CSS Effect", type: "Effect.CSSEffect" },
    ],
    outputs: [{ id: "effect", label: "CSS Effect", type: "Effect.CSSEffect" }],
  },
  group: {
    kind: "group",
    label: "Group",
    inputs: [
      { id: "controller", label: "Controller", type: "AnimationController" },
    ],
    outputs: [{ id: "effect", label: "CSS Effect", type: "Effect.CSSEffect" }],
  },
  out: {
    kind: "out",
    label: "Out",
    inputs: [
      {
        id: "structure",
        label: "Structure",
        type: "Structure.Object",
        accepts: [
          "Structure.Shape",
          "Structure.TextObject",
          "Structure.RichTextObject",
          "Structure.Object",
        ],
      },
      { id: "effect", label: "CSS Effect", type: "Effect.CSSEffect" },
      { id: "controller", label: "Controller", type: "AnimationController" },
    ],
    outputs: [{ id: "compiled", label: "Compiled", type: "CompiledAnimation" }],
  },
} as const satisfies Record<TypedAnimationGraphNode["kind"], NodeDefinition>;

export const animationGraphNodeDefinitions = definitions;

export function createTypedAnimationGraphNode(
  id: string,
  kind: TypedAnimationGraphNode["kind"],
  position: AnimationGraphNodePosition,
  config:
    | Partial<TypedAnimationGraphNode["config"]>
    | Record<string, string> = {},
  label?: string,
): TypedAnimationGraphNode {
  const definition = definitions[kind];
  const normalizedConfig = normalizeNodeConfig(kind, config);
  const outputs =
    kind === "source" &&
    "outputType" in normalizedConfig &&
    normalizedConfig.outputType
      ? definition.outputs.map((socket) =>
          socket.id === "structure"
            ? { ...socket, type: normalizedConfig.outputType }
            : socket,
        )
      : definition.outputs;
  return {
    id,
    kind,
    label: label || definition.label,
    position,
    x: position.x,
    y: position.y,
    inputs: definition.inputs,
    outputs,
    config: normalizedConfig,
  } as TypedAnimationGraphNode;
}

function normalizeNodeConfig(
  kind: TypedAnimationGraphNode["kind"],
  config: Partial<TypedAnimationGraphNode["config"]> | Record<string, string>,
) {
  if (kind === "source")
    return {
      objectId: readString(config, "objectId", ""),
      outputType: readOutputType(config, "outputType"),
    };
  if (kind === "time")
    return {
      delay: readNumber(config, "delay", 0),
      duration: readNumber(config, "duration", 1),
      ease: readEase(config, "ease", "linear"),
      repeat: readOptionalNumber(config, "repeat"),
      repeatType: readRepeatType(config, "repeatType"),
      schedule: readSchedule(config, "schedule"),
    } satisfies AnimationGraphTimeConfig;
  if (kind === "split")
    return {
      mode: readSplitMode(config, "mode"),
      pattern: readString(config, "pattern", ""),
      stagger: readNumber(config, "stagger", 0),
      order: readOrder(config, "order"),
      repeatScope: readRepeatScope(config, "repeatScope"),
    } satisfies AnimationGraphSplitConfig;
  if (kind === "condition") return readConditionConfig(config);
  if (kind === "effect")
    return {
      effects: readCssEffects(config),
    } satisfies AnimationGraphAnimationConfig;
  if (kind === "group") return { groupId: readString(config, "groupId", "") };
  return {};
}

function readConditionConfig(
  config: Partial<TypedAnimationGraphNode["config"]> | Record<string, string>,
) {
  if ("rules" in config && Array.isArray(config.rules)) return config;
  const count = Math.min(
    4,
    Math.max(1, Math.trunc(readNumber(config, "conditionCount", 1))),
  );
  return {
    rules: Array.from({ length: count }, (_, index) => {
      const suffix = index === 0 ? "" : String(index + 1);
      return {
        target: "value",
        operator:
          readString(config, `matchType${suffix}`, "textEquals") ===
          "textEquals"
            ? "equals"
            : "contains",
        value: readPrimitive(config, `value${suffix}`) ?? "",
        action: readConditionAction(config, `action${suffix}`),
        output: Math.max(
          1,
          Math.trunc(readNumber(config, `output${suffix}`, index + 1)),
        ),
        delay: readNumber(config, `delay${suffix}`, 0),
      };
    }),
  } satisfies AnimationGraphConditionConfig;
}

function readCssEffects(
  config: Partial<TypedAnimationGraphNode["config"]> | Record<string, string>,
) {
  if (
    "effects" in config &&
    Array.isArray(config.effects) &&
    config.effects.length
  )
    return config.effects;
  const property = readString(config, "property", "");
  return property
    ? [
        {
          property,
          from: readPrimitive(config, "from"),
          to: readPrimitive(config, "to"),
          values: readAnimationValues(config),
        },
      ]
    : [];
}

function readAnimationValues(
  config: Partial<TypedAnimationGraphNode["config"]> | Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) =>
      key === "property" ||
      key === "from" ||
      key === "to" ||
      typeof value === "object"
        ? []
        : [[key, parsePrimitive(value)]],
    ),
  );
}

function readString(config: object, key: string, fallback: string) {
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

function readPrimitive(config: object, key: string) {
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string"
    ? parsePrimitive(value)
    : typeof value === "number"
      ? value
      : undefined;
}

function parsePrimitive(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(value.trim())
    ? numeric
    : value;
}

function readNumber(config: object, key: string, fallback: number) {
  const value = (config as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readOptionalNumber(config: object, key: string) {
  const value = readNumber(config, key, Number.NaN);
  return Number.isFinite(value) && value !== 0 ? value : undefined;
}

function readEase(
  config: object,
  key: string,
  fallback: MotionEase,
): MotionEase {
  const value = readString(config, key, fallback);
  return value === "linear" ||
    value === "easeIn" ||
    value === "easeOut" ||
    value === "easeInOut" ||
    value === "inAndOut" ||
    value === "expoIn" ||
    value === "expoOut" ||
    value === "circOut" ||
    value === "backOut"
    ? value
    : fallback;
}

function readRepeatType(config: object, key: string) {
  const value = readString(config, key, "");
  return value === "loop" || value === "reverse" || value === "mirror"
    ? value
    : undefined;
}

function readSchedule(config: object, key: string) {
  return readString(config, key, "relative") === "absolute"
    ? "absolute"
    : "relative";
}

function readSplitMode(config: object, key: string) {
  const value = readString(config, key, "word");
  return value === "character" || value === "pattern" ? value : "word";
}

function readOrder(config: object, key: string) {
  const value = readString(config, key, "forward");
  return value === "reverse" || value === "center" ? value : "forward";
}

function readRepeatScope(config: object, key: string) {
  return readString(config, key, "sequence") === "item" ? "item" : "sequence";
}

function readOutputType(config: object, key: string) {
  const value = readString(config, key, "");
  return isAnimationGraphValueType(value) ? value : undefined;
}

function isAnimationGraphValueType(
  value: string,
): value is AnimationGraphValueType {
  return (
    value === "Structure.Shape" ||
    value === "Structure.TextObject" ||
    value === "Structure.RichTextObject" ||
    value === "Structure.Object" ||
    value === "Value.String" ||
    value === "Value.Number" ||
    value === "Value.Color" ||
    value === "Value.Boolean" ||
    value === "Value.StringArray" ||
    value === "Value.NumberArray" ||
    value === "Effect.CSSEffect" ||
    value === "AnimationController" ||
    value === "CompiledAnimation"
  );
}

function readConditionAction(config: object, key: string) {
  const value = readString(config, key, "setDelay");
  return value === "sendToOutput" || value === "duplicateToOutput"
    ? value
    : "setDelay";
}
