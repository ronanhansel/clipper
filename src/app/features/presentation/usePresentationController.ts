import { useEffect, useRef, useState, type RefObject } from "react";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type { Mode } from "../../types";

export type PresentationMode = "frame" | "theater" | null;

type PresentationControllerOptions = {
  appRootRef: RefObject<HTMLElement | null>;
  centerPreviewScrollRef: RefObject<HTMLDivElement | null>;
  pausePlaybackAtCurrentTime: () => void;
  scrubToSceneTime: (time: number) => void;
  updateMode: (mode: Mode) => void;
};

export function usePresentationController({
  appRootRef,
  centerPreviewScrollRef,
  pausePlaybackAtCurrentTime,
  scrubToSceneTime,
  updateMode,
}: PresentationControllerOptions) {
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(null);
  const [presentationControlsVisible, setPresentationControlsVisible] = useState(false);
  const [presentationViewport, setPresentationViewport] = useState(() => getPresentationViewport(window.innerWidth));
  const presentationModeRef = useRef<PresentationMode>(presentationMode);
  const presentationControlsTimeoutRef = useRef(0);

  useEffect(() => {
    return window.clipper?.onWindowFullscreenChange?.((fullscreen) => {
      if (!fullscreen && presentationModeRef.current === "frame") setPresentationMode(null);
    });
  }, []);

  useEffect(() => {
    presentationModeRef.current = presentationMode;
  }, [presentationMode]);

  useEffect(() => {
    function updatePresentationViewport() {
      const rect = centerPreviewScrollRef.current?.getBoundingClientRect();
      const width = rect?.width || window.visualViewport?.width || window.innerWidth;
      setPresentationViewport(getPresentationViewport(width));
    }

    updatePresentationViewport();
    const resizeObserver = new ResizeObserver(updatePresentationViewport);
    if (centerPreviewScrollRef.current) resizeObserver.observe(centerPreviewScrollRef.current);
    window.addEventListener("resize", updatePresentationViewport);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePresentationViewport);
    };
  }, [centerPreviewScrollRef, presentationMode]);

  useEffect(() => {
    function clearRendererFullscreenPresentation() {
      if (!document.fullscreenElement && presentationModeRef.current === "frame") setPresentationMode(null);
    }

    document.addEventListener("fullscreenchange", clearRendererFullscreenPresentation);
    return () => document.removeEventListener("fullscreenchange", clearRendererFullscreenPresentation);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(presentationControlsTimeoutRef.current);
  }, []);

  async function setElectronWindowFullscreen(fullscreen: boolean) {
    if (window.clipper?.setWindowFullscreen) {
      try {
        await window.clipper.setWindowFullscreen(fullscreen);
        return;
      } catch {
        // Fall back for stale Electron main processes during development.
      }
    }

    if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
    if (fullscreen && !document.fullscreenElement) await appRootRef.current?.requestFullscreen();
  }

  function showPresentationControls() {
    if (!presentationModeRef.current) return;
    setPresentationControlsVisible(true);
    window.clearTimeout(presentationControlsTimeoutRef.current);
    presentationControlsTimeoutRef.current = window.setTimeout(() => setPresentationControlsVisible(false), 2200);
  }

  async function enterPresentationMode(nextMode: "frame" | "theater") {
    window.clearTimeout(presentationControlsTimeoutRef.current);
    updateMode("preview");
    presentationModeRef.current = nextMode;
    setPresentationMode(nextMode);
    setPresentationControlsVisible(true);
    presentationControlsTimeoutRef.current = window.setTimeout(() => setPresentationControlsVisible(false), 2200);
    if (nextMode === "frame") {
      await setElectronWindowFullscreen(true);
    }
  }

  const enterFrameFullscreen = () => enterPresentationMode("frame");
  const enterTheaterMode = () => enterPresentationMode("theater");

  async function exitPresentationMode() {
    const mode = presentationModeRef.current;
    setPresentationMode(null);
    setPresentationControlsVisible(false);
    window.clearTimeout(presentationControlsTimeoutRef.current);
    if (mode === "frame") await setElectronWindowFullscreen(false);
  }

  function scrubPresentationTime(nextTime: number) {
    pausePlaybackAtCurrentTime();
    scrubToSceneTime(nextTime);
    showPresentationControls();
  }

  return {
    enterFrameFullscreen,
    enterTheaterMode,
    exitPresentationMode,
    presentationControlsVisible,
    presentationMode,
    presentationModeRef,
    presentationViewport,
    scrubPresentationTime,
    showPresentationControls,
  };
}

function getPresentationViewport(width: number) {
  const fittedWidth = Math.max(width, 1);
  const scale = fittedWidth / FRAME_WIDTH;
  return {
    width: fittedWidth,
    height: FRAME_HEIGHT * scale,
    scale,
  };
}
