import type { ContextMenuItem } from "../../app/types";

export type PathMenuEntry<T> = {
  path: string | readonly string[];
  value: T;
};

export type PathMenuNode<T> = {
  label: string;
  entries: Array<{ label: string; value: T }>;
  children: PathMenuNode<T>[];
};

export function buildPathMenuTree<T>(
  entries: readonly PathMenuEntry<T>[],
): PathMenuNode<T>[] {
  const root: PathMenuNode<T> = { label: "", entries: [], children: [] };
  for (const entry of entries) addPathMenuEntry(root, entry);
  sortPathMenuNode(root);
  return root.children;
}

export function createPathContextMenuItems<T>(
  nodes: readonly PathMenuNode<T>[],
  action: (value: T, label: string) => void,
): ContextMenuItem[] {
  return nodes.map((node) => ({
    label: node.label,
    children: createPathContextMenuChildren(node, action),
  }));
}

export function createPathContextMenuChildren<T>(
  node: PathMenuNode<T>,
  action: (value: T, label: string) => void,
): ContextMenuItem[] {
  return [
    ...node.entries.map((entry) => ({
      label: entry.label,
      action: () => action(entry.value, entry.label),
    })),
    ...createPathContextMenuItems(node.children, action),
  ];
}

export function parsePathMenuSegments(path: string | readonly string[]) {
  const segments = Array.isArray(path)
    ? [...path]
    : typeof path === "string"
      ? path.split(":")
      : [];
  return segments.map((segment: string) => segment.trim()).filter(Boolean);
}

function addPathMenuEntry<T>(root: PathMenuNode<T>, entry: PathMenuEntry<T>) {
  const path = parsePathMenuSegments(entry.path);
  if (path.length === 0) return;
  let current = root;
  for (const label of path.slice(0, -1)) {
    let child = current.children.find((candidate) => candidate.label === label);
    if (!child) {
      child = { label, entries: [], children: [] };
      current.children.push(child);
    }
    current = child;
  }
  current.entries.push({ label: path[path.length - 1], value: entry.value });
}

function sortPathMenuNode<T>(node: PathMenuNode<T>) {
  node.entries.sort((left, right) => left.label.localeCompare(right.label));
  node.children.sort((left, right) => left.label.localeCompare(right.label));
  for (const child of node.children) sortPathMenuNode(child);
}
