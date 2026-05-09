import type { AdjustmentEffectPackage } from "../../../types";
import { getClampedParam, getOverlayTarget, getNumericParam } from "../helpers";
import { createPracticalArtifactOverlays } from "../practicalArtifacts";

const stockLooks = {
  warmNegative: {
    brightness: 1.01,
    contrast: 1.08,
    saturation: 0.95,
    hue: -2,
    sepia: 0.08,
  },
  printFilm: {
    brightness: 0.99,
    contrast: 1.16,
    saturation: 1.08,
    hue: 1,
    sepia: 0.05,
  },
  reversal: {
    brightness: 1.02,
    contrast: 1.24,
    saturation: 1.18,
    hue: -4,
    sepia: 0.02,
  },
  fadedArchive: {
    brightness: 1.06,
    contrast: 0.92,
    saturation: 0.72,
    hue: 6,
    sepia: 0.2,
  },
  monochrome: {
    brightness: 1,
    contrast: 1.18,
    saturation: 0,
    hue: 0,
    sepia: 0.04,
  },
} as const;

type StockLook = keyof typeof stockLooks;

export const filmEmulationLogic = {
  applyVisualStyle: ({ sceneTime, frameRate, layer }) => {
    const intensity = getClampedParam(layer, "intensity", 0.82, 0, 1);
    const stock = getStockLook(String(layer.effect.params?.stock ?? ""));
    const warmth = getClampedParam(layer, "warmth", 0.42, -1, 1);
    const contrast = getClampedParam(layer, "contrast", 0.18, -1, 1);
    const saturation = getClampedParam(layer, "saturation", -0.08, -1, 1);
    const fade = getClampedParam(layer, "fade", 0.1, 0, 1);
    const look = stockLooks[stock];
    const brightness = look.brightness + fade * 0.08 * intensity;
    const contrastValue =
      look.contrast + contrast * 0.32 * intensity - fade * 0.18;
    const saturationValue =
      look.saturation === 0
        ? 0
        : Math.max(0, look.saturation + saturation * 0.42 * intensity);
    const sepia = Math.max(0, look.sepia + warmth * 0.12 + fade * 0.16);

    return {
      filter: [
        `brightness(${round(brightness)})`,
        `contrast(${round(contrastValue)})`,
        `saturate(${round(saturationValue)})`,
        `sepia(${round(sepia)})`,
        `hue-rotate(${round(look.hue - warmth * 5)}deg)`,
      ].join(" "),
      overlays: createPracticalArtifactOverlays({
        id: layer.id,
        target: getOverlayTarget(layer),
        sceneTime,
        frameRate,
        seed: getNumericParam(layer, "seed", 17),
        intensity,
        grain: getClampedParam(layer, "grain", 0.54, 0, 1.4),
        grainSize: getClampedParam(layer, "grainSize", 1, 0.35, 3),
        dust: getClampedParam(layer, "dust", 0.18, 0, 1),
        scratches: getClampedParam(layer, "scratches", 0.12, 0, 1),
        halation: getClampedParam(layer, "halation", 0.34, 0, 1),
        flicker: getClampedParam(layer, "flicker", 0.18, 0, 1),
        gateWeave: getClampedParam(layer, "gateWeave", 0.1, 0, 1),
        vignette: getClampedParam(layer, "vignette", 0.22, 0, 1),
        warmth,
        motionSpeed: getClampedParam(layer, "motionSpeed", 1, 0, 4),
        grainSpeed: getClampedParam(layer, "grainSpeed", 1, 0, 4),
        dustSpeed: getClampedParam(layer, "dustSpeed", 1, 0, 4),
        scratchSpeed: getClampedParam(layer, "scratchSpeed", 1, 0, 4),
        flickerSpeed: getClampedParam(layer, "flickerSpeed", 1, 0, 4),
        weaveSpeed: getClampedParam(layer, "weaveSpeed", 1, 0, 4),
      }),
    };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;

function getStockLook(value: string): StockLook {
  return value in stockLooks ? (value as StockLook) : "warmNegative";
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
