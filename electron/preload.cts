import { contextBridge, ipcRenderer } from "electron";

type UpdateStatusKind = "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
type UpdateStatus = { kind: UpdateStatusKind; message: string; version?: string; downloaded?: boolean };

contextBridge.exposeInMainWorld("clipper", {
  platform: process.platform,
  experimentalHtmlCanvasPostProcess: process.env.CLIPPER_EXPERIMENTAL_HTML_CANVAS_POSTPROCESS === "1" || process.argv.includes("--clipper-experimental-html-canvas-postprocess") || process.argv.includes("clipperExperimentalHtmlCanvasPostProcess=1"),
  readTextFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-text-file", relativePath) as Promise<string>,
  readAppState: () => ipcRenderer.invoke("clipper:read-app-state") as Promise<Record<string, unknown>>,
  writeAppState: (updates: Record<string, unknown>) => ipcRenderer.invoke("clipper:write-app-state", updates) as Promise<void>,
  writeTextFile: (relativePath: string, content: string) => ipcRenderer.invoke("clipper:write-text-file", relativePath, content) as Promise<void>,
  createDirectory: (relativePath: string) => ipcRenderer.invoke("clipper:create-directory", relativePath) as Promise<void>,
  revealFile: (relativePath: string) => ipcRenderer.invoke("clipper:reveal-file", relativePath) as Promise<void>,
  revealAbsolutePath: (filePath: string) => ipcRenderer.invoke("clipper:reveal-absolute-path", filePath) as Promise<void>,
  trashFile: (relativePath: string) => ipcRenderer.invoke("clipper:trash-file", relativePath) as Promise<void>,
  renameFile: (relativePath: string, nextRelativePath: string) => ipcRenderer.invoke("clipper:rename-file", relativePath, nextRelativePath) as Promise<void>,
  copyFile: (relativePath: string, nextRelativePath: string) => ipcRenderer.invoke("clipper:copy-file", relativePath, nextRelativePath) as Promise<void>,
  listDirectory: (relativePath: string) => ipcRenderer.invoke("clipper:list-directory", relativePath) as Promise<{ name: string; isDirectory: boolean }[]>,
  findProjectFileByName: (directoryPath: string, fileName: string) => ipcRenderer.invoke("clipper:find-project-file-by-name", directoryPath, fileName) as Promise<string | null>,
  openCompositionFile: (directoryPath: string) => ipcRenderer.invoke("clipper:open-composition-file", directoryPath) as Promise<string | null>,
  listSystemFonts: () => ipcRenderer.invoke("clipper:list-system-fonts") as Promise<string[]>,
  setWindowFullscreen: (fullscreen: boolean) => ipcRenderer.invoke("clipper:set-window-fullscreen", fullscreen) as Promise<boolean>,
  toggleWindowFullscreen: () => ipcRenderer.invoke("clipper:toggle-window-fullscreen") as Promise<boolean>,
  watchTextFiles: (relativePaths: string[]) => ipcRenderer.invoke("clipper:watch-text-files", relativePaths) as Promise<void>,
  watchProjectFiles: (watchPaths: { files: string[]; directories: string[] }) => ipcRenderer.invoke("clipper:watch-project-files", watchPaths) as Promise<void>,
  openProjectManifest: () => ipcRenderer.invoke("clipper:open-project-manifest") as Promise<string | null>,
  createProject: (projectName: string) => ipcRenderer.invoke("clipper:create-project", projectName) as Promise<string | null>,
  exportMediaFile: (defaultFileName: string, content: string) => ipcRenderer.invoke("clipper:export-media-file", defaultFileName, content) as Promise<string | null>,
  exportBinaryFile: (defaultFileName: string, base64Content: string) => ipcRenderer.invoke("clipper:export-binary-file", defaultFileName, base64Content) as Promise<string | null>,
  startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => ipcRenderer.invoke("clipper:start-video-export", defaultFileName, frameRate, width, height) as Promise<{ sessionId: string; filePath: string } | null>,
  writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => ipcRenderer.invoke("clipper:write-video-frame", sessionId, frameData) as Promise<void>,
  finishVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:finish-video-export", sessionId) as Promise<string>,
  cancelVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:cancel-video-export", sessionId) as Promise<void>,
  renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, manifestPath: string, scene: unknown, frameRate: number, durationSeconds: number, tileHeight: number, reusePrerenderCache: boolean, exportWidth?: number, exportHeight?: number, mediaExportFormat?: string, exportRenderQuality?: string, exportWorkerMapping?: unknown) => ipcRenderer.invoke("clipper:render-video-export", exportId, defaultFileName, project, manifestPath, scene, frameRate, durationSeconds, tileHeight, reusePrerenderCache, exportWidth, exportHeight, mediaExportFormat, exportRenderQuality, exportWorkerMapping) as Promise<string | null>,
  prerenderFrame: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number) => ipcRenderer.invoke("clipper:prerender-frame", project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs) as Promise<Array<{ width: number; height: number; pixelFormat: "bgra"; sceneTime: number; frameRate: number; data: Uint8Array }>>,
  prerenderVideoBlock: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number) => ipcRenderer.invoke("clipper:prerender-video-block", project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs) as Promise<{ width: number; height: number; mimeType: string; startTime: number; duration: number; startFrame: number; endFrame: number; frameRate: number; data: string }>,
  clearPrerenderCache: (manifestPath: string) => ipcRenderer.invoke("clipper:clear-prerender-cache", manifestPath) as Promise<void>,
  clearAllPrerenderCaches: () => ipcRenderer.invoke("clipper:clear-all-prerender-caches") as Promise<{ clearedCount: number }>,
  cancelRenderVideoExport: (exportId: string) => ipcRenderer.invoke("clipper:cancel-render-video-export", exportId) as Promise<void>,
  getUpdateStatus: () => ipcRenderer.invoke("clipper:get-update-status") as Promise<UpdateStatus>,
  setAutoDownloadUpdates: (enabled: boolean) => ipcRenderer.invoke("clipper:set-auto-download-updates", enabled) as Promise<UpdateStatus>,
  checkForUpdates: () => ipcRenderer.invoke("clipper:check-for-updates") as Promise<UpdateStatus>,
  downloadUpdate: () => ipcRenderer.invoke("clipper:download-update") as Promise<UpdateStatus>,
  installUpdate: () => ipcRenderer.invoke("clipper:install-update") as Promise<UpdateStatus>,
  onVideoExportProgress: (callback: (exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string }) => callback(exportId, progress);
    ipcRenderer.on("clipper:video-export-progress", listener);
    return () => ipcRenderer.removeListener("clipper:video-export-progress", listener);
  },
  onTextFileChanged: (callback: (relativePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, relativePath: string) => callback(relativePath);
    ipcRenderer.on("clipper:text-file-changed", listener);
    return () => ipcRenderer.removeListener("clipper:text-file-changed", listener);
  },
  onProjectFileChanged: (callback: (relativePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, relativePath: string) => callback(relativePath);
    ipcRenderer.on("clipper:project-file-changed", listener);
    return () => ipcRenderer.removeListener("clipper:project-file-changed", listener);
  },
  onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => {
    const listener = (_event: Electron.IpcRendererEvent, key: "1" | "2" | "3" | "4") => callback(key);
    ipcRenderer.on("clipper:mode-shortcut", listener);
    return () => ipcRenderer.removeListener("clipper:mode-shortcut", listener);
  },
  onSettingsShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("clipper:settings-shortcut", listener);
    return () => ipcRenderer.removeListener("clipper:settings-shortcut", listener);
  },
  onCloseEditorTabShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("clipper:close-editor-tab-shortcut", listener);
    return () => ipcRenderer.removeListener("clipper:close-editor-tab-shortcut", listener);
  },
  onRestoreEditorTabShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("clipper:restore-editor-tab-shortcut", listener);
    return () => ipcRenderer.removeListener("clipper:restore-editor-tab-shortcut", listener);
  },
  onWindowFullscreenChange: (callback: (fullscreen: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, fullscreen: boolean) => callback(fullscreen);
    ipcRenderer.on("clipper:window-fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("clipper:window-fullscreen-changed", listener);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("clipper:update-status", listener);
    return () => ipcRenderer.removeListener("clipper:update-status", listener);
  },
});
