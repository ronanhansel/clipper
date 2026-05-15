import { useEffect, useRef, type MutableRefObject } from "react";
import { exportService } from "../../services/exportService";
import type {
  ExportRenderQuality,
  ExportTileResolutionMapping,
  ExportWorkerResolutionMapping,
  MediaExportFormat,
  MediaExportRenderMode,
  StableSlowGridPreset,
  StableSlowValidationSamples,
  VideoExportProgress,
} from "../../types";
import type { ProjectManifest } from "../../../core/types";
import { subscribeHostShortcut } from "../shortcuts/useGlobalEditorShortcuts";

type UseExportCommandsInput = {
  projectRef: MutableRefObject<ProjectManifest>;
  manifestPath: string;
  selectedSceneId: string;
  exportFrameRate: number;
  exportRenderQuality: ExportRenderQuality;
  exportResolution: { width: number; height: number };
  mediaExportRenderMode: MediaExportRenderMode;
  stableSlowGridPreset: StableSlowGridPreset;
  stableSlowValidationSamples: StableSlowValidationSamples;
  exportTileMapping: ExportTileResolutionMapping;
  exportWorkerMapping: ExportWorkerResolutionMapping;
  mediaExportFormat: MediaExportFormat;
  reusePrerenderCacheForExport: boolean;
  videoExportTileHeight: number;
  saveAllChanges: () => Promise<void>;
  setExportDialogOpen: (open: boolean) => void;
  setExportProgress: (progress: string | null) => void;
  setIsExporting: (exporting: boolean) => void;
  setVideoExportCancelling: (cancelling: boolean) => void;
  setVideoExportProgress: (progress: VideoExportProgress | null) => void;
  notifyRenderedMedia: (path: string) => void;
  notifyError: (message: string) => void;
};

export function useExportCommands({
  projectRef,
  manifestPath,
  selectedSceneId,
  exportFrameRate,
  exportRenderQuality,
  exportResolution,
  mediaExportRenderMode,
  stableSlowGridPreset,
  stableSlowValidationSamples,
  exportTileMapping,
  exportWorkerMapping,
  mediaExportFormat,
  reusePrerenderCacheForExport,
  videoExportTileHeight,
  saveAllChanges,
  setExportDialogOpen,
  setExportProgress,
  setIsExporting,
  setVideoExportCancelling,
  setVideoExportProgress,
  notifyRenderedMedia,
  notifyError,
}: UseExportCommandsInput) {
  const videoExportIdRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeHostShortcut(
      window.clipper?.onVideoExportProgress,
      (exportId: string, progress: VideoExportProgress) => {
        if (videoExportIdRef.current !== exportId) return;
        setVideoExportProgress(progress);
      },
    );
  }, [setVideoExportProgress]);

  async function exportRenderedMedia() {
    setIsExporting(true);
    setExportProgress(null);
    setVideoExportCancelling(false);
    const exportId = crypto.randomUUID();
    videoExportIdRef.current = exportId;

    try {
      await saveAllChanges();
      const currentProject = projectRef.current;
      const {
        scene: currentScene,
        durationSeconds,
        totalFrames,
        defaultFileName,
      } = exportService.prepareRenderedMediaExport({
        project: currentProject,
        sceneId: selectedSceneId,
        frameRate: exportFrameRate,
        mediaExportFormat,
      });
      setExportDialogOpen(false);
      setExportProgress(`Rendering ${totalFrames} frames`);
      setVideoExportProgress({
        frame: 0,
        totalFrames,
        percent: 0,
        status: "Preparing export...",
      });
      const exportPath = await exportService.renderVideoExport(
        exportId,
        defaultFileName,
        currentProject,
        manifestPath,
        currentScene,
        durationSeconds,
        videoExportTileHeight,
        reusePrerenderCacheForExport,
        exportFrameRate,
        exportResolution,
        mediaExportFormat,
        exportRenderQuality,
        exportWorkerMapping,
        exportTileMapping,
        mediaExportRenderMode,
        stableSlowGridPreset,
        stableSlowValidationSamples,
      );
      if (!exportPath) return;
      notifyRenderedMedia(exportPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to render media.";
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

  return { exportRenderedMedia, stopVideoExport };
}
