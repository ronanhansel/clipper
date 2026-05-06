import { beforeEach, describe, expect, it, vi } from "vitest";

const hostMocks = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
  createDirectory: vi.fn<(path: string) => Promise<void>>(),
  trashFile: vi.fn<(path: string) => Promise<void>>(),
  listDirectory: vi.fn<(path: string) => Promise<{ name: string; isDirectory: boolean }[]>>(),
}));

vi.mock("../clipperHost", () => ({
  clipperHost: {
    readTextFile: hostMocks.readTextFile,
    writeTextFile: hostMocks.writeTextFile,
    createDirectory: hostMocks.createDirectory,
    trashFile: hostMocks.trashFile,
    listDirectory: hostMocks.listDirectory,
  },
}));

describe("project persistence service", () => {
  beforeEach(() => {
    vi.resetModules();
    hostMocks.readTextFile.mockReset();
    hostMocks.writeTextFile.mockReset();
    hostMocks.createDirectory.mockReset();
    hostMocks.trashFile.mockReset();
    hostMocks.listDirectory.mockReset();
    hostMocks.writeTextFile.mockResolvedValue();
    hostMocks.createDirectory.mockResolvedValue();
    hostMocks.trashFile.mockResolvedValue();
  });

  it("loads directory compositions with sidecar css and html imports", async () => {
    hostMocks.readTextFile.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi/project.json") {
        return JSON.stringify({
          id: "project",
          name: "Project",
          resolution: { width: 1920, height: 1080 },
          assetsPath: "assets",
          compositionOrder: ["compositions/effect.composition.ts"],
          timelineOrder: [],
          scenes: [],
        });
      }
      if (path === "clipper/projects/hi/file-manager/compositions/effect.composition.ts") {
        return `
          import { Composition, WebLayer, html } from "@clipper/composition-api";
          import styles from "./effect.css";
          import markup from "./effect.html";

          export const composition = new Composition({
            duration: 4,
            frame: { width: 1920, height: 1080, style: { background: "#000" } },
            render() {
              return [new WebLayer({ id: "effect", bounds: { x: 0, y: 0, width: 100, height: 100 }, css: styles, html: markup })];
            },
          });
        `;
      }
      if (path === "clipper/projects/hi/file-manager/compositions/effect.css") return ".effect { opacity: 0.5; }";
      if (path === "clipper/projects/hi/file-manager/compositions/effect.html") return `<div class="effect"></div>`;
      throw new Error(`Unexpected read ${path}`);
    });
    hostMocks.listDirectory.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi") return [{ name: "file-manager", isDirectory: true }];
      if (path === "clipper/projects/hi/file-manager/timelines") return [];
      if (path === "clipper/projects/hi/file-manager/compositions") return [
        { name: "effect.composition.ts", isDirectory: false },
        { name: "effect.css", isDirectory: false },
        { name: "effect.html", isDirectory: false },
        { name: "effect.css.d.ts", isDirectory: false },
        { name: "css-modules.d.ts", isDirectory: false },
      ];
      return [];
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.compositionLibrary?.[0]?.objects[0]?.content).toContain(".effect { opacity: 0.5; }");
    expect(project.compositionLibrary?.[0]?.objects[0]?.content).toContain('<div class="effect"></div>');
  });

  it("keeps loading when a directory composition dependency is missing", async () => {
    hostMocks.readTextFile.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi/project.json") {
        return JSON.stringify({
          id: "project",
          name: "Project",
          resolution: { width: 1920, height: 1080 },
          assetsPath: "assets",
          timelineOrder: [],
          scenes: [],
        });
      }
      if (path === "clipper/projects/hi/file-manager/compositions/broken.composition.ts") {
        return `
          import { Composition, Rect } from "@clipper/composition-api";
          import styles from "./missing.css";

          export const composition = new Composition({
            duration: 4,
            frame: { width: 1920, height: 1080, style: { background: "#000" } },
            render() {
              return [new Rect({ id: "box", bounds: { x: 0, y: 0, width: 100, height: 100 }, style: { background: styles } })];
            },
          });
        `;
      }
      throw new Error(`Cannot find module ${path}`);
    });
    hostMocks.listDirectory.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi") return [{ name: "file-manager", isDirectory: true }];
      if (path === "clipper/projects/hi/file-manager/timelines") return [];
      if (path === "clipper/projects/hi/file-manager/compositions") return [{ name: "broken.composition.ts", isDirectory: false }];
      return [];
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.compositionLibrary?.[0]?.compositionError).toContain("Cannot find module");
    expect(project.compositionLibrary?.[0]?.objects).toEqual([]);
  });

  it("saves directory composition folders without nesting file-manager or compositions roots", async () => {
    hostMocks.listDirectory.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi/file-manager") return [];
      return [];
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    await projectPersistenceService.saveProject({
      manifestPath: "clipper/projects/hi/project.json",
      project: {
        id: "project",
        name: "Project",
        resolution: { width: 1920, height: 1080 },
        assetsPath: "assets",
        assets: [],
        scenes: [],
        compositionFolders: [
          "compositions",
          "compositions/lower-third",
          "file-manager/compositions/title-cards",
          "clipper/projects/hi/file-manager/compositions/overlays",
        ],
        compositionLibrary: [{
          id: "compositions/title.composition.ts",
          filePath: "compositions/title.composition.ts",
          duration: 3,
          frame: { width: 1920, height: 1080, style: {} },
          background: { id: "background", name: "Background", style: {}, elements: [] },
          objects: [],
          snapshot: [],
          motionMarkers: [],
          source: "source",
        }],
        compositionSources: { "compositions/title.composition.ts": "source" },
        timelines: [],
      },
    });

    expect(hostMocks.createDirectory).toHaveBeenCalledWith("clipper/projects/hi/file-manager/compositions/lower-third");
    expect(hostMocks.createDirectory).toHaveBeenCalledWith("clipper/projects/hi/file-manager/compositions/title-cards");
    expect(hostMocks.createDirectory).toHaveBeenCalledWith("clipper/projects/hi/file-manager/compositions/overlays");
    expect(hostMocks.createDirectory).not.toHaveBeenCalledWith("clipper/projects/hi/file-manager/compositions/compositions");
    expect(hostMocks.createDirectory).not.toHaveBeenCalledWith("clipper/projects/hi/file-manager/file-manager/compositions/title-cards");
    expect(hostMocks.writeTextFile).toHaveBeenCalledWith("clipper/projects/hi/file-manager/compositions/title.composition.ts", "source");
  });

  it("keeps a timeline clip attached to a stable composition id after the composition file moves", async () => {
    const source = compositionSource("Moved");
    mockDirectoryProject({
      manifest: {
        compositionLibrary: [compositionRecord("composition-b", "compositions/B.composition.ts", source)],
      },
      files: {
        "file-manager/compositions/folder/B.composition.ts": source,
        "file-manager/main.timeline.json": JSON.stringify({ id: "main.timeline.json", clips: [{ id: "clip-b", compositionId: "composition-b", duration: 5 }] }),
      },
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.timelines?.[0].clips).toEqual([{ id: "clip-b", compositionId: "composition-b", duration: 5, motionMarkers: [] }]);
    expect(project.compositionLibrary?.find((composition) => composition.id === "composition-b")?.filePath).toBe("compositions/folder/B.composition.ts");
  });

  it("marks a deleted linked composition missing while preserving timeline clips", async () => {
    const source = compositionSource("Deleted");
    mockDirectoryProject({
      manifest: {
        compositionLibrary: [compositionRecord("composition-b", "compositions/B.composition.ts", source)],
      },
      files: {
        "file-manager/main.timeline.json": JSON.stringify({ id: "main.timeline.json", clips: [{ id: "clip-b", compositionId: "composition-b", duration: 5 }] }),
      },
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.timelines?.[0].clips[0]?.compositionId).toBe("composition-b");
    expect(project.compositionLibrary?.find((composition) => composition.id === "composition-b")).toMatchObject({
      filePath: "compositions/B.composition.ts",
      sourceMissing: true,
    });
  });

  it("does not resurrect a removed clip when another composition is renamed and reloaded", async () => {
    const sourceA = compositionSource("A");
    const sourceB = compositionSource("B");
    mockDirectoryProject({
      manifest: {
        compositionLibrary: [compositionRecord("composition-a", "compositions/A.composition.ts", sourceA), compositionRecord("composition-b", "compositions/B.composition.ts", sourceB)],
      },
      files: {
        "file-manager/compositions/A.composition.ts": sourceA,
        "file-manager/compositions/B-renamed.composition.ts": sourceB,
        "file-manager/main.timeline.json": JSON.stringify({ id: "main.timeline.json", clips: [{ id: "clip-b", compositionId: "composition-b", duration: 5 }] }),
      },
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.timelines?.[0].clips.map((clip) => clip.compositionId)).toEqual(["composition-b"]);
    expect(project.scenes[0]?.compositions.map((clip) => clip.compositionId)).toEqual(["composition-b"]);
  });
});

function mockDirectoryProject({ manifest, files }: { manifest?: Record<string, unknown>; files: Record<string, string> }) {
  hostMocks.readTextFile.mockImplementation(async (path) => {
    if (path === "clipper/projects/hi/project.json") {
      return JSON.stringify({
        id: "project",
        name: "Project",
        resolution: { width: 1920, height: 1080 },
        assetsPath: "assets",
        timelineOrder: [],
        scenes: [],
        ...manifest,
      });
    }
    const relativePath = path.slice("clipper/projects/hi/".length);
    if (relativePath in files) return files[relativePath];
    throw new Error(`Unexpected read ${path}`);
  });
  hostMocks.listDirectory.mockImplementation(async (path) => {
    if (path === "clipper/projects/hi") return [{ name: "file-manager", isDirectory: true }];
    const relativeDirectory = path === "clipper/projects/hi/file-manager" ? "file-manager" : path.slice("clipper/projects/hi/".length);
    const prefix = `${relativeDirectory}/`;
    const entries = new Map<string, boolean>();
    for (const filePath of Object.keys(files)) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const [name, ...children] = rest.split("/");
      entries.set(name, children.length > 0);
    }
    return [...entries].map(([name, isDirectory]) => ({ name, isDirectory }));
  });
}

function compositionRecord(id: string, filePath: string, source: string) {
  return {
    id,
    filePath,
    sourceHash: hashCompositionSource(source),
    duration: 5,
    frame: { width: 1920, height: 1080, style: {} },
    background: { id: "background", name: "Background", style: {}, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

function compositionSource(label: string) {
  return `import { Composition, Text } from "@clipper/composition-api";\nexport const composition = new Composition({ duration: 5, render() { return [new Text({ id: "${label}", content: "${label}" })]; } });`;
}

function hashCompositionSource(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
