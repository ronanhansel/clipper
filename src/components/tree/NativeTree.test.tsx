import { describe, expect, it } from "vitest";
import { collectNativeTreeIds, reconcileNativeTreeIdentityState } from "./NativeTree";

type TestNode = {
  id: string;
  children?: TestNode[];
};

describe("NativeTree controlled data identity", () => {
  it("collects ids from the latest parent data so stale edit and selection ids can be pruned after rename", () => {
    const before: TestNode[] = [
      { id: "/project/file-manager/A.txt" },
      { id: "/project/file-manager/folder", children: [{ id: "/project/file-manager/folder/B.txt" }] },
    ];
    const after: TestNode[] = [
      { id: "/project/file-manager/C.txt" },
      { id: "/project/file-manager/folder", children: [{ id: "/project/file-manager/folder/D.txt" }] },
    ];

    const beforeIds = collectNativeTreeIds(before, "id");
    const afterIds = collectNativeTreeIds(after, "id");

    expect(beforeIds.has("/project/file-manager/A.txt")).toBe(true);
    expect(beforeIds.has("/project/file-manager/folder/B.txt")).toBe(true);
    expect(afterIds.has("/project/file-manager/A.txt")).toBe(false);
    expect(afterIds.has("/project/file-manager/folder/B.txt")).toBe(false);
    expect(afterIds.has("/project/file-manager/C.txt")).toBe(true);
    expect(afterIds.has("/project/file-manager/folder/D.txt")).toBe(true);
  });

  it("reconciles every id-based state slot against latest parent data", () => {
    const validIds = new Set(["/project/file-manager/B.txt", "/project/file-manager/folder"]);

    expect(reconcileNativeTreeIdentityState({
      selectedIds: ["/project/file-manager/A.txt", "/project/file-manager/B.txt"],
      focusedId: "/project/file-manager/A.txt",
      editingId: "/project/file-manager/A.txt",
      dragState: { ids: ["/project/file-manager/A.txt", "/project/file-manager/B.txt"], primaryId: "/project/file-manager/A.txt", mouse: { x: 1, y: 2 } },
      dropTarget: { dragIds: ["/project/file-manager/A.txt"], parentId: "/project/file-manager/missing", index: 0 },
    }, validIds)).toEqual({
      selectedIds: ["/project/file-manager/B.txt"],
      focusedId: null,
      editingId: null,
      dragState: null,
      dropTarget: null,
    });
  });
});
