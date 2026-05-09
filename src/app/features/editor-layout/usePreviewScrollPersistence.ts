import { useEffect, useRef, useCallback } from "react";
import { defaultPreviewViewportState } from "../../../core/project";
import type { EditorState } from "../../../core/types";

type UpdateEditorState = (updater: (state: EditorState) => EditorState) => void;

type PreviewScrollPersistenceOptions = {
  centerPreviewScrollRef: { current: HTMLDivElement | null };
  updateEditorState: UpdateEditorState;
};

export function usePreviewScrollPersistence({
  centerPreviewScrollRef,
  updateEditorState,
}: PreviewScrollPersistenceOptions) {
  const scrollFrameRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const updateEditorStateRef = useRef(updateEditorState);
  updateEditorStateRef.current = updateEditorState;

  // Commit pending scroll position to editorState, guarded against no-op writes.
  const flushPending = useCallback(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    pendingScrollRef.current = null;
    updateEditorStateRef.current((state) => {
      const currentLeft = state.preview?.scrollLeft ?? 0;
      const currentTop = state.preview?.scrollTop ?? 0;
      if (currentLeft === pending.left && currentTop === pending.top) {
        return state; // dedupe: no change, avoid triggering persistence debounce
      }
      return {
        ...state,
        preview: {
          ...(state.preview ?? defaultPreviewViewportState),
          scrollLeft: pending.left,
          scrollTop: pending.top,
        },
      };
    });
  }, []);

  // Reset the idle debounce timer; after 500ms of no scroll, commit.
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      flushPending();
    }, 500);
  }, [flushPending]);

  const saveCenterPreviewScroll = useCallback(() => {
    const viewport = centerPreviewScrollRef.current;
    if (!viewport) return;

    // Sample latest scroll position synchronously so cleanups always have a value.
    pendingScrollRef.current = {
      left: Math.max(Math.round(viewport.scrollLeft), 0),
      top: Math.max(Math.round(viewport.scrollTop), 0),
    };

    // Gate: only schedule one rAF per frame to batch timeout resets.
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      // Re-sample at end of frame for the most accurate position.
      const vp = centerPreviewScrollRef.current;
      if (vp) {
        pendingScrollRef.current = {
          left: Math.max(Math.round(vp.scrollLeft), 0),
          top: Math.max(Math.round(vp.scrollTop), 0),
        };
      }
      resetIdleTimer();
    });
  }, [centerPreviewScrollRef, resetIdleTimer]);

  // Cleanup on unmount: cancel pending frame + timer, flush any pending scroll.
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = 0;
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      flushPending();
    };
  }, [flushPending]);

  return { saveCenterPreviewScroll };
}
