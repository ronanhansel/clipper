import type { ProjectManifest } from "../../../core/types";
import { createDefaultTimelineLayerState } from "../../../core/project";
import { createStableTimelineId } from "../../../core/compositionIds";
import { reorderByIntent } from "./binPaths";

export function createTimelineInProject(
  project: ProjectManifest,
  filePath: string,
): ProjectManifest {
  return {
    ...project,
    timelines: [
      ...(project.timelines ?? []),
      {
        id: createStableTimelineId(),
        filePath,
        clips: [],
        adjustmentLayers: [],
        motionMarkers: [],
        timelineLayers: createDefaultTimelineLayerState(),
        settings: {},
      },
    ],
  };
}

export function renameTimelineInProject(
  project: ProjectManifest,
  timelineId: string,
  name: string,
): ProjectManifest {
  const nextName = name.trim();
  if (!nextName) return project;
  return {
    ...project,
    timelines: (project.timelines ?? []).map((timeline) => {
      if (timeline.id !== timelineId) return timeline;
      const fileName = `${nextName}.timeline.json`;
      const directory = timeline.filePath
        ? timeline.filePath.slice(0, timeline.filePath.lastIndexOf("/") + 1)
        : "";
      const filePath = `${directory}${fileName}`;
      return { ...timeline, filePath };
    }),
  };
}

export function reorderTimelineInProject(
  project: ProjectManifest,
  sourceTimelineId: string,
  targetTimelineId: string,
  action: "before" | "after",
): ProjectManifest {
  if (sourceTimelineId === targetTimelineId) return project;
  const timelines = project.timelines ?? [];
  const sourceTimelineIndex = timelines.findIndex(
    (timeline) => timeline.id === sourceTimelineId,
  );
  const targetTimelineIndex = timelines.findIndex(
    (timeline) => timeline.id === targetTimelineId,
  );
  if (sourceTimelineIndex < 0 || targetTimelineIndex < 0) return project;
  return {
    ...project,
    timelines: reorderByIntent(
      timelines,
      sourceTimelineIndex,
      targetTimelineIndex,
      action,
    ),
  };
}

export function moveTimelineInProject(
  project: ProjectManifest,
  timelineId: string,
  folderPath: string,
): ProjectManifest {
  const timeline = project.timelines?.find((t) => t.id === timelineId);
  const fileName =
    timeline?.filePath?.split("/").pop() || `${timelineId}.timeline.json`;
  const nextPath = folderPath ? `${folderPath}/${fileName}` : fileName;
  return {
    ...project,
    compositionFolders: folderPath
      ? Array.from(new Set([...(project.compositionFolders ?? []), folderPath]))
      : project.compositionFolders,
    timelines: (project.timelines ?? []).map((t) =>
      t.id === timelineId ? { ...t, filePath: nextPath } : t,
    ),
  };
}

export function deleteTimelineFromProject(
  project: ProjectManifest,
  timelineId: string,
): ProjectManifest {
  return {
    ...project,
    timelines: (project.timelines ?? []).filter(
      (timeline) => timeline.id !== timelineId,
    ),
  };
}
