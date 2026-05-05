import { defaultAssets, getSceneFromProject, serializeProjectForSave } from "../../core/project";
import { buildLinearTimeline, getRenderableScene, sceneDuration, validateScene } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest } from "../../core/types";
import type { ExportRenderQuality, ExportWorkerResolutionMapping, MediaExportFormat, ProjectExportFormat } from "../types";
import { videoExportFrameRate } from "../config";
import { clipperHost } from "../clipperHost";
import { fileDownloadService } from "./fileDownloadService";
import { getDisplayNameFromPath } from "../../core/fileNames";
import { deriveFramePreviewRenderModel, getFramePreviewTimelineLayers } from "../state/framePreviewRenderModel";

type ExportProjectInput = {
  project: ProjectManifest;
  sceneId: string;
  format: ProjectExportFormat;
  includeSources: boolean;
  compositionSources: Record<string, string>;
};

type PrepareRenderedMediaInput = {
  project: ProjectManifest;
  sceneId: string;
  frameRate?: number;
};

export const MEDIA_EXPORT_FORMAT_LABELS: Record<MediaExportFormat, string> = {
  "prores-422-hq": "ProRes 422 HQ",
  "prores-4444": "ProRes 4444",
  "dnxhr-hqx": "DNxHR HQX",
  mov: "MOV Uncompressed",
  "h264-high": "H.264 High Quality",
  mp4: "MP4",
  webm: "WebM",
};

export const MEDIA_EXPORT_FORMAT_OPTIONS: { label: string; value: MediaExportFormat }[] = [
  { label: "MOV ProRes 422 HQ", value: "prores-422-hq" },
  { label: "MOV ProRes 4444", value: "prores-4444" },
  { label: "MOV DNxHR HQX", value: "dnxhr-hqx" },
  { label: "MOV Uncompressed BGRA", value: "mov" },
  { label: "MP4 H.264 High Quality", value: "h264-high" },
  { label: "MP4 (H.264)", value: "mp4" },
  { label: "WebM (VP9)", value: "webm" },
];

export function getMediaExportFileExtension(format: MediaExportFormat): string {
  if (format === "prores-422-hq" || format === "prores-4444" || format === "dnxhr-hqx" || format === "mov") return ".mov";
  return format === "webm" ? ".webm" : ".mp4";
}

class ExportService {
  async exportProject({ project, sceneId, format, includeSources, compositionSources }: ExportProjectInput) {
    const exportProject = serializeProjectForSave(project);
    const scene = getRenderableScene(getScene(exportProject, sceneId), exportProject.editorState?.timelineLayers);
    const timeline = buildLinearTimeline(scene);
    const payload = format === "scene-json"
      ? scene
      : {
          kind: "clipper-project-package",
          version: project.id,
          exportedAt: new Date().toISOString(),
          project: exportProject,
          scene,
          media: {
            resolution: project.resolution,
            durationSeconds: sceneDuration(scene),
            compositions: timeline.map((item) => ({ id: item.id, name: getDisplayNameFromPath(item.filePath), filePath: item.filePath, start: item.start, end: item.end, duration: item.duration })),
            assetsPath: project.assetsPath,
            assets: project.assets ?? defaultAssets,
          },
          validation: validateScene(scene),
          sources: includeSources ? Object.fromEntries(scene.compositions.flatMap((item) => item.sourceMissing ? [] : [[item.filePath, getCompositionSource(item, compositionSources)]])) : undefined,
        };
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const sceneName = getDisplayNameFromPath(scene.id);
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(sceneName)}.${format === "scene-json" ? "scene" : "project"}.json`;
    const exportPath = await clipperHost.exportMediaFile(defaultFileName, content);

    if (exportPath) return { kind: "host" as const, path: exportPath };

    fileDownloadService.downloadTextFile(defaultFileName, content);
    return { kind: "download" as const, fileName: defaultFileName };
  }

  prepareRenderedMediaExport({ project, sceneId, frameRate, mediaExportFormat }: PrepareRenderedMediaInput & { mediaExportFormat?: MediaExportFormat }) {
    const _frameRate = frameRate ?? videoExportFrameRate;
    const _format = mediaExportFormat ?? "prores-422-hq";
    const exportProject = serializeProjectForSave(project);
    const scene = getRenderedMediaScene(exportProject, sceneId);
    const durationSeconds = getRenderedMediaSceneDuration(exportProject, scene, _frameRate);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Unable to render media because the selected timeline has invalid timing data.");
    }
    const totalFrames = Math.max(1, Math.ceil(durationSeconds * _frameRate));
    const sceneName = getDisplayNameFromPath(scene.id);
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(sceneName)}${getMediaExportFileExtension(_format)}`;

    return { scene, durationSeconds, totalFrames, defaultFileName };
  }

  renderVideoExport(exportId: string, defaultFileName: string, project: ProjectManifest, manifestPath: string, scene: ProjectManifest["scenes"][number], durationSeconds: number, tileHeight: number, reusePrerenderCache: boolean, frameRate?: number, exportResolution?: { width: number; height: number }, mediaExportFormat?: MediaExportFormat, exportRenderQuality?: ExportRenderQuality, exportWorkerMapping?: ExportWorkerResolutionMapping) {
    const _frameRate = frameRate ?? videoExportFrameRate;
    const _resolution = exportResolution ?? project.resolution;
    const _format = mediaExportFormat ?? "prores-422-hq";
    const exportProject = serializeProjectForSave(project);
    return clipperHost.renderVideoExport(exportId, defaultFileName, exportProject, manifestPath, scene, _frameRate, durationSeconds, tileHeight, reusePrerenderCache, _resolution.width, _resolution.height, _format, exportRenderQuality ?? "high", exportWorkerMapping);
  }

  cancelVideoExport(exportId: string) {
    return clipperHost.cancelRenderVideoExport(exportId);
  }
}

function getScene(project: ProjectManifest, sceneId: string) {
  return project.scenes.find((item) => item.id === sceneId) ?? project.scenes[0];
}

function getRenderedMediaScene(project: ProjectManifest, sceneId: string) {
  return getSceneFromProject(project, sceneId) ?? getScene(project, sceneId);
}

function getCompositionSource(composition: CompositionClip, compositionSources: Record<string, string>) {
  const source = compositionSources[composition.filePath] ?? composition.source;
  if (source === undefined) throw new Error(`Composition ${composition.filePath} is missing source.`);
  return source;
}

function getRenderedMediaSceneDuration(project: ProjectManifest, scene: ProjectManifest["scenes"][number], frameRate: number) {
  return deriveFramePreviewRenderModel({
    blankPart: blankRenderedMediaComposition,
    frameRate,
    scene,
    sceneTime: 0,
    timelineLayers: getFramePreviewTimelineLayers(project, scene.id),
    timelineMode: "composition",
  }).sceneDurationSeconds;
}

const blankRenderedMediaComposition: CompositionClip = {
  id: "__blank_rendered_media_export__",
  filePath: "",
  duration: 1,
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function slugifyFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "clipper-export";
}

export function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) return value;
  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
}

export const exportService = new ExportService();
