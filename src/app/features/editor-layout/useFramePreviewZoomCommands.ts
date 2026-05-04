import { useCallback, useEffect, useRef } from "react";
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

export function useFramePreviewZoomCommands({ centerPreviewScrollRef, framePreviewScale, frameZoomBarOpen, frameZoomControlRef, setFramePreviewScale, setFrameZoomBarOpen }: FramePreviewZoomCommandsOptions) {
  const framePreviewScaleRef = useRef(framePreviewScale);
  const wheelZoomFrameRef = useRef(0);
  const pendingWheelZoomRef = useRef<{ anchorX: number; anchorY: number; clientX: number; clientY: number; contentX: number; contentY: number; previousScale: number; scale: number; viewport: HTMLDivElement } | null>(null);

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
    return () => document.removeEventListener("pointerdown", dismissFrameZoomBar, true);
  }, [frameZoomBarOpen, frameZoomControlRef, setFrameZoomBarOpen]);

  useEffect(() => () => {
    if (wheelZoomFrameRef.current) cancelAnimationFrame(wheelZoomFrameRef.current);
  }, []);

  const updateFramePreviewScale = useCallback((nextScale: number) => {
    const clampedScale = roundTwo(clamp(nextScale, 0.25, 1));
    framePreviewScaleRef.current = clampedScale;
    setFramePreviewScale(clampedScale);
  }, [setFramePreviewScale]);

  const zoomFramePreviewAtPoint = useCallback((scaleMultiplier: number, clientX: number, clientY: number) => {
    const viewport = centerPreviewScrollRef.current;
    const pendingWheelZoom = pendingWheelZoomRef.current?.viewport === viewport ? pendingWheelZoomRef.current : null;
    const previousScale = pendingWheelZoom?.previousScale ?? framePreviewScaleRef.current;
    const clampedScale = clamp(framePreviewScaleRef.current * scaleMultiplier, 0.25, 1);
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

    framePreviewScaleRef.current = clampedScale;
    pendingWheelZoomRef.current = { anchorX, anchorY, clientX, clientY, contentX, contentY, previousScale, scale: clampedScale, viewport };
    if (wheelZoomFrameRef.current) return;

    wheelZoomFrameRef.current = requestAnimationFrame(() => {
      wheelZoomFrameRef.current = 0;
      const pending = pendingWheelZoomRef.current;
      pendingWheelZoomRef.current = null;
      if (!pending) return;
      const latestViewport = centerPreviewScrollRef.current;
      if (latestViewport !== pending.viewport) return;
      const ratio = pending.scale / pending.previousScale;
      setFramePreviewScale(pending.scale);
      requestAnimationFrame(() => {
        const currentViewport = centerPreviewScrollRef.current;
        if (currentViewport !== pending.viewport) return;
        currentViewport.scrollLeft = Math.max(pending.contentX * ratio - pending.anchorX, 0);
        currentViewport.scrollTop = Math.max(pending.contentY * ratio - pending.anchorY, 0);
      });
    });
  }, [centerPreviewScrollRef, setFramePreviewScale]);

  const toggleFrameZoomBar = useCallback(() => {
    setFrameZoomBarOpen((current) => !current);
  }, [setFrameZoomBarOpen]);

  return { toggleFrameZoomBar, updateFramePreviewScale, zoomFramePreviewAtPoint };
}
