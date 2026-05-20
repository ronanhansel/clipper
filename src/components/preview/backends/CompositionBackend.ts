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
  /**
   * When true, the backend's caller already projects the composition's
   * camera externally (e.g. via CSS3DRenderer). The backend must NOT
   * apply its own CSS camera transform — doing so double-projects and
   * makes the contents shift relative to the plane.
   */
  cameraHandledExternally?: boolean;
  /**
   * When false, the backend skips per-layer camera DoF and the
   * composition-plane backdrop blur. The backdrop div still renders
   * (just without a filter). Defaults to true when undefined.
   *
   * Used by `ComposeAuthorView`: the 3D author view shows the scene
   * via its own camera and would otherwise apply DoF twice (once on
   * the CSS subtree, once via the inspector preview).
   */
  applyCameraDof?: boolean;
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
