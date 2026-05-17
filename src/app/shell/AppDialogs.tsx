import { memo } from "react";
import { Toaster } from "react-hot-toast";
import { AppContextMenu } from "../../components/AppContextMenu";
import {
  ExportMediaDialog,
  VideoExportOverlay,
} from "../../components/export/ExportMediaDialog";
import { SettingsDialog } from "../../components/SettingsDialog";
import type { ProjectManifest } from "../../core/types";
import type { PlaybackFpsOption } from "../state/storedAppSettings";
import type {
  AgentProvider,
  AppUpdateStatus,
  ContextMenuState,
  ExportRenderQuality,
  ExportTileResolutionMapping,
  ExportWorkerConfigurationMode,
  ExportWorkerResolutionMapping,
  MediaExportFormat,
  MediaExportRenderMode,
  SettingsSection,
  StableSlowGridPreset,
  StableSlowValidationSamples,
  VideoExportProgress,
} from "../types";

type AppDialogsProps = {
  appContextMenu: ContextMenuState | null;
  agentProvider: AgentProvider;
  autoDownloadUpdates: boolean;
  debugSettingsEnabled: boolean;
  defaultNewMarkerDurationSeconds: number;
  exportDialogOpen: boolean;
  exportFrameRate: number;
  exportProgress: string | null;
  exportRenderQuality: ExportRenderQuality;
  exportResolution: { width: number; height: number };
  exportTileMapping: ExportTileResolutionMapping;
  exportWorkerConfigurationMode: ExportWorkerConfigurationMode;
  exportWorkerMapping: ExportWorkerResolutionMapping;
  isExporting: boolean;
  liveDomPostProcessMaxFps: number;
  mediaExportFormat: MediaExportFormat;
  mediaExportRenderMode: MediaExportRenderMode;
  stableSlowGridPreset: StableSlowGridPreset;
  stableSlowValidationSamples: StableSlowValidationSamples;
  pausePlaybackOnScrub: boolean;
  partCount: number;
  prerenderCacheEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  prerenderBlockDurationMs: number;
  previewRenderHeight: number;
  playbackFpsOption: PlaybackFpsOption;
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
  updateStatus: AppUpdateStatus;
  onAppContextMenuClose: () => void;
  onAgentProviderChange: (provider: AgentProvider) => void;
  onAutoDownloadUpdatesChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onDebugSettingsEnabledChange: (enabled: boolean) => void;
  onDefaultNewMarkerDurationSecondsChange: (value: number) => void;
  onExportDialogOpenChange: (open: boolean) => void;
  onExportFrameRateChange: (fps: number) => void;
  onExportRenderQualityChange: (quality: ExportRenderQuality) => void;
  onExportResolutionChange: (res: { width: number; height: number }) => void;
  onExportTileMappingChange: (mapping: ExportTileResolutionMapping) => void;
  onExportWorkerConfigurationModeChange: (
    mode: ExportWorkerConfigurationMode,
  ) => void;
  onExportWorkerMappingChange: (mapping: ExportWorkerResolutionMapping) => void;
  onMediaExport: () => void;
  onMediaExportFormatChange: (format: MediaExportFormat) => void;
  onMediaExportRenderModeChange: (mode: MediaExportRenderMode) => void;
  onStableSlowGridPresetChange: (preset: StableSlowGridPreset) => void;
  onStableSlowValidationSamplesChange: (
    samples: StableSlowValidationSamples,
  ) => void;
  onLiveDomPostProcessMaxFpsChange: (value: number) => void;
  onPausePlaybackOnScrubChange: (enabled: boolean) => void;
  onPrerenderCacheEnabledChange: (enabled: boolean) => void;
  onPrerenderCacheBlackMissDebugChange: (enabled: boolean) => void;
  onPrerenderBlockDurationMsChange: (value: number) => void;
  onPreviewRenderHeightChange: (value: number) => void;
  onPlaybackFpsOptionChange: (value: PlaybackFpsOption) => void;
  onClearAllPrerenderCaches: () => void;
  onReusePrerenderCacheForExportChange: (reuse: boolean) => void;
  onScrubCommitThrottleMsChange: (value: number) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSettingsSectionChange: (section: SettingsSection) => void;
  onTimelineEndPaddingFractionChange: (value: number) => void;
  onTimelinePrecisionChange: (value: number) => void;
  onVideoExportTileHeightChange: (value: number) => void;
  onVideoExportCancel: () => void;
  onInstallUpdate: () => void;
};

export const AppDialogs = memo(function AppDialogs({
  appContextMenu,
  agentProvider,
  autoDownloadUpdates,
  debugSettingsEnabled,
  defaultNewMarkerDurationSeconds,
  exportDialogOpen,
  exportFrameRate,
  exportProgress,
  exportRenderQuality,
  exportResolution,
  exportTileMapping,
  exportWorkerConfigurationMode,
  exportWorkerMapping,
  isExporting,
  liveDomPostProcessMaxFps,
  mediaExportFormat,
  mediaExportRenderMode,
  stableSlowGridPreset,
  stableSlowValidationSamples,
  pausePlaybackOnScrub,
  partCount,
  prerenderCacheEnabled,
  prerenderCacheBlackMissDebug,
  prerenderBlockDurationMs,
  previewRenderHeight,
  playbackFpsOption,
  projectName,
  resolution,
  sceneDurationSeconds,
  sceneName,
  scrubCommitThrottleMs,
  settingsOpen,
  settingsSection,
  timelineEndPaddingFraction,
  timelinePrecision,
  videoExportCancelling,
  videoExportTileHeight,
  videoExportProgress,
  updateStatus,
  onAppContextMenuClose,
  onAgentProviderChange,
  onAutoDownloadUpdatesChange,
  onCheckForUpdates,
  onDownloadUpdate,
  onDebugSettingsEnabledChange,
  onDefaultNewMarkerDurationSecondsChange,
  onExportDialogOpenChange,
  onExportFrameRateChange,
  onExportRenderQualityChange,
  onExportResolutionChange,
  onExportTileMappingChange,
  onExportWorkerConfigurationModeChange,
  onExportWorkerMappingChange,
  onMediaExport,
  onMediaExportFormatChange,
  onMediaExportRenderModeChange,
  onStableSlowGridPresetChange,
  onStableSlowValidationSamplesChange,
  onLiveDomPostProcessMaxFpsChange,
  onPausePlaybackOnScrubChange,
  onPrerenderCacheEnabledChange,
  onPrerenderCacheBlackMissDebugChange,
  onPrerenderBlockDurationMsChange,
  onPreviewRenderHeightChange,
  onPlaybackFpsOptionChange,
  onClearAllPrerenderCaches,
  onScrubCommitThrottleMsChange,
  onSettingsOpenChange,
  onSettingsSectionChange,
  onTimelineEndPaddingFractionChange,
  onTimelinePrecisionChange,
  onVideoExportTileHeightChange,
  onVideoExportCancel,
  onInstallUpdate,
}: AppDialogsProps) {
  return (
    <>
      <ExportMediaDialog
        open={exportDialogOpen}
        onOpenChange={onExportDialogOpenChange}
        projectName={projectName}
        sceneName={sceneName}
        durationSeconds={sceneDurationSeconds}
        resolution={resolution}
        exportResolution={exportResolution}
        onExportResolutionChange={onExportResolutionChange}
        exportFrameRate={exportFrameRate}
        onExportFrameRateChange={onExportFrameRateChange}
        exportRenderQuality={exportRenderQuality}
        onExportRenderQualityChange={onExportRenderQualityChange}
        mediaExportFormat={mediaExportFormat}
        onMediaExportFormatChange={onMediaExportFormatChange}
        mediaExportRenderMode={mediaExportRenderMode}
        onMediaExportRenderModeChange={onMediaExportRenderModeChange}
        exporting={isExporting}
        progress={exportProgress}
        onExport={onMediaExport}
      />
      <SettingsDialog
        activeSection={settingsSection}
        agentProvider={agentProvider}
        autoDownloadUpdates={autoDownloadUpdates}
        debugSettingsEnabled={debugSettingsEnabled}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        open={settingsOpen}
        pausePlaybackOnScrub={pausePlaybackOnScrub}
        prerenderCacheBlackMissDebug={prerenderCacheBlackMissDebug}
        prerenderCacheEnabled={prerenderCacheEnabled}
        prerenderBlockDurationMs={prerenderBlockDurationMs}
        previewRenderHeight={previewRenderHeight}
        playbackFpsOption={playbackFpsOption}
        scrubCommitThrottleMs={scrubCommitThrottleMs}
        defaultNewMarkerDurationSeconds={defaultNewMarkerDurationSeconds}
        timelineEndPaddingFraction={timelineEndPaddingFraction}
        timelinePrecision={timelinePrecision}
        videoExportTileHeight={videoExportTileHeight}
        exportTileMapping={exportTileMapping}
        exportWorkerConfigurationMode={exportWorkerConfigurationMode}
        exportWorkerMapping={exportWorkerMapping}
        stableSlowGridPreset={stableSlowGridPreset}
        stableSlowValidationSamples={stableSlowValidationSamples}
        updateStatus={updateStatus}
        onActiveSectionChange={onSettingsSectionChange}
        onAgentProviderChange={onAgentProviderChange}
        onAutoDownloadUpdatesChange={onAutoDownloadUpdatesChange}
        onCheckForUpdates={onCheckForUpdates}
        onDownloadUpdate={onDownloadUpdate}
        onDebugSettingsEnabledChange={onDebugSettingsEnabledChange}
        onLiveDomPostProcessMaxFpsChange={onLiveDomPostProcessMaxFpsChange}
        onOpenChange={onSettingsOpenChange}
        onPausePlaybackOnScrubChange={onPausePlaybackOnScrubChange}
        onPrerenderCacheBlackMissDebugChange={
          onPrerenderCacheBlackMissDebugChange
        }
        onPrerenderCacheEnabledChange={onPrerenderCacheEnabledChange}
        onPrerenderBlockDurationMsChange={onPrerenderBlockDurationMsChange}
        onPreviewRenderHeightChange={onPreviewRenderHeightChange}
        onPlaybackFpsOptionChange={onPlaybackFpsOptionChange}
        onClearAllPrerenderCaches={onClearAllPrerenderCaches}
        onScrubCommitThrottleMsChange={onScrubCommitThrottleMsChange}
        onDefaultNewMarkerDurationSecondsChange={
          onDefaultNewMarkerDurationSecondsChange
        }
        onTimelineEndPaddingFractionChange={onTimelineEndPaddingFractionChange}
        onTimelinePrecisionChange={onTimelinePrecisionChange}
        onVideoExportTileHeightChange={onVideoExportTileHeightChange}
        onExportTileMappingChange={onExportTileMappingChange}
        onExportWorkerConfigurationModeChange={
          onExportWorkerConfigurationModeChange
        }
        onExportWorkerMappingChange={onExportWorkerMappingChange}
        onStableSlowGridPresetChange={onStableSlowGridPresetChange}
        onStableSlowValidationSamplesChange={
          onStableSlowValidationSamplesChange
        }
        onInstallUpdate={onInstallUpdate}
      />
      {videoExportProgress ? (
        <VideoExportOverlay
          isCancelling={videoExportCancelling}
          progress={videoExportProgress}
          onCancel={onVideoExportCancel}
        />
      ) : null}
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
});
