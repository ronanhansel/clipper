import { describe, it, expect } from "vitest";
import {
  applyAutoOrientAlongPath,
  cameraObjectPropsToPreviewTransform,
  compositionHasCameraLayer,
  evaluateCameraObjectPropsAt,
  findActiveCameraObject,
  readCameraObjectProps,
} from "./useCompositionCamera";
import {
  DEFAULT_CAMERA_DOF,
  DEFAULT_CAMERA_OBJECT_PROPS,
  DEFAULT_CAMERA_SENSOR,
  type CameraObjectProps,
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
      sensor: { ...DEFAULT_CAMERA_SENSOR },
      dof: { ...DEFAULT_CAMERA_DOF },
      autoOrient: "off",
    });
  });
  it("fills defaults for sensor / dof / autoOrient when missing", () => {
    const obj = makeCameraObject({
      props: {
        position: { x: 0, y: 0, z: 1158 },
      },
    });
    const props = readCameraObjectProps(obj);
    expect(props.sensor).toEqual(DEFAULT_CAMERA_SENSOR);
    expect(props.dof).toEqual(DEFAULT_CAMERA_DOF);
    expect(props.autoOrient).toBe("off");
  });
  it("reads sensor / dof / autoOrient when provided", () => {
    const obj = makeCameraObject({
      props: {
        sensor: { width: 24, height: 16 },
        dof: {
          enabled: true,
          focusDistance: 800,
          fNumber: 1.8,
          blurLevel: 1.5,
          maxBlurPx: 32,
        },
        autoOrient: "along-path",
      },
    });
    const props = readCameraObjectProps(obj);
    expect(props.sensor).toEqual({ width: 24, height: 16 });
    expect(props.dof).toEqual({
      enabled: true,
      focusDistance: 800,
      fNumber: 1.8,
      blurLevel: 1.5,
      maxBlurPx: 32,
    });
    expect(props.autoOrient).toBe("along-path");
  });
});

describe("evaluateCameraObjectPropsAt", () => {
  it("returns defaults for an object with no tracks", () => {
    expect(evaluateCameraObjectPropsAt(makeCameraObject(), 0)).toEqual(
      DEFAULT_CAMERA_OBJECT_PROPS,
    );
  });
});

describe("applyAutoOrientAlongPath", () => {
  function trackedXCameraObject(
    props: Partial<CameraObjectProps>,
    points: { time: number; value: number }[],
  ): FrameObject {
    return makeCameraObject({
      props: { ...DEFAULT_CAMERA_OBJECT_PROPS, ...props },
      tracks: {
        "props.position.x": {
          valueType: "number",
          points,
        },
      },
    });
  }

  it("returns rotation unchanged when autoOrient is 'off'", () => {
    const cam = makeCameraObject({
      props: {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        rotation: { x: 5, y: 10, z: 15 },
        autoOrient: "off",
      },
    });
    const resolved = readCameraObjectProps(cam);
    const out = applyAutoOrientAlongPath(cam, 0, resolved);
    expect(out).toBe(resolved);
  });

  it("orients yaw correctly for a horizontal +X tangent", () => {
    const cam = trackedXCameraObject({ autoOrient: "along-path" }, [
      { time: 0, value: 0 },
      { time: 1000, value: 1000 },
    ]);
    const resolved = evaluateCameraObjectPropsAt(cam, 0);
    const out = applyAutoOrientAlongPath(cam, 0, resolved);
    expect(out.rotation.y).toBeCloseTo(90, 3);
    expect(out.rotation.x).toBeCloseTo(0, 3);
    expect(out.rotation.z).toBe(0);
  });

  it("preserves user rotation when the camera is stationary", () => {
    const cam = makeCameraObject({
      props: {
        ...DEFAULT_CAMERA_OBJECT_PROPS,
        rotation: { x: 5, y: 10, z: 15 },
        autoOrient: "along-path",
      },
    });
    const resolved = readCameraObjectProps(cam);
    const out = applyAutoOrientAlongPath(cam, 0, resolved);
    expect(out.rotation).toEqual({ x: 5, y: 10, z: 15 });
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
      position: { x: 200, y: -100, z: DEFAULT_CAMERA_OBJECT_PROPS.position.z },
    });
    expect(t.x).toBe(-200);
    expect(t.y).toBe(100);
    expect(t.z).toBe(0);
  });
  it("camera moving closer produces positive translateZ", () => {
    const closer = DEFAULT_CAMERA_OBJECT_PROPS.position.z - 400;
    const t = cameraObjectPropsToPreviewTransform({
      ...DEFAULT_CAMERA_OBJECT_PROPS,
      position: { x: 0, y: 0, z: closer },
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
