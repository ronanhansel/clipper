import { useEffect } from "react";
import { projectPersistenceService } from "../services/projectPersistenceService";
import type { EditorState } from "../../core/types";

export function useEditorStatePersistence({ activeProjectManifestPath, editorState, editorStateSnapshot }: { activeProjectManifestPath: string; editorState: EditorState | undefined; editorStateSnapshot: string }) {
  useEffect(() => {
    if (!editorState) return;
    const timeout = window.setTimeout(() => {
      projectPersistenceService.saveEditorState(activeProjectManifestPath, editorState).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeProjectManifestPath, editorStateSnapshot, editorState]);
}
