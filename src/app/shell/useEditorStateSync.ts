import { useEffect, type MutableRefObject } from "react";
import { defaultPreviewViewportState } from "../../core/project";
import type { EditorState, TimelineMode } from "../../core/types";

type UseEditorStateSyncParams = {
  mode: "preview" | "editor" | "interactive" | "code";
  modeRef: MutableRefObject<string>;
  timelineMode: TimelineMode;
  timelineModeRef: MutableRefObject<string>;
  hasActiveComposition: boolean;
  partFilePath: string;
  activePartFilePathRef: MutableRefObject<string>;
  leftPanelTab: "assets" | "tools";
  rightPanelTab: "motion" | "video" | "animation" | "agent";
  selectedSceneId: string | undefined;
  selectedPartId: string | undefined;
  selectedMotionMarker: { partId: string; markerId: string } | null;
  markerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  timelinePrecision: number;
  pausePlaybackOnScrub: boolean;
  framePreviewScale: number;
  frameZoomBarOpen: boolean;
  initialSourceStatus: string;
  updateEditorState: (updater: (state: EditorState) => EditorState) => void;
  setSourceStatus: (status: string) => void;
};

export function useEditorStateSync({
  mode,
  modeRef,
  timelineMode,
  timelineModeRef,
  hasActiveComposition,
  partFilePath,
  activePartFilePathRef,
  leftPanelTab,
  rightPanelTab,
  selectedSceneId,
  selectedPartId,
  selectedMotionMarker,
  markerDurationSeconds,
  timelineEndPaddingFraction,
  timelinePrecision,
  pausePlaybackOnScrub,
  framePreviewScale,
  frameZoomBarOpen,
  initialSourceStatus,
  updateEditorState,
  setSourceStatus,
}: UseEditorStateSyncParams) {
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    timelineModeRef.current = timelineMode;
  }, [timelineMode]);

  useEffect(() => {
    activePartFilePathRef.current = hasActiveComposition ? partFilePath : "";
  }, [hasActiveComposition, partFilePath]);

  useEffect(() => {
    updateEditorState((state) => ({
      ...state,
      mode,
      timelineMode,
      leftPanelTab,
      rightPanelTab,
      selectedSceneId,
      selectedPartId: selectedPartId || undefined,
      selectedMotionMarker,
      defaultNewMarkerDurationSeconds: markerDurationSeconds,
      timelineEndPaddingFraction,
      timelinePrecision,
      pausePlaybackOnScrub,
      preview: {
        ...(state.preview ?? defaultPreviewViewportState),
        scale: framePreviewScale,
        zoomBarOpen: frameZoomBarOpen,
      },
    }));
  }, [
    framePreviewScale,
    frameZoomBarOpen,
    leftPanelTab,
    markerDurationSeconds,
    mode,
    pausePlaybackOnScrub,
    rightPanelTab,
    selectedMotionMarker,
    selectedPartId,
    selectedSceneId,
    timelineEndPaddingFraction,
    timelinePrecision,
    timelineMode,
    updateEditorState,
  ]);

  useEffect(() => {
    setSourceStatus(initialSourceStatus);
  }, [initialSourceStatus]);
}
