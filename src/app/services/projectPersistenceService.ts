import JSZip from "jszip";
import { loadCompositionsFromSource } from "../../core/compositionSource";
import { normalizeProject, serializeProjectForSave } from "../../core/project";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type CompositionDocument, type EditorState, type ProjectManifest, type TimelineDocument } from "../../core/types";
import { clipperHost } from "../clipperHost";

type LoadProjectInput = {
  manifestPath: string;
};

type SaveProjectInput = {
  manifestPath: string;
  project: ProjectManifest;
};

class ProjectPersistenceService {
  async loadProject({ manifestPath }: LoadProjectInput) {
    if (manifestPath.endsWith(".clipper")) {
      const project = await loadZipProject(manifestPath);
      return {
        project,
        sourceStatus: `Project loaded from ${manifestPath}.`,
      };
    }

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
    if (manifestPath.endsWith(".clipper")) await saveZipProject(manifestPath, saveProject);
    else if (manifestPath.endsWith(".json")) await saveDirectoryProject(manifestPath, saveProject);
    else await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(saveProject, null, 2)}\n`);
    return {
      projectSnapshot: JSON.stringify(saveProject),
      compositionSourcesSnapshot: JSON.stringify(saveProject.compositionSources ?? {}),
      sourceStatus: "Project and composition sources saved.",
    };
  }

  async saveEditorState(manifestPath: string, editorState: EditorState) {
    if (manifestPath.endsWith(".clipper")) {
      const zip = await JSZip.loadAsync(await clipperHost.readBinaryFile(manifestPath), { base64: true });
      const manifestFile = zip.file("project.json");
      if (!manifestFile) return;
      const manifestProject = JSON.parse(await manifestFile.async("string")) as Partial<ProjectManifest>;
      zip.file("project.json", `${JSON.stringify({ ...manifestProject, editorState }, null, 2)}\n`);
      await clipperHost.writeBinaryFile(manifestPath, await zip.generateAsync({ type: "base64", compression: "DEFLATE" }));
      return;
    }

    const content = await clipperHost.readTextFile(manifestPath);
    const manifestProject = JSON.parse(content) as ProjectManifest;
    await clipperHost.writeTextFile(manifestPath, `${JSON.stringify({ ...manifestProject, editorState }, null, 2)}\n`);
  }

}

async function loadZipProject(manifestPath: string) {
  const zip = await JSZip.loadAsync(await clipperHost.readBinaryFile(manifestPath), { base64: true });
  const manifestFile = zip.file("project.json");
  if (!manifestFile) throw new Error("Clipper container is missing project.json.");

  const manifestProject = JSON.parse(await manifestFile.async("string")) as ProjectManifest;
  const rootPath = getDirectoryPath(manifestPath);
  const timelines = await loadZipTimelines(zip, rootPath);
  const compositions = await loadZipCompositions(zip, rootPath);
  return normalizeProject({
    ...manifestProject,
    timelines,
    compositions,
    compositionLibrary: compositions,
    compositionSources: Object.fromEntries(compositions.map((composition) => [composition.filePath, composition.source])),
    scenes: manifestProject.scenes ?? [],
  });
}

async function loadZipTimelines(zip: JSZip, rootPath: string) {
  const entries = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("timelines/") && file.name.endsWith(".json"));
  const timelines = await Promise.all(entries.map(async (file) => ({ ...JSON.parse(await file.async("string")) as TimelineDocument, filePath: projectPathFromZipEntry(rootPath, file.name, "timelines") })));
  return timelines.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

async function loadZipCompositions(zip: JSZip, rootPath: string) {
  const entries = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("compositions/") && file.name.endsWith(".ts"));
  return Promise.all(entries.map(async (file) => {
    const source = await file.async("string");
    const id = getSourceCompositionId(source, file.name.replace(/^compositions\//, ""));
    const baseComposition = createBaseComposition(id, projectPathFromZipEntry(rootPath, file.name, "compositions"), source);
    return { ...(await compositionFromEmbeddedSource(baseComposition, source)), source } as CompositionDocument;
  }));
}

async function saveZipProject(manifestPath: string, project: ProjectManifest) {
  const normalized = serializeProjectForSave(project);
  const rootPath = getDirectoryPath(manifestPath);
  const zip = new JSZip();
  const metadataProject = {
    id: normalized.id,
    name: normalized.name,
    resolution: normalized.resolution,
    assetsPath: normalized.assetsPath,
    assets: normalized.assets,
    compositionFolders: normalized.compositionFolders ?? [],
    timelineOrder: normalized.timelines?.map((timeline) => timeline.id) ?? [],
    compositionOrder: normalized.compositions?.map((composition) => composition.id) ?? [],
    editorState: normalized.editorState,
    scenes: [],
  };
  zip.file("project.json", `${JSON.stringify(metadataProject, null, 2)}\n`);

  for (const timeline of normalized.timelines ?? []) {
    zip.file(safeTimelinePath(timeline, rootPath), `${JSON.stringify(timeline, null, 2)}\n`);
  }

  for (const composition of normalized.compositions ?? []) {
    const source = composition.source ?? normalized.compositionSources?.[composition.filePath];
    if (source === undefined) throw new Error(`Composition ${composition.filePath} is missing source.`);
    zip.file(safeCompositionPath(composition, rootPath), source);
  }

  await clipperHost.writeBinaryFile(manifestPath, await zip.generateAsync({ type: "base64", compression: "DEFLATE" }));
}

async function getEditableRootPath(rootPath: string): Promise<string> {
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
  const timelines = await loadDirectoryTimelines(editableRoot, rootPath);
  const compositions = await loadDirectoryCompositions(editableRoot, rootPath);
  return normalizeProject({
    ...manifestProject,
    timelines,
    compositions,
    compositionLibrary: compositions,
    compositionSources: Object.fromEntries(compositions.map((composition) => [composition.filePath, composition.source])),
    scenes: manifestProject.scenes ?? [],
  });
}

async function loadDirectoryTimelines(editableRoot: string, fallbackRoot: string) {
  const primaryDir = editableRoot ? `${editableRoot}/timelines` : "file-manager/timelines";
  const fallbackDir = fallbackRoot ? `${fallbackRoot}/timelines` : "timelines";

  let entries = await clipperHost.listDirectory(primaryDir).catch(() => [] as { name: string; isDirectory: boolean }[]);
  let timelineFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith(".json"));
  let effectiveDir = primaryDir;

  if (timelineFiles.length === 0) {
    entries = await clipperHost.listDirectory(fallbackDir).catch(() => [] as { name: string; isDirectory: boolean }[]);
    timelineFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith(".json"));
    effectiveDir = fallbackDir;
  }

  const timelines = await Promise.all(
    timelineFiles.map(async (file) => {
      const filePath = `${effectiveDir}/${file.name}`;
      return { ...JSON.parse(await clipperHost.readTextFile(filePath)) as TimelineDocument, filePath: projectPathFromDirectoryEntry(fallbackRoot, file.name, "timelines") };
    })
  );
  return timelines.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

async function loadDirectoryCompositions(editableRoot: string, fallbackRoot: string) {
  const primaryDir = editableRoot ? `${editableRoot}/compositions` : "file-manager/compositions";
  const fallbackDir = fallbackRoot ? `${fallbackRoot}/compositions` : "compositions";

  let entries = await clipperHost.listDirectory(primaryDir).catch(() => [] as { name: string; isDirectory: boolean }[]);
  let compositionFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith(".ts"));
  let effectiveDir = primaryDir;

  if (compositionFiles.length === 0) {
    entries = await clipperHost.listDirectory(fallbackDir).catch(() => [] as { name: string; isDirectory: boolean }[]);
    compositionFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith(".ts"));
    effectiveDir = fallbackDir;
  }

  return Promise.all(
    compositionFiles.map(async (file) => {
      const filePath = `${effectiveDir}/${file.name}`;
      const source = await clipperHost.readTextFile(filePath);
      const id = getSourceCompositionId(source, file.name);
      const baseComposition = createBaseComposition(id, projectPathFromDirectoryEntry(fallbackRoot, file.name, "compositions"), source);
      return { ...(await compositionFromEmbeddedSource(baseComposition, source)), source } as CompositionDocument;
    })
  );
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
    timelineOrder: normalized.timelines?.map((timeline) => timeline.id) ?? [],
    compositionOrder: normalized.compositions?.map((composition) => composition.id) ?? [],
    editorState: normalized.editorState,
    scenes: [],
  };
  await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(metadataProject, null, 2)}\n`);

  const fileManagerDir = rootPath ? `${rootPath}/file-manager` : "file-manager";
  const compositionDir = rootPath ? `${rootPath}/file-manager/compositions` : "file-manager/compositions";
  const timelineDir = rootPath ? `${rootPath}/file-manager/timelines` : "file-manager/timelines";
  await clipperHost.createDirectory(fileManagerDir);
  await clipperHost.createDirectory(compositionDir);
  await clipperHost.createDirectory(timelineDir);

  const compositionFileNames = new Set<string>();
  for (const composition of normalized.compositions ?? []) {
    const source = composition.source ?? normalized.compositionSources?.[composition.filePath];
    if (source === undefined) throw new Error(`Composition ${composition.filePath} is missing source.`);
    const fileName = `${safeZipName(composition.id)}.composition.ts`;
    compositionFileNames.add(fileName);
    await clipperHost.writeTextFile(`${compositionDir}/${fileName}`, source);
  }

  const timelineFileNames = new Set<string>();
  for (const timeline of normalized.timelines ?? []) {
    const fileName = `${safeZipName(timeline.id)}.timeline.json`;
    timelineFileNames.add(fileName);
    await clipperHost.writeTextFile(`${timelineDir}/${fileName}`, `${JSON.stringify(timeline, null, 2)}\n`);
  }

  const compositionEntries = await clipperHost.listDirectory(compositionDir);
  for (const entry of compositionEntries) {
    if (!entry.isDirectory && entry.name.endsWith(".ts") && !compositionFileNames.has(entry.name)) {
      await clipperHost.trashFile(`${compositionDir}/${entry.name}`);
    }
  }

  const timelineEntries = await clipperHost.listDirectory(timelineDir);
  for (const entry of timelineEntries) {
    if (!entry.isDirectory && entry.name.endsWith(".json") && !timelineFileNames.has(entry.name)) {
      await clipperHost.trashFile(`${timelineDir}/${entry.name}`);
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
    name: id,
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

function safeZipName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_") || "item";
}

function safeCompositionPath(composition: CompositionClip, rootPath: string) {
  return safeProjectZipPath(composition.filePath, rootPath, "compositions", `${safeZipName(composition.id)}.composition.ts`, ".ts");
}

function safeTimelinePath(timeline: TimelineDocument, rootPath: string) {
  return safeProjectZipPath(timeline.filePath, rootPath, "timelines", `${safeZipName(timeline.id)}.timeline.json`, ".json");
}

function safeProjectZipPath(filePath: string | undefined, rootPath: string, folder: "compositions" | "timelines", fallbackFileName: string, extension: ".ts" | ".json") {
  const relativePath = relativeProjectFilePath(filePath, rootPath);
  const entryPath = relativePath?.startsWith(`${folder}/`) ? relativePath : relativePath ? `${folder}/${relativePath}` : `${folder}/${fallbackFileName}`;
  if (entryPath.startsWith(`${folder}/`) && entryPath.endsWith(extension) && isSafeZipEntryPath(entryPath)) return entryPath;
  return `${folder}/${fallbackFileName}`;
}

function relativeProjectFilePath(filePath: string | undefined, rootPath: string) {
  if (!filePath) return "";
  const normalizedPath = filePath.replace(/^\/+/, "");
  const normalizedRoot = rootPath.replace(/^\/+/, "");
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  return normalizedPath;
}

function isSafeZipEntryPath(filePath: string) {
  return filePath.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function projectPathFromZipEntry(rootPath: string, entryName: string, folder: "compositions" | "timelines") {
  const relativePath = entryName.replace(new RegExp(`^${folder}/`), "");
  return rootPath ? `${rootPath}/${relativePath}` : relativePath;
}

function projectPathFromDirectoryEntry(rootPath: string, entryName: string, folder: "compositions" | "timelines") {
  const basePath = rootPath ? `${rootPath}/${entryName}` : entryName;
  return basePath.replace(/\/file-manager\//, "/");
}

function getDirectoryPath(path: string) {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex > 0 ? path.slice(0, slashIndex) : "";
}

async function compositionFromEmbeddedSource(composition: CompositionClip, source: string) {
  return (await loadCompositionsFromSource([composition], async () => source))[0];
}

export const projectPersistenceService = new ProjectPersistenceService();
