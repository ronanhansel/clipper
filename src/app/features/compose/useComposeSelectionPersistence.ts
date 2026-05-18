import { useEffect } from "react";
import type { ProjectManifest } from "../../../core/types";

type UseComposeSelectionPersistenceParams = {
  project: ProjectManifest;
  requestUiPersist: () => void;
  selectedComposeObjectIds: string[];
  timelineMode: string;
};

export function useComposeSelectionPersistence({
  project,
  requestUiPersist,
  selectedComposeObjectIds,
  timelineMode,
}: UseComposeSelectionPersistenceParams) {
  useEffect(() => {
    if (timelineMode !== "compose") return;
    const persistedIds = project.editorState?.selectedComposeObjectIds ?? [];
    if (
      selectedComposeObjectIds.length === persistedIds.length &&
      selectedComposeObjectIds.every((id, index) => id === persistedIds[index])
    )
      return;
    const handle = window.setTimeout(() => {
      requestUiPersist();
    }, 750);
    return () => window.clearTimeout(handle);
  }, [
    project.editorState?.selectedComposeObjectIds,
    requestUiPersist,
    selectedComposeObjectIds,
    timelineMode,
  ]);
}
