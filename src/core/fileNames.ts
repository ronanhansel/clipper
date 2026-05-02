/**
 * Helpers for handling semantic file names in the File Manager.
 * Hides suffixes like .composition and .timeline from the user.
 */

export type FileType = "composition" | "timeline" | "folder" | "file";

const COMPOSITION_SUFFIXES = [".composition.ts", ".composition.json"];
const TIMELINE_SUFFIXES = [".timeline.ts", ".timeline.json"];
const DRAG_PREVIEW_SUFFIXES = [...COMPOSITION_SUFFIXES, ...TIMELINE_SUFFIXES, ".composition", ".timeline"];

export function getDisplayName(fileName: string): string {
  for (const suffix of COMPOSITION_SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length);
  }
  for (const suffix of TIMELINE_SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length);
  }
  
  // Also handle legacy or simple extensions if they match our known types
  // but for misc files we leave them alone as per requirements.
  // The requirement says: "For all other miscellaneous project files, leave names/extensions normal."
  // "intro.composition.ts ... should display/edit as intro"
  // "main.timeline.ts ... should display/edit as main"
  // "README.md ... should display/edit unchanged"
  
  return fileName;
}

export function getDisplayNameFromPath(filePath: string): string {
  const fileName = filePath.split("/").pop() || "";
  return getDisplayName(fileName);
}

export function getDragPreviewDisplayName(fileNameOrPath: string): string {
  const fileName = fileNameOrPath.split("/").pop() || fileNameOrPath;
  for (const suffix of DRAG_PREVIEW_SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length);
  }
  return fileName;
}

export function getFileType(fileName: string, isDirectory: boolean, isCompositionContent?: boolean): FileType {
  if (isDirectory) return "folder";
  
  for (const suffix of COMPOSITION_SUFFIXES) {
    if (fileName.endsWith(suffix)) return "composition";
  }
  for (const suffix of TIMELINE_SUFFIXES) {
    if (fileName.endsWith(suffix)) return "timeline";
  }
  
  // Legacy support for OsFileManager which detects by content or location
  if (isCompositionContent) return "composition";
  
  // Note: OsFileManager has specific logic for timelines in timelines/ folder
  // but here we focus on the filename-based detection requested.
  
  return "file";
}

export function reconstructFileName(displayName: string, originalFileName: string): string {
  for (const suffix of COMPOSITION_SUFFIXES) {
    if (originalFileName.endsWith(suffix)) return displayName + suffix;
  }
  for (const suffix of TIMELINE_SUFFIXES) {
    if (originalFileName.endsWith(suffix)) return displayName + suffix;
  }
  return displayName;
}

export function isSemanticFile(fileName: string): boolean {
  return COMPOSITION_SUFFIXES.some(s => fileName.endsWith(s)) || 
         TIMELINE_SUFFIXES.some(s => fileName.endsWith(s));
}

export function nextNumberedSemanticName(baseName: string, suffix: string, siblingNames: Iterable<string>) {
  const names = new Set(siblingNames);
  if (!names.has(baseName + suffix)) return baseName + suffix;
  let index = 2;
  while (names.has(`${baseName} ${index}${suffix}`)) index += 1;
  return `${baseName} ${index}${suffix}`;
}
