import { describe, expect, it } from "vitest";
import { getFileTreeMoveInsertionIndex, getPointerFileTreeDrop, moveFileTreeNodesForTest, shouldSkipFileManagerShortcut } from "./FileManager";

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

  it("targets root before the first visible row", () => {
    const tree = [
      { id: "project-folder:folder", kind: "project-folder" as const, path: "folder", name: "folder", children: [] },
    ];
    const api = { visibleNodes: [{ id: "project-folder:folder" }] };

    expect(getPointerFileTreeDrop(api as never, tree, ["project-folder:folder"], 12, -4, 220)).toEqual({
      dragIds: ["project-folder:folder"],
      parentId: null,
      index: 0,
    });
  });

  it("targets root after the minimum-height row area", () => {
    const tree = [
      { id: "project-folder:folder", kind: "project-folder" as const, path: "folder", name: "folder", children: [] },
    ];
    const api = { visibleNodes: [{ id: "project-folder:folder" }] };

    expect(getPointerFileTreeDrop(api as never, tree, ["project-folder:folder"], 12, 240, 220)).toEqual({
      dragIds: ["project-folder:folder"],
      parentId: null,
      index: 1,
    });
  });

  it("falls back around dropping a folder into itself", () => {
    const tree = [
      { id: "project-folder:compositions", kind: "project-folder" as const, path: "compositions", name: "compositions", children: [] },
    ];
    const api = { visibleNodes: [{ id: "project-folder:compositions", isInternal: true, level: 0, childIndex: 0, parent: null }] };

    expect(getPointerFileTreeDrop(api as never, tree, ["project-folder:compositions"], 12, 15, 220)).toEqual({
      dragIds: ["project-folder:compositions"],
      parentId: null,
      index: 0,
    });
  });

  it("falls back around the invalid band between a top folder and its first child", () => {
    const tree = [
      { id: "project-folder:A", kind: "project-folder" as const, path: "A", name: "A", children: [
        { id: "project-folder:A/B", kind: "project-folder" as const, path: "A/B", name: "B", children: [] },
      ] },
    ];
    const api = { visibleNodes: [
      { id: "project-folder:A", isInternal: true, level: 0, childIndex: 0, parent: null },
      { id: "project-folder:A/B", isInternal: true, level: 1, childIndex: 0, parent: { id: "project-folder:A" } },
    ] };

    expect(getPointerFileTreeDrop(api as never, tree, ["project-folder:A"], 12, 15, 220)).toEqual({
      dragIds: ["project-folder:A"],
      parentId: null,
      index: 0,
    });
  });

  it("falls back around dropping a folder into its descendant", () => {
    const tree = [
      { id: "project-folder:compositions", kind: "project-folder" as const, path: "compositions", name: "compositions", children: [
        { id: "project-folder:compositions/nested", kind: "project-folder" as const, path: "compositions/nested", name: "nested", children: [] },
      ] },
    ];
    const api = { visibleNodes: [{ id: "project-folder:compositions/nested", isInternal: true, level: 1, childIndex: 0, parent: { id: "project-folder:compositions" } }] };

    expect(getPointerFileTreeDrop(api as never, tree, ["project-folder:compositions"], 36, 15, 220)).toEqual({
      dragIds: ["project-folder:compositions"],
      parentId: null,
      index: 0,
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

describe("shouldSkipFileManagerShortcut", () => {
  it("skips shortcuts from rename text fields", () => {
    const input = withDomConstructors(() => new FakeInputElement("text"));

    expect(withDomConstructors(() => shouldSkipFileManagerShortcut(input))).toBe(true);
  });

  it("does not skip shortcuts from range inputs", () => {
    const input = withDomConstructors(() => new FakeInputElement("range"));

    expect(withDomConstructors(() => shouldSkipFileManagerShortcut(input))).toBe(false);
  });
});

class FakeElement {
  addEventListener() {}

  closest() {
    return this;
  }

  dispatchEvent() {
    return true;
  }

  removeEventListener() {}
}

class FakeInputElement extends FakeElement {
  constructor(readonly type: string) {
    super();
  }
}

function withDomConstructors<T>(callback: () => T) {
  const originalHTMLElement = globalThis.HTMLElement;
  const originalHTMLInputElement = globalThis.HTMLInputElement;

  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, "HTMLInputElement", { configurable: true, value: FakeInputElement });
  try {
    return callback();
  } finally {
    if (originalHTMLElement) Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: originalHTMLElement });
    else Reflect.deleteProperty(globalThis, "HTMLElement");
    if (originalHTMLInputElement) Object.defineProperty(globalThis, "HTMLInputElement", { configurable: true, value: originalHTMLInputElement });
    else Reflect.deleteProperty(globalThis, "HTMLInputElement");
  }
}
