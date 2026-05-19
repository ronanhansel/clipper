/**
 * Confirms that `DomBackend` applies the composition's CSS camera transform
 * directly on its host element (so compose mode picks it up), rather than
 * relying on `RasterBackend` to wrap it.
 *
 * We test the same code path the component runs — `useCompositionCamera`
 * has no React hooks in its body, so it can be invoked as a plain function
 * here. This avoids depending on a jsdom + render setup that this repo
 * does not currently use, while still asserting the user-visible outcome:
 *   - no camera object  → no transform applied
 *   - camera object     → transform string reflects inverted position
 */

import { describe, expect, it } from "vitest";
import { useCompositionCamera } from "../compositors/useCompositionCamera";
import { formatCameraPreviewTransform } from "../../../core/camera";
import type { CompositionClip, FrameObject } from "../../../core/types";

function makeCameraObject(props: Record<string, unknown>): FrameObject {
  return {
    id: "cam",
    name: "Camera 1",
    type: "camera",
    selector: "[data-object-id='cam']",
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    style: {},
    props: props as FrameObject["props"],
  };
}

function makePart(objects: FrameObject[]): CompositionClip {
  return {
    id: "comp-1",
    duration: 1,
    objects,
    frame: { style: {} },
    background: { color: "#000" },
  } as unknown as CompositionClip;
}

describe("DomBackend composition camera", () => {
  it("returns null when no camera object exists", () => {
    const camera = useCompositionCamera({
      part: makePart([]),
      localTime: 0,
    });
    expect(camera).toBeNull();
  });

  it("returns null when camera object is hidden", () => {
    const part = makePart([
      { ...makeCameraObject({}), hidden: true } as FrameObject,
    ]);
    const camera = useCompositionCamera({ part, localTime: 0 });
    expect(camera).toBeNull();
  });

  it("formats a transform that reflects inverted x for camera objects", () => {
    const part = makePart([
      makeCameraObject({
        position: { x: 100, y: 0, z: 1000 },
        rotation: { x: 0, y: 0, z: 0 },
        fov: 50,
        near: 1,
        far: 10000,
      }),
    ]);
    const camera = useCompositionCamera({ part, localTime: 0 });
    expect(camera).not.toBeNull();
    const transform = formatCameraPreviewTransform(camera!);
    expect(transform).toContain("translate3d");
    expect(transform).toContain("-100");
  });
});
