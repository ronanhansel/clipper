/**
 * Depth-of-field postprocess pass. Physically-based CoC + bokeh blur
 * with circular kernel sampling. Generates its own depth texture internally
 * using a depth-only quad scene, then runs a combined CoC+bokeh shader.
 */
import { evaluateObjectState } from "../../propertyRegistry";
import type { CameraObjectProps, CompositionClip } from "../../types";

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
  /** Blur level multiplier. */
  blurLevel: number;
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

export type CameraDofDepthQuad = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  translateZ: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scaleX: number;
  scaleY: number;
};

export type CameraDofPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof cameraDofPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: CameraDofUniforms;
  depthQuads: CameraDofDepthQuad[];
};

/**
 * Create a DoF pass from camera props. Returns null when DoF is disabled
 * or the camera props are invalid.
 */
export function createCameraDofPass(
  camera: CameraObjectProps,
  idScope: string,
  depthQuads: CameraDofDepthQuad[] = [],
): CameraDofPass | null {
  if (!camera.dof.enabled) return null;
  if (camera.dof.fNumber <= 0) return null;
  if (
    !Number.isFinite(camera.dof.focusDistance) ||
    camera.dof.focusDistance <= 0
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
      fNumber: camera.dof.fNumber,
      blurLevel: camera.dof.blurLevel,
      maxBlurPx: Math.max(0, camera.dof.maxBlurPx),
      cameraPos: { ...camera.position },
      cameraRotation: { ...camera.rotation },
      near: camera.near,
      far: camera.far,
    },
    depthQuads,
  };
}

export function buildCameraDofDepthQuads(
  part: CompositionClip | null | undefined,
  localTime: number,
): CameraDofDepthQuad[] {
  if (!part) return [];
  const quads: CameraDofDepthQuad[] = [];
  for (const object of part.objects) {
    if (object.hidden || object.type === "camera") continue;
    const evaluated = evaluateObjectState(object, localTime);
    const transform = evaluated.transform;
    quads.push({
      id: object.id,
      x: evaluated.bounds.x,
      y: evaluated.bounds.y,
      width: evaluated.bounds.width,
      height: evaluated.bounds.height,
      translateZ: readNumber(transform, "translateZ", 0),
      rotateX: readNumber(transform, "rotateX", 0),
      rotateY: readNumber(transform, "rotateY", 0),
      rotateZ: readNumber(transform, "rotateZ", 0),
      scaleX: readNumber(
        transform,
        "scaleX",
        readNumber(transform, "scale", 1),
      ),
      scaleY: readNumber(
        transform,
        "scaleY",
        readNumber(transform, "scale", 1),
      ),
    });
  }
  return quads;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
