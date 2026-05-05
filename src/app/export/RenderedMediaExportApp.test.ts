import { describe, expect, it } from "vitest";
import { lensPostProcessKind } from "../../core/effects/postprocess/lens";
import type { AdjustmentLayer, CompositionClip, PartFrame, ProjectManifest, Scene } from "../../core/types";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../core/types";
import { getExportPostProcessPasses } from "./RenderedMediaExportApp";

const frame: PartFrame = { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#336699" } };
const background = { id: "background", name: "Background", style: { background: "#336699" }, elements: [] };

describe("export post-process pass derivation", () => {
  it("preserves the no-postprocess route when no pass is active", () => {
    const scene = testScene({ adjustmentLayers: [] });

    expect(getExportPostProcessPasses(testRequest(scene))).toEqual([]);
  });

  it("injects the active frame background into exported lens passes", () => {
    const scene = testScene({ adjustmentLayers: [lensLayer({ radius: 25 })] });

    const passes = getExportPostProcessPasses(testRequest(scene, 1.5));

    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ kind: lensPostProcessKind, uniforms: { frameBackground: { r: 0.2, g: 0.4, b: 0.6 } } });
  });
});

function testRequest(scene: Scene, sceneTime = 0) {
  return { project: testProject(scene.id), scene, sceneTime, frameRate: 30 };
}

function testProject(sceneId: string): ProjectManifest {
  return { id: "project", name: "Project", resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT }, assetsPath: "assets", scenes: [], timelines: [{ id: sceneId, clips: [], timelineLayers: { adjustmentLayers: [{ id: "clipper.adjustment.lense" }] } }] };
}

function testScene(overrides: Partial<Scene> = {}): Scene {
  return { id: "scene", compositions: [testComposition()], ...overrides };
}

function testComposition(): CompositionClip {
  return { id: "composition", filePath: "composition.ts", start: 0, duration: 3, frame, background, objects: [], snapshot: [], motionMarkers: [] };
}

function lensLayer(params: AdjustmentLayer["effect"]["params"]): AdjustmentLayer {
  return { id: "lens", name: "Lens", start: 1, duration: 2, effect: { effectId: "clipper.adjustment.lense", params } };
}
