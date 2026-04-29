import { useEffect } from "react";
import type { Mode } from "../../types";
import type { TimelineMode } from "../../../core/types";

type Setter<T> = T | ((current: T) => T);

type UseGlobalEditorShortcutsOptions = {
  cancelActiveSelector: () => boolean;
  copySelectedTimelineNodes: () => boolean;
  cutSelectedTimelineNodes: () => boolean;
  deleteSelectedTimelineNodes: () => boolean;
  enterFrameFullscreen: () => Promise<void> | void;
  enterTheaterMode: () => void;
  exitPresentationMode: () => Promise<void> | void;
  jumpToEnd: () => void;
  jumpToNextPart: () => void;
  jumpToStart: () => void;
  marqueeDraggingRef: { current: boolean };
  marqueeSpacePanningRef: { current: boolean };
  pasteTimelineNodesSilently: () => void;
  presentationModeRef: { current: string | false | null };
  redoProjectChange: () => void;
  saveAllChangesRef: { current: (() => Promise<void> | void) | null | undefined };
  selectedPartId: string;
  setFastSelectEnabled: (enabled: Setter<boolean>) => void;
  setIsPlaying: (playing: Setter<boolean>) => void;
  setScrubSnapEnabled: (enabled: Setter<boolean>) => void;
  showPresentationControls: () => void;
  stepSceneTime: (direction: -1 | 1) => void;
  togglePlayback: () => void;
  undoProjectChange: () => void;
  updateMode: (mode: Mode) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
};

export function isCodeEditorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".monaco-editor"));
}

export function isTextEditingTarget(target: HTMLElement | null) {
  const editable = target?.closest("input, textarea, select, [contenteditable='true']") as HTMLElement | null;
  if (!editable) return false;
  return !(editable instanceof HTMLInputElement && editable.type === "range");
}

export function useGlobalEditorShortcuts({
  cancelActiveSelector,
  copySelectedTimelineNodes,
  cutSelectedTimelineNodes,
  deleteSelectedTimelineNodes,
  enterFrameFullscreen,
  enterTheaterMode,
  exitPresentationMode,
  jumpToEnd,
  jumpToNextPart,
  jumpToStart,
  marqueeDraggingRef,
  marqueeSpacePanningRef,
  pasteTimelineNodesSilently,
  presentationModeRef,
  redoProjectChange,
  saveAllChangesRef,
  selectedPartId,
  setFastSelectEnabled,
  setIsPlaying,
  setScrubSnapEnabled,
  showPresentationControls,
  stepSceneTime,
  togglePlayback,
  undoProjectChange,
  updateMode,
  updateTimelineMode,
}: UseGlobalEditorShortcutsOptions) {
  useEffect(() => {
    function switchModeShortcut(key: "1" | "2" | "3" | "4") {
      if (key === "1") updateMode("interactive");
      if (key === "2") updateMode("code");
      if (key === "3") updateTimelineMode("compose");
      if (key === "4") updateTimelineMode("composition");
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveAllChangesRef.current?.();
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key === "1") {
          event.preventDefault();
          switchModeShortcut("1");
          return;
        }

        if (event.key === "2") {
          event.preventDefault();
          switchModeShortcut("2");
          return;
        }

        if (event.key === "3") {
          event.preventDefault();
          switchModeShortcut("3");
          return;
        }

        if (event.key === "4") {
          event.preventDefault();
          switchModeShortcut("4");
          return;
        }
      }

      const target = event.target as HTMLElement | null;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && presentationModeRef.current) {
        const key = event.key.toLowerCase();
        if (key === "escape" || key === "f" || key === "t") {
          event.preventDefault();
          void exitPresentationMode();
          return;
        }

        if (event.code === "Space") {
          event.preventDefault();
          togglePlayback();
          showPresentationControls();
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          stepSceneTime(-1);
          showPresentationControls();
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          stepSceneTime(1);
          showPresentationControls();
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          jumpToStart();
          showPresentationControls();
          return;
        }

        if (event.key === "End") {
          event.preventDefault();
          jumpToEnd();
          showPresentationControls();
          return;
        }
      }

      if (event.key === "Escape" && cancelActiveSelector()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isCodeEditorTarget(target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProjectChange();
        else undoProjectChange();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProjectChange();
        return;
      }

      const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
      if (isTextEditingTarget(target)) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          void enterFrameFullscreen();
          return;
        }

        if (event.key.toLowerCase() === "t") {
          event.preventDefault();
          enterTheaterMode();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (copySelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        if (cutSelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteTimelineNodesSilently();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (marqueeDraggingRef.current) {
          marqueeSpacePanningRef.current = true;
          return;
        }
        togglePlayback();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpToEnd();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepSceneTime(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpToNextPart();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setIsPlaying(false);
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setScrubSnapEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setFastSelectEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (isDeleteKey && deleteSelectedTimelineNodes()) {
        event.preventDefault();
        return;
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") marqueeSpacePanningRef.current = false;
    }

    const unsubscribeModeShortcut = window.clipper?.onModeShortcut(switchModeShortcut);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      unsubscribeModeShortcut?.();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [cancelActiveSelector, copySelectedTimelineNodes, cutSelectedTimelineNodes, deleteSelectedTimelineNodes, enterFrameFullscreen, enterTheaterMode, exitPresentationMode, jumpToEnd, jumpToNextPart, jumpToStart, marqueeDraggingRef, marqueeSpacePanningRef, pasteTimelineNodesSilently, presentationModeRef, redoProjectChange, saveAllChangesRef, selectedPartId, setFastSelectEnabled, setIsPlaying, setScrubSnapEnabled, showPresentationControls, stepSceneTime, togglePlayback, undoProjectChange, updateMode, updateTimelineMode]);
}
