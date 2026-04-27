import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clipper", {
  platform: process.platform,
  readTextFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-text-file", relativePath) as Promise<string>,
  writeTextFile: (relativePath: string, content: string) => ipcRenderer.invoke("clipper:write-text-file", relativePath, content) as Promise<void>,
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
  onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => {
    const listener = (_event: Electron.IpcRendererEvent, key: "1" | "2" | "3" | "4") => callback(key);
    ipcRenderer.on("clipper:mode-shortcut", listener);
    return () => ipcRenderer.removeListener("clipper:mode-shortcut", listener);
  },
});
