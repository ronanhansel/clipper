import { clampPercent, normalizeHexColor } from "./colorMath";

export type GradientValue = {
  type: "linear" | "radial" | "conic";
  angle: string;
  center: string;
  backgroundSize: string;
  stops: { color: string; position: number; opacity: number }[];
};

export function isGradientValue(value: string) {
  return /^(linear|radial|conic)-gradient\(/i.test(value.trim());
}

export function parseGradientValue(value: string): GradientValue {
  const trimmed = value.trim();
  const type = trimmed.startsWith("radial-gradient")
    ? "radial"
    : trimmed.startsWith("conic-gradient")
      ? "conic"
      : "linear";
  const body =
    trimmed.match(/^[^(]+\((.*)\)$/)?.[1] ?? "135deg, #FFFFFF 0%, #999999 100%";
  const parts = splitGradientArgs(body);
  const first = parts[0] ?? "135deg";
  const stopParts = parts.length > 1 ? parts.slice(1) : parts;
  return {
    type,
    angle:
      type === "linear" ? first : first.replace(/^from\s+/i, "") || "135deg",
    center: first.match(/at\s+(.+)$/i)?.[1] ?? "center",
    backgroundSize: "140% 140%",
    stops: stopParts
      .map(parseGradientStop)
      .filter(Boolean) as GradientValue["stops"],
  };
}

export function formatGradientValue(value: GradientValue) {
  const stops = (value.stops.length ? value.stops : defaultGradientStops())
    .map(
      (stop) =>
        `${formatStopColor(stop.color, stop.opacity)} ${stop.position}%`,
    )
    .join(", ");
  if (value.type === "radial")
    return `radial-gradient(circle at ${value.center || "center"}, ${stops})`;
  if (value.type === "conic")
    return `conic-gradient(from ${value.angle || "135deg"}, ${stops})`;
  return `linear-gradient(${value.angle || "135deg"}, ${stops})`;
}

function splitGradientArgs(value: string) {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      args.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args.filter(Boolean);
}

function parseGradientStop(value: string) {
  const color = value.match(/#[0-9a-fA-F]{3,6}|rgba?\([^)]*\)/)?.[0];
  if (!color) return null;
  const position = value.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? "0";
  return {
    color: normalizeHexColor(color),
    position: clampPercent(position),
    opacity: 100,
  };
}

function formatStopColor(color: string, opacity: number) {
  if (opacity >= 100) return normalizeHexColor(color);
  const hex = normalizeHexColor(color).slice(1);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity / 100)).toFixed(2)})`;
}

export function defaultGradientStops() {
  return [
    { color: "#FFFFFF", position: 0, opacity: 100 },
    { color: "#999999", position: 100, opacity: 100 },
  ];
}

export function getStopHandleLeft(position: number) {
  return `calc(${position}% + ${8 - position * 0.16}px)`;
}
