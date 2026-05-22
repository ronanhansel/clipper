import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";

/**
 * Mutable subset of THREE.PerspectiveCamera that we update each render.
 * Duck-typed so we can unit-test without instantiating WebGLRenderer.
 */
export interface ThreePerspectiveCameraLike {
  position: {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): unknown;
  };
  rotation: { x: number; y: number; z: number; order: string };
  fov: number;
  aspect: number;
  near: number;
  far: number;
  filmGauge: number;
  updateProjectionMatrix(): void;
  updateMatrixWorld?(force?: boolean): void;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Apply camera object props to a Three.js PerspectiveCamera-like object.
 *
 * Coordinate system: Clipper frame coords are y-down (DOM convention) while
 * Three.js is y-up. We negate the camera's y position so that
 * `camera.position.y > 0` (visually below center) maps to a Three-space
 * position below the scene. Rotations around the X and Z axes are negated
 * for the same reason; Y rotation is preserved.
 *
 * The caller supplies `aspect = frameWidth / frameHeight` so this helper
 * stays pure and re-runs on viewport resize.
 *
 * If `camera` is null, the default identity camera is applied so the
 * renderer still produces a valid view.
 */
export function applyCompositionCameraToThree(
  target: ThreePerspectiveCameraLike,
  camera: CameraObjectProps | null,
  aspect: number,
): void {
  const c = camera ?? DEFAULT_CAMERA_OBJECT_PROPS;
  target.position.set(c.position.x, -c.position.y, c.position.z);
  target.rotation.order = "XYZ";
  target.rotation.x = -c.rotation.x * DEG_TO_RAD;
  target.rotation.y = c.rotation.y * DEG_TO_RAD;
  target.rotation.z = -c.rotation.z * DEG_TO_RAD;
  target.fov = c.fov;
  target.aspect = aspect;
  target.near = c.near;
  target.far = c.far;
  target.filmGauge = c.sensor.width;
  target.updateProjectionMatrix();
  target.updateMatrixWorld?.(true);
}
