import { describe, expect, it } from "vitest";
import { compositionToSource } from "../../core/compositionSource";
import type { CompositionClip, ProjectManifest } from "../../core/types";
import type { AnimationGraph } from "../../core/animationGraph/types";
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

function graph(from: string): AnimationGraph {
  return {
    id: "graph:text",
    sourceObjectId: "text",
    nodes: {
      source: {
        id: "source",
        kind: "source",
        position: { x: 0, y: 0 },
        config: { objectId: "text" },
      },
      scale: {
        id: "scale",
        kind: "effect:clipper.motion.zoom",
        position: { x: 10, y: 0 },
        config: { effectId: "clipper.motion.zoom", params: { scale: from } },
      },
      out: { id: "out", kind: "out", position: { x: 20, y: 0 }, config: {} },
    },
    edges: [
      {
        id: "source:out->scale:in",
        from: { nodeId: "source", portId: "out" },
        to: { nodeId: "scale", portId: "in" },
      },
      {
        id: "scale:out->out:in",
        from: { nodeId: "scale", portId: "out" },
        to: { nodeId: "out", portId: "in" },
      },
    ],
  };
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

    expect(sources[composition.filePath]).toContain('scale: "2"');
    expect(sources[composition.filePath]).not.toContain("outputType");
    expect(sources[composition.filePath]).toContain("animationGraph: {");
    expect(sources[composition.filePath]).toContain('sourceObjectId: "text"');
    expect(sources[composition.filePath]).not.toContain("inputs:");
    expect(sources[composition.filePath]).not.toContain("outputs:");
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
