export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
export const MAX_PART_DURATION_SECONDS = 60;
export const MAX_SCENE_DURATION_SECONDS = 30 * 60;

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type FrameObjectType = "rect" | "text" | "image" | "svg" | "html";

export type MotionEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "circOut";

export type RichTextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type MotionTrack = {
  delay?: number;
  duration: number;
  ease?: MotionEase;
  loop?: boolean;
  opacity?: readonly [number, number];
  rotate?: readonly [number, number];
  x?: readonly [number, number];
  y?: readonly [number, number];
};

export type FrameObject = {
  id: string;
  name: string;
  type: FrameObjectType;
  selector: string;
  bounds: Bounds;
  content?: string;
  richText?: RichTextSegment[];
  style: Record<string, string | number>;
  motion?: MotionTrack;
  layoutId?: string;
};

export type PartFrame = {
  width: typeof FRAME_WIDTH;
  height: typeof FRAME_HEIGHT;
  style: Record<string, string | number>;
};

export type BackgroundLayer = {
  id: string;
  name: string;
  style: Record<string, string | number>;
  stretchToElements?: boolean;
  motion?: MotionTrack;
  elements: FrameObject[];
};

export type PartSnapshotLine = {
  at: string;
  description: string;
};

export type ZoomMarker = {
  id: string;
  start: number;
  duration: number;
  focus: Point;
  scale: number;
  ease?: MotionEase;
  snapIn?: boolean;
  snapOut?: boolean;
  middleTransition?: "transition";
  middleEase?: MotionEase;
};

export type TranslationMarker = {
  id: string;
  start: number;
  duration: number;
  position: Point;
  ease?: MotionEase;
  snapIn?: boolean;
  snapOut?: boolean;
  middleTransition?: "transition";
  middleEase?: MotionEase;
};

export type Part = {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  frame: PartFrame;
  background: BackgroundLayer;
  objects: FrameObject[];
  snapshot: PartSnapshotLine[];
  zoomMarkers: ZoomMarker[];
  translationMarkers: TranslationMarker[];
};

export type Scene = {
  id: string;
  name: string;
  parts: Part[];
};

export type TimelineViewportState = {
  displacement: number;
  zoom: number;
};

export type TimelineMode = "edit" | "composition";

export type EditorState = {
  timeline: TimelineViewportState;
  timelineMode: TimelineMode;
};

export type AssetItem = {
  id: string;
  name: string;
  kind: "file" | "folder";
  path?: string;
  children?: AssetItem[];
};

export type ProjectManifest = {
  id: string;
  name: string;
  resolution: {
    width: typeof FRAME_WIDTH;
    height: typeof FRAME_HEIGHT;
  };
  scenes: Scene[];
  assetsPath: string;
  assets?: AssetItem[];
  editorState?: EditorState;
};

export type TimelinePart = Part & {
  start: number;
  end: number;
};

export type SelectionPayload = {
  selectionBox: Bounds;
  coordinates: [Point, Point, Point, Point];
  objects: Array<{
    id: string;
    name: string;
    selector: string;
    bounds: Bounds;
    type: FrameObjectType;
  }>;
};
