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

  it("loads directory compositions with sidecar css imports", async () => {
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

          export const composition = new Composition({
            duration: 4,
            frame: { width: 1920, height: 1080, style: { background: "#000" } },
            render() {
              return [new WebLayer({ id: "effect", bounds: { x: 0, y: 0, width: 100, height: 100 }, css: styles, html: html` + "`<div class=\"effect\"></div>`" + ` })];
            },
          });
        `;
      }
      if (path === "clipper/projects/hi/file-manager/compositions/effect.css") return ".effect { opacity: 0.5; }";
      throw new Error(`Unexpected read ${path}`);
    });
    hostMocks.listDirectory.mockImplementation(async (path) => {
      if (path === "clipper/projects/hi") return [{ name: "file-manager", isDirectory: true }];
      if (path === "clipper/projects/hi/file-manager/timelines") return [];
      if (path === "clipper/projects/hi/file-manager/compositions") return [
        { name: "effect.composition.ts", isDirectory: false },
        { name: "effect.css", isDirectory: false },
        { name: "effect.css.d.ts", isDirectory: false },
        { name: "css-modules.d.ts", isDirectory: false },
      ];
      return [];
    });

    const { projectPersistenceService } = await import("./projectPersistenceService");
    const { project } = await projectPersistenceService.loadProject({ manifestPath: "clipper/projects/hi/project.json" });

    expect(project.compositionLibrary?.[0]?.objects[0]?.content).toContain(".effect { opacity: 0.5; }");
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
});
