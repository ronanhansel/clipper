import type { ProjectManifest } from "../core/types";

export type Mode = "interactive" | "code";
export type LeftPanelTab = "assets" | "tools";
export type RightPanelTab = "video" | "motion" | "agent";
export type ProjectUpdater = ProjectManifest | ((current: ProjectManifest) => ProjectManifest);
export type ExportDialogTab = "media" | "project";
export type ProjectExportFormat = "project-package" | "scene-json";
export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null;
export type ContextMenuItem = { label: string; action?: () => void; children?: ContextMenuItem[]; danger?: boolean; disabled?: boolean };
export type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string };
export type SettingsSection = "playback" | "timeline" | "export" | "advanced";
