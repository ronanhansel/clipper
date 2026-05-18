import { clamp } from "../../core/math";

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d*\.?\d+))?\s*\)$/i,
  );
  if (rgbMatch)
    return rgbToHex(
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
    );
  const expanded = /^#[0-9a-fA-F]{3}$/.test(trimmed)
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
  return /^#[0-9a-fA-F]{6}$/.test(expanded)
    ? expanded.toUpperCase()
    : "#000000";
}

export function isHexColor(value: string) {
  return (
    /^#[0-9a-fA-F]{3}$/.test(value.trim()) ||
    /^#[0-9a-fA-F]{6}$/.test(value.trim())
  );
}

export function isEditableColorValue(value: string) {
  return isHexColor(value) || parseRgbaColor(value) !== null;
}

export function parseSolidColor(value: string) {
  const rgba = parseRgbaColor(value);
  if (rgba) {
    return {
      hex: rgbToHex(rgba.red, rgba.green, rgba.blue),
      alpha: Math.round(rgba.alpha * 100),
    };
  }
  return { hex: normalizeHexColor(value), alpha: 100 };
}

export function parseRgbaColor(value: string) {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
    );
  if (!match) return null;
  return {
    red: clampColorChannel(Number(match[1])),
    green: clampColorChannel(Number(match[2])),
    blue: clampColorChannel(Number(match[3])),
    alpha: clamp(Number(match[4] ?? "1"), 0, 1),
  };
}

export function formatSolidColor(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex);
  const percent = clampPercent(String(alpha));
  if (percent >= 100) return normalized;
  const channels = normalized.slice(1);
  const red = parseInt(channels.slice(0, 2), 16);
  const green = parseInt(channels.slice(2, 4), 16);
  const blue = parseInt(channels.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${(percent / 100).toFixed(2)})`;
}

export function getEditableColorStyleEntries(
  style: Record<string, string | number>,
) {
  const colorKeys = new Set([
    "backgroundColor",
    "color",
    "borderColor",
    "fill",
    "stroke",
  ]);
  return Object.entries(style).flatMap(([key, value]) =>
    colorKeys.has(key) &&
    typeof value === "string" &&
    isEditableColorValue(value)
      ? [[key, value] as [string, string]]
      : [],
  );
}

export function formatStyleLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function clampPercent(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : 0;
}

export function hexToHsv(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0 && max === r) h = 60 * (((g - b) / delta) % 6);
  if (delta !== 0 && max === g) h = 60 * ((b - r) / delta + 2);
  if (delta !== 0 && max === b) h = 60 * ((r - g) / delta + 4);
  return {
    h: Math.round(h < 0 ? h + 360 : h),
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((channel) =>
      clampColorChannel((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbChannels(hex: string) {
  const c = normalizeHexColor(hex).slice(1);
  return {
    red: parseInt(c.slice(0, 2), 16),
    green: parseInt(c.slice(2, 4), 16),
    blue: parseInt(c.slice(4, 6), 16),
  };
}
