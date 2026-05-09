import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";

export type DeleteCommandTarget = {
  path: string;
  name: string;
  isDirectory: boolean;
};

export class DeleteCommand implements Command {
  private targets: Array<DeleteCommandTarget & { trashPath: string }>;

  constructor(
    targets: DeleteCommandTarget[],
    private projectRoot: string,
  ) {
    const timestamp = Date.now();
    this.targets = targets.map((target, index) => ({
      ...target,
      trashPath: `${projectRoot}/.clipper-trash/${timestamp}_${index}_${target.name}`,
    }));
  }

  get label() {
    return this.targets.length === 1
      ? `Delete "${this.targets[0].name}"`
      : `Delete ${this.targets.length} items`;
  }

  async execute() {
    await clipperHost
      .createDirectory(`${this.projectRoot}/.clipper-trash`)
      .catch(() => {});
    await performRenames(
      this.targets.map((target) => ({
        oldPath: target.path,
        newPath: target.trashPath,
      })),
    );
  }

  async undo() {
    await performRenames(
      this.targets.map((target) => ({
        oldPath: target.trashPath,
        newPath: target.path,
      })),
    );
  }

  async redo() {
    await this.execute();
  }
}

async function performRenames(
  renames: Array<{ oldPath: string; newPath: string }>,
) {
  const applied: Array<{ oldPath: string; newPath: string }> = [];

  try {
    for (const rename of renames) {
      await clipperHost.renameFile(rename.oldPath, rename.newPath);
      applied.push(rename);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const rename of applied.reverse()) {
      try {
        await clipperHost.renameFile(rename.newPath, rename.oldPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Delete failed and rollback was incomplete.",
      );
    }
    throw error;
  }
}
