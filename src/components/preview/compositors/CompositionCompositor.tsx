import {
  memo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import type {
  Bounds,
  CompositionClip,
  FrameObject,
  RichTextSegment,
} from "../../../core/types";
import { DomBackend } from "../backends/DomBackend";
import { useCompositionCache } from "../cache/useCompositionCache";
import { renderCompositionPreview } from "../render/sceneRender";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type { ComposeDrawTool, ExportTileFrameBounds } from "../FramePreview";

type CompositionCompositorProps = {
  active: boolean;
  activeShapeTool?: ComposeDrawTool | null;
  animationsEnabled: boolean;
  canSelect: boolean;
  editingTextObjectId: string | null;
  exportTileFrameBounds?: ExportTileFrameBounds;
  focusPicking: boolean;
  frameScale: number;
  hideNullObjects?: boolean;
  isPlaying: boolean;
  part: CompositionClip;
  localTime: number;
  duration: number;
  renderClockSceneTime: number;
  renderMode: "preview" | "export";
  onObjectPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onTextEditCommit: (
    objectId: string,
    content: string,
    richText?: RichTextSegment[],
    bounds?: Bounds,
  ) => void;
  onTextEditEnd?: () => void;
  onTextObjectDoubleClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
};

export const CompositionCompositor = memo(function CompositionCompositor(
  props: CompositionCompositorProps,
) {
  const compositionRef = useRef<HTMLDivElement | null>(null);
  const cache = useCompositionCache();
  const compositionId = props.part.compositionId ?? props.part.id;
  cache.getCacheKey(compositionId);
  const composition = renderCompositionPreview({
    composition: props.part,
    localTime: props.localTime,
    duration: props.duration,
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    frameScale: props.frameScale,
  });
  return (
    <DomBackend
      active={props.active}
      activeShapeTool={props.activeShapeTool}
      animationsEnabled={props.animationsEnabled}
      canSelect={props.canSelect}
      duration={composition.duration}
      editingTextObjectId={props.editingTextObjectId}
      exportTileFrameBounds={props.exportTileFrameBounds}
      focusPicking={props.focusPicking}
      frameScale={props.frameScale}
      hideNullObjects={props.hideNullObjects ?? false}
      hostRef={compositionRef}
      isPlaying={props.isPlaying}
      localTime={composition.localTime}
      part={props.part}
      renderClockSceneTime={props.renderClockSceneTime}
      renderMode={props.renderMode}
      onObjectPointerDown={props.onObjectPointerDown}
      onObjectContextMenu={props.onObjectContextMenu}
      onTextEditCommit={props.onTextEditCommit}
      onTextEditEnd={props.onTextEditEnd}
      onTextObjectDoubleClick={props.onTextObjectDoubleClick}
    />
  );
});
