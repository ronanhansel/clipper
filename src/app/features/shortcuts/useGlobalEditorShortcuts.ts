import { useEffect } from "react";
import type { Mode } from "../../types";
import type { TimelineMode } from "../../../core/types";

type Setter<T> = T | ((current: T) => T);
type Unsubscribe = () => void;

type UseGlobalEditorShortcutsOptions = {
  cancelActiveSelector: () => boolean;
  activeEditorTabId: string | null;
  closeEditorTab: (tabId: string) => void;
  restoreClosedEditorTab: () => boolean;
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
  pasteTimelineAttributesSilently: () => void;
  pasteTimelineNodesSilently: () => void;
  pausePlaybackAtCurrentTime: () => void;
  presentationModeRef: { current: string | false | null };
  redoProjectChange: () => void;
  selectedPartId: string;
  setFastSelectEnabled: (enabled: Setter<boolean>) => void;
  setObjectResizeMode: (mode: "resize" | "scale") => void;
  setScrubSnapEnabled: (enabled: Setter<boolean>) => void;
  showPresentationControls: () => void;
  stepSceneTime: (direction: -1 | 1) => void;
  togglePlayback: () => void;
  timelineMode: TimelineMode;
  undoProjectChange: () => void;
  updateMode: (mode: Mode) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
};

export function isEditorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".monaco-editor"));
}

export const isCodeEditorTarget = isEditorTarget;

export function isTextEditingTarget(target: HTMLElement | null) {
  const editable = target?.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], .monaco-editor, .cm-editor",
  ) as HTMLElement | null;
  if (!editable) return false;
  return !(editable instanceof HTMLInputElement && editable.type === "range");
}

function isTextEditingEvent(event: KeyboardEvent) {
  return (
    isTextEditingTarget(event.target as HTMLElement | null) ||
    isTextEditingTarget(document.activeElement as HTMLElement | null)
  );
}

export function subscribeHostShortcut<Args extends unknown[]>(
  handler: unknown,
  callback: (...args: Args) => void,
) {
  if (typeof handler !== "function") return undefined;
  const unsubscribe = (
    handler as (callback: (...args: Args) => void) => unknown
  )(callback);
  return typeof unsubscribe === "function"
    ? (unsubscribe as Unsubscribe)
    : undefined;
}

export function useGlobalEditorShortcuts({
  cancelActiveSelector,
  activeEditorTabId,
  closeEditorTab,
  restoreClosedEditorTab,
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
  pasteTimelineAttributesSilently,
  pasteTimelineNodesSilently,
  pausePlaybackAtCurrentTime,
  presentationModeRef,
  redoProjectChange,
  selectedPartId,
  setFastSelectEnabled,
  setObjectResizeMode,
  setScrubSnapEnabled,
  showPresentationControls,
  stepSceneTime,
  togglePlayback,
  timelineMode,
  undoProjectChange,
  updateMode,
  updateTimelineMode,
}: UseGlobalEditorShortcutsOptions) {
  useEffect(() => {
    function closeActiveEditorTab() {
      if (!activeEditorTabId) return false;
      closeEditorTab(activeEditorTabId);
      return true;
    }

    function switchModeShortcut(key: "1" | "2" | "3" | "4") {
      if (key === "1") updateMode("preview");
      if (key === "2") updateMode("editor");
      if (key === "3") updateTimelineMode("compose");
      if (key === "4") updateTimelineMode("composition");
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const textEditingTarget = isTextEditingEvent(event);
      if (textEditingTarget) return;

      if (event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey)) {
        if (closeActiveEditorTab()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (event.key.toLowerCase() === "t" && (event.ctrlKey || event.metaKey)) {
        if (restoreClosedEditorTab()) {
          event.preventDefault();
          event.stopPropagation();
        }
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

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        presentationModeRef.current
      ) {
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

      if (isCodeEditorTarget(target)) return;

      if (event.key === "Escape" && cancelActiveSelector()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

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
      const timelineShortcutsEnabled = timelineMode !== "compose";

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
        if (!timelineShortcutsEnabled) return;
        if (copySelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        if (!timelineShortcutsEnabled) return;
        if (cutSelectedTimelineNodes()) event.preventDefault();
        else if (selectedPartId) event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (!timelineShortcutsEnabled) return;
        event.preventDefault();
        if (event.altKey) {
          pasteTimelineAttributesSilently();
          return;
        }
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
        pausePlaybackAtCurrentTime();
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

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setObjectResizeMode("scale");
        return;
      }

      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setObjectResizeMode("resize");
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (
        timelineShortcutsEnabled &&
        isDeleteKey &&
        deleteSelectedTimelineNodes()
      ) {
        event.preventDefault();
        return;
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") marqueeSpacePanningRef.current = false;
    }

    const unsubscribeModeShortcut = subscribeHostShortcut(
      window.clipper?.onModeShortcut,
      switchModeShortcut,
    );
    const unsubscribeCloseEditorTabShortcut = subscribeHostShortcut(
      window.clipper?.onCloseEditorTabShortcut,
      () => {
        closeActiveEditorTab();
      },
    );
    const unsubscribeRestoreEditorTabShortcut = subscribeHostShortcut(
      window.clipper?.onRestoreEditorTabShortcut,
      () => {
        restoreClosedEditorTab();
      },
    );
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      unsubscribeModeShortcut?.();
      unsubscribeCloseEditorTabShortcut?.();
      unsubscribeRestoreEditorTabShortcut?.();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    activeEditorTabId,
    cancelActiveSelector,
    closeEditorTab,
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
    pasteTimelineAttributesSilently,
    pasteTimelineNodesSilently,
    pausePlaybackAtCurrentTime,
    presentationModeRef,
    redoProjectChange,
    restoreClosedEditorTab,
    selectedPartId,
    setFastSelectEnabled,
    setObjectResizeMode,
    setScrubSnapEnabled,
    showPresentationControls,
    stepSceneTime,
    timelineMode,
    togglePlayback,
    undoProjectChange,
    updateMode,
    updateTimelineMode,
  ]);
}
