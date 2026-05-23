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
  CAMERA_DOF_MAX_BLUR_PX,
  CAMERA_DOF_MAX_F_NUMBER,
  CAMERA_DOF_MIN_F_NUMBER,
  CAMERA_BOKEH_PRESETS,
  DEFAULT_CAMERA_DOF,
  DEFAULT_CAMERA_AUTO_FOCUS,
  DEFAULT_CAMERA_LENS,
  DEFAULT_CAMERA_LOCK_TARGET,
  DEFAULT_CAMERA_OBJECT_PROPS,
  DEFAULT_CAMERA_POST,
  DEFAULT_CAMERA_SENSOR,
  type CameraBokehPreset,
  type CameraAutoOrient,
  type CameraAutoFocus,
  type CameraDepthOfField,
  type CameraLens,
  type CameraLensChromaticAberration,
  type CameraLensDistortion,
  type CameraLensVignette,
  type CameraObjectProps,
  type CameraPost,
  type CameraPostExposure,
  type CameraPostGrade,
  type CameraPostGrain,
  type CameraPostTonemap,
  type CameraSensor,
  type CameraTonemapMode,
  type CompositionClip,
  type FrameObject,
} from "../../../core/types";

export type CompositionCameraInput = {
  part: CompositionClip;
  localTime: number;
};

export type CameraAutomationContext = Pick<
  CompositionClip,
  "frame" | "objects"
>;

export function useCompositionCamera(
  input: CompositionCameraInput,
): CameraPreviewTransform | null {
  const props = getActiveCameraObjectProps(input.part, input.localTime);
  if (!props) return null;
  return cameraObjectPropsToPreviewTransform(props);
}

/**
 * Find the active camera FrameObject's props (or null if none).
 * "Active" = topmost non-hidden camera whose `props.live` evaluates true.
 *
 * If `localTime` is provided, animated tracks are evaluated and (when
 * applicable) auto-orient along-path is applied so the returned rotation
 * follows the position tangent.
 */
export function getActiveCameraObjectProps(
  part: CompositionClip,
  localTime?: number,
): CameraObjectProps | null {
  const cameraObject = findActiveCameraObject(part, localTime);
  if (!cameraObject) return null;
  if (localTime === undefined) {
    return readCameraObjectProps(cameraObject);
  }
  const props = evaluateCameraObjectPropsAt(cameraObject, localTime);
  return applyCameraTargetAutomation(part, cameraObject, localTime, props);
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

export function applyCameraTargetAutomation(
  part: CameraAutomationContext,
  cameraObject: FrameObject,
  localTime: number,
  resolved: CameraObjectProps,
): CameraObjectProps {
  const withFocus = applyAutoFocus(part, localTime, resolved);
  if (withFocus.autoOrient === "lock") {
    return applyCameraLockTarget(part, localTime, withFocus);
  }
  return applyAutoOrientAlongPath(cameraObject, localTime, withFocus);
}

function applyAutoFocus(
  part: CameraAutomationContext,
  localTime: number,
  resolved: CameraObjectProps,
): CameraObjectProps {
  if (!resolved.autoFocus.enabled || !resolved.autoFocus.targetId)
    return resolved;
  const target = resolveCameraTargetPoint(
    part,
    localTime,
    resolved.autoFocus.targetId,
    { x: 0, y: 0, z: resolved.autoFocus.zOffset },
  );
  if (!target) return resolved;
  const dx = target.x - resolved.position.x;
  const dy = target.y - resolved.position.y;
  const dz = target.z - resolved.position.z;
  const focusDistance = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz));
  return {
    ...resolved,
    dof: { ...resolved.dof, focusDistance },
  };
}

function applyCameraLockTarget(
  part: CameraAutomationContext,
  localTime: number,
  resolved: CameraObjectProps,
): CameraObjectProps {
  if (!resolved.lockTarget.targetId) return resolved;
  const target = resolveCameraTargetPoint(
    part,
    localTime,
    resolved.lockTarget.targetId,
    resolved.lockTarget.offset,
  );
  if (!target) return resolved;
  const rotation = cameraRotationTowardTarget(resolved.position, target);
  if (!rotation) return resolved;
  return { ...resolved, rotation };
}

function resolveCameraTargetPoint(
  part: CameraAutomationContext,
  localTime: number,
  targetId: string,
  offset: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const targetObject = part.objects.find((item) => item.id === targetId);
  if (!targetObject || targetObject.hidden) return null;
  const evaluated = evaluateObjectState(targetObject, localTime);
  const transform =
    evaluated.transform && typeof evaluated.transform === "object"
      ? evaluated.transform
      : {};
  const z =
    typeof transform.translateZ === "number" &&
    Number.isFinite(transform.translateZ)
      ? transform.translateZ
      : 0;
  return {
    x:
      evaluated.bounds.x +
      evaluated.bounds.width / 2 -
      part.frame.width / 2 -
      offset.x,
    y:
      evaluated.bounds.y +
      evaluated.bounds.height / 2 -
      part.frame.height / 2 -
      offset.y,
    z: z + offset.z,
  };
}

function cameraRotationTowardTarget(
  cameraPosition: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const tx = target.x - cameraPosition.x;
  const ty = target.y - cameraPosition.y;
  const tz = target.z - cameraPosition.z;
  const mag = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (mag < 1e-3) return null;
  const fx = tx / mag;
  const fy = -ty / mag;
  const fz = tz / mag;
  const yawY = Math.atan2(-fx, -fz);
  const pitchX = Math.asin(fy);
  const RAD_TO_DEG = 180 / Math.PI;
  return { x: -(pitchX * RAD_TO_DEG), y: yawY * RAD_TO_DEG, z: 0 };
}

export function findActiveCameraObject(
  part: CompositionClip,
  localTime?: number,
): FrameObject | null {
  for (let index = part.objects.length - 1; index >= 0; index -= 1) {
    const obj = part.objects[index];
    if (obj.type !== "camera" || obj.hidden) continue;
    const camera =
      localTime === undefined
        ? readCameraObjectProps(obj)
        : evaluateCameraObjectPropsAt(obj, localTime);
    if (camera.live) return obj;
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
    live: typeof raw.live === "boolean" ? raw.live : def.live,
    position: readVec3(raw.position, def.position),
    rotation: readVec3(raw.rotation, def.rotation),
    fov: num("fov"),
    near: num("near"),
    far: num("far"),
    sensor: readSensor(raw.sensor),
    dof: readDof(raw.dof),
    autoFocus: readAutoFocus(raw.autoFocus),
    autoOrient: readAutoOrient(raw.autoOrient),
    lockTarget: readCameraTargetLink(raw.lockTarget),
    lens: readLens(raw.lens),
    post: readPost(raw.post),
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
  if (!v || typeof v !== "object") return { ...def, bokeh: { ...def.bokeh } };
  const r = v as Record<string, unknown>;
  const num = (k: "focusDistance" | "fNumber" | "maxBlurPx"): number => {
    const n = r[k];
    return typeof n === "number" && Number.isFinite(n) ? n : def[k];
  };
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  return {
    enabled,
    focusDistance: num("focusDistance"),
    fNumber: Math.max(
      CAMERA_DOF_MIN_F_NUMBER,
      Math.min(CAMERA_DOF_MAX_F_NUMBER, num("fNumber")),
    ),
    maxBlurPx: Math.max(0, Math.min(CAMERA_DOF_MAX_BLUR_PX, num("maxBlurPx"))),
    bokeh: readBokeh(r.bokeh),
  };
}

function readAutoFocus(v: unknown): CameraAutoFocus {
  const def = DEFAULT_CAMERA_AUTO_FOCUS;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const zOffset =
    typeof r.zOffset === "number" && Number.isFinite(r.zOffset)
      ? r.zOffset
      : def.zOffset;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : def.enabled,
    targetId: typeof r.targetId === "string" ? r.targetId : def.targetId,
    zOffset,
  };
}

function readBokeh(v: unknown): CameraDepthOfField["bokeh"] {
  const def = DEFAULT_CAMERA_DOF.bokeh;
  if (!v || typeof v !== "object") return { ...def };
  const preset = (v as Record<string, unknown>).preset;
  return {
    preset: isCameraBokehPreset(preset) ? preset : def.preset,
  };
}

function isCameraBokehPreset(v: unknown): v is CameraBokehPreset {
  return (
    typeof v === "string" &&
    (CAMERA_BOKEH_PRESETS as readonly string[]).includes(v)
  );
}

function readAutoOrient(v: unknown): CameraAutoOrient {
  if (v === "along-path" || v === "lock") return v;
  return "off";
}

function readCameraTargetLink(v: unknown): CameraObjectProps["lockTarget"] {
  const def = DEFAULT_CAMERA_LOCK_TARGET;
  if (!v || typeof v !== "object") {
    return { targetId: def.targetId, offset: { ...def.offset } };
  }
  const r = v as Record<string, unknown>;
  const rawOffset =
    r.offset && typeof r.offset === "object"
      ? (r.offset as Record<string, unknown>)
      : {};
  const num = (key: "x" | "y" | "z") =>
    typeof rawOffset[key] === "number" && Number.isFinite(rawOffset[key])
      ? rawOffset[key]
      : def.offset[key];
  return {
    targetId: typeof r.targetId === "string" ? r.targetId : def.targetId,
    offset: { x: num("x"), y: num("y"), z: num("z") },
  };
}

function readLens(v: unknown): CameraLens {
  const def = DEFAULT_CAMERA_LENS;
  if (!v || typeof v !== "object") {
    return {
      distortion: { ...def.distortion },
      chromaticAberration: { ...def.chromaticAberration },
      vignette: { ...def.vignette },
    };
  }
  const r = v as Record<string, unknown>;
  return {
    distortion: readLensDistortion(r.distortion),
    chromaticAberration: readLensChromaticAberration(r.chromaticAberration),
    vignette: readLensVignette(r.vignette),
  };
}

function readLensDistortion(v: unknown): CameraLensDistortion {
  const def = DEFAULT_CAMERA_LENS.distortion;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const amount =
    typeof r.amount === "number" && Number.isFinite(r.amount)
      ? r.amount
      : def.amount;
  return { enabled, amount };
}

function readLensChromaticAberration(
  v: unknown,
): CameraLensChromaticAberration {
  const def = DEFAULT_CAMERA_LENS.chromaticAberration;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const amountPx =
    typeof r.amountPx === "number" && Number.isFinite(r.amountPx)
      ? r.amountPx
      : def.amountPx;
  return { enabled, amountPx };
}

function readLensVignette(v: unknown): CameraLensVignette {
  const def = DEFAULT_CAMERA_LENS.vignette;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const amount =
    typeof r.amount === "number" && Number.isFinite(r.amount)
      ? r.amount
      : def.amount;
  const feather =
    typeof r.feather === "number" && Number.isFinite(r.feather)
      ? r.feather
      : def.feather;
  return { enabled, amount, feather };
}

function readPost(v: unknown): CameraPost {
  const def = DEFAULT_CAMERA_POST;
  if (!v || typeof v !== "object") {
    return {
      exposure: { ...def.exposure },
      tonemap: { ...def.tonemap },
      grade: { ...def.grade },
      grain: { ...def.grain },
    };
  }
  const r = v as Record<string, unknown>;
  return {
    exposure: readPostExposure(r.exposure),
    tonemap: readPostTonemap(r.tonemap),
    grade: readPostGrade(r.grade),
    grain: readPostGrain(r.grain),
  };
}

function readPostExposure(v: unknown): CameraPostExposure {
  const def = DEFAULT_CAMERA_POST.exposure;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const ev = typeof r.ev === "number" && Number.isFinite(r.ev) ? r.ev : def.ev;
  return { enabled, ev };
}

const TONEMAP_MODES: readonly CameraTonemapMode[] = [
  "reinhard",
  "aces",
  "filmic",
];

function readPostTonemap(v: unknown): CameraPostTonemap {
  const def = DEFAULT_CAMERA_POST.tonemap;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const mode =
    typeof r.mode === "string" &&
    (TONEMAP_MODES as readonly string[]).includes(r.mode)
      ? (r.mode as CameraTonemapMode)
      : def.mode;
  return { enabled, mode };
}

function readPostGrade(v: unknown): CameraPostGrade {
  const def = DEFAULT_CAMERA_POST.grade;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const num = (k: "lift" | "gamma" | "gain"): number => {
    const n = r[k];
    return typeof n === "number" && Number.isFinite(n) ? n : def[k];
  };
  return {
    enabled,
    lift: num("lift"),
    gamma: num("gamma"),
    gain: num("gain"),
  };
}

function readPostGrain(v: unknown): CameraPostGrain {
  const def = DEFAULT_CAMERA_POST.grain;
  if (!v || typeof v !== "object") return { ...def };
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : def.enabled;
  const num = (k: "amount" | "size"): number => {
    const n = r[k];
    return typeof n === "number" && Number.isFinite(n) ? n : def[k];
  };
  return { enabled, amount: num("amount"), size: num("size") };
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
