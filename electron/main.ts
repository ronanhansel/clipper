import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  screen,
  shell,
  clipboard,
} from "electron";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { RenderEngine } from "./render-engine/renderer.js";
import type {
  ExportFrameRange,
  ProjectManifest,
  Scene,
} from "./render-engine/types.js";
import { UpdateService } from "./updateService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setName("Clipper");
const appRoot = app.isPackaged
  ? app.getPath("userData")
  : path.resolve(__dirname, "..");
const appStatePath = "clipper/app-state.json";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const renderVideoChildArgIndex = process.argv.indexOf("--render-video-child");
const isRenderVideoChildProcess = renderVideoChildArgIndex >= 0;
const agentProviderCommands: Record<string, string> = {
  opencode: "opencode",
  codex: "codex",
  claude: "claude",
  gemini: "gemini",
};
app.commandLine.appendSwitch("force-color-profile", "srgb");
const experimentalHtmlCanvasPostProcessEnabled =
  process.env.CLIPPER_EXPERIMENTAL_HTML_CANVAS_POSTPROCESS === "1" ||
  readStartupAppStateBoolean("experimentalHtmlCanvasPostProcess");
const automaticUpdateDownloadsEnabled = readStartupAppStateBoolean(
  "automaticUpdateDownloads",
  true,
);
const defaultWindowBounds = { width: 1440, height: 960 };
const minWindowBounds = { width: 1200, height: 760 };
if (experimentalHtmlCanvasPostProcessEnabled) {
  // Alpha live DOM post-process path: enables canvas[layoutsubtree] + ctx.drawElementImage() capture.
  app.commandLine.appendSwitch(
    "enable-blink-features",
    "HTMLCanvasElementDrawElement",
  );
  app.commandLine.appendSwitch("enable-features", "CanvasDrawElement");
}
if (isRenderVideoChildProcess && process.platform === "darwin")
  app.setActivationPolicy("accessory");

const textFileWatchers = new Map<number, FSWatcher[]>();
let appShuttingDown = false;
const appShuttingDownRef = { current: appShuttingDown };
Object.defineProperty(appShuttingDownRef, "current", {
  get: () => appShuttingDown,
  set: (v) => {
    appShuttingDown = v;
  },
});
const appIconPath = path.resolve(__dirname, "../build/electron/icon.png");

function readStartupAppStateBoolean(key: string, fallback = false) {
  try {
    const state = JSON.parse(
      readFileSync(path.join(appRoot, appStatePath), "utf8"),
    ) as Record<string, unknown>;
    return typeof state[key] === "boolean" ? state[key] === true : fallback;
  } catch {
    return fallback;
  }
}

// ─── Render Engine (instantiated after resolveClipperFile is defined) ────

let engine: RenderEngine;
const updateService = new UpdateService({
  autoDownload: automaticUpdateDownloadsEnabled,
  readAutoDownload: async () => {
    const state = await readAppState();
    return typeof state.automaticUpdateDownloads === "boolean"
      ? state.automaticUpdateDownloads
      : true;
  },
  writeAutoDownload: async (enabled) =>
    writeAppState({ automaticUpdateDownloads: enabled }),
});

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
  const merged = { ...state };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) delete merged[key];
    else if (
      key === "settings" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const previousSettings =
        merged.settings &&
        typeof merged.settings === "object" &&
        !Array.isArray(merged.settings)
          ? (merged.settings as Record<string, unknown>)
          : {};
      merged.settings = {
        ...previousSettings,
        ...(value as Record<string, unknown>),
      };
    } else merged[key] = value;
  }
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

function restoreWindowBounds(bounds: unknown) {
  if (
    !bounds ||
    typeof bounds !== "object" ||
    !("x" in bounds) ||
    !("y" in bounds) ||
    !("width" in bounds) ||
    !("height" in bounds)
  ) {
    return null;
  }

  const candidate = bounds as {
    x: unknown;
    y: unknown;
    width: unknown;
    height: unknown;
  };

  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height)
  ) {
    return null;
  }

  const candidateBounds = {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
  const displays = screen.getAllDisplays();
  const matchingDisplay =
    displays.find((display) => {
      const workArea = display.workArea;
      return (
        candidateBounds.x < workArea.x + workArea.width &&
        candidateBounds.x + candidateBounds.width > workArea.x &&
        candidateBounds.y < workArea.y + workArea.height &&
        candidateBounds.y + candidateBounds.height > workArea.y
      );
    }) ?? screen.getPrimaryDisplay();
  const workArea = matchingDisplay.workArea;
  const width = Math.min(
    Math.max(candidateBounds.width, minWindowBounds.width),
    workArea.width,
  );
  const height = Math.min(
    Math.max(candidateBounds.height, minWindowBounds.height),
    workArea.height,
  );
  const x = Math.min(
    Math.max(candidateBounds.x, workArea.x),
    workArea.x + workArea.width - width,
  );
  const y = Math.min(
    Math.max(candidateBounds.y, workArea.y),
    workArea.y + workArea.height - height,
  );

  return { x, y, width, height };
}

function installRendererStartupDiagnostics(window: BrowserWindow) {
  if (isDev) return;

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error("[clipper] renderer failed to load", {
        errorCode,
        errorDescription,
        validatedUrl,
      });
    },
  );
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[clipper] renderer process gone", details);
  });
  window.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level < 2) return;
      console.error("[clipper] renderer console", {
        level,
        message,
        line,
        sourceId,
      });
    },
  );
}

function isAllowedWindowPermission(permission: string) {
  return (
    permission === "local-fonts" ||
    permission === "pointerLock" ||
    permission === "pointer-lock"
  );
}

type ProjectWatchPaths = {
  files: string[];
  directories: string[];
};

type TemplateBundle = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  entry: string;
  author: { name: string; github?: string; twitter?: string; email?: string };
  files: Record<string, string>;
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

function getAgentProviderCommand(provider: string) {
  const command = agentProviderCommands[provider];
  if (!command) throw new Error(`Unsupported agent provider: ${provider}`);
  return command;
}

async function loadTemplateBundles(): Promise<TemplateBundle[]> {
  const root = await resolveTemplatesRoot();
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch(() => []);
  const bundles = await Promise.all(
    entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("submission-"),
      )
      .map((entry) => loadTemplateBundle(root, entry.name)),
  );
  return bundles
    .filter((bundle): bundle is TemplateBundle => Boolean(bundle))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function resolveTemplatesRoot() {
  const candidates = [
    path.join(appRoot, "templates"),
    path.join(app.getAppPath(), "templates"),
    path.join(process.resourcesPath, "templates"),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // Try next runtime location.
    }
  }
  throw new Error("Template directory not found.");
}

async function loadTemplateBundle(
  root: string,
  folderName: string,
): Promise<TemplateBundle | null> {
  const folderPath = path.join(root, folderName);
  const manifestSource = await fs
    .readFile(path.join(folderPath, "manifest.yml"), "utf8")
    .catch(() => "");
  if (!manifestSource) return null;
  const manifest = parseTemplateManifest(manifestSource);
  const sourceRoot = path.join(folderPath, "source");
  const files = await readTemplateSourceFiles(sourceRoot);
  if (!files[manifest.entry])
    throw new Error(`Template ${manifest.id} entry missing: ${manifest.entry}`);
  return { ...manifest, files };
}

function parseTemplateManifest(source: string): Omit<TemplateBundle, "files"> {
  const values: Record<string, string> = {};
  const author: TemplateBundle["author"] = { name: "" };
  let section = "";
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^(\s*)([\w-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, indent, key, rawValue] = match;
    const value = unquoteYamlScalar(rawValue.trim());
    if (!indent) {
      section = rawValue.trim() ? "" : key;
      if (rawValue.trim()) values[key] = value;
    } else if (section === "author") {
      if (
        key === "name" ||
        key === "github" ||
        key === "twitter" ||
        key === "email"
      )
        author[key] = value;
    }
  }
  const id = values.id;
  const title = values.name;
  const entry = values.entry || "source/main.composition.ts";
  if (!id || !title) throw new Error("Template manifest requires id and name.");
  return {
    id,
    slug: values.slug || id,
    title,
    subtitle: values.subtitle || "",
    entry,
    author: {
      name: author.name || "Unknown",
      github: author.github || undefined,
      twitter: author.twitter || undefined,
      email: author.email || undefined,
    },
  };
}

function unquoteYamlScalar(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    return value.slice(1, -1);
  return value;
}

async function readTemplateSourceFiles(sourceRoot: string) {
  const files: Record<string, string> = {};
  async function visit(directoryPath: string) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = `source/${path.relative(sourceRoot, entryPath).split(path.sep).join("/")}`;
      files[relativePath] = await fs.readFile(entryPath, "utf8");
    }
  }
  await visit(sourceRoot);
  return files;
}

function openTerminalWithCommand(folderPath: string, command: string) {
  const shellCommand = `cd ${shellQuote(folderPath)} && ${command}`;
  if (process.platform === "darwin") {
    spawn(
      "osascript",
      [
        "-e",
        `tell application "Terminal" to do script ${JSON.stringify(shellCommand)}`,
      ],
      { detached: true, stdio: "ignore" },
    ).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", shellCommand], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  spawn(
    "sh",
    [
      "-lc",
      `x-terminal-emulator -e sh -lc ${shellQuote(`${shellCommand}; exec sh`)}`,
    ],
    { detached: true, stdio: "ignore" },
  ).unref();
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// ─── Instantiate RenderEngine ─────────────────────────────────────────────

engine = new RenderEngine({
  ffmpegPath,
  appRoot,
  resolveClipperFile,
  loadExportWindow: async (window: BrowserWindow) => {
    if (isDev) {
      const baseUrl =
        process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
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

ipcMain.handle(
  "clipper:write-app-state",
  async (_event, updates: Record<string, unknown>) => {
    await writeAppState(updates);
  },
);

ipcMain.handle("clipper:get-update-status", async () =>
  updateService.getStatus(),
);

ipcMain.handle(
  "clipper:set-auto-download-updates",
  async (_event, enabled: unknown) => {
    if (typeof enabled !== "boolean")
      throw new TypeError(
        "clipper:set-auto-download-updates expects a boolean value.",
      );
    return updateService.setAutoDownload(enabled);
  },
);

ipcMain.handle("clipper:check-for-updates", async () =>
  updateService.checkForUpdates(),
);

ipcMain.handle("clipper:download-update", async () =>
  updateService.downloadUpdate(),
);

ipcMain.handle("clipper:install-update", async () =>
  updateService.installUpdate(),
);

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

ipcMain.handle("clipper:copy-text", async (_event, text: string) => {
  clipboard.writeText(text);
});

ipcMain.handle(
  "clipper:open-agent-terminal",
  async (_event, relativePath: string, provider: string) => {
    const folderPath = resolveClipperFile(relativePath);
    const command = getAgentProviderCommand(provider);
    await fs.mkdir(folderPath, { recursive: true });
    openTerminalWithCommand(folderPath, command);
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

ipcMain.handle("clipper:list-templates", async () => loadTemplateBundles());

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
  return path.basename(selectedPath) === "project.json"
    ? getClipperRelativePath(selectedPath)
    : null;
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
    const projectsDir = path.join(appRoot, "clipper", "projects");
    await fs.mkdir(projectsDir, { recursive: true });

    const error = validateProjectFolderName(projectName);
    if (error) throw new Error(error);

    const folderName = projectName;
    const folderPath = path.join(projectsDir, folderName);

    try {
      await fs.mkdir(folderPath);
      await fs.mkdir(path.join(folderPath, "file-manager"), {
        recursive: true,
      });
      await fs.mkdir(path.join(folderPath, "file-manager", "assets"), {
        recursive: true,
      });
      await fs.mkdir(path.join(folderPath, "file-manager", "compositions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(folderPath, "file-manager", "timelines"), {
        recursive: true,
      });
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

    const { sessionId } = engine.startVideoExport(
      defaultFileName,
      frameRate,
      width,
      height,
      filePath,
    );
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
    exportWidth?: number,
    exportHeight?: number,
    mediaExportFormat?: string,
    exportRenderQuality?: string,
    exportWorkerMapping?: unknown,
    exportTileMapping?: unknown,
    exportRenderMode?: unknown,
    stableSlowGridPreset?: unknown,
    stableSlowValidationSamples?: unknown,
  ) => {
    type MediaExportFormat =
      | "prores-422-hq"
      | "prores-4444"
      | "dnxhr-hqx"
      | "mov"
      | "h264-high"
      | "mp4"
      | "webm";
    const knownFormats = new Set<string>([
      "prores-422-hq",
      "prores-4444",
      "dnxhr-hqx",
      "mov",
      "h264-high",
      "mp4",
      "webm",
    ]);
    const defaultExtension = path.extname(defaultFileName).toLowerCase();
    const inferredFormat =
      defaultExtension === ".webm"
        ? "webm"
        : defaultExtension === ".mp4"
          ? "mp4"
          : "prores-422-hq";
    const format = (
      knownFormats.has(mediaExportFormat ?? "")
        ? mediaExportFormat
        : inferredFormat
    ) as MediaExportFormat;
    const renderQuality = normalizeExportRenderQuality(exportRenderQuality);
    const extension =
      format === "webm"
        ? ".webm"
        : format === "h264-high" || format === "mp4"
          ? ".mp4"
          : ".mov";
    const defaultPath = withMediaExportExtension(defaultFileName, extension);
    const filters = getMediaExportDialogFilters(format);
    const title = getMediaExportDialogTitle(format);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title,
      defaultPath,
      filters,
    });

    if (canceled || !filePath) return null;
    const outputPath = withMediaExportExtension(filePath, extension);
    await engine.renderSceneToVideoSupervised(
      project,
      manifestPath,
      scene,
      outputPath,
      frameRate,
      durationSeconds,
      {
        source: "app-supervised",
        exportId,
        tileHeight,
        reusePrerenderCache: reusePrerenderCache === true,
        exportWidth,
        exportHeight,
        exportFormat: format,
        exportRenderQuality: renderQuality,
        exportWorkerMapping: normalizeExportWorkerMapping(exportWorkerMapping),
        exportTileMapping: normalizeExportTileMapping(exportTileMapping),
        exportRenderMode:
          exportRenderMode === "stable-slow" ? "stable-slow" : "renderer",
        stableSlowGridPreset:
          normalizeStableSlowGridPreset(stableSlowGridPreset),
        stableSlowValidationSamples: normalizeStableSlowValidationSamples(
          stableSlowValidationSamples,
        ),
        onProgress: (progress) =>
          event.sender.send(
            "clipper:video-export-progress",
            exportId,
            progress,
          ),
      },
    );
    shell.showItemInFolder(outputPath);
    return outputPath;
  },
);

function normalizeExportRenderQuality(
  value: string | undefined,
): "standard" | "high" | "ultra" {
  return value === "standard" || value === "ultra" ? value : "high";
}

function normalizeStableSlowGridPreset(
  value: unknown,
): "relaxed" | "balanced" | "safe" | "extreme" {
  return value === "relaxed" || value === "balanced" || value === "extreme"
    ? value
    : "safe";
}

function normalizeStableSlowValidationSamples(value: unknown): 1 | 2 | 3 {
  const numeric = typeof value === "number" ? value : Number(value);
  return numeric === 2 || numeric === 3 ? numeric : 1;
}

function normalizeExportTileMapping(
  value: unknown,
): { hd?: number; qhd?: number; uhd?: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  return {
    hd: normalizeExportTileCount(source.hd),
    qhd: normalizeExportTileCount(source.qhd),
    uhd: normalizeExportTileCount(source.uhd),
  };
}

function normalizeExportWorkerMapping(value: unknown): {
  hd: number;
  qhd: number;
  uhd: number;
} {
  const candidate =
    value && typeof value === "object"
      ? (value as { hd?: unknown; qhd?: unknown; uhd?: unknown })
      : {};
  return {
    hd: normalizeExportWorkerCount(candidate.hd, 2),
    qhd: normalizeExportWorkerCount(candidate.qhd, 2),
    uhd: normalizeExportWorkerCount(candidate.uhd, 1),
  };
}

function normalizeExportTileCount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.min(Math.max(Math.round(numeric), 1), 64);
}

function normalizeExportWorkerCount(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.round(numeric), 1), 8);
}

function getMediaExportDialogFilters(
  format:
    | "prores-422-hq"
    | "prores-4444"
    | "dnxhr-hqx"
    | "mov"
    | "h264-high"
    | "mp4"
    | "webm",
) {
  switch (format) {
    case "webm":
      return [{ name: "WebM Video", extensions: ["webm"] }];
    case "h264-high":
      return [{ name: "MP4 H.264 High Quality", extensions: ["mp4"] }];
    case "mp4":
      return [{ name: "MP4 Video", extensions: ["mp4"] }];
    case "prores-4444":
      return [{ name: "MOV ProRes 4444", extensions: ["mov"] }];
    case "dnxhr-hqx":
      return [{ name: "MOV DNxHR HQX", extensions: ["mov"] }];
    case "mov":
      return [{ name: "MOV Uncompressed BGRA", extensions: ["mov"] }];
    default:
      return [{ name: "MOV ProRes 422 HQ", extensions: ["mov"] }];
  }
}

function getMediaExportDialogTitle(
  format:
    | "prores-422-hq"
    | "prores-4444"
    | "dnxhr-hqx"
    | "mov"
    | "h264-high"
    | "mp4"
    | "webm",
) {
  switch (format) {
    case "webm":
      return "Export WebM video";
    case "h264-high":
      return "Export high-quality H.264 video";
    case "mp4":
      return "Export MP4 video";
    case "prores-4444":
      return "Export ProRes 4444 video";
    case "dnxhr-hqx":
      return "Export DNxHR HQX video";
    case "mov":
      return "Export uncompressed MOV video";
    default:
      return "Export ProRes 422 HQ video";
  }
}

function withMediaExportExtension(
  filePath: string,
  extension: ".mov" | ".mp4" | ".webm",
) {
  const parsed = path.parse(filePath);
  const knownExtensions = new Set([".mov", ".mp4", ".webm"]);
  const baseName = knownExtensions.has(parsed.ext.toLowerCase())
    ? parsed.name
    : parsed.base;
  return path.join(parsed.dir, `${baseName}${extension}`);
}

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
      engine.prerenderFrame(
        project,
        manifestPath,
        scene,
        sceneTime,
        sceneDuration,
        frameRate,
        tileHeight,
        blockDurationMs,
        frameRange,
      ),
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
      engine.prerenderVideoBlock(
        project,
        manifestPath,
        scene,
        sceneTime,
        sceneDuration,
        frameRate,
        tileHeight,
        blockDurationMs,
      ),
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
    width: defaultWindowBounds.width,
    height: defaultWindowBounds.height,
    minWidth: minWindowBounds.width,
    minHeight: minWindowBounds.height,
    backgroundColor: "#101116",
    title: "Clipper",
    icon: appIconPath,
    titleBarStyle: "hiddenInset",
    transparent: false,
    webPreferences: {
      additionalArguments: experimentalHtmlCanvasPostProcessEnabled
        ? ["clipperExperimentalHtmlCanvasPostProcess=1"]
        : [],
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  installRendererStartupDiagnostics(window);

  if (process.platform === "darwin") {
    try {
      app.dock?.setIcon(appIconPath);
    } catch {
      /* Missing dock icons should not block renderer startup. */
    }
  }

  try {
    const state = await readAppState();
    const bounds = restoreWindowBounds(state.windowBounds);
    if (bounds) window.setBounds(bounds);
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
      throw new Error("Usage: electron . --render-video-child <payload.json>");
    await engine.runRenderVideoChildIfRequested(payloadPath);
    app.quit();
    return;
  }

  installAppMenu();
  updateService.initialize();

  await createWindow();
  void updateService.checkOnLaunch();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
