import { describe, expect, it } from "vitest";
import { rebasePath } from "./optimisticPathRebase";

describe("rebasePath", () => {
  it("rebases rapid repeated moves of the same logical folder", () => {
    const pendingMoves = [{ oldPath: "/project/file-manager/compositions/A", newPath: "/project/file-manager/compositions/B" }];

    expect(rebasePath("/project/file-manager/compositions/A", pendingMoves)).toBe("/project/file-manager/compositions/B");
    expect(rebasePath("/project/file-manager/compositions/A/child.ts", pendingMoves)).toBe("/project/file-manager/compositions/B/child.ts");
  });

  it("rebases chained folder moves from A to B to C", () => {
    const pendingMoves = [
      { oldPath: "/project/file-manager/compositions/A", newPath: "/project/file-manager/compositions/B" },
      { oldPath: "/project/file-manager/compositions/B", newPath: "/project/file-manager/compositions/C" },
    ];

    expect(rebasePath("/project/file-manager/compositions/A", pendingMoves)).toBe("/project/file-manager/compositions/C");
    expect(rebasePath("/project/file-manager/compositions/A/child.ts", pendingMoves)).toBe("/project/file-manager/compositions/C/child.ts");
  });
});
