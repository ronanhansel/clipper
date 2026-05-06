import { useEffect, useState } from "react";
import { clipperHost } from "../../clipperHost";
import type { AppUpdateStatus } from "../../types";

const defaultUpdateStatus: AppUpdateStatus = {
  kind: "idle",
  message: "Ready to check for updates.",
};

export function useAppUpdates() {
  const [autoDownloadUpdates, setAutoDownloadUpdatesState] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>(defaultUpdateStatus);

  useEffect(() => {
    let cancelled = false;
    void window.clipper?.readAppState?.().then((state) => {
      if (!cancelled && typeof state.automaticUpdateDownloads === "boolean") setAutoDownloadUpdatesState(state.automaticUpdateDownloads);
    });
    void clipperHost.getUpdateStatus().then((status) => {
      if (!cancelled) setUpdateStatus(status);
    });
    const unsubscribe = clipperHost.onUpdateStatus((status) => setUpdateStatus(status));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function setAutoDownloadUpdates(enabled: boolean) {
    setAutoDownloadUpdatesState(enabled);
    setUpdateStatus(await clipperHost.setAutoDownloadUpdates(enabled));
  }

  async function checkForUpdates() {
    setUpdateStatus(await clipperHost.checkForUpdates());
  }

  async function downloadUpdate() {
    setUpdateStatus(await clipperHost.downloadUpdate());
  }

  async function installUpdate() {
    setUpdateStatus(await clipperHost.installUpdate());
  }

  return { autoDownloadUpdates, updateStatus, setAutoDownloadUpdates, checkForUpdates, downloadUpdate, installUpdate };
}
