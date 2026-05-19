import { describe, it, expect } from "vitest";
import {
  cameraObjectPropsToPreviewTransform,
  compositionHasCameraLayer,
  findActiveCameraObject,
  readCameraObjectProps,
} from "./useCompositionCamera";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CompositionClip,
  type FrameObject,
} from "../../../core/types";

function makePart(objects: FrameObject[]): CompositionClip {
  return {
    id: "test",
    filePath: "test.composition.json",
    duration: 5,
    frame: { width: 1920, height: 1080, style: {} } as CompositionClip["frame"],
    background: {
      id: "bg",
      name: "Background",
      style: {},
      elements: [],
    },
    objects,
    snapshot: [],
    motionMarkers: [],
  };
}

function makeCameraObject(overrides: Partial<FrameObject> = {}): FrameObject {
  return {
    id: "cam",
    name: "Camera 1",
    type: "camera",
    selector: "[data-object-id='cam']",
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    style: {},
    ...overrides,
  };
}

describe("compositionHasCameraLayer", () => {
  it("returns false with no camera objects", () => {
    expect(compositionHasCameraLayer(makePart([]))).toBe(false);
  });
  it("returns true with one visible camera object", () => {
    expect(compositionHasCameraLayer(makePart([makeCameraObject()]))).toBe(
      true,
    );
  });
  it("returns false when the only camera is hidden", () => {
    expect(
      compositionHasCameraLayer(makePart([makeCameraObject({ hidden: true })])),
    ).toBe(false);
  });
});

describe("findActiveCameraObject", () => {
  it("returns null when no camera exists", () => {
    expect(findActiveCameraObject(makePart([]))).toBeNull();
  });
  it("returns the first non-hidden camera", () => {
    const a = makeCameraObject({ id: "a", hidden: true });
    const b = makeCameraObject({ id: "b" });
    const c = makeCameraObject({ id: "c" });
    expect(findActiveCameraObject(makePart([a, b, c]))?.id).toBe("b");
  });
});

describe("readCameraObjectProps", () => {
  it("returns defaults when props is missing", () => {
    expect(readCameraObjectProps(makeCameraObject())).toEqual(
      DEFAULT_CAMERA_OBJECT_PROPS,
    );
  });
  it("reads provided values", () => {
    const obj = makeCameraObject({
      props: {
        position: { x: 100, y: -50, z: 800 },
        rotation: { x: 10, y: 20, z: 30 },
        fov: 45,
        near: 2,
        far: 8000,
      },
    });
    expect(readCameraObjectProps(obj)).toEqual({
      position: { x: 100, y: -50, z: 800 },
      rotation: { x: 10, y: 20, z: 30 },
      fov: 45,
      near: 2,
      far: 8000,
    });
  });
});

describe("cameraObjectPropsToPreviewTransform", () => {
  it("returns identity for default camera props", () => {
    const t = cameraObjectPropsToPreviewTransform(DEFAULT_CAMERA_OBJECT_PROPS);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    expect(t.z).toBe(0);
    expect(t.scale).toBe(1);
  });
  it("inverts position", () => {
    const t = cameraObjectPropsToPreviewTransform({
      ...DEFAULT_CAMERA_OBJECT_PROPS,
      position: { x: 200, y: -100, z: 1000 },
    });
    expect(t.x).toBe(-200);
    expect(t.y).toBe(100);
    expect(t.z).toBe(0);
  });
  it("camera moving closer produces positive translateZ", () => {
    const t = cameraObjectPropsToPreviewTransform({
      ...DEFAULT_CAMERA_OBJECT_PROPS,
      position: { x: 0, y: 0, z: 600 },
    });
    expect(t.z).toBe(400);
  });
  it("inverts rotation X/Z, preserves Y", () => {
    const t = cameraObjectPropsToPreviewTransform({
      ...DEFAULT_CAMERA_OBJECT_PROPS,
      rotation: { x: 15, y: -30, z: 45 },
    });
    expect(t.rotateX).toBe(-15);
    expect(t.rotateY).toBe(30);
    expect(t.rotation).toBe(-45);
  });
});
