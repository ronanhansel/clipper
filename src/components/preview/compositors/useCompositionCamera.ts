/**
 * `useCompositionCamera` resolves a composition's *internal* camera
 * transform — the AE-style camera that lives inside a composition and bakes
 * into the composition's flat output before any scene-level wrapper applies.
 *
 * v0.2.19 returns `null` for every composition. The seam exists so the
 * inner-camera authoring feature (AGENTS-camera-feature, brainstorm 2026-05)
 * can land without touching the backend selector or scene compositor.
 *
 * Contract:
 *   - Inputs: the composition's own `motionMarkers` plus `localTime`.
 *   - Output: a `CameraPreviewTransform` to apply on the composition host
 *     (inside `CompositionCompositor`, before the backend renders), or
 *     `null` when the composition has no inner camera authored.
 *   - The scene camera (`SceneCompositor`) MUST stay independent — inner
 *     and outer transforms compose multiplicatively, never replace each
 *     other.
 *
 * When the inner-camera feature lands, this hook will:
 *   1. Filter `part.motionMarkers` to inner-camera-tagged markers.
 *   2. Reuse `getLayeredCameraPreviewTransform` from `core/camera.ts` with
 *      a per-composition `motionLayers` definition (currently scene-only).
 *   3. Return the resolved transform.
 */

import type { CameraPreviewTransform } from "../../../core/camera";
import type { CompositionClip } from "../../../core/types";

export type CompositionCameraInput = {
  part: CompositionClip;
  localTime: number;
};

export function useCompositionCamera(
  _input: CompositionCameraInput,
): CameraPreviewTransform | null {
  return null;
}
