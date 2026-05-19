/**
 * `useCompositionCamera` resolves a composition's *internal* camera
 * transform. Today the camera lives as a `FrameObject` of type `"camera"`
 * in `part.objects`; the first non-hidden camera in array order is the
 * active viewpoint. This hook reads that object's props and returns a
 * CSS-friendly `CameraPreviewTransform` so compose mode can show the
 * live camera position. Direct mode (Phase 5) reads the same camera via
 * `getActiveCameraObjectProps` to drive its WebGL renderer.
 *
 * Returns `null` when the composition has no camera layer.
 */

import {
  CAMERA_PERSPECTIVE,
  type CameraPreviewTransform,
} from "../../../core/camera";
import { evaluateObjectState } from "../../../core/propertyRegistry";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
  type CompositionClip,
  type FrameObject,
} from "../../../core/types";

export type CompositionCameraInput = {
  part: CompositionClip;
  localTime: number;
};

export function useCompositionCamera(
  input: CompositionCameraInput,
): CameraPreviewTransform | null {
  const props = getActiveCameraObjectProps(input.part, input.localTime);
  if (!props) return null;
  return cameraObjectPropsToPreviewTransform(props);
}

/**
 * Find the active camera FrameObject's props (or null if none).
 * "Active" = first non-hidden object with `type === "camera"`.
 */
export function getActiveCameraObjectProps(
  part: CompositionClip,
  localTime?: number,
): CameraObjectProps | null {
  const cameraObject = findActiveCameraObject(part);
  if (!cameraObject) return null;
  const evaluated =
    localTime !== undefined && cameraObject.tracks
      ? evaluateObjectState(cameraObject, localTime)
      : cameraObject;
  return readCameraObjectProps(evaluated);
}

export function findActiveCameraObject(
  part: CompositionClip,
): FrameObject | null {
  for (const obj of part.objects) {
    if (obj.type === "camera" && !obj.hidden) return obj;
  }
  return null;
}

export function compositionHasCameraLayer(part: CompositionClip): boolean {
  return part.objects.some((obj) => obj.type === "camera" && !obj.hidden);
}

/**
 * Coerce a camera object's `props` JSON into a typed `CameraObjectProps`,
 * falling back to defaults for any missing/invalid field. Robust against
 * partial / malformed data.
 */
export function readCameraObjectProps(object: FrameObject): CameraObjectProps {
  const def = DEFAULT_CAMERA_OBJECT_PROPS;
  const raw = object.props ?? {};
  const readVec3 = (
    v: unknown,
    fallback: { x: number; y: number; z: number },
  ) => {
    if (!v || typeof v !== "object") return { ...fallback };
    const r = v as Record<string, unknown>;
    const num = (k: "x" | "y" | "z") => {
      const n = r[k];
      return typeof n === "number" && Number.isFinite(n) ? n : fallback[k];
    };
    return { x: num("x"), y: num("y"), z: num("z") };
  };
  const num = (key: "fov" | "near" | "far") => {
    const n = (raw as Record<string, unknown>)[key];
    return typeof n === "number" && Number.isFinite(n) ? n : def[key];
  };
  return {
    position: readVec3((raw as Record<string, unknown>).position, def.position),
    rotation: readVec3((raw as Record<string, unknown>).rotation, def.rotation),
    fov: num("fov"),
    near: num("near"),
    far: num("far"),
  };
}

/**
 * Map `CameraObjectProps` to a CSS `CameraPreviewTransform` for compose-mode
 * preview. Same convention as the prior `compositionCameraToPreviewTransform`:
 *   - position is inverted (transform applies to scene, not camera)
 *   - rotation is inverted on X and Z; Y rotation passes through
 *   - z = neutralZ - position.z so default z=1000 is identity
 */
export function cameraObjectPropsToPreviewTransform(
  camera: CameraObjectProps,
): CameraPreviewTransform {
  const neutralZ = DEFAULT_CAMERA_OBJECT_PROPS.position.z;
  return {
    x: 0 - camera.position.x,
    y: 0 - camera.position.y,
    z: neutralZ - camera.position.z,
    scale: 1,
    rotation: 0 - camera.rotation.z,
    rotateX: 0 - camera.rotation.x,
    rotateY: 0 - camera.rotation.y,
    perspective: CAMERA_PERSPECTIVE,
    motionBlur: 0,
  };
}
