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
  CAMERA_DOF_MAX_BLUR_PX,
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";
import {
  getThinLensApertureRadiusWorld,
  getThinLensMaxBlurRadiusWorld,
  sampleThinLensDiskPair,
} from "./ThinLensRenderPass";

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

  it("does not emit a DoF composer pass when DoF is enabled with valid props", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.dof.focusDistance = 1500;
    });
    expect(buildCameraDofComposerPass(camera, frameSize)).toBeNull();
  });

  it("ignores the idScope argument because thin-lens DoF is render-pass owned", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    expect(buildCameraDofComposerPass(camera, frameSize, "host-2")).toBeNull();
  });
});

describe("buildCameraComposerPasses with DoF", () => {
  it("emits only lens passes when DoF and lens are both enabled", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.2;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes.length).toBe(1);
    expect(passes[0]).toBeInstanceOf(LensComposerPass);
    for (const p of passes) p.dispose();
  });

  it("emits no post-process pass when only DoF is enabled", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 2.8;
    });
    const passes = buildCameraComposerPasses(camera, frameSize);
    expect(passes).toEqual([]);
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

  it("uses a staged half-resolution near/far bokeh pipeline", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 0.5;
      c.dof.focusDistance = 1500;
    });
    const dofPass = createCameraDofPass(camera, "camera");
    expect(dofPass).not.toBeNull();
    const pass = new CameraDofComposerPass("camera:camera-dof-pass", dofPass!);
    const materials = pass as unknown as {
      splitMaterial: { fragmentShader: string };
      blurMaterial: { fragmentShader: string };
      fillMaterial: { fragmentShader: string };
      compositeMaterial: { fragmentShader: string };
    };

    expect(materials.splitMaterial.fragmentShader).toContain("u_fieldSign");
    expect(materials.splitMaterial.fragmentShader).toContain("signedCocPx");
    expect(materials.blurMaterial.fragmentShader).toContain("TAP_COUNT = 96");
    expect(materials.blurMaterial.fragmentShader).toContain("u_color");
    expect(materials.blurMaterial.fragmentShader).toContain("u_coc");
    expect(materials.fillMaterial.fragmentShader).toContain("TAP_COUNT = 32");
    expect(materials.fillMaterial.fragmentShader).toContain("tapWeight");
    expect(materials.fillMaterial.fragmentShader).not.toContain("maxColor");
    expect(materials.compositeMaterial.fragmentShader).toContain("u_near");
    expect(materials.compositeMaterial.fragmentShader).toContain("u_far");
    expect(materials.compositeMaterial.fragmentShader).toContain(
      "blendFromCoc",
    );
    expect(materials.splitMaterial.fragmentShader).not.toContain("u_color");

    pass.dispose();
  });

  it("uses the authored max blur clamp directly", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 1.4;
      c.dof.focusDistance = 1500;
      c.dof.maxBlurPx = 24;
    });
    const dofPass = createCameraDofPass(camera, "camera");
    expect(dofPass).not.toBeNull();
    const pass = new CameraDofComposerPass("camera:camera-dof-pass", dofPass!);
    const material = pass as unknown as {
      splitMaterial: { uniforms: { u_maxBlurPx: { value: number } } };
      compositeMaterial: { uniforms: { u_maxBlurPx: { value: number } } };
    };

    expect(material.splitMaterial.uniforms.u_maxBlurPx.value).toBe(24);
    expect(material.compositeMaterial.uniforms.u_maxBlurPx.value).toBe(24);

    pass.dispose();
  });
});

describe("createCameraDofPass", () => {
  it("clamps f-number and max blur uniforms to camera DoF limits", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 0.7;
      c.dof.maxBlurPx = CAMERA_DOF_MAX_BLUR_PX + 1;
    });
    const dofPass = createCameraDofPass(camera, "camera");
    expect(dofPass).not.toBeNull();
    expect(dofPass!.uniforms.fNumber).toBe(1.5);
    expect(dofPass!.uniforms.maxBlurPx).toBe(CAMERA_DOF_MAX_BLUR_PX);
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
    });
    const u = uniformsFor(camera);
    const huge = computeSignedCocPx(u, 30000, 1080);
    expect(Math.abs(huge)).toBeLessThanOrEqual(u.maxBlurPx + 1e-6);
  });
});

describe("getThinLensApertureRadiusWorld", () => {
  it("returns 0 when DoF is disabled", () => {
    expect(getThinLensApertureRadiusWorld(makeCamera())).toBe(0);
  });

  it("stays active when focus distance is zero", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 1.5;
      c.dof.focusDistance = 0;
      c.dof.maxBlurPx = CAMERA_DOF_MAX_BLUR_PX;
    });

    expect(getThinLensApertureRadiusWorld(camera)).toBeGreaterThan(0);
  });

  it("produces a larger aperture radius for wider apertures", () => {
    const narrow = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 8;
      c.dof.focusDistance = 1158;
    });
    const wide = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 1;
      c.dof.focusDistance = 1158;
    });

    expect(getThinLensApertureRadiusWorld(narrow)).toBeGreaterThan(0);
    expect(getThinLensApertureRadiusWorld(wide)).toBeGreaterThan(
      getThinLensApertureRadiusWorld(narrow),
    );
  });

  it("caps focus-at-infinity aperture from max blur in pixels", () => {
    const camera = makeCamera((c) => {
      c.dof.enabled = true;
      c.dof.fNumber = 1.5;
      c.dof.focusDistance = 1_000_000;
      c.dof.maxBlurPx = 48;
      c.near = 10;
    });
    const radius = getThinLensApertureRadiusWorld(camera, 1080);
    const maxRadius = getThinLensMaxBlurRadiusWorld(
      camera,
      undefined,
      undefined,
      1080,
    );
    expect(radius).toBeCloseTo(maxRadius, 6);
  });
});

describe("sampleThinLensDiskPair", () => {
  it("emits opposite pairs so early progressive accumulation stays centered", () => {
    for (let i = 0; i < 8; i += 2) {
      const a = sampleThinLensDiskPair(i, 128);
      const b = sampleThinLensDiskPair(i + 1, 128);
      expect(Math.abs(a.x + b.x)).toBeLessThan(1e-6);
      expect(Math.abs(a.y + b.y)).toBeLessThan(1e-6);
    }
  });
});
