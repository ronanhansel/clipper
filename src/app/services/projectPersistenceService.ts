import JSZip from "jszip";
import { compositionToSource, loadCompositionsFromSource } from "../../core/compositionSource";
import { normalizeProject } from "../../core/project";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionDocument, type EditorState, type Part, type ProjectManifest, type TimelineDocument } from "../../core/types";
import { clipperHost } from "../clipperHost";

type LoadProjectInput = {
  manifestPath: string;
  fallbackProject: ProjectManifest;
};

type SaveProjectInput = {
  manifestPath: string;
  project: ProjectManifest;
};

class ProjectPersistenceService {
  async loadProject({ manifestPath, fallbackProject }: LoadProjectInput) {
    try {
      if (manifestPath.endsWith(".clipper")) {
        const project = await loadZipProject(manifestPath);
        return {
          project,
          sourceStatus: `Project loaded from ${manifestPath}.`,
          usedFallback: false,
        };
      }

      const content = await clipperHost.readTextFile(manifestPath);
      const manifestProject = normalizeProject(JSON.parse(content) as ProjectManifest);
      const migratedSources = { ...(manifestProject.compositionSources ?? {}) };
      const loadedLibrary = await Promise.all((manifestProject.compositionLibrary ?? []).map(async (composition) => {
        const embeddedSource = migratedSources[composition.filePath];
        if (embeddedSource === undefined) {
          migratedSources[composition.filePath] = compositionToSource(composition);
          return composition;
        }

        try {
          return await compositionFromEmbeddedSource(composition, embeddedSource);
        } catch {
          const fallbackSource = compositionToSource(composition);
          migratedSources[composition.filePath] = fallbackSource;
          return composition;
        }
      }));
      const loadedLibraryByPath = new Map(loadedLibrary.map((composition) => [composition.filePath, composition]));
      const project = normalizeProject({
        ...manifestProject,
        compositionSources: migratedSources,
        compositionLibrary: loadedLibrary,
        scenes: await Promise.all(manifestProject.scenes.map(async (scene) => ({
          ...scene,
          compositions: scene.compositions.map((composition) => {
            const libraryComposition = loadedLibraryByPath.get(composition.filePath);
            return libraryComposition ? { ...libraryComposition, zoomMarkers: composition.zoomMarkers, translationMarkers: composition.translationMarkers, snapshot: composition.snapshot } : composition;
          }),
        }))),
      });

      return {
        project,
        sourceStatus: `Project loaded from ${manifestPath}.`,
        usedFallback: false,
      };
    } catch (error) {
      const project = normalizeProject(fallbackProject);
      return {
        project,
        sourceStatus: error instanceof Error ? `Using bundled sample project. ${error.message}` : "Using bundled sample project.",
        usedFallback: true,
      };
    }
  }

  async saveProject({ manifestPath, project }: SaveProjectInput) {
    if (manifestPath.endsWith(".clipper")) await saveZipProject(manifestPath, project);
    else await clipperHost.writeTextFile(manifestPath, `${JSON.stringify(project, null, 2)}\n`);
    return {
      projectSnapshot: JSON.stringify(project),
      compositionSourcesSnapshot: JSON.stringify(project.compositionSources ?? {}),
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
  const timelines = await loadZipTimelines(zip);
  const compositions = await loadZipCompositions(zip);
  return normalizeProject({
    ...manifestProject,
    timelines,
    compositions,
    compositionLibrary: compositions,
    compositionSources: Object.fromEntries(compositions.map((composition) => [composition.filePath, composition.source])),
    scenes: manifestProject.scenes?.length ? manifestProject.scenes : timelines.map((timeline) => ({ id: timeline.id, name: timeline.name, adjustmentLayers: timeline.adjustmentLayers, compositions: [] })),
  });
}

async function loadZipTimelines(zip: JSZip) {
  const entries = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("timelines/") && file.name.endsWith(".json"));
  const timelines = await Promise.all(entries.map(async (file) => ({ ...JSON.parse(await file.async("string")) as TimelineDocument, filePath: file.name })));
  return timelines.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

async function loadZipCompositions(zip: JSZip) {
  const entries = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("compositions/") && file.name.endsWith(".ts"));
  return Promise.all(entries.map(async (file) => {
    const source = await file.async("string");
    const id = getSourceCompositionId(source) ?? file.name.replace(/^compositions\//, "").replace(/\.ts$/, "");
    const baseComposition = createBaseComposition(id, file.name, source);
    try {
      return { ...(await compositionFromEmbeddedSource(baseComposition, source)), source } as CompositionDocument;
    } catch {
      return baseComposition;
    }
  }));
}

async function saveZipProject(manifestPath: string, project: ProjectManifest) {
  const normalized = normalizeProject(project);
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
    zip.file(safeTimelinePath(timeline), `${JSON.stringify(timeline, null, 2)}\n`);
  }

  for (const composition of normalized.compositions ?? []) {
    zip.file(`compositions/${safeZipName(composition.id)}.ts`, composition.source ?? normalized.compositionSources?.[composition.filePath] ?? compositionToSource(composition));
  }

  await clipperHost.writeBinaryFile(manifestPath, await zip.generateAsync({ type: "base64", compression: "DEFLATE" }));
}

function getSourceCompositionId(source: string) {
  const compositionBlock = /export\s+const\s+composition\s*=\s*new\s+Composition\s*\(\s*{([\s\S]*?)\n}\s*\)/.exec(source)?.[1];
  return /\bid\s*:\s*["'`]([^"'`]+)["'`]/.exec(compositionBlock ?? source)?.[1] ?? null;
}

function createBaseComposition(id: string, filePath: string, source: string): CompositionDocument {
  return {
    id,
    name: titleFromId(id),
    filePath,
    source,
    duration: 5,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
    background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
    objects: [],
    snapshot: [],
    zoomMarkers: [],
    translationMarkers: [],
  };
}

function titleFromId(id: string) {
  return id.replace(/^cmp[_-]?/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Composition";
}

function safeZipName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_") || "item";
}

function safeTimelinePath(timeline: TimelineDocument) {
  const filePath = timeline.filePath?.replace(/^\/+/, "");
  if (filePath?.startsWith("timelines/") && filePath.endsWith(".json") && !filePath.includes("..")) return filePath;
  return `timelines/${safeZipName(timeline.id)}.timeline.json`;
}

async function compositionFromEmbeddedSource(composition: Part, source: string) {
  return (await loadCompositionsFromSource([composition], async () => source))[0];
}

export const projectPersistenceService = new ProjectPersistenceService();
