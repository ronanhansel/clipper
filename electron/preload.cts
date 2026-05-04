import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clipper", {
  platform: process.platform,
  readTextFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-text-file", relativePath) as Promise<string>,
  readBinaryFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-binary-file", relativePath) as Promise<string>,
  writeTextFile: (relativePath: string, content: string) => ipcRenderer.invoke("clipper:write-text-file", relativePath, content) as Promise<void>,
  writeBinaryFile: (relativePath: string, base64Content: string) => ipcRenderer.invoke("clipper:write-binary-file", relativePath, base64Content) as Promise<void>,
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
  exportProjectDialog: (defaultFileName: string) => ipcRenderer.invoke("clipper:export-project-dialog", defaultFileName) as Promise<string | null>,
  exportMediaFile: (defaultFileName: string, content: string) => ipcRenderer.invoke("clipper:export-media-file", defaultFileName, content) as Promise<string | null>,
  exportBinaryFile: (defaultFileName: string, base64Content: string) => ipcRenderer.invoke("clipper:export-binary-file", defaultFileName, base64Content) as Promise<string | null>,
  startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => ipcRenderer.invoke("clipper:start-video-export", defaultFileName, frameRate, width, height) as Promise<{ sessionId: string; filePath: string } | null>,
  writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => ipcRenderer.invoke("clipper:write-video-frame", sessionId, frameData) as Promise<void>,
  finishVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:finish-video-export", sessionId) as Promise<string>,
  cancelVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:cancel-video-export", sessionId) as Promise<void>,
  renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, manifestPath: string, scene: unknown, frameRate: number, durationSeconds: number, tileHeight: number, reusePrerenderCache: boolean) => ipcRenderer.invoke("clipper:render-video-export", exportId, defaultFileName, project, manifestPath, scene, frameRate, durationSeconds, tileHeight, reusePrerenderCache) as Promise<string | null>,
  prerenderFrame: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number) => ipcRenderer.invoke("clipper:prerender-frame", project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs) as Promise<Array<{ width: number; height: number; pixelFormat: "bgra"; sceneTime: number; frameRate: number; data: Uint8Array }>>,
  prerenderVideoBlock: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number) => ipcRenderer.invoke("clipper:prerender-video-block", project, manifestPath, scene, sceneTime, sceneDuration, frameRate, tileHeight, blockDurationMs) as Promise<{ width: number; height: number; mimeType: string; startTime: number; duration: number; startFrame: number; endFrame: number; frameRate: number; data: string }>,
  clearPrerenderCache: (manifestPath: string) => ipcRenderer.invoke("clipper:clear-prerender-cache", manifestPath) as Promise<void>,
  clearAllPrerenderCaches: () => ipcRenderer.invoke("clipper:clear-all-prerender-caches") as Promise<{ clearedCount: number }>,
  cancelRenderVideoExport: (exportId: string) => ipcRenderer.invoke("clipper:cancel-render-video-export", exportId) as Promise<void>,
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
  onExportProject: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("clipper:export-project", listener);
    return () => ipcRenderer.removeListener("clipper:export-project", listener);
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
});
