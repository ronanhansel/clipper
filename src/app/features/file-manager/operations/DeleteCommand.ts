import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";
import { getDirectoryPath } from "../fileManagerPaths";

export class DeleteCommand implements Command {
  private trashPath: string;

  constructor(
    private path: string,
    private name: string,
    private isDirectory: boolean,
    private projectRoot: string
  ) {
    this.trashPath = `${projectRoot}/.clipper-trash/${Date.now()}_${name}`;
  }

  get label() {
    return `Delete "${this.name}"`;
  }

  async execute() {
    await clipperHost.createDirectory(`${this.projectRoot}/.clipper-trash`).catch(() => {});
    await clipperHost.renameFile(this.path, this.trashPath);
  }

  async undo() {
    await clipperHost.renameFile(this.trashPath, this.path);
  }

  async redo() {
    await this.execute();
  }
}
