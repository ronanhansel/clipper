import type { ProjectManifest, TimelineDocument } from "./types";

export type PreviewFps = 24 | 30 | 60;

export const defaultPreviewFps: PreviewFps = 30;

export function isPreviewFps(value: unknown): value is PreviewFps {
  return value === 24 || value === 30 || value === 60;
}

export function resolvePreviewFps(
  timeline: TimelineDocument | undefined,
  override?: PreviewFps,
): PreviewFps {
  if (override !== undefined && isPreviewFps(override)) return override;
  const explicit = timeline?.settings?.previewFps;
  if (isPreviewFps(explicit)) return explicit;
  const frameRate = timeline?.settings?.frameRate;
  if (isPreviewFps(frameRate)) return frameRate;
  return defaultPreviewFps;
}

export function resolveProjectPreviewFps(
  project: ProjectManifest | undefined,
  timelineId: string | undefined,
  override?: PreviewFps,
): PreviewFps {
  const timeline = (project?.timelines ?? []).find(
    (entry) => entry.id === timelineId,
  );
  return resolvePreviewFps(timeline, override);
}
