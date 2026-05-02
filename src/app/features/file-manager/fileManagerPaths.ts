import { reconstructFileName } from "./fileNames";

export function getDirectoryPath(relativePath: string) {
  const lastSlashIndex = relativePath.lastIndexOf("/");
  return lastSlashIndex > 0 ? relativePath.slice(0, lastSlashIndex) : relativePath;
}

export function reorderByIntent<T>(items: T[], sourceIndex: number, targetIndex: number, action: "before" | "after") {
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(action === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, moved);
  return next;
}

export function nextNumberedName(baseName: string, siblingNames: Iterable<string>) {
  const names = new Set(Array.from(siblingNames).map((name) => name.trim()).filter(Boolean));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

export function compositionFilePathWithName(filePath: string, id: string, name: string) {
  const directory = getDirectoryPath(filePath);
  const fileName = filePath.split("/").pop() || "";
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || id;
  
  // If the original file was a semantic file (e.g. .composition.ts), preserve that suffix.
  // Otherwise, fallback to the original extension or .ts.
  const nextFileName = reconstructFileName(slug, fileName);
  if (nextFileName !== slug) {
    return `${directory}/${nextFileName}`;
  }

  const extensionIndex = filePath.lastIndexOf(".");
  const extension = extensionIndex > filePath.lastIndexOf("/") ? filePath.slice(extensionIndex) : ".ts";
  return `${directory}/${slug}${extension}`;
}
