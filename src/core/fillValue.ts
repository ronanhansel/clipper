export type FillStop = {
  id: string;
  color: string;
  position: number;
  opacity: number;
};

export type GradientType = "linear" | "radial" | "conic" | "diamond";
export type ColorSpace = "srgb" | "oklab" | "oklch" | "hsl" | "display-p3";
export type RadialShape = "circle" | "ellipse";

export type FillValue = {
  mode: "solid" | "gradient";
  color: string;
  alpha: number;
  gradientType: GradientType;
  repeating: boolean;
  colorSpace: ColorSpace;
  stops: FillStop[];
  linearAngle: number;
  radialShape: RadialShape;
  radialCenterX: number;
  radialCenterY: number;
  radialRadiusX: number;
  radialRadiusY: number;
  conicFromAngle: number;
  conicCenterX: number;
  conicCenterY: number;
  diamondCenterX: number;
  diamondCenterY: number;
  diamondRadiusX: number;
  diamondRadiusY: number;
  diamondRotation: number;
};

export const MAX_STOPS = 10;

let stopCounter = 0;
export function generateStopId(): string {
  return `s${Date.now().toString(36)}${(stopCounter++).toString(36)}`;
}

export function createDefaultFillValue(): FillValue {
  return {
    mode: "solid",
    color: "#FFFFFF",
    alpha: 100,
    gradientType: "linear",
    repeating: false,
    colorSpace: "srgb",
    stops: [
      { id: generateStopId(), color: "#FFFFFF", position: 0, opacity: 100 },
      { id: generateStopId(), color: "#999999", position: 100, opacity: 100 },
    ],
    linearAngle: 135,
    radialShape: "circle",
    radialCenterX: 50,
    radialCenterY: 50,
    radialRadiusX: 50,
    radialRadiusY: 50,
    conicFromAngle: 0,
    conicCenterX: 50,
    conicCenterY: 50,
    diamondCenterX: 50,
    diamondCenterY: 50,
    diamondRadiusX: 50,
    diamondRadiusY: 50,
    diamondRotation: 0,
  };
}

export function isFillValue(value: unknown): value is FillValue {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.mode === "solid" || obj.mode === "gradient") &&
    typeof obj.color === "string" &&
    Array.isArray(obj.stops)
  );
}

export function parseCssToFillValue(css: string): FillValue {
  const trimmed = css.trim();
  const base = createDefaultFillValue();

  if (!trimmed) return base;

  const isGradient = /^(repeating-)?(linear|radial|conic)-gradient\(/i.test(
    trimmed,
  );

  if (!isGradient) {
    const solid = parseSolidCss(trimmed);
    return { ...base, mode: "solid", color: solid.hex, alpha: solid.alpha };
  }

  const isRepeating = /^repeating-/i.test(trimmed);
  const typeMatch = trimmed.match(
    /^(?:repeating-)?(linear|radial|conic)-gradient\(/i,
  );
  const gradientType = (typeMatch?.[1] ?? "linear") as
    | "linear"
    | "radial"
    | "conic";

  const body =
    trimmed.match(/^[^(]+\((.*)\)$/s)?.[1] ??
    "135deg, #FFFFFF 0%, #999999 100%";
  const parts = splitGradientArgs(body);

  let fill: FillValue = {
    ...base,
    mode: "gradient",
    gradientType,
    repeating: isRepeating,
  };

  if (gradientType === "linear") {
    fill = parseLinearArgs(fill, parts);
  } else if (gradientType === "radial") {
    fill = parseRadialArgs(fill, parts);
  } else if (gradientType === "conic") {
    fill = parseConicArgs(fill, parts);
  }

  return fill;
}

export function fillValueToCss(fill: FillValue): string {
  if (fill.mode === "solid") {
    return formatSolidCss(fill.color, fill.alpha);
  }

  const stops =
    fill.stops.length >= 2 ? fill.stops : createDefaultFillValue().stops;
  const stopsStr = stops
    .map(
      (stop) =>
        `${formatStopColor(stop.color, stop.opacity)} ${stop.position}%`,
    )
    .join(", ");

  const prefix = fill.repeating ? "repeating-" : "";

  switch (fill.gradientType) {
    case "linear":
      return `${prefix}linear-gradient(${fill.linearAngle}deg, ${stopsStr})`;
    case "radial": {
      const size =
        fill.radialShape === "ellipse"
          ? `${fill.radialRadiusX}% ${fill.radialRadiusY}%`
          : `${fill.radialRadiusX}% ${fill.radialRadiusX}%`;
      return `${prefix}radial-gradient(ellipse ${size} at ${fill.radialCenterX}% ${fill.radialCenterY}%, ${stopsStr})`;
    }
    case "conic":
      return `${prefix}conic-gradient(from ${fill.conicFromAngle}deg at ${fill.conicCenterX}% ${fill.conicCenterY}%, ${stopsStr})`;
    case "diamond":
      return buildDiamondCss(fill, stopsStr);
  }
}

function buildDiamondCss(fill: FillValue, stopsStr: string): string {
  // Diamond is non-standard; render as a conic with a note, or a custom approach.
  // For now, approximate as a conic gradient rotated — the renderer can use this.
  return `conic-gradient(from ${fill.diamondRotation}deg at ${fill.diamondCenterX}% ${fill.diamondCenterY}%, ${stopsStr})`;
}

// --- Solid helpers ---

function parseSolidCss(value: string): { hex: string; alpha: number } {
  const rgba = parseRgba(value);
  if (rgba) {
    return {
      hex: rgbToHex(rgba.r, rgba.g, rgba.b),
      alpha: Math.round(rgba.a * 100),
    };
  }
  return { hex: normalizeHex(value), alpha: 100 };
}

function formatSolidCss(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex);
  if (alpha >= 100) return normalized;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${(Math.max(0, Math.min(100, alpha)) / 100).toFixed(2)})`;
}

function formatStopColor(color: string, opacity: number): string {
  if (opacity >= 100) return normalizeHex(color);
  const hex = normalizeHex(color).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity / 100)).toFixed(2)})`;
}

// --- Gradient parsing helpers ---

function parseLinearArgs(fill: FillValue, parts: string[]): FillValue {
  const first = parts[0] ?? "";
  const angleMatch = first.match(/^([\d.]+)deg$/);
  let stopParts = parts;
  if (angleMatch) {
    fill = { ...fill, linearAngle: parseFloat(angleMatch[1]) };
    stopParts = parts.slice(1);
  } else if (/^to\s+/i.test(first)) {
    fill = { ...fill, linearAngle: directionToAngle(first) };
    stopParts = parts.slice(1);
  }
  fill = { ...fill, stops: parseStops(stopParts) };
  return fill;
}

function parseRadialArgs(fill: FillValue, parts: string[]): FillValue {
  const first = parts[0] ?? "";
  let stopParts = parts;

  const atMatch = first.match(/at\s+([\d.]+)%?\s+([\d.]+)%?/i);
  if (atMatch) {
    fill = {
      ...fill,
      radialCenterX: parseFloat(atMatch[1]),
      radialCenterY: parseFloat(atMatch[2]),
    };
  }

  if (/^(circle|ellipse)/i.test(first) || atMatch) {
    if (/^ellipse/i.test(first)) fill = { ...fill, radialShape: "ellipse" };
    stopParts = parts.slice(1);
  }

  fill = { ...fill, stops: parseStops(stopParts) };
  return fill;
}

function parseConicArgs(fill: FillValue, parts: string[]): FillValue {
  const first = parts[0] ?? "";
  let stopParts = parts;

  const fromMatch = first.match(/from\s+([\d.]+)deg/i);
  if (fromMatch) {
    fill = { ...fill, conicFromAngle: parseFloat(fromMatch[1]) };
  }

  const atMatch = first.match(/at\s+([\d.]+)%?\s+([\d.]+)%?/i);
  if (atMatch) {
    fill = {
      ...fill,
      conicCenterX: parseFloat(atMatch[1]),
      conicCenterY: parseFloat(atMatch[2]),
    };
  }

  if (fromMatch || atMatch) {
    stopParts = parts.slice(1);
  }

  fill = { ...fill, stops: parseStops(stopParts) };
  return fill;
}

function parseStops(parts: string[]): FillStop[] {
  const stops: FillStop[] = [];
  for (const part of parts) {
    const colorMatch = part.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/);
    if (!colorMatch) continue;
    const posMatch = part.match(/([\d.]+)%/);
    const position = posMatch ? parseFloat(posMatch[1]) : 0;
    const parsed = parseRgba(colorMatch[0]);
    const color = parsed
      ? rgbToHex(parsed.r, parsed.g, parsed.b)
      : normalizeHex(colorMatch[0]);
    const opacity = parsed ? Math.round(parsed.a * 100) : 100;
    stops.push({ id: generateStopId(), color, position, opacity });
  }
  if (stops.length < 2) {
    return [
      { id: generateStopId(), color: "#FFFFFF", position: 0, opacity: 100 },
      { id: generateStopId(), color: "#999999", position: 100, opacity: 100 },
    ];
  }
  return stops.slice(0, MAX_STOPS);
}

function directionToAngle(direction: string): number {
  const d = direction
    .replace(/^to\s+/i, "")
    .trim()
    .toLowerCase();
  const map: Record<string, number> = {
    top: 0,
    "top right": 45,
    right: 90,
    "bottom right": 135,
    bottom: 180,
    "bottom left": 225,
    left: 270,
    "top left": 315,
  };
  return map[d] ?? 135;
}

// --- Color utilities ---

function normalizeHex(value: string): string {
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

function parseRgba(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  if (value.startsWith("#")) {
    const raw = value.slice(1);
    const hex =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw.length === 8
          ? raw.slice(0, 6)
          : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const match = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : 1,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function splitGradientArgs(value: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      args.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args.filter(Boolean);
}
