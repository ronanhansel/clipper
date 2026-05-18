import { useEffect, useRef } from "react";
import type { FrameObject, Part } from "../../../core/types";

type UseComposeClipboardParams = {
  composeMode: boolean;
  editingTextObjectId: string | null;
  mode: string;
  part: Part;
  selectedComposeObjectIds: string[];
  deleteComposeObjects: (ids: string[]) => void;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  updateCompositionForTimelinePart: (
    partId: string,
    updater: (composition: any) => any,
  ) => void;
};

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

export function useComposeClipboard({
  composeMode,
  editingTextObjectId,
  mode,
  part,
  selectedComposeObjectIds,
  deleteComposeObjects,
  setComposeSelectionObjects,
  updateCompositionForTimelinePart,
}: UseComposeClipboardParams) {
  const composeClipboardRef = useRef<FrameObject[] | null>(null);

  useEffect(() => {
    function deleteSelectedComposeLayers(event: KeyboardEvent) {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (event.defaultPrevented) return;
      if (
        !composeMode ||
        mode !== "preview" ||
        editingTextObjectId ||
        selectedComposeObjectIds.length === 0
      )
        return;
      if (isEditableKeyboardTarget(event.target)) return;
      event.preventDefault();
      deleteComposeObjects(selectedComposeObjectIds);
    }

    window.addEventListener("keydown", deleteSelectedComposeLayers);
    return () =>
      window.removeEventListener("keydown", deleteSelectedComposeLayers);
  }, [
    composeMode,
    deleteComposeObjects,
    editingTextObjectId,
    mode,
    selectedComposeObjectIds,
  ]);

  useEffect(() => {
    function copyPasteComposeObjects(event: KeyboardEvent) {
      if (!composeMode || mode !== "preview" || editingTextObjectId) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "d") {
        if (selectedComposeObjectIds.length === 0) return;
        const selectedIdSet = new Set(selectedComposeObjectIds);
        const selectedObjects = [
          ...part.background.elements,
          ...part.objects,
        ].filter((object) => selectedIdSet.has(object.id));
        if (selectedObjects.length === 0) return;
        event.preventDefault();
        const suffix = Date.now().toString(36);
        const offset = 24;
        const duplicatedObjects = selectedObjects.map((object, index) => {
          const id = `${object.id}:copy:${suffix}:${index}`;
          return {
            ...structuredClone(object),
            id,
            selector: `[data-object-id='${id}']`,
            bounds: {
              ...object.bounds,
              x: object.bounds.x + offset,
              y: object.bounds.y + offset,
            },
          };
        });
        updateCompositionForTimelinePart(part.id, (composition) => ({
          ...composition,
          objects: [...composition.objects, ...duplicatedObjects],
        }));
        setComposeSelectionObjects(duplicatedObjects);
        return;
      }
      if (key === "c") {
        if (selectedComposeObjectIds.length === 0) return;
        const selectedIdSet = new Set(selectedComposeObjectIds);
        const selectedObjects = [
          ...part.background.elements,
          ...part.objects,
        ].filter((object) => selectedIdSet.has(object.id));
        if (selectedObjects.length === 0) return;
        composeClipboardRef.current = selectedObjects.map((object) =>
          structuredClone(object),
        );
        event.preventDefault();
        return;
      }
      if (key !== "v") return;
      const clipboard = composeClipboardRef.current;
      if (!clipboard || clipboard.length === 0) return;
      event.preventDefault();
      const suffix = Date.now().toString(36);
      const pastedObjects = clipboard.map((object, index) => {
        const id = `${object.id}:copy:${suffix}:${index}`;
        const offset = 24;
        return {
          ...structuredClone(object),
          id,
          selector: `[data-object-id='${id}']`,
          bounds: {
            ...object.bounds,
            x: object.bounds.x + offset,
            y: object.bounds.y + offset,
          },
        };
      });
      updateCompositionForTimelinePart(part.id, (composition) => ({
        ...composition,
        objects: [...composition.objects, ...pastedObjects],
      }));
      setComposeSelectionObjects(pastedObjects);
      composeClipboardRef.current = pastedObjects.map((object) =>
        structuredClone(object),
      );
    }

    window.addEventListener("keydown", copyPasteComposeObjects);
    return () => window.removeEventListener("keydown", copyPasteComposeObjects);
  }, [
    composeMode,
    editingTextObjectId,
    mode,
    part.background.elements,
    part.id,
    part.objects,
    selectedComposeObjectIds,
    setComposeSelectionObjects,
    updateCompositionForTimelinePart,
  ]);
}
