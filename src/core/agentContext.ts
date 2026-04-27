import type { Part, ProjectManifest, Scene, SelectionPayload } from "./types";
import { buildLinearTimeline } from "./timeline";

export function createAgentContext(project: ProjectManifest, scene: Scene, part: Part, selection: SelectionPayload | null) {
  return {
    project: {
      id: project.id,
      name: project.name,
      resolution: project.resolution,
      assetsPath: project.assetsPath,
    },
    scene: {
      id: scene.id,
      name: scene.name,
      duration: buildLinearTimeline(scene).at(-1)?.end ?? 0,
      timeline: buildLinearTimeline(scene).map((timelinePart) => ({
        id: timelinePart.id,
        name: timelinePart.name,
        filePath: timelinePart.filePath,
        start: timelinePart.start,
        end: timelinePart.end,
      })),
    },
    part: {
      id: part.id,
      name: part.name,
      filePath: part.filePath,
      duration: part.duration,
      objects: part.objects,
      zoomMarkers: part.zoomMarkers,
      panMarkers: part.translationMarkers,
      snapshot: part.snapshot,
    },
    selection,
  };
}
