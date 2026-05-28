import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
} from "../../../core/types";
import { getThreeAuthorActiveCameraSignature } from "./ThreeAuthorScene";

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

describe("ThreeAuthorScene active camera signature", () => {
  it("stays stable for equivalent active camera props", () => {
    expect(getThreeAuthorActiveCameraSignature(makeCamera())).toBe(
      getThreeAuthorActiveCameraSignature(makeCamera()),
    );
  });

  it("changes when through-camera transform changes", () => {
    expect(getThreeAuthorActiveCameraSignature(makeCamera())).not.toBe(
      getThreeAuthorActiveCameraSignature(
        makeCamera((camera) => {
          camera.rotation.y = 20;
        }),
      ),
    );
  });
});
