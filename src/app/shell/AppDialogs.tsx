import { memo } from "react";
import { Toaster } from "react-hot-toast";
import { AppContextMenu } from "../../components/AppContextMenu";
import {
  ExportMediaDialog,
  VideoExportOverlay,
} from "../../components/export/ExportMediaDialog";
import { SettingsDialog } from "../../components/SettingsDialog";
import { useAppSettingsStore } from "../../app/state/appSettingsStore";
import {
  useShellEditorState,
  useExportEditorState,
} from "../../app/state/editorStore";
import type { ProjectManifest } from "../../core/types";
import type { AppUpdateStatus } from "../types";

type AppDialogsProps = {
  appContextMenu: import("../../app/types").ContextMenuState | null;
  autoDownloadUpdates: boolean;
  exportResolution: { width: number; height: number };
  projectName: string;
  sceneName: string;
  sceneDurationSeconds: number;
  resolution: ProjectManifest["resolution"];
  updateStatus: AppUpdateStatus;
  onAppContextMenuClose: () => void;
  onAutoDownloadUpdatesChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onExportResolutionChange: (res: { width: number; height: number }) => void;
  onMediaExport: () => void;
  onClearAllPrerenderCaches: () => void;
  onVideoExportCancel: () => void;
  onInstallUpdate: () => void;
};

export const AppDialogs = memo(function AppDialogs({
  appContextMenu,
  autoDownloadUpdates,
  exportResolution,
  projectName,
  sceneName,
  sceneDurationSeconds,
  resolution,
  updateStatus,
  onAppContextMenuClose,
  onAutoDownloadUpdatesChange,
  onCheckForUpdates,
  onDownloadUpdate,
  onExportResolutionChange,
  onMediaExport,
  onClearAllPrerenderCaches,
  onVideoExportCancel,
  onInstallUpdate,
}: AppDialogsProps) {
  const { settingsOpen, settingsSection, setSettingsOpen, setSettingsSection } =
    useShellEditorState();

  const {
    exportDialogOpen,
    setExportDialogOpen,
    isExporting,
    exportProgress,
    videoExportProgress,
    videoExportCancelling,
  } = useExportEditorState();

  const {
    exportFrameRate,
    exportRenderQuality,
    mediaExportFormat,
    mediaExportRenderMode,
    setExportFrameRate,
    setExportRenderQuality,
    setMediaExportFormat,
    setMediaExportRenderMode,
  } = useAppSettingsStore();

  return (
    <>
      <ExportMediaDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        projectName={projectName}
        sceneName={sceneName}
        durationSeconds={sceneDurationSeconds}
        resolution={resolution}
        exportResolution={exportResolution}
        onExportResolutionChange={onExportResolutionChange}
        exportFrameRate={exportFrameRate}
        onExportFrameRateChange={setExportFrameRate}
        exportRenderQuality={exportRenderQuality}
        onExportRenderQualityChange={setExportRenderQuality}
        mediaExportFormat={mediaExportFormat}
        onMediaExportFormatChange={setMediaExportFormat}
        mediaExportRenderMode={mediaExportRenderMode}
        onMediaExportRenderModeChange={setMediaExportRenderMode}
        exporting={isExporting}
        progress={exportProgress}
        onExport={onMediaExport}
      />
      <SettingsDialog
        activeSection={settingsSection}
        open={settingsOpen}
        updateStatus={updateStatus}
        autoDownloadUpdates={autoDownloadUpdates}
        onActiveSectionChange={setSettingsSection}
        onAutoDownloadUpdatesChange={onAutoDownloadUpdatesChange}
        onCheckForUpdates={onCheckForUpdates}
        onDownloadUpdate={onDownloadUpdate}
        onInstallUpdate={onInstallUpdate}
        onOpenChange={setSettingsOpen}
        onClearAllPrerenderCaches={onClearAllPrerenderCaches}
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
