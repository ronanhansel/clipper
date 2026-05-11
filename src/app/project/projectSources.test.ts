import { describe, expect, it } from "vitest";
import { createTypedAnimationGraphNode } from "../../core/animationGraph/nodeRegistry";
import { compositionToSource } from "../../core/compositionSource";
import type {
  CompositionClip,
  ProjectManifest,
  TypedAnimationGraphState,
} from "../../core/types";
import { getSyncedCompositionSources } from "./projectSources";

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { background: "#050505" } },
  background: {
    id: "background",
    name: "Background",
    style: { background: "#050505" },
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function graph(from: string): TypedAnimationGraphState {
  const layer = {
    id: "text",
    nodes: {
      source: createTypedAnimationGraphNode(
        "source",
        "source",
        { x: 0, y: 0 },
        { objectId: "text", outputType: "Structure.TextObject" },
      ),
      scale: createTypedAnimationGraphNode(
        "scale",
        "effect",
        { x: 10, y: 0 },
        { effects: [{ property: "scale", values: {}, from, to: "10" }] },
        "Scale",
      ),
      out: createTypedAnimationGraphNode("out", "out", { x: 20, y: 0 }),
    },
    edges: [],
  };
  return { nodes: {}, edges: [], layers: [layer] };
}

function project(part: CompositionClip): ProjectManifest {
  return {
    id: "proj_test",
    name: "Test Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
    timelines: [],
    compositionLibrary: [part],
    compositions: [part],
  };
}

describe("getSyncedCompositionSources", () => {
  it("regenerates stale source even when composition snapshots match", () => {
    const currentPart = { ...composition, animationGraph: graph("2") };
    const staleSource = compositionToSource({
      ...composition,
      animationGraph: graph("0"),
    });

    const sources = getSyncedCompositionSources(
      project(currentPart),
      project(currentPart),
      { [composition.filePath]: staleSource },
    );

    expect(sources[composition.filePath]).toContain('from: "2"');
    expect(sources[composition.filePath]).toContain(
      'outputType: "Structure.TextObject"',
    );
    expect(sources[composition.filePath]).toContain("defineAnimationGraph({");
    expect(sources[composition.filePath]).toContain("layers: [");
    expect(sources[composition.filePath]).not.toContain("new AnimationGraph");
    expect(sources[composition.filePath]).not.toContain("new SourceNode");
  });

  it("uses library composition over stale scene copy for source sync", () => {
    const staleScenePart = {
      ...composition,
      objects: [
        {
          id: "deleted-rect",
          name: "Deleted Rect",
          type: "rect" as const,
          selector: "[data-object-id='deleted-rect']",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          style: { background: "#fff" },
        },
      ],
    };
    const currentLibraryPart = { ...composition, objects: [] };
    const staleSource = compositionToSource(staleScenePart);

    const sources = getSyncedCompositionSources(
      {
        ...project(currentLibraryPart),
        scenes: [{ id: "scene", compositions: [staleScenePart] }],
      },
      undefined,
      { [composition.filePath]: staleSource },
    );

    expect(sources[composition.filePath]).not.toContain("deleted-rect");
  });
});
