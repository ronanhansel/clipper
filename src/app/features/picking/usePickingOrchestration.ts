import { useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";
import type { MotionMarker, Part, Point } from "../../../core/types";
import { useSelectionEditorState } from "../../state/editorStore";

export type UpdateMotionMarkerFn = (
  partId: string,
  markerId: string,
  updater: (marker: MotionMarker, part: Part) => MotionMarker,
) => void;

export type PickingOrchestrationOptions = {
  pausePlaybackAtCurrentTimeRef: MutableRefObject<(() => void) | null>;
  updateMotionMarkerRef: MutableRefObject<UpdateMotionMarkerFn | null>;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  framePreviewScale: number;
};

export function usePickingOrchestration({
  pausePlaybackAtCurrentTimeRef,
  updateMotionMarkerRef,
  frameViewportRef,
  framePreviewScale,
}: PickingOrchestrationOptions) {
  const {
    focusPickZoomMarker,
    setFocusPickZoomMarker,
    positionPickTranslationMarker,
    setPositionPickTranslationMarker,
    framePickPreviewPoint,
    setFramePickPreviewPoint,
    setSelectedMotionMarker,
    setSelectedMotionMarkers,
    setSelectedObjectId,
    setSelectionPayload,
  } = useSelectionEditorState();

  const [trackerPickTranslationMarker, setTrackerPickTranslationMarker] =
    useState<{ partId: string; markerId: string } | null>(null);
  const [pointPickAdjustment, setPointPickAdjustment] = useState<{
    layerId: string;
    control: AdjustmentEffectPointControl;
  } | null>(null);

  const pendingMotionPickPreviewRef = useRef<Point | null>(null);
  const motionPickPreviewFrameRef = useRef(0);

  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);

  function startZoomFocusPick(partId: string, markerId: string) {
    if (
      focusPickZoomMarker?.partId === partId &&
      focusPickZoomMarker.markerId === markerId
    ) {
      setFocusPickZoomMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTimeRef.current?.();
    setFocusPickZoomMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function startTranslationPositionPick(partId: string, markerId: string) {
    if (
      positionPickTranslationMarker?.partId === partId &&
      positionPickTranslationMarker.markerId === markerId
    ) {
      setPositionPickTranslationMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTimeRef.current?.();
    setPositionPickTranslationMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function startTranslationTrackerPick(partId: string, markerId: string) {
    if (
      trackerPickTranslationMarker?.partId === partId &&
      trackerPickTranslationMarker.markerId === markerId
    ) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setFramePickPreviewPoint(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTimeRef.current?.();
    setTrackerPickTranslationMarker({ partId, markerId });
  }

  function commitTranslationTrackerPick(objectId: string) {
    const pick = trackerPickTranslationMarker;
    if (!pick) return;

    if (!objectId) {
      setTrackerPickTranslationMarker(null);
      return;
    }

    updateMotionMarkerRef.current?.(pick.partId, pick.markerId, (marker) => ({
      ...marker,
      followId: objectId || undefined,
    }));
    setTrackerPickTranslationMarker(null);
  }

  function previewMotionPickPoint(point: Point | null) {
    pendingMotionPickPreviewRef.current = point;
    if (motionPickPreviewFrameRef.current) return;
    motionPickPreviewFrameRef.current = requestAnimationFrame(() => {
      motionPickPreviewFrameRef.current = 0;
      const overlay = frameViewportRef.current?.querySelector<HTMLElement>(
        "[data-clipper-motion-pick-preview]",
      );
      const stateOverlay = frameViewportRef.current?.querySelector<HTMLElement>(
        "[data-clipper-frame-pick-point]",
      );
      if (!overlay) return;
      const nextPoint = pendingMotionPickPreviewRef.current;
      if (!nextPoint) {
        overlay.style.opacity = "0";
        if (stateOverlay) stateOverlay.style.opacity = "";
        return;
      }
      if (stateOverlay) stateOverlay.style.opacity = "0";
      overlay.style.transform = `translate3d(${nextPoint.x * framePreviewScale}px, ${nextPoint.y * framePreviewScale}px, 0)`;
      overlay.style.opacity = "1";
    });
  }

  function clearMotionPickPointPreview() {
    const finalPoint = pendingMotionPickPreviewRef.current;
    pendingMotionPickPreviewRef.current = null;
    if (motionPickPreviewFrameRef.current) {
      cancelAnimationFrame(motionPickPreviewFrameRef.current);
      motionPickPreviewFrameRef.current = 0;
    }
    if (
      (focusPickZoomMarker ||
        positionPickTranslationMarker ||
        pointPickAdjustment) &&
      finalPoint
    )
      setFramePickPreviewPoint(finalPoint);
    const overlay = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-motion-pick-preview]",
    );
    if (overlay) overlay.style.opacity = "0";
    const stateOverlay = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-frame-pick-point]",
    );
    if (stateOverlay) stateOverlay.style.opacity = "";
  }

  return {
    focusPickZoomMarker,
    setFocusPickZoomMarker,
    positionPickTranslationMarker,
    setPositionPickTranslationMarker,
    trackerPickTranslationMarker,
    setTrackerPickTranslationMarker,
    pointPickAdjustment,
    setPointPickAdjustment,
    framePickPreviewPoint,
    setFramePickPreviewPoint,
    isPickingZoomFocus,
    isPickingTranslationPosition,
    startZoomFocusPick,
    startTranslationPositionPick,
    startTranslationTrackerPick,
    commitTranslationTrackerPick,
    previewMotionPickPoint,
    clearMotionPickPointPreview,
  };
}
