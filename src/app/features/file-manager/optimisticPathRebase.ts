export type PendingPathMove = {
  oldPath: string;
  newPath: string;
};

export function rebasePath(path: string, moves: PendingPathMove[]) {
  let currentPath = path;
  const seen = new Set<string>();

  while (!seen.has(currentPath)) {
    seen.add(currentPath);
    const move = moves.find(
      (candidate) =>
        currentPath === candidate.oldPath ||
        currentPath.startsWith(`${candidate.oldPath}/`),
    );
    if (!move) break;
    currentPath = `${move.newPath}${currentPath.slice(move.oldPath.length)}`;
  }

  return currentPath;
}
