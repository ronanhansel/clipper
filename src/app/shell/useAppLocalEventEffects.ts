import { useEffect, type RefObject } from "react";
import {
  consumePendingBinFindMedia,
  binFindMediaEvent,
  type BinFindMediaDetail,
} from "../../lib/binEvents";

type UseAppLocalEventEffectsParams = {
  centerPreviewScrollRef: RefObject<HTMLDivElement | null>;
  mode: "preview" | "editor" | "interactive" | "code";
  setFindMediaRequest: (request: BinFindMediaDetail | null) => void;
  zoomFramePreviewFromWheel: (event: globalThis.WheelEvent) => void;
};

export function useAppLocalEventEffects({
  centerPreviewScrollRef,
  mode,
  setFindMediaRequest,
  zoomFramePreviewFromWheel,
}: UseAppLocalEventEffectsParams) {
  useEffect(() => {
    function openFindMediaDialog(event: Event) {
      const detail = (event as CustomEvent<BinFindMediaDetail>).detail;
      if (!detail?.compositionId || !detail.fileName) return;
      setFindMediaRequest(detail);
    }

    window.addEventListener(binFindMediaEvent, openFindMediaDialog);
    const pending = consumePendingBinFindMedia();
    if (pending) setFindMediaRequest(pending);
    return () =>
      window.removeEventListener(binFindMediaEvent, openFindMediaDialog);
  }, [setFindMediaRequest]);

  useEffect(() => {
    const stage = centerPreviewScrollRef.current;
    if (!stage || mode !== "preview") return;
    stage.addEventListener("wheel", zoomFramePreviewFromWheel, {
      passive: false,
    });
    return () => stage.removeEventListener("wheel", zoomFramePreviewFromWheel);
  }, [centerPreviewScrollRef, mode, zoomFramePreviewFromWheel]);
}
