import { frameObjectFromBackgroundLayer } from "./frameInteraction";
import type { FrameObject, Part } from "./types";

export function getGraphSelectionObjectIds(
  part: Part,
  objectIds: readonly string[],
) {
  const ids = objectIds.flatMap((objectId) => {
    const object = getPartObjectForGraphSelection(part, objectId);
    return object ? [object.id] : [];
  });
  return Array.from(new Set(ids));
}

export function getGraphSelectionObject(
  part: Part,
  objectId: string | undefined,
) {
  if (!objectId) return null;
  return getPartObjectForGraphSelection(part, objectId);
}

function getPartObjectForGraphSelection(part: Part, objectId: string) {
  if (objectId === part.background.id)
    return frameObjectFromBackgroundLayer(part.background);
  const object = findPartObject(part, objectId);
  if (!object?.generatedByGraph) return object ?? null;
  const sourceObjectId = part.animationGraph?.sourceObjectId;
  if (!sourceObjectId) return null;
  if (sourceObjectId === part.background.id) return null;
  return findPartObject(part, sourceObjectId);
}

function findPartObject(part: Part, objectId: string): FrameObject | null {
  return (
    part.objects.find((item) => item.id === objectId) ??
    part.background.elements.find((item) => item.id === objectId) ??
    null
  );
}
