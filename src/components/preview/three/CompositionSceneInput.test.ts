import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";
import { CompositionSceneInput } from "./CompositionSceneInput";

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    style: {},
    parentNode: null,
    parentElement: null,
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    getContext: vi.fn(() => null),
  } as unknown as HTMLCanvasElement;
}

function makeCamera(
  override: (camera: CameraObjectProps) => void = () => {},
): CameraObjectProps {
  const camera = structuredClone(DEFAULT_CAMERA_OBJECT_PROPS);
  override(camera);
  return camera;
}

function getFarPlane(
  input: CompositionSceneInput,
): InstanceType<typeof THREE.Object3D> {
  const plane = input.scene.getObjectByName("CompositionFarPlane");
  expect(plane).toBeDefined();
  return plane!;
}

function getFarPlaneViewDistance(input: CompositionSceneInput): number {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    input.camera.quaternion,
  );
  return getFarPlane(input)
    .position.clone()
    .sub(input.camera.position)
    .dot(forward);
}

describe("CompositionSceneInput camera sync", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => makeCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips applying equivalent camera props", () => {
    const input = new CompositionSceneInput({
      width: 1920,
      height: 1080,
      requestRender: () => {},
    });
    const camera = makeCamera((item) => {
      item.position.x = 12;
    });

    input.applyCamera(camera);
    const appliedX = input.camera.position.x;
    input.camera.position.x = 999;
    input.applyCamera(
      makeCamera((item) => {
        item.position.x = 12;
      }),
    );

    expect(input.camera.position.x).toBe(999);

    input.applyCamera(
      makeCamera((item) => {
        item.position.x = 24;
      }),
    );
    expect(input.camera.position.x).not.toBe(999);
    expect(input.camera.position.x).not.toBe(appliedX);
    input.dispose();
  });

  it("keeps the far background plane inside the active camera frustum", () => {
    const input = new CompositionSceneInput({
      width: 1920,
      height: 1080,
      requestRender: () => {},
    });

    expect(getFarPlaneViewDistance(input)).toBeCloseTo(
      DEFAULT_CAMERA_OBJECT_PROPS.far - 1,
      6,
    );
    expect(getFarPlaneViewDistance(input)).toBeLessThan(input.camera.far);

    input.applyCamera(
      makeCamera((item) => {
        item.position.x = 25;
        item.position.y = -40;
        item.position.z = 900;
        item.rotation.y = 20;
        item.fov = 35;
        item.far = 2400;
      }),
    );

    const plane = getFarPlane(input);
    expect(getFarPlaneViewDistance(input)).toBeCloseTo(2399, 6);
    expect(getFarPlaneViewDistance(input)).toBeLessThan(input.camera.far);
    expect(plane.scale.x).toBeGreaterThan(plane.scale.y);
    expect(plane.quaternion.angleTo(input.camera.quaternion)).toBeLessThan(
      1e-6,
    );
    input.dispose();
  });
});
