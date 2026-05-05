import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  screen,
  shell,
} from "electron";
import {
  spawn,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { RenderEngine } from "./render-engine/renderer.js";
import type { ExportFrameRange, ProjectManifest, Scene } from "./render-engine/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const appStatePath = "clipper/app-state.json";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const renderVideoChildArgIndex = process.argv.indexOf("--render-video-child");
const isRenderVideoChildProcess = renderVideoChildArgIndex >= 0;
app.setName("Clipper");
app.commandLine.appendSwitch("force-color-profile", "srgb");
const experimentalHtmlCanvasPostProcessEnabled = process.env.CLIPPER_EXPERIMENTAL_HTML_CANVAS_POSTPROCESS === "1" || readStartupAppStateBoolean("experimentalHtmlCanvasPostProcess");
if (experimentalHtmlCanvasPostProcessEnabled) {
  app.commandLine.appendSwitch("enable-blink-features", "HTMLCanvasElementDrawElement");
  app.commandLine.appendSwitch("enable-features", "CanvasDrawElement");
}
if (isRenderVideoChildProcess && process.platform === "darwin") app.setActivationPolicy("accessory");

const textFileWatchers = new Map<number, FSWatcher[]>();
let appShuttingDown = false;
const appShuttingDownRef = { current: appShuttingDown };
Object.defineProperty(appShuttingDownRef, "current", { get: () => appShuttingDown, set: (v) => { appShuttingDown = v; } });
const appIconPath = path.resolve(__dirname, "../build/icons/icon.png");

function readStartupAppStateBoolean(key: string) {
  try {
    const state = JSON.parse(readFileSync(path.join(appRoot, appStatePath), "utf8")) as Record<string, unknown>;
    return state[key] === true;
  } catch {
    return false;
  }
}

// ─── Render Engine (instantiated after resolveClipperFile is defined) ────

let engine: RenderEngine;

// ─── Helper functions ─────────────────────────────────────────────────────

async function readAppState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(
      await fs.readFile(resolveClipperFile(appStatePath), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeAppState(updates: Record<string, unknown>) {
  const state = await readAppState();
  const merged = { ...state, ...updates };
  await fs.mkdir(path.dirname(resolveClipperFile(appStatePath)), {
    recursive: true,
  });
  await fs.writeFile(
    resolveClipperFile(appStatePath),
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
}

async function writeWindowBounds(window: BrowserWindow) {
  await writeAppState({
    windowBounds: window.getBounds() as unknown as Record<string, unknown>,
  });
}

function isAllowedWindowPermission(permission: string) {
  return permission === "local-fonts" || permission === "pointerLock" || permission === "pointer-lock";
}

type ProjectWatchPaths = {
  files: string[];
  directories: string[];
};

type MacFontProfile = {
  SPFontsDataType?: Array<{
    enabled?: string;
    valid?: string;
    typefaces?: Array<{
      enabled?: string;
      family?: string;
    }>;
  }>;
};

async function findFileByName(
  directoryPath: string,
  fileName: string,
): Promise<string | null> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const normalizedFileName = fileName.toLocaleLowerCase();
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isFile() && entry.name.toLocaleLowerCase() === normalizedFileName)
      return entryPath;
    if (entry.isDirectory()) {
      const matchedPath = await findFileByName(entryPath, fileName);
      if (matchedPath) return matchedPath;
    }
  }
  return null;
}

async function listSystemFontFamilies() {
  if (systemFontFamilies) return systemFontFamilies;
  if (process.platform !== "darwin") return [];

  const output = await readCommandOutput("/usr/sbin/system_profiler", [
    "SPFontsDataType",
    "-json",
  ]);

  try {
    const profile = JSON.parse(output) as MacFontProfile;
    const families = new Set<string>();
    for (const font of profile.SPFontsDataType ?? []) {
      if (font.enabled === "no" || font.valid === "no") continue;
      for (const typeface of font.typefaces ?? []) {
        if (typeface.enabled === "no") continue;
        const family = typeface.family?.trim();
        if (family) families.add(family);
      }
    }
    systemFontFamilies = [...families].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return systemFontFamilies;
  } catch {
    return [];
  }
}

let systemFontFamilies: string[] | null = null;

function readCommandOutput(command: string, args: string[]) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let byteLength = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      if (byteLength <= 128 * 1024 * 1024) chunks.push(chunk);
    });
    child.once("error", () => resolve("{}"));
    child.once("close", (code) => {
      if (code !== 0 || byteLength > 128 * 1024 * 1024) resolve("{}");
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function resolveClipperFile(relativePath: string) {
  const resolved = path.resolve(appRoot, relativePath);
  const clipperRoot = path.join(appRoot, "clipper");

  if (
    resolved !== clipperRoot &&
    !resolved.startsWith(`${clipperRoot}${path.sep}`)
  ) {
    throw new Error(
      "Clipper file access is restricted to the clipper directory.",
    );
  }

  return resolved;
}

function getClipperRelativePath(filePath: string) {
  const clipperRoot = path.join(appRoot, "clipper");
  const resolved = path.resolve(filePath);

  if (
    resolved !== clipperRoot &&
    !resolved.startsWith(`${clipperRoot}${path.sep}`)
  ) {
    throw new Error("Project files must be inside the clipper directory.");
  }

  return path.relative(appRoot, resolved).split(path.sep).join("/");
}

// ─── Instantiate RenderEngine ─────────────────────────────────────────────

engine = new RenderEngine({
  ffmpegPath,
  appRoot: path.resolve(__dirname, ".."),
  resolveClipperFile,
  loadExportWindow: async (window: BrowserWindow) => {
    if (isDev) {
      const baseUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
      await window.loadURL(`${baseUrl}?clipperExport=1`);
      return;
    }
    await window.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { clipperExport: "1" },
    });
  },
  getElectronChildArgs: (args: string[], electronArgs: string[] = []) => {
    if (app.isPackaged) return [...electronArgs, ...args];
    return [...electronArgs, path.resolve(__dirname, ".."), ...args];
  },
  appShuttingDownRef,
  appQuit: () => app.quit(),
  appExit: (code: number) => app.exit(code),
});

// ═══════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── File system handlers ────────────────────────────────────────────────

ipcMain.handle(
  "clipper:read-text-file",
  async (_event, relativePath: string) => {
    return fs.readFile(resolveClipperFile(relativePath), "utf8");
  },
);

ipcMain.handle("clipper:read-app-state", async () => readAppState());

ipcMain.handle("clipper:write-app-state", async (_event, updates: Record<string, unknown>) => {
  await writeAppState(updates);
});

ipcMain.handle(
  "clipper:write-text-file",
  async (_event, relativePath: string, content: string) => {
    const filePath = resolveClipperFile(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  },
);

ipcMain.handle(
  "clipper:create-directory",
  async (_event, relativePath: string) => {
    await fs.mkdir(resolveClipperFile(relativePath), { recursive: true });
  },
);

ipcMain.handle("clipper:reveal-file", async (_event, relativePath: string) => {
  shell.showItemInFolder(resolveClipperFile(relativePath));
});

ipcMain.handle(
  "clipper:reveal-absolute-path",
  async (_event, filePath: string) => {
    shell.showItemInFolder(path.resolve(filePath));
  },
);

ipcMain.handle("clipper:trash-file", async (_event, relativePath: string) => {
  const filePath = resolveClipperFile(relativePath);
  try {
    await fs.access(filePath);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return;
    throw error;
  }
  await shell.trashItem(filePath);
});

ipcMain.handle(
  "clipper:rename-file",
  async (_event, relativePath: string, nextRelativePath: string) => {
    await fs.rename(
      resolveClipperFile(relativePath),
      resolveClipperFile(nextRelativePath),
    );
  },
);

ipcMain.handle(
  "clipper:copy-file",
  async (_event, relativePath: string, nextRelativePath: string) => {
    const source = resolveClipperFile(relativePath);
    const target = resolveClipperFile(nextRelativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  },
);

ipcMain.handle(
  "clipper:list-directory",
  async (_event, relativePath: string) => {
    try {
      const entries = await fs.readdir(resolveClipperFile(relativePath), {
        withFileTypes: true,
      });
      return entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
        }));
    } catch {
      return [];
    }
  },
);

ipcMain.handle(
  "clipper:find-project-file-by-name",
  async (_event, directoryPath: string, fileName: string) => {
    const matchedPath = await findFileByName(
      resolveClipperFile(directoryPath),
      fileName,
    );
    return matchedPath ? getClipperRelativePath(matchedPath) : null;
  },
);

ipcMain.handle(
  "clipper:open-composition-file",
  async (_event, directoryPath: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Select composition file",
      defaultPath: resolveClipperFile(directoryPath),
      properties: ["openFile"],
      filters: [
        { name: "Composition Source", extensions: ["ts", "tsx", "js", "jsx"] },
      ],
    });

    if (canceled || !filePaths[0]) return null;
    return getClipperRelativePath(filePaths[0]);
  },
);

ipcMain.handle("clipper:list-system-fonts", async () => {
  return listSystemFontFamilies();
});

// ─── Window handlers ─────────────────────────────────────────────────────

ipcMain.handle(
  "clipper:set-window-fullscreen",
  (event, fullscreen: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(fullscreen);
    return window.isFullScreen();
  },
);

ipcMain.handle("clipper:toggle-window-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});

// ─── File watcher handlers ───────────────────────────────────────────────

ipcMain.handle("clipper:watch-text-files", (event, relativePaths: string[]) => {
  const senderId = event.sender.id;
  textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

  const watchedPaths = [...new Set(relativePaths)].filter((relativePath) =>
    relativePath.startsWith("clipper/"),
  );
  const watchers = watchedPaths.flatMap((relativePath) => {
    try {
      const resolvedPath = resolveClipperFile(relativePath);
      const watcher = watch(resolvedPath, { persistent: false }, () => {
        if (!event.sender.isDestroyed())
          event.sender.send("clipper:text-file-changed", relativePath);
      });
      return [watcher];
    } catch {
      return [];
    }
  });

  textFileWatchers.set(senderId, watchers);
  event.sender.once("destroyed", () => {
    textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());
    textFileWatchers.delete(senderId);
  });
});

ipcMain.handle(
  "clipper:watch-project-files",
  (event, watchPaths: ProjectWatchPaths) => {
    const senderId = event.sender.id;
    textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());

    const watchedFiles = [...new Set(watchPaths.files)].filter((relativePath) =>
      relativePath.startsWith("clipper/"),
    );
    const watchedDirectories = [...new Set(watchPaths.directories)].filter(
      (relativePath) => relativePath.startsWith("clipper/"),
    );
    const fileWatchers = watchedFiles.flatMap((relativePath) => {
      try {
        const resolvedPath = resolveClipperFile(relativePath);
        const watcher = watch(resolvedPath, { persistent: false }, () => {
          if (!event.sender.isDestroyed())
            event.sender.send("clipper:project-file-changed", relativePath);
        });
        return [watcher];
      } catch {
        return [];
      }
    });
    const directoryWatchers = watchedDirectories.flatMap((relativePath) => {
      try {
        const resolvedPath = resolveClipperFile(relativePath);
        const watcher = watch(
          resolvedPath,
          { persistent: false, recursive: true },
          (_eventType, fileName) => {
            try {
              const changedPath = fileName
                ? getClipperRelativePath(
                    path.join(resolvedPath, fileName.toString()),
                  )
                : relativePath;
              if (!event.sender.isDestroyed())
                event.sender.send("clipper:project-file-changed", changedPath);
            } catch {
              if (!event.sender.isDestroyed())
                event.sender.send("clipper:project-file-changed", relativePath);
            }
          },
        );
        return [watcher];
      } catch {
        return [];
      }
    });

    textFileWatchers.set(senderId, [...fileWatchers, ...directoryWatchers]);
    event.sender.once("destroyed", () => {
      textFileWatchers.get(senderId)?.forEach((watcher) => watcher.close());
      textFileWatchers.delete(senderId);
    });
  },
);

// ─── Project / Dialog handlers ───────────────────────────────────────────

ipcMain.handle("clipper:open-project-manifest", async () => {
  const appRoot = path.resolve(__dirname, "..");
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open Clipper project",
    defaultPath: path.join(appRoot, "clipper", "projects"),
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Clipper Project", extensions: ["json"] }],
  });

  if (canceled || !filePaths[0]) return null;
  const selectedPath = filePaths[0];
  const stat = await fs.stat(selectedPath);
  if (stat.isDirectory()) {
    const manifestPath = path.join(selectedPath, "project.json");
    try {
      await fs.access(manifestPath);
      return getClipperRelativePath(manifestPath);
    } catch {
      return null;
    }
  }
  return path.basename(selectedPath) === "project.json" ? getClipperRelativePath(selectedPath) : null;
});

function validateProjectFolderName(name: string): string | null {
  if (!name) return "Project name cannot be empty.";
  if (/^\s|\s$/.test(name)) return "Name cannot start or end with whitespace.";
  if (name === "." || name === "..") return "Invalid project name.";
  if (/[\x00-\x1F]/.test(name))
    return "Name cannot contain control characters.";
  if (/[<>:"\/\\|?*]/.test(name))
    return 'Name cannot contain < > : " / \\ | ? *';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(name))
    return `"${name}" is a reserved system name.`;
  if (name.endsWith(".")) return "Name cannot end with a dot.";
  return null;
}

ipcMain.handle(
  "clipper:create-project",
  async (_event, projectName: string) => {
    const appRoot = path.resolve(__dirname, "..");
    const projectsDir = path.join(appRoot, "clipper", "projects");
    await fs.mkdir(projectsDir, { recursive: true });

    const error = validateProjectFolderName(projectName);
    if (error) throw new Error(error);

    const folderName = projectName;
    const folderPath = path.join(projectsDir, folderName);

    try {
      await fs.mkdir(folderPath);
    } catch (error) {
      if ((error as { code?: string }).code === "EEXIST") {
        throw new Error(`A project named "${folderName}" already exists.`);
      }
      throw error;
    }

    const manifestPath = path.join(folderPath, "project.json");
    return getClipperRelativePath(manifestPath);
  },
);

ipcMain.handle(
  "clipper:export-media-file",
  async (_event, defaultFileName: string, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export media",
      defaultPath: defaultFileName,
      filters: [{ name: "Clipper Media Package", extensions: ["json"] }],
    });

    if (canceled || !filePath) return null;

    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  },
);

ipcMain.handle(
  "clipper:export-binary-file",
  async (_event, defaultFileName: string, base64Content: string) => {
    const extension = path.extname(defaultFileName).replace(/^\./, "") || "bin";
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export media",
      defaultPath: defaultFileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });

    if (canceled || !filePath) return null;

    await fs.writeFile(filePath, Buffer.from(base64Content, "base64"));
    return filePath;
  },
);

// ─── Video export IPC handlers (delegated to engine) ─────────────────────

ipcMain.handle(
  "clipper:start-video-export",
  async (
    _event,
    defaultFileName: string,
    frameRate: number,
    width: number,
    height: number,
  ) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export video",
      defaultPath: defaultFileName,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });

    if (canceled || !filePath) return null;

    const { sessionId } = engine.startVideoExport(defaultFileName, frameRate, width, height, filePath);
    return { sessionId, filePath };
  },
);

ipcMain.handle(
  "clipper:write-video-frame",
  async (_event, sessionId: string, frameData: Uint8Array) => {
    await engine.writeVideoFrame(sessionId, frameData);
  },
);

ipcMain.handle(
  "clipper:finish-video-export",
  async (_event, sessionId: string) => {
    return engine.finishVideoExport(sessionId);
  },
);

ipcMain.handle(
  "clipper:cancel-video-export",
  async (_event, sessionId: string) => {
    engine.cancelVideoExport(sessionId);
  },
);

// ─── Render / export IPC handlers (delegated to engine) ──────────────────

ipcMain.handle(
  "clipper:render-video-export",
  async (
    event,
    exportId: string,
    defaultFileName: string,
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    durationSeconds: number,
    tileHeight?: number,
    reusePrerenderCache?: boolean,
  ) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export video",
      defaultPath: defaultFileName,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });

    if (canceled || !filePath) return null;
    await engine.renderSceneToVideoSupervised(
      project,
      manifestPath,
      scene,
      filePath,
      frameRate,
      durationSeconds,
      {
        source: "app-supervised",
        exportId,
        tileHeight,
        reusePrerenderCache: reusePrerenderCache === true,
        onProgress: (progress) =>
          event.sender.send(
            "clipper:video-export-progress",
            exportId,
            progress,
          ),
      },
    );
    shell.showItemInFolder(filePath);
    return filePath;
  },
);

ipcMain.handle(
  "clipper:prerender-frame",
  async (
    _event,
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight?: number,
    blockDurationMs?: number,
    frameRange?: ExportFrameRange,
  ) => {
    return withTimeout(
      engine.prerenderFrame(project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs, frameRange),
      12000,
      `Timed out prerendering frame at ${sceneTime.toFixed(3)}s in the main process.`,
    );
  },
);

ipcMain.handle(
  "clipper:prerender-video-block",
  async (
    _event,
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight?: number,
    blockDurationMs?: number,
  ) => {
    return withTimeout(
      engine.prerenderVideoBlock(project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs),
      30000,
      `Timed out prerendering video block at ${sceneTime.toFixed(3)}s in the main process.`,
    );
  },
);

ipcMain.handle(
  "clipper:clear-prerender-cache",
  async (_event, manifestPath: string) => {
    await engine.clearPrerenderCache(manifestPath);
  },
);

ipcMain.handle("clipper:clear-all-prerender-caches", async () => {
  return engine.clearAllPrerenderCaches();
});

ipcMain.handle(
  "clipper:cancel-render-video-export",
  async (_event, exportId: string) => {
    engine.cancelRender(exportId);
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#00000000",
    title: "Clipper",
    icon: appIconPath,
    titleBarStyle: "hiddenInset",
    transparent: true,
    webPreferences: {
      additionalArguments: experimentalHtmlCanvasPostProcessEnabled ? ["clipperExperimentalHtmlCanvasPostProcess=1"] : [],
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);

  try {
    const state = await readAppState();
    const bounds = state.windowBounds as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (
      bounds &&
      typeof bounds.x === "number" &&
      typeof bounds.y === "number" &&
      typeof bounds.width === "number" &&
      typeof bounds.height === "number"
    ) {
      const displays = screen.getAllDisplays();
      const inAnyDisplay = displays.some((d) => {
        const b = d.workArea;
        return (
          bounds.x < b.x + b.width &&
          bounds.x + 40 > b.x &&
          bounds.y < b.y + b.height &&
          bounds.y + 40 > b.y
        );
      });
      if (inAnyDisplay) window.setBounds(bounds);
    }
  } catch {
    /* no saved bounds */
  }

  window.on("close", (event) => {
    event.preventDefault();
    writeWindowBounds(window)
      .catch(() => {})
      .finally(() => window.destroy());
  });

  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => isAllowedWindowPermission(permission),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(isAllowedWindowPermission(permission));
    },
  );

  window.on("enter-full-screen", () =>
    window.webContents.send("clipper:window-fullscreen-changed", true),
  );
  window.on("leave-full-screen", () =>
    window.webContents.send("clipper:window-fullscreen-changed", false),
  );

  window.webContents.on("before-input-event", (event, input) => {
    if (!(input.control || input.meta)) return;
    if (input.key.toLowerCase() === "w") {
      event.preventDefault();
      window.webContents.send("clipper:close-editor-tab-shortcut");
      return;
    }

    if (input.key.toLowerCase() === "t") {
      event.preventDefault();
      window.webContents.send("clipper:restore-editor-tab-shortcut");
      return;
    }

    if (input.key === ",") {
      event.preventDefault();
      window.webContents.send("clipper:settings-shortcut");
      return;
    }

    if (!["1", "2", "3", "4"].includes(input.key)) return;

    event.preventDefault();
    window.webContents.send("clipper:mode-shortcut", input.key);
  });

  if (isDev) {
    await window.loadURL(
      process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173",
    );
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function installAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          accelerator: "CommandOrControl+,",
          click: (_menuItem, browserWindow) => {
            if (browserWindow instanceof BrowserWindow)
              browserWindow.webContents.send("clipper:settings-shortcut");
          },
        },
        { type: "separator" },
        isMac
          ? {
              label: "Close Window",
              click: (_menuItem, browserWindow) => {
                browserWindow?.close();
              },
            }
          : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

// ─── Shutdown ────────────────────────────────────────────────────────────

function installShutdownHandlers() {
  app.on("before-quit", () => {
    engine.requestAllActiveRendersStop();
  });
  process.once("SIGTERM", () => {
    engine.requestAllActiveRendersStop();
    app.quit();
  });
  process.once("SIGINT", () => {
    engine.requestAllActiveRendersStop();
    app.quit();
  });
}

installShutdownHandlers();

app.whenReady().then(async () => {
  if (isRenderVideoChildProcess) {
    const payloadPath = process.argv[renderVideoChildArgIndex + 1];
    if (!payloadPath)
      throw new Error(
        "Usage: electron . --render-video-child <payload.json>",
      );
    await engine.runRenderVideoChildIfRequested(payloadPath);
    app.quit();
    return;
  }

  installAppMenu();

  await createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
