import { Toaster } from "react-hot-toast";
import { AppContextMenu } from "../../components/AppContextMenu";
import { ExportMediaDialog, VideoExportOverlay } from "../../components/export/ExportMediaDialog";
import { SettingsDialog } from "../../components/SettingsDialog";
import type { ProjectManifest } from "../../core/types";
import type { ContextMenuState, ExportDialogTab, ProjectExportFormat, SettingsSection, VideoExportProgress } from "../types";

type AppDialogsProps = {
  appContextMenu: ContextMenuState | null;
  defaultNewMarkerDurationSeconds: number;
  exportDialogOpen: boolean;
  exportDialogTab: ExportDialogTab;
  exportIncludeSources: boolean;
  exportProgress: string | null;
  isExporting: boolean;
  partCount: number;
  projectExportFormat: ProjectExportFormat;
  projectName: string;
  resolution: ProjectManifest["resolution"];
  rasterPreviewEnabled: boolean;
  sceneDurationSeconds: number;
  sceneName: string;
  scrubCommitThrottleMs: number;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  timelineEndPaddingFraction: number;
  timelinePrecision: number; // v-- add here
  validationErrorCount: number;
  videoExportCancelling: boolean;
  videoExportProgress: VideoExportProgress | null;
  onAppContextMenuClose: () => void;
  onDefaultNewMarkerDurationSecondsChange: (value: number) => void;
  onExportDialogOpenChange: (open: boolean) => void;
  onExportDialogTabChange: (tab: ExportDialogTab) => void;
  onExportIncludeSourcesChange: (includeSources: boolean) => void;
  onMediaExport: () => void;
  onProjectExport: () => void;
  onProjectExportFormatChange: (format: ProjectExportFormat) => void;
  onRasterPreviewEnabledChange: (enabled: boolean) => void;
  onScrubCommitThrottleMsChange: (value: number) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSettingsSectionChange: (section: SettingsSection) => void;
  onTimelineEndPaddingFractionChange: (value: number) => void;
  onTimelinePrecisionChange: (value: number) => void;
  onVideoExportCancel: () => void;
};

export function AppDialogs({ appContextMenu, defaultNewMarkerDurationSeconds, exportDialogOpen, exportDialogTab, exportIncludeSources, exportProgress, isExporting, partCount, projectExportFormat, projectName, resolution, rasterPreviewEnabled, sceneDurationSeconds, sceneName, scrubCommitThrottleMs, settingsOpen, settingsSection, timelineEndPaddingFraction, timelinePrecision, validationErrorCount, videoExportCancelling, videoExportProgress, onAppContextMenuClose, onDefaultNewMarkerDurationSecondsChange, onExportDialogOpenChange, onExportDialogTabChange, onExportIncludeSourcesChange, onMediaExport, onProjectExport, onProjectExportFormatChange, onRasterPreviewEnabledChange, onScrubCommitThrottleMsChange, onSettingsOpenChange, onSettingsSectionChange, onTimelineEndPaddingFractionChange, onTimelinePrecisionChange, onVideoExportCancel }: AppDialogsProps) {
  return (
    <>
      <ExportMediaDialog
        activeTab={exportDialogTab}
        durationSeconds={sceneDurationSeconds}
        includeSources={exportIncludeSources}
        open={exportDialogOpen}
        partCount={partCount}
        progress={exportProgress}
        projectFormat={projectExportFormat}
        projectName={projectName}
        resolution={resolution}
        sceneName={sceneName}
        validationErrorCount={validationErrorCount}
        exporting={isExporting}
        onProjectExport={onProjectExport}
        onMediaExport={onMediaExport}
        onProjectFormatChange={onProjectExportFormatChange}
        onIncludeSourcesChange={onExportIncludeSourcesChange}
        onOpenChange={onExportDialogOpenChange}
        onTabChange={onExportDialogTabChange}
      />
      <SettingsDialog
        activeSection={settingsSection}
        open={settingsOpen}
        rasterPreviewEnabled={rasterPreviewEnabled}
        scrubCommitThrottleMs={scrubCommitThrottleMs}
        defaultNewMarkerDurationSeconds={defaultNewMarkerDurationSeconds}
        timelineEndPaddingFraction={timelineEndPaddingFraction}
        timelinePrecision={timelinePrecision}
        onActiveSectionChange={onSettingsSectionChange}
        onOpenChange={onSettingsOpenChange}
        onRasterPreviewEnabledChange={onRasterPreviewEnabledChange}
        onScrubCommitThrottleMsChange={onScrubCommitThrottleMsChange}
        onDefaultNewMarkerDurationSecondsChange={onDefaultNewMarkerDurationSecondsChange}
        onTimelineEndPaddingFractionChange={onTimelineEndPaddingFractionChange}
        onTimelinePrecisionChange={onTimelinePrecisionChange}
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
