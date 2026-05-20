import {
  createCameraDofPass,
  type CameraDofPass,
} from "./effects/postprocess/cameraDof";
import {
  type LensPostProcessPass,
  type LensPostProcessUniforms,
  lensPostProcessKind,
} from "./effects/postprocess/lens";
import type { ShapeMaskUniforms } from "./effects/shapeMask";
import type { PostProcessPass } from "./effects/types";
import type { CameraObjectProps } from "./types";

export interface CameraEffectsPassOptions {
  /** Stable id namespace, e.g. the camera FrameObject id. */
  idScope: string;
  /** Output frame size in source pixels (typically FRAME_WIDTH/HEIGHT). */
  frameSize: { width: number; height: number };
}

const disabledChromaticAberrationMask: ShapeMaskUniforms = {
  enabled: false,
  preview: false,
  applyInside: true,
  shape: "circular",
  focus: { x: 0.5, y: 0.5 },
  radiusX: 1,
  radiusY: 1,
  feather: 0,
};

/**
 * Build a `LensPostProcessPass` from a camera's `lens` block. Returns null
 * when no lens feature is enabled. Today only `distortion` and
 * `chromaticAberration` are surfaced through the existing lens shader; the
 * shader's portrait clipping / rim / dim are configured to no-op so the
 * pass behaves like a full-frame post effect.
 *
 * Vignette is intentionally NOT emitted yet (TODO: needs its own shader).
 */
export function getCameraLensPostProcessPass(
  camera: CameraObjectProps,
  options: CameraEffectsPassOptions,
): LensPostProcessPass | null {
  const { lens } = camera;
  if (!lens.distortion.enabled && !lens.chromaticAberration.enabled) {
    return null;
  }

  const radiusPixels =
    Math.max(options.frameSize.width, options.frameSize.height) * 4;

  const uniforms: LensPostProcessUniforms = {
    focus: { x: 0.5, y: 0.5 },
    radiusPixels,
    softness: 1,
    magnification: 1,
    distortion: lens.distortion.enabled ? lens.distortion.amount : 0,
    chromaticAberrationPixels: lens.chromaticAberration.enabled
      ? lens.chromaticAberration.amountPx
      : 0,
    rimWidth: 0,
    rimOpacity: 0,
    dimAmount: 0,
    frameBackground: { r: 0, g: 0, b: 0 },
    chromaticAberrationMask: { ...disabledChromaticAberrationMask },
  };

  return {
    id: `${options.idScope}:camera-lens`,
    sourceLayerId: options.idScope,
    kind: lensPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms,
  };
}

/**
 * Collect every PostProcessPass implied by the camera's effect blocks.
 * DoF is NOT included here — it runs inside the Three.js composer
 * pipeline (`CameraDofComposerPass`) which has direct access to the
 * scene's depth buffer. Only lens effects (distortion + chromatic
 * aberration) remain as DOM post-process passes.
 */
export function getCameraPostProcessPasses(
  camera: CameraObjectProps | null | undefined,
  options: CameraEffectsPassOptions,
): PostProcessPass[] {
  if (!camera) return [];
  const lensPass = getCameraLensPostProcessPass(camera, options);
  return [lensPass].filter((pass): pass is LensPostProcessPass =>
    Boolean(pass),
  );
}

export { createCameraDofPass };
export type { CameraDofPass };
