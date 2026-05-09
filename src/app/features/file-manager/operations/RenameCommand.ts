import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";
import { getDirectoryPath } from "../fileManagerPaths";

export class RenameCommand implements Command {
  private newPath: string;

  constructor(
    private oldPath: string,
    private newName: string,
  ) {
    const parentPath = getDirectoryPath(oldPath);
    this.newPath = parentPath ? `${parentPath}/${newName}` : newName;
  }

  get label() {
    return `Rename to "${this.newName}"`;
  }

  async execute() {
    await ensureParentDirectory(this.newPath);
    await clipperHost.renameFile(this.oldPath, this.newPath);
  }

  async undo() {
    await ensureParentDirectory(this.oldPath);
    await clipperHost.renameFile(this.newPath, this.oldPath);
  }

  async redo() {
    await this.execute();
  }
}

async function ensureParentDirectory(path: string) {
  const parentPath = getDirectoryPath(path);
  if (parentPath) await clipperHost.createDirectory(parentPath).catch(() => {});
}
