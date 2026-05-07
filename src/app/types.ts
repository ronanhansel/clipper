import type { ProjectManifest } from "../core/types";

export type Mode = "preview" | "editor";
export type LeftPanelTab = "assets" | "tools";
export type RightPanelTab = "video" | "animation" | "agent";
export type ProjectUpdater = ProjectManifest | ((current: ProjectManifest) => ProjectManifest);
export type ExportDialogTab = "media" | "project";
export type ProjectExportFormat = "project-package" | "scene-json";
export type MediaExportFormat = "prores-422-hq" | "prores-4444" | "dnxhr-hqx" | "mov" | "h264-high" | "mp4" | "webm";
export type ExportRenderQuality = "standard" | "high" | "ultra";
export type MediaExportRenderMode = "renderer" | "stable-slow";
export type StableSlowGridPreset = "relaxed" | "balanced" | "safe" | "extreme";
export type StableSlowValidationSamples = 1 | 2 | 3;
export type ExportWorkerConfigurationMode = "separate" | "unified";
export type ExportWorkerResolutionMapping = { hd: number; qhd: number; uhd: number };
export type ExportTileResolutionMapping = { hd: number; qhd: number; uhd: number };
export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null;
export type ContextMenuItem = { label: string; action?: () => void; children?: ContextMenuItem[]; danger?: boolean; disabled?: boolean };
export const TIMELINE_MOTION_PART_ID = "__timeline_motion__";
export type TimelineNodeContextTarget = ({ time?: number; compositionLayerId?: string } & (
  | { kind: "adjustment"; layerId: string }
  | { kind: "part"; partId: string }
  | { kind: "motion"; partId: string; markerId: string }
  | { kind: "transition"; layerId: string }
));
export type TimelineBlankContextTarget = { time: number; compositionLayerId?: string };
export type VideoExportMethod = "renderer" | "stable-slow";
export type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string; method?: VideoExportMethod };
export type SettingsSection = "general" | "playback" | "timeline" | "export" | "advanced";
export type UpdateStatusKind = "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
export type AppUpdateStatus = {
  kind: UpdateStatusKind;
  message: string;
  version?: string;
  downloaded?: boolean;
};
export type MotionMarkerSelection = { partId: string; markerId: string };
export type AdjustmentLayerSelection = { layerId: string };
export type CompositionSelection = { partId: string };
export type TimelineSelectionDrag = { startX: number; currentX: number; startY?: number; currentY?: number; startContentX?: number; currentContentX?: number; startContentY?: number; currentContentY?: number };
export type PlaybackClock = { startedAt: number; startedFrom: number } | null;
