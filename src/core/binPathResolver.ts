import type { ProjectBinItem } from "./types";

export function resolveBinItemByPath(
  bin: ProjectBinItem[],
  path: string,
): ProjectBinItem | null {
  const segments = splitBinPath(path);
  if (segments.length === 0) return null;
  let current: ProjectBinItem[] | undefined = bin;
  let found: ProjectBinItem | null = null;
  for (let i = 0; i < segments.length; i += 1) {
    if (!current) return null;
    const segment = segments[i];
    const match: ProjectBinItem | undefined = current.find(
      (item) => item.name === segment,
    );
    if (!match) return null;
    if (i === segments.length - 1) {
      found = match;
      break;
    }
    if (match.kind !== "folder") return null;
    current = match.children;
  }
  return found;
}

export function getBinItemPath(
  bin: ProjectBinItem[],
  itemId: string,
): string | null {
  return walkForPath(bin, itemId, []);
}

function walkForPath(
  items: ProjectBinItem[],
  itemId: string,
  parents: string[],
): string | null {
  for (const item of items) {
    const path = [...parents, item.name];
    if (item.id === itemId) return path.join("/");
    if (item.kind === "folder" && item.children) {
      const found = walkForPath(item.children, itemId, path);
      if (found) return found;
    }
  }
  return null;
}

function splitBinPath(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}
