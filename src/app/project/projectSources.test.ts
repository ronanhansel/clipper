import { describe, expect, it } from "vitest";
import { getSyncedCompositionSources } from "./projectSources";
import type { CompositionClip, ProjectManifest } from "../../core/types";

describe("project source sync", () => {
  it("regenerates composition source for graph-only changes", () => {
    const source = "export const composition = null;";
    const composition = createComposition();
    const previousProject = createProject(composition, source);
    const nextProject = createProject(
      {
        ...composition,
        bgGraph: { nodes: { paper: { x: 4, y: 5 } }, edges: [] },
      },
      source,
    );

    const sources = getSyncedCompositionSources(nextProject, previousProject, {
      [composition.filePath]: source,
    });

    expect(sources[composition.filePath]).toContain("bgGraph");
    expect(sources[composition.filePath]).toContain("paper");
  });
});

function createProject(
  composition: CompositionClip,
  source: string,
): ProjectManifest {
  return {
    id: "project",
    name: "Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
    compositionLibrary: [composition],
    compositions: [composition],
    compositionSources: { [composition.filePath]: source },
  };
}

function createComposition(): CompositionClip {
  return {
    id: "composition",
    filePath: "compositions/main.composition.ts",
    duration: 5,
    frame: { width: 1920, height: 1080, style: {} },
    background: {
      id: "background",
      name: "Background",
      style: {},
      elements: [],
    },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}
