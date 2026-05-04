import { describe, expect, it } from "vitest";
import { getPrerenderInvalidationRanges } from "./usePrerenderCache";
import type { ProjectManifest, Scene } from "../../../core/types";

const project = { id: "project" } as ProjectManifest;

function signature(scene: Scene) {
  return {
    global: {
      projectId: project.id,
      sceneId: scene.id,
      compositions: scene.compositions.map((part) => ({
        id: part.id,
        filePath: part.filePath,
        source: part.source,
        compositionError: part.compositionError,
        sourceMissing: part.sourceMissing,
        start: part.start,
        layerId: part.layerId,
        duration: part.duration,
        frame: part.frame,
        background: part.background,
        objects: part.objects,
        snapshot: part.snapshot,
        motionMarkers: part.motionMarkers,
      })),
      motionMarkers: scene.motionMarkers ?? [],
    },
    ranged: {
      adjustmentLayers: scene.adjustmentLayers ?? [],
      transitionLayers: scene.transitionLayers ?? [],
    },
  };
}

const baseScene: Scene = {
  id: "scene",
  compositions: [],
  adjustmentLayers: [],
  transitionLayers: [],
};

describe("prerender cache invalidation", () => {
  it("invalidates only changed visual adjustment blocks", () => {
    const previous = signature(baseScene);
    const next = signature({
      ...baseScene,
      adjustmentLayers: [{ id: "grade", name: "Grade", start: 2.2, duration: 1.1, effect: { effectId: "clipper.adjustment.colourGrade", params: { saturation: 80 } } }],
    });

    expect(getPrerenderInvalidationRanges(previous, next, 10, 1)).toEqual([{ start: 2, end: 4 }]);
  });

  it("invalidates from speed marker start through the timeline tail", () => {
    const previous = signature(baseScene);
    const next = signature({
      ...baseScene,
      adjustmentLayers: [{ id: "speed", name: "Speed", start: 3, duration: 2, effect: { effectId: "clipper.adjustment.speedChange", params: { speed: 0.5 } } }],
    });

    expect(getPrerenderInvalidationRanges(previous, next, 10, 1)).toEqual([{ start: 3, end: 10 }]);
  });
});
