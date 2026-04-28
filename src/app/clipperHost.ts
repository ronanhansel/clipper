import type { ProjectManifest } from "../core/types";

type SceneManifest = ProjectManifest["scenes"][number];

class ClipperHostService {
  async readTextFile(relativePath: string) {
    if (window.clipper) return window.clipper.readTextFile(relativePath);

    const response = await fetch(`/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) throw new Error((await response.text()) || "Unable to load composition file.");
    return response.text();
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

export const clipperHost = new ClipperHostService();
