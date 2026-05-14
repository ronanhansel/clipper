import { describe, expect, it } from "vitest";
import {
  classifyProjectAutosaveWrite,
  classifyProjectFileChange,
  type ProjectDiskSnapshotBundle,
  type ProjectSnapshotPair,
} from "./projectFileChangeClassifier";

const snapshot = (value: string): ProjectSnapshotPair => ({
  project: `project:${value}`,
  compositionSources: `sources:${value}`,
});
const disk = (full: string, fileContent = full): ProjectDiskSnapshotBundle => ({
  full: snapshot(full),
  fileContent: snapshot(fileContent),
});

describe("classifyProjectFileChange", () => {
  it("ignores watcher events for unchanged file-manager content", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current-content"),
        currentSnapshots: snapshot("current"),
        diskSnapshots: disk("disk", "saved-content"),
        hasUnsavedAppChanges: true,
        savedFileContentSnapshots: snapshot("saved-content"),
      }),
    ).toBe("ignore");
  });

  describe("classifyProjectAutosaveWrite", () => {
    it("marks target disk snapshots as saved without another write", () => {
      expect(
        classifyProjectAutosaveWrite({
          diskSnapshots: disk("target", "target-content"),
          savedFileContentSnapshots: snapshot("old-content"),
          targetFileContentSnapshots: snapshot("target-content"),
          targetSnapshots: snapshot("target"),
        }),
      ).toBe("mark-saved");
    });

    it("writes when disk still matches the saved file-content baseline", () => {
      expect(
        classifyProjectAutosaveWrite({
          diskSnapshots: disk("saved-full", "saved-content"),
          savedFileContentSnapshots: snapshot("saved-content"),
          targetFileContentSnapshots: snapshot("target-content"),
          targetSnapshots: snapshot("target"),
        }),
      ).toBe("write");
    });

    it("accepts app-authored file content already on disk before writing metadata", () => {
      expect(
        classifyProjectAutosaveWrite({
          diskSnapshots: disk("old-editor-state", "target-content"),
          savedFileContentSnapshots: snapshot("saved-content"),
          targetFileContentSnapshots: snapshot("target-content"),
          targetSnapshots: snapshot("target"),
        }),
      ).toBe("mark-file-content-saved-and-write");
    });

    it("writes when only file-manager content differs from saved and target", () => {
      expect(
        classifyProjectAutosaveWrite({
          diskSnapshots: disk("external", "external-content"),
          savedFileContentSnapshots: snapshot("saved-content"),
          targetFileContentSnapshots: snapshot("target-content"),
          targetSnapshots: snapshot("target"),
        }),
      ).toBe("write");
    });

    it("conflicts when project metadata changed outside the app", () => {
      expect(
        classifyProjectAutosaveWrite({
          diskSnapshots: {
            ...disk("external", "external-content"),
            projectMetadata: snapshot("external-metadata"),
          },
          savedFileContentSnapshots: snapshot("saved-content"),
          savedMetadataSnapshots: snapshot("saved-metadata"),
          targetFileContentSnapshots: snapshot("target-content"),
          targetMetadataSnapshots: snapshot("target-metadata"),
          targetSnapshots: snapshot("target"),
        }),
      ).toBe("conflict");
    });
  });

  it("marks app-originated full disk writes as saved", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current"),
        currentSnapshots: snapshot("current"),
        diskSnapshots: disk("current"),
        hasUnsavedAppChanges: true,
        savedFileContentSnapshots: snapshot("old"),
      }),
    ).toBe("mark-saved");
  });

  it("updates only the file-content baseline when editor state remains unsaved", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current-content"),
        currentSnapshots: snapshot("current-full-with-unsaved-editor-state"),
        diskSnapshots: disk(
          "disk-full-with-old-editor-state",
          "current-content",
        ),
        hasUnsavedAppChanges: true,
        savedFileContentSnapshots: snapshot("old-content"),
      }),
    ).toBe("mark-file-content-saved");
  });

  it("reloads external file changes when app has no unsaved changes", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current-content"),
        currentSnapshots: snapshot("current"),
        diskSnapshots: disk("external", "external-content"),
        hasUnsavedAppChanges: false,
        savedFileContentSnapshots: snapshot("current-content"),
      }),
    ).toBe("reload");
  });

  it("conflicts on external file-manager changes while app has unsaved changes", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current-content"),
        currentSnapshots: snapshot("current"),
        diskSnapshots: disk("external", "external-content"),
        hasUnsavedAppChanges: true,
        savedFileContentSnapshots: snapshot("old-content"),
      }),
    ).toBe("conflict");
  });

  it("conflicts instead of reloading when external file changes race unsaved app changes", () => {
    expect(
      classifyProjectFileChange({
        currentFileContentSnapshots: snapshot("current-content"),
        currentSnapshots: snapshot("current-with-unsaved-app-edit"),
        diskSnapshots: disk("external", "external-content"),
        hasUnsavedAppChanges: true,
        savedFileContentSnapshots: snapshot("saved-content"),
      }),
    ).toBe("conflict");
  });
});
