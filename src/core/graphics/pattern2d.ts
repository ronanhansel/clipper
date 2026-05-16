import type { FrameObject, JsonValue } from "../types";

export type Pattern2DPresetId =
  | "polkaDots"
  | "grid"
  | "paper"
  | "checker"
  | "stripes"
  | "noise";

export type Pattern2DSelectOption = {
  value: string;
  label: string;
};

export type Pattern2DParam =
  | {
      kind: "number";
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
    }
  | { kind: "color"; key: string; label: string; default: string }
  | { kind: "boolean"; key: string; label: string; default: boolean }
  | {
      kind: "select";
      key: string;
      label: string;
      options: readonly Pattern2DSelectOption[];
      default: string;
    };

export type Pattern2DTile = {
  tileWidth: number;
  tileHeight: number;
  body: string;
  defs?: string;
};

export type Pattern2DPreset = {
  id: Pattern2DPresetId;
  label: string;
  randomized: boolean;
  params: readonly Pattern2DParam[];
  renderTile: (
    params: Record<string, JsonValue>,
    seed: number,
    baseId: string,
    bounds: { width: number; height: number },
  ) => Pattern2DTile;
};

export const PATTERN_2D_RESERVED_PROP_KEYS = ["preset", "seed"] as const;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function num(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: JsonValue | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function bool(value: JsonValue | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function escapeAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  let value = hex.trim();
  if (value.startsWith("#")) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 1, g: 1, b: 1 };
  }
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

export const PATTERN_2D_PRESETS: Record<Pattern2DPresetId, Pattern2DPreset> = {
  polkaDots: {
    id: "polkaDots",
    label: "Polka dots",
    randomized: true,
    params: [
      {
        kind: "number",
        key: "dotSize",
        label: "Dot size",
        min: 1,
        max: 200,
        default: 16,
      },
      {
        kind: "number",
        key: "spacing",
        label: "Spacing",
        min: 4,
        max: 400,
        default: 48,
      },
      {
        kind: "number",
        key: "jitter",
        label: "Jitter",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0,
      },
      { kind: "color", key: "color", label: "Color", default: "#ffffff" },
    ],
    renderTile: (params, seed) => {
      const spacing = Math.max(2, num(params.spacing, 48));
      const radius = Math.max(0.5, num(params.dotSize, 16) / 2);
      const jitter = Math.min(1, Math.max(0, num(params.jitter, 0)));
      const color = escapeAttr(str(params.color, "#ffffff"));
      if (jitter <= 0) {
        return {
          tileWidth: spacing,
          tileHeight: spacing,
          body: `<circle cx="${spacing / 2}" cy="${spacing / 2}" r="${radius}" fill="${color}"/>`,
        };
      }
      const rand = mulberry32(seed * 9301 + 49297);
      const tileWidth = spacing * 3;
      const tileHeight = spacing * 3;
      const circles: string[] = [];
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const cx = (col + 0.5) * spacing + (rand() - 0.5) * spacing * jitter;
          const cy = (row + 0.5) * spacing + (rand() - 0.5) * spacing * jitter;
          circles.push(
            `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius}" fill="${color}"/>`,
          );
        }
      }
      return { tileWidth, tileHeight, body: circles.join("") };
    },
  },
  grid: {
    id: "grid",
    label: "Grid",
    randomized: false,
    params: [
      {
        kind: "number",
        key: "cellSize",
        label: "Cell size",
        min: 4,
        max: 400,
        default: 48,
      },
      {
        kind: "number",
        key: "lineWidth",
        label: "Line width",
        min: 0.5,
        max: 20,
        step: 0.5,
        default: 1,
      },
      { kind: "color", key: "color", label: "Color", default: "#ffffff" },
    ],
    renderTile: (params) => {
      const size = Math.max(2, num(params.cellSize, 48));
      const lineWidth = Math.max(0.25, num(params.lineWidth, 1));
      const color = escapeAttr(str(params.color, "#ffffff"));
      const half = lineWidth / 2;
      return {
        tileWidth: size,
        tileHeight: size,
        body: `<path d="M 0 ${half} L ${size} ${half} M ${half} 0 L ${half} ${size}" stroke="${color}" stroke-width="${lineWidth}" fill="none"/>`,
      };
    },
  },
  paper: {
    id: "paper",
    label: "Paper",
    randomized: true,
    params: [
      {
        kind: "number",
        key: "density",
        label: "Density",
        min: 1,
        max: 400,
        default: 80,
      },
      {
        kind: "number",
        key: "grainSize",
        label: "Grain size",
        min: 0.5,
        max: 8,
        step: 0.5,
        default: 1.2,
      },
      {
        kind: "number",
        key: "opacity",
        label: "Opacity",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.35,
      },
      { kind: "color", key: "color", label: "Grain color", default: "#000000" },
    ],
    renderTile: (params, seed) => {
      const tile = 256;
      const density = Math.max(1, Math.round(num(params.density, 80)));
      const grain = Math.max(0.25, num(params.grainSize, 1.2));
      const opacity = Math.min(1, Math.max(0, num(params.opacity, 0.35)));
      const color = escapeAttr(str(params.color, "#000000"));
      const rand = mulberry32(seed * 2654435761);
      const dots: string[] = [];
      for (let i = 0; i < density; i += 1) {
        const cx = (rand() * tile).toFixed(2);
        const cy = (rand() * tile).toFixed(2);
        const r = (grain * (0.5 + rand() * 0.5)).toFixed(2);
        dots.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="${opacity.toFixed(2)}"/>`,
        );
      }
      return { tileWidth: tile, tileHeight: tile, body: dots.join("") };
    },
  },
  checker: {
    id: "checker",
    label: "Checker",
    randomized: false,
    params: [
      {
        kind: "number",
        key: "cellSize",
        label: "Cell size",
        min: 4,
        max: 400,
        default: 64,
      },
      { kind: "color", key: "color", label: "Color", default: "#ffffff" },
    ],
    renderTile: (params) => {
      const size = Math.max(2, num(params.cellSize, 64));
      const color = escapeAttr(str(params.color, "#ffffff"));
      return {
        tileWidth: size * 2,
        tileHeight: size * 2,
        body: `<rect x="0" y="0" width="${size}" height="${size}" fill="${color}"/><rect x="${size}" y="${size}" width="${size}" height="${size}" fill="${color}"/>`,
      };
    },
  },
  stripes: {
    id: "stripes",
    label: "Stripes",
    randomized: false,
    params: [
      {
        kind: "number",
        key: "stripeWidth",
        label: "Stripe width",
        min: 1,
        max: 200,
        default: 24,
      },
      {
        kind: "number",
        key: "gap",
        label: "Gap",
        min: 0,
        max: 200,
        default: 24,
      },
      {
        kind: "number",
        key: "angle",
        label: "Angle",
        min: 0,
        max: 180,
        default: 45,
      },
      { kind: "color", key: "color", label: "Color", default: "#ffffff" },
      {
        kind: "boolean",
        key: "diagonal",
        label: "Diagonal layout",
        default: true,
      },
    ],
    renderTile: (params) => {
      const stripe = Math.max(0.5, num(params.stripeWidth, 24));
      const gap = Math.max(0, num(params.gap, 24));
      const color = escapeAttr(str(params.color, "#ffffff"));
      const diagonal = bool(params.diagonal, true);
      const angle = num(params.angle, 45);
      const period = stripe + gap;
      if (!diagonal) {
        return {
          tileWidth: 64,
          tileHeight: period,
          body: `<rect x="0" y="0" width="64" height="${stripe}" fill="${color}" transform="rotate(${angle} 32 ${period / 2})"/>`,
        };
      }
      // Diagonal repeat: tile is square, draw two parallel stripes that tile
      const size = Math.max(period, 16);
      return {
        tileWidth: size,
        tileHeight: size,
        body: `<g transform="rotate(${angle} ${size / 2} ${size / 2})"><rect x="${-size}" y="0" width="${size * 3}" height="${stripe}" fill="${color}"/><rect x="${-size}" y="${period}" width="${size * 3}" height="${stripe}" fill="${color}"/></g>`,
      };
    },
  },
  noise: {
    id: "noise",
    label: "Noise",
    randomized: true,
    params: [
      {
        kind: "select",
        key: "noiseType",
        label: "Noise type",
        options: [
          { value: "fractalNoise", label: "Fractal" },
          { value: "turbulence", label: "Turbulence" },
        ],
        default: "fractalNoise",
      },
      {
        kind: "number",
        key: "scale",
        label: "Scale",
        min: 1,
        max: 400,
        default: 80,
      },
      {
        kind: "number",
        key: "detail",
        label: "Detail",
        min: 1,
        max: 6,
        default: 2,
      },
      {
        kind: "number",
        key: "contrast",
        label: "Contrast",
        min: 0.1,
        max: 8,
        step: 0.1,
        default: 1,
      },
      {
        kind: "number",
        key: "brightness",
        label: "Brightness",
        min: -1,
        max: 1,
        step: 0.05,
        default: 0,
      },
      {
        kind: "number",
        key: "opacity",
        label: "Opacity",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
      },
      { kind: "color", key: "color", label: "Color", default: "#ffffff" },
      {
        kind: "boolean",
        key: "monochrome",
        label: "Monochrome",
        default: true,
      },
    ],
    renderTile: (params, seed, baseId, bounds) => {
      const tileWidth = Math.max(1, Math.round(bounds.width));
      const tileHeight = Math.max(1, Math.round(bounds.height));
      const noiseType =
        str(params.noiseType, "fractalNoise") === "turbulence"
          ? "turbulence"
          : "fractalNoise";
      const scale = Math.max(1, num(params.scale, 80));
      const baseFrequency = (1 / scale).toFixed(4);
      const numOctaves = Math.max(
        1,
        Math.min(8, Math.round(num(params.detail, 2))),
      );
      const contrast = Math.max(0.05, num(params.contrast, 1));
      const brightness = Math.max(-1, Math.min(1, num(params.brightness, 0)));
      const opacity = Math.min(1, Math.max(0, num(params.opacity, 1)));
      const monochrome = bool(params.monochrome, true);
      const seedAttr = Math.floor(seed) % 1000;
      const filterId = `${baseId}-noise-filter`;

      const { r, g, b } = monochrome
        ? hexToRgb01(str(params.color, "#ffffff"))
        : { r: 1, g: 1, b: 1 };
      const cr = (r * contrast).toFixed(3);
      const cg = (g * contrast).toFixed(3);
      const cb = (b * contrast).toFixed(3);
      const br = brightness.toFixed(3);
      const matrix = monochrome
        ? `${cr} ${cr} ${cr} 0 ${br} ${cg} ${cg} ${cg} 0 ${br} ${cb} ${cb} ${cb} 0 ${br} 0 0 0 ${opacity.toFixed(3)} 0`
        : `${contrast.toFixed(3)} 0 0 0 ${br} 0 ${contrast.toFixed(3)} 0 0 ${br} 0 0 ${contrast.toFixed(3)} 0 ${br} 0 0 0 ${opacity.toFixed(3)} 0`;

      const defs = `<filter id="${filterId}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"><feTurbulence type="${noiseType}" baseFrequency="${baseFrequency}" numOctaves="${numOctaves}" seed="${seedAttr}" result="noise"/><feColorMatrix in="noise" type="matrix" values="${matrix}"/></filter>`;

      const body = `<rect width="${tileWidth}" height="${tileHeight}" filter="url(#${filterId})"/>`;

      return { tileWidth, tileHeight, body, defs };
    },
  },
};

export function getPattern2dPreset(id: Pattern2DPresetId): Pattern2DPreset {
  return PATTERN_2D_PRESETS[id] ?? PATTERN_2D_PRESETS.polkaDots;
}

export function getPattern2dDefaults(
  id: Pattern2DPresetId,
): Record<string, JsonValue> {
  const preset = getPattern2dPreset(id);
  const defaults: Record<string, JsonValue> = {};
  for (const param of preset.params) defaults[param.key] = param.default;
  return defaults;
}

export function readPattern2dProps(object: FrameObject): {
  preset: Pattern2DPresetId;
  seed: number;
  params: Record<string, JsonValue>;
} {
  const props = object.props ?? {};
  const presetRaw =
    typeof props.preset === "string" ? props.preset : "polkaDots";
  const preset = (
    presetRaw in PATTERN_2D_PRESETS ? presetRaw : "polkaDots"
  ) as Pattern2DPresetId;
  const seed = num(props.seed, 1);
  const params: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "preset" || key === "seed") continue;
    params[key] = value;
  }
  return { preset, seed, params };
}

export function buildPattern2dSvg(
  object: FrameObject,
  patternId: string,
): string {
  const { preset, seed, params } = readPattern2dProps(object);
  const def = getPattern2dPreset(preset);
  const { width, height } = object.bounds;
  const tile = def.renderTile(params, seed, patternId, { width, height });
  const extraDefs = tile.defs ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${extraDefs}<pattern id="${patternId}" width="${tile.tileWidth}" height="${tile.tileHeight}" patternUnits="userSpaceOnUse">${tile.body}</pattern></defs><rect width="100%" height="100%" fill="url(#${patternId})"/></svg>`;
}
