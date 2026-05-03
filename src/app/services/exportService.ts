import { defaultAssets, getSceneFromProject, serializeProjectForSave } from "../../core/project";
import { buildLinearTimeline, getRenderableScene, sceneDuration, validateScene } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest } from "../../core/types";
import type { ProjectExportFormat } from "../types";
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
};

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

  prepareRenderedMediaExport({ project, sceneId }: PrepareRenderedMediaInput) {
    const scene = getRenderedMediaScene(project, sceneId);
    const durationSeconds = getRenderedMediaSceneDuration(project, scene);
    const totalFrames = Math.max(1, Math.ceil(durationSeconds * videoExportFrameRate));
    const sceneName = getDisplayNameFromPath(scene.id);
    const defaultFileName = `${slugifyFileName(project.name)}-${slugifyFileName(sceneName)}.mp4`;

    return { scene, durationSeconds, totalFrames, defaultFileName };
  }

  renderVideoExport(exportId: string, defaultFileName: string, project: ProjectManifest, scene: ProjectManifest["scenes"][number], durationSeconds: number, workerCount: number) {
    const exportProject = serializeProjectForSave(project);
    return clipperHost.renderVideoExport(exportId, defaultFileName, exportProject, scene, videoExportFrameRate, durationSeconds, workerCount);
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

function getRenderedMediaSceneDuration(project: ProjectManifest, scene: ProjectManifest["scenes"][number]) {
  return deriveFramePreviewRenderModel({
    blankPart: blankRenderedMediaComposition,
    frameRate: videoExportFrameRate,
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
