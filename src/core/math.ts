export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function sanitizeProjectNumbers(value: unknown): unknown {
  if (typeof value === "number") return Number.isInteger(value) ? value : roundTwo(value);
  if (Array.isArray(value)) return value.map(sanitizeProjectNumbers);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeProjectNumbers(entry)]));
}
