import type { FileManagerProps, FileManagerTreeSnapshot } from "../../../components/FileManager";
import type { EditorState } from "../../../core/types";
import { buildFileManagerWorkspaceProps, type FileManagerWorkspaceProps } from "./FileManagerWorkspace";

type UseFileManagerControllerInput = Pick<FileManagerProps,
  | "assets"
  | "compositionFolders"
  | "compositionRootPath"
  | "compositions"
  | "fileManagerState"
  | "findMediaRequest"
  | "onFindMediaRequestChange"
  | "timelineCompositionIds"
  | "timelines"
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
    renameProjectFile: FileManagerProps["onRenameProjectFile"];
  };
  implicitFileOperation: <T extends unknown[]>(operation: (...args: T) => void) => (...args: T) => void;
};

export function useFileManagerController({ actions, implicitFileOperation, ...state }: UseFileManagerControllerInput): FileManagerWorkspaceProps {
  return buildFileManagerWorkspaceProps({
    ...state,
    actions: {
      addComposition: actions.addComposition,
      applyTreeSnapshot: implicitFileOperation(actions.applyTreeSnapshot),
      copyAsset: actions.copyAsset,
      copyCompositionPath: actions.copyCompositionPath,
      createComposition: implicitFileOperation(actions.createComposition),
      createCompositionFolder: implicitFileOperation(actions.createCompositionFolder),
      createProjectFile: actions.createProjectFile,
      createFolder: implicitFileOperation(actions.createFolder),
      createTimeline: implicitFileOperation(actions.createTimeline),
      deleteAsset: implicitFileOperation(actions.deleteAsset),
      deleteComposition: implicitFileOperation(actions.deleteComposition),
      deleteCompositionFolder: implicitFileOperation(actions.deleteCompositionFolder),
      deleteProjectFile: actions.deleteProjectFile,
      deleteTimeline: implicitFileOperation(actions.deleteTimeline),
      dropFiles: implicitFileOperation(actions.dropFiles),
      duplicateAsset: implicitFileOperation(actions.duplicateAsset),
      duplicateComposition: implicitFileOperation(actions.duplicateComposition),
      fileManagerStateChange: actions.fileManagerStateChange,
      moveComposition: implicitFileOperation(actions.moveComposition),
      moveTimeline: implicitFileOperation(actions.moveTimeline),
      prerenderComposition: actions.prerenderComposition,
      renameAsset: implicitFileOperation(actions.renameAsset),
      renameComposition: implicitFileOperation(actions.renameComposition),
      renameCompositionFolder: implicitFileOperation(actions.renameCompositionFolder),
      renameProjectFile: actions.renameProjectFile,
      renameTimeline: implicitFileOperation(actions.renameTimeline),
      revealAssetRoot: actions.revealAssetRoot,
      revealComposition: actions.revealComposition,
      revealCompositionFolder: actions.revealCompositionFolder,
      selectTimeline: actions.selectTimeline,
      sortAssets: implicitFileOperation(actions.sortAssets),
      reloadProject: actions.reloadProject,
      findCompositionMedia: implicitFileOperation(actions.findCompositionMedia),
      openCompositionFile: actions.openCompositionFile,
      openProjectFile: actions.openProjectFile,
    },
  });
}
