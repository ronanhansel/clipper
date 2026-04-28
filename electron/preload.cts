import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clipper", {
  platform: process.platform,
  readTextFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-text-file", relativePath) as Promise<string>,
  writeTextFile: (relativePath: string, content: string) => ipcRenderer.invoke("clipper:write-text-file", relativePath, content) as Promise<void>,
  listSystemFonts: () => ipcRenderer.invoke("clipper:list-system-fonts") as Promise<string[]>,
  watchTextFiles: (relativePaths: string[]) => ipcRenderer.invoke("clipper:watch-text-files", relativePaths) as Promise<void>,
  watchProjectFiles: (watchPaths: { files: string[]; directories: string[] }) => ipcRenderer.invoke("clipper:watch-project-files", watchPaths) as Promise<void>,
  openProjectManifest: () => ipcRenderer.invoke("clipper:open-project-manifest") as Promise<string | null>,
  exportMediaFile: (defaultFileName: string, content: string) => ipcRenderer.invoke("clipper:export-media-file", defaultFileName, content) as Promise<string | null>,
  exportBinaryFile: (defaultFileName: string, base64Content: string) => ipcRenderer.invoke("clipper:export-binary-file", defaultFileName, base64Content) as Promise<string | null>,
  startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => ipcRenderer.invoke("clipper:start-video-export", defaultFileName, frameRate, width, height) as Promise<{ sessionId: string; filePath: string } | null>,
  writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => ipcRenderer.invoke("clipper:write-video-frame", sessionId, frameData) as Promise<void>,
  finishVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:finish-video-export", sessionId) as Promise<string>,
  cancelVideoExport: (sessionId: string) => ipcRenderer.invoke("clipper:cancel-video-export", sessionId) as Promise<void>,
  renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, scene: unknown, frameRate: number) => ipcRenderer.invoke("clipper:render-video-export", exportId, defaultFileName, project, scene, frameRate) as Promise<string | null>,
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
});
