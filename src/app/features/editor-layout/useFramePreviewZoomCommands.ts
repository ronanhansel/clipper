import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { clamp, roundTwo } from "../../../core/math";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";

type Setter<T> = T | ((current: T) => T);

type FramePreviewZoomCommandsOptions = {
  centerPreviewScrollRef: { current: HTMLDivElement | null };
  framePreviewScale: number;
  frameZoomBarOpen: boolean;
  frameZoomControlRef: { current: HTMLDivElement | null };
  setFramePreviewScale: (scale: Setter<number>) => void;
  setFrameZoomBarOpen: (open: Setter<boolean>) => void;
};

function targetOverflows(viewport: HTMLDivElement, targetScale: number) {
  const style = getComputedStyle(viewport);
  const paddingX =
    parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const paddingY =
    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const targetWidth = FRAME_WIDTH * targetScale;
  const targetHeight = FRAME_HEIGHT * targetScale;

  return {
    x: targetWidth + paddingX > viewport.clientWidth,
    y: targetHeight + paddingY > viewport.clientHeight,
  };
}

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
  const pendingZoomRef = useRef<{
    targetScale: number;
    viewport: HTMLDivElement;
    display: HTMLElement;
    render: HTMLElement;
  } | null>(null);
  const pendingZoomCommitRef = useRef<number>(0);

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

  const commitPendingZoom = useCallback(() => {
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = null;
    pendingZoomCommitRef.current = 0;
    if (!pending) return;
    const { targetScale, viewport, display, render } = pending;
    if (centerPreviewScrollRef.current !== viewport) {
      display.style.width = "";
      display.style.height = "";
      render.style.transform = "";
      render.style.willChange = "";
      return;
    }
    flushSync(() => setFramePreviewScale(targetScale));
  }, [centerPreviewScrollRef, setFramePreviewScale]);

  useEffect(
    () => () => {
      if (zoomActiveSettleRef.current)
        window.clearTimeout(zoomActiveSettleRef.current);
      if (pendingZoomCommitRef.current)
        window.clearTimeout(pendingZoomCommitRef.current);
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
      if (!previousScale || clampedScale === previousScale) return;

      markFrameZoomActive();

      const display = viewport.querySelector<HTMLElement>(
        "[data-clipper-fixed-preview-display]",
      );
      if (!display)
        throw new Error("frame preview display missing for zoom anchoring");
      const render = viewport.querySelector<HTMLElement>(
        "[data-clipper-fixed-preview-render]",
      );
      if (!render)
        throw new Error("frame preview render missing for zoom anchoring");
      const renderScale = render.offsetWidth / FRAME_WIDTH;
      const viewportRect = viewport.getBoundingClientRect();
      const cursorInViewportX = clientX - viewportRect.left;
      const cursorInViewportY = clientY - viewportRect.top;
      const displayLeft = display.offsetLeft - viewport.scrollLeft;
      const displayTop = display.offsetTop - viewport.scrollTop;
      const overflows = targetOverflows(viewport, clampedScale);
      const shellOriginX = overflows.x
        ? (cursorInViewportX - displayLeft) / previousScale
        : FRAME_WIDTH / 2;
      const shellOriginY = overflows.y
        ? (cursorInViewportY - displayTop) / previousScale
        : FRAME_HEIGHT / 2;
      pendingZoomRef.current = {
        targetScale: clampedScale,
        viewport,
        display,
        render,
      };
      framePreviewScaleRef.current = clampedScale;
      display.style.width = `${FRAME_WIDTH * clampedScale}px`;
      display.style.height = `${FRAME_HEIGHT * clampedScale}px`;
      const renderDisplayScale = clampedScale / renderScale;
      render.style.transform =
        renderDisplayScale === 1
          ? ""
          : `translateZ(0) scale(${renderDisplayScale})`;
      render.style.willChange = renderDisplayScale === 1 ? "" : "transform";
      if (overflows.x) {
        viewport.scrollLeft = Math.max(
          display.offsetLeft + shellOriginX * clampedScale - cursorInViewportX,
          0,
        );
      }
      if (overflows.y) {
        viewport.scrollTop = Math.max(
          display.offsetTop + shellOriginY * clampedScale - cursorInViewportY,
          0,
        );
      }

      if (pendingZoomCommitRef.current)
        window.clearTimeout(pendingZoomCommitRef.current);
      pendingZoomCommitRef.current = window.setTimeout(commitPendingZoom, 140);
    },
    [
      centerPreviewScrollRef,
      commitPendingZoom,
      markFrameZoomActive,
      setFramePreviewScale,
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
