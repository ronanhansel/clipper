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
  DEFAULT_CAMERA_DOF,
  DEFAULT_CAMERA_OBJECT_PROPS,
  DEFAULT_CAMERA_SENSOR,
  type CameraAutoOrient,
  type CameraDepthOfField,
  type CameraObjectProps,
  type CameraSensor,
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
 *
 * If `localTime` is provided, animated tracks are evaluated and (when
 * applicable) auto-orient along-path is applied so the returned rotation
 * follows the position tangent.
 */
export function getActiveCameraObjectProps(
  part: CompositionClip,
  localTime?: number,
): CameraObjectProps | null {
  const cameraObject = findActiveCameraObject(part);
  if (!cameraObject) return null;
  if (localTime === undefined) {
    return readCameraObjectProps(cameraObject);
  }
  const props = evaluateCameraObjectPropsAt(cameraObject, localTime);
  return applyAutoOrientAlongPath(cameraObject, localTime, props);
}

/**
 * Evaluate a camera FrameObject's full CameraObjectProps at a given time.
 * Combines `evaluateObjectState` (for animated tracks) with default coercion
 * of any missing fields. Caller-side single source of truth — used by both
 * the inspector and the runtime resolver.
 */
export function evaluateCameraObjectPropsAt(
  cameraObject: FrameObject,
  localTime: number,
): CameraObjectProps {
  const evaluated = cameraObject.tracks
    ? evaluateObjectState(cameraObject, localTime)
    : cameraObject;
  return readCameraObjectProps(evaluated);
}

/**
 * If the camera's `autoOrient` is "along-path", override its rotation so
 * the camera's forward axis aligns with the position track tangent at
 * `localTime`. Tangent is sampled by forward-difference (dt = 1ms) on the
 * resolved position. If the tangent magnitude is < 1e-3 (camera stationary
 * at this instant), the user-authored rotation is preserved.
 *
 * Coordinate convention: Clipper world is y-down. The returned rotation
 * is XYZ Euler degrees that, when fed through `applyCompositionCameraToThree`
 * (which negates X and Z and preserves Y), produces a Three camera whose
 * -Z forward axis matches the tangent direction.
 */
export function applyAutoOrientAlongPath(
  cameraObject: FrameObject,
  localTime: number,
  resolved: CameraObjectProps,
): CameraObjectProps {
  if (resolved.autoOrient !== "along-path") return resolved;
  const ahead = evaluateCameraObjectPropsAt(cameraObject, localTime + 1);
  const tx = ahead.position.x - resolved.position.x;
  const ty = ahead.position.y - resolved.position.y;
  const tz = ahead.position.z - resolved.position.z;
  const mag = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (mag < 1e-3) return resolved;
  // Convert Clipper world (y-down) to Three space (y-up) for the look-along.
  const fx = tx / mag;
  const fy = -ty / mag;
  const fz = tz / mag;
  const yawY = Math.atan2(fx, fz);
  const pitchX = -Math.asin(fy);
  const RAD_TO_DEG = 180 / Math.PI;
  // Invert through the y-down adapter in `applyCompositionCameraToThree`,
  // which negates rotation.x and rotation.z and preserves rotation.y.
  const pitchDeg = -(pitchX * RAD_TO_DEG);
  const yawDeg = yawY * RAD_TO_DEG;
  return {
    ...resolved,
    rotation: { x: pitchDeg, y: yawDeg, z: 0 },
  };
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
  const raw = (object.props ?? {}) as Record<string, unknown>;
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
    const n = raw[key];
    return typeof n === "number" && Number.isFinite(n) ? n : def[key];
  };
  return {
    position: readVec3(raw.position, def.position),
    rotation: readVec3(raw.rotation, def.rotation),
    fov: num("fov"),
    near: num("near"),
    far: num("far"),
    sensor: readSensor(raw.sensor),
    dof: readDof(raw.dof),
    autoOrient: readAutoOrient(raw.autoOrient),
  };
}

function readSensor(v: unknown): CameraSensor {
  const def = DEFAULT_CAMERA_SENSOR;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const num = (k: "width" | "height") => {
    const n = r[k];
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : def[k];
  };
  return { width: num("width"), height: num("height") };
}

function readDof(v: unknown): CameraDepthOfField {
  const def = DEFAULT_CAMERA_DOF;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const num = (
    k: "focusDistance" | "fNumber" | "blurLevel" | "maxBlurPx",
  ): number => {
    const n = r[k];
    return typeof n === "number" && Number.isFinite(n) ? n : def[k];
  };
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  return {
    enabled,
    focusDistance: num("focusDistance"),
    fNumber: num("fNumber"),
    blurLevel: num("blurLevel"),
    maxBlurPx: num("maxBlurPx"),
  };
}

function readAutoOrient(v: unknown): CameraAutoOrient {
  return v === "along-path" ? "along-path" : "off";
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
