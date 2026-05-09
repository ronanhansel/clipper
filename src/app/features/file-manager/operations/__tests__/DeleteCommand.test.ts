import { describe, it, expect, vi } from "vitest";
import { DeleteCommand } from "../DeleteCommand";
import { clipperHost } from "../../../../clipperHost";

vi.mock("../../../../clipperHost", () => ({
  clipperHost: {
    renameFile: vi.fn(),
    createDirectory: vi.fn().mockReturnValue({ catch: vi.fn() }),
  },
}));

describe("DeleteCommand", () => {
  it("should rename file to hidden trash path on execute", async () => {
    const command = new DeleteCommand(
      [{ path: "/path/to/file", name: "file", isDirectory: false }],
      "/path",
    );
    await command.execute();
    expect(clipperHost.renameFile).toHaveBeenCalledWith(
      "/path/to/file",
      expect.stringContaining("/path/.clipper-trash/"),
    );
  });

  it("should rename file back on undo", async () => {
    const command = new DeleteCommand(
      [{ path: "/path/to/file", name: "file", isDirectory: false }],
      "/path",
    );
    await command.execute();
    await command.undo();
    expect(clipperHost.renameFile).toHaveBeenCalledWith(
      expect.stringContaining("/path/.clipper-trash/"),
      "/path/to/file",
    );
  });

  it("should restore bulk deletes as one command", async () => {
    const command = new DeleteCommand(
      [
        { path: "/path/to/one", name: "one", isDirectory: false },
        { path: "/path/to/two", name: "two", isDirectory: false },
      ],
      "/path",
    );

    await command.execute();
    await command.undo();

    expect(clipperHost.renameFile).toHaveBeenCalledWith(
      expect.stringContaining("/path/.clipper-trash/"),
      "/path/to/one",
    );
    expect(clipperHost.renameFile).toHaveBeenCalledWith(
      expect.stringContaining("/path/.clipper-trash/"),
      "/path/to/two",
    );
  });
});
