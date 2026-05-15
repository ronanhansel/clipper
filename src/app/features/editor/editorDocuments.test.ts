import { describe, expect, it } from "vitest";
import {
  commitEditorDocumentSource,
  resolveEditorDocument,
  type EditorDocument,
} from "./editorDocuments";
import type { CompositionClip, ProjectManifest } from "../../../core/types";

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/intro.composition.json",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { backgroundColor: "#050505" } },
  background: {
    id: "background",
    name: "Background",
    style: { backgroundColor: "transparent" },
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function project(): ProjectManifest {
  return {
    id: "proj_editor_docs",
    name: "Editor Docs",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
    compositionLibrary: [composition],
    bin: [
      {
        id: "bin_file_notes",
        kind: "internal-file",
        name: "notes.md",
        language: "markdown",
        source: "# Notes",
      },
      {
        id: "bin_comp_intro",
        kind: "composition",
        name: "Intro",
        compositionId: composition.id,
      },
      {
        id: "bin_proxy_logo",
        kind: "external-proxy",
        name: "logo.png",
        path: "/tmp/logo.png",
      },
    ],
  };
}

describe("editorDocuments", () => {
  it("resolves and commits internal files from project bin", () => {
    const doc = resolveEditorDocument(project(), "bin_file_notes");

    expect(doc?.kind).toBe("internal-file");
    expect(doc).toMatchObject({
      id: "bin_file_notes",
      title: "notes.md",
      language: "markdown",
      source: "# Notes",
    });

    const result = commitEditorDocumentSource(
      project(),
      doc as EditorDocument,
      "# Updated",
    );

    expect(result.error).toBeUndefined();
    expect(result.project.bin?.[0]).toMatchObject({ source: "# Updated" });
  });

  it("resolves and commits compositions as JSON documents", () => {
    const doc = resolveEditorDocument(project(), "bin_comp_intro");

    expect(doc?.kind).toBe("composition");
    expect(doc).toMatchObject({
      id: "bin_comp_intro",
      title: "Intro",
      language: "json",
    });

    const source = JSON.stringify(
      {
        ...(doc as Extract<EditorDocument, { kind: "composition" }>)
          .composition,
        duration: 8,
      },
      null,
      2,
    );
    const result = commitEditorDocumentSource(
      project(),
      doc as EditorDocument,
      source,
    );

    expect(result.error).toBeUndefined();
    expect(result.project.compositionLibrary?.[0].duration).toBe(8);
  });

  it("rejects invalid composition JSON without mutating project state", () => {
    const current = project();
    const doc = resolveEditorDocument(current, "bin_comp_intro");
    const result = commitEditorDocumentSource(
      current,
      doc as EditorDocument,
      "{ invalid",
    );

    expect(result.error).toContain("Invalid JSON");
    expect(result.project).toBe(current);
    expect(result.project.compositionLibrary?.[0].duration).toBe(5);
  });

  it("does not resolve external proxies as editor documents", () => {
    expect(resolveEditorDocument(project(), "bin_proxy_logo")).toBeNull();
  });
});
