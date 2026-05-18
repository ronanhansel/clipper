import { useMemo, type CSSProperties } from "react";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../core/types";
import type { EditorLayoutState } from "../../core/types";

type PresentationViewport = {
  width: number;
  height: number;
  scale: number;
};

export type UseEditorShellStylesParams = {
  editorLayout: EditorLayoutState;
  presentationViewport: PresentationViewport;
  displayFramePreviewScale: number;
};

export function useEditorShellStyles({
  editorLayout,
  presentationViewport,
  displayFramePreviewScale,
}: UseEditorShellStylesParams) {
  const appShellStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--clipper-left-panel-width": `${editorLayout.leftPanelWidth}px`,
        "--clipper-right-panel-width": `${editorLayout.rightPanelWidth}px`,
        "--clipper-timeline-height": `${editorLayout.timelineHeight}px`,
        "--clipper-presentation-width": `${presentationViewport.width}px`,
        "--clipper-presentation-height": `${presentationViewport.height}px`,
        "--clipper-presentation-scale": presentationViewport.scale,
        gridTemplateRows: `48px minmax(0, 1fr) var(--clipper-timeline-height)`,
      }) as CSSProperties,
    [
      editorLayout.leftPanelWidth,
      editorLayout.rightPanelWidth,
      editorLayout.timelineHeight,
      presentationViewport.width,
      presentationViewport.height,
      presentationViewport.scale,
    ],
  );

  const editorShellStyle = useMemo<CSSProperties>(
    () =>
      ({
        gridTemplateColumns:
          "var(--clipper-left-panel-width) minmax(640px, 1fr) var(--clipper-right-panel-width)",
      }) as CSSProperties,
    [],
  );

  const blankFrameViewportStyle = useMemo<CSSProperties>(
    () => ({
      width: FRAME_WIDTH * displayFramePreviewScale,
      height: FRAME_HEIGHT * displayFramePreviewScale,
    }),
    [displayFramePreviewScale],
  );

  return { appShellStyle, editorShellStyle, blankFrameViewportStyle };
}
