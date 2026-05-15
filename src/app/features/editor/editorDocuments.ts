import type {
  CompositionClip,
  ProjectBinItem,
  ProjectManifest,
} from "../../../core/types";
import {
  findBinItem,
  normalizeProjectBin,
} from "../../features/file-manager/projectBinMutations";
import { getDisplayNameFromPath } from "../../../core/fileNames";

export type EditorDocument =
  | {
      kind: "internal-file";
      id: string;
      title: string;
      language: string;
      source: string;
    }
  | {
      kind: "composition";
      id: string;
      title: string;
      language: "json";
      source: string;
      composition: CompositionClip;
    };

export type UnsupportedDocument = {
  kind: "unsupported";
  id: string;
  title: string;
  reason: string;
};

export type ResolvedEditorDocument =
  | EditorDocument
  | UnsupportedDocument
  | null;

export function resolveEditorDocument(
  project: ProjectManifest,
  tabId: string,
  tabKind?: "internal-file" | "composition" | "timeline",
): ResolvedEditorDocument {
  const bin = normalizeProjectBin(project);
  const binItem = findBinItem(bin, tabId);

  if (binItem?.kind === "internal-file") {
    return {
      kind: "internal-file",
      id: binItem.id,
      title: binItem.name,
      language: binItem.language,
      source: binItem.source ?? "",
    };
  }

  if (binItem?.kind === "composition") {
    const composition = project.compositionLibrary?.find(
      (c) => c.id === binItem.compositionId,
    );
    if (!composition) return null;
    return {
      kind: "composition",
      id: binItem.id,
      title: binItem.name,
      language: "json",
      source: compositionToJsonSource(composition),
      composition,
    };
  }

  if (binItem?.kind === "timeline") {
    const timeline = project.timelines?.find(
      (t) => t.id === binItem.timelineId,
    );
    if (!timeline) return null;
    const { timelineLayers: _tl, ...rest } = timeline;
    return {
      kind: "internal-file",
      id: binItem.id,
      title: binItem.name,
      language: "json",
      source: JSON.stringify(rest, null, 2),
    };
  }

  if (tabKind === "composition" || !tabKind) {
    const composition = project.compositionLibrary?.find((c) => c.id === tabId);
    if (composition) {
      return {
        kind: "composition",
        id: composition.id,
        title: getDisplayNameFromPath(composition.filePath).replace(
          /\.composition\.json$/i,
          "",
        ),
        language: "json",
        source: compositionToJsonSource(composition),
        composition,
      };
    }
  }

  return null;
}

export function commitEditorDocumentSource(
  project: ProjectManifest,
  document: EditorDocument,
  source: string,
): { project: ProjectManifest; error?: string } {
  if (document.kind === "internal-file") {
    const bin = normalizeProjectBin(project);
    const updated = updateBinTree(bin, document.id, (item) =>
      item.kind === "internal-file" ? { ...item, source } : item,
    );
    return {
      project: { ...project, bin: updated },
    };
  }

  if (document.kind === "composition") {
    try {
      const parsed = JSON.parse(source);
      const { filePath: _ignoredFilePath, ...parsedComposition } = parsed;
      const updated = (project.compositionLibrary ?? []).map((c) =>
        c.id === document.composition.id ? { ...c, ...parsedComposition } : c,
      );
      return {
        project: { ...project, compositionLibrary: updated },
      };
    } catch (error) {
      return {
        project,
        error:
          error instanceof Error
            ? `Invalid JSON: ${error.message}`
            : "Invalid JSON",
      };
    }
  }

  return { project };
}

export function compositionToJsonSource(composition: CompositionClip): string {
  const { filePath: _filePath, ...sourceComposition } = composition;
  return JSON.stringify(sourceComposition, null, 2);
}

export function getEditorLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "js" || extension === "jsx") return "javascript";
  if (extension === "css") return "css";
  if (extension === "json") return "json";
  if (extension === "md") return "markdown";
  if (extension === "html") return "html";
  return "plaintext";
}

const unsupportedEditorExtensions = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "aiff",
  "flac",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
]);

export function isUnsupportedEditorFile(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return unsupportedEditorExtensions.has(extension);
}

function updateBinTree(
  items: ProjectBinItem[],
  itemId: string,
  updater: (item: ProjectBinItem) => ProjectBinItem,
): ProjectBinItem[] {
  return items.map((item) => {
    if (item.id === itemId) return updater(item);
    if (item.kind !== "folder") return item;
    return {
      ...item,
      children: updateBinTree(item.children ?? [], itemId, updater),
    };
  });
}
