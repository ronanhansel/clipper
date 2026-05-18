import { useCallback } from "react";
import type { ContextMenuState } from "../../types";
import type { CompositionClip, FrameObject, Part } from "../../../core/types";

type Setter<T> = (value: T | ((current: T) => T)) => void;
type ObjectUpdater = (
  objectId: string,
  updater: (object: FrameObject) => FrameObject,
) => void;
type PartBackgroundUpdater = (
  updater: (background: Part["background"]) => Part["background"],
) => void;
type CompositionUpdater = (
  partId: string,
  updater: (composition: CompositionClip) => CompositionClip,
) => void;

export type UseComposeObjectMutationsParams = {
  part: Part;
  selectedComposeObjectIds: string[];
  setAppContextMenu: Setter<ContextMenuState>;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  deleteComposeObjects: (objectIds: string[]) => void;
  updatePartBackground: PartBackgroundUpdater;
  updateObjectById: ObjectUpdater;
  updateCompositionForTimelinePart: CompositionUpdater;
};

export function useComposeObjectMutations({
  part,
  selectedComposeObjectIds,
  setAppContextMenu,
  setComposeSelectionObjects,
  deleteComposeObjects,
  updatePartBackground,
  updateObjectById,
  updateCompositionForTimelinePart,
}: UseComposeObjectMutationsParams) {
  const updateComposeObject = useCallback(
    (objectId: string, updater: (object: FrameObject) => FrameObject) => {
      updateObjectById(objectId, updater);
    },
    [updateObjectById],
  );

  const toggleComposeLayerHidden = useCallback(
    (layerId: string) => {
      if (part.background.id === layerId) {
        updatePartBackground((background) => ({
          ...background,
          hidden: !background.hidden || undefined,
        }));
        return;
      }
      const element = part.background.elements.find((el) => el.id === layerId);
      if (element) {
        updatePartBackground((background) => ({
          ...background,
          elements: background.elements.map((el) =>
            el.id === layerId ? { ...el, hidden: !el.hidden || undefined } : el,
          ),
        }));
        return;
      }
      updateObjectById(layerId, (object) => ({
        ...object,
        hidden: !object.hidden || undefined,
      }));
    },
    [part.background, updateObjectById, updatePartBackground],
  );

  const toggleComposeLayerLocked = useCallback(
    (layerId: string) => {
      if (part.background.id === layerId) {
        updatePartBackground((background) => ({
          ...background,
          locked: !background.locked || undefined,
        }));
        return;
      }
      const element = part.background.elements.find((el) => el.id === layerId);
      if (element) {
        updatePartBackground((background) => ({
          ...background,
          elements: background.elements.map((el) =>
            el.id === layerId ? { ...el, locked: !el.locked || undefined } : el,
          ),
        }));
        return;
      }
      updateObjectById(layerId, (object) => ({
        ...object,
        locked: !object.locked || undefined,
      }));
    },
    [part.background, updateObjectById, updatePartBackground],
  );

  const renameComposeAnimationLayer = useCallback(
    (layerId: string, name: string) => {
      if (part.background.id === layerId) {
        updatePartBackground((background) => ({ ...background, name }));
        return;
      }
      updateObjectById(layerId, (object) => ({ ...object, name }));
    },
    [part.background.id, updateObjectById, updatePartBackground],
  );

  const openComposeObjectContextMenu = useCallback(
    (event: React.MouseEvent, object: FrameObject) => {
      event.preventDefault();
      event.stopPropagation();
      const targetIds = selectedComposeObjectIds.includes(object.id)
        ? selectedComposeObjectIds
        : [object.id];
      const targetObjects = [
        ...part.background.elements,
        ...part.objects,
      ].filter((o) => targetIds.includes(o.id));
      const allHidden = targetObjects.every((o) => o.hidden);
      const allLocked = targetObjects.every((o) => o.locked);
      const label =
        targetIds.length > 1
          ? `${targetIds.length} objects`
          : (object.name ?? "Object");
      setAppContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: `Duplicate ${label}`,
            action: () => {
              const suffix = Date.now().toString(36);
              const offset = 24;
              const duplicated = targetObjects.map((o, index) => {
                const id = `${o.id}:copy:${suffix}:${index}`;
                return {
                  ...structuredClone(o),
                  id,
                  selector: `[data-object-id='${id}']`,
                  bounds: {
                    ...o.bounds,
                    x: o.bounds.x + offset,
                    y: o.bounds.y + offset,
                  },
                };
              });
              updateCompositionForTimelinePart(part.id, (composition) => ({
                ...composition,
                objects: [...composition.objects, ...duplicated],
              }));
              setComposeSelectionObjects(duplicated);
            },
          },
          {
            label: allHidden ? `Show ${label}` : `Hide ${label}`,
            action: () => {
              for (const id of targetIds) toggleComposeLayerHidden(id);
            },
          },
          {
            label: allLocked ? `Unlock ${label}` : `Lock ${label}`,
            action: () => {
              for (const id of targetIds) toggleComposeLayerLocked(id);
            },
          },
          {
            label: `Delete ${label}`,
            danger: true,
            action: () => deleteComposeObjects(targetIds),
          },
        ],
      });
    },
    [
      deleteComposeObjects,
      part.background.elements,
      part.id,
      part.objects,
      selectedComposeObjectIds,
      setAppContextMenu,
      setComposeSelectionObjects,
      toggleComposeLayerHidden,
      toggleComposeLayerLocked,
      updateCompositionForTimelinePart,
    ],
  );

  return {
    updateComposeObject,
    toggleComposeLayerHidden,
    toggleComposeLayerLocked,
    renameComposeAnimationLayer,
    openComposeObjectContextMenu,
  };
}
