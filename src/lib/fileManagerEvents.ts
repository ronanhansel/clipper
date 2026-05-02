export const fileManagerFindMediaEvent = "clipper:file-manager-find-media";

export type FileManagerFindMediaDetail = {
  compositionId: string;
  fileName: string;
};

let pendingFileManagerFindMedia: FileManagerFindMediaDetail | null = null;

export function requestFileManagerFindMedia(detail: FileManagerFindMediaDetail) {
  pendingFileManagerFindMedia = detail;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<FileManagerFindMediaDetail>(fileManagerFindMediaEvent, { detail }));
  }, 0);
}

export function consumePendingFileManagerFindMedia() {
  const detail = pendingFileManagerFindMedia;
  pendingFileManagerFindMedia = null;
  return detail;
}
