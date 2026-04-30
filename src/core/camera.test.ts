import { describe, expect, it } from "vitest";
import { CAMERA_PERSPECTIVE, formatCameraPreviewTransform, getActivePerspective, getActiveTranslation, getLayeredCameraPreviewTransform } from "./camera";
import { motionBlocksToMotionMarkers, motionBlocksToTranslationMarkers } from "./motionEffects";
import type { Part, TimelineMotionLayerState } from "./types";

const basePart: Part = {
  id: "part",
  name: "Part",
  filePath: "part.ts",
  duration: 4,
  frame: { width: 1920, height: 1080, style: {} },
  background: { id: "background", name: "Background", style: {}, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

describe("camera", () => {
  it("ignores tracked pan markers from removed motion layers", () => {
    const part: Part = {
      ...basePart,
      objects: [{ id: "tracker", name: "Tracker", type: "rect", selector: "[data-object-id='tracker']", bounds: { x: 100, y: 100, width: 100, height: 100 }, style: {}, motion: { duration: 4, x: [0, 400] } }],
      motionMarkers: motionBlocksToMotionMarkers([{ id: "pan", effectId: "clipper.motion.pan", layerId: "removed_pan", start: 0, duration: 4, position: { x: 0, y: 0 }, followId: "tracker" }]),
    };
    const layers: TimelineMotionLayerState[] = [{ id: "clipper.motion.pan", kind: "motion", name: "Pan" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({ x: 0, y: 0 });
  });

  it("uses manual pan position after a tracker id is cleared", () => {
    const part: Part = {
      ...basePart,
      objects: [{ id: "tracker", name: "Tracker", type: "rect", selector: "[data-object-id='tracker']", bounds: { x: 100, y: 100, width: 100, height: 100 }, style: {}, motion: { duration: 4, x: [0, 400] } }],
    };

    const tracked = getActiveTranslation([{ id: "pan", effectId: "clipper.motion.pan", layerId: "clipper.motion.pan", start: 0, duration: 4, position: { x: 12, y: 34 }, followId: "tracker" }], 2, part);
    const manual = getActiveTranslation([{ id: "pan", effectId: "clipper.motion.pan", layerId: "clipper.motion.pan", start: 0, duration: 4, position: { x: 12, y: 34 } }], 2, part);

    expect(tracked?.position.x).not.toBe(12);
    expect(manual?.position).toEqual({ x: 12, y: 34 });
  });

  it("suppresses rotation while picking a pan target", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([{ id: "rotate", effectId: "clipper.motion.rotate", layerId: "clipper.motion.rotate", start: 0, duration: 4, position: { x: 0, y: 0 }, rotation: 15 }]),
    };
    const layers: TimelineMotionLayerState[] = [{ id: "clipper.motion.rotate", kind: "motion", name: "Rotate" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2).rotation).toBeGreaterThan(0);
    expect(getLayeredCameraPreviewTransform(part, layers, 2, { pickingTranslationPosition: true }).rotation).toBe(0);
  });

  it("keeps pan as x/y translation only", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([{ id: "pan", effectId: "clipper.motion.pan", layerId: "clipper.motion.pan", start: 0, duration: 4, position: { x: 10, y: 20 }, snapIn: true, snapOut: true }]),
    };
    const layers: TimelineMotionLayerState[] = [{ id: "clipper.motion.pan", kind: "motion", name: "Pan" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({ x: 10, y: 20, z: 0 });
  });

  it("layers perspective markers into the camera transform", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([{ id: "perspective", effectId: "clipper.motion.perspective", layerId: "clipper.motion.perspective", start: 0, duration: 4, position: { x: 0, y: 0 }, perspective: { z: 300, rotateX: 8, rotateY: -4 }, snapIn: true, snapOut: true }]),
    };
    const layers: TimelineMotionLayerState[] = [{ id: "clipper.motion.perspective", kind: "motion", name: "Perspective" }];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({ z: 300, rotateX: 8, rotateY: -4, perspective: CAMERA_PERSPECTIVE });
  });

  it("keeps perspective distance out of the camera transform string", () => {
    const transform = formatCameraPreviewTransform({ x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 8, rotateY: 0, perspective: CAMERA_PERSPECTIVE });

    expect(transform).not.toContain("perspective(");
    expect(transform).toContain("rotateX(8deg)");
  });

  it("preserves perspective tilt values when converting motion blocks to markers", () => {
    const [marker] = motionBlocksToTranslationMarkers([{ id: "perspective", effectId: "clipper.motion.perspective", layerId: "clipper.motion.perspective", start: 0, duration: 1, position: { x: 0, y: 0 }, params: { perspective: { z: 102, rotateX: 33, rotateY: 40 } } }]);

    expect(marker.perspective).toEqual({ z: 102, rotateX: 33, rotateY: 40 });
  });

  it("interpolates perspective markers with existing easing", () => {
    const perspective = getActivePerspective([{ id: "perspective", effectId: "clipper.motion.perspective", layerId: "clipper.motion.perspective", start: 0, duration: 4, position: { x: 0, y: 0 }, perspective: { z: 200, rotateX: 10, rotateY: -20 }, ease: "linear" }], 0.44);

    expect(perspective).toMatchObject({ z: 100, rotateX: 5, rotateY: -10 });
  });
});
