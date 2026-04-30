import type { ProjectManifest } from "../../../core/types";
import { reorderByIntent } from "./fileManagerPaths";

export function createTimelineInProject(project: ProjectManifest, timelineId: string, directoryPath: string): ProjectManifest {
  return {
    ...project,
    timelines: [...(project.timelines ?? []), {
      id: timelineId,
      name: `Timeline ${(project.timelines?.length ?? project.scenes.length) + 1}`,
      filePath: `${directoryPath}/${timelineId}.timeline.json`,
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
  return {
    ...project,
    compositionFolders: Array.from(new Set([...(project.compositionFolders ?? []), folderPath])),
    timelines: (project.timelines ?? []).map((timeline) => timeline.id === timelineId ? { ...timeline, filePath: `${folderPath}/${timeline.id}.timeline.json` } : timeline),
  };
}

export function deleteTimelineFromProject(project: ProjectManifest, timelineId: string): ProjectManifest {
  return { ...project, timelines: (project.timelines ?? []).filter((timeline) => timeline.id !== timelineId) };
}
