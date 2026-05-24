import * as THREE from "three";

const DEG_TO_RAD = Math.PI / 180;
const LIGHT_DIRECTION_DISTANCE = 900;

export type LightWorldPoint = { x: number; y: number; z: number };

export function resolveLightTargetFromTransform(
  position: LightWorldPoint,
  transform: Record<string, unknown>,
  fallbackTarget: LightWorldPoint,
): LightWorldPoint {
  const rotateX = readNumber(transform.rotateX, 0);
  const rotateY = readNumber(transform.rotateY, 0);
  const rotateZ = readNumber(transform.rotateZ, 0);
  if (
    Math.abs(rotateX) < 0.0001 &&
    Math.abs(rotateY) < 0.0001 &&
    Math.abs(rotateZ) < 0.0001
  ) {
    return fallbackTarget;
  }
  const direction = new THREE.Vector3(0, 0, -1);
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      -rotateX * DEG_TO_RAD,
      rotateY * DEG_TO_RAD,
      -rotateZ * DEG_TO_RAD,
      "XYZ",
    ),
  );
  direction.applyQuaternion(quaternion).normalize();
  return {
    x: position.x + direction.x * LIGHT_DIRECTION_DISTANCE,
    y: position.y + direction.y * LIGHT_DIRECTION_DISTANCE,
    z: position.z + direction.z * LIGHT_DIRECTION_DISTANCE,
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
