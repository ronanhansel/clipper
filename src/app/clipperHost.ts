import type {
  AgentProvider,
  AppRuntimeInfo,
  AppUpdateStatus,
  ExportRenderQuality,
  ExportTileResolutionMapping,
  ExportWorkerResolutionMapping,
  MediaExportFormat,
  MediaExportRenderMode,
  StableSlowGridPreset,
  StableSlowValidationSamples,
} from "./types";
import type { ProjectManifest } from "../core/types";

type SceneManifest = ProjectManifest["scenes"][number];

export type TemplateBundle = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  entry: string;
  author: { name: string; github?: string; twitter?: string; email?: string };
  files: Record<string, string>;
};

export type SystemFontInfo = {
  family: string;
  source?: string;
};

function normalizeSystemFontInfo(
  value: string | SystemFontInfo,
): SystemFontInfo {
  return typeof value === "string" ? { family: value } : value;
}

class ClipperHostService {
  private mutationQueue: Promise<void> = Promise.resolve();

  private enqueueMutation<T>(op: () => Promise<T>): Promise<T> {
    const promise = this.mutationQueue.then(op);
    this.mutationQueue = promise.catch(() => {}).then(() => {});
    return promise;
  }

  async readTextFile(relativePath: string) {
    if (window.clipper) return window.clipper.readTextFile(relativePath);

    const response = await fetch(
      `/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`,
    );
    if (!response.ok)
      throw new Error(
        (await response.text()) || "Unable to load composition file.",
      );
    return response.text();
  }

  async writeTextFile(relativePath: string, content: string) {
    return this.enqueueMutation(async () => {
      if (window.clipper) {
        await window.clipper.writeTextFile(relativePath, content);
        return;
      }

      const response = await fetch(
        `/__clipper_fs/write?path=${encodeURIComponent(relativePath)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          body: content,
        },
      );

      if (!response.ok)
        throw new Error(
          (await response.text()) || "Unable to save composition file.",
        );
    });
  }

  async createDirectory(relativePath: string) {
    return this.enqueueMutation(async () => {
      await window.clipper?.createDirectory?.(relativePath);
    });
  }

  async revealFile(relativePath: string) {
    await window.clipper?.revealFile?.(relativePath);
  }

  async revealAbsolutePath(filePath: string) {
    await window.clipper?.revealAbsolutePath?.(filePath);
  }

  async copyText(text: string) {
    if (window.clipper?.copyText) {
      await window.clipper.copyText(text);
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  async openAgentTerminal(relativePath: string, provider: AgentProvider) {
    await window.clipper?.openAgentTerminal?.(relativePath, provider);
  }

  async trashFile(relativePath: string) {
    return this.enqueueMutation(async () => {
      await window.clipper?.trashFile?.(relativePath);
    });
  }

  async renameFile(relativePath: string, nextRelativePath: string) {
    return this.enqueueMutation(async () => {
      await window.clipper?.renameFile?.(relativePath, nextRelativePath);
    });
  }

  async copyFile(relativePath: string, nextRelativePath: string) {
    return this.enqueueMutation(async () => {
      await window.clipper?.copyFile?.(relativePath, nextRelativePath);
    });
  }

  async listDirectory(
    relativePath: string,
  ): Promise<{ name: string; isDirectory: boolean }[]> {
    if (window.clipper?.listDirectory)
      return window.clipper.listDirectory(relativePath);

    const response = await fetch(
      `/__clipper_fs/list?path=${encodeURIComponent(relativePath)}`,
    );
    if (!response.ok) return [];
    return response.json() as Promise<{ name: string; isDirectory: boolean }[]>;
  }

  async listTemplates(): Promise<TemplateBundle[]> {
    if (window.clipper?.listTemplates) return window.clipper.listTemplates();
    return [];
  }

  async findProjectFileByName(directoryPath: string, fileName: string) {
    if (window.clipper?.findProjectFileByName)
      return window.clipper.findProjectFileByName(directoryPath, fileName);
    return findFileByNameWithListDirectory(this, directoryPath, fileName);
  }

  async listSystemFonts(): Promise<SystemFontInfo[]> {
    const hostFonts = await window.clipper?.listSystemFonts?.();
    if (hostFonts?.length) return hostFonts.map(normalizeSystemFontInfo);

    return this.listBrowserLocalFonts();
  }

  private async listBrowserLocalFonts(): Promise<SystemFontInfo[]> {
    if (!window.queryLocalFonts) return [];
    try {
      const fonts = await window.queryLocalFonts();
      const families = new Map<string, SystemFontInfo>();
      for (const font of fonts) {
        const family = font.family.trim();
        if (!family) continue;
        const source = font.blob
          ? URL.createObjectURL(await font.blob())
          : undefined;
        const existing = families.get(family);
        if (!existing) families.set(family, { family, source });
        else if (!existing.source && source) existing.source = source;
      }
      return [...families.values()].sort((a, b) =>
        a.family.localeCompare(b.family, undefined, { sensitivity: "base" }),
      );
    } catch {
      return [];
    }
  }

  async openProjectManifest() {
    if (!window.clipper?.openProjectManifest) return null;
    return window.clipper.openProjectManifest();
  }

  async createProject(projectName: string) {
    if (!window.clipper?.createProject) {
      throw new Error(
        "Electron app needs to be restarted to apply the latest updates.",
      );
    }
    return window.clipper.createProject(projectName);
  }

  async renderVideoExport(
    exportId: string,
    defaultFileName: string,
    project: ProjectManifest,
    manifestPath: string,
    scene: SceneManifest,
    frameRate: number,
    durationSeconds: number,
    tileHeight: number,
    reusePrerenderCache: boolean,
    exportWidth?: number,
    exportHeight?: number,
    mediaExportFormat?: MediaExportFormat,
    exportRenderQuality?: ExportRenderQuality,
    exportWorkerMapping?: ExportWorkerResolutionMapping,
    exportTileMapping?: ExportTileResolutionMapping,
    exportRenderMode?: MediaExportRenderMode,
    stableSlowGridPreset?: StableSlowGridPreset,
    stableSlowValidationSamples?: StableSlowValidationSamples,
  ) {
    if (!window.clipper?.renderVideoExport)
      throw new Error(
        "Video export requires the Clipper desktop app. Restart the app if this was just updated.",
      );
    return window.clipper.renderVideoExport(
      exportId,
      defaultFileName,
      project,
      manifestPath,
      scene,
      frameRate,
      durationSeconds,
      tileHeight,
      reusePrerenderCache,
      exportWidth,
      exportHeight,
      mediaExportFormat,
      exportRenderQuality,
      exportWorkerMapping,
      exportTileMapping,
      exportRenderMode,
      stableSlowGridPreset,
      stableSlowValidationSamples,
    );
  }

  async prerenderFrame(
    project: ProjectManifest,
    manifestPath: string,
    scene: SceneManifest,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight: number,
    blockDurationMs: number,
    frameRange?: { startFrame: number; endFrame: number },
  ) {
    if (!window.clipper?.prerenderFrame)
      throw new Error(
        "Prerender cache requires the Clipper desktop app. Restart the app if this was just updated.",
      );
    return window.clipper.prerenderFrame(
      project,
      manifestPath,
      scene,
      sceneTime,
      sceneDuration,
      frameRate,
      tileHeight,
      blockDurationMs,
      frameRange,
    );
  }

  async prerenderVideoBlock(
    project: ProjectManifest,
    manifestPath: string,
    scene: SceneManifest,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight: number,
    blockDurationMs: number,
  ) {
    if (!window.clipper?.prerenderVideoBlock)
      throw new Error(
        "Prerender video cache requires the Clipper desktop app. Restart the app if this was just updated.",
      );
    return window.clipper.prerenderVideoBlock(
      project,
      manifestPath,
      scene,
      sceneTime,
      sceneDuration,
      frameRate,
      tileHeight,
      blockDurationMs,
    );
  }

  async clearPrerenderCache(manifestPath: string) {
    await window.clipper?.clearPrerenderCache?.(manifestPath);
  }

  async clearAllPrerenderCaches() {
    if (!window.clipper?.clearAllPrerenderCaches)
      throw new Error(
        "Clearing all prerender caches requires the Clipper desktop app. Restart the app if this was just updated.",
      );
    return window.clipper.clearAllPrerenderCaches();
  }

  async exportMediaFile(defaultFileName: string, content: string) {
    if (!window.clipper?.exportMediaFile) return null;
    return window.clipper.exportMediaFile(defaultFileName, content);
  }

  async cancelRenderVideoExport(exportId: string) {
    await window.clipper?.cancelRenderVideoExport?.(exportId);
  }

  async getAppRuntimeInfo(): Promise<AppRuntimeInfo> {
    return (
      window.clipper?.getAppRuntimeInfo?.() ?? {
        appVersion: "dev",
        chromiumVersion: "browser",
        electronVersion: "not available",
        threeVersion: "not available",
      }
    );
  }

  async getUpdateStatus(): Promise<AppUpdateStatus> {
    return (
      window.clipper?.getUpdateStatus?.() ?? {
        kind: "unsupported",
        message:
          "Updates are only available in the packaged Clipper desktop app.",
      }
    );
  }

  async setAutoDownloadUpdates(enabled: boolean): Promise<AppUpdateStatus> {
    if (!window.clipper?.setAutoDownloadUpdates) return this.getUpdateStatus();
    return window.clipper.setAutoDownloadUpdates(enabled);
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    return window.clipper?.checkForUpdates?.() ?? this.getUpdateStatus();
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    return window.clipper?.downloadUpdate?.() ?? this.getUpdateStatus();
  }

  async installUpdate(): Promise<AppUpdateStatus> {
    return window.clipper?.installUpdate?.() ?? this.getUpdateStatus();
  }

  onUpdateStatus(callback: (status: AppUpdateStatus) => void) {
    if (typeof window.clipper?.onUpdateStatus !== "function") return () => {};
    return window.clipper.onUpdateStatus(callback);
  }
}

export const clipperHost = new ClipperHostService();

async function findFileByNameWithListDirectory(
  host: ClipperHostService,
  directoryPath: string,
  fileName: string,
): Promise<string | null> {
  const entries = await host.listDirectory(directoryPath).catch(() => []);
  const normalizedFileName = fileName.toLocaleLowerCase();
  for (const entry of entries) {
    const entryPath = `${directoryPath}/${entry.name}`;
    if (
      !entry.isDirectory &&
      entry.name.toLocaleLowerCase() === normalizedFileName
    )
      return entryPath;
    if (entry.isDirectory) {
      const matchedPath = await findFileByNameWithListDirectory(
        host,
        entryPath,
        fileName,
      );
      if (matchedPath) return matchedPath;
    }
  }
  return null;
}
