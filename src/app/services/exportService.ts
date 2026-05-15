import {
  getSceneFromProject,
  serializeProjectForSave,
} from "../../core/project";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type ProjectManifest,
} from "../../core/types";
import type {
  ExportRenderQuality,
  ExportTileResolutionMapping,
  ExportWorkerResolutionMapping,
  MediaExportFormat,
  MediaExportRenderMode,
  StableSlowGridPreset,
  StableSlowValidationSamples,
} from "../types";
import { videoExportFrameRate } from "../config";
import { clipperHost } from "../clipperHost";
import { getDisplayNameFromPath } from "../../core/fileNames";
import {
  deriveFramePreviewRenderModel,
  getFramePreviewTimelineLayers,
} from "../state/framePreviewRenderModel";

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
  "h264-high": "MP4 H.264 HQ",
  mp4: "MP4 H.264 Fast",
  webm: "WebM",
};

export const MEDIA_EXPORT_FORMAT_OPTIONS: {
  label: string;
  value: MediaExportFormat;
}[] = [
  { label: "MP4 H.264 Fast", value: "mp4" },
  { label: "MP4 H.264 HQ", value: "h264-high" },
  { label: "WebM (VP9)", value: "webm" },
  { label: "MOV ProRes 422 HQ", value: "prores-422-hq" },
  { label: "MOV ProRes 4444", value: "prores-4444" },
  { label: "MOV DNxHR HQX", value: "dnxhr-hqx" },
];

export function getMediaExportFileExtension(format: MediaExportFormat): string {
  if (
    format === "prores-422-hq" ||
    format === "prores-4444" ||
    format === "dnxhr-hqx" ||
    format === "mov"
  )
    return ".mov";
  return format === "webm" ? ".webm" : ".mp4";
}

class ExportService {
  prepareRenderedMediaExport({
    project,
    sceneId,
    frameRate,
    mediaExportFormat,
  }: PrepareRenderedMediaInput & { mediaExportFormat?: MediaExportFormat }) {
    const _frameRate = frameRate ?? videoExportFrameRate;
    const _format = mediaExportFormat ?? "mp4";
    const exportProject = serializeProjectForSave(project);
    const scene = getRenderedMediaScene(exportProject, sceneId);
    const durationSeconds = getRenderedMediaSceneDuration(
      exportProject,
      scene,
      _frameRate,
    );
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(
        "Unable to render media because the selected timeline has invalid timing data.",
      );
    }
    const totalFrames = Math.max(1, Math.ceil(durationSeconds * _frameRate));
    const sceneName = getDisplayNameFromPath(scene.id);
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(sceneName)}${getMediaExportFileExtension(_format)}`;

    return { scene, durationSeconds, totalFrames, defaultFileName };
  }

  renderVideoExport(
    exportId: string,
    defaultFileName: string,
    project: ProjectManifest,
    manifestPath: string,
    scene: ProjectManifest["scenes"][number],
    durationSeconds: number,
    tileHeight: number,
    reusePrerenderCache: boolean,
    frameRate?: number,
    exportResolution?: { width: number; height: number },
    mediaExportFormat?: MediaExportFormat,
    exportRenderQuality?: ExportRenderQuality,
    exportWorkerMapping?: ExportWorkerResolutionMapping,
    exportTileMapping?: ExportTileResolutionMapping,
    exportRenderMode?: MediaExportRenderMode,
    stableSlowGridPreset?: StableSlowGridPreset,
    stableSlowValidationSamples?: StableSlowValidationSamples,
  ) {
    const _frameRate = frameRate ?? videoExportFrameRate;
    const _resolution = exportResolution ?? project.resolution;
    const _format = mediaExportFormat ?? "mp4";
    const exportProject = serializeProjectForSave(project);
    return clipperHost.renderVideoExport(
      exportId,
      defaultFileName,
      exportProject,
      manifestPath,
      scene,
      _frameRate,
      durationSeconds,
      tileHeight,
      reusePrerenderCache,
      _resolution.width,
      _resolution.height,
      _format,
      exportRenderQuality ?? "high",
      exportWorkerMapping,
      exportTileMapping,
      exportRenderMode ?? "renderer",
      stableSlowGridPreset ?? "safe",
      stableSlowValidationSamples ?? 1,
    );
  }

  cancelVideoExport(exportId: string) {
    return clipperHost.cancelRenderVideoExport(exportId);
  }
}

function getScene(project: ProjectManifest, sceneId: string) {
  return (
    project.scenes.find((item) => item.id === sceneId) ?? project.scenes[0]
  );
}

function getRenderedMediaScene(project: ProjectManifest, sceneId: string) {
  return getSceneFromProject(project, sceneId) ?? getScene(project, sceneId);
}

function getRenderedMediaSceneDuration(
  project: ProjectManifest,
  scene: ProjectManifest["scenes"][number],
  frameRate: number,
) {
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
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: {},
  },
  background: {
    id: "background",
    name: "Background",
    style: {},
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

function slugifyFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "clipper-export"
  );
}

export function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) return value;
  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
}

export const exportService = new ExportService();
