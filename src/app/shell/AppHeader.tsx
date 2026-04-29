import type { MouseEvent as ReactMouseEvent } from "react";
import { Input } from "../../components/ui/input";
import { appBarActionButtonBase, appBarSaveButtonClass, appDragRegion, appNoDragRegion } from "../config";

type AppHeaderProps = {
  hasActiveComposition: boolean;
  hasUnsavedChanges: boolean;
  partName: string;
  projectName: string;
  projectNameDraft: string;
  renamingProject: boolean;
  sceneName: string;
  onCancelProjectRename: () => void;
  onCommitProjectRename: () => void;
  onExportOpen: () => void;
  onOpenProject: () => void;
  onProjectNameDraftChange: (name: string) => void;
  onProjectTitleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSaveAll: () => void;
  onSettingsOpen: () => void;
};

export function AppHeader({ hasActiveComposition, hasUnsavedChanges, partName, projectName, projectNameDraft, renamingProject, sceneName, onCancelProjectRename, onCommitProjectRename, onExportOpen, onOpenProject, onProjectNameDraftChange, onProjectTitleContextMenu, onSaveAll, onSettingsOpen }: AppHeaderProps) {
  return (
    <header className={`${appDragRegion} grid grid-cols-[220px_1fr_430px] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(22,24,31,0.98)] px-[22px]`}>
      <div />
      <div className={`${appNoDragRegion} flex min-w-0 items-baseline justify-center gap-2 justify-self-center text-center leading-none`} onContextMenu={onProjectTitleContextMenu} title="Right-click to rename project">
        {renamingProject ? <Input autoFocus className="h-7 w-[240px] border-[var(--clipper-accent)] bg-[#171920] px-2 py-0 text-center text-[14px] font-bold" value={projectNameDraft} onBlur={onCommitProjectRename} onChange={(event) => onProjectNameDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommitProjectRename(); if (event.key === "Escape") onCancelProjectRename(); }} /> : <strong className="truncate text-[14px] font-bold">{projectName}</strong>}
        {!renamingProject ? <span className="text-xs text-[#565b66]">/</span> : null}
        {!renamingProject ? <span className="truncate text-xs text-[#9b9da7]">{hasActiveComposition ? `${sceneName} / ${partName}` : sceneName}</span> : null}
      </div>
      <div className={`${appNoDragRegion} flex justify-end gap-1.5`}>
        <button className={appBarActionButtonBase} title="Open a Clipper .clipper project" onClick={onOpenProject}>Open</button>
        <button className={appBarActionButtonBase} title="Settings (Cmd/Ctrl+,)" onClick={onSettingsOpen}>Settings</button>
        <button className={appBarActionButtonBase} onClick={onExportOpen}>Export</button>
        <button className={appBarSaveButtonClass(hasUnsavedChanges)} disabled={!hasUnsavedChanges} title="Save every project, timeline, inspector, and active code change (Ctrl+S or Cmd+S)" onClick={onSaveAll}>Save</button>
      </div>
    </header>
  );
}
