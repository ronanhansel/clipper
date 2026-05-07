import { describe, expect, it } from "vitest";
import { motionBlocksToMotionMarkers } from "../../core/motionEffects";
import type { CompositionClip, ProjectManifest, Scene } from "../../core/types";
import { deriveFramePreviewRenderModel, getFramePreviewTimelineLayers } from "./framePreviewRenderModel";

const frame = { width: 1920, height: 1080, style: { background: "#000000" } } as const;
const background = { id: "background", name: "Background", style: { background: "#000000" }, elements: [] };
const blankPart: CompositionClip = { id: "blank", filePath: "", duration: 1, frame, background, objects: [], snapshot: [], motionMarkers: [] };

describe("frame preview render model", () => {
  it("canonicalizes and rebases scene motion for the active part and preview stack", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", filePath: "a.ts", start: 0, duration: 4, frame, background, objects: [], snapshot: [], motionMarkers: [] },
        { id: "b", filePath: "b.ts", start: 4, duration: 4, frame, background, objects: [], snapshot: [], motionMarkers: [] },
      ],
      motionMarkers: [
        { id: "raw-zoom", effectId: "clipper.motion.zoom", start: 5, duration: 1, scale: 1.5, focus: { x: 960, y: 540 } } as never,
      ],
    };

    const model = deriveFramePreviewRenderModel({ blankPart, scene, sceneTime: 5, timelineMode: "composition" });

    expect(model.activeTimelinePart?.id).toBe("b");
    expect(model.part.motionMarkers[0]).toMatchObject({ id: "raw-zoom", kind: "zoom", layerId: "clipper.motion.zoom", start: 1 });
    expect(model.previewParts[0].part.motionMarkers[0]).toMatchObject({ id: "raw-zoom", kind: "zoom", start: 1 });
  });

  it("filters hidden motion rows before rebasing and exposes hidden motion layer ids", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [{ id: "a", filePath: "a.ts", start: 2, duration: 4, frame, background, objects: [], snapshot: [], motionMarkers: [] }],
      motionMarkers: motionBlocksToMotionMarkers([
        { id: "kept", effectId: "clipper.motion.zoom", layerId: "visible", start: 3, duration: 1, scale: 1.2, focus: { x: 960, y: 540 } },
        { id: "hidden", effectId: "clipper.motion.pan", layerId: "hidden", start: 3, duration: 1, position: { x: 10, y: 20 } },
      ]),
    };

    const model = deriveFramePreviewRenderModel({
      blankPart,
      scene,
      sceneTime: 3,
      timelineLayers: { motionLayers: [{ id: "visible", kind: "motion" }, { id: "hidden", kind: "motion", hidden: true }] },
      timelineMode: "composition",
    });

    expect(model.hiddenMotionLayerIds.has("hidden")).toBe(true);
    expect(model.part.motionMarkers.map((marker) => [marker.id, marker.start])).toEqual([["kept", 1]]);
  });

  it("uses per-timeline layers before legacy editor layers for export parity", () => {
    const project = {
      id: "project",
      name: "Project",
      resolution: { width: 1920, height: 1080 },
      assetsPath: "assets",
      scenes: [],
      timelines: [
        { id: "scene", clips: [], timelineLayers: { compositionLayers: [{ id: "visible" }, { id: "hidden", hidden: true }] } },
      ],
      editorState: { timeline: { displacement: 0, zoom: 1 }, timelineMode: "composition", timelineLayers: { compositionLayers: [{ id: "visible", hidden: true }, { id: "hidden" }] } },
    } satisfies ProjectManifest;

    expect(getFramePreviewTimelineLayers(project, "scene")?.compositionLayers?.map((layer) => [layer.id, layer.hidden])).toEqual([["visible", undefined], ["hidden", true]]);
  });

  it("derives active composition and preview time from adjusted render time", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", filePath: "a.ts", start: 0, duration: 2, frame, background, objects: [], snapshot: [], motionMarkers: [] },
        { id: "b", filePath: "b.ts", start: 2, duration: 2, frame, background, objects: [], snapshot: [], motionMarkers: [] },
      ],
      adjustmentLayers: [
        { id: "freeze", layerId: "adjust", name: "Freeze", start: 0.5, duration: 3, effect: { effectId: "clipper.adjustment.freezeFrame", params: {} } },
      ],
    };

    const model = deriveFramePreviewRenderModel({ blankPart, scene, sceneTime: 3, timelineMode: "composition" });

    expect(model.adjustedSceneTime).toBe(0.5);
    expect(model.activeTimelinePart?.id).toBe("a");
    expect(model.previewTime).toBe(0.5);
    expect(model.previewParts.map((item) => [item.part.id, item.previewTime])).toEqual([["a", 0.5]]);
  });

  it("applies clip trim starts to active preview timing", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", filePath: "a.ts", start: 1, trimStart: 0.75, duration: 3, frame, background, objects: [], snapshot: [], motionMarkers: [] },
      ],
    };

    const model = deriveFramePreviewRenderModel({ blankPart, scene, sceneTime: 2, timelineMode: "composition" });

    expect(model.previewTime).toBe(1.75);
    expect(model.previewParts.map((item) => [item.part.id, item.previewTime])).toEqual([["a", 1.75]]);
  });

  it("keeps intentional timeline gaps renderable with the blank fallback", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", filePath: "a.ts", start: 0, duration: 1, frame, background, objects: [], snapshot: [], motionMarkers: [] },
        { id: "b", filePath: "b.ts", start: 3, duration: 1, frame, background, objects: [], snapshot: [], motionMarkers: [] },
      ],
    };

    const model = deriveFramePreviewRenderModel({ blankPart, scene, sceneTime: 2, timelineMode: "composition" });

    expect(model.sceneDurationSeconds).toBe(4);
    expect(model.activeTimelinePart).toBeNull();
    expect(model.activeComposition).toBeNull();
    expect(model.part.id).toBe("blank");
    expect(model.previewParts).toEqual([]);
  });

  it("keeps the final preview frame on the last composition", () => {
    const scene: Scene = {
      id: "scene",
      compositions: [
        { id: "a", filePath: "a.ts", start: 0, duration: 2, frame, background, objects: [], snapshot: [], motionMarkers: [] },
      ],
    };

    const model = deriveFramePreviewRenderModel({ blankPart, scene, sceneTime: 2, timelineMode: "composition" });

    expect(model.activeTimelinePart?.id).toBe("a");
    expect(model.activeComposition?.id).toBe("a");
    expect(model.part.id).toBe("a");
    expect(model.previewTime).toBe(2);
    expect(model.previewParts.map((item) => [item.part.id, item.previewTime])).toEqual([["a", 2]]);
  });
});
