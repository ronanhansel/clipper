import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";

export class CreateCommand implements Command {
  constructor(
    private path: string,
    private name: string,
    private isDirectory: boolean,
    private content?: string
  ) {}

  get label() {
    return `Create "${this.name}"`;
  }

  async execute() {
    const parentPath = this.path.substring(0, this.path.lastIndexOf("/"));
    if (parentPath) {
      await clipperHost.createDirectory(parentPath).catch(() => {});
    }
    if (this.isDirectory) {
      await clipperHost.createDirectory(this.path);
    } else if (this.content !== undefined) {
      await clipperHost.writeTextFile(this.path, this.content);
    }
  }

  async undo() {
    // For delete-on-undo, we should move to trash, not permanent delete?
    // The prompt says "New file/folder undo deletes the created resource"
    // Let's use trash for safety.
    await clipperHost.trashFile(this.path);
  }

  async redo() {
    await this.execute();
  }
}
