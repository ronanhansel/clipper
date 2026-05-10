import type { AdjustmentLayer } from "../types";

export const shapeMaskPreviewCssColor = "rgba(255, 89, 89, 0.35)";
export const shapeMaskPreviewRgb = { r: 1, g: 0.35, b: 0.35 } as const;
export const shapeMaskPreviewOpacity = 0.35;

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

export function getShapeMaskUniforms(
  layer: Pick<AdjustmentLayer, "effect">,
  config: ShapeMaskParamConfig,
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

export function getShapeMaskOverlayStyle(
  mask: ShapeMaskUniforms,
): Record<string, string> {
  if (!mask.enabled) return {};
  const center = `${round(mask.focus.x * 100)}% ${round(mask.focus.y * 100)}%`;
  const visible = mask.applyInside ? "#000" : "transparent";
  const hidden = mask.applyInside ? "transparent" : "#000";
  const shape =
    mask.shape === "ellipsoid"
      ? `ellipse ${round(mask.radiusX)}px ${round(mask.radiusY)}px`
      : `circle ${round(mask.radiusX)}px`;
  const edge = `calc(100% + ${round(mask.feather)}px)`;
  const maskImage = `radial-gradient(${shape} at ${center}, ${visible} 0 100%, ${hidden} ${edge})`;
  return { maskImage, WebkitMaskImage: maskImage };
}

function getFiniteParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
