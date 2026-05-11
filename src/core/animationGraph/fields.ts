import type {
  AnimationGraphDiagnostic,
  AttributeContext,
  EvaluationDomain,
  Field,
  FieldAttributeName,
  FieldEvaluationContext,
  FieldOperator,
  MathFieldOperator,
} from "./types";

type FieldEvaluationResult<T> = {
  values: T[];
  diagnostics: AnimationGraphDiagnostic[];
};

export function evaluateField<T = unknown>(
  field: Field<T>,
  context: FieldEvaluationContext,
): FieldEvaluationResult<T> {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const values = context.items.map((item) =>
    evaluateFieldForItem(
      field,
      {
        ...item,
        time: item.time ?? context.time,
        custom:
          context.frame === undefined
            ? item.custom
            : { ...item.custom, frame: context.frame },
      },
      context.domain,
      diagnostics,
    ),
  ) as T[];
  return { values, diagnostics };
}

export function evaluateBooleanMask(
  field: Field<boolean>,
  context: FieldEvaluationContext,
) {
  const result = evaluateField(field, context);
  return {
    mask: result.values.map(Boolean),
    diagnostics: result.diagnostics,
  };
}

export function attributeField<T = unknown>(
  name: FieldAttributeName,
): Field<T> {
  return { kind: "attribute", name };
}

export function constantField<T>(value: T): Field<T> {
  return { kind: "constant", value };
}

export function compareField(
  left: Field,
  operator: FieldOperator,
  right: Field,
): Field<boolean> {
  return { kind: "compare", left, operator, right } as Field<boolean>;
}

export function mathField(
  operator: MathFieldOperator,
  inputs: readonly Field[],
): Field<number> {
  return { kind: "math", operator, inputs } as Field<number>;
}

export function createFieldDiagnostic(
  message: string,
): AnimationGraphDiagnostic {
  return { severity: "warning", message };
}

function evaluateFieldForItem(
  field: Field,
  item: AttributeContext,
  domain: EvaluationDomain,
  diagnostics: AnimationGraphDiagnostic[],
): unknown {
  if (field.kind === "constant") return field.value;
  if (field.kind === "attribute")
    return readAttribute(field.name, item, domain, diagnostics);
  if (field.kind === "math")
    return evaluateMathField(
      field.operator,
      field.inputs,
      item,
      domain,
      diagnostics,
    );
  if (field.kind === "random") {
    const min = Number(
      field.min
        ? evaluateFieldForItem(field.min, item, domain, diagnostics)
        : 0,
    );
    const max = Number(
      field.max
        ? evaluateFieldForItem(field.max, item, domain, diagnostics)
        : 1,
    );
    const random = seededRandom(
      `${field.seed}:${item.index ?? 0}:${item.value ?? ""}`,
    );
    return (
      (Number.isFinite(min) ? min : 0) +
      random *
        ((Number.isFinite(max) ? max : 1) - (Number.isFinite(min) ? min : 0))
    );
  }
  if (field.kind === "compare") {
    const left = evaluateFieldForItem(field.left, item, domain, diagnostics);
    const right = evaluateFieldForItem(field.right, item, domain, diagnostics);
    return compareValues(left, field.operator, right);
  }
  diagnostics.push(
    createFieldDiagnostic(
      `Unsupported field expression kind "${(field as { kind?: string }).kind}".`,
    ),
  );
  return undefined;
}

function evaluateMathField(
  operator: MathFieldOperator,
  inputs: readonly Field[],
  item: AttributeContext,
  domain: EvaluationDomain,
  diagnostics: AnimationGraphDiagnostic[],
) {
  const values = inputs.map((input) =>
    Number(evaluateFieldForItem(input, item, domain, diagnostics)),
  );
  if (values.some((value) => !Number.isFinite(value))) return 0;
  const first = values[0] ?? 0;
  const second = values[1] ?? 0;
  if (operator === "add") return values.reduce((sum, value) => sum + value, 0);
  if (operator === "subtract") return first - second;
  if (operator === "multiply")
    return values.reduce(
      (product, value) => product * value,
      values.length ? 1 : 0,
    );
  if (operator === "divide") return second === 0 ? 0 : first / second;
  if (operator === "clamp") return clamp(first, values[1] ?? 0, values[2] ?? 1);
  if (operator === "remap") {
    const [value, inMin = 0, inMax = 1, outMin = 0, outMax = 1] = values;
    if (inMax === inMin) return outMin;
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  }
  if (operator === "min") return Math.min(...values);
  if (operator === "max") return Math.max(...values);
  if (operator === "abs") return Math.abs(first);
  if (operator === "round") return Math.round(first);
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function readAttribute(
  name: FieldAttributeName,
  item: AttributeContext,
  domain: EvaluationDomain,
  diagnostics: AnimationGraphDiagnostic[],
) {
  if (name in item) return item[name as keyof AttributeContext];
  if (item.custom && name in item.custom) return item.custom[name];
  diagnostics.push(
    createFieldDiagnostic(
      `Unsupported attribute "${name}" on "${domain}" domain.`,
    ),
  );
  return undefined;
}

function compareValues(left: unknown, operator: FieldOperator, right: unknown) {
  const actual = String(left);
  const expected = String(right);
  if (operator === "equals") return actual === expected;
  if (operator === "contains") return actual.includes(expected);
  if (operator === "notContains") return !actual.includes(expected);
  const actualNumber = Number(left);
  const expectedNumber = Number(right);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber))
    return false;
  if (operator === "gt") return actualNumber > expectedNumber;
  if (operator === "lt") return actualNumber < expectedNumber;
  if (operator === "gte") return actualNumber >= expectedNumber;
  if (operator === "lte") return actualNumber <= expectedNumber;
  return false;
}
