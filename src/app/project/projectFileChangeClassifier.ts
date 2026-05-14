export type ProjectSnapshotPair = {
  project: string;
  compositionSources: string;
};
export type ProjectDiskSnapshotBundle = {
  full: ProjectSnapshotPair;
  fileContent: ProjectSnapshotPair;
  projectMetadata?: ProjectSnapshotPair;
};
export type ProjectFileChangeDecision =
  | "ignore"
  | "mark-saved"
  | "mark-file-content-saved"
  | "reload"
  | "conflict";
export type ProjectAutosaveWriteDecision =
  | "write"
  | "mark-saved"
  | "mark-file-content-saved-and-write"
  | "conflict";

function snapshotsEqual(left: ProjectSnapshotPair, right: ProjectSnapshotPair) {
  return (
    left.project === right.project &&
    left.compositionSources === right.compositionSources
  );
}

export function classifyProjectFileChange({
  currentFileContentSnapshots,
  currentSnapshots,
  diskSnapshots,
  hasUnsavedAppChanges,
  savedFileContentSnapshots,
}: {
  currentFileContentSnapshots: ProjectSnapshotPair;
  currentSnapshots: ProjectSnapshotPair;
  diskSnapshots: ProjectDiskSnapshotBundle;
  hasUnsavedAppChanges: boolean;
  savedFileContentSnapshots: ProjectSnapshotPair;
}): ProjectFileChangeDecision {
  if (snapshotsEqual(diskSnapshots.fileContent, savedFileContentSnapshots))
    return "ignore";
  if (snapshotsEqual(diskSnapshots.full, currentSnapshots)) return "mark-saved";
  if (snapshotsEqual(diskSnapshots.fileContent, currentFileContentSnapshots))
    return "mark-file-content-saved";
  if (hasUnsavedAppChanges) return "conflict";
  return "reload";
}

export function classifyProjectAutosaveWrite({
  diskSnapshots,
  savedMetadataSnapshots,
  savedFileContentSnapshots,
  targetMetadataSnapshots,
  targetFileContentSnapshots,
  targetSnapshots,
}: {
  diskSnapshots: ProjectDiskSnapshotBundle;
  savedMetadataSnapshots?: ProjectSnapshotPair;
  savedFileContentSnapshots: ProjectSnapshotPair;
  targetMetadataSnapshots?: ProjectSnapshotPair;
  targetFileContentSnapshots: ProjectSnapshotPair;
  targetSnapshots: ProjectSnapshotPair;
}): ProjectAutosaveWriteDecision {
  if (snapshotsEqual(diskSnapshots.full, targetSnapshots)) return "mark-saved";
  if (snapshotsEqual(diskSnapshots.fileContent, targetFileContentSnapshots))
    return "mark-file-content-saved-and-write";
  if (
    diskSnapshots.projectMetadata &&
    savedMetadataSnapshots &&
    targetMetadataSnapshots &&
    !snapshotsEqual(diskSnapshots.projectMetadata, savedMetadataSnapshots) &&
    !snapshotsEqual(diskSnapshots.projectMetadata, targetMetadataSnapshots)
  )
    return "conflict";
  if (snapshotsEqual(diskSnapshots.fileContent, savedFileContentSnapshots))
    return "write";
  return "write";
}
