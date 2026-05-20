import { describe, expect, it } from "vitest";
import {
  computeCircleOfConfusionPx,
  computeLayerSubjectDistance,
} from "./cameraOptics";
import {
  DEFAULT_CAMERA_DOF,
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "./types";

const RENDER_HEIGHT = 1080;

function makeCamera(
  overrides: Partial<CameraObjectProps> = {},
  dofOverrides: Partial<CameraObjectProps["dof"]> = {},
): CameraObjectProps {
  return {
    ...DEFAULT_CAMERA_OBJECT_PROPS,
    ...overrides,
    dof: {
      ...DEFAULT_CAMERA_DOF,
      enabled: true,
      ...dofOverrides,
    },
  };
}

describe("computeCircleOfConfusionPx", () => {
  it("returns 0 when DoF is disabled", () => {
    const camera: CameraObjectProps = {
      ...DEFAULT_CAMERA_OBJECT_PROPS,
      dof: { ...DEFAULT_CAMERA_DOF, enabled: false, focusDistance: 1000 },
    };
    expect(computeCircleOfConfusionPx(camera, 500, RENDER_HEIGHT)).toBe(0);
  });

  it("returns 0 when subject is at focus", () => {
    const camera = makeCamera({}, { focusDistance: 1158 });
    expect(computeCircleOfConfusionPx(camera, 1158, RENDER_HEIGHT)).toBe(0);
  });

  it("returns 0 for non-finite or non-positive subject distance", () => {
    const camera = makeCamera();
    expect(computeCircleOfConfusionPx(camera, 0, RENDER_HEIGHT)).toBe(0);
    expect(computeCircleOfConfusionPx(camera, -10, RENDER_HEIGHT)).toBe(0);
    expect(computeCircleOfConfusionPx(camera, NaN, RENDER_HEIGHT)).toBe(0);
    expect(
      computeCircleOfConfusionPx(
        camera,
        Number.POSITIVE_INFINITY,
        RENDER_HEIGHT,
      ),
    ).toBe(0);
  });

  it("returns 0 when fNumber is non-positive", () => {
    const camera = makeCamera({}, { focusDistance: 1158, fNumber: 0 });
    expect(computeCircleOfConfusionPx(camera, 500, RENDER_HEIGHT)).toBe(0);
  });

  it("returns a positive CoC when subject is off focus", () => {
    const camera = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 2.8, blurLevel: 1, maxBlurPx: 1000 },
    );
    const coc = computeCircleOfConfusionPx(camera, 500, RENDER_HEIGHT);
    expect(coc).toBeGreaterThan(0);
  });

  it("monotonically decreases CoC as fNumber grows", () => {
    const subject = 500;
    const wide = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 1.4, blurLevel: 1, maxBlurPx: 1000 },
    );
    const mid = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 5.6, blurLevel: 1, maxBlurPx: 1000 },
    );
    const narrow = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 22, blurLevel: 1, maxBlurPx: 1000 },
    );
    const cWide = computeCircleOfConfusionPx(wide, subject, RENDER_HEIGHT);
    const cMid = computeCircleOfConfusionPx(mid, subject, RENDER_HEIGHT);
    const cNarrow = computeCircleOfConfusionPx(narrow, subject, RENDER_HEIGHT);
    expect(cWide).toBeGreaterThan(cMid);
    expect(cMid).toBeGreaterThan(cNarrow);
  });

  it("grows CoC as subject distance moves further from focus", () => {
    const camera = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 2.8, blurLevel: 1, maxBlurPx: 1000 },
    );
    const near = computeCircleOfConfusionPx(camera, 1100, RENDER_HEIGHT);
    const mid = computeCircleOfConfusionPx(camera, 800, RENDER_HEIGHT);
    const far = computeCircleOfConfusionPx(camera, 300, RENDER_HEIGHT);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(mid);
  });

  it("clamps CoC to maxBlurPx", () => {
    const camera = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 1.0, blurLevel: 100, maxBlurPx: 12 },
    );
    const coc = computeCircleOfConfusionPx(camera, 100, RENDER_HEIGHT);
    expect(coc).toBeLessThanOrEqual(12);
    expect(coc).toBeGreaterThan(0);
  });

  it("scales linearly with blurLevel below the clamp", () => {
    const a = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 8, blurLevel: 1, maxBlurPx: 1000 },
    );
    const b = makeCamera(
      {},
      { focusDistance: 1158, fNumber: 8, blurLevel: 2, maxBlurPx: 1000 },
    );
    const cocA = computeCircleOfConfusionPx(a, 600, RENDER_HEIGHT);
    const cocB = computeCircleOfConfusionPx(b, 600, RENDER_HEIGHT);
    expect(cocB).toBeCloseTo(cocA * 2, 5);
  });
});

describe("computeLayerSubjectDistance", () => {
  it("uses |camZ - layerZ| with no rotation", () => {
    const dist = computeLayerSubjectDistance({ x: 0, y: 0, z: 1158 }, null, {
      x: 0,
      y: 0,
      z: 0,
    });
    expect(dist).toBe(1158);
  });

  it("uses |camZ - layerZ| with all-zero rotation", () => {
    const dist = computeLayerSubjectDistance(
      { x: 50, y: 80, z: 1000 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 250 },
    );
    expect(dist).toBe(750);
  });

  it("ignores planar X/Y offsets when on-axis", () => {
    const dist = computeLayerSubjectDistance(
      { x: 500, y: -300, z: 1158 },
      null,
      { x: 200, y: 100, z: 0 },
    );
    expect(dist).toBe(1158);
  });

  it("with 90° yaw, distance reduces to |camX - layerX|", () => {
    // Camera at origin looking along +X (yaw=90°: -sin(90)=-1 → fxThree=-(-1)=…
    // Actually yaw=-90° aims -Z forward toward +X in Three. We test by symmetry:
    // yawing the camera by ±90° must make X-difference dominate Z-difference.
    const camPos = { x: 0, y: 0, z: 0 };
    const layer = { x: 100, y: 0, z: 0 };
    const dist = computeLayerSubjectDistance(
      camPos,
      { x: 0, y: 90, z: 0 },
      layer,
    );
    expect(dist).toBeCloseTo(100, 5);
  });

  it("with 90° yaw, a layer offset along Z contributes nothing", () => {
    const dist = computeLayerSubjectDistance(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 90, z: 0 },
      { x: 0, y: 0, z: 200 },
    );
    expect(dist).toBeCloseTo(0, 5);
  });

  it("returns absolute (non-negative) distance behind the camera", () => {
    const dist = computeLayerSubjectDistance({ x: 0, y: 0, z: 0 }, null, {
      x: 0,
      y: 0,
      z: 500,
    });
    expect(dist).toBe(500);
  });

  it("roll (Z rotation) does not affect distance", () => {
    const layer = { x: 0, y: 0, z: 0 };
    const cam = { x: 0, y: 0, z: 1000 };
    const a = computeLayerSubjectDistance(cam, { x: 0, y: 0, z: 0 }, layer);
    const b = computeLayerSubjectDistance(cam, { x: 0, y: 0, z: 45 }, layer);
    expect(b).toBeCloseTo(a, 5);
  });
});
