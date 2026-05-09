import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { ContextMenuState } from "../types";
import type { ProjectManifest } from "../../core/types";

type UpdateProject = (
  updater: (current: ProjectManifest) => ProjectManifest,
) => void;

type ProjectTitleRenameOptions = {
  projectName: string;
  projectNameDraft: string;
  projectRef: { current: ProjectManifest };
  setAppContextMenu: (menu: ContextMenuState) => void;
  setProjectNameDraft: (draft: string) => void;
  setRenamingProject: (renaming: boolean) => void;
  updateProject: UpdateProject;
};

export function useProjectTitleRename({
  projectName,
  projectNameDraft,
  projectRef,
  setAppContextMenu,
  setProjectNameDraft,
  setRenamingProject,
  updateProject,
}: ProjectTitleRenameOptions) {
  const projectRenameCancelledRef = useRef(false);

  function startProjectRename() {
    projectRenameCancelledRef.current = false;
    setProjectNameDraft(projectRef.current.name);
    setRenamingProject(true);
  }

  function openProjectTitleMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [{ label: "Rename project", action: startProjectRename }],
    });
  }

  function commitProjectRename() {
    if (projectRenameCancelledRef.current) {
      projectRenameCancelledRef.current = false;
      return;
    }
    const nextName = projectNameDraft.trim();
    setRenamingProject(false);
    if (!nextName || nextName === projectRef.current.name) return;
    updateProject((current) => ({ ...current, name: nextName }));
  }

  function cancelProjectRename() {
    projectRenameCancelledRef.current = true;
    setProjectNameDraft(projectName);
    setRenamingProject(false);
  }

  return { cancelProjectRename, commitProjectRename, openProjectTitleMenu };
}
