export const binFindMediaEvent = "clipper:bin-find-media";

export type BinFindMediaDetail = {
  compositionId: string;
  fileName: string;
};

let pendingBinFindMedia: BinFindMediaDetail | null = null;

export function requestBinFindMedia(detail: BinFindMediaDetail) {
  pendingBinFindMedia = detail;
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<BinFindMediaDetail>(binFindMediaEvent, {
        detail,
      }),
    );
  }, 0);
}

export function consumePendingBinFindMedia() {
  const detail = pendingBinFindMedia;
  pendingBinFindMedia = null;
  return detail;
}
