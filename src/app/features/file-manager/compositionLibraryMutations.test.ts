import { describe, expect, it } from "vitest";
import type { CompositionClip, ProjectManifest } from "../../../core/types";
import { relinkCompositionInProject } from "./compositionLibraryMutations";

const frame = { width: 1920 as const, height: 1080 as const, style: {} };
const background = { id: "bg", name: "Background", style: {}, elements: [] };

function missingComposition(id: string, filePath: string): CompositionClip {
  return { id, filePath, duration: 5, frame, background, objects: [], snapshot: [], motionMarkers: [], sourceMissing: true };
}

describe("composition library mutations", () => {
  it("relinks every missing timeline clip that depends on the same missing composition file", () => {
    const first = missingComposition("missing-a", "compositions/Following.composition.ts");
    const second = missingComposition("missing-b", "old/Following.composition.ts");
    const project: ProjectManifest = {
      id: "project",
      name: "Project",
      resolution: { width: 1920, height: 1080 },
      scenes: [],
      assetsPath: "assets",
      compositionLibrary: [first, second],
      compositionSources: {},
      timelines: [{
        id: "timeline",
        filePath: "timelines/main.timeline.json",
        clips: [
          { id: "clip-a", compositionId: first.id, duration: 5 },
          { id: "clip-b", compositionId: second.id, duration: 5 },
        ],
      }],
    };

    const result = relinkCompositionInProject(project, {}, first.id, "file-manager/compositions/Following.composition.ts", "source", project.compositionLibrary!);

    expect(result?.project.timelines?.[0].clips.map((clip) => clip.compositionId)).toEqual([
      "file-manager/compositions/Following.composition.ts",
      "file-manager/compositions/Following.composition.ts",
    ]);
    expect(result?.project.compositionLibrary?.filter((composition) => composition.sourceMissing)).toEqual([]);
  });

  it("relinks a missing timeline dependency even when the missing composition is not in the library", () => {
    const project: ProjectManifest = {
      id: "project",
      name: "Project",
      resolution: { width: 1920, height: 1080 },
      scenes: [],
      assetsPath: "assets",
      compositionLibrary: [],
      compositionSources: {},
      timelines: [{ id: "timeline", filePath: "timelines/main.timeline.json", clips: [{ id: "clip-a", compositionId: "compositions/Following.composition.ts", duration: 5 }] }],
    };

    const result = relinkCompositionInProject(project, {}, "compositions/Following.composition.ts", "file-manager/compositions/Following.composition.ts", "source", []);

    expect(result?.project.timelines?.[0].clips[0].compositionId).toBe("file-manager/compositions/Following.composition.ts");
    expect(result?.project.compositionLibrary?.[0]).toMatchObject({ id: "file-manager/compositions/Following.composition.ts", sourceMissing: undefined });
  });

  it("uses parsed relink composition content instead of keeping the missing placeholder", () => {
    const missing = missingComposition("missing", "compositions/Following.composition.ts");
    const parsed: CompositionClip = {
      ...missing,
      id: "file-manager/compositions/Following.composition.ts",
      filePath: "file-manager/compositions/Following.composition.ts",
      background: { id: "bg", name: "Background", style: { background: "#123456" }, elements: [{ id: "bg-rect", name: "BG", selector: "[data-object-id='bg-rect']", type: "rect", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, style: { background: "#123456" } }] },
      objects: [{ id: "title", name: "Title", selector: "[data-object-id='title']", type: "text", bounds: { x: 0, y: 0, width: 100, height: 40 }, content: "Hello", style: {} }],
      sourceMissing: undefined,
    };
    const project: ProjectManifest = { id: "project", name: "Project", resolution: { width: 1920, height: 1080 }, scenes: [], assetsPath: "assets", compositionLibrary: [missing], compositionSources: {}, timelines: [{ id: "timeline", clips: [{ id: "clip", compositionId: missing.id, duration: 5 }] }] };

    const result = relinkCompositionInProject(project, {}, missing.id, parsed.filePath, "source", [missing], parsed);

    expect(result?.project.compositionLibrary?.[0].objects).toHaveLength(1);
    expect(result?.project.compositionLibrary?.[0].background.elements).toHaveLength(1);
  });
});
