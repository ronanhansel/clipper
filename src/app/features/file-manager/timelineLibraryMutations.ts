import type { ProjectManifest } from "../../../core/types";
import { reorderByIntent } from "./fileManagerPaths";

export function createTimelineInProject(project: ProjectManifest, timelineId: string, directoryPath: string, name?: string): ProjectManifest {
  const timelineName = name || `Timeline ${(project.timelines?.length ?? 0) + 1}`;
  const fileName = name ? `${name}.timeline.json` : `${timelineId}.timeline.json`;
  return {
    ...project,
    timelines: [...(project.timelines ?? []), {
      id: timelineId,
      name: timelineName,
      filePath: directoryPath ? `${directoryPath}/${fileName}` : fileName,
      clips: [],
      adjustmentLayers: [],
      motionMarkers: [],
      settings: {},
    }],
  };
}

export function renameTimelineInProject(project: ProjectManifest, timelineId: string, name: string): ProjectManifest {
  const nextName = name.trim();
  if (!nextName) return project;
  return { ...project, timelines: (project.timelines ?? []).map((timeline) => timeline.id === timelineId ? { ...timeline, name: nextName } : timeline) };
}

export function reorderTimelineInProject(project: ProjectManifest, sourceTimelineId: string, targetTimelineId: string, action: "before" | "after"): ProjectManifest {
  if (sourceTimelineId === targetTimelineId) return project;
  const timelines = project.timelines ?? [];
  const sourceTimelineIndex = timelines.findIndex((timeline) => timeline.id === sourceTimelineId);
  const targetTimelineIndex = timelines.findIndex((timeline) => timeline.id === targetTimelineId);
  if (sourceTimelineIndex < 0 || targetTimelineIndex < 0) return project;
  return { ...project, timelines: reorderByIntent(timelines, sourceTimelineIndex, targetTimelineIndex, action) };
}

export function moveTimelineInProject(project: ProjectManifest, timelineId: string, folderPath: string): ProjectManifest {
  const timeline = project.timelines?.find(t => t.id === timelineId);
  const fileName = timeline?.filePath?.split("/").pop() || `${timelineId}.timeline.json`;
  const nextPath = folderPath ? `${folderPath}/${fileName}` : fileName;
  return {
    ...project,
    compositionFolders: folderPath ? Array.from(new Set([...(project.compositionFolders ?? []), folderPath])) : project.compositionFolders,
    timelines: (project.timelines ?? []).map((t) => t.id === timelineId ? { ...t, filePath: nextPath } : t),
  };
}

export function deleteTimelineFromProject(project: ProjectManifest, timelineId: string): ProjectManifest {
  return { ...project, timelines: (project.timelines ?? []).filter((timeline) => timeline.id !== timelineId) };
}
