import { describe, expect, it } from "vitest";
import {
  createInternalFileInProject,
  importDroppedFilesToBin,
  normalizeProjectBin,
} from "../app/features/file-manager/projectBinMutations";
import type {
  CompositionClip,
  ProjectManifest,
  TimelineDocument,
} from "../core/types";

function composition(
  overrides: Partial<CompositionClip> = {},
): CompositionClip {
  return {
    id: "comp_1",
    filePath: "hero.composition.json",
    duration: 2,
    frame: { width: 1920, height: 1080, style: {} },
    background: { id: "bg", name: "Background", style: {}, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
    ...overrides,
  };
}

function timeline(overrides: Partial<TimelineDocument> = {}): TimelineDocument {
  return {
    id: "main.timeline.json",
    filePath: "main.timeline.json",
    clips: [],
    adjustmentLayers: [],
    motionMarkers: [],
    settings: {},
    ...overrides,
  };
}

function project(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    id: "project_1",
    name: "Project",
    resolution: { width: 1920, height: 1080 },
    scenes: [],
    assetsPath: "assets",
    assets: [],
    ...overrides,
  };
}

describe("project bin", () => {
  it("starts blank when there are no project-managed items", () => {
    expect(normalizeProjectBin(project())).toEqual([]);
  });

  it("treats compositions and timelines as normal bin items", () => {
    const bin = normalizeProjectBin(
      project({
        compositionLibrary: [composition({ id: "comp_hero" })],
        timelines: [timeline({ id: "main.timeline.json" })],
      }),
    );

    expect(bin).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "composition",
          compositionId: "comp_hero",
        }),
        expect.objectContaining({
          kind: "timeline",
          timelineId: "main.timeline.json",
        }),
      ]),
    );
  });

  it("creates internal files in the project bin", () => {
    const result = createInternalFileInProject(project());
    expect(result.bin?.[0]).toMatchObject({
      kind: "internal-file",
      name: "untitled.ts",
      language: "typescript",
      source: "",
    });
  });

  it("stores dropped files as external proxy bin items", () => {
    const file = new File(["image"], "image.png") as File & { path?: string };
    file.path = "/tmp/image.png";
    const fileList = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList;

    const result = importDroppedFilesToBin(project(), fileList);

    expect(result.bin).toHaveLength(1);
    expect(result.bin?.[0]).toMatchObject({
      name: "image.png",
      kind: "external-proxy",
      path: "/tmp/image.png",
    });
  });
});
