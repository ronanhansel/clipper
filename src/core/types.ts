export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
export const MAX_PART_DURATION_SECONDS = 10;
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
  scale: 1.25 | 1.5 | 1.8 | 2.2 | 3.5 | 5;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type TranslationMarker = {
  id: string;
  start: number;
  duration: number;
  position: Point;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type Part = {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  kind: "frame" | "blank";
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

export type EditorState = {
  timeline: TimelineViewportState;
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
