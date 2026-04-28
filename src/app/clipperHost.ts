import type { ProjectManifest } from "../core/types";

type SceneManifest = ProjectManifest["scenes"][number];

class ClipperHostService {
  async readTextFile(relativePath: string) {
    if (window.clipper) return window.clipper.readTextFile(relativePath);

    const response = await fetch(`/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) throw new Error((await response.text()) || "Unable to load composition file.");
    return response.text();
  }

  async readBinaryFile(relativePath: string) {
    if (window.clipper?.readBinaryFile) return window.clipper.readBinaryFile(relativePath);

    const response = await fetch(`/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) throw new Error((await response.text()) || "Unable to load binary file.");
    const buffer = await response.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }

  async writeTextFile(relativePath: string, content: string) {
    if (window.clipper) {
      await window.clipper.writeTextFile(relativePath, content);
      return;
    }

    const response = await fetch(`/__clipper_fs/write?path=${encodeURIComponent(relativePath)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: content,
    });

    if (!response.ok) throw new Error((await response.text()) || "Unable to save composition file.");
  }

  async writeBinaryFile(relativePath: string, base64Content: string) {
    if (window.clipper?.writeBinaryFile) {
      await window.clipper.writeBinaryFile(relativePath, base64Content);
      return;
    }

    const response = await fetch(`/__clipper_fs/write?path=${encodeURIComponent(relativePath)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: base64ToUint8Array(base64Content),
    });

    if (!response.ok) throw new Error((await response.text()) || "Unable to save binary file.");
  }

  async createDirectory(relativePath: string) {
    await window.clipper?.createDirectory?.(relativePath);
  }

  async revealFile(relativePath: string) {
    await window.clipper?.revealFile?.(relativePath);
  }

  async trashFile(relativePath: string) {
    await window.clipper?.trashFile?.(relativePath);
  }

  async renameFile(relativePath: string, nextRelativePath: string) {
    await window.clipper?.renameFile?.(relativePath, nextRelativePath);
  }

  async copyFile(relativePath: string, nextRelativePath: string) {
    await window.clipper?.copyFile?.(relativePath, nextRelativePath);
  }

  async listSystemFonts() {
    const browserFonts = await this.listBrowserLocalFonts();
    if (browserFonts.length > 0) return browserFonts;
    return window.clipper?.listSystemFonts?.() ?? [];
  }

  private async listBrowserLocalFonts() {
    if (!window.queryLocalFonts) return [];
    try {
      const fonts = await window.queryLocalFonts();
      const families = new Set<string>();
      for (const font of fonts) {
        const family = font.family.trim();
        if (family) families.add(family);
      }
      return [...families].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    } catch {
      return [];
    }
  }

  async openProjectManifest() {
    if (!window.clipper?.openProjectManifest) return null;
    return window.clipper.openProjectManifest();
  }

  async renderVideoExport(exportId: string, defaultFileName: string, project: ProjectManifest, scene: SceneManifest, frameRate: number) {
    if (!window.clipper?.renderVideoExport) throw new Error("Video export requires the Clipper desktop app. Restart the app if this was just updated.");
    return window.clipper.renderVideoExport(exportId, defaultFileName, project, scene, frameRate);
  }

  async exportMediaFile(defaultFileName: string, content: string) {
    if (!window.clipper?.exportMediaFile) return null;
    return window.clipper.exportMediaFile(defaultFileName, content);
  }

  async cancelRenderVideoExport(exportId: string) {
    await window.clipper?.cancelRenderVideoExport?.(exportId);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export const clipperHost = new ClipperHostService();
