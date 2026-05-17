import { describe, expect, it } from "vitest";
import { motionBlocksToMotionMarkers } from "../../core/motionEffects";
import type { CompositionClip, Scene } from "../../core/types";
import {
  deriveFramePreviewSceneContext,
  deriveSceneRenderModel,
} from "./sceneRenderModel";

const frame = {
  width: 1920,
  height: 1080,
  style: { backgroundColor: "#000000" },
} as const;
const background = {
  id: "background",
  name: "Background",
  style: { backgroundColor: "#000000" },
  elements: [],
};
const blankPart: CompositionClip = {
  id: "blank",
  filePath: "",
  duration: 1,
  frame,
  background,
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

describe("scene render model", () => {
  it("preserves inner composition motion markers without scene clobber", () => {
    const innerMarkers = motionBlocksToMotionMarkers([
      {
        id: "inner-pan",
        effectId: "clipper.motion.pan",
        start: 0.5,
        duration: 0.5,
        position: { x: 100, y: 0 },
      },
    ]);
    const scene: Scene = {
      id: "scene",
      compositions: [
        {
          id: "a",
          filePath: "a.ts",
          start: 0,
          duration: 4,
          frame,
          background,
          objects: [],
          snapshot: [],
          motionMarkers: innerMarkers,
        },
      ],
      motionMarkers: [
        {
          id: "scene-zoom",
          effectId: "clipper.motion.zoom",
          start: 1,
          duration: 1,
          scale: 1.5,
          focus: { x: 960, y: 540 },
        } as never,
      ],
    };

    const ctx = deriveFramePreviewSceneContext({
      blankPart,
      scene,
      timelineMode: "composition",
    });
    const model = deriveSceneRenderModel(ctx, 1, "composition");

    expect(model.previewParts[0].part.id).toBe("a");
    expect(
      model.previewParts[0].part.motionMarkers.map((marker) => marker.id),
    ).toEqual(["inner-pan"]);
    expect(model.sceneCamera).toBeNull();
  });

  it("exposes scene adjustments and transition layers without composition concerns", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        {
          id: "a",
          filePath: "a.ts",
          start: 0,
          duration: 2,
          frame,
          background,
          objects: [],
          snapshot: [],
          motionMarkers: [],
        },
      ],
      adjustmentLayers: [
        {
          id: "film",
          layerId: "adjust",
          name: "Film",
          start: 0,
          duration: 2,
          effect: { effectId: "clipper.adjustment.filmEmulation", params: {} },
        },
      ],
    };

    const ctx = deriveFramePreviewSceneContext({
      blankPart,
      scene,
      timelineMode: "composition",
    });
    const model = deriveSceneRenderModel(ctx, 1, "composition");

    expect(model.sceneAdjustments.map((layer) => layer.id)).toEqual(["film"]);
    expect(model.activeComposition?.id).toBe("a");
    expect(model.previewTime).toBe(1);
    expect(model.postProcessPasses).toEqual([]);
  });
});
