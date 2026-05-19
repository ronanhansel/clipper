import { describe, expect, it } from "vitest";
import { buildCameraPathData } from "./buildCameraPathData";
import type { FrameObject } from "../../../core/types";

function makeCamera(overrides: Partial<FrameObject>): FrameObject {
  return {
    id: "cam1",
    name: "Camera 1",
    type: "camera",
    selector: "[data-object-id='cam1']",
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    style: {},
    props: {
      position: { x: 0, y: 0, z: 1158 },
      rotation: { x: 0, y: 0, z: 0 },
      fov: 50,
      near: 10,
      far: 1158,
    },
    ...overrides,
  } as FrameObject;
}

describe("buildCameraPathData", () => {
  it("returns null when the camera has no positional tracks", () => {
    const data = buildCameraPathData({
      camera: makeCamera({}),
      selectedKeyframeIndex: null,
    });
    expect(data).toBeNull();
  });

  it("derives a single x-axis bezier handle pair from a 2-keyframe x-track", () => {
    // x-axis-only animation 0 → 100 with the default linear ease
    // (cp = [0, 0, 1, 1]). The handles slide along the x axis between
    // the two keyframes.
    const camera = makeCamera({
      tracks: {
        "props.position.x": {
          valueType: "number",
          points: [
            { time: 0, value: 0, easingToNext: "linear" },
            { time: 1, value: 100, easingToNext: "linear" },
          ],
        },
      },
    });
    const data = buildCameraPathData({
      camera,
      selectedKeyframeIndex: 0,
    });
    expect(data).not.toBeNull();
    if (!data) return;
    expect(data.keyframes).toHaveLength(2);
    expect(data.keyframes[0].position).toEqual({ x: 0, y: 0, z: 1158 });
    expect(data.keyframes[1].position).toEqual({ x: 100, y: 0, z: 1158 });
    // Linear ease cp1.x = 0 → out handle sits at the start keyframe.
    const out = data.handles.find(
      (h) => h.keyframeIndex === 0 && h.side === "out" && h.axis === "x",
    );
    expect(out).toBeDefined();
    expect(out?.currentCp).toBeCloseTo(0);
    expect(out?.position.x).toBeCloseTo(0);
    // Linear ease cp2.x = 1 → in handle on the end keyframe sits at
    // the end keyframe (offset = (1 - 1) * 100 = 0).
    const inH = data.handles.find(
      (h) => h.keyframeIndex === 1 && h.side === "in" && h.axis === "x",
    );
    expect(inH).toBeDefined();
    expect(inH?.currentCp).toBeCloseTo(1);
    expect(inH?.position.x).toBeCloseTo(100);
  });

  it("places handles at the cp.x offset for an easeInOut segment", () => {
    // easeInOut cp = [0.42, 0, 0.58, 1].
    const camera = makeCamera({
      tracks: {
        "props.position.x": {
          valueType: "number",
          points: [
            { time: 0, value: 0, easingToNext: "easeInOut" },
            { time: 1, value: 100, easingToNext: "linear" },
          ],
        },
      },
    });
    const data = buildCameraPathData({
      camera,
      selectedKeyframeIndex: 0,
    });
    if (!data) throw new Error("expected data");
    const out = data.handles.find(
      (h) => h.keyframeIndex === 0 && h.side === "out" && h.axis === "x",
    );
    // out handle at startKf + cp1.x * delta = 0 + 0.42 * 100 = 42.
    expect(out?.position.x).toBeCloseTo(42);
    expect(out?.currentCp).toBeCloseTo(0.42);
    const inH = data.handles.find(
      (h) => h.keyframeIndex === 1 && h.side === "in" && h.axis === "x",
    );
    // in handle at endKf + (cp2.x - 1) * delta = 100 + (0.58 - 1) * 100 = 58.
    expect(inH?.position.x).toBeCloseTo(58);
    expect(inH?.currentCp).toBeCloseTo(0.58);
  });

  it("omits handles on axes whose segment has zero delta", () => {
    // Y is constant; only X moves. We still want X handles, no Y handles.
    const camera = makeCamera({
      tracks: {
        "props.position.x": {
          valueType: "number",
          points: [
            { time: 0, value: 0, easingToNext: "linear" },
            { time: 1, value: 100, easingToNext: "linear" },
          ],
        },
        "props.position.y": {
          valueType: "number",
          points: [
            { time: 0, value: 50, easingToNext: "linear" },
            { time: 1, value: 50, easingToNext: "linear" },
          ],
        },
      },
    });
    const data = buildCameraPathData({
      camera,
      selectedKeyframeIndex: 0,
    });
    if (!data) throw new Error("expected data");
    expect(data.handles.some((h) => h.axis === "y")).toBe(false);
    expect(data.handles.some((h) => h.axis === "x")).toBe(true);
  });

  it("threads through the selected keyframe index", () => {
    const camera = makeCamera({
      tracks: {
        "props.position.x": {
          valueType: "number",
          points: [
            { time: 0, value: 0, easingToNext: "linear" },
            { time: 1, value: 100, easingToNext: "linear" },
          ],
        },
      },
    });
    const a = buildCameraPathData({ camera, selectedKeyframeIndex: 0 });
    const b = buildCameraPathData({ camera, selectedKeyframeIndex: 1 });
    expect(a?.selectedKeyframeIndex).toBe(0);
    expect(b?.selectedKeyframeIndex).toBe(1);
  });
});
