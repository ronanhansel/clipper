import { Toaster } from "react-hot-toast";
import { AppContextMenu } from "../../components/AppContextMenu";
import { ExportMediaDialog, VideoExportOverlay } from "../../components/export/ExportMediaDialog";
import { SettingsDialog } from "../../components/SettingsDialog";
import type { ProjectManifest } from "../../core/types";
import type { ContextMenuState, ExportDialogTab, ExportRenderQuality, ExportWorkerResolutionMapping, MediaExportFormat, ProjectExportFormat, SettingsSection, VideoExportProgress } from "../types";

type AppDialogsProps = {
  appContextMenu: ContextMenuState | null;
  debugSettingsEnabled: boolean;
  defaultNewMarkerDurationSeconds: number;
  exportDialogOpen: boolean;
  exportDialogTab: ExportDialogTab;
  exportFrameRate: number;
  exportIncludeSources: boolean;
  exportProgress: string | null;
  exportRenderQuality: ExportRenderQuality;
  exportResolution: { width: number; height: number };
  exportWorkerMapping: ExportWorkerResolutionMapping;
  isExporting: boolean;
  liveDomPostProcessPreviewEnabled: boolean;
  liveDomPostProcessRuntimeEnabled: boolean;
  liveDomPostProcessMaxFps: number;
  mediaExportFormat: MediaExportFormat;
  pausePlaybackOnScrub: boolean;
  partCount: number;
  prerenderCacheEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  prerenderBlockDurationMs: number;
  projectExportFormat: ProjectExportFormat;
  projectName: string;
  resolution: ProjectManifest["resolution"];
  reusePrerenderCacheForExport: boolean;
  sceneDurationSeconds: number;
  sceneName: string;
  scrubCommitThrottleMs: number;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  timelineEndPaddingFraction: number;
  timelinePrecision: number; // v-- add here
  videoExportCancelling: boolean;
  videoExportTileHeight: number;
  videoExportProgress: VideoExportProgress | null;
  onAppContextMenuClose: () => void;
  onDebugSettingsEnabledChange: (enabled: boolean) => void;
  onDefaultNewMarkerDurationSecondsChange: (value: number) => void;
  onExportDialogOpenChange: (open: boolean) => void;
  onExportDialogTabChange: (tab: ExportDialogTab) => void;
  onExportFrameRateChange: (fps: number) => void;
  onExportIncludeSourcesChange: (includeSources: boolean) => void;
  onExportRenderQualityChange: (quality: ExportRenderQuality) => void;
  onExportResolutionChange: (res: { width: number; height: number }) => void;
  onExportWorkerMappingChange: (mapping: ExportWorkerResolutionMapping) => void;
  onMediaExport: () => void;
  onMediaExportFormatChange: (format: MediaExportFormat) => void;
  onLiveDomPostProcessPreviewEnabledChange: (enabled: boolean) => void;
  onLiveDomPostProcessMaxFpsChange: (value: number) => void;
  onProjectExport: () => void;
  onPausePlaybackOnScrubChange: (enabled: boolean) => void;
  onPrerenderCacheEnabledChange: (enabled: boolean) => void;
  onPrerenderCacheBlackMissDebugChange: (enabled: boolean) => void;
  onPrerenderBlockDurationMsChange: (value: number) => void;
  onClearAllPrerenderCaches: () => void;
  onProjectExportFormatChange: (format: ProjectExportFormat) => void;
  onReusePrerenderCacheForExportChange: (reuse: boolean) => void;
  onScrubCommitThrottleMsChange: (value: number) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSettingsSectionChange: (section: SettingsSection) => void;
  onTimelineEndPaddingFractionChange: (value: number) => void;
  onTimelinePrecisionChange: (value: number) => void;
  onVideoExportTileHeightChange: (value: number) => void;
  onVideoExportCancel: () => void;
};

export function AppDialogs({ appContextMenu, debugSettingsEnabled, defaultNewMarkerDurationSeconds, exportDialogOpen, exportDialogTab, exportFrameRate, exportIncludeSources, exportProgress, exportRenderQuality, exportResolution, exportWorkerMapping, isExporting, liveDomPostProcessPreviewEnabled, liveDomPostProcessRuntimeEnabled, liveDomPostProcessMaxFps, mediaExportFormat, pausePlaybackOnScrub, partCount, prerenderCacheEnabled, prerenderCacheBlackMissDebug, prerenderBlockDurationMs, projectExportFormat, projectName, resolution, sceneDurationSeconds, sceneName, scrubCommitThrottleMs, settingsOpen, settingsSection, timelineEndPaddingFraction, timelinePrecision, videoExportCancelling, videoExportTileHeight, videoExportProgress, onAppContextMenuClose, onDebugSettingsEnabledChange, onDefaultNewMarkerDurationSecondsChange, onExportDialogOpenChange, onExportDialogTabChange, onExportFrameRateChange, onExportIncludeSourcesChange, onExportRenderQualityChange, onExportResolutionChange, onExportWorkerMappingChange, onMediaExport, onMediaExportFormatChange, onLiveDomPostProcessPreviewEnabledChange, onLiveDomPostProcessMaxFpsChange, onProjectExport, onPausePlaybackOnScrubChange, onPrerenderCacheEnabledChange, onPrerenderCacheBlackMissDebugChange, onPrerenderBlockDurationMsChange, onClearAllPrerenderCaches, onProjectExportFormatChange, onScrubCommitThrottleMsChange, onSettingsOpenChange, onSettingsSectionChange, onTimelineEndPaddingFractionChange, onTimelinePrecisionChange, onVideoExportTileHeightChange, onVideoExportCancel }: AppDialogsProps) {
  return (
    <>
      <ExportMediaDialog
        activeTab={exportDialogTab}
        durationSeconds={sceneDurationSeconds}
        exportFrameRate={exportFrameRate}
        exportRenderQuality={exportRenderQuality}
        exportResolution={exportResolution}
        includeSources={exportIncludeSources}
        mediaExportFormat={mediaExportFormat}
        open={exportDialogOpen}
        partCount={partCount}
        progress={exportProgress}
        projectFormat={projectExportFormat}
        projectName={projectName}
        resolution={resolution}
        sceneName={sceneName}
        exporting={isExporting}
        onExportFrameRateChange={onExportFrameRateChange}
        onExportRenderQualityChange={onExportRenderQualityChange}
        onExportResolutionChange={onExportResolutionChange}
        onMediaExportFormatChange={onMediaExportFormatChange}
        onProjectExport={onProjectExport}
        onMediaExport={onMediaExport}
        onProjectFormatChange={onProjectExportFormatChange}
        onIncludeSourcesChange={onExportIncludeSourcesChange}
        onOpenChange={onExportDialogOpenChange}
        onTabChange={onExportDialogTabChange}
      />
      <SettingsDialog
        activeSection={settingsSection}
        debugSettingsEnabled={debugSettingsEnabled}
        liveDomPostProcessPreviewEnabled={liveDomPostProcessPreviewEnabled}
        liveDomPostProcessRuntimeEnabled={liveDomPostProcessRuntimeEnabled}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        open={settingsOpen}
        pausePlaybackOnScrub={pausePlaybackOnScrub}
        prerenderCacheBlackMissDebug={prerenderCacheBlackMissDebug}
        prerenderCacheEnabled={prerenderCacheEnabled}
        prerenderBlockDurationMs={prerenderBlockDurationMs}
        scrubCommitThrottleMs={scrubCommitThrottleMs}
        defaultNewMarkerDurationSeconds={defaultNewMarkerDurationSeconds}
        timelineEndPaddingFraction={timelineEndPaddingFraction}
        timelinePrecision={timelinePrecision}
        videoExportTileHeight={videoExportTileHeight}
        exportWorkerMapping={exportWorkerMapping}
        onActiveSectionChange={onSettingsSectionChange}
        onDebugSettingsEnabledChange={onDebugSettingsEnabledChange}
        onLiveDomPostProcessPreviewEnabledChange={onLiveDomPostProcessPreviewEnabledChange}
        onLiveDomPostProcessMaxFpsChange={onLiveDomPostProcessMaxFpsChange}
        onOpenChange={onSettingsOpenChange}
        onPausePlaybackOnScrubChange={onPausePlaybackOnScrubChange}
        onPrerenderCacheBlackMissDebugChange={onPrerenderCacheBlackMissDebugChange}
        onPrerenderCacheEnabledChange={onPrerenderCacheEnabledChange}
        onPrerenderBlockDurationMsChange={onPrerenderBlockDurationMsChange}
        onClearAllPrerenderCaches={onClearAllPrerenderCaches}
        onScrubCommitThrottleMsChange={onScrubCommitThrottleMsChange}
        onDefaultNewMarkerDurationSecondsChange={onDefaultNewMarkerDurationSecondsChange}
        onTimelineEndPaddingFractionChange={onTimelineEndPaddingFractionChange}
        onTimelinePrecisionChange={onTimelinePrecisionChange}
        onVideoExportTileHeightChange={onVideoExportTileHeightChange}
        onExportWorkerMappingChange={onExportWorkerMappingChange}
      />
      {videoExportProgress ? <VideoExportOverlay cancelling={videoExportCancelling} progress={videoExportProgress} onCancel={onVideoExportCancel} /> : null}
      <AppContextMenu menu={appContextMenu} onClose={onAppContextMenuClose} />
      <Toaster
        position="bottom-left"
        toastOptions={{
          duration: 2800,
          style: {
            background: "#11141a",
            border: "1px solid #2d313b",
            borderRadius: "14px",
            boxShadow: "0 18px 60px rgba(0,0,0,0.42)",
            color: "#f7f7f8",
            fontSize: "13px",
            fontWeight: 700,
            maxWidth: "min(calc(100vw - 32px), 700px)",
          },
          error: {
            iconTheme: { primary: "#ff6b6b", secondary: "#1a0f10" },
            style: { border: "1px solid #5c2a2d", color: "#ffb4b4" },
          },
        }}
      />
    </>
  );
}
