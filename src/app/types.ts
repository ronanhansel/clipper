import type { ProjectManifest } from "../core/types";

export type Mode = "interactive" | "code";
export type LeftPanelTab = "assets" | "tools";
export type RightPanelTab = "video" | "motion" | "agent";
export type ProjectUpdater = ProjectManifest | ((current: ProjectManifest) => ProjectManifest);
export type ExportDialogTab = "media" | "project";
export type ProjectExportFormat = "project-package" | "scene-json";
export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null;
export type ContextMenuItem = { label: string; action?: () => void; children?: ContextMenuItem[]; danger?: boolean; disabled?: boolean };
export const TIMELINE_MOTION_PART_ID = "__timeline_motion__";
export type TimelineNodeContextTarget = ({ time?: number } & (
  | { kind: "adjustment"; layerId: string }
  | { kind: "part"; partId: string }
  | { kind: "translation"; partId: string; markerId: string }
  | { kind: "zoom"; partId: string; markerId: string }
));
export type TimelineBlankContextTarget = { time: number };
export type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string };
export type SettingsSection = "playback" | "timeline" | "export" | "advanced";
export type ZoomMarkerSelection = { partId: string; markerId: string };
export type TranslationMarkerSelection = { partId: string; markerId: string };
export type AdjustmentLayerSelection = { layerId: string };
export type CompositionSelection = { partId: string };
export type TimelineSelectionDrag = { startX: number; currentX: number; startY?: number; currentY?: number };
export type PlaybackClock = { startedAt: number; startedFrom: number } | null;
