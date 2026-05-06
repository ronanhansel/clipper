import { FileManager, type FileManagerProps, type FileManagerTreeSnapshot } from "../../../components/FileManager";
import type { EditorState } from "../../../core/types";

export type FileManagerWorkspaceProps = FileManagerProps;

export type BuildFileManagerWorkspacePropsInput = Omit<FileManagerProps,
  | "onAddComposition"
  | "onApplyTreeSnapshot"
  | "onCopyAsset"
  | "onCopyCompositionPath"
  | "onCreateComposition"
  | "onCreateCompositionFolder"
  | "onCreateProjectFile"
  | "onCreateFolder"
  | "onCreateTimeline"
  | "onDeleteAsset"
  | "onDeleteComposition"
  | "onDeleteCompositionFolder"
  | "onDeleteProjectFile"
  | "onDeleteTimeline"
  | "onDropFiles"
  | "onDuplicateAsset"
  | "onDuplicateComposition"
  | "onFileManagerStateChange"
  | "onFindCompositionMedia"
  | "onOpenCompositionFile"
  | "onOpenProjectFile"
  | "onMoveComposition"
  | "onMoveTimeline"
  | "onPrerenderComposition"
  | "onRenameAsset"
  | "onRenameComposition"
  | "onRenameCompositionFolder"
  | "onRenameProjectFile"
  | "onRenameTimeline"
  | "onRevealAssetRoot"
  | "onRevealComposition"
  | "onRevealCompositionFolder"
  | "onSelectTimeline"
  | "onSortAssets"
  | "onReloadProject"
> & {
  actions: {
    addComposition: FileManagerProps["onAddComposition"];
    applyTreeSnapshot: (snapshot: FileManagerTreeSnapshot) => void;
    copyAsset: FileManagerProps["onCopyAsset"];
    copyCompositionPath: FileManagerProps["onCopyCompositionPath"];
    createComposition: FileManagerProps["onCreateComposition"];
    createCompositionFolder: FileManagerProps["onCreateCompositionFolder"];
    createProjectFile: FileManagerProps["onCreateProjectFile"];
    createFolder: FileManagerProps["onCreateFolder"];
    createTimeline: FileManagerProps["onCreateTimeline"];
    deleteAsset: FileManagerProps["onDeleteAsset"];
    deleteComposition: FileManagerProps["onDeleteComposition"];
    deleteCompositionFolder: FileManagerProps["onDeleteCompositionFolder"];
    deleteProjectFile: FileManagerProps["onDeleteProjectFile"];
    deleteTimeline: FileManagerProps["onDeleteTimeline"];
    dropFiles: FileManagerProps["onDropFiles"];
    duplicateAsset: FileManagerProps["onDuplicateAsset"];
    duplicateComposition: FileManagerProps["onDuplicateComposition"];
    fileManagerStateChange: (fileManagerState: EditorState["fileManagerState"]) => void;
    moveComposition: FileManagerProps["onMoveComposition"];
    moveTimeline: FileManagerProps["onMoveTimeline"];
    prerenderComposition?: FileManagerProps["onPrerenderComposition"];
    renameAsset: FileManagerProps["onRenameAsset"];
    renameComposition: FileManagerProps["onRenameComposition"];
    renameCompositionFolder: FileManagerProps["onRenameCompositionFolder"];
    renameProjectFile: FileManagerProps["onRenameProjectFile"];
    renameTimeline: FileManagerProps["onRenameTimeline"];
    revealAssetRoot: FileManagerProps["onRevealAssetRoot"];
    revealComposition: FileManagerProps["onRevealComposition"];
    revealCompositionFolder: FileManagerProps["onRevealCompositionFolder"];
    selectTimeline: FileManagerProps["onSelectTimeline"];
    sortAssets: FileManagerProps["onSortAssets"];
    reloadProject: FileManagerProps["onReloadProject"];
    findCompositionMedia: FileManagerProps["onFindCompositionMedia"];
    openCompositionFile: NonNullable<FileManagerProps["onOpenCompositionFile"]>;
    openProjectFile: NonNullable<FileManagerProps["onOpenProjectFile"]>;
  };
};

export function buildFileManagerWorkspaceProps({ actions, ...state }: BuildFileManagerWorkspacePropsInput): FileManagerWorkspaceProps {
  return {
    ...state,
    onAddComposition: actions.addComposition,
    onApplyTreeSnapshot: actions.applyTreeSnapshot,
    onCopyAsset: actions.copyAsset,
    onCopyCompositionPath: actions.copyCompositionPath,
    onCreateComposition: actions.createComposition,
    onCreateCompositionFolder: actions.createCompositionFolder,
    onCreateProjectFile: actions.createProjectFile,
    onCreateFolder: actions.createFolder,
    onCreateTimeline: actions.createTimeline,
    onDeleteAsset: actions.deleteAsset,
    onDeleteComposition: actions.deleteComposition,
    onDeleteCompositionFolder: actions.deleteCompositionFolder,
    onDeleteProjectFile: actions.deleteProjectFile,
    onDeleteTimeline: actions.deleteTimeline,
    onDropFiles: actions.dropFiles,
    onDuplicateAsset: actions.duplicateAsset,
    onDuplicateComposition: actions.duplicateComposition,
    onFileManagerStateChange: actions.fileManagerStateChange,
    onMoveComposition: actions.moveComposition,
    onMoveTimeline: actions.moveTimeline,
    onPrerenderComposition: actions.prerenderComposition,
    onRenameAsset: actions.renameAsset,
    onRenameComposition: actions.renameComposition,
    onRenameCompositionFolder: actions.renameCompositionFolder,
    onRenameProjectFile: actions.renameProjectFile,
    onRenameTimeline: actions.renameTimeline,
    onRevealAssetRoot: actions.revealAssetRoot,
    onRevealComposition: actions.revealComposition,
    onRevealCompositionFolder: actions.revealCompositionFolder,
    onSelectTimeline: actions.selectTimeline,
    onSortAssets: actions.sortAssets,
    onReloadProject: actions.reloadProject,
    onFindCompositionMedia: actions.findCompositionMedia,
    onOpenCompositionFile: actions.openCompositionFile,
    onOpenProjectFile: actions.openProjectFile,
  } as FileManagerWorkspaceProps;
}

export function FileManagerWorkspace(props: FileManagerWorkspaceProps) {
  function handleDragOver(event: React.DragEvent) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(event: React.DragEvent) {
    if (event.dataTransfer.types.includes("Files") && event.dataTransfer.files.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      props.onDropFiles(event.dataTransfer.files);
    }
  }

  return (
    <div onDragOverCapture={handleDragOver} onDropCapture={handleDrop} className="min-h-0 min-w-0">
      <FileManager {...props} />
    </div>
  );
}
