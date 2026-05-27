export function hasVisibleShadow(shadow: unknown): boolean {
  if (!shadow || typeof shadow !== "object" || Array.isArray(shadow))
    return false;
  const record = shadow as Record<string, unknown>;
  if (record.enabled !== true) return false;
  const alpha =
    typeof record.alpha === "number" && Number.isFinite(record.alpha)
      ? record.alpha
      : 100;
  if (alpha <= 0) return false;
  return (
    readFiniteNumber(record.x) !== 0 ||
    readFiniteNumber(record.y) !== 0 ||
    readFiniteNumber(record.blur) > 0 ||
    readFiniteNumber(record.spread) !== 0
  );
}

function readFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
