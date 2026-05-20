/**
 * Parse a CSS colour string into a linear-light premultiplication-ready
 * RGBA quadruple. Returns null when the input cannot be interpreted as
 * a colour (e.g. an unparsed gradient string).
 *
 * Three's outputColorSpace is sRGB, so the rect/text/etc. shaders
 * already do the linear→sRGB encode on the final write. To stay in
 * linear-light through the bokeh gather, we convert the parsed sRGB
 * channels here using the standard 2.4 piecewise transfer.
 *
 * Supports:
 *   #rgb / #rgba / #rrggbb / #rrggbbaa
 *   rgb(...) / rgba(...) (commas or whitespace, modern slash-alpha)
 *   hsl(...) / hsla(...) (degrees + percent)
 *   transparent
 *   the 147 CSS Color Module Level 4 named colours (red, purple, etc.)
 *
 * Anything else (color(), oklab, gradients) returns null and the caller
 * renders a transparent rect.
 */
export type LinearRgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function parseCssColorToLinearRgba(input: string): LinearRgba | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  if (raw.startsWith("#")) return parseHex(raw);
  if (raw.startsWith("rgb")) return parseRgb(raw);
  if (raw.startsWith("hsl")) return parseHsl(raw);

  const named = NAMED_COLOR_HEX[raw];
  if (named) return parseHex(named);

  return null;
}

// CSS Color Module Level 4 named colours — the 147 keywords browsers
// understand for `color: red`. We resolve them through the existing hex
// parser so the sRGB→linear path is shared.
const NAMED_COLOR_HEX: Record<string, string> = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
};

function parseHex(input: string): LinearRgba | null {
  const hex = input.slice(1);
  let r: number,
    g: number,
    b: number,
    a = 1;
  if (hex.length === 3 || hex.length === 4) {
    const digits = hex.split("").map((d) => parseInt(d + d, 16));
    if (digits.some(Number.isNaN)) return null;
    [r, g, b] = digits;
    if (hex.length === 4) a = digits[3] / 255;
  } else if (hex.length === 6 || hex.length === 8) {
    const matches = hex.match(/.{2}/g);
    if (!matches) return null;
    const digits = matches.map((d) => parseInt(d, 16));
    if (digits.some(Number.isNaN)) return null;
    [r, g, b] = digits;
    if (hex.length === 8) a = digits[3] / 255;
  } else {
    return null;
  }
  return {
    r: srgbToLinear(r / 255),
    g: srgbToLinear(g / 255),
    b: srgbToLinear(b / 255),
    a,
  };
}

function parseRgb(input: string): LinearRgba | null {
  const inside = extractParens(input);
  if (!inside) return null;
  const parts = splitRgbHsl(inside);
  if (parts.length < 3) return null;
  const r = parseChannel(parts[0]);
  const g = parseChannel(parts[1]);
  const b = parseChannel(parts[2]);
  if (r === null || g === null || b === null) return null;
  const a = parts.length >= 4 ? parseAlpha(parts[3]) : 1;
  if (a === null) return null;
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
    a,
  };
}

function parseHsl(input: string): LinearRgba | null {
  const inside = extractParens(input);
  if (!inside) return null;
  const parts = splitRgbHsl(inside);
  if (parts.length < 3) return null;
  const h = parseHue(parts[0]);
  const s = parsePercent(parts[1]);
  const l = parsePercent(parts[2]);
  if (h === null || s === null || l === null) return null;
  const a = parts.length >= 4 ? parseAlpha(parts[3]) : 1;
  if (a === null) return null;
  const { r, g, b } = hslToRgb(h, s, l);
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
    a,
  };
}

function extractParens(input: string): string | null {
  const open = input.indexOf("(");
  const close = input.lastIndexOf(")");
  if (open < 0 || close < 0 || close <= open) return null;
  return input.slice(open + 1, close);
}

function splitRgbHsl(inside: string): string[] {
  // Split on commas first; if none, split on whitespace + slash for the
  // modern form (e.g. "255 128 0 / 50%").
  if (inside.includes(",")) {
    return inside.split(",").map((p) => p.trim());
  }
  return inside.replace(/\//g, " / ").split(/\s+/).filter(Boolean);
}

function parseChannel(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "/") return null;
  if (trimmed.endsWith("%")) {
    const n = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : null;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? clamp01(n / 255) : null;
}

function parseAlpha(value: string): number | null {
  const trimmed = value.replace("/", "").trim();
  if (!trimmed) return 1;
  if (trimmed.endsWith("%")) {
    const n = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : null;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? clamp01(n) : null;
}

function parseHue(value: string): number | null {
  const trimmed = value.trim().replace("deg", "");
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  // Normalise to [0, 1] turn.
  const turns = ((n % 360) + 360) % 360;
  return turns / 360;
}

function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.endsWith("%")) return null;
  const n = parseFloat(trimmed.slice(0, -1));
  return Number.isFinite(n) ? clamp01(n / 100) : null;
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): {
  r: number;
  g: number;
  b: number;
} {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChannel(p, q, h + 1 / 3),
    g: hueToChannel(p, q, h),
    b: hueToChannel(p, q, h - 1 / 3),
  };
}

function hueToChannel(p: number, q: number, t: number): number {
  let v = t;
  if (v < 0) v += 1;
  if (v > 1) v -= 1;
  if (v < 1 / 6) return p + (q - p) * 6 * v;
  if (v < 1 / 2) return q;
  if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
  return p;
}

function srgbToLinear(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
