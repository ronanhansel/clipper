import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";
import { getDirectoryPath } from "../fileManagerPaths";

export class RenameCommand implements Command {
  private newPath: string;

  constructor(
    private oldPath: string,
    private newName: string
  ) {
    const parentPath = getDirectoryPath(oldPath);
    this.newPath = parentPath ? `${parentPath}/${newName}` : newName;
  }

  get label() {
    return `Rename to "${this.newName}"`;
  }

  async execute() {
    await clipperHost.renameFile(this.oldPath, this.newPath);
  }

  async undo() {
    await clipperHost.renameFile(this.newPath, this.oldPath);
  }

  async redo() {
    await this.execute();
  }
}
