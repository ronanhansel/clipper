/**
 * Pure depth-of-field optics. No React, no DOM, no Three.
 *
 * Computes the on-screen circle of confusion (CoC) for a layer at a given
 * scene-space distance from a Clipper composition camera, and resolves the
 * scalar subject distance from a camera position+rotation to a layer world
 * position. Used by the DOM compositor to apply per-layer CSS `blur(...)`
 * to layers that fall outside the camera's depth of field.
 */
import type { CameraObjectProps } from "./types";

const DEG_TO_RAD = Math.PI / 180;

/**
 * Compute the on-screen circle of confusion (in source pixels) for a
 * point at world distance `subjectDistance` from a camera with the given
 * sensor / focus / aperture configuration.
 *
 * Optical model: physically-based thin-lens.
 *
 *   focalLength_mm    = sensorHeight / (2 * tan(fov_rad / 2))
 *   apertureDiameter  = focalLength_mm / fNumber
 *   coc_mm            = apertureDiameter * |focalLength_mm * (subject - focus)|
 *                       / ( focus * (subject - focalLength_mm) )
 *   coc_px            = coc_mm * (renderHeight_px / sensorHeight_mm) * blurLevel
 *
 * Distances are in scene units (treated as mm for the purpose of the lens
 * equation — Clipper's world is unitless but consistent, so the ratio
 * subject/focus controls behaviour and the absolute scaling cancels in
 * practice; we keep mm for clarity).
 *
 * Returns 0 when DoF is disabled, when subject ≈ focus, or when any input
 * is non-finite. Result is clamped to [0, dof.maxBlurPx].
 */
export function computeCircleOfConfusionPx(
  camera: CameraObjectProps,
  subjectDistance: number,
  renderHeightPx: number,
): number {
  const dof = camera.dof;
  if (!dof.enabled) return 0;
  if (!Number.isFinite(subjectDistance) || subjectDistance <= 0) return 0;
  if (!Number.isFinite(renderHeightPx) || renderHeightPx <= 0) return 0;
  if (dof.fNumber <= 0) return 0;
  if (camera.sensor.height <= 0 || camera.fov <= 0) return 0;
  if (!Number.isFinite(dof.focusDistance) || dof.focusDistance <= 0) return 0;

  const focus = dof.focusDistance;
  if (Math.abs(subjectDistance - focus) < 1e-6) return 0;

  const fovRad = camera.fov * DEG_TO_RAD;
  const focalLengthMm = camera.sensor.height / (2 * Math.tan(fovRad / 2));
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return 0;

  const apertureDiameter = focalLengthMm / dof.fNumber;
  const denom = focus * (subjectDistance - focalLengthMm);
  if (denom === 0 || !Number.isFinite(denom)) return 0;

  const cocMm =
    (apertureDiameter * Math.abs(focalLengthMm * (subjectDistance - focus))) /
    denom;
  if (!Number.isFinite(cocMm)) return 0;

  const cocPx =
    Math.abs(cocMm) * (renderHeightPx / camera.sensor.height) * dof.blurLevel;
  if (!Number.isFinite(cocPx) || cocPx <= 0) return 0;

  const max = Math.max(0, dof.maxBlurPx);
  return Math.min(cocPx, max);
}

/**
 * Convert a layer's world position and the camera's world position+rotation
 * into the absolute distance from the camera along the camera's forward axis.
 *
 * Coordinate model: composition plane sits at world Z=0. Layers with
 * translateZ=N sit at world Z=N. Clipper world is y-down. For ON-axis (no
 * rotation) cameras this reduces to |camera.position.z - layer.z|. With
 * non-zero camera rotation, project properly so DoF matches the physical
 * view direction.
 *
 * If `cameraRotation` is omitted or all-zero, uses the simple z-axis
 * difference (cheaper hot path).
 */
export function computeLayerSubjectDistance(
  cameraPos: { x: number; y: number; z: number },
  cameraRotation: { x: number; y: number; z: number } | null,
  layerWorld: { x: number; y: number; z: number },
): number {
  if (
    !cameraRotation ||
    (cameraRotation.x === 0 && cameraRotation.y === 0 && cameraRotation.z === 0)
  ) {
    return Math.abs(cameraPos.z - layerWorld.z);
  }

  // Forward in Three-space (y-up) is (0, 0, -1) rotated by camera Euler.
  // Clipper stores rotations under a y-down adapter that negates X and Z
  // (see `applyCompositionCameraToThree`), so we invert that mapping here:
  //   pitch (Three X) = -rot.x
  //   yaw   (Three Y) =  rot.y
  // Roll (Z) does not affect view direction.
  const pitch = -cameraRotation.x * DEG_TO_RAD;
  const yaw = cameraRotation.y * DEG_TO_RAD;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // Forward in Three-space (y-up).
  const fxThree = -cosPitch * sinYaw;
  const fyThree = sinPitch;
  const fzThree = -cosPitch * cosYaw;

  // Convert back to Clipper world (y-down) by negating Y.
  const fx = fxThree;
  const fy = -fyThree;
  const fz = fzThree;

  const dx = cameraPos.x - layerWorld.x;
  const dy = cameraPos.y - layerWorld.y;
  const dz = cameraPos.z - layerWorld.z;

  const distance = dx * fx + dy * fy + dz * fz;
  return Math.abs(distance);
}
