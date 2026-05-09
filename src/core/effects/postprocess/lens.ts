import type { AdjustmentLayer } from "../../types";

export const lensPostProcessKind = "clipper.postprocess.lens" as const;

export type ShapeMaskParamConfig = {
  enabledKey: string;
  previewKey: string;
  invertKey: string;
  shapeKey: string;
  focusXKey: string;
  focusYKey: string;
  radiusKey: string;
  radiusXKey: string;
  radiusYKey: string;
  featherKey: string;
  fallbacks: {
    enabled: boolean;
    preview: boolean;
    invert: boolean;
    radius: number;
    radiusX: number;
    radiusY: number;
    feather: number;
    focusX: number;
    focusY: number;
  };
};

export const chromaticAberrationMaskConfig: ShapeMaskParamConfig = {
  enabledKey: "chromaticAberrationUseMask",
  previewKey: "chromaticAberrationMaskPreview",
  invertKey: "chromaticAberrationMaskInvert",
  shapeKey: "chromaticAberrationMaskShape",
  focusXKey: "chromaticAberrationMaskFocusX",
  focusYKey: "chromaticAberrationMaskFocusY",
  radiusKey: "chromaticAberrationMaskRadius",
  radiusXKey: "chromaticAberrationMaskRadiusX",
  radiusYKey: "chromaticAberrationMaskRadiusY",
  featherKey: "chromaticAberrationMaskFeather",
  fallbacks: {
    enabled: false,
    preview: false,
    invert: false,
    radius: 200,
    radiusX: 200,
    radiusY: 200,
    feather: 20,
    focusX: 50,
    focusY: 50,
  },
};

export type ShapeMaskUniforms = {
  enabled: boolean;
  preview: boolean;
  applyInside: boolean;
  shape: "circular" | "ellipsoid";
  focus: { x: number; y: number };
  radiusX: number;
  radiusY: number;
  feather: number;
};

export type LensPostProcessUniforms = {
  focus: { x: number; y: number };
  radiusPixels: number;
  softness: number;
  magnification: number;
  distortion: number;
  chromaticAberrationPixels: number;
  rimWidth: number;
  rimOpacity: number;
  dimAmount: number;
  frameBackground: { r: number; g: number; b: number };
  chromaticAberrationMask: ShapeMaskUniforms;
};

export type LensPostProcessPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof lensPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: LensPostProcessUniforms;
};

export function createLensPostProcessPass(
  layer: AdjustmentLayer,
  frameSize: { width: number; height: number },
): LensPostProcessPass {
  return {
    id: `${layer.id}:lens-postprocess`,
    sourceLayerId: layer.id,
    kind: lensPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: getLensPostProcessUniforms(layer, frameSize),
  };
}

export function withLensFrameBackground(
  pass: LensPostProcessPass,
  background: unknown,
): LensPostProcessPass {
  return {
    ...pass,
    uniforms: {
      ...pass.uniforms,
      frameBackground: parseLensFrameBackground(background),
    },
  };
}

export function parseLensFrameBackground(background: unknown) {
  if (typeof background !== "string") return { r: 0, g: 0, b: 0 };
  const value = background.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex;
    return {
      r: Number.parseInt(full.slice(0, 2), 16) / 255,
      g: Number.parseInt(full.slice(2, 4), 16) / 255,
      b: Number.parseInt(full.slice(4, 6), 16) / 255,
    };
  }
  const rgb = value.match(
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/i,
  );
  if (rgb)
    return {
      r: clampColor(Number(rgb[1]) / 255),
      g: clampColor(Number(rgb[2]) / 255),
      b: clampColor(Number(rgb[3]) / 255),
    };
  return { r: 0, g: 0, b: 0 };
}

export function getLensPostProcessUniforms(
  layer: Pick<AdjustmentLayer, "effect">,
  frameSize: { width: number; height: number },
): LensPostProcessUniforms {
  const width = positiveFinite(frameSize.width, 1);
  const height = positiveFinite(frameSize.height, 1);
  const radiusPercent = getClampedParam(layer, "radius", 34, 1, 200);
  const distortion = getFiniteParam(layer, "distortion", 0.32);

  return {
    focus: {
      x: getFiniteParam(layer, "focusX", 50) / 100,
      y: getFiniteParam(layer, "focusY", 50) / 100,
    },
    radiusPixels: Math.max(1, (width * radiusPercent) / 100),
    softness: getFiniteParam(layer, "softness", 0.62),
    magnification: getFiniteParam(layer, "magnification", 1.12),
    distortion,
    chromaticAberrationPixels: getFiniteParam(
      layer,
      "chromaticAberration",
      0.55,
    ),
    rimWidth: getFiniteParam(layer, "rimWidth", 0.18),
    rimOpacity: getFiniteParam(layer, "rimOpacity", 0.48),
    dimAmount: getFiniteParam(layer, "dimAmount", 0.28),
    frameBackground: { r: 0, g: 0, b: 0 },
    chromaticAberrationMask: getShapeMaskUniforms(
      layer,
      chromaticAberrationMaskConfig,
    ),
  };
}

function getFiniteParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getClampedParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function positiveFinite(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampColor(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export function getShapeMaskUniforms(
  layer: Pick<AdjustmentLayer, "effect">,
  config: ShapeMaskParamConfig = chromaticAberrationMaskConfig,
): ShapeMaskUniforms {
  const {
    enabledKey,
    previewKey,
    invertKey,
    shapeKey,
    focusXKey,
    focusYKey,
    radiusKey,
    radiusXKey,
    radiusYKey,
    featherKey,
    fallbacks,
  } = config;

  const enabled = Boolean(
    layer.effect.params?.[enabledKey] ?? fallbacks.enabled,
  );
  const preview = Boolean(
    layer.effect.params?.[previewKey] ?? fallbacks.preview,
  );
  const invert = Boolean(layer.effect.params?.[invertKey] ?? fallbacks.invert);
  const applyInside = !invert;

  const rawShape = String(layer.effect.params?.[shapeKey] ?? "");
  const shape: "circular" | "ellipsoid" =
    rawShape === "ellipsoid" ? "ellipsoid" : "circular";

  const radius = getFiniteParam(layer, radiusKey, fallbacks.radius);
  const radiusX =
    shape === "ellipsoid"
      ? getFiniteParam(layer, radiusXKey, fallbacks.radiusX)
      : radius;
  const radiusY =
    shape === "ellipsoid"
      ? getFiniteParam(layer, radiusYKey, fallbacks.radiusY)
      : radius;
  const feather = getFiniteParam(layer, featherKey, fallbacks.feather);
  const focusX = getFiniteParam(layer, focusXKey, fallbacks.focusX);
  const focusY = getFiniteParam(layer, focusYKey, fallbacks.focusY);

  return {
    enabled,
    preview,
    applyInside,
    shape,
    focus: { x: focusX / 100, y: focusY / 100 },
    radiusX: Math.max(1, radiusX),
    radiusY: Math.max(1, radiusY),
    feather: Math.max(0, feather),
  };
}
