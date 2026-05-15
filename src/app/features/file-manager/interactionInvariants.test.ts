import { describe, expect, it } from "vitest";
import {
  deleteBinItemInProject,
  moveBinItemInProject,
  normalizeProjectBin,
} from "./projectBinMutations";
import type {
  CompositionClip,
  ProjectBinItem,
  ProjectManifest,
  TimelineDocument,
} from "../../../core/types";

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

describe("file manager interaction invariants", () => {
  it("does not duplicate items when moving into a folder", () => {
    const p = project({
      bin: [
        {
          id: "file_1",
          kind: "internal-file",
          name: "file.ts",
          language: "typescript",
          source: "",
        },
        { id: "folder_1", kind: "folder", name: "Folder", children: [] },
      ],
    });

    const result = moveBinItemInProject(p, "file_1", {
      targetId: "folder_1",
      action: "inside",
    });

    const bin = normalizeProjectBin(result);
    const folder = bin.find((item) => item.id === "folder_1") as Extract<
      ProjectBinItem,
      { kind: "folder" }
    >;
    const fileCount =
      folder?.children?.filter((c) => c.id === "file_1").length ?? 0;

    expect(fileCount).toBe(1);
    expect(bin.find((item) => item.id === "file_1")).toBeUndefined();
  });

  it("preserves unique bin IDs even with name collisions", () => {
    const p = project({
      bin: [
        {
          id: "file_1",
          kind: "internal-file",
          name: "untitled.ts",
          language: "typescript",
          source: "",
        },
        {
          id: "file_2",
          kind: "internal-file",
          name: "untitled.ts",
          language: "typescript",
          source: "",
        },
      ],
    });

    const bin = normalizeProjectBin(p);
    const ids = bin.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("deletes composition bin items from the backing library so they do not reappear", () => {
    const composition = createComposition({ id: "comp_1" });
    const result = deleteBinItemInProject(
      project({
        compositionLibrary: [composition],
        bin: [
          {
            id: "bin_comp_comp_1",
            kind: "composition",
            name: "Hero",
            compositionId: "comp_1",
          },
        ],
      }),
      "bin_comp_comp_1",
    );

    expect(result.compositionLibrary).toEqual([]);
    expect(normalizeProjectBin(result)).toEqual([]);
  });

  it("deletes timeline bin items from the backing timeline store so they do not reappear", () => {
    const result = deleteBinItemInProject(
      project({
        timelines: [createTimeline({ id: "main.timeline.json" })],
        bin: [
          {
            id: "bin_timeline_main.timeline.json",
            kind: "timeline",
            name: "Main",
            timelineId: "main.timeline.json",
          },
        ],
      }),
      "bin_timeline_main.timeline.json",
    );

    expect(result.timelines).toEqual([]);
    expect(normalizeProjectBin(result)).toEqual([]);
  });

  it("deletes backing runtime descendants when deleting a folder", () => {
    const result = deleteBinItemInProject(
      project({
        compositionLibrary: [createComposition({ id: "comp_1" })],
        timelines: [createTimeline({ id: "main.timeline.json" })],
        bin: [
          {
            id: "folder_1",
            kind: "folder",
            name: "Folder",
            children: [
              {
                id: "bin_comp_comp_1",
                kind: "composition",
                name: "Hero",
                compositionId: "comp_1",
              },
              {
                id: "bin_timeline_main.timeline.json",
                kind: "timeline",
                name: "Main",
                timelineId: "main.timeline.json",
              },
            ],
          },
        ],
      }),
      "folder_1",
    );

    expect(result.compositionLibrary).toEqual([]);
    expect(result.timelines).toEqual([]);
    expect(normalizeProjectBin(result)).toEqual([]);
  });

  it("deletes folders with runtime-backed children without resurrecting them at root", () => {
    const composition = createComposition({ id: "comp_1" });
    const timeline = createTimeline({ id: "main.timeline.json" });
    const result = deleteBinItemInProject(
      project({
        compositionLibrary: [composition],
        timelines: [timeline],
        bin: [
          {
            id: "folder_1",
            kind: "folder",
            name: "Folder",
            children: [
              {
                id: "bin_comp_comp_1",
                kind: "composition",
                name: "Hero",
                compositionId: "comp_1",
              },
              {
                id: "bin_timeline_main.timeline.json",
                kind: "timeline",
                name: "Main",
                timelineId: "main.timeline.json",
              },
            ],
          },
        ],
      }),
      "folder_1",
    );

    expect(result.compositionLibrary).toEqual([]);
    expect(result.timelines).toEqual([]);
    expect(normalizeProjectBin(result)).toEqual([]);
  });
});

function createComposition(
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

function createTimeline(
  overrides: Partial<TimelineDocument> = {},
): TimelineDocument {
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
