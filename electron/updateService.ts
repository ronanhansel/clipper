import { app, BrowserWindow } from "electron";
import electronUpdater, { type UpdateInfo } from "electron-updater";

const { autoUpdater } = electronUpdater;

export type UpdateStatusKind = "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
export type UpdateStatus = {
  kind: UpdateStatusKind;
  message: string;
  version?: string;
  downloaded?: boolean;
};

export type UpdateServiceOptions = {
  autoDownload: boolean;
  readAutoDownload: () => Promise<boolean>;
  writeAutoDownload: (enabled: boolean) => Promise<void>;
};

export class UpdateService {
  private status: UpdateStatus;
  private autoDownload: boolean;
  private initialized = false;

  constructor(private readonly options: UpdateServiceOptions) {
    this.autoDownload = options.autoDownload;
    this.status = this.isSupported()
      ? { kind: "idle", message: "Ready to check for updates." }
      : { kind: "unsupported", message: "Updates are available only in packaged builds with release publishing configured." };
  }

  initialize() {
    if (this.initialized || !this.isSupported()) return;
    this.initialized = true;
    autoUpdater.autoDownload = this.autoDownload;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.setStatus({ kind: "checking", message: "Checking for updates..." }));
    autoUpdater.on("update-available", (info) => {
      this.setStatus({ kind: this.autoDownload ? "downloading" : "available", message: this.autoDownload ? `Downloading Clipper ${info.version}...` : `Clipper ${info.version} is available.`, version: info.version });
    });
    autoUpdater.on("update-not-available", (info) => this.setStatus({ kind: "not-available", message: `Clipper ${app.getVersion()} is up to date.`, version: info.version }));
    autoUpdater.on("download-progress", (progress) => this.setStatus({ kind: "downloading", message: `Downloading update (${Math.round(progress.percent)}%).` }));
    autoUpdater.on("update-downloaded", (info) => this.setStatus({ kind: "downloaded", message: `Clipper ${info.version} is ready to install.`, version: info.version, downloaded: true }));
    autoUpdater.on("error", (error) => this.setStatus({ kind: "error", message: error.message || "Unable to check for updates." }));
  }

  async checkOnLaunch() {
    if (!this.isSupported()) return this.status;
    this.autoDownload = await this.options.readAutoDownload();
    autoUpdater.autoDownload = this.autoDownload;
    return this.checkForUpdates();
  }

  async getStatus() {
    this.autoDownload = await this.options.readAutoDownload();
    if (this.isSupported()) autoUpdater.autoDownload = this.autoDownload;
    return this.status;
  }

  async setAutoDownload(enabled: boolean) {
    this.autoDownload = enabled;
    await this.options.writeAutoDownload(enabled);
    if (this.isSupported()) autoUpdater.autoDownload = enabled;
    return this.status;
  }

  async checkForUpdates() {
    if (!this.isSupported()) return this.status;
    this.initialize();
    this.setStatus({ kind: "checking", message: "Checking for updates..." });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) return this.statusForUpdateInfo(result.updateInfo);
      return this.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to check for updates.";
      this.setStatus({ kind: "error", message });
      return this.status;
    }
  }

  async downloadUpdate() {
    if (!this.isSupported()) return this.status;
    if (this.status.kind !== "available") return { ...this.status, message: "No available update is ready to download." };
    this.setStatus({ ...this.status, kind: "downloading", message: this.status.version ? `Downloading Clipper ${this.status.version}...` : "Downloading update..." });
    try {
      await autoUpdater.downloadUpdate();
      return this.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to download update.";
      this.setStatus({ kind: "error", message });
      return this.status;
    }
  }

  installUpdate() {
    if (!this.isSupported()) return this.status;
    if (this.status.kind !== "downloaded") return { ...this.status, message: "No downloaded update is ready to install." };
    autoUpdater.quitAndInstall(false, true);
    return this.status;
  }

  private isSupported() {
    return app.isPackaged;
  }

  private statusForUpdateInfo(info: UpdateInfo) {
    if (this.status.kind === "checking") this.setStatus({ kind: "not-available", message: `Clipper ${app.getVersion()} is up to date.`, version: info.version });
    return this.status;
  }

  private setStatus(status: UpdateStatus) {
    this.status = status;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("clipper:update-status", status);
  }
}
