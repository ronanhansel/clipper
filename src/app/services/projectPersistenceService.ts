import { loadCompositionsFromSource } from "../../core/compositionSource";
import { normalizeProject, serializeProjectForSave, withRequiredTimelineLayerTypes } from "../../core/project";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type CompositionDocument, type EditorState, type ProjectManifest, type TimelineDocument } from "../../core/types";
import { clipperHost } from "../clipperHost";
import { getDisplayNameFromPath } from "../../core/fileNames";

type LoadProjectInput = {
  manifestPath: string;
};

type SaveProjectInput = {
  manifestPath: string;
  project: ProjectManifest;
};

class ProjectPersistenceService {
  async loadProject({ manifestPath }: LoadProjectInput) {
    if (manifestPath.endsWith(".json")) {
      const project = await loadDirectoryProject(manifestPath);
      return {
        project,
        sourceStatus: `Project loaded from ${manifestPath}.`,
      };
    }

    const content = await clipperHost.readTextFile(manifestPath);
    const project = normalizeProject(JSON.parse(content) as ProjectManifest);
    return {
      project,
      sourceStatus: `Project loaded from ${manifestPath}.`,
    };
  }

  async saveProject({ manifestPath, project }: SaveProjectInput) {
    const saveProject = serializeProjectForSave(project);
    if (manifestPath.endsWith(".json")) await saveDirectoryProject(manifestPath, saveProject);
    else await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(saveProject, null, 2)}\n`);
    return {
      projectSnapshot: JSON.stringify(saveProject),
      compositionSourcesSnapshot: JSON.stringify(saveProject.compositionSources ?? {}),
      sourceStatus: "Project and composition sources saved.",
    };
  }

  async saveEditorState(manifestPath: string, editorState: EditorState) {
    const content = await clipperHost.readTextFile(manifestPath);
    const manifestProject = JSON.parse(content) as ProjectManifest;
    await clipperHost.writeTextFile(manifestPath, `${JSON.stringify({ ...manifestProject, editorState }, null, 2)}\n`);
  }

}

export async function getEditableRootPath(rootPath: string): Promise<string> {
  try {
    const entries = await clipperHost.listDirectory(rootPath);
    if (entries.some((entry) => entry.isDirectory && entry.name === "file-manager")) {
      return `${rootPath}/file-manager`
    }
  } catch {
    // ignore
  }
  return rootPath
}

async function loadDirectoryProject(manifestPath: string) {
  const content = await clipperHost.readTextFile(manifestPath);
  const manifestProject = JSON.parse(content) as ProjectManifest;
  const rootPath = getDirectoryPath(manifestPath);
  const editableRoot = await getEditableRootPath(rootPath);
  const timelines = await loadDirectoryTimelines(editableRoot, rootPath, manifestProject.timelineOrder);
  const compositions = await loadDirectoryCompositions(editableRoot, rootPath, manifestProject.compositionLibrary ?? []);
  const compositionLibrary = mergeMissingCompositionMetadata({ ...manifestProject, timelines }, compositions);
  return normalizeProject({
    ...manifestProject,
    timelines,
    compositions,
    compositionLibrary,
    compositionSources: Object.fromEntries(compositions.map((composition) => [composition.filePath, composition.source])),
    scenes: manifestProject.scenes ?? [],
  });
}

async function loadDirectoryTimelines(editableRoot: string, fallbackRoot: string, timelineOrder?: string[]) {
  const primaryDir = editableRoot || "file-manager";
  const fallbackDir = fallbackRoot ? `${fallbackRoot}/timelines` : "timelines";

  let timelineFiles = await listProjectFilesRecursive(primaryDir).then(files => files.filter(f => f.name.endsWith(".timeline.json")));

  if (timelineFiles.length === 0) {
    timelineFiles = await listProjectFilesRecursive(fallbackDir).then(files => files.filter(f => f.name.endsWith(".timeline.json")));
  }

  const timelines = await Promise.all(
    timelineFiles.map(async (file) => {
      const document = JSON.parse(await clipperHost.readTextFile(file.path)) as TimelineDocument;
      const repairedTimelineLayers = withRequiredTimelineLayerTypes(document.timelineLayers);
      if (JSON.stringify(document.timelineLayers) !== JSON.stringify(repairedTimelineLayers)) {
        await clipperHost.writeTextFile(file.path, `${JSON.stringify({ ...document, timelineLayers: repairedTimelineLayers }, null, 2)}\n`);
      }
      const filePath = projectPathFromDirectoryEntry(fallbackRoot, file.relativePath, "timelines");
      return { ...document, id: filePath, filePath, timelineLayers: repairedTimelineLayers };
    })
  );

  if (timelineOrder?.length) {
    const orderMap = new Map(timelineOrder.map((id, index) => [id, index]));
    return timelines.sort((left, right) => {
      const leftIndex = orderMap.get(left.id);
      const rightIndex = orderMap.get(right.id);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return getDisplayNameFromPath(left.filePath || left.id).localeCompare(getDisplayNameFromPath(right.filePath || right.id), undefined, { sensitivity: "base" });
    });
  }

  return timelines.sort((left, right) => getDisplayNameFromPath(left.filePath || left.id).localeCompare(getDisplayNameFromPath(right.filePath || right.id), undefined, { sensitivity: "base" }));
}

async function loadDirectoryCompositions(editableRoot: string, fallbackRoot: string, manifestCompositions: CompositionClip[]) {
  const primaryDir = editableRoot ? `${editableRoot}/compositions` : "file-manager/compositions";
  const fallbackDir = fallbackRoot ? `${fallbackRoot}/compositions` : "compositions";

  let compositionFiles = await listProjectFilesRecursive(primaryDir).then(files => files.filter(isCompositionSourceFile));

  if (compositionFiles.length === 0) {
    compositionFiles = await listProjectFilesRecursive(fallbackDir).then(files => files.filter(isCompositionSourceFile));
  }

  const claimedManifestIds = new Set<string>();
  return Promise.all(
    compositionFiles.map(async (file) => {
      const source = await clipperHost.readTextFile(file.path);
      const filePath = projectPathFromDirectoryEntry(fallbackRoot, file.relativePath, "compositions");
      const manifestComposition = resolveManifestCompositionForFile(manifestCompositions, claimedManifestIds, filePath, source);
      if (manifestComposition) claimedManifestIds.add(manifestComposition.id);
      const baseComposition = createBaseComposition(manifestComposition?.id ?? createStableCompositionId(), filePath, source);
      try {
        const document = await compositionFromProjectSource(baseComposition, source, async (relativePath) => {
          const dependencyPath = relativePath.startsWith("compositions/") ? `${editableRoot}/${relativePath}` : `${getDirectoryPath(file.path)}/${relativePath}`;
          return clipperHost.readTextFile(dependencyPath);
        });
        return { ...document, id: baseComposition.id, filePath, sourceHash: hashCompositionSource(source), source } as CompositionDocument;
      } catch (error) {
        return createErroredComposition(baseComposition, source, error);
      }
    })
  );
}

function resolveManifestCompositionForFile(manifestCompositions: CompositionClip[], claimedIds: Set<string>, filePath: string, source: string) {
  const byPath = manifestCompositions.find((composition) => !claimedIds.has(composition.id) && composition.filePath === filePath);
  if (byPath) return byPath;
  const sourceHash = hashCompositionSource(source);
  return manifestCompositions.find((composition) => !claimedIds.has(composition.id) && composition.sourceHash === sourceHash);
}

function hashCompositionSource(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createStableCompositionId() {
  return `composition-${crypto.randomUUID()}`;
}

function isCompositionSourceFile(file: { name: string }) {
  return file.name.endsWith(".composition.ts");
}

const listProjectFilesRecursive = async (dir: string, baseDir: string = dir): Promise<{ name: string; path: string; relativePath: string; isDirectory: boolean }[]> => {
  const entries = await clipperHost.listDirectory(dir).catch(() => [] as { name: string; isDirectory: boolean }[]);
  const files: { name: string; path: string; relativePath: string; isDirectory: boolean }[] = [];
  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`;
    const relativePath = baseDir === dir ? entry.name : fullPath.slice(baseDir.length + 1);
    if (entry.isDirectory) {
      files.push({ ...entry, path: fullPath, relativePath });
      files.push(...(await listProjectFilesRecursive(fullPath, baseDir)));
    } else {
      files.push({ ...entry, path: fullPath, relativePath });
    }
  }
  return files;
};

async function ensureDirectoryForPath(filePath: string) {
  const directoryPath = getDirectoryPath(filePath);
  if (!directoryPath) return;
  const segments = directoryPath.split("/");
  let currentPath = "";
  for (const segment of segments) {
    if (!segment && currentPath === "") {
      currentPath = "/";
      continue;
    }
    currentPath = currentPath === "/" ? `/${segment}` : currentPath ? `${currentPath}/${segment}` : segment;
    await clipperHost.createDirectory(currentPath).catch(() => {});
  }
}

function getFallbackDisplayName(name: string, relativePath: string) {
  if (!name || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
    const fileName = relativePath.split("/").pop() || "";
    return fileName.replace(/\.timeline\.json$/, "").replace(/\.composition\.ts$/, "");
  }
  return name;
}

function mergeMissingCompositionMetadata(manifestProject: ProjectManifest, compositions: CompositionDocument[]): CompositionClip[] {
  const loadedIds = new Set(compositions.map((composition) => composition.id));
  const missing = (manifestProject.compositionLibrary ?? [])
    .filter((composition) => !loadedIds.has(composition.id))
    .map((composition) => ({ ...composition, source: undefined, sourceMissing: true }));
  const missingById = new Map<string, CompositionClip>(missing.map((composition) => [composition.id, composition]));
  return [...compositions, ...missingById.values()];
}

function createMissingCompositionPlaceholder(compositionId: string, duration?: number): CompositionClip {
  return {
    id: compositionId,
    filePath: compositionId,
    sourceMissing: true,
    duration: Math.max(duration ?? 3, 0.1),
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
    background: { id: "missing-background", name: "Missing media", style: { background: "#050505" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

async function saveDirectoryProject(manifestPath: string, project: ProjectManifest) {
  const normalized = serializeProjectForSave(project);
  const rootPath = getDirectoryPath(manifestPath);
  const metadataProject = {
    id: normalized.id,
    name: normalized.name,
    resolution: normalized.resolution,
    assetsPath: normalized.assetsPath,
    assets: normalized.assets,
    compositionFolders: normalized.compositionFolders ?? [],
    compositionLibrary: normalized.compositionLibrary?.map((composition) => ({ ...composition, source: undefined })) ?? [],
    timelineOrder: normalized.timelines?.map((timeline) => timeline.id) ?? [],
    compositionOrder: normalized.compositions?.map((composition) => composition.id) ?? [],
    editorState: normalized.editorState,
    scenes: [],
  };
  await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(metadataProject, null, 2)}\n`);

  const fileManagerDir = rootPath ? `${rootPath}/file-manager` : "file-manager";
  await clipperHost.createDirectory(fileManagerDir).catch(() => {});

  const savedRelativePaths = new Set<string>();

  for (const folderPath of normalized.compositionFolders ?? []) {
    const relativePath = safeCompositionFolderPath(folderPath, rootPath);
    if (!relativePath) continue;
    await clipperHost.createDirectory(`${fileManagerDir}/${relativePath}`).catch(() => {});
  }

  for (const composition of normalized.compositions ?? []) {
    if (composition.sourceMissing) continue;
    const source = composition.source ?? normalized.compositionSources?.[composition.filePath];
    if (source === undefined) throw new Error(`Composition ${composition.filePath} is missing source.`);
    const relativePath = safeCompositionPath(composition, rootPath);
    const fullPath = `${fileManagerDir}/${relativePath}`;
    savedRelativePaths.add(relativePath);
    await ensureDirectoryForPath(fullPath);
    await clipperHost.writeTextFile(fullPath, source);
  }

  for (const timeline of normalized.timelines ?? []) {
    const relativePath = safeDirectoryTimelinePath(timeline, rootPath);
    const fullPath = `${fileManagerDir}/${relativePath}`;
    savedRelativePaths.add(relativePath);
    await ensureDirectoryForPath(fullPath);
    await clipperHost.writeTextFile(fullPath, `${JSON.stringify(timeline, null, 2)}\n`);
  }

  const existingFiles = await listProjectFilesRecursive(fileManagerDir);
  for (const file of existingFiles) {
    if (!file.isDirectory && (file.relativePath.endsWith(".composition.ts") || file.relativePath.endsWith(".timeline.json"))) {
      if (!savedRelativePaths.has(file.relativePath)) {
        await clipperHost.trashFile(file.path).catch(() => {});
      }
    }
  }
}

function getSourceCompositionId(source: string, fileName: string) {
  const compositionBlock = /export\s+const\s+composition\s*=\s*new\s+Composition\s*\(\s*{([\s\S]*?)\n}\s*\)/.exec(source)?.[1];
  const sourceId = /^\s{2}id\s*:\s*["'`]([^"'`]+)["'`]/m.exec(compositionBlock ?? source)?.[1] ?? null;
  return sourceId ?? fileName.replace(/\.ts$/, "");
}

function createBaseComposition(id: string, filePath: string, source: string): CompositionDocument {
  return {
    id,
    filePath,
    source,
    duration: 5,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
    background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

function createErroredComposition(baseComposition: CompositionDocument, source: string, error: unknown): CompositionDocument {
  return {
    ...baseComposition,
    source,
    sourceHash: hashCompositionSource(source),
    compositionError: error instanceof Error ? error.message : "Unable to load composition source.",
  };
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_") || "item";
}

function safeCompositionPath(composition: CompositionClip, rootPath: string) {
  return safeProjectFilePath(composition.filePath, rootPath, "compositions", `${safeFileName(composition.id)}.composition.ts`, ".ts");
}

function safeTimelinePath(timeline: TimelineDocument, rootPath: string) {
  return safeProjectFilePath(timeline.filePath, rootPath, "timelines", `${safeFileName(timeline.id)}.timeline.json`, ".json");
}

function safeDirectoryTimelinePath(timeline: TimelineDocument, rootPath: string) {
  const relativePath = relativeProjectFilePath(timeline.filePath, rootPath);
  if (relativePath.endsWith(".timeline.json") && isSafeProjectFilePath(relativePath)) return relativePath;
  return safeTimelinePath(timeline, rootPath);
}

function safeCompositionFolderPath(folderPath: string, rootPath: string) {
  const relativePath = relativeProjectFilePath(folderPath, rootPath);
  if (!relativePath || relativePath === "compositions") return "";
  const entryPath = relativePath?.startsWith("compositions/") ? relativePath : relativePath ? `compositions/${relativePath}` : "compositions";
  return isSafeProjectFilePath(entryPath) ? entryPath : "compositions";
}

function safeProjectFilePath(filePath: string | undefined, rootPath: string, folder: "compositions" | "timelines", fallbackFileName: string, extension: ".ts" | ".json") {
  const relativePath = relativeProjectFilePath(filePath, rootPath);
  const entryPath = relativePath?.startsWith(`${folder}/`) ? relativePath : relativePath ? `${folder}/${relativePath}` : `${folder}/${fallbackFileName}`;
  if (entryPath.startsWith(`${folder}/`) && entryPath.endsWith(extension) && isSafeProjectFilePath(entryPath)) return entryPath;
  return `${folder}/${fallbackFileName}`;
}

function relativeProjectFilePath(filePath: string | undefined, rootPath: string) {
  if (!filePath) return "";
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/file-manager/`)) return normalizedPath.slice(`${normalizedRoot}/file-manager/`.length);
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  if (normalizedPath.startsWith("file-manager/")) return normalizedPath.slice("file-manager/".length);
  return normalizedPath;
}

function isSafeProjectFilePath(filePath: string) {
  return filePath.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function projectPathFromDirectoryEntry(rootPath: string, relativePath: string, folder: "compositions" | "timelines") {
  if (folder === "timelines" && relativePath.endsWith(".timeline.json")) return relativePath;
  if (relativePath.startsWith(`${folder}/`)) return relativePath;
  return `${folder}/${relativePath}`;
}

function getDirectoryPath(path: string) {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex > 0 ? path.slice(0, slashIndex) : "";
}

async function compositionFromProjectSource(composition: CompositionClip, source: string, readDependency: (relativePath: string) => Promise<string>) {
  return (await loadCompositionsFromSource([composition], async (relativePath) => relativePath === composition.filePath ? source : readDependency(relativePath)))[0];
}

export const projectPersistenceService = new ProjectPersistenceService();
