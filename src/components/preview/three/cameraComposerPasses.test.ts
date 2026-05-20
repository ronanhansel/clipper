import { describe, expect, it } from "vitest";
import {
  CameraDofComposerPass,
  LensComposerPass,
  buildCameraComposerPasses,
  buildCameraDofComposerPass,
  computeSignedCocPx,
} from "./cameraComposerPasses";
import { getCameraLensPostProcessPass } from "../../../core/cameraEffectsPasses";
import { createCameraDofPass } from "../../../core/effects/postprocess/cameraDof";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";

const frameSize = { width: 1920, height: 1080 };

function makeCamera(
  override: (base: CameraObjectProps) => void = () => {},
): CameraObjectProps {
  const base: CameraObjectProps = {
    ...DEFAULT_CAMERA_OBJECT_PROPS,
    position: { ...DEFAULT_CAMERA_OBJECT_PROPS.position },
    rotation: { ...DEFAULT_CAMERA_OBJECT_PROPS.rotation },
    sensor: { ...DEFAULT_CAMERA_OBJECT_PROPS.sensor },
    dof: { ...DEFAULT_CAMERA_OBJECT_PROPS.dof },
    lens: {
      distortion: { ...DEFAULT_CAMERA_OBJECT_PROPS.lens.distortion },
      chromaticAberration: {
        ...DEFAULT_CAMERA_OBJECT_PROPS.lens.chromaticAberration,
      },
      vignette: { ...DEFAULT_CAMERA_OBJECT_PROPS.lens.vignette },
    },
    post: {
      exposure: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.exposure },
      tonemap: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.tonemap },
      grade: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.grade },
      grain: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.grain },
    },
  };
  override(base);
  return base;
}

describe("buildCameraComposerPasses", () => {
  it("returns an empty list when camera is null", () => {
    expect(buildCameraComposerPasses(null, frameSize)).toEqual([]);
  });

  it("returns an empty list when no lens or DoF feature is enabled", () => {
    expect(buildCameraComposerPasses(makeCamera(), frameSize)).toEqual([]);
  });

  it("emits a lens composer pass when distortion is enabled", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.25;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes.length).toBe(1);
    expect(passes[0]).toBeInstanceOf(LensComposerPass);
    expect(passes[0].id).toBe("camera:camera-lens-pass");
  });

  it("emits a lens composer pass when chromatic aberration is enabled", () => {
    const camera = makeCamera((c) => {
      c.lens.chromaticAberration.enabled = true;
      c.lens.chromaticAberration.amountPx = 6;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes.length).toBe(1);
    expect(passes[0]).toBeInstanceOf(LensComposerPass);
  });

  it("respects the idScope argument for pass ids", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.2;
    });
    const passes = buildCameraComposerPasses(camera, frameSize, "host-1");
    expect(passes[0].id).toBe("host-1:camera-lens-pass");
  });
});

describe("LensComposerPass", () => {
  it("constructs from a LensPostProcessPass without throwing", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.2;
    });
    const lensPass = getCameraLensPostProcessPass(camera, {
      idScope: "camera",
      frameSize,
    });
    expect(lensPass).not.toBeNull();
    const pass = new LensComposerPass("camera:camera-lens-pass", lensPass!);
    expect(pass.id).toBe("camera:camera-lens-pass");
    pass.setSize(frameSize.width, frameSize.height);
    pass.dispose();
  });
});

describe("buildCameraDofComposerPass", () => {
  it("returns null when camera is null", () => {
    expect(buildCameraDofComposerPass(null, frameSize)).toBeNull();
  });

  it("returns null when DoF is disabled", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = false;
    });
    expect(buildCameraDofComposerPass(camera, frameSize)).toBeNull();
  });

  it("returns null when fNumber is non-positive", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 0;
    });
    expect(buildCameraDofComposerPass(camera, frameSize)).toBeNull();
  });

  it("emits a DoF composer pass when DoF is enabled with valid props", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.dof.focusDistance = 1500;
    });
    const pass = buildCameraDofComposerPass(camera, frameSize);
    expect(pass).not.toBeNull();
    expect(pass?.id).toBe("camera:camera-dof-pass");
    expect(pass).toBeInstanceOf(CameraDofComposerPass);
    pass?.dispose();
  });

  it("respects the idScope argument", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    const pass = buildCameraDofComposerPass(camera, frameSize, "host-2");
    expect(pass?.id).toBe("host-2:camera-dof-pass");
    pass?.dispose();
  });
});

describe("buildCameraComposerPasses with DoF", () => {
  it("emits the DoF pass before the lens pass when both are enabled", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.2;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes.length).toBe(2);
    expect(passes[0]).toBeInstanceOf(CameraDofComposerPass);
    expect(passes[1]).toBeInstanceOf(LensComposerPass);
    for (const p of passes) p.dispose();
  });

  it("emits only the DoF pass when only DoF is enabled", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes.length).toBe(1);
    expect(passes[0]).toBeInstanceOf(CameraDofComposerPass);
    passes[0].dispose();
  });
});

describe("CameraDofComposerPass", () => {
  it("constructs and disposes cleanly", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    const dofPass = createCameraDofPass(camera, "camera");
    expect(dofPass).not.toBeNull();
    const pass = new CameraDofComposerPass("camera:camera-dof-pass", dofPass!);
    expect(pass.id).toBe("camera:camera-dof-pass");
    pass.setSize(frameSize.width, frameSize.height);
    pass.dispose();
  });
});

describe("computeSignedCocPx", () => {
  function uniformsFor(camera: CameraObjectProps) {
    const dofPass = createCameraDofPass(camera, "camera");
    expect(dofPass).not.toBeNull();
    return dofPass!.uniforms;
  }

  it("returns 0 for invalid scene depths", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    const u = uniformsFor(camera);
    expect(computeSignedCocPx(u, 0, 1080)).toBe(0);
    expect(computeSignedCocPx(u, -100, 1080)).toBe(0);
    expect(computeSignedCocPx(u, Number.NaN, 1080)).toBe(0);
  });

  it("returns 0 when fNumber is 0", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.dof.focusDistance = 1500;
    });
    const u = uniformsFor(camera);
    expect(computeSignedCocPx({ ...u, fNumber: 0 }, 1500, 1080)).toBe(0);
  });

  it("is approximately 0 when subject is at the focus distance", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.dof.focusDistance = 1500;
    });
    const u = uniformsFor(camera);
    expect(Math.abs(computeSignedCocPx(u, 1500, 1080))).toBeLessThan(1e-3);
  });

  it("is positive behind the focus plane and negative in front of it", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.dof.focusDistance = 1500;
    });
    const u = uniformsFor(camera);
    expect(computeSignedCocPx(u, 3000, 1080)).toBeGreaterThan(0);
    expect(computeSignedCocPx(u, 500, 1080)).toBeLessThan(0);
  });

  it("clamps the magnitude to maxBlurPx", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 1.4;
      c.dof.focusDistance = 1500;
      c.dof.maxBlurPx = 12;
      c.dof.blurLevel = 100;
    });
    const u = uniformsFor(camera);
    const huge = computeSignedCocPx(u, 30000, 1080);
    expect(Math.abs(huge)).toBeLessThanOrEqual(u.maxBlurPx + 1e-6);
  });
});
