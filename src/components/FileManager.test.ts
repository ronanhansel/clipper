import { describe, expect, it } from "vitest";
import { getFileTreeMoveInsertionIndex, getPointerFileTreeDrop, moveFileTreeNodesForTest } from "./FileManager";

describe("getFileTreeMoveInsertionIndex", () => {
  it("adjusts same-parent drop indexes using original sibling order", () => {
    const siblings = ["A", "B", "C", "D"];

    expect(getFileTreeMoveInsertionIndex(siblings, new Set(["C"]), 1)).toBe(1);
    expect(getFileTreeMoveInsertionIndex(siblings, new Set(["D"]), 1)).toBe(1);
    expect(getFileTreeMoveInsertionIndex(siblings, new Set(["B"]), 3)).toBe(2);
  });

  it("does not depend on drag selection order", () => {
    const siblings = ["A", "B", "C", "D", "E"];
    const selectedOutOfSiblingOrder = new Set(["D", "B"]);

    expect(getFileTreeMoveInsertionIndex(siblings, selectedOutOfSiblingOrder, 4)).toBe(2);
  });
});

describe("getPointerFileTreeDrop", () => {
  it("targets root after the last visible row", () => {
    const tree = [
      { id: "project-folder:folder", kind: "project-folder" as const, path: "folder", name: "folder", children: [{ id: "composition:child", kind: "composition" as const, name: "child", composition: { id: "child", duration: 5, frame: { width: 1920 as const, height: 1080 as const, style: {} }, objects: [], background: { id: "bg", name: "Background", style: {}, elements: [] }, filePath: "root/folder/child.composition.ts", snapshot: [], motionMarkers: [] } }] },
    ];
    const api = { visibleNodes: [{ id: "project-folder:folder" }] };

    expect(getPointerFileTreeDrop(api as never, tree, ["composition:child"], 12, 44, 220)).toEqual({
      dragIds: ["composition:child"],
      parentId: null,
      index: 1,
    });
  });
});

describe("moveFileTreeNodes", () => {
  it("moves project files out of folders to root", () => {
    const child = { id: "composition:child", kind: "composition" as const, name: "child", composition: { id: "child", duration: 5, frame: { width: 1920 as const, height: 1080 as const, style: {} }, objects: [], background: { id: "bg", name: "Background", style: {}, elements: [] }, filePath: "root/folder/child.composition.ts", snapshot: [], motionMarkers: [] } };
    const tree = [
      { id: "project-folder:folder", kind: "project-folder" as const, path: "folder", name: "folder", children: [child] },
    ];

    expect(moveFileTreeNodesForTest(tree, ["composition:child"], null, 1)).toEqual([
      { id: "project-folder:folder", kind: "project-folder", path: "folder", name: "folder", children: [] },
      child,
    ]);
  });
});
