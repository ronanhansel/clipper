import { describe, it, expect, vi } from "vitest";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { DEFAULT_CAMERA_OBJECT_PROPS } from "../../../core/types";

function makeFakeCamera() {
  let px = 0,
    py = 0,
    pz = 0;
  const updateProjectionMatrix = vi.fn();
  const updateMatrixWorld = vi.fn();
  return {
    fake: {
      position: {
        get x() {
          return px;
        },
        get y() {
          return py;
        },
        get z() {
          return pz;
        },
        set(x: number, y: number, z: number) {
          px = x;
          py = y;
          pz = z;
        },
      },
      rotation: { x: 0, y: 0, z: 0, order: "" },
      fov: 0,
      aspect: 0,
      near: 0,
      far: 0,
      filmGauge: 0,
      updateProjectionMatrix,
      updateMatrixWorld,
    },
    updateProjectionMatrix,
    updateMatrixWorld,
  };
}

describe("applyCompositionCameraToThree", () => {
  it("applies default identity when camera is null", () => {
    const { fake, updateProjectionMatrix } = makeFakeCamera();
    applyCompositionCameraToThree(fake, null, 16 / 9);
    expect(fake.fov).toBe(DEFAULT_CAMERA_OBJECT_PROPS.fov);
    expect(fake.near).toBe(DEFAULT_CAMERA_OBJECT_PROPS.near);
    expect(fake.far).toBe(DEFAULT_CAMERA_OBJECT_PROPS.far);
    expect(fake.aspect).toBeCloseTo(16 / 9);
    expect(fake.position.z).toBe(DEFAULT_CAMERA_OBJECT_PROPS.position.z);
    expect(updateProjectionMatrix).toHaveBeenCalledTimes(1);
  });

  it("flushes camera world matrix after rotation changes", () => {
    const { fake, updateMatrixWorld } = makeFakeCamera();
    applyCompositionCameraToThree(
      fake,
      {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        rotation: { x: 0, y: 0, z: 45 },
      },
      1,
    );
    expect(fake.rotation.z).toBeCloseTo(-Math.PI / 4);
    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
  });

  it("negates y position to match Clipper y-down frame coords", () => {
    const { fake } = makeFakeCamera();
    applyCompositionCameraToThree(
      fake,
      {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        position: { x: 100, y: 50, z: 1000 },
      },
      1,
    );
    expect(fake.position.x).toBe(100);
    expect(fake.position.y).toBe(-50);
    expect(fake.position.z).toBe(1000);
  });

  it("negates X and Z rotations and preserves Y rotation", () => {
    const { fake } = makeFakeCamera();
    applyCompositionCameraToThree(
      fake,
      {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        rotation: { x: 90, y: 45, z: 30 },
      },
      1,
    );
    expect(fake.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(fake.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(fake.rotation.z).toBeCloseTo(-Math.PI / 6);
    expect(fake.rotation.order).toBe("XYZ");
  });

  it("forwards fov, near, far, aspect", () => {
    const { fake } = makeFakeCamera();
    applyCompositionCameraToThree(
      fake,
      {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        fov: 75,
        near: 5,
        far: 5000,
      },
      2.0,
    );
    expect(fake.fov).toBe(75);
    expect(fake.near).toBe(5);
    expect(fake.far).toBe(5000);
    expect(fake.aspect).toBe(2.0);
  });

  it("forwards sensor.width as filmGauge", () => {
    const { fake } = makeFakeCamera();
    applyCompositionCameraToThree(
      fake,
      {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        sensor: { width: 24.89, height: 18.66 }, // APS-C width
      },
      1,
    );
    expect(fake.filmGauge).toBe(24.89);
  });
});
