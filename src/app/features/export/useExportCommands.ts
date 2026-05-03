import { useEffect, useRef, type MutableRefObject } from "react";
import { exportService } from "../../services/exportService";
import type { ProjectExportFormat, VideoExportProgress } from "../../types";
import type { ProjectManifest } from "../../../core/types";

type UseExportCommandsInput = {
  projectRef: MutableRefObject<ProjectManifest>;
  selectedSceneId: string;
  projectExportFormat: ProjectExportFormat;
  renderedVideoExportWorkerCount: number;
  exportIncludeSources: boolean;
  compositionSources: Record<string, string>;
  saveAllChanges: () => Promise<void>;
  setExportDialogOpen: (open: boolean) => void;
  setExportProgress: (progress: string | null) => void;
  setIsExporting: (exporting: boolean) => void;
  setVideoExportCancelling: (cancelling: boolean) => void;
  setVideoExportProgress: (progress: VideoExportProgress | null) => void;
  notifyProjectExported: (path: string) => void;
  notifyProjectDownloaded: () => void;
  notifyRenderedMedia: (path: string) => void;
  notifyError: (message: string) => void;
};

export function useExportCommands({
  projectRef,
  selectedSceneId,
  projectExportFormat,
  renderedVideoExportWorkerCount,
  exportIncludeSources,
  compositionSources,
  saveAllChanges,
  setExportDialogOpen,
  setExportProgress,
  setIsExporting,
  setVideoExportCancelling,
  setVideoExportProgress,
  notifyProjectExported,
  notifyProjectDownloaded,
  notifyRenderedMedia,
  notifyError,
}: UseExportCommandsInput) {
  const videoExportIdRef = useRef<string | null>(null);

  useEffect(() => {
    return window.clipper?.onVideoExportProgress?.((exportId, progress) => {
      if (videoExportIdRef.current !== exportId) return;
      setVideoExportProgress(progress);
    });
  }, [setVideoExportProgress]);

  async function exportProject() {
    setIsExporting(true);

    try {
      await saveAllChanges();
      const result = await exportService.exportProject({
        project: projectRef.current,
        sceneId: selectedSceneId,
        format: projectExportFormat,
        includeSources: exportIncludeSources,
        compositionSources,
      });

      if (result.kind === "host") notifyProjectExported(result.path);
      else notifyProjectDownloaded();

      setExportDialogOpen(false);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Unable to export project.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportRenderedMedia() {
    setIsExporting(true);
    setExportProgress(null);
    setVideoExportCancelling(false);
    const exportId = crypto.randomUUID();
    videoExportIdRef.current = exportId;

    try {
      await saveAllChanges();
      const currentProject = projectRef.current;
      const { scene: currentScene, durationSeconds, totalFrames, defaultFileName } = exportService.prepareRenderedMediaExport({ project: currentProject, sceneId: selectedSceneId });
      setExportDialogOpen(false);
      setExportProgress(`Rendering ${totalFrames} frames`);
      setVideoExportProgress({ frame: 0, totalFrames, percent: 0, status: "Preparing export..." });
      const exportPath = await exportService.renderVideoExport(exportId, defaultFileName, currentProject, currentScene, durationSeconds, renderedVideoExportWorkerCount);
      if (!exportPath) return;
      notifyRenderedMedia(exportPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to render media.";
      if (!message.includes("Video export cancelled.")) notifyError(message);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setVideoExportProgress(null);
      setVideoExportCancelling(false);
      videoExportIdRef.current = null;
    }
  }

  async function stopVideoExport() {
    const exportId = videoExportIdRef.current;
    if (!exportId) return;
    setVideoExportCancelling(true);
    await exportService.cancelVideoExport(exportId);
  }

  return { exportProject, exportRenderedMedia, stopVideoExport };
}
