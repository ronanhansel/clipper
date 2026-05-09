import type { MouseEvent as ReactMouseEvent } from "react";
import { Input } from "../../components/ui/input";
import {
  appBarActionButtonBase,
  appDragRegion,
  appNoDragRegion,
} from "../config";

type AppHeaderProps = {
  projectName: string;
  projectNameDraft: string;
  lastSavedAt: number | null;
  renamingProject: boolean;
  sceneName: string;
  onCancelProjectRename: () => void;
  onCloseProject: () => void;
  onCommitProjectRename: () => void;
  onExportOpen: () => void;
  onOpenProject: () => void;
  onProjectNameDraftChange: (name: string) => void;
  onProjectTitleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSettingsOpen: () => void;
};

export function AppHeader({
  projectName,
  projectNameDraft,
  lastSavedAt,
  renamingProject,
  sceneName,
  onCancelProjectRename,
  onCloseProject,
  onCommitProjectRename,
  onExportOpen,
  onOpenProject,
  onProjectNameDraftChange,
  onProjectTitleContextMenu,
  onSettingsOpen,
}: AppHeaderProps) {
  const savedTimeLabel = lastSavedAt
    ? `Saved ${formatSavedTime(lastSavedAt)}`
    : null;
  const savedTimeTitle = lastSavedAt
    ? `Last saved at ${formatSavedTitle(lastSavedAt)}`
    : undefined;

  return (
    <header
      className={`${appDragRegion} relative grid grid-cols-[1fr_auto] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(22,24,31,0.98)] px-[22px]`}
    >
      <div />
      <div
        className={`pointer-events-auto absolute left-1/2 top-1/2 flex w-[520px] max-w-[520px] -translate-x-1/2 -translate-y-1/2 items-baseline justify-center gap-2 text-center leading-none ${renamingProject ? appNoDragRegion : ""}`}
        onContextMenu={onProjectTitleContextMenu}
        title={renamingProject ? undefined : "Drag to move window"}
      >
        {renamingProject ? (
          <Input
            autoFocus
            className="h-7 w-[240px] border-[var(--clipper-accent)] bg-[#171920] px-2 py-0 text-center text-[14px] font-bold"
            value={projectNameDraft}
            onBlur={onCommitProjectRename}
            onChange={(event) => onProjectNameDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onCommitProjectRename();
              if (event.key === "Escape") onCancelProjectRename();
            }}
          />
        ) : (
          <strong className="truncate text-[14px] font-bold">
            {projectName}
          </strong>
        )}
        {!renamingProject ? (
          <span className="text-xs text-[#565b66]">/</span>
        ) : null}
        {!renamingProject ? (
          <span className="truncate text-xs text-[#9b9da7]">{sceneName}</span>
        ) : null}
      </div>
      <div className={`${appNoDragRegion} flex justify-end gap-1.5`}>
        {savedTimeLabel ? (
          <div
            className="flex min-w-[92px] items-center justify-end whitespace-nowrap text-[11px] font-medium text-[#686d78]"
            title={savedTimeTitle}
          >
            {savedTimeLabel}
          </div>
        ) : null}
        <button
          className={appBarActionButtonBase}
          title="Open a Clipper project folder or project.json"
          onClick={onOpenProject}
        >
          Open
        </button>
        <button
          className={appBarActionButtonBase}
          title="Close project and return to welcome screen"
          onClick={onCloseProject}
        >
          Close
        </button>
        <button
          className={appBarActionButtonBase}
          title="Settings (Cmd/Ctrl+,)"
          onClick={onSettingsOpen}
        >
          Settings
        </button>
        <button className={appBarActionButtonBase} onClick={onExportOpen}>
          Export
        </button>
      </div>
    </header>
  );
}

function formatSavedTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatSavedTitle(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}
