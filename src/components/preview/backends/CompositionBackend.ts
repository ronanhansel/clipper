import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  ReactElement,
  RefObject,
} from "react";
import type {
  Bounds,
  AdjustmentLayer,
  CameraObjectProps,
  CompositionClip,
  FrameObject,
  RichTextSegment,
  TransitionLayer,
} from "../../../core/types";
import type { ComposeDrawTool, ExportTileFrameBounds } from "../FramePreview";
import type { PreviewFps } from "../../../core/previewFps";

export type CompositionRenderBackendProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  part: CompositionClip;
  localTime: number;
  duration: number;
  isPlaying: boolean;
  renderMode: "preview" | "export";
  animationsEnabled: boolean;
  frameScale: number;
  previewFps?: PreviewFps;
  exportTileFrameBounds?: ExportTileFrameBounds;
  hideNullObjects: boolean;
  renderClockSceneTime: number;
  active: boolean;
  adjustmentLayers?: AdjustmentLayer[];
  transitionLayers?: TransitionLayer[];
  cameraPreviewOverride?: CameraObjectProps | null;
  /**
   * When true, the backend's caller already projects the composition's
   * camera externally (e.g. via CSS3DRenderer). The backend must NOT
   * apply its own CSS camera transform — doing so double-projects and
   * makes the contents shift relative to the plane.
   */
  cameraHandledExternally?: boolean;
  isPostProcessSource?: boolean;
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
