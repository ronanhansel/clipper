import { describe, expect, it } from "vitest";
import type { Part, ProjectManifest } from "../../../core/types";
import { syncSourceDurationsFromTimelineResize } from "./useTimelineProjectActions";

const composition: Part = {
  id: "cmp_intro",
  filePath: "compositions/intro.composition.ts",
  duration: 3,
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

function project(part: Part = composition): ProjectManifest {
  return {
    id: "project",
    name: "Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
    timelines: [],
    compositions: [part],
    compositionLibrary: [part],
  };
}

describe("syncSourceDurationsFromTimelineResize", () => {
  it("mirrors end-resized timeline duration to source composition", () => {
    const currentPart: Part = {
      ...composition,
      id: "clip_intro",
      compositionId: composition.id,
    };
    const nextPart: Part = { ...currentPart, duration: 6 };

    const nextProject = syncSourceDurationsFromTimelineResize(
      project(),
      [currentPart],
      [nextPart],
    );

    expect(nextProject.compositions?.[0].duration).toBe(6);
    expect(nextProject.compositionLibrary?.[0].duration).toBe(6);
  });

  it("keeps source duration when resize changes trim start", () => {
    const currentPart: Part = {
      ...composition,
      id: "clip_intro",
      compositionId: composition.id,
    };
    const nextPart: Part = {
      ...currentPart,
      start: 1,
      trimStart: 1,
      duration: 2,
    };

    const nextProject = syncSourceDurationsFromTimelineResize(
      project(),
      [currentPart],
      [nextPart],
    );

    expect(nextProject.compositions?.[0].duration).toBe(3);
    expect(nextProject.compositionLibrary?.[0].duration).toBe(3);
  });
});
