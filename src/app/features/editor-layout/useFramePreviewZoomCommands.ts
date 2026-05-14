import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { clamp, roundTwo } from "../../../core/math";

type Setter<T> = T | ((current: T) => T);

type FramePreviewZoomCommandsOptions = {
  centerPreviewScrollRef: { current: HTMLDivElement | null };
  framePreviewScale: number;
  frameZoomBarOpen: boolean;
  frameZoomControlRef: { current: HTMLDivElement | null };
  setFramePreviewScale: (scale: Setter<number>) => void;
  setFrameZoomBarOpen: (open: Setter<boolean>) => void;
};

export function useFramePreviewZoomCommands({
  centerPreviewScrollRef,
  framePreviewScale,
  frameZoomBarOpen,
  frameZoomControlRef,
  setFramePreviewScale,
  setFrameZoomBarOpen,
}: FramePreviewZoomCommandsOptions) {
  const framePreviewScaleRef = useRef(framePreviewScale);
  const wheelZoomFrameRef = useRef(0);
  const pendingWheelZoomRef = useRef<{
    anchorX: number;
    anchorY: number;
    clientX: number;
    clientY: number;
    contentX: number;
    contentY: number;
    previousScale: number;
    scale: number;
    viewport: HTMLDivElement;
  } | null>(null);

  useEffect(() => {
    framePreviewScaleRef.current = framePreviewScale;
  }, [framePreviewScale]);

  useEffect(() => {
    if (!frameZoomBarOpen) return;
    function dismissFrameZoomBar(event: globalThis.PointerEvent) {
      const control = frameZoomControlRef.current;
      if (control?.contains(event.target as Node)) return;
      setFrameZoomBarOpen(false);
    }

    document.addEventListener("pointerdown", dismissFrameZoomBar, true);
    return () =>
      document.removeEventListener("pointerdown", dismissFrameZoomBar, true);
  }, [frameZoomBarOpen, frameZoomControlRef, setFrameZoomBarOpen]);

  useEffect(
    () => () => {
      if (wheelZoomFrameRef.current)
        cancelAnimationFrame(wheelZoomFrameRef.current);
    },
    [],
  );

  const updateFramePreviewScale = useCallback(
    (nextScale: number) => {
      const clampedScale = roundTwo(clamp(nextScale, 0.25, 5));
      framePreviewScaleRef.current = clampedScale;
      setFramePreviewScale(clampedScale);
    },
    [setFramePreviewScale],
  );

  const zoomFramePreviewAtPoint = useCallback(
    (scaleMultiplier: number, clientX: number, clientY: number) => {
      const viewport = centerPreviewScrollRef.current;
      const previousScale = framePreviewScaleRef.current;
      const clampedScale = clamp(previousScale * scaleMultiplier, 0.25, 5);
      if (!viewport) {
        framePreviewScaleRef.current = clampedScale;
        setFramePreviewScale(clampedScale);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const anchorX = clientX - rect.left;
      const anchorY = clientY - rect.top;
      if (!previousScale || clampedScale === previousScale) {
        updateFramePreviewScale(clampedScale);
        return;
      }

      const contentX = viewport.scrollLeft + anchorX;
      const contentY = viewport.scrollTop + anchorY;
      const ratio = clampedScale / previousScale;

      framePreviewScaleRef.current = clampedScale;
      flushSync(() => setFramePreviewScale(clampedScale));
      viewport.scrollLeft = Math.max(contentX * ratio - anchorX, 0);
      viewport.scrollTop = Math.max(contentY * ratio - anchorY, 0);
      pendingWheelZoomRef.current = {
        anchorX,
        anchorY,
        clientX,
        clientY,
        contentX,
        contentY,
        previousScale,
        scale: clampedScale,
        viewport,
      };
      if (wheelZoomFrameRef.current) return;

      wheelZoomFrameRef.current = requestAnimationFrame(() => {
        wheelZoomFrameRef.current = 0;
        const pending = pendingWheelZoomRef.current;
        pendingWheelZoomRef.current = null;
        if (!pending) return;
        const latestViewport = centerPreviewScrollRef.current;
        if (latestViewport !== pending.viewport) return;
        flushSync(() => setFramePreviewScale(pending.scale));
        const ratio = pending.scale / pending.previousScale;
        latestViewport.scrollLeft = Math.max(
          pending.contentX * ratio - pending.anchorX,
          0,
        );
        latestViewport.scrollTop = Math.max(
          pending.contentY * ratio - pending.anchorY,
          0,
        );
      });
    },
    [centerPreviewScrollRef, setFramePreviewScale],
  );

  const toggleFrameZoomBar = useCallback(() => {
    setFrameZoomBarOpen((current) => !current);
  }, [setFrameZoomBarOpen]);

  return {
    toggleFrameZoomBar,
    updateFramePreviewScale,
    zoomFramePreviewAtPoint,
  };
}
