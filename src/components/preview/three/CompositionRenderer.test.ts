import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";
import type { PostProcessPass } from "../../../core/effects/types";
import {
  getCompositionCameraSignature,
  shouldSkipEmptyGpuPostProcessPasses,
} from "./CompositionRenderer";
import { hasActiveThinLensDof } from "./ThinLensRenderPass";

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
    autoFocus: { ...DEFAULT_CAMERA_OBJECT_PROPS.autoFocus },
    lockTarget: {
      ...DEFAULT_CAMERA_OBJECT_PROPS.lockTarget,
      offset: { ...DEFAULT_CAMERA_OBJECT_PROPS.lockTarget.offset },
    },
    lens: {
      ...DEFAULT_CAMERA_OBJECT_PROPS.lens,
      distortion: { ...DEFAULT_CAMERA_OBJECT_PROPS.lens.distortion },
      chromaticAberration: {
        ...DEFAULT_CAMERA_OBJECT_PROPS.lens.chromaticAberration,
      },
      vignette: { ...DEFAULT_CAMERA_OBJECT_PROPS.lens.vignette },
    },
    post: {
      ...DEFAULT_CAMERA_OBJECT_PROPS.post,
      exposure: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.exposure },
      tonemap: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.tonemap },
      grade: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.grade },
      grain: { ...DEFAULT_CAMERA_OBJECT_PROPS.post.grain },
    },
  };
  override(base);
  return base;
}

describe("CompositionRenderer camera signature", () => {
  it("is stable for equivalent camera props", () => {
    expect(getCompositionCameraSignature(makeCamera())).toBe(
      getCompositionCameraSignature(makeCamera()),
    );
  });

  it("changes when camera transform changes", () => {
    expect(getCompositionCameraSignature(makeCamera())).not.toBe(
      getCompositionCameraSignature(
        makeCamera((camera) => {
          camera.position.x = 12;
        }),
      ),
    );
  });

  it("changes when camera post-processing changes", () => {
    expect(getCompositionCameraSignature(makeCamera())).not.toBe(
      getCompositionCameraSignature(
        makeCamera((camera) => {
          camera.lens.vignette.enabled = true;
          camera.lens.vignette.amount = 0.8;
        }),
      ),
    );
  });
});

describe("shouldSkipEmptyGpuPostProcessPasses", () => {
  const pass: PostProcessPass = {
    id: "pass",
    kind: "test",
    target: "final",
  };

  it("skips when current and next passes are empty", () => {
    expect(shouldSkipEmptyGpuPostProcessPasses([], [])).toBe(true);
  });

  it("does not skip when adding the first pass", () => {
    expect(shouldSkipEmptyGpuPostProcessPasses([], [pass])).toBe(false);
  });

  it("does not skip when clearing existing passes", () => {
    expect(shouldSkipEmptyGpuPostProcessPasses([pass], [])).toBe(false);
  });
});

describe("hasActiveThinLensDof", () => {
  it("uses thin-lens rendering for every active camera DoF mode", () => {
    expect(
      hasActiveThinLensDof(
        makeCamera((camera) => {
          camera.dof.enabled = true;
          camera.dof.debug = true;
          camera.dof.blurMode = "far";
        }),
      ),
    ).toBe(true);
  });

  it("does not run thin-lens rendering when DoF is disabled", () => {
    expect(hasActiveThinLensDof(makeCamera())).toBe(false);
  });
});
