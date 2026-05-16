import type { JsonValue } from "../core/types";

export type CodePropFieldType =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "select";

export type CodePropField =
  | {
      type: "string";
      default?: string;
      label?: string;
      placeholder?: string;
      multiline?: boolean;
    }
  | {
      type: "number";
      default?: number;
      label?: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      type: "boolean";
      default?: boolean;
      label?: string;
    }
  | {
      type: "color";
      default?: string;
      label?: string;
    }
  | {
      type: "select";
      options: readonly { value: string; label?: string }[];
      default?: string;
      label?: string;
    };

export type CodePropsSchema = Record<string, CodePropField>;

const allowedTypes: ReadonlySet<CodePropFieldType> = new Set([
  "string",
  "number",
  "boolean",
  "color",
  "select",
]);

export function parseCodePropsSchema(value: unknown): CodePropsSchema | null {
  if (!isPlainObject(value)) return null;
  const result: CodePropsSchema = {};
  for (const [key, raw] of Object.entries(value)) {
    const field = parseCodePropField(raw);
    if (field) result[key] = field;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function parseCodePropField(raw: unknown): CodePropField | null {
  if (!isPlainObject(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !allowedTypes.has(type as CodePropFieldType))
    return null;

  const label = typeof raw.label === "string" ? raw.label : undefined;

  if (type === "string") {
    return {
      type: "string",
      default: typeof raw.default === "string" ? raw.default : undefined,
      label,
      placeholder:
        typeof raw.placeholder === "string" ? raw.placeholder : undefined,
      multiline: raw.multiline === true,
    };
  }

  if (type === "number") {
    return {
      type: "number",
      default: typeof raw.default === "number" ? raw.default : undefined,
      label,
      min: typeof raw.min === "number" ? raw.min : undefined,
      max: typeof raw.max === "number" ? raw.max : undefined,
      step: typeof raw.step === "number" ? raw.step : undefined,
    };
  }

  if (type === "boolean") {
    return {
      type: "boolean",
      default: typeof raw.default === "boolean" ? raw.default : undefined,
      label,
    };
  }

  if (type === "color") {
    return {
      type: "color",
      default: typeof raw.default === "string" ? raw.default : undefined,
      label,
    };
  }

  if (type === "select") {
    if (!Array.isArray(raw.options)) return null;
    const options: { value: string; label?: string }[] = [];
    for (const option of raw.options) {
      if (typeof option === "string") {
        options.push({ value: option });
        continue;
      }
      if (isPlainObject(option) && typeof option.value === "string") {
        options.push({
          value: option.value,
          label: typeof option.label === "string" ? option.label : undefined,
        });
      }
    }
    if (options.length === 0) return null;
    const defaultValue =
      typeof raw.default === "string" &&
      options.some((option) => option.value === raw.default)
        ? raw.default
        : undefined;
    return {
      type: "select",
      options,
      default: defaultValue,
      label,
    };
  }

  return null;
}

export function applySchemaDefaults(
  props: Record<string, unknown>,
  schema: CodePropsSchema | null,
): Record<string, unknown> {
  if (!schema) return props;
  const merged: Record<string, unknown> = { ...props };
  for (const [key, field] of Object.entries(schema)) {
    if (merged[key] !== undefined) continue;
    if (field.default !== undefined) merged[key] = field.default;
  }
  return merged;
}

export function coerceFieldValue(
  field: CodePropField,
  value: JsonValue | undefined,
): JsonValue | undefined {
  if (value === undefined || value === null) return field.default ?? undefined;
  if (field.type === "string" || field.type === "color") {
    return typeof value === "string" ? value : (field.default ?? "");
  }
  if (field.type === "number") {
    return typeof value === "number" ? value : (field.default ?? 0);
  }
  if (field.type === "boolean") {
    return typeof value === "boolean" ? value : (field.default ?? false);
  }
  if (field.type === "select") {
    if (
      typeof value === "string" &&
      field.options.some((option) => option.value === value)
    )
      return value;
    return field.default ?? field.options[0].value;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
