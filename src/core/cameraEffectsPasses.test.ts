import { describe, expect, it } from "vitest";
import {
  getCameraLensPostProcessPass,
  getCameraPostProcessPasses,
} from "./cameraEffectsPasses";
import { lensPostProcessKind } from "./effects/postprocess/lens";
import { DEFAULT_CAMERA_OBJECT_PROPS, type CameraObjectProps } from "./types";

const frameSize = { width: 1920, height: 1080 };

function makeCamera(
  override: (base: CameraObjectProps) => void = () => {},
): CameraObjectProps {
  const base: CameraObjectProps = {
    ...DEFAULT_CAMERA_OBJECT_PROPS,
    position: { ...DEFAULT_CAMERA_OBJECT_PROPS.position },
    rotation: { ...DEFAULT_CAMERA_OBJECT_PROPS.rotation },
    sensor: { ...DEFAULT_CAMERA_OBJECT_PROPS.sensor },
    dof: {
      ...DEFAULT_CAMERA_OBJECT_PROPS.dof,
      bokeh: { ...DEFAULT_CAMERA_OBJECT_PROPS.dof.bokeh },
    },
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

describe("getCameraLensPostProcessPass", () => {
  it("returns null when both distortion and CA are disabled", () => {
    const camera = makeCamera();
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).toBeNull();
  });

  it("returns a live-DOM final lens pass when distortion alone is enabled", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.4;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).not.toBeNull();
    expect(pass!.kind).toBe(lensPostProcessKind);
    expect(pass!.requiresLiveDomSource).toBe(true);
    expect(pass!.target).toBe("final");
  });

  it("zeroes chromaticAberrationPixels when CA is disabled", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.25;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).not.toBeNull();
    expect(pass!.uniforms.distortion).toBe(0.25);
    expect(pass!.uniforms.chromaticAberrationPixels).toBe(0);
  });

  it("zeroes distortion when only CA is enabled", () => {
    const camera = makeCamera((c) => {
      c.lens.chromaticAberration.enabled = true;
      c.lens.chromaticAberration.amountPx = 3;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).not.toBeNull();
    expect(pass!.uniforms.distortion).toBe(0);
    expect(pass!.uniforms.chromaticAberrationPixels).toBe(3);
  });

  it("disables the chromaticAberrationMask and zeroes rim/dim regardless of inputs", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.1;
      c.lens.chromaticAberration.enabled = true;
      c.lens.chromaticAberration.amountPx = 2;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).not.toBeNull();
    expect(pass!.uniforms.chromaticAberrationMask.enabled).toBe(false);
    expect(pass!.uniforms.dimAmount).toBe(0);
    expect(pass!.uniforms.rimOpacity).toBe(0);
    expect(pass!.uniforms.rimWidth).toBe(0);
  });

  it("namespaces the pass id by idScope", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.1;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass!.id).toBe("cam-1:camera-lens");
  });

  it("returns null when only vignette is enabled (vignette TODO)", () => {
    const camera = makeCamera((c) => {
      c.lens.vignette.enabled = true;
      c.lens.vignette.amount = 0.5;
    });
    const pass = getCameraLensPostProcessPass(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(pass).toBeNull();
  });
});

describe("getCameraPostProcessPasses", () => {
  it("returns [] when camera is null", () => {
    expect(
      getCameraPostProcessPasses(null, { idScope: "cam-1", frameSize }),
    ).toEqual([]);
  });

  it("returns [] when camera is undefined", () => {
    expect(
      getCameraPostProcessPasses(undefined, { idScope: "cam-1", frameSize }),
    ).toEqual([]);
  });

  it("returns a 1-element array with the lens pass when distortion enabled", () => {
    const camera = makeCamera((c) => {
      c.lens.distortion.enabled = true;
      c.lens.distortion.amount = 0.2;
    });
    const passes = getCameraPostProcessPasses(camera, {
      idScope: "cam-1",
      frameSize,
    });
    expect(passes.length).toBe(1);
    expect(passes[0].kind).toBe(lensPostProcessKind);
  });
});
