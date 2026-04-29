import { useEffect } from "react";
import { clamp, roundTwo } from "../../../core/math";

type Setter<T> = T | ((current: T) => T);

type FramePreviewZoomCommandsOptions = {
  frameZoomBarOpen: boolean;
  frameZoomControlRef: { current: HTMLDivElement | null };
  setFramePreviewScale: (scale: Setter<number>) => void;
  setFrameZoomBarOpen: (open: Setter<boolean>) => void;
};

export function useFramePreviewZoomCommands({ frameZoomBarOpen, frameZoomControlRef, setFramePreviewScale, setFrameZoomBarOpen }: FramePreviewZoomCommandsOptions) {
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

  function updateFramePreviewScale(nextScale: number) {
    setFramePreviewScale(roundTwo(clamp(nextScale, 0.25, 1)));
  }

  function toggleFrameZoomBar() {
    setFrameZoomBarOpen((current) => !current);
  }

  return { toggleFrameZoomBar, updateFramePreviewScale };
}
