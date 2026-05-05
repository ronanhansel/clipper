import type { AdjustmentEffectPackage, AdjustmentVisualOverlay } from "../../../types";
import { clamp, getClampedParam, getOverlayTarget } from "../helpers";

const frameAspectRatio = 16 / 9;

export const lenseLogic = {
  applyVisualStyle: ({ layer }) => {
    const focusX = getClampedParam(layer, "focusX", 50, 0, 100);
    const focusY = getClampedParam(layer, "focusY", 50, 0, 100);
    const radius = getClampedParam(layer, "radius", 34, 8, 90);
    const softness = getClampedParam(layer, "softness", 0.62, 0.05, 1);
    const magnification = getClampedParam(layer, "magnification", 1.12, 0.75, 1.65);
    const distortion = getClampedParam(layer, "distortion", 0.32, 0, 1);
    const chromaticAberration = getClampedParam(layer, "chromaticAberration", 0.55, 0, 1);
    const rimWidth = getClampedParam(layer, "rimWidth", 0.18, 0.04, 0.45);
    const rimOpacity = getClampedParam(layer, "rimOpacity", 0.48, 0, 1);
    const dimAmount = getClampedParam(layer, "dimAmount", 0.28, 0, 0.8);
    const rimStart = clamp(100 - rimWidth * 100, 40, 96);
    const rimDistortionScale = 1 + distortion * 0.18;
    const distortionBlur = distortion * 7;
    const aberrationShift = chromaticAberration * (6 + distortion * 10);
    const aberrationBlur = chromaticAberration * 3;
    const lensClip = `ellipse(${radius}% ${radius * frameAspectRatio}% at ${focusX}% ${focusY}%)`;
    const lensTransform = `translate(-50%, -50%) scale(${magnification}) scale(${rimDistortionScale})`;

    const overlays: AdjustmentVisualOverlay[] = [
        {
          id: `${layer.id}:lense-dim`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: `radial-gradient(ellipse ${radius}% ${radius * frameAspectRatio}% at ${focusX}% ${focusY}%, transparent 0 ${Math.round(100 - softness * 42)}%, rgba(0,0,0,0.92) 100%)`,
            opacity: dimAmount,
          },
        },
        {
          id: `${layer.id}:lense-core`,
          target: getOverlayTarget(layer),
          style: {
            backdropFilter: `blur(${distortionBlur}px) saturate(${1 + chromaticAberrationBoost(chromaticAberration)}) contrast(${1 + distortion * 0.18})`,
            clipPath: lensClip,
            maskImage: `radial-gradient(ellipse at ${focusX}% ${focusY}%, #000 0 ${Math.round(100 - softness * 28)}%, transparent 100%)`,
            opacity: clamp(0.72 + distortion * 0.24, 0, 1),
            transform: lensTransform,
            transformOrigin: `${focusX}% ${focusY}%`,
          },
        },
        {
          id: `${layer.id}:lense-red-edge`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: `radial-gradient(ellipse ${radius}% ${radius * frameAspectRatio}% at calc(${focusX}% + ${aberrationShift}px) ${focusY}%, transparent 0 ${rimStart}%, rgba(255,46,92,0.9) ${Math.min(rimStart + 3, 99)}%, transparent 100%)`,
            filter: `blur(${aberrationBlur}px)`,
            mixBlendMode: "screen",
            opacity: chromaticAberration * rimOpacity,
          },
        },
        {
          id: `${layer.id}:lense-cyan-edge`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: `radial-gradient(ellipse ${radius}% ${radius * frameAspectRatio}% at calc(${focusX}% - ${aberrationShift}px) ${focusY}%, transparent 0 ${rimStart}%, rgba(47,226,255,0.9) ${Math.min(rimStart + 3, 99)}%, transparent 100%)`,
            filter: `blur(${aberrationBlur}px)`,
            mixBlendMode: "screen",
            opacity: chromaticAberration * rimOpacity,
          },
        },
        {
          id: `${layer.id}:lense-rim`,
          target: getOverlayTarget(layer),
          style: {
            backgroundImage: `radial-gradient(ellipse ${radius}% ${radius * frameAspectRatio}% at ${focusX}% ${focusY}%, transparent 0 ${rimStart}%, rgba(255,255,255,0.52) ${Math.min(rimStart + 2, 99)}%, rgba(0,0,0,0.22) 100%)`,
            boxShadow: `inset 0 0 ${Math.round(80 * distortion)}px rgba(255,255,255,0.16)`,
            mixBlendMode: "overlay",
            opacity: rimOpacity,
          },
        },
      ];

    return { overlays };
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applyVisualStyle">>;

function chromaticAberrationBoost(value: number) {
  return value * 0.32;
}
