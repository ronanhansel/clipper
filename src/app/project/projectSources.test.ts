import { describe, expect, it } from "vitest";
import { compositionToSource } from "../../core/compositionSource";
import type { CompositionClip, ProjectManifest } from "../../core/types";
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
  it("regenerates stale source when timeline animation data changes", () => {
    const currentPart: CompositionClip = {
      ...composition,
      objects: [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: "[data-object-id='text']",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
          animations: [
            {
              id: "scale",
              name: "Scale",
              tracks: [
                {
                  property: "scale" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "scale:0",
                      time: 0 / 1,
                      value: 1,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "scale:1",
                      time: 1 / 1,
                      value: 2,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 1 },
            },
          ],
        },
      ],
    };
    const staleSource = compositionToSource({
      ...composition,
      objects: [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: "[data-object-id='text']",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
          animations: [
            {
              id: "scale",
              name: "Scale",
              tracks: [
                {
                  property: "scale" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "scale:0",
                      time: 0 / 1,
                      value: 1,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "scale:1",
                      time: 1 / 1,
                      value: 0,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 1 },
            },
          ],
        },
      ],
    });

    const sources = getSyncedCompositionSources(
      project(currentPart),
      project(currentPart),
      { [composition.filePath]: staleSource },
    );

    expect(sources[composition.filePath]).toContain('"scale"');
    expect(sources[composition.filePath]).toContain("2");
    expect(sources[composition.filePath]).not.toContain("animationGraph");
  });

  it("syncs compose parent links into generated composition source", () => {
    const currentPart: CompositionClip = {
      ...composition,
      objects: [
        {
          id: "parent",
          name: "Parent",
          type: "null",
          selector: "[data-object-id='parent']",
          bounds: { x: 0, y: 0, width: 80, height: 80 },
          style: {},
        },
        {
          id: "child",
          name: "Child",
          type: "rect",
          selector: "[data-object-id='child']",
          bounds: { x: 120, y: 0, width: 100, height: 100 },
          style: { background: "#fff" },
          parentId: "parent",
        },
      ],
    };

    const sources = getSyncedCompositionSources(
      project(currentPart),
      undefined,
      {},
    );

    expect(sources[composition.filePath]).toContain('parentId: "parent"');
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
