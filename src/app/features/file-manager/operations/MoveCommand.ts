import { clipperHost } from "../../../clipperHost";
import type { Command } from "./Command";

export class MoveCommand implements Command {
  private moves: Array<{ oldPath: string; newPath: string }>;

  constructor(moves: Array<{ oldPath: string; newPath: string }>) {
    this.moves = moves.filter(isValidMovePath);
  }

  get label() {
    return "Move files";
  }

  async execute() {
    await performMoves(this.moves);
  }

  async undo() {
    await performMoves(
      this.moves.map((m) => ({ oldPath: m.newPath, newPath: m.oldPath })),
    );
  }

  async redo() {
    await this.execute();
  }
}

async function performMoves(
  moves: Array<{ oldPath: string; newPath: string }>,
) {
  const applied: Array<{ oldPath: string; newPath: string }> = [];

  try {
    for (const m of moves) {
      await ensureParentDirectory(m.newPath);
      await clipperHost.renameFile(m.oldPath, m.newPath);
      applied.push(m);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const m of applied.reverse()) {
      try {
        await ensureParentDirectory(m.oldPath);
        await clipperHost.renameFile(m.newPath, m.oldPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Move failed and rollback was incomplete.",
      );
    }
    throw error;
  }
}

function isValidMovePath(move: { oldPath: string; newPath: string }) {
  return (
    move.oldPath !== move.newPath &&
    !move.newPath.startsWith(`${move.oldPath}/`)
  );
}

async function ensureParentDirectory(path: string) {
  const parentPath = path.substring(0, path.lastIndexOf("/"));
  if (parentPath) await clipperHost.createDirectory(parentPath).catch(() => {});
}
