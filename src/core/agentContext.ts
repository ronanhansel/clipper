import type { Part, ProjectManifest, Scene, SelectionPayload } from "./types";
import { buildLinearTimeline } from "./timeline";
import { getMotionMarkerViews } from "./motionEffects";
import { getDisplayNameFromPath } from "./fileNames";

export function createAgentContext(
  project: ProjectManifest,
  scene: Scene,
  part: Part,
  selection: SelectionPayload | null,
) {
  const partMotionViews = getMotionMarkerViews(part);
  return {
    project: {
      id: project.id,
      name: project.name,
      resolution: project.resolution,
      assetsPath: project.assetsPath,
    },
    scene: {
      id: scene.id,
      name: getDisplayNameFromPath(scene.id),
      duration: buildLinearTimeline(scene).at(-1)?.end ?? 0,
      timeline: buildLinearTimeline(scene).map((timelinePart) => ({
        id: timelinePart.id,
        name: getDisplayNameFromPath(timelinePart.filePath),
        filePath: timelinePart.filePath,
        start: timelinePart.start,
        end: timelinePart.end,
      })),
    },
    part: {
      id: part.id,
      name: getDisplayNameFromPath(part.filePath),
      filePath: part.filePath,
      duration: part.duration,
      objects: part.objects,
      motionMarkers: partMotionViews.motionMarkers,
      snapshot: part.snapshot,
    },
    selection,
  };
}
