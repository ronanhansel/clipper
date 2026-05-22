/**
 * Camera DoF pass definition. Depth texture is provided by the caller
 * (CompositionRenderer's depth buffer in preview/export).
 */
import {
  CAMERA_DOF_MAX_BLUR_PX,
  CAMERA_DOF_MIN_F_NUMBER,
  type CameraObjectProps,
} from "../../types";

export const cameraDofPostProcessKind =
  "clipper.postprocess.cameraDof" as const;

export type CameraDofUniforms = {
  /** Camera sensor height (mm) for CoC calc. */
  sensorHeight: number;
  /** Camera FOV (degrees). */
  fov: number;
  /** Focus distance (scene units). */
  focusDistance: number;
  /** f-number. */
  fNumber: number;
  /** Max blur radius (px). */
  maxBlurPx: number;
  /** Camera position (scene units). */
  cameraPos: { x: number; y: number; z: number };
  /** Camera rotation (degrees, XYZ Euler). */
  cameraRotation: { x: number; y: number; z: number };
  /** Camera clip planes for the synthetic depth scene. */
  near: number;
  far: number;
};

export type CameraDofPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof cameraDofPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: CameraDofUniforms;
};

/**
 * Create a DoF pass from camera props. Returns null when DoF is disabled
 * or the camera props are invalid. Depth is provided by the renderer.
 */
export function createCameraDofPass(
  camera: CameraObjectProps,
  idScope: string,
): CameraDofPass | null {
  if (!camera.dof.enabled) return null;
  if (camera.dof.fNumber <= 0) return null;
  if (
    !Number.isFinite(camera.dof.focusDistance) ||
    camera.dof.focusDistance < 0
  )
    return null;

  return {
    id: `${idScope}:camera-dof`,
    sourceLayerId: idScope,
    kind: cameraDofPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: {
      sensorHeight: camera.sensor.height,
      fov: camera.fov,
      focusDistance: camera.dof.focusDistance,
      fNumber: Math.max(CAMERA_DOF_MIN_F_NUMBER, camera.dof.fNumber),
      maxBlurPx: Math.max(
        0,
        Math.min(CAMERA_DOF_MAX_BLUR_PX, camera.dof.maxBlurPx),
      ),
      cameraPos: { ...camera.position },
      cameraRotation: { ...camera.rotation },
      near: camera.near,
      far: camera.far,
    },
  };
}
