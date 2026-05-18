import { useEffect, useRef, type MutableRefObject } from "react";
import { frameObjectFromBackgroundLayer } from "../../../core/frameInteraction";
import type {
  FrameObject,
  Part,
  ProjectManifest,
  SelectionPayload,
} from "../../../core/types";

type UseComposeSelectionHydrationParams = {
  part: Part;
  timelineMode: string;
  project: ProjectManifest;
  selectedObjectId: string | null;
  selectedComposeObjectIds: string[];
  selectionPayload: SelectionPayload | null;
  pendingComposeSelectionObjectIdsRef: MutableRefObject<string[]>;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
};

export function useComposeSelectionHydration({
  part,
  timelineMode,
  project,
  selectedObjectId,
  selectedComposeObjectIds,
  selectionPayload,
  pendingComposeSelectionObjectIdsRef,
  setComposeSelectionObjects,
}: UseComposeSelectionHydrationParams) {
  useEffect(() => {
    const pendingIds = pendingComposeSelectionObjectIdsRef.current;
    if (pendingIds.length === 0) return;
    const pendingObjects = pendingIds
      .map((id) =>
        id === part.background.id
          ? frameObjectFromBackgroundLayer(part.background)
          : (part.background.elements.find((object) => object.id === id) ??
            part.objects.find((object) => object.id === id)),
      )
      .filter((object): object is FrameObject => Boolean(object));
    if (pendingObjects.length !== pendingIds.length) return;
    pendingComposeSelectionObjectIdsRef.current = [];
    setComposeSelectionObjects(pendingObjects);
  }, [
    part.background,
    part.background.elements,
    part.objects,
    pendingComposeSelectionObjectIdsRef,
    setComposeSelectionObjects,
  ]);

  const hydratedComposeSelectionFromProjectRef = useRef(false);

  useEffect(() => {
    hydratedComposeSelectionFromProjectRef.current = false;
  }, [part.id]);

  useEffect(() => {
    if (
      hydratedComposeSelectionFromProjectRef.current ||
      timelineMode !== "compose" ||
      selectionPayload?.objects.length ||
      selectedObjectId ||
      selectedComposeObjectIds.length > 0
    )
      return;
    const persistedIds = project.editorState?.selectedComposeObjectIds ?? [];
    if (persistedIds.length === 0) {
      hydratedComposeSelectionFromProjectRef.current = true;
      return;
    }
    const selectedIds = persistedIds.filter(
      (id) =>
        id === part.background.id ||
        part.background.elements.some((object) => object.id === id) ||
        part.objects.some((object) => object.id === id),
    );
    if (selectedIds.length === 0) return;
    const selectedObjects = selectedIds
      .map((id) =>
        id === part.background.id
          ? frameObjectFromBackgroundLayer(part.background)
          : (part.background.elements.find((object) => object.id === id) ??
            part.objects.find((object) => object.id === id)),
      )
      .filter((object): object is FrameObject => Boolean(object));
    if (selectedObjects.length === 0) return;
    hydratedComposeSelectionFromProjectRef.current = true;
    setComposeSelectionObjects(selectedObjects);
  }, [
    part.objects,
    project.editorState?.selectedComposeObjectIds,
    selectedObjectId,
    selectedComposeObjectIds,
    selectionPayload,
    timelineMode,
    part.background,
    setComposeSelectionObjects,
  ]);
}
