import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";

export class MoveCommand implements Command {
  constructor(
    private moves: Array<{ oldPath: string; newPath: string }>
  ) {}

  get label() {
    return "Move files";
  }

  async execute() {
    for (const m of this.moves) {
      await clipperHost.renameFile(m.oldPath, m.newPath);
    }
  }

  async undo() {
    for (const m of this.moves) {
      await clipperHost.renameFile(m.newPath, m.oldPath);
    }
  }

  async redo() {
    await this.execute();
  }
}
