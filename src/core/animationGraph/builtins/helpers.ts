import type { MotionEase } from "../../types";
import type {
  AnimationController,
  AnimationStream,
  GraphPortDefinition,
  StructureStream,
  ValueStream,
  ValueStreamType,
} from "../types";

export function readString(config: object, key: string, fallback: string) {
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export function readPrimitive(config: object, key: string) {
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string"
    ? parsePrimitive(value)
    : typeof value === "number"
      ? value
      : undefined;
}

export function parsePrimitive(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(value.trim())
    ? numeric
    : value;
}

export function readNumber(config: object, key: string, fallback: number) {
  const value = (config as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function readOptionalNumber(config: object, key: string) {
  const value = readNumber(config, key, Number.NaN);
  return Number.isFinite(value) && value !== 0 ? value : undefined;
}

export function readEase(
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

export const defaultAnimationController: AnimationController = {
  start: 0,
  delay: 0,
  duration: 1,
  ease: "linear",
  schedule: "relative",
};

export function animationInputPort(
  id: string,
  label: string,
  structures?: readonly StructureStream["kind"][],
  role?: GraphPortDefinition["role"],
  cardinality: GraphPortDefinition["cardinality"] = "single",
): GraphPortDefinition {
  return {
    id,
    label,
    direction: "input",
    cardinality,
    type: { kind: "animation", structures },
    role,
  };
}

export function animationOutputPort(
  id: string,
  label: string,
  structures?: readonly StructureStream["kind"][],
  role?: GraphPortDefinition["role"],
): GraphPortDefinition {
  return {
    id,
    label,
    direction: "output",
    cardinality: "single",
    type: { kind: "animation", structures },
    role,
  };
}

export function cloneAnimationStream(
  stream: AnimationStream,
  id: string,
  structure: StructureStream = stream.structure,
): AnimationStream {
  return {
    ...stream,
    id,
    structure,
    controller: { ...stream.controller },
    effects: [...stream.effects],
  };
}

export function valueOutputPort(
  valueType: ValueStreamType,
): GraphPortDefinition {
  return {
    id: "value",
    label: "Value",
    direction: "output",
    cardinality: "single",
    type: { kind: "value", valueType },
  };
}

export function isAnimationStream(stream: unknown): stream is AnimationStream {
  return typeof stream === "object" && stream !== null && "structure" in stream;
}

export function isValueStream(stream: unknown): stream is ValueStream {
  return typeof stream === "object" && stream !== null && "valueType" in stream;
}
