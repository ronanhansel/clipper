import type { EvaluatedObjectState } from "../../../../core/propertyRegistry";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../../core/types";

const DEG_TO_RAD = Math.PI / 180;

export type LayerTransformResult = {
  /** Centred frame coords (Three space, y-up). */
  positionX: number;
  positionY: number;
  positionZ: number;
  /** Radians, XYZ Euler order, with Clipper-frame y-down compensation. */
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  /** Pixel size of the layer's bounding box (used to size geometry). */
  width: number;
  height: number;
};

/**
 * Resolve a layer's evaluated state into Three-space transform values.
 *
 * Clipper authoring is in DOM-style y-down pixel coords with the frame's
 * top-left at (0,0). Three-space is y-up with the centre at origin. We
 * convert by subtracting the frame midpoint and flipping y. Rotations
 * around X and Z are negated to match the y-flip; Y is preserved.
 *
 * Per-node code uses `width` + `height` to size geometry and the
 * position/rotation/scale to place an `Object3D`.
 */
export function resolveLayerTransform(
  state: EvaluatedObjectState,
): LayerTransformResult {
  const width = Math.max(1, Math.floor(state.bounds.width));
  const height = Math.max(1, Math.floor(state.bounds.height));
  const transform = state.transform ?? {};

  const translateZ = readNumber(transform, "translateZ", 0);
  const rotateX = readNumber(transform, "rotateX", 0);
  const rotateY = readNumber(transform, "rotateY", 0);
  const rotateZ = readNumber(transform, "rotateZ", 0);
  const scaleX = readNumber(
    transform,
    "scaleX",
    readNumber(transform, "scale", 1),
  );
  const scaleY = readNumber(
    transform,
    "scaleY",
    readNumber(transform, "scale", 1),
  );

  return {
    positionX: state.bounds.x - FRAME_WIDTH / 2 + width / 2,
    positionY: -(state.bounds.y - FRAME_HEIGHT / 2 + height / 2),
    positionZ: translateZ,
    rotationX: -rotateX * DEG_TO_RAD,
    rotationY: rotateY * DEG_TO_RAD,
    rotationZ: -rotateZ * DEG_TO_RAD,
    scaleX,
    scaleY,
    width,
    height,
  };
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
