import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editorStore";
import { FRAME_HEIGHT, FRAME_WIDTH, type ProjectManifest } from "../../core/types";

const baseProject: ProjectManifest = {
  id: "project",
  name: "Project",
  resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
  scenes: [],
  assetsPath: "assets",
  editorState: { timeline: { displacement: 0, zoom: 1 }, timelineMode: "compose" },
};

describe("editorStore editor tabs", () => {
  it("restores rendered video export worker count from persisted editor state", () => {
    const store = createEditorStore({ ...baseProject, editorState: { ...baseProject.editorState!, renderedVideoExportWorkerCount: 1 } });

    expect(store.getState().renderedVideoExportWorkerCount).toBe(1);

    store.getState().setRenderedVideoExportWorkerCount(2);
    expect(store.getState().renderedVideoExportWorkerCount).toBe(2);
  });

  it("restores the most recently closed pinned tab without persisting runtime source", () => {
    const store = createEditorStore(baseProject);

    store.getState().openEditorTab({ id: "a", filePath: "a.ts", source: "runtime", language: "typescript" });
    store.getState().openEditorTab({ id: "b", filePath: "b.ts", language: "typescript" });
    store.getState().closeEditorTab("a");

    expect(store.getState().closedEditorTabs[0]).toEqual({ id: "a", filePath: "a.ts", language: "typescript", isPinned: true });
    expect(store.getState().restoreClosedEditorTab()).toBe(true);
    expect(store.getState().activeEditorTabId).toBe("a");
    expect(store.getState().editorTabs.find((tab) => tab.id === "a")).toEqual({ id: "a", filePath: "a.ts", language: "typescript", isPinned: true });
  });

  it("restores temporary tabs through the existing temporary replacement slot", () => {
    const store = createEditorStore(baseProject);

    store.getState().openTemporaryEditorTab({ id: "temp-a", filePath: "temp-a.ts", language: "typescript" });
    store.getState().closeEditorTab("temp-a");
    store.getState().openTemporaryEditorTab({ id: "temp-b", filePath: "temp-b.ts", language: "typescript" });

    expect(store.getState().restoreClosedEditorTab()).toBe(true);
    expect(store.getState().editorTabs).toEqual([{ id: "temp-a", filePath: "temp-a.ts", language: "typescript", isPinned: false }]);
  });

  it("skips closed tabs that were reopened before restore", () => {
    const store = createEditorStore(baseProject);

    store.getState().openEditorTab({ id: "a", filePath: "a.ts", language: "typescript" });
    store.getState().openEditorTab({ id: "b", filePath: "b.ts", language: "typescript" });
    store.getState().closeEditorTab("a");
    store.getState().closeEditorTab("b");
    store.getState().openEditorTab({ id: "b", filePath: "b.ts", language: "typescript" });

    expect(store.getState().restoreClosedEditorTab()).toBe(true);
    expect(store.getState().activeEditorTabId).toBe("a");
    expect(store.getState().editorTabs.map((tab) => tab.id)).toEqual(["b", "a"]);
  });
});
