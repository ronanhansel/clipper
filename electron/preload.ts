import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clipper", {
  platform: process.platform,
  readTextFile: (relativePath: string) => ipcRenderer.invoke("clipper:read-text-file", relativePath) as Promise<string>,
  writeTextFile: (relativePath: string, content: string) => ipcRenderer.invoke("clipper:write-text-file", relativePath, content) as Promise<void>,
});
