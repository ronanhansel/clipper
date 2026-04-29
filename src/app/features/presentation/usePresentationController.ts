import { useEffect, useRef, useState, type RefObject } from "react";
import { FRAME_WIDTH } from "../../../core/types";
import type { Mode } from "../../types";
import { clamp } from "../../../core/math";

export type PresentationMode = "frame" | "theater" | null;

type PresentationControllerOptions = {
  appRootRef: RefObject<HTMLElement | null>;
  centerPreviewScrollRef: RefObject<HTMLDivElement | null>;
  currentSceneTime: number;
  currentSceneTimeRef: RefObject<number>;
  isPlaying: boolean;
  sceneDurationSeconds: number;
  scrubToSceneTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  updateMode: (mode: Mode) => void;
};

export function usePresentationController({
  appRootRef,
  centerPreviewScrollRef,
  currentSceneTime,
  currentSceneTimeRef,
  isPlaying,
  sceneDurationSeconds,
  scrubToSceneTime,
  setIsPlaying,
  updateMode,
}: PresentationControllerOptions) {
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(null);
  const [presentationControlsVisible, setPresentationControlsVisible] = useState(false);
  const [presentationDisplayTime, setPresentationDisplayTime] = useState(currentSceneTime);
  const [presentationScale, setPresentationScale] = useState(() => window.innerWidth / FRAME_WIDTH);
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
    function updatePresentationScale() {
      const rect = centerPreviewScrollRef.current?.getBoundingClientRect();
      const width = rect?.width || window.innerWidth;
      setPresentationScale(width / FRAME_WIDTH);
    }

    updatePresentationScale();
    const resizeObserver = new ResizeObserver(updatePresentationScale);
    if (centerPreviewScrollRef.current) resizeObserver.observe(centerPreviewScrollRef.current);
    window.addEventListener("resize", updatePresentationScale);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePresentationScale);
    };
  }, [centerPreviewScrollRef, presentationMode]);

  useEffect(() => {
    function clearRendererFullscreenPresentation() {
      if (!document.fullscreenElement && presentationModeRef.current === "frame") setPresentationMode(null);
    }

    document.addEventListener("fullscreenchange", clearRendererFullscreenPresentation);
    return () => document.removeEventListener("fullscreenchange", clearRendererFullscreenPresentation);
  }, []);

  useEffect(() => {
    if (isPlaying || !presentationMode) return;
    setPresentationDisplayTime(currentSceneTime);
  }, [currentSceneTime, isPlaying, presentationMode]);

  useEffect(() => {
    if (!presentationMode || !isPlaying) return;
    let frame = 0;

    function tick() {
      setPresentationDisplayTime(currentSceneTimeRef.current);
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [currentSceneTimeRef, isPlaying, presentationMode]);

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

  async function enterFrameFullscreen() {
    updateMode("interactive");
    setPresentationMode("frame");
    showPresentationControls();
    await setElectronWindowFullscreen(true);
  }

  function enterTheaterMode() {
    updateMode("interactive");
    setPresentationMode("theater");
    showPresentationControls();
  }

  async function exitPresentationMode() {
    const mode = presentationModeRef.current;
    setPresentationMode(null);
    setPresentationControlsVisible(false);
    window.clearTimeout(presentationControlsTimeoutRef.current);
    if (mode === "frame") await setElectronWindowFullscreen(false);
  }

  function scrubPresentationTime(nextTime: number) {
    setIsPlaying(false);
    setPresentationDisplayTime(clamp(nextTime, 0, sceneDurationSeconds));
    scrubToSceneTime(nextTime);
    showPresentationControls();
  }

  return {
    enterFrameFullscreen,
    enterTheaterMode,
    exitPresentationMode,
    presentationControlsVisible,
    presentationDisplayTime,
    presentationMode,
    presentationModeRef,
    presentationScale,
    scrubPresentationTime,
    showPresentationControls,
  };
}
