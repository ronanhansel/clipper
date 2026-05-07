import { describe, expect, it, vi } from "vitest";
import type { CompositionClip, ProjectManifest } from "../../../core/types";
import { createCompositionInLibrary, moveCompositionInProject, relinkCompositionInProject, renameCompositionInProject, updateCompositionFilePathsInProject } from "./compositionLibraryMutations";

const frame = { width: 1920 as const, height: 1080 as const, style: {} };
const background = { id: "bg", name: "Background", style: {}, elements: [] };

function composition(id: string, filePath: string): CompositionClip {
  return { id, filePath, duration: 5, frame, background, objects: [], snapshot: [], motionMarkers: [] };
}

function projectWithClip(item: CompositionClip): ProjectManifest {
  return {
    id: "project",
    name: "Project",
    resolution: { width: 1920, height: 1080 },
    scenes: [],
    assetsPath: "assets",
    compositionLibrary: [item],
    compositionSources: { [item.filePath]: "source" },
    timelines: [{ id: "timeline", filePath: "timelines/main.timeline.json", clips: [{ id: "clip", compositionId: item.id, duration: 5 }] }],
  };
}

describe("composition library mutations", () => {
  it("renames composition files without changing stable ids or timeline clip references", () => {
    const item = composition("composition-b", "compositions/B.composition.ts");
    const result = renameCompositionInProject(projectWithClip(item), { [item.filePath]: "source" }, item.id, "B renamed", [item]);

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/b_renamed.composition.ts" });
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
    expect(result?.compositionSources).toEqual({ "compositions/b_renamed.composition.ts": "source" });
  });

  it("moves composition files without changing stable ids or timeline clip references", () => {
    const item = composition("composition-b", "compositions/B.composition.ts");
    const result = moveCompositionInProject(projectWithClip(item), { [item.filePath]: "source" }, item.id, "compositions/folder", [item]);

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/folder/B.composition.ts" });
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
  });

  it("updates OS-renamed composition paths by stable id without rewriting timeline clips", () => {
    const item = composition("composition-b", "compositions/B.composition.ts");
    const result = updateCompositionFilePathsInProject(projectWithClip(item), { [item.filePath]: "source" }, [
      { oldPath: "compositions/B.composition.ts", newPath: "compositions/B renamed.composition.ts" },
    ], [item]);

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/B renamed.composition.ts" });
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
    expect(result?.compositionSources).toEqual({ "compositions/B renamed.composition.ts": "source" });
  });

  it("updates timeline composition copies when an OS composition path changes", () => {
    const item = composition("composition-b", "compositions/B.composition.ts");
    const project = { ...projectWithClip(item), compositions: [{ ...item, source: "source", start: 0 }] };
    const result = updateCompositionFilePathsInProject(project, { [item.filePath]: "source" }, [
      { oldPath: "compositions/B.composition.ts", newPath: "compositions/B renamed.composition.ts" },
    ], [item]);

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/B renamed.composition.ts" });
    expect(result?.project.compositions?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/B renamed.composition.ts" });
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
  });

  it("updates compositions inside OS-moved folders without rewriting timeline clips", () => {
    const item = composition("composition-b", "compositions/folder/B.composition.ts");
    const result = updateCompositionFilePathsInProject(projectWithClip(item), { [item.filePath]: "source" }, [
      { oldPath: "compositions/folder", newPath: "compositions/renamed" },
    ], [item]);

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/renamed/B.composition.ts" });
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
    expect(result?.compositionSources).toEqual({ "compositions/renamed/B.composition.ts": "source" });
  });

  it("relinks a missing composition by updating its path only", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "id" });
    const item = { ...composition("composition-b", "compositions/B.composition.ts"), sourceMissing: true };
    const result = relinkCompositionInProject(projectWithClip(item), {}, item.id, "compositions/found/B.composition.ts", "source", [item], composition(item.id, "compositions/found/B.composition.ts"));

    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "composition-b", filePath: "compositions/found/B.composition.ts", sourceMissing: undefined });
    expect(result?.project.compositionLibrary?.[0]).not.toHaveProperty("source");
    expect(result?.project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
    vi.unstubAllGlobals();
  });

  it("creates composition library entries without embedded source", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "id" });
    const item = composition("composition-b", "compositions/B.composition.ts");
    const result = createCompositionInLibrary(projectWithClip(item), {}, item, "compositions/new.composition.ts");

    expect(result.project.compositionLibrary?.at(-1)).not.toHaveProperty("source");
    expect(result.compositionSources["compositions/new.composition.ts"]).toContain("new Composition");
    vi.unstubAllGlobals();
  });
});
