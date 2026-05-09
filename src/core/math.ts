export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function roundToPrecision(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function roundTwo(value: number) {
  return roundToPrecision(value, 2);
}

export function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function sanitizeProjectNumbers(value: unknown): unknown {
  if (typeof value === "number")
    return Number.isInteger(value) ? value : roundTwo(value);
  if (Array.isArray(value)) return value.map(sanitizeProjectNumbers);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sanitizeProjectNumbers(entry),
    ]),
  );
}
