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
    function handleWheel(event: globalThis.WheelEvent) {
      // Skip frame-zoom when the wheel originates inside the compose 3D
      // author view — OrbitControls owns the wheel there for camera dolly.
      const target = event.target as Element | null;
      if (target?.closest?.("[data-clipper-compose-author-view]")) return;
      zoomFramePreviewFromWheel(event);
    }
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [centerPreviewScrollRef, mode, zoomFramePreviewFromWheel]);
}
