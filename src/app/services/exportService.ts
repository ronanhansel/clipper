import { defaultAssets } from "../../core/project";
import { partToSource } from "../../core/partSource";
import { buildLinearTimeline, validateScene } from "../../core/timeline";
import type { ProjectManifest } from "../../core/types";
import type { ProjectExportFormat } from "../types";
import { videoExportFrameRate } from "../config";
import { clipperHost } from "../clipperHost";
import { fileDownloadService } from "./fileDownloadService";

type ExportProjectInput = {
  project: ProjectManifest;
  sceneId: string;
  format: ProjectExportFormat;
  includeSources: boolean;
  partSources: Record<string, string>;
};

type PrepareRenderedMediaInput = {
  project: ProjectManifest;
  sceneId: string;
};

class ExportService {
  async exportProject({ project, sceneId, format, includeSources, partSources }: ExportProjectInput) {
    const scene = getScene(project, sceneId);
    const timeline = buildLinearTimeline(scene);
    const payload = format === "scene-json"
      ? scene
      : {
          kind: "clipper-project-package",
          version: project.id,
          exportedAt: new Date().toISOString(),
          project,
          scene,
          media: {
            resolution: project.resolution,
            durationSeconds: timeline.at(-1)?.end ?? 0,
            parts: timeline.map((item) => ({ id: item.id, name: item.name, filePath: item.filePath, start: item.start, end: item.end, duration: item.duration })),
            assetsPath: project.assetsPath,
            assets: project.assets ?? defaultAssets,
          },
          validation: validateScene(scene),
          sources: includeSources ? Object.fromEntries(scene.parts.map((item) => [item.filePath, partSources[item.filePath] ?? partToSource(item)])) : undefined,
        };
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(scene.name)}.${format === "scene-json" ? "scene" : "project"}.json`;
    const exportPath = await clipperHost.exportMediaFile(defaultFileName, content);

    if (exportPath) return { kind: "host" as const, path: exportPath };

    fileDownloadService.downloadTextFile(defaultFileName, content);
    return { kind: "download" as const, fileName: defaultFileName };
  }

  prepareRenderedMediaExport({ project, sceneId }: PrepareRenderedMediaInput) {
    const scene = getScene(project, sceneId);
    const timeline = buildLinearTimeline(scene);
    const durationSeconds = timeline.at(-1)?.end ?? 0;
    const totalFrames = Math.max(1, Math.ceil(durationSeconds * videoExportFrameRate));
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(scene.name)}.mp4`;

    return { scene, totalFrames, defaultFileName };
  }

  renderVideoExport(exportId: string, defaultFileName: string, project: ProjectManifest, scene: ProjectManifest["scenes"][number]) {
    return clipperHost.renderVideoExport(exportId, defaultFileName, project, scene, videoExportFrameRate);
  }

  cancelVideoExport(exportId: string) {
    return clipperHost.cancelRenderVideoExport(exportId);
  }
}

function getScene(project: ProjectManifest, sceneId: string) {
  return project.scenes.find((item) => item.id === sceneId) ?? project.scenes[0];
}

function slugifyFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "clipper-export";
}

export function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) return value;
  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
}

export const exportService = new ExportService();
