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
  const zoomActiveSettleRef = useRef<number>(0);
  const zoomActiveStateRef = useRef(false);

  useEffect(() => {
    framePreviewScaleRef.current = framePreviewScale;
  }, [framePreviewScale]);

  const markFrameZoomActive = useCallback(() => {
    if (!zoomActiveStateRef.current) {
      zoomActiveStateRef.current = true;
      window.dispatchEvent(
        new CustomEvent("clipper:frame-zoom-active", {
          detail: { active: true },
        }),
      );
    }
    if (zoomActiveSettleRef.current)
      window.clearTimeout(zoomActiveSettleRef.current);
    zoomActiveSettleRef.current = window.setTimeout(() => {
      zoomActiveSettleRef.current = 0;
      zoomActiveStateRef.current = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("clipper:frame-zoom-active", {
              detail: { active: false },
            }),
          );
        });
      });
    }, 160);
  }, []);

  useEffect(
    () => () => {
      if (zoomActiveSettleRef.current)
        window.clearTimeout(zoomActiveSettleRef.current);
    },
    [],
  );

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

  const updateFramePreviewScale = useCallback(
    (nextScale: number) => {
      const clampedScale = roundTwo(clamp(nextScale, 0.25, 5));
      framePreviewScaleRef.current = clampedScale;
      markFrameZoomActive();
      setFramePreviewScale(clampedScale);
    },
    [markFrameZoomActive, setFramePreviewScale],
  );

  const zoomFramePreviewAtPoint = useCallback(
    (scaleMultiplier: number, clientX: number, clientY: number) => {
      const viewport = centerPreviewScrollRef.current;
      const previousScale = framePreviewScaleRef.current;
      const clampedScale = clamp(previousScale * scaleMultiplier, 0.25, 5);
      if (!viewport) {
        framePreviewScaleRef.current = clampedScale;
        markFrameZoomActive();
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
      markFrameZoomActive();
      flushSync(() => setFramePreviewScale(clampedScale));
      viewport.scrollLeft = Math.max(contentX * ratio - anchorX, 0);
      viewport.scrollTop = Math.max(contentY * ratio - anchorY, 0);
    },
    [
      centerPreviewScrollRef,
      markFrameZoomActive,
      setFramePreviewScale,
      updateFramePreviewScale,
    ],
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
