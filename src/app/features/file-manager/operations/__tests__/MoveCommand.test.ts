import { describe, expect, it, vi, beforeEach } from "vitest";
import { MoveCommand } from "../MoveCommand";
import { clipperHost } from "../../../../clipperHost";

vi.mock("../../../../clipperHost", () => ({
  clipperHost: {
    renameFile: vi.fn(),
    createDirectory: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("MoveCommand", () => {
  beforeEach(() => {
    vi.mocked(clipperHost.renameFile).mockReset();
    vi.mocked(clipperHost.createDirectory).mockClear();
  });

  it("rolls back already-applied moves when a later move fails", async () => {
    vi.mocked(clipperHost.renameFile)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("move failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      new MoveCommand([
        {
          oldPath: "/project/compositions/A",
          newPath: "/project/compositions/B",
        },
        {
          oldPath: "/project/compositions/C",
          newPath: "/project/compositions/D",
        },
      ]).execute(),
    ).rejects.toThrow("move failed");

    expect(clipperHost.renameFile).toHaveBeenNthCalledWith(
      1,
      "/project/compositions/A",
      "/project/compositions/B",
    );
    expect(clipperHost.renameFile).toHaveBeenNthCalledWith(
      2,
      "/project/compositions/C",
      "/project/compositions/D",
    );
    expect(clipperHost.renameFile).toHaveBeenNthCalledWith(
      3,
      "/project/compositions/B",
      "/project/compositions/A",
    );
  });

  it("ignores self and descendant moves", async () => {
    await new MoveCommand([
      { oldPath: "/project/compositions", newPath: "/project/compositions" },
      {
        oldPath: "/project/compositions",
        newPath: "/project/compositions/nested/compositions",
      },
    ]).execute();

    expect(clipperHost.renameFile).not.toHaveBeenCalled();
    expect(clipperHost.createDirectory).not.toHaveBeenCalled();
  });
});
