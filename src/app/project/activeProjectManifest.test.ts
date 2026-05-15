import { beforeEach, describe, expect, it, vi } from "vitest";

const hostMocks = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
}));

function mockElectronClipper(
  overrides: Partial<Window["clipper"]> = {},
): Window["clipper"] {
  return {
    platform: "darwin",
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createDirectory: vi.fn(),
    revealFile: vi.fn(),
    trashFile: vi.fn(),
    renameFile: vi.fn(),
    copyFile: vi.fn(),
    listDirectory: vi.fn(),
    findProjectFileByName: vi.fn(),
    openCompositionFile: vi.fn(),
    listSystemFonts: vi.fn(),
    openProjectManifest: vi.fn(),
    createProject: vi.fn(),
    exportMediaFile: vi.fn(),
    exportBinaryFile: vi.fn(),
    startVideoExport: vi.fn(),
    writeVideoFrame: vi.fn(),
    finishVideoExport: vi.fn(),
    cancelVideoExport: vi.fn(),
    renderVideoExport: vi.fn(),
    prerenderFrame: vi.fn(),
    prerenderVideoBlock: vi.fn(),
    clearPrerenderCache: vi.fn(),
    clearAllPrerenderCaches: vi.fn(),
    cancelRenderVideoExport: vi.fn(),
    setWindowFullscreen: vi.fn(),
    toggleWindowFullscreen: vi.fn(),
    watchTextFiles: vi.fn(),
    onVideoExportProgress: vi.fn(),
    onTextFileChanged: vi.fn(),
    onModeShortcut: vi.fn(),
    onSettingsShortcut: vi.fn(),
    onCloseEditorTabShortcut: vi.fn(),
    onRestoreEditorTabShortcut: vi.fn(),
    onWindowFullscreenChange: vi.fn(),
    ...overrides,
  };
}

function installLocalStorageMock() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
}

vi.mock("../clipperHost", () => ({
  clipperHost: {
    readTextFile: hostMocks.readTextFile,
    writeTextFile: hostMocks.writeTextFile,
  },
}));

describe("active project manifest state", () => {
  beforeEach(() => {
    vi.resetModules();
    hostMocks.readTextFile.mockReset();
    hostMocks.writeTextFile.mockReset();
    installLocalStorageMock();
    localStorage.clear();
    delete globalThis.window.clipper;
  });

  it("does not restore stale localStorage in Electron when app-state has no active project", async () => {
    window.clipper = mockElectronClipper({
      readAppState: vi.fn(async () => ({})),
      writeAppState: vi.fn(),
    });
    localStorage.setItem(
      "clipper.activeProjectManifestPath",
      "clipper/projects/missing/missing.clpr",
    );

    const { readStoredActiveProjectManifestPath } =
      await import("./activeProjectManifest");

    await expect(readStoredActiveProjectManifestPath()).resolves.toBeNull();
  });

  it("clears active project through Electron app-state deletion sentinel", async () => {
    const writeAppState = vi.fn(async () => undefined);
    window.clipper = mockElectronClipper({
      readAppState: vi.fn(async () => ({
        activeProjectManifestPath: "clipper/projects/old/old.clpr",
      })),
      writeAppState,
    });
    localStorage.setItem(
      "clipper.activeProjectManifestPath",
      "clipper/projects/old/old.clpr",
    );

    const { clearStoredActiveProjectManifestPath } =
      await import("./activeProjectManifest");
    await clearStoredActiveProjectManifestPath();

    expect(writeAppState).toHaveBeenCalledWith({
      activeProjectManifestPath: null,
    });
    expect(
      localStorage.getItem("clipper.activeProjectManifestPath"),
    ).toBeNull();
  });
});
