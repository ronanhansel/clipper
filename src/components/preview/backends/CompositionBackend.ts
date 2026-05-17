import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  ReactElement,
  RefObject,
} from "react";
import type {
  Bounds,
  CompositionClip,
  FrameObject,
  RichTextSegment,
} from "../../../core/types";
import type { ComposeDrawTool, ExportTileFrameBounds } from "../FramePreview";

export type CompositionRenderBackendProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  part: CompositionClip;
  localTime: number;
  duration: number;
  isPlaying: boolean;
  renderMode: "preview" | "export";
  animationsEnabled: boolean;
  frameScale: number;
  exportTileFrameBounds?: ExportTileFrameBounds;
  hideNullObjects: boolean;
  renderClockSceneTime: number;
  active: boolean;
};

export type CompositionInteractionBackendProps = {
  canSelect: boolean;
  focusPicking: boolean;
  editingTextObjectId: string | null;
  activeShapeTool?: ComposeDrawTool | null;
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

export type CompositionBackendProps = CompositionRenderBackendProps &
  CompositionInteractionBackendProps;

export type CompositionBackend = (
  props: CompositionBackendProps,
) => ReactElement | null;
